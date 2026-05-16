import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { CactusLM, CactusSTT } from 'cactus-react-native';
import VoiceToText, { VoiceToTextEvents, addEventListener, removeAllListeners, setRecognitionLanguage } from '@appcitor/react-native-voice-to-text';
import type { TriageResult } from '../types/triage';
import { AGENT_TOOLS, executeAgentTool } from '../tools/agentTools';
import { runAgent } from '../agent/AgentEngine';
import { NitroModules } from 'react-native-nitro-modules';

// Base64 decode helper
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
}

const CactusContext = createContext<CactusContextValue | null>(null);

const SYSTEM_PROMPT = `നീ പ്രായമായവർക്കും ശാരീരിക ബുദ്ധിമുട്ടുകൾ നേരിടുന്നവർക്കും വേണ്ടിയുള്ള ഒരു സ്മാർട്ട് ഹെൽത്ത് കെയർ ആൻഡ് മാനേജ്മെന്റ് അസിസ്റ്റന്റ് ആണ്. നിന്റെ പേര് 'തുണ' (Thuna) എന്നാണ്.

AVAILABLE TOOLS (system auto-executes based on user input):
1. save_vital — When user says BP, sugar, SpO2, temp, pulse, weight, pain score
2. save_medication — When user mentions medicine + dosage + frequency
3. schedule_reminder — Auto-created with each medication (Morning 8AM, Afternoon 2PM, Evening 8PM)
4. save_condition — When user says "I have diabetes/BP/thyroid/etc"
5. save_lab_result — When user says HbA1c, TSH, creatinine, hemoglobin values
6. log_adherence — When user says "took medicine" / "കഴിച്ചു"
7. get_active_medications — When user asks "my medicines" / "what am I taking"
8. get_conditions — When user asks about their conditions
9. get_active_reminders — When user asks about reminders/schedule
10. get_vitals_history — When user asks about BP/sugar history

PERSONALITY:
- നാട്ടിലെ വിദ്യാസമ്പന്നനും കാര്യവിവരമുള്ളതുമായ ഒരു സുഹൃത്തിനെപ്പോലെ
- കാരുണ്യവും സ്നേഹവും ബഹുമാനവും നിറഞ്ഞ ഭാഷ
- ഒറ്റപ്പെടൽ/സങ്കടം പ്രകടിപ്പിച്ചാൽ ആശ്വസിപ്പിക്കുക
- ഏത് വിഷയത്തെ കുറിച്ചും സംസാരിക്കാം — ആരോഗ്യം മാത്രമല്ല
- ലളിതമായ മലയാളം, English medical terms OK
- formatting/bullets/*/# ഉപയോഗിക്കരുത്
- ചോദ്യത്തിന്റെ complexity-ക്ക് അനുസരിച്ച് ഉത്തരം
- അറിയില്ലെങ്കിൽ അറിയില്ല എന്ന് പറയുക
- അടിയന്തിര സാഹചര്യത്തിൽ ശാന്തമായി ഡോക്ടറെ വിളിക്കാൻ പറയുക`;

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

    // Final results — use Whisper for Malayalam if available, else Android result
    addEventListener(VoiceToTextEvents.RESULTS, async (e: any) => {
      const results = e?.value || e?.results || [];
      const androidText = Array.isArray(results) ? results[0] || '' : String(results);
      
      setIsListening(false);
      setAgentState('ready');

      // Try Whisper transcription if we have audio buffers and STT is ready
      let finalText = androidText;
      if (cactusSTTRef.current && audioBufferRef.current.length > 0) {
        try {
          const pcmSamples = base64ToFloat32(audioBufferRef.current);
          
          if (pcmSamples.length > 1600) { // At least 0.1s of audio
            const whisperResult = await cactusSTTRef.current.transcribe({ audio: pcmSamples });
            if (whisperResult?.response && whisperResult.response.trim().length > 0) {
              finalText = whisperResult.response.trim();
            }
          }
        } catch (whisperErr) {
          console.warn('Whisper fallback:', whisperErr);
        }
      }
      audioBufferRef.current = [];

      if (finalText) {
        setTranscription(finalText);
        if (onVoiceResultRef.current) {
          onVoiceResultRef.current(finalText);
        }
      } else if (voiceModeRef.current) {
        // No text — restart listening in voice mode
        setTimeout(() => {
          if (voiceModeRef.current) {
            VoiceToText.startListening().then(() => setIsListening(true)).catch(() => {});
          }
        }, 300);
      }
    });

    // Collect audio buffers for Whisper
    addEventListener(VoiceToTextEvents.AUDIO_BUFFER, (e: any) => {
      if (e?.buffer) {
        audioBufferRef.current.push(e.buffer);
      }
    });

    // Partial results — show live transcription (Android's quick result)
    addEventListener(VoiceToTextEvents.PARTIAL_RESULTS, (e: any) => {
      const results = e?.value || e?.results || [];
      const text = Array.isArray(results) ? results[0] || '' : String(results);
      if (text) setTranscription(text);
    });

    // Speech ended
    addEventListener(VoiceToTextEvents.END, () => {
      setIsListening(false);
      setTimeout(() => {
        setAgentState(prev => prev === 'listening' ? 'ready' : prev);
      }, 300);
    });

    // Error — restart in voice mode for no-speech/no-match
    addEventListener(VoiceToTextEvents.ERROR, (e: any) => {
      setIsListening(false);
      setAgentState('ready');
      audioBufferRef.current = [];
      const code = e?.error?.code || e?.code || e?.error || '';
      if (voiceModeRef.current && (code === 7 || code === '7' || code === 6 || code === '6')) {
        setTimeout(() => {
          if (voiceModeRef.current) {
            VoiceToText.startListening().then(() => {
              setIsListening(true);
              setAgentState('listening');
            }).catch(() => {});
          }
        }, 500);
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
        await CactusFileSystem.downloadModel(GEMMA4_MODEL_NAME, GEMMA4_URL, (progress: number) => {
          setDownloadProgress(progress);
        });
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

      // STEP 1: Run the deterministic agent engine
      // This parses intent, executes tools, and builds context for the LLM
      setAgentState('calling_tool');
      const agentResult = await runAgent(input, patientIdRef.current);

      // STEP 2: Use Gemma 4 ONLY for generating the natural language response
      setAgentState('responding');
      setCompletion('');

      // Build messages — include image if provided
      const userMessage: any = { role: 'user', content: agentResult.contextForLLM };
      if (imagePath) {
        userMessage.images = [imagePath];
      }

      const messages: any[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.slice(-10),
        userMessage,
      ];

      const result = await cactusLMRef.current.complete({
        messages,
        options: { temperature: 0.7, maxTokens: 1024 },
        onToken: (token: string) => { setCompletion(prev => prev + token); },
      });

      const finalText = result.response || 'ശരി, ചെയ്തു.';
      const triageResult = parseResponse(finalText);
      
      // Add tool execution info and alert
      if (agentResult.toolsExecuted.length > 0) {
        triageResult.reasoning = agentResult.toolsExecuted
          .map(t => `${t.tool}: ${t.success ? '✓' : '✗'} ${t.message || ''}`)
          .join(' | ');
      }
      if (agentResult.alert) {
        triageResult.followUp = agentResult.alert;
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
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  const parseResponse = (text: string): TriageResult => {
    try {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        const j = JSON.parse(m[0]);
        if (j.urgency && j.classification) {
          return { classification: j.classification, urgency: j.urgency, actions: j.actions || [], referralNeeded: j.referral_needed || false, followUp: j.follow_up || '', reasoning: j.reasoning || '', timestamp: Date.now() };
        }
      }
    } catch {}

    let urgency: 'green' | 'yellow' | 'red' = 'yellow';
    if (/ചുവപ്പ്|red|refer|urgent|അടിയന്തര/i.test(text)) urgency = 'red';
    else if (/പച്ച|green|safe|mild/i.test(text)) urgency = 'green';

    return { classification: text, urgency, actions: [], referralNeeded: urgency === 'red', followUp: '', reasoning: '', timestamp: Date.now() };
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
      // @ts-ignore — expose ref setter for TriageScreen
      _setOnVoiceResult: (cb: (text: string) => void) => { onVoiceResultRef.current = cb; },
      _setVoiceMode: (active: boolean) => { voiceModeRef.current = active; },
      _setPatientId: (id: string) => { patientIdRef.current = id; },
    }}>
      {children}
    </CactusContext.Provider>
  );
}

export function useCactus() {
  const ctx = useContext(CactusContext);
  if (!ctx) throw new Error('useCactus must be used within CactusProvider');
  return ctx as CactusContextValue & { _setOnVoiceResult?: (cb: (text: string) => void) => void };
}
