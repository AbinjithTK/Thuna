import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { URGENCY_CONFIG } from '../types/triage';
import { useCactus } from '../context/CactusContext';
import Tts from 'react-native-tts';

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>;

export default function ResultsScreen({ navigation, route }: Props) {
  const { result } = route.params;
  const { reset } = useCactus();
  const config = URGENCY_CONFIG[result.urgency];

  // Speak the result in Malayalam
  const speakResult = () => {
    Tts.setDefaultLanguage('ml-IN');
    Tts.setDefaultRate(0.45);
    const speech = [
      `ട്രയേജ് ഫലം: ${config.label}.`,
      result.classification,
      ...result.actions,
      result.followUp ? `ഫോളോ-അപ്പ്: ${result.followUp}` : '',
    ]
      .filter(Boolean)
      .join('. ');
    Tts.speak(speech);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Main urgency card */}
      <View style={[styles.urgencyCard, { borderColor: config.color }]}>
        <View
          style={[styles.urgencyBg, { backgroundColor: config.bgColor }]}>
          <Text style={styles.urgencyIcon}>{config.icon}</Text>
          <Text style={[styles.urgencyLabel, { color: config.color }]}>
            {config.label}
          </Text>
          <Text style={[styles.urgencyLabelEn, { color: config.color }]}>
            {config.labelEn}
          </Text>

          {result.referralNeeded && (
            <View style={[styles.referralBadge, { backgroundColor: config.color + '20' }]}>
              <Text style={[styles.referralText, { color: config.color }]}>
                🏥 റഫറൽ ആവശ്യമാണ് (Referral Needed)
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Classification */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          🩺 വർഗ്ഗീകരണം (Classification)
        </Text>
        <Text style={styles.sectionContent}>{result.classification}</Text>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 നടപടികൾ (Actions)</Text>
        {result.actions.map((action, i) => (
          <View key={i} style={styles.actionRow}>
            <Text style={styles.actionBullet}>→</Text>
            <Text style={styles.actionText}>{action}</Text>
          </View>
        ))}
      </View>

      {/* Follow-up */}
      {result.followUp ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 ഫോളോ-അപ്പ് (Follow-up)</Text>
          <Text style={styles.sectionContent}>{result.followUp}</Text>
        </View>
      ) : null}

      {/* Reasoning (collapsible) */}
      {result.reasoning ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            🧠 ക്ലിനിക്കൽ യുക്തി (Reasoning)
          </Text>
          <Text style={styles.reasoningText}>{result.reasoning}</Text>
        </View>
      ) : null}

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.speakButton}
          onPress={speakResult}>
          <Text style={styles.speakButtonText}>🔊 വായിക്കുക</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            reset();
            navigation.navigate('Triage');
          }}>
          <Text style={styles.secondaryButtonText}>
            👤 പുതിയ രോഗി (New Patient)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.primaryButtonText}>
            💬 ഫോളോ-അപ്പ് (Follow-up)
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { padding: 16 },
  urgencyCard: {
    borderRadius: 16,
    borderWidth: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  urgencyBg: {
    padding: 24,
    alignItems: 'center',
  },
  urgencyIcon: { fontSize: 56 },
  urgencyLabel: { fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  urgencyLabelEn: { fontSize: 14, marginTop: 2 },
  referralBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  referralText: { fontSize: 12, fontWeight: '600' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 8,
  },
  sectionContent: { fontSize: 15, color: '#333', lineHeight: 22 },
  actionRow: { flexDirection: 'row', marginVertical: 3 },
  actionBullet: { color: '#1B5E20', fontWeight: 'bold', marginRight: 8, fontSize: 15 },
  actionText: { fontSize: 14, color: '#333', flex: 1, lineHeight: 20 },
  reasoningText: { fontSize: 13, color: '#666', lineHeight: 20, fontStyle: 'italic' },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  speakButton: {
    flex: 1,
    backgroundColor: '#1B5E20',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  speakButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#1B5E20',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#1B5E20', fontSize: 13, fontWeight: '600' },
  primaryButton: {
    flex: 1,
    backgroundColor: '#1B5E20',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
