import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { CactusLM, CactusSTT } from 'cactus-react-native';
import VoiceToText, { VoiceToTextEvents, addEventListener, removeAllListeners, setRecognitionLanguage } from '@appcitor/react-native-voice-to-text';
import type { TriageResult } from '../types/triage';
import { runAgent } from '../agent/AgentEngine';
import { NitroModules } from 'react-native-nitro-modules';
import { PRESCRIPTION_EXTRACTION_PROMPT, parseOCRResponse, savePrescriptionMedications } from '../services/PrescriptionOCR';
import { runProactiveChecks } from '../services/ProactiveHealth';
import { database, Vital, Reminder } from '../db';

// Base64 decode helper
declare const global: { atob: (s: string) => string };
function base64ToFloat32(base64Chunks: string[]): number[] {
  const combined = base64Chunks.join('');
  // React Native has global.atob available
  const binaryString = global.atob(combined);
  const samples: number[] = [];
  for (let i = 0; i < binaryString.length - 1; i += 2) {
    const int16 = binaryString.charCodeAt(i) | (binaryString.charCodeAt(i + 1) << 8);
    const signed = int16 > 32767 ? int16 - 65536 : int16;
    samples.push(signed / 32768.0);
  }
  return samples;
}

const CactusFileSystem = {
  async modelExists(model: string): Promise<boolean> {
    const fs = NitroModules.createHybridObject<any>('CactusFileSystem');
    return fs.modelExists(model);
  },
  async getModelPath(model: string): Promise<string> {
    const fs = NitroModules.createHybridObject<any>('CactusFileSystem');
    return fs.getModelPath(model);
  },
  async downloadModel(model: string, url: string, onProgress?: (p: number) => void): Promise<void> {
    const fs = NitroModules.createHybridObject<any>('CactusFileSystem');
    return fs.downloadModel(model, url, onProgress);
  },
};

type AgentState = 'idle' | 'downloading' | 'initializing' | 'ready' | 'listening' | 'thinking' | 'calling_tool' | 'responding' | 'error';

interface CactusContextValue {
  agentState: AgentState;
  downloadProgress: number;
  error: string | null;
  lastResult: TriageResult | null;
  completion: string;
  transcription: string;
  isListening: boolean;
  initialize: () => Promise<void>;
  runTriageCycle: (input: string, imagePath?: string) => Promise<TriageResult | null>;
  startVoice: () => Promise<void>;
  stopVoice: () => void;
  reset: () => void;
  // Internal refs exposed for TriageScreen voice integration
  _setOnVoiceResult?: (cb: (text: string) => void) => void;
  _setVoiceMode?: (active: boolean) => void;
  _setPatientId?: (id: string) => void;
}

const CactusContext = createContext<CactusContextValue | null>(null);

const SYSTEM_PROMPT = `നിങ്ങളുടെ പേര് തുണ. നിങ്ങൾ ഒരു മലയാളം സുഹൃത്താണ്.

നിയമങ്ങൾ:
- മലയാളം ലിപിയിൽ മാത്രം എഴുതുക
- ഹിന്ദി ഉപയോഗിക്കരുത്
- English letters-ൽ മലയാളം എഴുതരുത്
- Medicine names മാത്രം English-ൽ: Metformin, Paracetamol
- Numbers English-ൽ: 130/90, 2mg
- ചെറിയ ഉത്തരം: 1-2 വാക്യം മാത്രം
- "നിങ്ങൾ" ഉപയോഗിക്കുക, "നീ" വേണ്ട

ഉദാഹരണങ്ങൾ:
- "ശരി, BP record ചെയ്തു. 140/90 ആണ്."
- "ഇന്ന് Metformin കഴിച്ചോ?"
- "എന്താ വിശേഷം? എങ്ങനെ ഉണ്ട്?"
- "നന്നായി! വേറെ എന്തെങ്കിലും ഉണ്ടോ?"`;

