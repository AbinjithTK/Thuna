import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useCactus } from '../context/CactusContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { agentState, downloadProgress, error, initialize } = useCactus();

  useEffect(() => {
    // Auto-initialize on mount
    if (agentState === 'idle') {
      initialize();
    }
  }, []);

  const isLoading =
    agentState === 'downloading' || agentState === 'initializing';

  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logoContainer}>
        <Text style={styles.logoIcon}>🤝</Text>
        <Text style={styles.title}>Thuna</Text>
        <Text style={styles.subtitle}>നിങ്ങളുടെ ആരോഗ്യ തുണ</Text>
        <Text style={styles.subtitleEn}>Your Health Companion, Always Beside You</Text>
      </View>

      {/* Status */}
      <View style={styles.statusContainer}>
        {isLoading && (
          <>
            <ActivityIndicator size="large" color="#1B5E20" />
            <Text style={styles.statusText}>
              {agentState === 'downloading'
                ? `മോഡൽ ഡൗൺലോഡ് ചെയ്യുന്നു... ${Math.round(downloadProgress * 100)}%\n(Gemma 4 E2B — ~4.7GB, first time only)`
                : 'എഞ്ചിൻ ആരംഭിക്കുന്നു... (Initializing engine)'}
            </Text>
          </>
        )}

        {agentState === 'ready' && (
          <>
            <StatusRow icon="🎤" label="Cactus Whisper STT" ready />
            <StatusRow icon="🧠" label="Gemma 4 E2B (on-device)" ready />
            <StatusRow icon="🔊" label="മലയാളം TTS" ready />
            <StatusRow icon="📡" label="VAD (Silero)" ready />

            {/* Offline badge */}
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>
                ✈️ ഓഫ്‌ലൈൻ മോഡ് — No Internet Required
              </Text>
            </View>
          </>
        )}

        {agentState === 'error' && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={initialize}>
              <Text style={styles.retryButtonText}>വീണ്ടും ശ്രമിക്കുക</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Start Button */}
      {agentState === 'ready' && (
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => navigation.navigate('Main')}>
          <Text style={styles.startButtonText}>
            ▶ ട്രയേജ് ആരംഭിക്കുക{'\n'}
            <Text style={styles.startButtonSubtext}>Start Triage</Text>
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatusRow({
  icon,
  label,
  ready,
}: {
  icon: string;
  label: string;
  ready: boolean;
}) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusIcon}>{ready ? '✅' : '⏳'}</Text>
      <Text style={styles.statusLabel}>
        {icon} {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  logoContainer: { alignItems: 'center', marginBottom: 48 },
  logoIcon: { fontSize: 64 },
  title: { fontSize: 36, fontWeight: 'bold', color: '#1B5E20', marginTop: 12 },
  subtitle: { fontSize: 16, color: '#555', marginTop: 8 },
  subtitleEn: { fontSize: 13, color: '#888', marginTop: 2 },
  statusContainer: { alignItems: 'center', marginBottom: 32, width: '100%' },
  statusText: { fontSize: 14, color: '#555', marginTop: 12 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  statusIcon: { fontSize: 16, marginRight: 8 },
  statusLabel: { fontSize: 14, color: '#333' },
  offlineBadge: {
    marginTop: 16,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  offlineBadgeText: { fontSize: 12, color: '#2E7D32', fontWeight: '600' },
  errorContainer: { alignItems: 'center' },
  errorText: { fontSize: 14, color: '#C62828', textAlign: 'center' },
  retryButton: {
    marginTop: 12,
    backgroundColor: '#1B5E20',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  startButton: {
    backgroundColor: '#1B5E20',
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 12,
    elevation: 4,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  startButtonSubtext: { fontSize: 13, fontWeight: 'normal' },
});
