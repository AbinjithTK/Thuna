import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, PermissionsAndroid, Platform, Image,
  KeyboardAvoidingView,
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
    startVoice, stopVoice, runTriageCycle, _setOnVoiceResult, _setPatientId,
  } = useCactus();
  const { currentUser } = useUser();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (currentUser && _setPatientId) _setPatientId(currentUser.id);
    return () => { mountedRef.current = false; };
  }, [currentUser]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      text: `${currentUser?.name || ''}, എന്താ വിശേഷം? 😊\n\nആരോഗ്യം, മരുന്ന്, BP/sugar — എന്തും ചോദിക്കാം. അല്ലെങ്കിൽ വെറുതെ സംസാരിക്കാം. ആരെയെങ്കിലും വിളിക്കണോ? ഞാൻ connect ചെയ്യാം.`,
      isUser: false,
      timestamp: Date.now(),
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const lastReminderCheck = useRef('');

  // In-app reminder checker — speaks TTS when a reminder time matches current time
  useEffect(() => {
    const checkReminders = async () => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (currentTime === lastReminderCheck.current) return; // Already checked this minute
      lastReminderCheck.current = currentTime;

      try {
        const { database, Reminder } = require('../db');
        const { Q } = require('@nozbe/watermelondb');
        const reminders = await database.get('reminders').query(Q.where('is_active', true)).fetch();

        for (const rem of reminders) {
          let times: string[] = [];
          try { times = JSON.parse(rem.timeSlots); } catch { continue; }
          if (times.includes(currentTime)) {
            // This reminder is due NOW — speak it and show in chat
            const msg = rem.ttsMessage || `${rem.medication} — സമയമായി`;
            Tts.setDefaultLanguage('ml-IN');
            Tts.setDefaultRate(0.55);
            Tts.speak(msg);
            setMessages(prev => [...prev, {
              id: `rem_${Date.now()}`,
              text: `⏰ ${msg}`,
              isUser: false,
              timestamp: Date.now(),
            }]);
          }
        }
      } catch {}
    };

    const interval = setInterval(checkReminders, 30000); // Check every 30 seconds
    checkReminders(); // Check immediately
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (_setOnVoiceResult) {
      _setOnVoiceResult((text: string) => {
        if (mountedRef.current && text.trim() && !isProcessing) processInput(text.trim());
      });
    }
  }, [isProcessing]);

  const processInput = async (input: string, imagePath?: string) => {
    if (!mountedRef.current) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), text: input, isUser: true, timestamp: Date.now() }]);
    setIsProcessing(true);
    const result = await runTriageCycle(input, imagePath);
    if (!mountedRef.current) return;
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
      Tts.setDefaultRate(0.55);
      const clean = text.replace(/[\*\#\-\•\[\]{}]/g, '').replace(/[^\u0D00-\u0D7F\u0020-\u007Ea-zA-Z0-9\n.,!?:;()°%\/]/g, '').replace(/\n+/g, '. ').replace(/\s+/g, ' ').trim();
      if (clean) Tts.speak(clean);
    } catch {}
  };

  const handleMicPress = async () => {
    if (isListening) {
      stopVoice();
    } else {
      await startVoice();
    }
  };

  const handleMicLongPress = async () => {
    // Disabled — live mode removed for reliability
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
      const r = await launchCamera({ mediaType: 'photo', maxWidth: 512, maxHeight: 512, quality: 0.4 });
      if (r.didCancel || r.errorCode) return;
      if (r.assets?.[0]?.uri) {
        const uri = r.assets[0].uri;
        setPendingImage(uri);
        setMessages(prev => [...prev, { id: Date.now().toString(), text: '📷', isUser: true, timestamp: Date.now(), imagePath: uri }]);
        setMessages(prev => [...prev, {
          id: (Date.now()+1).toString(),
          text: 'ചിത്രം ചേർത്തു.\n\n📋 കുറിപ്പടി സ്കാൻ ചെയ്യാൻ "prescription" എന്ന് ടൈപ്പ് ചെയ്യുക\n🩺 ലക്ഷണം വിവരിക്കാൻ ടൈപ്പ് ചെയ്യുക',
          isUser: false,
          timestamp: Date.now(),
        }]);
      }
    } catch {}
  };

  const showStatus = isListening || (agentState !== 'ready' && agentState !== 'idle');

  return (
    <KeyboardAvoidingView style={[s.root, { paddingBottom: insets.bottom }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {/* Status indicator */}
      {showStatus && (
        <View style={[s.statusBar, isListening && s.statusListening]}>
          {!isListening && <ActivityIndicator size="small" color="#0D7C66" />}
          <Text style={s.statusText}>
            {isListening ? '● കേൾക്കുന്നു...' : agentState === 'thinking' ? '🧠 ചിന്തിക്കുന്നു...' : agentState === 'calling_tool' ? '⚙️ പ്രോസസ്സ്...' : '💬 തയ്യാറാക്കുന്നു...'}
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
        {pendingImage && <View style={s.attachBadge}><Text style={s.attachText}>📎 ചിത്രം ചേർത്തു</Text></View>}

        {/* Quick action chips — elderly-friendly shortcuts */}
        {!isProcessing && !isListening && !textInput.trim() && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsRow} contentContainerStyle={s.chipsContent}>
            <TouchableOpacity style={s.chip} onPress={() => setTextInput('BP ')}>
              <Text style={s.chipText}>❤️ BP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.chip} onPress={() => setTextInput('sugar ')}>
              <Text style={s.chipText}>🩸 ഷുഗർ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.chip} onPress={() => processInput('took medicine')}>
              <Text style={s.chipText}>💊 കഴിച്ചു</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.chip} onPress={() => processInput('my medicines')}>
              <Text style={s.chipText}>📋 മരുന്നുകൾ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.chip} onPress={handleCamera}>
              <Text style={s.chipText}>📷 കുറിപ്പടി</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        <View style={s.inputRow}>
          <TextInput style={s.input} placeholder="തുണയോട് പറയുക..." placeholderTextColor="#B0B0B0" value={textInput} onChangeText={setTextInput} onSubmitEditing={handleSend} editable={!isProcessing && !isListening} />
          {textInput.trim() ? (
            <TouchableOpacity style={s.sendBtn} onPress={handleSend}><Text style={s.btnEmoji}>↑</Text></TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.micBtn, isListening && s.micActive]} onPress={handleMicPress} disabled={isProcessing}>
              <Text style={s.micEmoji}>{isListening ? '■' : '🎤'}</Text>
              <Text style={s.micLabel}>{isListening ? 'നിർത്തുക' : 'പറയുക'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.camBtn} onPress={handleCamera} disabled={isProcessing || isListening}>
            <Text style={s.btnEmoji}>📷</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFBFC' },
  // Status
  statusBar: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#F0FDF4', flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusListening: { backgroundColor: '#FEF2F2' },
  voiceModeBanner: { paddingVertical: 12, paddingHorizontal: 20, backgroundColor: '#D97706', alignItems: 'center' },
  voiceModeText: { fontSize: 14, fontWeight: '600', color: '#fff' },
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
  msgText: { fontSize: 17, lineHeight: 26, color: '#1F2937', letterSpacing: 0.2 },
  userMsgText: { color: '#FFFFFF' },
  msgImage: { width: 160, height: 160, borderRadius: 12, marginBottom: 6 },
  // Input
  inputContainer: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  attachBadge: { backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginBottom: 6, alignSelf: 'flex-start' },
  attachText: { fontSize: 12, color: '#0D7C66' },
  chipsRow: { marginBottom: 8, maxHeight: 40 },
  chipsContent: { paddingHorizontal: 4, gap: 8, flexDirection: 'row' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#D1FAE5' },
  chipText: { fontSize: 14, color: '#065A4A', fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, height: 48, backgroundColor: '#F5F7FA', borderRadius: 24, paddingHorizontal: 20, fontSize: 16, color: '#1F2937' },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#0D7C66', alignItems: 'center', justifyContent: 'center' },
  micBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#0D7C66', alignItems: 'center', justifyContent: 'center' },
  micActive: { backgroundColor: '#DC2626' },
  micVoice: { backgroundColor: '#D97706' },
  micEmoji: { fontSize: 22 },
  micLabel: { fontSize: 9, color: '#fff', marginTop: 1 },
  camBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center' },
  btnEmoji: { fontSize: 20 },
});
