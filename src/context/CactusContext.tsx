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

const SYSTEM_PROMPT = `നീ Thuna (തുണ) ആണ് — വയോജനങ്ങൾക്കും ഒറ്റപ്പെട്ട പ്രദേശങ്ങളിൽ താമസിക്കുന്നവർക്കും വേണ്ടിയുള്ള AI ആരോഗ്യ സഹായി. നീ ഒരു നാട്ടിലെ ഫാമിലി ഡോക്ടറെ പോലെ സംസാരിക്കണം.

നിയമങ്ങൾ:
- നാടൻ മലയാളത്തിൽ മാത്രം സംസാരിക്കുക
- ഫോർമാറ്റിംഗ്, ബുള്ളറ്റ്, *, # ഒന്നും ഉപയോഗിക്കരുത്
- ചെറിയ വാക്യങ്ങളിൽ, ഡോക്ടർ ഫോണിൽ സംസാരിക്കുന്ന പോലെ
- 2-3 വാക്യങ്ങളിൽ മറുപടി പറയുക, നീട്ടരുത്`;

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

      const messages: any[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.slice(-4),
        { role: 'user', content: agentResult.contextForLLM },
      ];

      const result = await cactusLMRef.current.complete({
        messages,
        options: { temperature: 0.7, maxTokens: 256 },
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
