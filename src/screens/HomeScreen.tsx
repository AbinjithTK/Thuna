import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCactus } from '../context/CactusContext';
import { useUser } from '../context/UserContext';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

export default function HomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { agentState, downloadProgress, error, initialize } = useCactus();
  const { currentUser, logout } = useUser();

  useEffect(() => {
    if (agentState === 'idle') initialize();
  }, []);

  const isLoading = agentState === 'downloading' || agentState === 'initializing';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      {/* Header with user info */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>നമസ്കാരം,</Text>
          <Text style={styles.userName}>{currentUser?.name || 'User'} 👋</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>🤝</Text>
        </View>
        <Text style={styles.title}>Thuna</Text>
        <Text style={styles.subtitle}>നിങ്ങളുടെ ആരോഗ്യ തുണ</Text>

        {/* Status */}
        {isLoading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>
              {agentState === 'downloading'
                ? `Gemma 4 ഡൗൺലോഡ്... ${Math.round(downloadProgress * 100)}%`
                : 'Engine ആരംഭിക്കുന്നു...'}
            </Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${downloadProgress * 100}%` }]} />
            </View>
          </View>
        )}

        {agentState === 'ready' && (
          <>
            <View style={styles.statusRow}>
              <View style={styles.statusChip}>
                <Text style={styles.statusDot}>🟢</Text>
                <Text style={styles.statusLabel}>Gemma 4 Ready</Text>
              </View>
              <View style={styles.statusChip}>
                <Text style={styles.statusDot}>🟢</Text>
                <Text style={styles.statusLabel}>Offline Mode</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.startBtn} onPress={() => navigation.navigate('Main')}>
              <Text style={styles.startBtnText}>💬 സംസാരിക്കാം</Text>
              <Text style={styles.startBtnSub}>Start Conversation</Text>
            </TouchableOpacity>
          </>
        )}

        {agentState === 'error' && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={initialize}>
              <Text style={styles.retryBtnText}>വീണ്ടും ശ്രമിക്കുക</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 },
  greeting: { fontSize: fontSize.md, color: colors.textSecondary },
  userName: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.textPrimary },
  logoutBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' },
  logoutText: { fontSize: 20 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
    ...shadow.lg,
  },
  logoEmoji: { fontSize: 56 },
  title: { fontSize: fontSize.hero, fontWeight: '800', color: colors.primary, marginTop: spacing.lg },
  subtitle: { fontSize: fontSize.lg, color: colors.textSecondary, marginTop: spacing.xs },
  loadingCard: {
    marginTop: 40, width: '100%', padding: spacing.xl,
    backgroundColor: colors.bgSecondary, borderRadius: radius.lg, alignItems: 'center',
  },
  loadingText: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: spacing.md },
  progressBar: { width: '100%', height: 8, backgroundColor: colors.border, borderRadius: 4, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  statusRow: { flexDirection: 'row', gap: spacing.md, marginTop: 30 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight, borderRadius: radius.full,
  },
  statusDot: { fontSize: 10 },
  statusLabel: { fontSize: fontSize.sm, color: colors.primaryDark, fontWeight: '600' },
  startBtn: {
    marginTop: 40, width: '100%', height: 80, borderRadius: radius.xl,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    ...shadow.lg,
  },
  startBtnText: { fontSize: fontSize.xxl, fontWeight: '700', color: '#fff' },
  startBtnSub: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  errorCard: {
    marginTop: 30, width: '100%', padding: spacing.xl,
    backgroundColor: '#FEF2F2', borderRadius: radius.lg, alignItems: 'center',
  },
  errorText: { fontSize: fontSize.md, color: colors.danger, textAlign: 'center' },
  retryBtn: { marginTop: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.danger, borderRadius: radius.full },
  retryBtnText: { fontSize: fontSize.md, fontWeight: '600', color: '#fff' },
});
