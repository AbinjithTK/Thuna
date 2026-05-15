import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Tts from 'react-native-tts';

interface Reminder {
  id: string;
  medication: string;
  dosage: string;
  times: string[];
  ttsMessage: string;
  active: boolean;
  nextDue: string;
}

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();

  // Mock data — in production from WatermelonDB
  const [reminders, setReminders] = useState<Reminder[]>([
    {
      id: 'rem_1',
      medication: 'Metformin',
      dosage: '500mg',
      times: ['08:00', '20:00'],
      ttsMessage: 'മെറ്റ്ഫോർമിൻ 500mg കഴിക്കാൻ സമയമായി',
      active: true,
      nextDue: '20:00',
    },
    {
      id: 'rem_2',
      medication: 'Amlodipine',
      dosage: '5mg',
      times: ['08:00'],
      ttsMessage: 'അംലോഡിപിൻ 5mg കഴിക്കാൻ സമയമായി',
      active: true,
      nextDue: 'Tomorrow 08:00',
    },
    {
      id: 'rem_3',
      medication: 'Amoxicillin',
      dosage: '500mg',
      times: ['08:00', '14:00', '20:00'],
      ttsMessage: 'അമോക്സിസിലിൻ 500mg കഴിക്കാൻ സമയമായി. ഭക്ഷണത്തിന് ശേഷം കഴിക്കുക.',
      active: false,
      nextDue: 'Course completed',
    },
  ]);

  const toggleReminder = (id: string) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const previewTTS = (message: string) => {
    Tts.setDefaultLanguage('ml-IN');
    Tts.setDefaultRate(0.5);
    Tts.speak(message);
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⏰ Reminders</Text>
        <Text style={styles.headerSub}>മരുന്ന് ഓർമ്മപ്പെടുത്തലുകൾ</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Active reminders */}
        <Text style={styles.sectionTitle}>🔔 Active</Text>
        {reminders.filter(r => r.active).map(rem => (
          <View key={rem.id} style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View>
                <Text style={styles.medName}>{rem.medication}</Text>
                <Text style={styles.medDosage}>{rem.dosage}</Text>
              </View>
              <Switch
                value={rem.active}
                onValueChange={() => toggleReminder(rem.id)}
                trackColor={{ true: '#1B5E20', false: '#ccc' }}
                thumbColor="#fff"
              />
            </View>

            {/* Time slots */}
            <View style={styles.timesRow}>
              {rem.times.map((time, i) => (
                <View key={i} style={styles.timeBadge}>
                  <Text style={styles.timeText}>🕐 {time}</Text>
                </View>
              ))}
            </View>

            {/* Next due */}
            <Text style={styles.nextDue}>Next: {rem.nextDue}</Text>

            {/* TTS preview */}
            <TouchableOpacity style={styles.ttsBtn} onPress={() => previewTTS(rem.ttsMessage)}>
              <Text style={styles.ttsBtnText}>🔊 Preview sound</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Inactive/completed */}
        {reminders.filter(r => !r.active).length > 0 && (
          <>
            <Text style={styles.sectionTitle}>✅ Completed</Text>
            {reminders.filter(r => !r.active).map(rem => (
              <View key={rem.id} style={[styles.reminderCard, styles.cardInactive]}>
                <View style={styles.reminderHeader}>
                  <View>
                    <Text style={[styles.medName, styles.textInactive]}>{rem.medication}</Text>
                    <Text style={styles.medDosage}>{rem.dosage} — {rem.nextDue}</Text>
                  </View>
                  <Switch
                    value={rem.active}
                    onValueChange={() => toggleReminder(rem.id)}
                    trackColor={{ true: '#1B5E20', false: '#ccc' }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            ))}
          </>
        )}

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 Reminders are set automatically when you tell Thuna about new medications.
            Say "Amoxicillin 500mg 3 times daily" and it will create reminders with Malayalam TTS notifications.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { backgroundColor: '#1B5E20', padding: 20, paddingTop: 12 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSub: { fontSize: 14, color: '#A5D6A7', marginTop: 4 },
  content: { flex: 1 },
  contentInner: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 12, marginTop: 8 },
  reminderCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 14, elevation: 3 },
  cardInactive: { opacity: 0.6 },
  reminderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  medName: { fontSize: 20, fontWeight: '700', color: '#222' },
  medDosage: { fontSize: 15, color: '#666', marginTop: 2 },
  textInactive: { textDecorationLine: 'line-through' },
  timesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  timeBadge: { backgroundColor: '#E8F5E9', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  timeText: { fontSize: 15, fontWeight: '600', color: '#1B5E20' },
  nextDue: { fontSize: 13, color: '#888', marginTop: 10 },
  ttsBtn: { marginTop: 12, backgroundColor: '#F5F5F5', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignSelf: 'flex-start' },
  ttsBtnText: { fontSize: 14, color: '#333' },
  infoBox: { backgroundColor: '#E3F2FD', borderRadius: 16, padding: 16, marginTop: 20 },
  infoText: { fontSize: 14, color: '#1565C0', lineHeight: 22 },
});
