import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useUser } from '../context/UserContext';
import { database, Medication, Condition, Vital, Reminder } from '../db';
import { Q } from '@nozbe/watermelondb';
import { generateHealthReport, formatReportAsText } from '../services/HealthReport';
import { syncToCloud, isOnline, getLastSyncTime, getCachedInsights } from '../services/CloudSync';
import { generateFamilyStatus } from '../services/ProactiveHealth';

interface ConditionItem { name: string; status: string; since: string }
interface MedicationItem { name: string; dosage: string; freq: string }
interface TimelineItem { date: string; event: string; icon: string }

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, logout } = useUser();
  const [tab, setTab] = useState<'overview' | 'timeline'>('overview');
  const [conditions, setConditions] = useState<ConditionItem[]>([]);
  const [medications, setMedications] = useState<MedicationItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [stats, setStats] = useState({ conditions: 0, medications: 0, records: 0 });
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [cloudInsight, setCloudInsight] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (currentUser) loadData();
      loadSyncInfo();
    }, [currentUser])
  );

  const loadSyncInfo = async () => {
    const ts = await getLastSyncTime();
    if (ts) setLastSync(new Date(ts).toLocaleDateString('en-IN'));
    const insights = await getCachedInsights();
    if (insights?.preventiveCare) setCloudInsight(insights.preventiveCare);
  };

  const loadData = async () => {
    const patientId = currentUser?.id || 'default';

    try {
      // Load conditions
      const conds = await database.get<Condition>('conditions')
        .query(Q.where('patient_id', patientId)).fetch();
      setConditions(conds.map(c => ({
        name: c.conditionName,
        status: c.status || 'Active',
        since: c.diagnosedDate || '—',
      })));

      // Load active medications
      const meds = await database.get<Medication>('medications')
        .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();
      setMedications(meds.map(m => ({
        name: m.name,
        dosage: m.dosage,
        freq: m.frequency,
      })));

      // Load recent vitals for timeline
      const vitals = await database.get<Vital>('vitals')
        .query(Q.where('patient_id', patientId), Q.sortBy('recorded_at', Q.desc), Q.take(10)).fetch();

      const timelineItems: TimelineItem[] = vitals.map(v => {
        const dateStr = formatDate(v.recordedAt);
        const icons: Record<string, string> = { bp: '❤️', sugar: '🩸', spo2: '🫁', temperature: '🌡️', heart_rate: '💓', weight: '⚖️', pain: '😣', symptom: '🤒' };
        const labels: Record<string, string> = { bp: 'BP', sugar: 'Sugar', spo2: 'SpO2', temperature: 'Temp', heart_rate: 'HR', weight: 'Weight', pain: 'Pain', symptom: 'Symptom' };

        // Symptoms are stored with vitalType='symptom' and description in context
        if (v.vitalType === 'symptom') {
          return {
            date: dateStr,
            event: `Reported: ${v.context || 'symptom'}`,
            icon: '🤒',
          };
        }

        const val = v.valueSecondary ? `${v.valuePrimary}/${v.valueSecondary}` : `${v.valuePrimary}`;
        return {
          date: dateStr,
          event: `${labels[v.vitalType] || v.vitalType}: ${val} ${v.unit}${v.context ? ' (' + v.context + ')' : ''}`,
          icon: icons[v.vitalType] || '📊',
        };
      });

      setTimeline(timelineItems);

      // Stats
      const reminders = await database.get<Reminder>('reminders')
        .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();
      setStats({ conditions: conds.length, medications: meds.length, records: vitals.length + reminders.length });
    } catch (e) {
      console.warn('ProfileScreen loadData error:', e);
    }
  };

  const formatDate = (timestamp: number): string => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const handleShareReport = async () => {
    try {
      const report = await generateHealthReport(
        currentUser?.id || 'default',
        currentUser?.name || 'Patient',
        currentUser?.age || '',
      );
      const text = formatReportAsText(report);
      await Share.share({ message: text, title: 'Thuna Health Report' });
    } catch (e) {
      console.warn('Share report error:', e);
    }
  };

  const handleShareStatus = async () => {
    try {
      const status = await generateFamilyStatus(currentUser?.id || 'default', currentUser?.name || 'Patient');
      await Share.share({ message: status, title: 'Daily Health Status' });
    } catch (e) {
      console.warn('Share status error:', e);
    }
  };

  const handleCloudSync = async () => {
    const online = await isOnline();
    if (!online) {
      Alert.alert('Offline', 'ഇന്റർനെറ്റ് ഇല്ല. ഇന്റർനെറ്റ് ഉള്ളപ്പോൾ ശ്രമിക്കുക.\n(No internet. Try when connected.)');
      return;
    }
    try {
      const result = await syncToCloud(currentUser?.id || 'default');
      if (result.success) {
        const msg = `Synced: ${result.pushed.vitals} vitals, ${result.pushed.medications} meds, ${result.pushed.conditions} conditions`;
        Alert.alert('☁️ Sync Complete', msg);
        loadSyncInfo();
      } else {
        Alert.alert('Sync Issue', result.errors.join('\n') || 'Unknown error');
      }
    } catch (e: any) {
      Alert.alert('Sync Failed', e.message);
    }
  };

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
            {conditions.length === 0 && <Text style={s.emptyText}>No conditions recorded yet. Tell Thuna about your health conditions.</Text>}
            {conditions.map((c, i) => (
              <View key={i} style={s.card}>
                <View style={s.cardRow}>
                  <Text style={s.cardTitle}>{c.name}</Text>
                  <View style={[s.badge, c.status === 'chronic' ? s.badgeOrange : s.badgeGreen]}>
                    <Text style={s.badgeText}>{c.status}</Text>
                  </View>
                </View>
                <Text style={s.cardSub}>Since {c.since}</Text>
              </View>
            ))}

            {/* Active Medications */}
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>Active Medications</Text>
            {medications.length === 0 && <Text style={s.emptyText}>No active medications. Tell Thuna when you start a new medicine.</Text>}
            {medications.map((m, i) => (
              <View key={i} style={s.card}>
                <Text style={s.cardTitle}>{m.name}</Text>
                <Text style={s.cardSub}>{m.dosage} — {m.freq}</Text>
              </View>
            ))}

            {/* Quick stats */}
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statNum}>{stats.conditions}</Text>
                <Text style={s.statLabel}>Conditions</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statNum}>{stats.medications}</Text>
                <Text style={s.statLabel}>Medications</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statNum}>{stats.records}</Text>
                <Text style={s.statLabel}>Records</Text>
              </View>
            </View>

            {/* Share Health Report */}
            <TouchableOpacity style={s.shareBtn} onPress={handleShareReport}>
              <Text style={s.shareBtnText}>📋 Health Report Share ചെയ്യുക</Text>
            </TouchableOpacity>

            {/* Share Daily Status to Family */}
            <TouchableOpacity style={s.statusBtn} onPress={handleShareStatus}>
              <Text style={s.statusBtnText}>👨‍👩‍👧 ഇന്നത്തെ Status Family-ക്ക് അയക്കുക</Text>
            </TouchableOpacity>

            {/* Cloud Sync */}
            <TouchableOpacity style={s.syncBtn} onPress={handleCloudSync}>
              <Text style={s.syncBtnText}>☁️ Cloud Sync (FHIR)</Text>
            </TouchableOpacity>
            {lastSync && <Text style={s.syncInfo}>Last sync: {lastSync}</Text>}
            {cloudInsight && (
              <View style={s.insightCard}>
                <Text style={s.insightTitle}>☁️ Cloud Insights</Text>
                <Text style={s.insightText}>{cloudInsight.slice(0, 200)}...</Text>
              </View>
            )}
          </>
        )}

        {tab === 'timeline' && (
          <>
            <Text style={s.sectionLabel}>Health Timeline</Text>
            {timeline.length === 0 && <Text style={s.emptyText}>No records yet. Start by telling Thuna your BP or sugar readings.</Text>}
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
  profileHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, gap: 16 },
  avatarLarge: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0D7C66', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 28, fontWeight: '700', color: '#fff' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 24, fontWeight: '700', color: '#111827' },
  profileMeta: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  profileVillage: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  switchBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
  switchText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  tabs: { flexDirection: 'row', paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tab: { paddingVertical: 14, marginRight: 24 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#0D7C66' },
  tabText: { fontSize: 16, color: '#9CA3AF', fontWeight: '500' },
  tabTextActive: { color: '#0D7C66', fontWeight: '600' },
  content: { flex: 1 },
  contentInner: { padding: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic', marginBottom: 16 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  cardSub: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeGreen: { backgroundColor: '#F0FDF4' },
  badgeOrange: { backgroundColor: '#FFF7ED' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' },
  statNum: { fontSize: 28, fontWeight: '700', color: '#0D7C66' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  shareBtn: { marginTop: 24, height: 56, borderRadius: 28, backgroundColor: '#0D7C66', alignItems: 'center', justifyContent: 'center' },
  shareBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  statusBtn: { marginTop: 12, height: 56, borderRadius: 28, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  statusBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  syncBtn: { marginTop: 12, height: 56, borderRadius: 28, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  syncBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  syncInfo: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 8 },
  insightCard: { marginTop: 16, padding: 16, backgroundColor: '#EFF6FF', borderRadius: 14, borderWidth: 1, borderColor: '#BFDBFE' },
  insightTitle: { fontSize: 14, fontWeight: '600', color: '#1E40AF', marginBottom: 8 },
  insightText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  timelineItem: { flexDirection: 'row', marginBottom: 20, gap: 14 },
  timelineDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  timelineBody: { flex: 1, paddingTop: 2 },
  timelineDate: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  timelineEvent: { fontSize: 16, color: '#1F2937', marginTop: 2 },
});
