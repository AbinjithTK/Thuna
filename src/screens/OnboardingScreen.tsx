import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface OnboardingData {
  name: string;
  age: string;
  gender: string;
  village: string;
  bloodGroup: string;
  existingConditions: string;
  currentMedications: string;
  allergies: string;
  emergencyContact: string;
}

interface Props {
  onComplete: (data: OnboardingData) => void;
}

const STEPS = [
  { key: 'name', question: 'നിങ്ങളുടെ പേര് എന്താണ്?', placeholder: 'Full name', icon: '👤' },
  { key: 'age', question: 'പ്രായം എത്ര?', placeholder: 'Age (e.g. 45)', icon: '🎂', keyboardType: 'numeric' },
  { key: 'gender', question: 'ലിംഗം?', placeholder: '', icon: '⚧️', type: 'choice', options: ['Male', 'Female', 'Other'] },
  { key: 'village', question: 'ഏത് സ്ഥലത്താണ് താമസം?', placeholder: 'Village/Town', icon: '🏘️' },
  { key: 'bloodGroup', question: 'രക്തഗ്രൂപ്പ് അറിയാമോ?', placeholder: '', icon: '🩸', type: 'choice', options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'Unknown'] },
  { key: 'existingConditions', question: 'നിലവിൽ എന്തെങ്കിലും രോഗങ്ങൾ ഉണ്ടോ?\n(Diabetes, BP, Asthma, etc.)', placeholder: 'Type conditions or "None"', icon: '🏥' },
  { key: 'currentMedications', question: 'ഇപ്പോൾ എന്തെങ്കിലും മരുന്ന് കഴിക്കുന്നുണ്ടോ?', placeholder: 'Medications or "None"', icon: '💊' },
  { key: 'allergies', question: 'എന്തെങ്കിലും allergy ഉണ്ടോ?', placeholder: 'Allergies or "None"', icon: '⚠️' },
  { key: 'emergencyContact', question: 'അടിയന്തര ഘട്ടത്തിൽ ആരെ വിളിക്കണം?', placeholder: 'Name & phone number', icon: '📞' },
];

export default function OnboardingScreen({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    name: '', age: '', gender: '', village: '', bloodGroup: '',
    existingConditions: '', currentMedications: '', allergies: '', emergencyContact: '',
  });

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const canProceed = data[currentStep.key as keyof OnboardingData].trim().length > 0;

  const handleNext = () => {
    if (isLast) {
      onComplete(data);
    } else {
      setStep(step + 1);
    }
  };

  const handleChoice = (value: string) => {
    setData({ ...data, [currentStep.key]: value });
    // Auto-advance after choice
    setTimeout(() => {
      if (isLast) onComplete({ ...data, [currentStep.key]: value });
      else setStep(step + 1);
    }, 300);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Progress */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
      </View>
      <Text style={styles.stepCount}>{step + 1} / {STEPS.length}</Text>

      {/* Question */}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.icon}>{currentStep.icon}</Text>
        <Text style={styles.question}>{currentStep.question}</Text>

        {/* Choice buttons */}
        {currentStep.type === 'choice' ? (
          <View style={styles.choicesContainer}>
            {currentStep.options?.map(option => (
              <TouchableOpacity
                key={option}
                style={[styles.choiceBtn, data[currentStep.key as keyof OnboardingData] === option && styles.choiceBtnActive]}
                onPress={() => handleChoice(option)}>
                <Text style={[styles.choiceBtnText, data[currentStep.key as keyof OnboardingData] === option && styles.choiceBtnTextActive]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          /* Text input */
          <TextInput
            style={styles.input}
            placeholder={currentStep.placeholder}
            placeholderTextColor="#999"
            value={data[currentStep.key as keyof OnboardingData]}
            onChangeText={(text) => setData({ ...data, [currentStep.key]: text })}
            keyboardType={(currentStep as any).keyboardType || 'default'}
            autoFocus
            onSubmitEditing={canProceed ? handleNext : undefined}
          />
        )}
      </ScrollView>

      {/* Navigation */}
      <View style={styles.navRow}>
        {step > 0 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
            <Text style={styles.backBtnText}>← മുൻപ്</Text>
          </TouchableOpacity>
        )}
        {currentStep.type !== 'choice' && (
          <TouchableOpacity
            style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canProceed}>
            <Text style={styles.nextBtnText}>{isLast ? '✓ തുടങ്ങുക' : 'അടുത്തത് →'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', paddingHorizontal: 24 },
  progressBar: { height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#1B5E20', borderRadius: 4 },
  stepCount: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  icon: { fontSize: 64, marginBottom: 20 },
  question: { fontSize: 22, fontWeight: '700', color: '#222', textAlign: 'center', lineHeight: 32, marginBottom: 30 },
  input: {
    width: '100%', height: 60, borderWidth: 2, borderColor: '#1B5E20', borderRadius: 16,
    paddingHorizontal: 20, fontSize: 18, color: '#333', backgroundColor: '#fff',
  },
  choicesContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  choiceBtn: {
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 25,
    borderWidth: 2, borderColor: '#1B5E20', backgroundColor: '#fff', minWidth: 80, alignItems: 'center',
  },
  choiceBtnActive: { backgroundColor: '#1B5E20' },
  choiceBtnText: { fontSize: 16, fontWeight: '600', color: '#1B5E20' },
  choiceBtnTextActive: { color: '#fff' },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16 },
  backBtn: { paddingVertical: 14, paddingHorizontal: 20 },
  backBtnText: { fontSize: 16, color: '#666' },
  nextBtn: { backgroundColor: '#1B5E20', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 30 },
  nextBtnDisabled: { backgroundColor: '#BDBDBD' },
  nextBtnText: { fontSize: 18, fontWeight: '700', color: '#fff' },
});
