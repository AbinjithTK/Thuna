import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ProfileData {
  name: string;
  age: string;
  gender: string;
  village: string;
  bloodGroup: string;
  conditions: Array<{ name: string; date: string; status: string }>;
  medications: Array<{ name: string; dosage: string; frequency: string; active: boolean }>;
  timeline: Array<{ date: string; event: string; type: string }>;
}

export default function ProfileScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'overview' | 'conditions' | 'timeline'>('overview');

  // Mock data — in production this comes from WatermelonDB
  const profile: ProfileData = {
    name: route?.params?.patientData?.name || 'Patient',
    age: route?.params?.patientData?.age || '',
    gender: route?.params?.patientData?.gender || '',
    village: route?.params?.patientData?.village || '',
    bloodGroup: route?.params?.patientData?.bloodGroup || '',
    conditions: [
      { name: 'Type 2 Diabetes', date: '2024-03-15', status: 'chronic' },
      { name: 'Hypertension', date: '2023-11-20', status: 'active' },
    ],
    medications: [
      { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily', active: true },
      { name: 'Amlodipine', dosage: '5mg', frequency: 'Once daily', active: true },
      { name: 'Paracetamol', dosage: '650mg', frequency: 'When needed', active: false },
    ],
    timeline: [
      { date: '2026-05-15', event: 'BP checked: 130/85', type: 'vital' },
      { date: '2026-05-14', event: 'Metformin 500mg prescribed', type: 'medication' },
      { date: '2026-05-12', event: 'Fever reported, Paracetamol given', type: 'visit' },
      { date: '2026-05-10', event: 'Blood sugar: 145 mg/dL', type: 'vital' },
      { date: '2026-05-05', event: 'Routine checkup — stable', type: 'visit' },
    ],
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Patient header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.details}>
            {profile.age} വയസ്സ് • {profile.gender} • {profile.bloodGroup}
          </Text>
          <Text style={styles.village}>📍 {profile.village}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['overview', 'conditions', 'timeline'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'overview' ? '📋 Overview' : tab === 'conditions' ? '🏥 Conditions' : '📅 Timeline'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {activeTab === 'overview' && (
          <>
            {/* Active medications */}
            <Text style={styles.sectionTitle}>💊 Active Medications</Text>
            {profile.medications.filter(m => m.active).map((med, i) => (
              <View key={i} style={styles.card}>
                <Text style={styles.cardTitle}>{med.name}</Text>
                <Text style={styles.cardSub}>{med.dosage} — {med.frequency}</Text>
              </View>
            ))}

            {/* Quick stats */}
            <Text style={styles.sectionTitle}>📊 Quick Stats</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{profile.conditions.length}</Text>
                <Text style={styles.statLabel}>Conditions</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{profile.medications.filter(m => m.active).length}</Text>
                <Text style={styles.statLabel}>Active Meds</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{profile.timeline.length}</Text>
                <Text style={styles.statLabel}>Records</Text>
              </View>
            </View>
          </>
        )}

        {activeTab === 'conditions' && (
          <>
            <Text style={styles.sectionTitle}>🏥 Medical Conditions</Text>
            {profile.conditions.map((cond, i) => (
              <View key={i} style={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardTitle}>{cond.name}</Text>
                  <View style={[styles.statusBadge, cond.status === 'chronic' ? styles.badgeChronic : styles.badgeActive]}>
                    <Text style={styles.statusText}>{cond.status}</Text>
                  </View>
                </View>
                <Text style={styles.cardSub}>Diagnosed: {cond.date}</Text>
              </View>
            ))}
          </>
        )}

        {activeTab === 'timeline' && (
          <>
            <Text style={styles.sectionTitle}>📅 Health Timeline</Text>
            {profile.timeline.map((entry, i) => (
              <View key={i} style={styles.timelineItem}>
                <View style={styles.timelineDot}>
                  <Text>{entry.type === 'vital' ? '❤️' : entry.type === 'medication' ? '💊' : '🩺'}</Text>
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineDate}>{entry.date}</Text>
                  <Text style={styles.timelineEvent}>{entry.event}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: '#1B5E20' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: 'bold', color: '#1B5E20' },
  headerInfo: { marginLeft: 16, flex: 1 },
  name: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  details: { fontSize: 14, color: '#C8E6C9', marginTop: 4 },
  village: { fontSize: 13, color: '#A5D6A7', marginTop: 2 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#1B5E20' },
  tabText: { fontSize: 13, color: '#666' },
  tabTextActive: { color: '#1B5E20', fontWeight: '700' },
  content: { flex: 1 },
  contentInner: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 12, marginTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10, elevation: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#222' },
  cardSub: { fontSize: 14, color: '#666', marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeChronic: { backgroundColor: '#FFF3E0' },
  badgeActive: { backgroundColor: '#E8F5E9' },
  statusText: { fontSize: 11, fontWeight: '600', color: '#333' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', elevation: 2 },
  statNumber: { fontSize: 28, fontWeight: 'bold', color: '#1B5E20' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 4 },
  timelineItem: { flexDirection: 'row', marginBottom: 16 },
  timelineDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  timelineContent: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 1 },
  timelineDate: { fontSize: 12, color: '#888' },
  timelineEvent: { fontSize: 15, color: '#333', marginTop: 4 },
});
