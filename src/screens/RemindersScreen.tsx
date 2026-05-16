import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../context/UserContext';
import { database, Reminder, AdherenceLog, Medication } from '../db';
import { Q } from '@nozbe/watermelondb';
import Tts from 'react-native-tts';

// ═══════════════════════════════════════════════════════════════════════════
// Date helpers
// ═══════════════════════════════════════════════════════════════════════════

function getWeekDates(baseDate: Date): Array<{ date: Date; dayName: string; dayNum: number; isToday: boolean }> {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get Monday of the current week
  const monday = new Date(baseDate);
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  monday.setDate(diff);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    d.setHours(0, 0, 0, 0);
    days.push({
      date: d,
      dayName: dayNames[i],
      dayNum: d.getDate(),
      isToday: d.getTime() === today.getTime(),
    });
  }
  return days;
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface MedSlot {
  id: string;
  medication: string;
  dosage: string;
  time: string;
  period: 'morning' | 'afternoon' | 'evening';
  status: 'pending' | 'taken' | 'missed' | 'upcoming';
  reminderId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser } = useUser();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekDates, setWeekDates] = useState(getWeekDates(new Date()));
  const [medSlots, setMedSlots] = useState<MedSlot[]>([]);
  const [adherenceMap, setAdherenceMap] = useState<Record<string, string>>({});

  // Load reminders from database
  useEffect(() => {
    loadReminders();
  }, [selectedDate, currentUser]);

  const loadReminders = async () => {
    if (!currentUser) return;

    try {
      const reminders = await database
        .get<Reminder>('reminders')
        .query(Q.where('patient_id', currentUser.id), Q.where('is_active', true))
        .fetch();

      const dateStr = selectedDate.toISOString().split('T')[0];
      const now = new Date();
      const currentHour = now.getHours();

      // Build medication slots from reminders
      const slots: MedSlot[] = [];
      reminders.forEach(rem => {
        try {
          const times: string[] = JSON.parse(rem.timeSlots);
          times.forEach((time, idx) => {
            const hour = parseInt(time.split(':')[0]);
            let period: 'morning' | 'afternoon' | 'evening' = 'morning';
            if (hour >= 12 && hour < 17) period = 'afternoon';
            else if (hour >= 17) period = 'evening';

            // Determine status
            let status: 'pending' | 'taken' | 'missed' | 'upcoming' = 'pending';
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            if (isToday) {
              if (hour > currentHour) status = 'upcoming';
              else status = 'pending';
            }

            slots.push({
              id: `${rem.reminderId}_${idx}`,
              medication: rem.medication,
              dosage: rem.dosage,
              time,
              period,
              status,
              reminderId: rem.reminderId,
            });
          });
        } catch {}
      });

      // Load adherence for selected date
      const adherenceLogs = await database
        .get<AdherenceLog>('adherence_log')
        .query(Q.where('patient_id', currentUser.id), Q.where('date', dateStr))
        .fetch();

      const aMap: Record<string, string> = {};
      adherenceLogs.forEach(log => {
        aMap[`${log.medicationName}_${log.scheduledTime}`] = log.status;
      });
      setAdherenceMap(aMap);

      // Update slot statuses from adherence
      slots.forEach(slot => {
        const key = `${slot.medication}_${slot.time}`;
        if (aMap[key]) {
          slot.status = aMap[key] as any;
        }
      });

      // Sort by time
      slots.sort((a, b) => a.time.localeCompare(b.time));
      setMedSlots(slots);
    } catch (e) {
      console.warn('Failed to load reminders:', e);
      // Show demo data if DB fails
      setMedSlots([
        { id: '1', medication: 'Metformin', dosage: '500mg', time: '08:00', period: 'morning', status: 'pending', reminderId: 'demo1' },
        { id: '2', medication: 'Amlodipine', dosage: '5mg', time: '08:00', period: 'morning', status: 'taken', reminderId: 'demo2' },
        { id: '3', medication: 'Metformin', dosage: '500mg', time: '20:00', period: 'evening', status: 'upcoming', reminderId: 'demo3' },
      ]);
    }
  };

  // Mark medication as taken/missed
  const markMed = async (slot: MedSlot, status: 'taken' | 'missed') => {
    const dateStr = selectedDate.toISOString().split('T')[0];

    try {
      await database.write(async () => {
        await database.get<AdherenceLog>('adherence_log').create((r: any) => {
          r.patientId = currentUser?.id || 'default';
          r.medicationName = slot.medication;
          r.scheduledTime = slot.time;
          r.takenAt = Date.now();
          r.status = status;
          r.date = dateStr;
        });
      });
    } catch {}

    // Update local state
    setMedSlots(prev => prev.map(s => s.id === slot.id ? { ...s, status } : s));

    // TTS feedback
    if (status === 'taken') {
      Tts.setDefaultLanguage('ml-IN');
      Tts.speak(`${slot.medication} കഴിച്ചു. നന്നായി!`);
    }
  };

  // Preview TTS reminder sound
  const previewTTS = (med: string, dosage: string) => {
    Tts.setDefaultLanguage('ml-IN');
    Tts.setDefaultRate(0.5);
    Tts.speak(`${med} ${dosage} കഴിക്കാൻ സമയമായി. മറക്കരുത്.`);
  };

  // Group by period
  const morningSlots = medSlots.filter(s => s.period === 'morning');
  const afternoonSlots = medSlots.filter(s => s.period === 'afternoon');
  const eveningSlots = medSlots.filter(s => s.period === 'evening');

  const takenCount = medSlots.filter(s => s.status === 'taken').length;
  const totalCount = medSlots.length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Medications</Text>
        <Text style={styles.headerMonth}>{formatMonth(selectedDate)}</Text>
      </View>

      {/* Week calendar strip (Apple Health style) */}
      <View style={styles.calendarStrip}>
        {weekDates.map((d, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.dayCell, d.isToday && styles.dayCellToday, d.date.toDateString() === selectedDate.toDateString() && styles.dayCellSelected]}
            onPress={() => setSelectedDate(d.date)}>
            <Text style={[styles.dayName, d.isToday && styles.dayNameToday]}>{d.dayName}</Text>
            <Text style={[styles.dayNum, d.isToday && styles.dayNumToday, d.date.toDateString() === selectedDate.toDateString() && styles.dayNumSelected]}>
              {d.dayNum}
            </Text>
            {d.isToday && <View style={styles.todayDot} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Progress bar */}
      {totalCount > 0 && (
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(takenCount / totalCount) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{takenCount}/{totalCount} taken</Text>
        </View>
      )}

      {/* Medication list */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {morningSlots.length > 0 && (
          <PeriodSection title="Morning" icon="🌅" time="8:00 AM" slots={morningSlots} onMark={markMed} onPreview={previewTTS} />
        )}
        {afternoonSlots.length > 0 && (
          <PeriodSection title="Afternoon" icon="☀️" time="2:00 PM" slots={afternoonSlots} onMark={markMed} onPreview={previewTTS} />
        )}
        {eveningSlots.length > 0 && (
          <PeriodSection title="Evening" icon="🌙" time="8:00 PM" slots={eveningSlots} onMark={markMed} onPreview={previewTTS} />
        )}

        {medSlots.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💊</Text>
            <Text style={styles.emptyTitle}>No medications scheduled</Text>
            <Text style={styles.emptyText}>Chat-ൽ മരുന്ന് പറഞ്ഞാൽ Thuna automatic ആയി reminder set ചെയ്യും</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Period Section Component
// ═══════════════════════════════════════════════════════════════════════════

function PeriodSection({ title, icon, time, slots, onMark, onPreview }: {
  title: string; icon: string; time: string;
  slots: MedSlot[];
  onMark: (slot: MedSlot, status: 'taken' | 'missed') => void;
  onPreview: (med: string, dosage: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionIcon}>{icon}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionTime}>{time}</Text>
      </View>

      {slots.map(slot => (
        <View key={slot.id} style={styles.medCard}>
          <View style={styles.medTop}>
            <View style={styles.medInfo}>
              <Text style={styles.medName}>{slot.medication}</Text>
              <Text style={styles.medDosage}>{slot.dosage} • {slot.time}</Text>
            </View>
            <TouchableOpacity onPress={() => onPreview(slot.medication, slot.dosage)}>
              <Text style={styles.soundIcon}>🔊</Text>
            </TouchableOpacity>
          </View>

          {slot.status === 'pending' || slot.status === 'upcoming' ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.missedBtn} onPress={() => onMark(slot, 'missed')}>
                <Text style={styles.missedText}>✕ Missed</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.takenBtn} onPress={() => onMark(slot, 'taken')}>
                <Text style={styles.takenText}>✓ Taken</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.statusPill, slot.status === 'taken' ? styles.takenPill : styles.missedPill]}>
              <Text style={styles.statusPillText}>
                {slot.status === 'taken' ? '✓ Taken' : '✕ Missed'}
              </Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFBFC' },
  // Header
  header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 30, fontWeight: '700', color: '#111827', letterSpacing: -0.5 },
  headerMonth: { fontSize: 15, color: '#6B7280', marginTop: 4 },
  // Calendar strip
  calendarStrip: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'space-between' },
  dayCell: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 16, minWidth: 44 },
  dayCellToday: { backgroundColor: '#F0FDF4' },
  dayCellSelected: { backgroundColor: '#0D7C66' },
  dayName: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  dayNameToday: { color: '#0D7C66' },
  dayNum: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 4 },
  dayNumToday: { color: '#0D7C66' },
  dayNumSelected: { color: '#FFFFFF' },
  todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#0D7C66', marginTop: 4 },
  // Progress
  progressSection: { paddingHorizontal: 24, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressBar: { flex: 1, height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#0D7C66', borderRadius: 3 },
  progressText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  // Content
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 20, paddingBottom: 40 },
  // Section
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionIcon: { fontSize: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#374151', flex: 1 },
  sectionTime: { fontSize: 13, color: '#9CA3AF' },
  // Med card
  medCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  medTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  medInfo: { flex: 1 },
  medName: { fontSize: 19, fontWeight: '600', color: '#111827' },
  medDosage: { fontSize: 14, color: '#6B7280', marginTop: 3 },
  soundIcon: { fontSize: 22, padding: 4 },
  // Actions
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  missedBtn: { flex: 1, height: 52, borderRadius: 26, borderWidth: 2, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  missedText: { fontSize: 16, color: '#6B7280', fontWeight: '600' },
  takenBtn: { flex: 1, height: 52, borderRadius: 26, backgroundColor: '#0D7C66', alignItems: 'center', justifyContent: 'center' },
  takenText: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
  // Status pill
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 12 },
  takenPill: { backgroundColor: '#F0FDF4' },
  missedPill: { backgroundColor: '#FEF2F2' },
  statusPillText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
});
