import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, PermissionsAndroid, Platform, Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { launchCamera } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types/navigation';
import { ChatMessage } from '../types/triage';
import { useCactus } from '../context/CactusContext';
import Tts from 'react-native-tts';

type Props = NativeStackScreenProps<RootStackParamList, 'Triage'>;

export default function TriageScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const {
    agentState, isListening, completion, transcription, error,
    startVoice, stopVoice, runTriageCycle, reset, _setOnVoiceResult, _setVoiceMode,
  } = useCactus() as any;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      text: 'നമസ്കാരം! ഞാൻ തുണ ആണ് — നിങ്ങളുടെ ആരോഗ്യ സഹായി.\n\n🎤 ടാപ്പ് — ഒറ്റ ചോദ്യം\n🎤 ലോങ് പ്രസ്സ് — തുടർച്ചയായ സംഭാഷണം\n⌨️ ടൈപ്പ് ചെയ്യുക\n📷 പ്രിസ്ക്രിപ്ഷൻ ഫോട്ടോ',
      isUser: false,
      timestamp: Date.now(),
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [voiceMode, setVoiceMode] = useState(false); // Continuous voice conversation mode
  const scrollRef = useRef<ScrollView>(null);

  // Register voice result callback — auto-processes when speech ends
  useEffect(() => {
    if (_setOnVoiceResult) {
      _setOnVoiceResult((text: string) => {
        if (text.trim() && !isProcessing) {
          processInput(text.trim());
        }
      });
    }
  }, [isProcessing]);

  // ══════════════════════════════════════════════════════════════════════════
  // Process input → Gemma 4 → show in chat → speak response
  // ══════════════════════════════════════════════════════════════════════════

  const processInput = async (input: string, imagePath?: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(), text: input, isUser: true, timestamp: Date.now(),
    }]);
    setIsProcessing(true);

    const result = await runTriageCycle(input, imagePath);
    setIsProcessing(false);

    if (result) {
      const responseText = result.classification;
      // Build tool execution badges
      let badges = '';
      if (result.reasoning && result.reasoning.includes('✓')) {
        const parts = result.reasoning.split(' | ');
        const badgeTexts = parts.map((t: string) => {
          if (t.includes('save_medication')) return '💊 Saved';
          if (t.includes('schedule_reminder')) return '⏰ Reminder set';
          if (t.includes('save_condition')) return '🏥 Recorded';
          if (t.includes('get_active')) return '📋 Retrieved';
          return '';
        }).filter(Boolean);
        if (badgeTexts.length > 0) badges = '\n\n' + badgeTexts.join('  •  ');
      }
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), text: responseText + badges, isUser: false, timestamp: Date.now(),
      }]);
      speakMalayalam(responseText);
    } else if (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), text: `⚠️ ${error}`, isUser: false, timestamp: Date.now(),
      }]);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // TTS — speak response, then auto-listen if in voice mode
  // ══════════════════════════════════════════════════════════════════════════

  const speakMalayalam = (text: string) => {
    try {
      Tts.setDefaultLanguage('ml-IN');
      Tts.setDefaultRate(0.5);
      const clean = text
        .replace(/[\*\#\-\•\→\►\●\○\◆\■\□\[\]{}]/g, '')
        .replace(/[^\u0D00-\u0D7F\u0020-\u007Ea-zA-Z0-9\n.,!?:;()°%\/]/g, '')
        .replace(/\n+/g, '. ')
        .replace(/\s+/g, ' ')
        .trim();
      if (clean) {
        // Remove old listener to avoid stacking
        Tts.removeAllListeners('tts-finish');
        Tts.addEventListener('tts-finish', () => {
          // In voice mode: wait 1 second then start listening again
          if (voiceMode) {
            setTimeout(() => {
              if (voiceMode && !isProcessing) {
                startVoice();
              }
            }, 800);
          }
        });
        Tts.speak(clean);
      } else if (voiceMode) {
        // No text to speak, but in voice mode — start listening anyway
        setTimeout(() => startVoice(), 500);
      }
    } catch {
      // TTS failed — still restart listening in voice mode
      if (voiceMode) setTimeout(() => startVoice(), 500);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Mic button — tap for single, long press for continuous voice mode
  // ══════════════════════════════════════════════════════════════════════════

  const handleMicPress = async () => {
    if (voiceMode) {
      // Exit voice mode completely
      setVoiceMode(false);
      if (_setVoiceMode) _setVoiceMode(false);
      Tts.stop();
      stopVoice();
      Tts.removeAllListeners('tts-finish');
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: '🎙️ സംഭാഷണ മോഡ് നിർത്തി.',
        isUser: false,
        timestamp: Date.now(),
      }]);
    } else if (isListening) {
      stopVoice();
    } else {
      await startVoice();
    }
  };

  const handleMicLongPress = async () => {
    if (voiceMode) return;
    setVoiceMode(true);
    if (_setVoiceMode) _setVoiceMode(true);
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: '🎙️ സംഭാഷണ മോഡ് — സംസാരിക്കുക. നിർത്താൻ 🎤 അമർത്തുക.',
      isUser: false,
      timestamp: Date.now(),
    }]);
    await startVoice();
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Text send
  // ══════════════════════════════════════════════════════════════════════════

  const handleSend = () => {
    if (textInput.trim() && !isProcessing) {
      const text = textInput.trim();
      setTextInput('');
      // Don't pass image to LLM — causes OOM crash on 8GB devices
      // User describes the image content in text, Gemma processes text only
      setPendingImage(null);
      processInput(text);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Camera — capture image, show in chat, wait for user prompt
  // ══════════════════════════════════════════════════════════════════════════

  const [pendingImage, setPendingImage] = useState<string | null>(null);

  const handleCamera = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
    }

    try {
      const result = await launchCamera({ mediaType: 'photo', maxWidth: 512, maxHeight: 512, quality: 0.5 });
      if (result.didCancel || result.errorCode) return;

      if (result.assets?.[0]?.uri) {
        const uri = result.assets[0].uri;
        // Store image for display only — don't pass to LLM (causes OOM crash)
        setPendingImage(uri);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: '📷',
          isUser: true,
          timestamp: Date.now(),
          imagePath: uri,
        }]);
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          text: 'ചിത്രം ചേർത്തു. ഇതിൽ എന്താണ് കാണുന്നത് എന്ന് വിവരിക്കുക — ഞാൻ വിശകലനം ചെയ്യാം.\n\n(Image added. Describe what you see in it — medications, readings, symptoms — and I\'ll analyze.)',
          isUser: false,
          timestamp: Date.now(),
        }]);
      }
    } catch {}
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Status text
  // ══════════════════════════════════════════════════════════════════════════

  const getStatusText = () => {
    if (voiceMode && isListening) return '🎙️ സംസാരിക്കുക... (Voice mode active)';
    if (isListening) return '🔴 കേൾക്കുന്നു... സംസാരിക്കുക';
    switch (agentState) {
      case 'thinking': return '🧠 Gemma 4 ചിന്തിക്കുന്നു...';
      case 'calling_tool': return '🔧 Tools പ്രവർത്തിക്കുന്നു...';
      case 'responding': return '💬 മറുപടി...';
      default: return '';
    }
  };

  const showStatus = voiceMode || isListening || (agentState !== 'ready' && agentState !== 'idle');

  // ══════════════════════════════════════════════════════════════════════════
  // UI
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Status bar */}
      {showStatus && (
        <View style={[styles.statusBar, isListening && styles.statusBarListening]}>
          {!isListening && <ActivityIndicator size="small" color="#1B5E20" />}
          <Text style={[styles.statusBarText, isListening && styles.statusBarTextListening]}>
            {getStatusText()}
          </Text>
          {/* Live transcription while speaking */}
          {isListening && transcription ? (
            <Text style={styles.liveTranscription}>{transcription}</Text>
          ) : null}
        </View>
      )}

      {/* Chat */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatContainer}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd()}
        keyboardShouldPersistTaps="handled">
        {messages.map(msg => (
          <View key={msg.id} style={[styles.bubble, msg.isUser ? styles.userBubble : styles.agentBubble]}>
            {msg.imagePath && (
              <View style={styles.imageContainer}>
                <Image source={{ uri: msg.imagePath }} style={styles.chatImage} resizeMode="cover" />
              </View>
            )}
            {msg.text !== '📷' && (
              <Text style={[styles.bubbleText, msg.isUser ? styles.userText : styles.agentText]}>
                {msg.text}
              </Text>
            )}
            {!msg.isUser && msg.id !== '0' && (
              <TouchableOpacity onPress={() => speakMalayalam(msg.text)} style={styles.speakBtn}>
                <Text style={styles.speakBtnText}>🔊</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* Loading / tool calling indicator */}
        {isProcessing && (
          <View style={[styles.bubble, styles.agentBubble]}>
            {agentState === 'calling_tool' ? (
              <View style={styles.loadingRow}>
                <Text style={styles.toolCallText}>🔧 Tools executing...</Text>
              </View>
            ) : completion && !completion.includes('"name"') && !completion.includes('get_current') ? (
              <Text style={styles.agentText}>{completion}▌</Text>
            ) : (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#1B5E20" />
                <Text style={styles.loadingText}> {agentState === 'thinking' ? 'ചിന്തിക്കുന്നു...' : 'Processing...'}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {/* Pending image indicator */}
        {pendingImage && (
          <View style={styles.pendingImageBadge}>
            <Text style={styles.pendingImageText}>📎 ചിത്രം ചേർത്തു — എന്ത് ചെയ്യണം?</Text>
          </View>
        )}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            placeholder={pendingImage ? "ചിത്രത്തെ കുറിച്ച് ചോദിക്കുക..." : "ടൈപ്പ് ചെയ്യുക..."}
            placeholderTextColor="#999"
            value={textInput}
            onChangeText={setTextInput}
            onSubmitEditing={handleSend}
            editable={!isProcessing && !isListening}
          />
          <TouchableOpacity
            style={[styles.btn, styles.sendBtn, (!textInput.trim() || isProcessing) && styles.btnOff]}
            onPress={handleSend}
            disabled={isProcessing || !textInput.trim()}>
            <Text style={styles.btnIcon}>➤</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, isListening ? styles.micActive : voiceMode ? styles.micVoiceMode : styles.micBtn, isProcessing && styles.btnOff]}
            onPress={handleMicPress}
            onLongPress={handleMicLongPress}
            disabled={isProcessing}>
            <Text style={styles.btnIcon}>{voiceMode ? '🔴' : isListening ? '⏹' : '🎤'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.camBtn, (isProcessing || isListening) && styles.btnOff]}
            onPress={handleCamera}
            disabled={isProcessing || isListening}>
            <Text style={styles.btnIcon}>📷</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  statusBar: {
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statusBarListening: { backgroundColor: '#FFEBEE' },
  statusBarText: { fontSize: 13, color: '#2E7D32' },
  statusBarTextListening: { color: '#C62828', fontWeight: '600' },
  liveTranscription: { fontSize: 15, color: '#333', marginTop: 4, fontStyle: 'italic' },
  chatContainer: { flex: 1 },
  chatContent: { padding: 12, paddingBottom: 8 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 16, marginBottom: 10 },
  userBubble: { backgroundColor: '#1B5E20', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  agentBubble: { backgroundColor: '#fff', alignSelf: 'flex-start', borderBottomLeftRadius: 4, elevation: 2, borderWidth: 1, borderColor: '#E0E0E0' },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#fff' },
  agentText: { color: '#333' },
  speakBtn: { marginTop: 6, alignSelf: 'flex-end' },
  speakBtnText: { fontSize: 16 },
  imageContainer: { marginBottom: 8, borderRadius: 8, overflow: 'hidden' },
  chatImage: { width: 150, height: 150, borderRadius: 8 },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  loadingText: { fontSize: 13, color: '#666' },
  toolCallText: { fontSize: 14, color: '#1B5E20', fontWeight: '600' },
  inputBar: {
    paddingTop: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    elevation: 8,
  },
  pendingImageBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 6,
  },
  pendingImageText: { fontSize: 12, color: '#1565C0' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  textInput: {
    flex: 1, height: 44, borderWidth: 1, borderColor: '#DDD', borderRadius: 22,
    paddingHorizontal: 16, fontSize: 14, color: '#333', backgroundColor: '#F9F9F9',
  },
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { backgroundColor: '#1B5E20' },
  micBtn: { backgroundColor: '#2E7D32' },
  micActive: { backgroundColor: '#C62828' },
  micVoiceMode: { backgroundColor: '#FF6F00' },
  camBtn: { backgroundColor: '#1565C0' },
  btnOff: { backgroundColor: '#BDBDBD' },
  btnIcon: { fontSize: 18, color: '#fff' },
});