export function CactusProvider({ children }: { children: React.ReactNode }) {
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TriageResult | null>(null);
  const [completion, setCompletion] = useState('');
  const [transcription, setTranscription] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);

  const cactusLMRef = useRef<CactusLM | null>(null);
  const cactusSTTRef = useRef<CactusSTT | null>(null);
  // Callback ref — TriageScreen sets this to process voice results
  const onVoiceResultRef = useRef<((text: string) => void) | null>(null);
  const voiceModeRef = useRef(false);
  const audioBufferRef = useRef<string[]>([]); // Collect base64 audio chunks
  const patientIdRef = useRef('default'); // Current patient ID

  // ══════════════════════════════════════════════════════════════════════════
  // VOICE: Android native SpeechRecognizer
  // In voice mode: auto-restarts after each utterance for continuous conversation
  // ══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    setRecognitionLanguage('ml-IN').catch(() => {
      setRecognitionLanguage('en-IN').catch(() => {});
    });

    let voiceRestartCount = 0;
    const MAX_RESTARTS = 3;

    // Final results — send directly when speech recognition completes
    addEventListener(VoiceToTextEvents.RESULTS, async (e: any) => {
      const results = e?.value || e?.results || [];
      const androidText = Array.isArray(results) ? results[0] || '' : String(results);
      
      setIsListening(false);
      setAgentState('ready');

      // Try Whisper for better Malayalam transcription
      let finalText = androidText;
      if (cactusSTTRef.current && audioBufferRef.current.length > 0) {
        try {
          const pcmSamples = base64ToFloat32(audioBufferRef.current);
          if (pcmSamples.length > 1600) {
            const whisperResult = await cactusSTTRef.current.transcribe({ audio: pcmSamples });
            if (whisperResult?.response && whisperResult.response.trim().length > 0) {
              finalText = whisperResult.response.trim();
            }
          }
        } catch {}
      }
      audioBufferRef.current = [];

      // Send the result if we got text
      if (finalText && finalText.trim().length > 0) {
        voiceRestartCount = 0;
        setTranscription(finalText);
        if (onVoiceResultRef.current) {
          onVoiceResultRef.current(finalText);
        }
      } else if (voiceModeRef.current && voiceRestartCount < MAX_RESTARTS) {
        // No text in voice mode — restart after delay
        voiceRestartCount++;
        setTimeout(() => {
          if (voiceModeRef.current) {
            VoiceToText.startListening().then(() => setIsListening(true)).catch(() => {});
          }
        }, 2000);
      }
    });

    // Collect audio buffers for Whisper
    addEventListener(VoiceToTextEvents.AUDIO_BUFFER, (e: any) => {
      if (e?.buffer) {
        audioBufferRef.current.push(e.buffer);
      }
    });

    // Partial results — show live transcription
    addEventListener(VoiceToTextEvents.PARTIAL_RESULTS, (e: any) => {
      const results = e?.value || e?.results || [];
      const text = Array.isArray(results) ? results[0] || '' : String(results);
      if (text) setTranscription(text);
    });

    // Speech ended — don't restart here (RESULTS handler manages it)
    addEventListener(VoiceToTextEvents.END, () => {
      setIsListening(false);
      setTimeout(() => {
        setAgentState(prev => prev === 'listening' ? 'ready' : prev);
      }, 500);
    });

    // Error — only restart in voice mode for genuine no-speech, with longer delay
    addEventListener(VoiceToTextEvents.ERROR, (e: any) => {
      setIsListening(false);
      setAgentState('ready');
      audioBufferRef.current = [];
      const code = e?.error?.code || e?.code || e?.error || '';
      // Code 6 = no speech, Code 7 = no match
      if (voiceModeRef.current && (code === 7 || code === '7' || code === 6 || code === '6')) {
        voiceRestartCount++;
        if (voiceRestartCount < MAX_RESTARTS) {
          setTimeout(() => {
            if (voiceModeRef.current) {
              VoiceToText.startListening().then(() => {
                setIsListening(true);
                setAgentState('listening');
              }).catch(() => {});
            }
          }, 2000); // 2s pause on error — prevents beep spam
        }
        // After MAX_RESTARTS, voice mode stays active but stops auto-restarting
        // User can tap mic to manually restart
      }
    });

    return () => {
      removeAllListeners(VoiceToTextEvents.RESULTS);
      removeAllListeners(VoiceToTextEvents.PARTIAL_RESULTS);
      removeAllListeners(VoiceToTextEvents.END);
      removeAllListeners(VoiceToTextEvents.ERROR);
      VoiceToText.destroy().catch(() => {});
    };
  }, []);

  const startVoice = async () => {
    if (agentState !== 'ready') return;

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setError('Mic permission denied');
        return;
      }
    }

    try {
      setTranscription('');
      setIsListening(true);
      setAgentState('listening');
      setError(null);
      audioBufferRef.current = []; // Clear buffer for new recording
      await VoiceToText.startListening();
    } catch (e: any) {
      setIsListening(false);
      setAgentState('ready');
      setError(`Voice start failed: ${e.message}`);
    }
  };

  const stopVoice = () => {
    VoiceToText.stopListening().catch(() => {});
    setIsListening(false);
    // agentState will be set by the RESULTS or END event handler
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALIZE
  // ══════════════════════════════════════════════════════════════════════════

  const initialize = async () => {
    try {
      setError(null);
      setAgentState('downloading');

      const GEMMA4_MODEL_NAME = 'gemma-4-e2b-it-int4';
      const GEMMA4_URL = 'https://huggingface.co/Cactus-Compute/gemma-4-E2B-it/resolve/main/weights/gemma-4-e2b-it-int4.zip';

      const modelExists = await CactusFileSystem.modelExists(GEMMA4_MODEL_NAME);
      if (!modelExists) {
        try {
          await CactusFileSystem.downloadModel(GEMMA4_MODEL_NAME, GEMMA4_URL, (progress: number) => {
            setDownloadProgress(progress);
          });
        } catch (dlErr: any) {
          // Download failed (screen locked, network lost) — show friendly retry message
          setAgentState('error');
          setError('ഡൗൺലോഡ് പൂർത്തിയായില്ല. ഫോൺ ലോക്ക് ചെയ്യരുത്. വീണ്ടും ശ്രമിക്കുക.');
          return;
        }
      }
      setDownloadProgress(1);

      const modelPath = await CactusFileSystem.getModelPath(GEMMA4_MODEL_NAME);
      const lm = new CactusLM({ model: modelPath });
      cactusLMRef.current = lm;

      // Download Whisper for Malayalam STT
      const stt = new CactusSTT({ model: 'whisper-small' });
      cactusSTTRef.current = stt;
      await stt.download({ onProgress: (p: number) => setDownloadProgress(0.9 + p * 0.1) });

      setAgentState('initializing');
      await lm.init();
      await stt.init();
      setAgentState('ready');
    } catch (e: any) {
      setAgentState('error');
      setError(`Init failed: ${e.message}`);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // AGENT: Run Gemma 4 with all tools
  // ══════════════════════════════════════════════════════════════════════════

  const runTriageCycle = async (input: string, imagePath?: string): Promise<TriageResult | null> => {
    if (agentState !== 'ready' || !cactusLMRef.current) {
      setError('Agent not ready');
      return null;
    }

    try {
      setAgentState('thinking');
      setError(null);
      setCompletion('');

      // ── PRESCRIPTION OCR FLOW ──
      // If image is provided and input suggests prescription scanning
      if (imagePath && isPrescriptionScanIntent(input)) {
        try {
          return await handlePrescriptionOCR(input, imagePath);
        } catch (ocrErr: any) {
          // If OCR crashes (model doesn't support images), fall back gracefully
          setAgentState('ready');
          return {
            classification: 'ചിത്രം പ്രോസസ്സ് ചെയ്യാൻ കഴിഞ്ഞില്ല. ടെക്സ്റ്റ് ആയി ടൈപ്പ് ചെയ്യുക.',
            urgency: 'yellow',
            actions: [],
            referralNeeded: false,
            followUp: ocrErr?.message || '',
            reasoning: 'OCR crashed',
            timestamp: Date.now(),
          };
        }
      }

      // STEP 1: Try regex first for obvious structured inputs (fast path)
      setAgentState('calling_tool');
      const regexResult = await runAgent(input, patientIdRef.current);

      // If regex detected a specific intent (not general_chat), use it — it's faster and more reliable for data
      if (regexResult.intent.type !== 'general_chat' && regexResult.intent.type !== 'symptom_report') {
        // Regex handled it — now just generate response
        setAgentState('responding');
        setCompletion('');

        const userMessage: any = { role: 'user', content: regexResult.contextForLLM };
        const messages: any[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.slice(-6),
          userMessage,
        ];

        const inferenceStart = Date.now();
        const result = await cactusLMRef.current.complete({
          messages,
          options: { temperature: 0.1, maxTokens: 150 },
          onToken: (token: string) => { setCompletion(prev => prev + token); },
        });
        const inferenceMs = Date.now() - inferenceStart;

        const finalText = result.response || 'ശരി, ചെയ്തു.';
        const triageResult = parseResponse(finalText);
        const toolInfo = regexResult.toolsExecuted.length > 0
          ? regexResult.toolsExecuted.map(t => `${t.tool}: ${t.success ? '✓' : '✗'} ${t.message || ''}`).join(' | ')
          : '';
        triageResult.reasoning = toolInfo + (toolInfo ? ' | ' : '') + `⚡ ${inferenceMs}ms`;
        if (regexResult.alert) triageResult.followUp = regexResult.alert;

        setLastResult(triageResult);
        updateHistory(input, finalText);
        setAgentState('ready');
        return triageResult;
      }

      // STEP 2: Regex didn't match specific health intent — just chat
      // LLM generates ONLY the Malayalam response. No tool calling from LLM.
      setAgentState('responding');
      setCompletion('');

      const messages: any[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.slice(-6),
        { role: 'user', content: input },
      ];

      const inferenceStart = Date.now();
      const result = await cactusLMRef.current.complete({
        messages,
        options: { temperature: 0.1, maxTokens: 150 },
        onToken: (token: string) => { setCompletion(prev => prev + token); },
      });
      const inferenceMs = Date.now() - inferenceStart;

      const finalText = result.response || 'ശരി, മനസ്സിലായി.';
      const triageResult = parseResponse(finalText);
      triageResult.reasoning = `⚡ ${inferenceMs}ms`;

      // Post-LLM: check if the response or input implies a reminder should be set
      // This catches cases where regex missed it but the context is clearly about scheduling
      if (/ഓർമ്മിപ്പിക്ക|reminder|set|alarm|ഓർമ്മ/i.test(input) || /ഓർമ്മിപ്പിക്കാം|സെറ്റ്\s*ചെയ്/i.test(finalText)) {
        // Create a reminder from the input
        const timeMatch = input.match(/(\d{1,2})\s*(am|pm|മണി)/i);
        let time = '08:00';
        if (timeMatch) {
          let h = parseInt(timeMatch[1]);
          if (/pm/i.test(timeMatch[2]) && h < 12) h += 12;
          time = `${h.toString().padStart(2, '0')}:00`;
        } else if (/evening|വൈകുന്നേരം/i.test(input)) time = '18:00';
        else if (/night|രാത്രി/i.test(input)) time = '21:00';
        else if (/morning|രാവിലെ/i.test(input)) time = '08:00';

        const title = input.replace(/remind|ഓർമ്മ|alarm|set|at|please|\d+\s*(am|pm|മണി)|morning|evening|night|രാവിലെ|വൈകുന്നേരം|രാത്രി/gi, '').trim() || 'Reminder';

        try {
          await database.write(async () => {
            await database.get<Reminder>('reminders').create((r: any) => {
              r.reminderId = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              r.patientId = patientIdRef.current;
              r.reminderType = 'custom';
              r.medication = title;
              r.dosage = '';
              r.timeSlots = JSON.stringify([time]);
              r.startDate = new Date().toISOString().split('T')[0];
              r.endDate = '';
              r.ttsMessage = `${title} — സമയമായി`;
              r.isActive = true;
              r.createdAt = Date.now();
            });
          });
          triageResult.reasoning += ' | reminder: ✓';
        } catch {}
      }

      setLastResult(triageResult);
      updateHistory(input, finalText);
      setAgentState('ready');
      return triageResult;
    } catch (e: any) {
      setAgentState('error');
      setError(`Failed: ${e.message}`);
      setTimeout(() => setAgentState('ready'), 3000);
      return null;
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PRESCRIPTION OCR — Multimodal image processing
  // ══════════════════════════════════════════════════════════════════════════

  const handlePrescriptionOCR = async (input: string, imagePath: string): Promise<TriageResult | null> => {
    try {
      setAgentState('calling_tool');
      setCompletion('');

      // Image is already compressed by camera (512x512, quality 0.4)
      // Send to Gemma 4 with extraction prompt
      const messages: any[] = [
        { role: 'system', content: PRESCRIPTION_EXTRACTION_PROMPT },
        { role: 'user', content: input || 'Extract all medications from this prescription.', images: [imagePath] },
      ];

      const inferenceStart = Date.now();
      const result = await cactusLMRef.current!.complete({
        messages,
        options: { temperature: 0.1, maxTokens: 300 }, // Low temp for structured extraction
        onToken: (token: string) => { setCompletion(prev => prev + token); },
      });
      const inferenceMs = Date.now() - inferenceStart;

      // Parse the OCR response
      const ocrResult = parseOCRResponse(result.response || '');

      if (!ocrResult.success || ocrResult.medications.length === 0) {
        setAgentState('ready');
        return {
          classification: 'പ്രിസ്ക്രിപ്ഷനിൽ നിന്ന് മരുന്നുകൾ വായിക്കാൻ കഴിഞ്ഞില്ല. വ്യക്തമായ ഫോട്ടോ എടുക്കുക.',
          urgency: 'yellow',
          actions: ['ഫോട്ടോ വ്യക്തമാണെന്ന് ഉറപ്പാക്കുക', 'നല്ല വെളിച്ചത്തിൽ എടുക്കുക'],
          referralNeeded: false,
          followUp: ocrResult.error || '',
          reasoning: `OCR failed | ⚡ ${inferenceMs}ms`,
          timestamp: Date.now(),
        };
      }

      // Save all extracted medications to DB
      setAgentState('calling_tool');
      const saveResult = await savePrescriptionMedications(ocrResult.medications, patientIdRef.current);

      // Generate confirmation response
      setAgentState('responding');
      const medNames = ocrResult.medications.map(m => `${m.name} ${m.dosage}`).join(', ');
      const confirmMessages: any[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Prescription scanned successfully. Saved ${saveResult.saved} medications: ${medNames}. Reminders set for each. Confirm to user in nadan Malayalam — list each medicine with dosage and timing. Be warm and encouraging.` },
      ];

      const confirmResult = await cactusLMRef.current!.complete({
        messages: confirmMessages,
        options: { temperature: 0.1, maxTokens: 150 },
        onToken: (token: string) => { setCompletion(prev => prev + token); },
      });

      const finalText = confirmResult.response || `${saveResult.saved} മരുന്നുകൾ സേവ് ചെയ്തു. റിമൈൻഡർ സെറ്റ് ചെയ്തു.`;
      const triageResult: TriageResult = {
        classification: finalText,
        urgency: 'green',
        actions: ocrResult.medications.map(m => `💊 ${m.name} ${m.dosage} — ${m.frequency}`),
        referralNeeded: false,
        followUp: '',
        reasoning: `prescription_ocr: ✓ ${saveResult.saved} meds | schedule_reminder: ✓ ${saveResult.reminders} | ⚡ ${inferenceMs}ms`,
        timestamp: Date.now(),
      };

      setLastResult(triageResult);
      updateHistory(input, finalText);
      setAgentState('ready');
      return triageResult;
    } catch (e: any) {
      setAgentState('error');
      setError(`OCR failed: ${e.message}`);
      setTimeout(() => setAgentState('ready'), 3000);
      return null;
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  const isPrescriptionScanIntent = (input: string): boolean => {
    return /prescription|presc|കുറിപ്പടി|മരുന്ന്.*ഫോട്ടോ|scan.*med|read.*prescription|extract.*med|photo.*med/i.test(input);
  };

  // Clean response — remove any romanized Malayalam (Manglish) from output
  const cleanMalayalamResponse = (text: string): string => {
    // Detect Hindi characters (Devanagari script) and remove them
    const hindiChars = (text.match(/[\u0900-\u097F]/g) || []).length;
    if (hindiChars > 3) {
      // Has Hindi — strip Hindi portions and keep Malayalam + English
      text = text.replace(/[\u0900-\u097F]+/g, '').replace(/\s{2,}/g, ' ').trim();
      if (text.length < 5) {
        return 'ശരി, മനസ്സിലായി. വേറെ എന്തെങ്കിലും ചോദിക്കാനുണ്ടോ?';
      }
    }

    // If the response is mostly Latin characters (not Malayalam script), it's Manglish
    const malayalamChars = (text.match(/[\u0D00-\u0D7F]/g) || []).length;
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
    const totalChars = text.replace(/[\s\d\.\,\!\?\:\;\-\/\(\)]/g, '').length;

    if (totalChars > 10 && latinChars > totalChars * 0.6 && malayalamChars < totalChars * 0.3) {
      return 'ശരി, മനസ്സിലായി. വേറെ എന്തെങ്കിലും ചോദിക്കാനുണ്ടോ?';
    }

    // Remove common Manglish patterns
    let cleaned = text;
    cleaned = cleaned.replace(/\b(nannaayi|shariyaanu|kazhichu|enthaa|ningal|aanu|illa|und|venda|cheyyuka)\b/gi, '');
    cleaned = cleaned.trim();

    return cleaned || text;
  };

  const parseResponse = (text: string): TriageResult => {
    // First clean the response of any Manglish
    const cleanedText = cleanMalayalamResponse(text);

    try {
      const m = cleanedText.match(/\{[\s\S]*\}/);
      if (m) {
        const j = JSON.parse(m[0]);
        if (j.urgency && j.classification) {
          return { classification: cleanMalayalamResponse(j.classification), urgency: j.urgency, actions: (j.actions || []).map((a: string) => cleanMalayalamResponse(a)), referralNeeded: j.referral_needed || false, followUp: j.follow_up ? cleanMalayalamResponse(j.follow_up) : '', reasoning: j.reasoning || '', timestamp: Date.now() };
        }
      }
    } catch {}

    let urgency: 'green' | 'yellow' | 'red' = 'yellow';
    if (/ചുവപ്പ്|red|refer|urgent|അടിയന്തര/i.test(cleanedText)) urgency = 'red';
    else if (/പച്ച|green|safe|mild/i.test(cleanedText)) urgency = 'green';

    return { classification: cleanedText, urgency, actions: [], referralNeeded: urgency === 'red', followUp: '', reasoning: '', timestamp: Date.now() };
  };

  const updateHistory = (userInput: string, assistantResponse: string) => {
    setHistory(prev => [...prev, { role: 'user', content: userInput }, { role: 'assistant', content: assistantResponse }]);
  };

  const reset = () => {
    setHistory([]);
    setLastResult(null);
    setCompletion('');
    setTranscription('');
    setError(null);
    if (agentState !== 'idle' && agentState !== 'downloading') setAgentState('ready');
  };

  useEffect(() => {
    return () => {
      cactusLMRef.current?.destroy();
      cactusSTTRef.current?.destroy();
    };
  }, []);

  return (
    <CactusContext.Provider value={{
      agentState, downloadProgress, error, lastResult, completion, transcription, isListening,
      initialize, runTriageCycle, startVoice, stopVoice, reset,
      _setOnVoiceResult: (cb: (text: string) => void) => { onVoiceResultRef.current = cb; },
      _setVoiceMode: (active: boolean) => { voiceModeRef.current = active; },
      _setPatientId: (id: string) => { patientIdRef.current = id; },
    }}>
      {children}
    </CactusContext.Provider>
  );
}

export function useCactus(): CactusContextValue {
  const ctx = useContext(CactusContext);
  if (!ctx) throw new Error('useCactus must be used within CactusProvider');
  return ctx;
}
