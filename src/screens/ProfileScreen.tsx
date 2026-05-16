import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../context/UserContext';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, logout } = useUser();
  const [tab, setTab] = useState<'overview' | 'timeline'>('overview');

  const conditions = [
    { name: 'Type 2 Diabetes', status: 'Chronic', since: '2024' },
    { name: 'Hypertension', status: 'Active', since: '2023' },
  ];

  const medications = [
    { name: 'Metformin', dosage: '500mg', freq: 'Twice daily' },
    { name: 'Amlodipine', dosage: '5mg', freq: 'Once daily' },
  ];

  const timeline = [
    { date: 'Today', event: 'BP: 128/82 mmHg', icon: '❤️' },
    { date: 'Today', event: 'Sugar: 142 mg/dL (fasting)', icon: '🩸' },
    { date: 'Yesterday', event: 'Metformin taken ✓', icon: '💊' },
    { date: 'May 14', event: 'Paracetamol 650mg prescribed', icon: '📋' },
    { date: 'May 12', event: 'Fever reported — 101°F', icon: '🌡️' },
  ];

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Profile header */}
      <View style={s.profileHeader}>
        <View style={s.avatarLarge}>
          <Text style={s.avatarLetter}>{currentUser?.name?.charAt(0).toUpperCase() || 'U'}</Text>
        </View>
        <View style={s.profileInfo}>
          <Text style={s.profileName}>{currentUser?.name || 'User'}</Text>
          <Text style={s.profileMeta}>{currentUser?.age ? `${currentUser.age} yrs` : ''} {currentUser?.gender || ''} {currentUser?.bloodGroup ? `• ${currentUser.bloodGroup}` : ''}</Text>
          <Text style={s.profileVillage}>📍 {currentUser?.village || 'Location not set'}</Text>
        </View>
        <TouchableOpacity style={s.switchBtn} onPress={logout}>
          <Text style={s.switchText}>Switch</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'overview' && s.tabActive]} onPress={() => setTab('overview')}>
          <Text style={[s.tabText, tab === 'overview' && s.tabTextActive]}>Overview</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'timeline' && s.tabActive]} onPress={() => setTab('timeline')}>
          <Text style={[s.tabText, tab === 'timeline' && s.tabTextActive]}>Timeline</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.content} contentContainerStyle={s.contentInner}>
        {tab === 'overview' && (
          <>
            {/* Conditions */}
            <Text style={s.sectionLabel}>Conditions</Text>
            {conditions.map((c, i) => (
              <View key={i} style={s.card}>
                <View style={s.cardRow}>
                  <Text style={s.cardTitle}>{c.name}</Text>
                  <View style={[s.badge, c.status === 'Chronic' ? s.badgeOrange : s.badgeGreen]}>
                    <Text style={s.badgeText}>{c.status}</Text>
                  </View>
                </View>
                <Text style={s.cardSub}>Since {c.since}</Text>
              </View>
            ))}

            {/* Active Medications */}
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>Active Medications</Text>
            {medications.map((m, i) => (
              <View key={i} style={s.card}>
                <Text style={s.cardTitle}>{m.name}</Text>
                <Text style={s.cardSub}>{m.dosage} — {m.freq}</Text>
              </View>
            ))}

            {/* Quick stats */}
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statNum}>{conditions.length}</Text>
                <Text style={s.statLabel}>Conditions</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statNum}>{medications.length}</Text>
                <Text style={s.statLabel}>Medications</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statNum}>{timeline.length}</Text>
                <Text style={s.statLabel}>Records</Text>
              </View>
            </View>
          </>
        )}

        {tab === 'timeline' && (
          <>
            <Text style={s.sectionLabel}>Health Timeline</Text>
            {timeline.map((t, i) => (
              <View key={i} style={s.timelineItem}>
                <View style={s.timelineDot}><Text>{t.icon}</Text></View>
                <View style={s.timelineBody}>
                  <Text style={s.timelineDate}>{t.date}</Text>
                  <Text style={s.timelineEvent}>{t.event}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFBFC' },
  // Profile header
  profileHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, gap: 16 },
  avatarLarge: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0D7C66', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 28, fontWeight: '700', color: '#fff' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 24, fontWeight: '700', color: '#111827' },
  profileMeta: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  profileVillage: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  switchBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
  switchText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  // Tabs
  tabs: { flexDirection: 'row', paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tab: { paddingVertical: 14, marginRight: 24 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#0D7C66' },
  tabText: { fontSize: 16, color: '#9CA3AF', fontWeight: '500' },
  tabTextActive: { color: '#0D7C66', fontWeight: '600' },
  // Content
  content: { flex: 1 },
  contentInner: { padding: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  // Cards
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  cardSub: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeGreen: { backgroundColor: '#F0FDF4' },
  badgeOrange: { backgroundColor: '#FFF7ED' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  // Stats
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' },
  statNum: { fontSize: 28, fontWeight: '700', color: '#0D7C66' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  // Timeline
  timelineItem: { flexDirection: 'row', marginBottom: 20, gap: 14 },
  timelineDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  timelineBody: { flex: 1, paddingTop: 2 },
  timelineDate: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  timelineEvent: { fontSize: 16, color: '#1F2937', marginTop: 2 },
});
