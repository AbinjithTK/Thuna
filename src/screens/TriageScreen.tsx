import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, PermissionsAndroid, Platform, Image,
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatMessage } from '../types/triage';
import { useCactus } from '../context/CactusContext';
import { useUser } from '../context/UserContext';
import Tts from 'react-native-tts';

export default function TriageScreen() {
  const insets = useSafeAreaInsets();
  const {
    agentState, isListening, completion, transcription, error,
    startVoice, stopVoice, runTriageCycle, reset, _setOnVoiceResult, _setVoiceMode, _setPatientId,
  } = useCactus() as any;
  const { currentUser } = useUser();

  useEffect(() => {
    if (currentUser && _setPatientId) _setPatientId(currentUser.id);
  }, [currentUser]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      text: `Hi ${currentUser?.name || ''}! 👋\nഎന്താ വിശേഷം? ആരോഗ്യ കാര്യങ്ങൾ ചോദിക്കാം, BP/sugar record ചെയ്യാം, മരുന്ന് reminder set ചെയ്യാം.`,
      isUser: false,
      timestamp: Date.now(),
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (_setOnVoiceResult) {
      _setOnVoiceResult((text: string) => {
        if (text.trim() && !isProcessing) processInput(text.trim());
      });
    }
  }, [isProcessing]);

  const processInput = async (input: string, imagePath?: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), text: input, isUser: true, timestamp: Date.now() }]);
    setIsProcessing(true);
    const result = await runTriageCycle(input, imagePath);
    setIsProcessing(false);

    if (result) {
      const responseText = result.classification;
      if (result.followUp?.includes('🚨')) {
        setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), text: result.followUp, isUser: false, timestamp: Date.now() }]);
      }
      let badges = '';
      if (result.reasoning?.includes('✓')) {
        const b = result.reasoning.split(' | ').map((t: string) => {
          if (t.includes('save_vital')) return '❤️';
          if (t.includes('save_medication')) return '💊';
          if (t.includes('schedule_reminder')) return '⏰';
          if (t.includes('save_condition')) return '🏥';
          if (t.includes('save_lab')) return '🧪';
          if (t.includes('log_adherence')) return '✅';
          return '';
        }).filter(Boolean);
        if (b.length) badges = '  ' + b.join(' ');
      }
      setMessages(prev => [...prev, { id: (Date.now() + 2).toString(), text: responseText + badges, isUser: false, timestamp: Date.now() }]);
      speakMalayalam(responseText);
    } else if (error) {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), text: `⚠️ ${error}`, isUser: false, timestamp: Date.now() }]);
    }
  };

  const speakMalayalam = (text: string) => {
    try {
      Tts.setDefaultLanguage('ml-IN');
      Tts.setDefaultRate(0.5);
      Tts.removeAllListeners('tts-finish');
      Tts.addEventListener('tts-finish', () => { if (voiceMode) setTimeout(() => startVoice(), 800); });
      const clean = text.replace(/[\*\#\-\•\[\]{}]/g, '').replace(/[^\u0D00-\u0D7F\u0020-\u007Ea-zA-Z0-9\n.,!?:;()°%\/]/g, '').replace(/\n+/g, '. ').replace(/\s+/g, ' ').trim();
      if (clean) Tts.speak(clean);
    } catch {}
  };

  const handleMicPress = async () => {
    if (voiceMode) { setVoiceMode(false); if (_setVoiceMode) _setVoiceMode(false); Tts.stop(); stopVoice(); Tts.removeAllListeners('tts-finish'); }
    else if (isListening) { stopVoice(); }
    else { await startVoice(); }
  };

  const handleMicLongPress = async () => {
    if (voiceMode) return;
    setVoiceMode(true);
    if (_setVoiceMode) _setVoiceMode(true);
    await startVoice();
  };

  const handleSend = () => {
    if (textInput.trim() && !isProcessing) {
      const text = textInput.trim();
      const img = pendingImage;
      setTextInput('');
      setPendingImage(null);
      processInput(text, img || undefined);
    }
  };

  const handleCamera = async () => {
    if (Platform.OS === 'android') { const g = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA); if (g !== PermissionsAndroid.RESULTS.GRANTED) return; }
    try {
      const r = await launchCamera({ mediaType: 'photo', maxWidth: 256, maxHeight: 256, quality: 0.3 });
      if (r.didCancel || r.errorCode) return;
      if (r.assets?.[0]?.uri) {
        setPendingImage(r.assets[0].uri);
        setMessages(prev => [...prev, { id: Date.now().toString(), text: '📷', isUser: true, timestamp: Date.now(), imagePath: r.assets![0].uri }]);
        setMessages(prev => [...prev, { id: (Date.now()+1).toString(), text: 'ചിത്രം ചേർത്തു. എന്ത് ചെയ്യണം?', isUser: false, timestamp: Date.now() }]);
      }
    } catch {}
  };

  const showStatus = isListening || (agentState !== 'ready' && agentState !== 'idle');

  return (
    <View style={[s.root, { paddingBottom: insets.bottom }]}>
      {/* Status indicator */}
      {showStatus && (
        <View style={[s.statusBar, isListening && s.statusListening]}>
          {!isListening && <ActivityIndicator size="small" color="#0D7C66" />}
          <Text style={s.statusText}>
            {isListening ? '● Listening...' : agentState === 'thinking' ? 'Thinking...' : agentState === 'calling_tool' ? 'Processing...' : 'Generating...'}
          </Text>
          {isListening && transcription ? <Text style={s.liveText}>{transcription}</Text> : null}
        </View>
      )}

      {/* Messages */}
      <ScrollView ref={scrollRef} style={s.chatArea} contentContainerStyle={s.chatContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd()} keyboardShouldPersistTaps="handled">
        {messages.map(msg => (
          <View key={msg.id} style={msg.isUser ? s.userRow : s.agentRow}>
            {!msg.isUser && <View style={s.avatarCircle}><Text style={s.avatarText}>🤝</Text></View>}
            <View style={[s.bubble, msg.isUser ? s.userBubble : s.agentBubble]}>
              {msg.imagePath && <Image source={{ uri: msg.imagePath }} style={s.msgImage} />}
              {msg.text !== '📷' && <Text style={[s.msgText, msg.isUser && s.userMsgText]}>{msg.text}</Text>}
            </View>
          </View>
        ))}
        {isProcessing && (
          <View style={s.agentRow}>
            <View style={s.avatarCircle}><Text style={s.avatarText}>🤝</Text></View>
            <View style={[s.bubble, s.agentBubble]}>
              {completion && !completion.includes('"name"') ? <Text style={s.msgText}>{completion}▌</Text> : <ActivityIndicator size="small" color="#0D7C66" />}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={s.inputContainer}>
        {pendingImage && <View style={s.attachBadge}><Text style={s.attachText}>📎 Image attached</Text></View>}
        <View style={s.inputRow}>
          <TextInput style={s.input} placeholder="Message Thuna..." placeholderTextColor="#B0B0B0" value={textInput} onChangeText={setTextInput} onSubmitEditing={handleSend} editable={!isProcessing && !isListening} />
          {textInput.trim() ? (
            <TouchableOpacity style={s.sendBtn} onPress={handleSend}><Text style={s.btnEmoji}>↑</Text></TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.micBtn, isListening && s.micActive, voiceMode && s.micVoice]} onPress={handleMicPress} onLongPress={handleMicLongPress} disabled={isProcessing}>
              <Text style={s.btnEmoji}>{voiceMode ? '●' : isListening ? '■' : '🎤'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.camBtn} onPress={handleCamera} disabled={isProcessing || isListening}>
            <Text style={s.btnEmoji}>📷</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFBFC' },
  // Status
  statusBar: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#F0FDF4', flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusListening: { backgroundColor: '#FEF2F2' },
  statusText: { fontSize: 14, fontWeight: '500', color: '#0D7C66' },
  liveText: { fontSize: 15, color: '#374151', fontStyle: 'italic', marginTop: 2 },
  // Chat
  chatArea: { flex: 1 },
  chatContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 },
  agentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 10 },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  avatarText: { fontSize: 18 },
  bubble: { maxWidth: '78%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  userBubble: { backgroundColor: '#0D7C66', borderBottomRightRadius: 6 },
  agentBubble: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 6, borderWidth: 1, borderColor: '#F0F0F0' },
  msgText: { fontSize: 16, lineHeight: 24, color: '#1F2937', letterSpacing: 0.2 },
  userMsgText: { color: '#FFFFFF' },
  msgImage: { width: 160, height: 160, borderRadius: 12, marginBottom: 6 },
  // Input
  inputContainer: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  attachBadge: { backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginBottom: 6, alignSelf: 'flex-start' },
  attachText: { fontSize: 12, color: '#0D7C66' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, height: 48, backgroundColor: '#F5F7FA', borderRadius: 24, paddingHorizontal: 20, fontSize: 16, color: '#1F2937' },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#0D7C66', alignItems: 'center', justifyContent: 'center' },
  micBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center' },
  micActive: { backgroundColor: '#FEE2E2' },
  micVoice: { backgroundColor: '#FEF3C7' },
  camBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center' },
  btnEmoji: { fontSize: 20 },
});
