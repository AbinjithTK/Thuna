/**
 * IntentParser — Deterministic intent extraction from user input.
 * 
 * This runs BEFORE the LLM. It extracts structured data from the user's
 * message using regex patterns and keyword matching. The LLM is then used
 * only for generating the natural language response.
 * 
 * This is how production health apps work — you don't rely on a 2B model
 * to correctly format tool calls every time.
 */

export type Intent =
  | { type: 'add_medication'; data: MedicationData }
  | { type: 'add_condition'; data: ConditionData }
  | { type: 'set_reminder'; data: ReminderData }
  | { type: 'query_medications'; patientId: string }
  | { type: 'query_conditions'; patientId: string }
  | { type: 'query_reminders'; patientId: string }
  | { type: 'symptom_report'; symptoms: string }
  | { type: 'general_chat'; text: string };

export interface MedicationData {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  times: string[];
  notes: string;
}

export interface ConditionData {
  name: string;
  severity: string;
}

export interface ReminderData {
  medication: string;
  dosage: string;
  times: string[];
  durationDays: number;
  ttsMessage: string;
}

// Common medication names (English + Malayalam transliteration)
const MEDICATIONS = [
  'paracetamol', 'amoxicillin', 'metformin', 'amlodipine', 'atorvastatin',
  'omeprazole', 'pantoprazole', 'cetirizine', 'azithromycin', 'ibuprofen',
  'dolo', 'crocin', 'combiflam', 'augmentin', 'calpol', 'meftal',
  'rantac', 'pan', 'shelcal', 'ecosprin', 'thyronorm', 'glycomet',
  'telma', 'stamlo', 'aten', 'cipla', 'zifi', 'oflox',
  'പാരസെറ്റമോൾ', 'അമോക്സിസിലിൻ', 'മെറ്റ്ഫോർമിൻ',
];

// Common conditions
const CONDITIONS = [
  'diabetes', 'sugar', 'hypertension', 'bp', 'blood pressure', 'asthma',
  'thyroid', 'cholesterol', 'arthritis', 'migraine', 'anemia',
  'പ്രമേഹം', 'ഷുഗർ', 'ബിപി', 'ആസ്ത്മ', 'തൈറോയ്ഡ്',
];

// Frequency patterns
const FREQUENCY_PATTERNS: Array<{ pattern: RegExp; frequency: string; times: string[] }> = [
  { pattern: /3\s*times?\s*(daily|a day|per day)|thrice|ദിവസം\s*3/i, frequency: '3 times daily', times: ['08:00', '14:00', '20:00'] },
  { pattern: /twice\s*(daily|a day)|2\s*times?\s*(daily|a day)|ദിവസം\s*2/i, frequency: 'twice daily', times: ['08:00', '20:00'] },
  { pattern: /once\s*(daily|a day)|1\s*time|ദിവസം\s*1|ഒരു\s*നേരം/i, frequency: 'once daily', times: ['08:00'] },
  { pattern: /every\s*8\s*hours?/i, frequency: 'every 8 hours', times: ['08:00', '16:00', '00:00'] },
  { pattern: /every\s*12\s*hours?/i, frequency: 'every 12 hours', times: ['08:00', '20:00'] },
  { pattern: /morning|രാവിലെ/i, frequency: 'morning', times: ['08:00'] },
  { pattern: /night|രാത്രി/i, frequency: 'at night', times: ['21:00'] },
  { pattern: /before\s*food|ഭക്ഷണത്തിന്\s*മുമ്പ്/i, frequency: 'before food', times: ['07:30', '19:30'] },
  { pattern: /after\s*food|ഭക്ഷണത്തിന്\s*ശേഷം/i, frequency: 'after food', times: ['08:30', '20:30'] },
];

