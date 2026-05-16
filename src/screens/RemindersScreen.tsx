import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Tts from 'react-native-tts';

interface MedReminder {
  id: string;
  name: string;
  dosage: string;
  time: string;
  period: string;
  status: 'pending' | 'taken' | 'missed';
}

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const [reminders, setReminders] = useState<MedReminder[]>([
    { id: '1', name: 'Metformin', dosage: '500mg', time: '8:00 AM', period: 'Morning', status: 'pending' },
    { id: '2', name: 'Amlodipine', dosage: '5mg', time: '8:00 AM', period: 'Morning', status: 'taken' },
    { id: '3', name: 'Metformin', dosage: '500mg', time: '8:00 PM', period: 'Evening', status: 'pending' },
  ]);

  const markStatus = (id: string, status: 'taken' | 'missed') => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const previewSound = (name: string, dosage: string) => {
    Tts.setDefaultLanguage('ml-IN');
    Tts.setDefaultRate(0.5);
    Tts.speak(`${name} ${dosage} കഴിക്കാൻ സമയമായി`);
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const morningMeds = reminders.filter(r => r.period === 'Morning');
  const eveningMeds = reminders.filter(r => r.period === 'Evening');

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Medications</Text>
        <Text style={s.headerDate}>{dateStr}</Text>
      </View>

      <ScrollView style={s.content} contentContainerStyle={s.contentInner}>
        {/* Morning section */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionIcon}>🌅</Text>
            <Text style={s.sectionTitle}>Morning</Text>
            <Text style={s.sectionTime}>8:00 AM</Text>
          </View>

          {morningMeds.map(med => (
            <View key={med.id} style={s.medCard}>
              <View style={s.medInfo}>
                <Text style={s.medName}>{med.name}</Text>
                <Text style={s.medDosage}>{med.dosage}</Text>
              </View>
              {med.status === 'pending' ? (
                <View style={s.actionRow}>
                  <TouchableOpacity style={s.missedBtn} onPress={() => markStatus(med.id, 'missed')}>
                    <Text style={s.missedIcon}>✕</Text>
                    <Text style={s.missedLabel}>Missed</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.takenBtn} onPress={() => markStatus(med.id, 'taken')}>
                    <Text style={s.takenIcon}>✓</Text>
                    <Text style={s.takenLabel}>Taken</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[s.statusBadge, med.status === 'taken' ? s.takenBadge : s.missedBadge]}>
                  <Text style={s.statusBadgeText}>{med.status === 'taken' ? '✓ Taken' : '✕ Missed'}</Text>
                </View>
              )}
              <TouchableOpacity style={s.soundBtn} onPress={() => previewSound(med.name, med.dosage)}>
                <Text style={s.soundIcon}>🔊</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Evening section */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionIcon}>🌆</Text>
            <Text style={s.sectionTitle}>Evening</Text>
            <Text style={s.sectionTime}>8:00 PM</Text>
          </View>

          {eveningMeds.map(med => (
            <View key={med.id} style={s.medCard}>
              <View style={s.medInfo}>
                <Text style={s.medName}>{med.name}</Text>
                <Text style={s.medDosage}>{med.dosage}</Text>
              </View>
              {med.status === 'pending' ? (
                <View style={s.actionRow}>
                  <TouchableOpacity style={s.missedBtn} onPress={() => markStatus(med.id, 'missed')}>
                    <Text style={s.missedIcon}>✕</Text>
                    <Text style={s.missedLabel}>Missed</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.takenBtn} onPress={() => markStatus(med.id, 'taken')}>
                    <Text style={s.takenIcon}>✓</Text>
                    <Text style={s.takenLabel}>Taken</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[s.statusBadge, med.status === 'taken' ? s.takenBadge : s.missedBadge]}>
                  <Text style={s.statusBadgeText}>{med.status === 'taken' ? '✓ Taken' : '✕ Missed'}</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Info */}
        <View style={s.infoCard}>
          <Text style={s.infoText}>💡 Chat-ൽ മരുന്ന് പറഞ്ഞാൽ Thuna automatic ആയി reminder set ചെയ്യും</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFBFC' },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 32, fontWeight: '700', color: '#111827', letterSpacing: -0.5 },
  headerDate: { fontSize: 15, color: '#6B7280', marginTop: 4 },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 20, paddingBottom: 40 },
  // Section
  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionIcon: { fontSize: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#374151', flex: 1 },
  sectionTime: { fontSize: 14, color: '#9CA3AF' },
  // Med card
  medCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  medInfo: { marginBottom: 16 },
  medName: { fontSize: 20, fontWeight: '600', color: '#111827' },
  medDosage: { fontSize: 15, color: '#6B7280', marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 12 },
  missedBtn: { flex: 1, height: 56, borderRadius: 28, borderWidth: 2, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  missedIcon: { fontSize: 18, color: '#6B7280', fontWeight: '700' },
  missedLabel: { fontSize: 16, color: '#6B7280', fontWeight: '500' },
  takenBtn: { flex: 1, height: 56, borderRadius: 28, backgroundColor: '#0D7C66', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  takenIcon: { fontSize: 18, color: '#FFFFFF', fontWeight: '700' },
  takenLabel: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  takenBadge: { backgroundColor: '#F0FDF4' },
  missedBadge: { backgroundColor: '#FEF2F2' },
  statusBadgeText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  soundBtn: { position: 'absolute', top: 16, right: 16 },
  soundIcon: { fontSize: 20 },
  // Info
  infoCard: { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 16, marginTop: 8 },
  infoText: { fontSize: 14, color: '#065F46', lineHeight: 20 },
});
