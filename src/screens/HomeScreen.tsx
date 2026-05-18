import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCactus } from '../context/CactusContext';
import { useUser } from '../context/UserContext';
import { colors, spacing, radius, typography, shadow } from '../theme';

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
          <Text style={styles.userName}>{currentUser?.name || 'User'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={{ fontSize: 20 }}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        <View style={styles.logoCircle}>
          <Text style={{ fontSize: 56 }}>🤝</Text>
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
            {/* Airplane mode / Offline badge */}
            <View style={styles.offlineBadge}>
              <Text style={{ fontSize: 14 }}>✈️</Text>
              <Text style={styles.offlineBadgeText}>100% Offline — No Internet Required</Text>
            </View>

            <View style={styles.statusRow}>
              <View style={styles.statusChip}>
                <Text style={{ fontSize: 12 }}>✅</Text>
                <Text style={styles.statusLabel}>Gemma 4 E2B</Text>
              </View>
              <View style={styles.statusChip}>
                <Text style={{ fontSize: 12 }}>✅</Text>
                <Text style={styles.statusLabel}>Cactus v1.7</Text>
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
            <Text style={{ fontSize: 24 }}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
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
  greeting: { ...typography.caption, color: colors.textSecondary },
  userName: { ...typography.h1, color: colors.textPrimary },
  logoutBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
    ...shadow.lg,
  },
  title: { ...typography.hero, color: colors.primary, marginTop: spacing.lg },
  subtitle: { ...typography.h3, color: colors.textSecondary, marginTop: spacing.xs, fontWeight: '400' },
  loadingCard: {
    marginTop: 40, width: '100%', padding: spacing.xl,
    backgroundColor: colors.bgSecondary, borderRadius: radius.lg, alignItems: 'center',
  },
  loadingText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md },
  progressBar: { width: '100%', height: 8, backgroundColor: colors.border, borderRadius: 4, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  statusRow: { flexDirection: 'row', gap: spacing.md, marginTop: 30 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight, borderRadius: radius.full,
  },
  statusLabel: { ...typography.buttonSmall, color: colors.primaryDark },
  offlineBadge: {
    marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 4,
    backgroundColor: '#FEF3C7', borderRadius: radius.full, borderWidth: 1, borderColor: '#FDE68A',
  },
  offlineBadgeText: { ...typography.buttonSmall, color: '#92400E' },
  startBtn: {
    marginTop: 40, width: '100%', height: 80, borderRadius: radius.xl,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    ...shadow.lg,
  },
  startBtnText: { ...typography.h2, color: '#fff', marginTop: 4 },
  startBtnSub: { ...typography.small, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  errorCard: {
    marginTop: 30, width: '100%', padding: spacing.xl,
    backgroundColor: '#FEF2F2', borderRadius: radius.lg, alignItems: 'center', gap: 8,
  },
  errorText: { ...typography.caption, color: colors.danger, textAlign: 'center' },
  retryBtn: { marginTop: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.danger, borderRadius: radius.full },
  retryBtnText: { ...typography.button, color: '#fff' },
});