// Duration patterns
const DURATION_PATTERNS: Array<{ pattern: RegExp; days: number }> = [
  { pattern: /(\d+)\s*days?|(\d+)\s*ദിവസം/i, days: 0 }, // extracted from match
  { pattern: /1\s*week|ഒരു\s*ആഴ്ച/i, days: 7 },
  { pattern: /2\s*weeks?/i, days: 14 },
  { pattern: /1\s*month|ഒരു\s*മാസം/i, days: 30 },
];

// Dosage patterns
const DOSAGE_PATTERN = /(\d+)\s*(mg|ml|mcg|g|tablet|tab|cap|capsule|drops)/i;

export function parseIntent(input: string): Intent {
  const lower = input.toLowerCase();

  // Check for medication queries
  if (/what.*medication|my.*med|medicine.*taking|മരുന്ന്.*എന്ത|എന്ത്.*മരുന്ന്/i.test(input)) {
    return { type: 'query_medications', patientId: 'default' };
  }

  // Check for condition queries
  if (/what.*condition|my.*disease|health.*issue|രോഗ.*എന്ത|condition/i.test(input)) {
    return { type: 'query_conditions', patientId: 'default' };
  }

  // Check for reminder queries
  if (/reminder|alarm|when.*take|എപ്പോൾ.*കഴിക്ക|ഓർമ്മ/i.test(input)) {
    return { type: 'query_reminders', patientId: 'default' };
  }

  // Check for medication addition (most important)
  const medMatch = MEDICATIONS.find(med => lower.includes(med.toLowerCase()));
  if (medMatch) {
    const medication = extractMedication(input, medMatch);
    if (medication) {
      return { type: 'add_medication', data: medication };
    }
  }

  // Check for condition addition
  const condMatch = CONDITIONS.find(cond => lower.includes(cond.toLowerCase()));
  if (condMatch) {
    return {
      type: 'add_condition',
      data: { name: condMatch, severity: /severe|serious|�ുരുതര/i.test(input) ? 'severe' : 'moderate' },
    };
  }

  // Check for symptom keywords
  if (/fever|cough|pain|headache|vomit|diarr|rash|breathing|പനി|ചുമ|വേദന|ഛർദ്ദി|തലവേദന/i.test(input)) {
    return { type: 'symptom_report', symptoms: input };
  }

  // Default — general chat
  return { type: 'general_chat', text: input };
}

function extractMedication(input: string, medName: string): MedicationData | null {
  // Extract dosage
  const dosageMatch = input.match(DOSAGE_PATTERN);
  const dosage = dosageMatch ? dosageMatch[0] : '';

  // Extract frequency
  let frequency = '';
  let times: string[] = ['08:00'];
  for (const fp of FREQUENCY_PATTERNS) {
    if (fp.pattern.test(input)) {
      frequency = fp.frequency;
      times = fp.times;
      break;
    }
  }

  // Extract duration
  let duration = '';
  for (const dp of DURATION_PATTERNS) {
    const match = input.match(dp.pattern);
    if (match) {
      if (dp.days === 0 && match[1]) {
        duration = `${match[1]} days`;
      } else if (dp.days > 0) {
        duration = `${dp.days} days`;
      }
      break;
    }
  }

  // Extract notes
  let notes = '';
  if (/after\s*food|ഭക്ഷണത്തിന്\s*ശേഷം/i.test(input)) notes = 'After food';
  else if (/before\s*food|ഭക്ഷണത്തിന്\s*മുമ്പ്/i.test(input)) notes = 'Before food';
  else if (/empty\s*stomach/i.test(input)) notes = 'Empty stomach';

  return {
    name: medName.charAt(0).toUpperCase() + medName.slice(1),
    dosage,
    frequency: frequency || 'as prescribed',
    duration: duration || '',
    times,
    notes,
  };
}

/**
 * Generate a Malayalam TTS reminder message for a medication
 */
export function generateTTSMessage(medName: string, dosage: string): string {
  return `${medName} ${dosage} കഴിക്കാൻ സമയമായി. മറക്കരുത്.`;
}
