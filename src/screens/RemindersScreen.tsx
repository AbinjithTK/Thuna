import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Switch, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useUser } from '../context/UserContext';
import { database, Reminder } from '../db';
import { Q } from '@nozbe/watermelondb';
import Tts from 'react-native-tts';

// Notifee may not be available — safe import
let notifee: any = null;
let TriggerType: any = {};
let RepeatFrequency: any = {};
try {
  const n = require('@notifee/react-native');
  notifee = n.default;
  TriggerType = n.TriggerType;
  RepeatFrequency = n.RepeatFrequency;
} catch {}

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ReminderItem {
  id: string;
  dbId: string; // WatermelonDB record ID
  title: string;
  description: string;
  type: string;
  times: string[];
  isActive: boolean;
  ttsMessage: string;
  createdAt: number;
}

const TYPES = [
  { id: 'medication', label: 'Medicine', icon: '◉', color: '#0D7C66' },
  { id: 'appointment', label: 'Appointment', icon: '◎', color: '#3B82F6' },
  { id: 'vitals', label: 'Vitals', icon: '♡', color: '#EF4444' },
  { id: 'exercise', label: 'Exercise', icon: '△', color: '#F59E0B' },
  { id: 'water', label: 'Water', icon: '○', color: '#06B6D4' },
  { id: 'custom', label: 'Custom', icon: '☆', color: '#8B5CF6' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Notification Scheduling
// ═══════════════════════════════════════════════════════════════════════════

async function scheduleNotification(reminder: ReminderItem) {
  if (!notifee) return; // Notifee not available
  try {
    const channelId = await notifee.createChannel({
      id: 'thuna-reminders',
      name: 'Thuna Reminders',
      sound: 'default',
      importance: 4,
    });

    for (const timeStr of reminder.times) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const now = new Date();
      const trigger = new Date();
      trigger.setHours(hours, minutes, 0, 0);
      if (trigger.getTime() <= now.getTime()) {
        trigger.setDate(trigger.getDate() + 1);
      }

      await notifee.createTriggerNotification(
        {
          id: `${reminder.id}_${timeStr}`,
          title: `💊 ${reminder.title}`,
          body: reminder.ttsMessage || `${reminder.title} — സമയമായി`,
          android: { channelId, pressAction: { id: 'default' } },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: trigger.getTime(),
          repeatFrequency: RepeatFrequency.DAILY,
        },
      );
    }
  } catch (e) {
    console.warn('Notification scheduling failed:', e);
  }
}

async function cancelNotification(reminderId: string, times: string[]) {
  if (!notifee) return;
  try {
    for (const timeStr of times) {
      await notifee.cancelNotification(`${reminderId}_${timeStr}`);
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
// Screen
// ═══════════════════════════════════════════════════════════════════════════

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser } = useUser();
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ReminderItem | null>(null);

  // Form state
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fType, setFType] = useState('medication');
  const [fTimes, setFTimes] = useState<string[]>(['08:00']);
  const [fNewTime, setFNewTime] = useState('');
  const [fTTS, setFTTS] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReminders();
    setRefreshing(false);
  }, [currentUser]);

  // Reload EVERY time this tab gets focus — increment key to force fresh query
  useFocusEffect(
    useCallback(() => {
      setRefreshKey(k => k + 1);
    }, [])
  );

  // Actually load when refreshKey changes
  React.useEffect(() => {
    loadReminders();
  }, [refreshKey, currentUser]);

  // ── Load from WatermelonDB (fresh query every time) ──
  const loadReminders = async () => {
    try {
      const dbReminders = await database.get<Reminder>('reminders')
        .query(Q.sortBy('created_at', Q.desc))
        .fetch();

      const items: ReminderItem[] = dbReminders.map(r => {
        let times: string[] = ['08:00'];
        try { times = JSON.parse(r.timeSlots); } catch { times = [r.timeSlots || '08:00']; }
        return {
          id: r.reminderId,
          dbId: r.id,
          title: r.medication || 'Reminder',
          description: r.dosage || '',
          type: r.reminderType || 'medication',
          times,
          isActive: r.isActive,
          ttsMessage: r.ttsMessage || `${r.medication} കഴിക്കാൻ സമയമായി`,
          createdAt: r.createdAt,
        };
      });
      setReminders(items);
    } catch (e) {
      console.warn('Load reminders error:', e);
    }
  };

  // ── Save new reminder to WatermelonDB ──
  const handleSave = async () => {
    if (!fTitle.trim()) return;
    const patientId = currentUser?.id || 'default';
    const tts = fTTS.trim() || `${fTitle} ${fDesc} — കഴിക്കാൻ സമയമായി`;
    const reminderId = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      if (editing) {
        // Update existing
        const records = await database.get<Reminder>('reminders')
          .query(Q.where('reminder_id', editing.id)).fetch();
        if (records.length > 0) {
          await database.write(async () => {
            await records[0].update((r: any) => {
              r.medication = fTitle.trim();
              r.dosage = fDesc.trim();
              r.reminderType = fType;
              r.timeSlots = JSON.stringify(fTimes);
              r.ttsMessage = tts;
            });
          });
          // Reschedule notification
          await cancelNotification(editing.id, editing.times);
          await scheduleNotification({ ...editing, title: fTitle.trim(), times: fTimes, ttsMessage: tts });
        }
      } else {
        // Create new
        await database.write(async () => {
          await database.get<Reminder>('reminders').create((r: any) => {
            r.reminderId = reminderId;
            r.patientId = patientId;
            r.reminderType = fType;
            r.medication = fTitle.trim();
            r.dosage = fDesc.trim();
            r.timeSlots = JSON.stringify(fTimes);
            r.startDate = new Date().toISOString().split('T')[0];
            r.endDate = '';
            r.ttsMessage = tts;
            r.isActive = true;
            r.createdAt = Date.now();
          });
        });
        // Schedule notification
        await scheduleNotification({ id: reminderId, dbId: '', title: fTitle.trim(), description: fDesc.trim(), type: fType, times: fTimes, isActive: true, ttsMessage: tts, createdAt: Date.now() });
      }
      closeModal();
      loadReminders();
    } catch (e) {
      console.warn('Save reminder error:', e);
    }
  };

  // ── Delete ──
  const handleDelete = (item: ReminderItem) => {
    Alert.alert('Delete?', `Remove "${item.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const records = await database.get<Reminder>('reminders')
            .query(Q.where('reminder_id', item.id)).fetch();
          if (records.length > 0) {
            await database.write(async () => { await records[0].destroyPermanently(); });
          }
          await cancelNotification(item.id, item.times);
          loadReminders();
        } catch {}
      }},
    ]);
  };

  // ── Toggle active ──
  const toggleActive = async (id: string) => {
    try {
      const item = reminders.find(r => r.id === id);
      if (!item) return;
      const records = await database.get<Reminder>('reminders')
        .query(Q.where('reminder_id', id)).fetch();
      if (records.length > 0) {
        const newActive = !item.isActive;
        await database.write(async () => {
          await records[0].update((r: any) => { r.isActive = newActive; });
        });
        if (newActive) {
          await scheduleNotification(item);
        } else {
          await cancelNotification(id, item.times);
        }
        loadReminders();
      }
    } catch {}
  };

  // ── Edit ──
  const openEdit = (item: ReminderItem) => {
    setEditing(item);
    setFTitle(item.title);
    setFDesc(item.description);
    setFType(item.type);
    setFTimes(item.times);
    setFTTS(item.ttsMessage);
    setShowModal(true);
  };

  const openAdd = () => {
    setEditing(null);
    setFTitle(''); setFDesc(''); setFType('medication');
    setFTimes(['08:00']); setFTTS(''); setFNewTime('');
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditing(null); };

  const addTime = () => {
    const t = fNewTime.trim();
    if (t && /^\d{1,2}:\d{2}$/.test(t) && !fTimes.includes(t)) {
      setFTimes([...fTimes, t].sort());
      setFNewTime('');
    }
  };

  const removeTime = (t: string) => setFTimes(fTimes.filter(x => x !== t));

  const playTTS = (msg: string) => {
    Tts.setDefaultLanguage('ml-IN');
    Tts.setDefaultRate(0.5);
    Tts.speak(msg);
  };

  const activeRems = reminders.filter(r => r.isActive);
  const inactiveRems = reminders.filter(r => !r.isActive);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.header}>
        <View>
          <Text style={st.title}>Reminders</Text>
          <Text style={st.count}>{activeRems.length} active</Text>
        </View>
        <TouchableOpacity style={st.addBtn} onPress={openAdd}>
          <Text style={st.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <ScrollView style={st.list} contentContainerStyle={st.listInner} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0D7C66']} />}>
        {activeRems.length === 0 && inactiveRems.length === 0 && (
          <View style={st.empty}>
            <Text style={st.emptyIcon}>☆</Text>
            <Text style={st.emptyTitle}>No reminders</Text>
            <Text style={st.emptyText}>Tap + New or tell Thuna in chat</Text>
          </View>
        )}

        {activeRems.map(rem => <ReminderCard key={rem.id} item={rem} onEdit={openEdit} onDelete={handleDelete} onToggle={toggleActive} onPlay={playTTS} />)}

        {inactiveRems.length > 0 && (
          <>
            <Text style={st.sectionLabel}>Inactive</Text>
            {inactiveRems.map(rem => <ReminderCard key={rem.id} item={rem} onEdit={openEdit} onDelete={handleDelete} onToggle={toggleActive} onPlay={playTTS} />)}
          </>
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={st.overlay}>
          <ScrollView style={st.modal} contentContainerStyle={st.modalInner} keyboardShouldPersistTaps="handled">
            <View style={st.modalHead}>
              <Text style={st.modalTitle}>{editing ? 'Edit' : 'New Reminder'}</Text>
              <TouchableOpacity onPress={closeModal}><Text style={st.closeBtn}>✕</Text></TouchableOpacity>
            </View>

            {/* Type */}
            <Text style={st.label}>Type</Text>
            <View style={st.typeGrid}>
              {TYPES.map(t => (
                <TouchableOpacity key={t.id} style={[st.typeItem, fType === t.id && { backgroundColor: t.color + '15', borderColor: t.color }]} onPress={() => setFType(t.id)}>
                  <Text style={[st.typeItemIcon, { color: t.color }]}>{t.icon}</Text>
                  <Text style={[st.typeItemLabel, fType === t.id && { color: t.color }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Title */}
            <Text style={st.label}>Medicine / Title</Text>
            <TextInput style={st.input} placeholder="What to remind?" value={fTitle} onChangeText={setFTitle} />

            {/* Description */}
            <Text style={st.label}>Dosage / Details</Text>
            <TextInput style={st.input} placeholder="e.g. 500mg (optional)" value={fDesc} onChangeText={setFDesc} />

            {/* Times */}
            <Text style={st.label}>Times</Text>
            <View style={st.timesWrap}>
              {fTimes.map(t => (
                <View key={t} style={st.timeTag}>
                  <Text style={st.timeTagText}>{t}</Text>
                  <TouchableOpacity onPress={() => removeTime(t)}><Text style={st.timeTagX}>✕</Text></TouchableOpacity>
                </View>
              ))}
            </View>
            <View style={st.addTimeRow}>
              <TextInput style={st.timeInput} placeholder="HH:MM (e.g. 14:30)" value={fNewTime} onChangeText={setFNewTime} keyboardType="numbers-and-punctuation" />
              <TouchableOpacity style={st.addTimeBtn} onPress={addTime}><Text style={st.addTimeBtnText}>Add</Text></TouchableOpacity>
            </View>

            {/* TTS Message */}
            <Text style={st.label}>Voice Message (Malayalam)</Text>
            <TextInput style={st.input} placeholder="Auto-generated if empty" value={fTTS} onChangeText={setFTTS} />
            {fTTS ? <TouchableOpacity onPress={() => playTTS(fTTS)} style={st.previewBtn}><Text style={st.previewText}>▶ Preview</Text></TouchableOpacity> : null}

            {/* Save */}
            <TouchableOpacity style={[st.saveBtn, !fTitle.trim() && st.saveBtnOff]} onPress={handleSave} disabled={!fTitle.trim()}>
              <Text style={st.saveBtnText}>{editing ? 'Update' : 'Save'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Card Component
// ═══════════════════════════════════════════════════════════════════════════

function ReminderCard({ item, onEdit, onDelete, onToggle, onPlay }: {
  item: ReminderItem; onEdit: (i: ReminderItem) => void; onDelete: (i: ReminderItem) => void;
  onToggle: (id: string) => void; onPlay: (msg: string) => void;
}) {
  const typeConfig = TYPES.find(t => t.id === item.type) || TYPES[5];

  return (
    <View style={[st.card, !item.isActive && st.cardInactive]}>
      <View style={st.cardRow}>
        <View style={[st.cardIconWrap, { backgroundColor: typeConfig.color + '15' }]}>
          <Text style={[st.cardIconText, { color: typeConfig.color }]}>{typeConfig.icon}</Text>
        </View>
        <View style={st.cardBody}>
          <Text style={st.cardTitle}>{item.title}</Text>
          {item.description ? <Text style={st.cardDesc}>{item.description}</Text> : null}
          <View style={st.cardMeta}>
            <Text style={st.cardMetaText}>{item.times.join(', ')} • Daily</Text>
          </View>
        </View>
        <Switch value={item.isActive} onValueChange={() => onToggle(item.id)} trackColor={{ true: '#0D7C66', false: '#E5E7EB' }} thumbColor="#fff" />
      </View>
      <View style={st.cardBottom}>
        <TouchableOpacity onPress={() => onPlay(item.ttsMessage)} style={st.cardBtn}><Text style={st.cardBtnText}>▶ Play</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => onEdit(item)} style={st.cardBtn}><Text style={st.cardBtnText}>✎ Edit</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(item)} style={[st.cardBtn, st.cardBtnDanger]}><Text style={[st.cardBtnText, st.cardBtnDangerText]}>✕ Remove</Text></TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFBFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  count: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  addBtn: { backgroundColor: '#0D7C66', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
  addBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  list: { flex: 1 },
  listInner: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, color: '#D1D5DB' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#6B7280', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  cardInactive: { opacity: 0.5 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardIconText: { fontSize: 22 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  cardDesc: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  cardMeta: { marginTop: 4 },
  cardMetaText: { fontSize: 12, color: '#9CA3AF' },
  cardBottom: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  cardBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F5F7FA' },
  cardBtnText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  cardBtnDanger: { backgroundColor: '#FEF2F2' },
  cardBtnDangerText: { color: '#EF4444' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalInner: { padding: 24, paddingBottom: 40 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  closeBtn: { fontSize: 22, color: '#9CA3AF', padding: 4 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 18, marginBottom: 8 },
  input: { height: 50, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 16, fontSize: 16, color: '#111827', backgroundColor: '#FAFBFC' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB' },
  typeItemIcon: { fontSize: 16 },
  typeItemLabel: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  timesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeTag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  timeTagText: { fontSize: 15, fontWeight: '600', color: '#0D7C66' },
  timeTagX: { fontSize: 14, color: '#6B7280' },
  addTimeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  timeInput: { flex: 1, height: 44, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: '#111827' },
  addTimeBtn: { paddingHorizontal: 18, height: 44, borderRadius: 12, backgroundColor: '#0D7C66', alignItems: 'center', justifyContent: 'center' },
  addTimeBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  previewBtn: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F0FDF4' },
  previewText: { fontSize: 13, color: '#0D7C66', fontWeight: '500' },
  saveBtn: { marginTop: 28, height: 56, borderRadius: 28, backgroundColor: '#0D7C66', alignItems: 'center', justifyContent: 'center' },
  saveBtnOff: { backgroundColor: '#D1D5DB' },
  saveBtnText: { fontSize: 18, fontWeight: '700', color: '#fff' },
});
