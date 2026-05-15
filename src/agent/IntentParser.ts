/**
 * IntentParser — Deterministic intent extraction from user input.
 * Handles: Medications, Vitals (BP, Sugar, SpO2, Temp, HR, Weight, Pain),
 * Conditions, Lab Results, Queries, Symptoms
 */

export type Intent =
  | { type: 'add_medication'; data: MedicationData }
  | { type: 'add_vital'; data: VitalData }
  | { type: 'add_condition'; data: ConditionData }
  | { type: 'add_lab_result'; data: LabResultData }
  | { type: 'set_reminder'; data: ReminderData }
  | { type: 'query_medications'; patientId: string }
  | { type: 'query_conditions'; patientId: string }
  | { type: 'query_reminders'; patientId: string }
  | { type: 'query_vitals'; patientId: string; vitalType?: string }
  | { type: 'mark_taken'; medication: string }
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

export interface VitalData {
  type: string;       // bp, sugar, spo2, temp, hr, weight, pain, mood, sleep
  primary: number;    // systolic, fasting, spo2%, temp, hr, weight, score
  secondary: number;  // diastolic, pp sugar, 0 for others
  unit: string;
  context: string;    // fasting, post-meal, morning, evening, resting
}

export interface ConditionData {
  name: string;
  severity: string;
  icdCode: string;
}

export interface LabResultData {
  testName: string;
  value: number;
  unit: string;
  refLow: number;
  refHigh: number;
}

export interface ReminderData {
  medication: string;
  dosage: string;
  times: string[];
  durationDays: number;
  ttsMessage: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDICATION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const MEDICATIONS = [
  'paracetamol', 'amoxicillin', 'metformin', 'amlodipine', 'atorvastatin',
  'omeprazole', 'pantoprazole', 'cetirizine', 'azithromycin', 'ibuprofen',
  'dolo', 'crocin', 'combiflam', 'augmentin', 'calpol', 'meftal',
  'rantac', 'pan', 'shelcal', 'ecosprin', 'thyronorm', 'glycomet',
  'telma', 'stamlo', 'aten', 'zifi', 'oflox', 'montair',
  'insulin', 'glimepiride', 'losartan', 'telmisartan', 'aspirin',
  'clopidogrel', 'warfarin', 'levothyroxine', 'prednisolone',
  'salbutamol', 'budesonide', 'montelukast', 'folic acid',
  'calcium', 'vitamin d', 'iron', 'b12', 'multivitamin',
  'പാരസെറ്റമോൾ', 'അമോക്സിസിലിൻ', 'മെറ്റ്ഫോർമിൻ', 'ഇൻസുലിൻ',
];

const FREQUENCY_PATTERNS: Array<{ pattern: RegExp; frequency: string; times: string[] }> = [
  { pattern: /3\s*times?\s*(daily|a day|per day)|thrice|ദിവസം\s*3|മൂന്ന്\s*നേരം/i, frequency: '3 times daily', times: ['08:00', '14:00', '20:00'] },
  { pattern: /twice\s*(daily|a day)|2\s*times?\s*(daily|a day)|ദിവസം\s*2|രണ്ട്\s*നേരം/i, frequency: 'twice daily', times: ['08:00', '20:00'] },
  { pattern: /once\s*(daily|a day)|1\s*time|ദിവസം\s*1|ഒരു\s*നേരം/i, frequency: 'once daily', times: ['08:00'] },
  { pattern: /every\s*8\s*hours?/i, frequency: 'every 8 hours', times: ['08:00', '16:00', '00:00'] },
  { pattern: /every\s*12\s*hours?/i, frequency: 'every 12 hours', times: ['08:00', '20:00'] },
  { pattern: /morning|രാവിലെ/i, frequency: 'morning', times: ['08:00'] },
  { pattern: /night|രാത്രി|bed\s*time/i, frequency: 'at night', times: ['21:00'] },
  { pattern: /before\s*food|ഭക്ഷണത്തിന്\s*മുമ്പ്|empty\s*stomach/i, frequency: 'before food', times: ['07:30', '19:30'] },
  { pattern: /after\s*food|ഭക്ഷണത്തിന്\s*ശേഷം/i, frequency: 'after food', times: ['08:30', '20:30'] },
];

const DOSAGE_PATTERN = /(\d+\.?\d*)\s*(mg|ml|mcg|g|iu|units?|tablet|tab|cap|capsule|drops|puff)/i;

// ═══════════════════════════════════════════════════════════════════════════
// VITAL PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const VITAL_PATTERNS: Array<{ pattern: RegExp; type: string; unit: string; extractFn: (match: RegExpMatchArray) => { primary: number; secondary: number; context: string } }> = [
  // Blood Pressure: "BP 130/85", "130 by 85", "bp 130 over 85"
  {
    pattern: /(?:bp|blood\s*pressure|ബിപി|രക്തസമ്മർദ്ദം)\s*:?\s*(\d{2,3})\s*[\/\-by over]\s*(\d{2,3})/i,
    type: 'bp', unit: 'mmHg',
    extractFn: (m) => ({ primary: parseInt(m[1]), secondary: parseInt(m[2]), context: '' }),
  },
  // Also match standalone "130/85" or "130/80 bp"
  {
    pattern: /(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:mmhg|bp|ബിപി)?/i,
    type: 'bp', unit: 'mmHg',
    extractFn: (m) => {
      const sys = parseInt(m[1]), dia = parseInt(m[2]);
      if (sys >= 70 && sys <= 250 && dia >= 40 && dia <= 150) return { primary: sys, secondary: dia, context: '' };
      return { primary: 0, secondary: 0, context: '' };
    },
  },
  // Blood Sugar: "sugar 145", "fasting sugar 110", "pp sugar 180", "glucose 145"
  {
    pattern: /(?:sugar|glucose|ഷുഗർ|രക്തത്തിലെ\s*പഞ്ചസാര)\s*:?\s*(\d{2,3})/i,
    type: 'sugar', unit: 'mg/dL',
    extractFn: (m) => ({
      primary: parseInt(m[1]), secondary: 0,
      context: /fasting|ഫാസ്റ്റിംഗ്|empty/i.test(m.input || '') ? 'fasting' : /pp|post|after\s*food/i.test(m.input || '') ? 'post-meal' : 'random',
    }),
  },
  // SpO2: "oxygen 96", "spo2 95", "saturation 97"
  {
    pattern: /(?:spo2|oxygen|saturation|ഓക്സിജൻ)\s*:?\s*(\d{2,3})\s*%?/i,
    type: 'spo2', unit: '%',
    extractFn: (m) => ({ primary: parseInt(m[1]), secondary: 0, context: '' }),
  },
  // Temperature: "temp 38.5", "fever 101", "temperature 99.2"
  {
    pattern: /(?:temp|temperature|fever|പനി)\s*:?\s*(\d{2,3}\.?\d?)\s*(?:°?[cf])?/i,
    type: 'temperature', unit: '°F',
    extractFn: (m) => {
      let val = parseFloat(m[1]);
      // If < 45, assume Celsius
      if (val < 45) { val = val * 9/5 + 32; }
      return { primary: Math.round(val * 10) / 10, secondary: 0, context: '' };
    },
  },
  // Heart Rate: "pulse 72", "heart rate 80", "hr 68"
  {
    pattern: /(?:pulse|heart\s*rate|hr|പൾസ്)\s*:?\s*(\d{2,3})/i,
    type: 'heart_rate', unit: 'bpm',
    extractFn: (m) => ({ primary: parseInt(m[1]), secondary: 0, context: 'resting' }),
  },
  // Weight: "weight 72", "72 kg", "weight 72.5 kg"
  {
    pattern: /(?:weight|ഭാരം|തൂക്കം)\s*:?\s*(\d{2,3}\.?\d?)\s*(?:kg)?/i,
    type: 'weight', unit: 'kg',
    extractFn: (m) => ({ primary: parseFloat(m[1]), secondary: 0, context: '' }),
  },
  // Pain score: "pain 7", "pain score 5", "pain level 8"
  {
    pattern: /(?:pain|വേദന)\s*(?:score|level)?\s*:?\s*(\d{1,2})\s*(?:\/10)?/i,
    type: 'pain', unit: '/10',
    extractFn: (m) => ({ primary: Math.min(parseInt(m[1]), 10), secondary: 0, context: '' }),
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// LAB RESULT PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const LAB_PATTERNS: Array<{ pattern: RegExp; testName: string; unit: string; refLow: number; refHigh: number }> = [
  { pattern: /hba1c\s*:?\s*(\d+\.?\d*)/i, testName: 'HbA1c', unit: '%', refLow: 4.0, refHigh: 5.6 },
  { pattern: /tsh\s*:?\s*(\d+\.?\d*)/i, testName: 'TSH', unit: 'mIU/L', refLow: 0.4, refHigh: 4.0 },
  { pattern: /creatinine\s*:?\s*(\d+\.?\d*)/i, testName: 'Creatinine', unit: 'mg/dL', refLow: 0.6, refHigh: 1.2 },
  { pattern: /hemoglobin|hb\s*:?\s*(\d+\.?\d*)/i, testName: 'Hemoglobin', unit: 'g/dL', refLow: 12.0, refHigh: 17.0 },
  { pattern: /cholesterol\s*:?\s*(\d+)/i, testName: 'Total Cholesterol', unit: 'mg/dL', refLow: 0, refHigh: 200 },
  { pattern: /triglyceride\s*:?\s*(\d+)/i, testName: 'Triglycerides', unit: 'mg/dL', refLow: 0, refHigh: 150 },
  { pattern: /uric\s*acid\s*:?\s*(\d+\.?\d*)/i, testName: 'Uric Acid', unit: 'mg/dL', refLow: 3.5, refHigh: 7.2 },
];

// ═══════════════════════════════════════════════════════════════════════════
// CONDITIONS
// ═══════════════════════════════════════════════════════════════════════════

const CONDITIONS: Array<{ keywords: RegExp; name: string; icd: string }> = [
  { keywords: /diabetes|sugar\s*disease|പ്രമേഹം|ഷുഗർ/i, name: 'Type 2 Diabetes', icd: 'E11' },
  { keywords: /hypertension|high\s*bp|ഉയർന്ന\s*ബിപി|രക്തസമ്മർദ്ദം/i, name: 'Hypertension', icd: 'I10' },
  { keywords: /asthma|ആസ്ത്മ|ശ്വാസം\s*മുട്ട്/i, name: 'Asthma', icd: 'J45' },
  { keywords: /thyroid|തൈറോയ്ഡ്/i, name: 'Thyroid Disorder', icd: 'E03' },
  { keywords: /arthritis|joint\s*pain|സന്ധി\s*വേദന/i, name: 'Arthritis', icd: 'M13' },
  { keywords: /cholesterol|കൊളസ്ട്രോൾ/i, name: 'Hyperlipidemia', icd: 'E78' },
  { keywords: /kidney|ckd|വൃക്ക/i, name: 'Chronic Kidney Disease', icd: 'N18' },
  { keywords: /heart|cardiac|ഹൃദയം/i, name: 'Heart Disease', icd: 'I25' },
  { keywords: /copd|ശ്വാസകോശ/i, name: 'COPD', icd: 'J44' },
  { keywords: /anemia|രക്തക്കുറവ്/i, name: 'Anemia', icd: 'D50' },
  { keywords: /migraine|തലവേദന/i, name: 'Migraine', icd: 'G43' },
  { keywords: /depression|വിഷാദം/i, name: 'Depression', icd: 'F32' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════════════════════════════

export function parseIntent(input: string): Intent {
  const lower = input.toLowerCase();

  // ── Query intents ──
  if (/what.*medication|my.*med|medicine.*taking|മരുന്ന്.*എന്ത|show.*med/i.test(input)) {
    return { type: 'query_medications', patientId: 'default' };
  }
  if (/what.*condition|my.*disease|health.*issue|രോഗ.*എന്ത|condition/i.test(input)) {
    return { type: 'query_conditions', patientId: 'default' };
  }
  if (/reminder|alarm|when.*take|എപ്പോൾ.*കഴിക്ക|ഓർമ്മ/i.test(input)) {
    return { type: 'query_reminders', patientId: 'default' };
  }
  if (/vitals?|readings?|bp.*history|sugar.*history|my.*bp|my.*sugar/i.test(input)) {
    let vitalType: string | undefined;
    if (/bp|pressure/i.test(input)) vitalType = 'bp';
    if (/sugar|glucose/i.test(input)) vitalType = 'sugar';
    if (/spo2|oxygen/i.test(input)) vitalType = 'spo2';
    return { type: 'query_vitals', patientId: 'default', vitalType };
  }
  if (/took|taken|കഴിച്ചു|എടുത്തു/i.test(input)) {
    const med = MEDICATIONS.find(m => lower.includes(m.toLowerCase()));
    if (med) return { type: 'mark_taken', medication: med };
  }

  // ── Vital recording ──
  for (const vp of VITAL_PATTERNS) {
    const match = input.match(vp.pattern);
    if (match) {
      const extracted = vp.extractFn(match);
      if (extracted.primary > 0) {
        return {
          type: 'add_vital',
          data: { type: vp.type, primary: extracted.primary, secondary: extracted.secondary, unit: vp.unit, context: extracted.context },
        };
      }
    }
  }

  // ── Lab results ──
  for (const lp of LAB_PATTERNS) {
    const match = input.match(lp.pattern);
    if (match && match[1]) {
      return {
        type: 'add_lab_result',
        data: { testName: lp.testName, value: parseFloat(match[1]), unit: lp.unit, refLow: lp.refLow, refHigh: lp.refHigh },
      };
    }
  }

  // ── Medication addition ──
  const medMatch = MEDICATIONS.find(med => lower.includes(med.toLowerCase()));
  if (medMatch && DOSAGE_PATTERN.test(input)) {
    return { type: 'add_medication', data: extractMedication(input, medMatch) };
  }

  // ── Condition addition ──
  for (const cond of CONDITIONS) {
    if (cond.keywords.test(input) && /have|diagnosed|i have|എനിക്ക്|ഉണ്ട്/i.test(input)) {
      return {
        type: 'add_condition',
        data: { name: cond.name, severity: /severe|serious|ഗുരുതര/i.test(input) ? 'severe' : 'moderate', icdCode: cond.icd },
      };
    }
  }

  // ── Symptom keywords ──
  if (/fever|cough|pain|headache|vomit|diarr|rash|breathing|dizz|nausea|പനി|ചുമ|വേദന|ഛർദ്ദി|തലവേദന|ശ്വാസം/i.test(input)) {
    return { type: 'symptom_report', symptoms: input };
  }

  // ── Default ──
  return { type: 'general_chat', text: input };
}

function extractMedication(input: string, medName: string): MedicationData {
  const dosageMatch = input.match(DOSAGE_PATTERN);
  const dosage = dosageMatch ? dosageMatch[0] : '';

  let frequency = 'as prescribed';
  let times: string[] = ['08:00'];
  for (const fp of FREQUENCY_PATTERNS) {
    if (fp.pattern.test(input)) {
      frequency = fp.frequency;
      times = fp.times;
      break;
    }
  }

  let duration = '';
  const durationMatch = input.match(/(\d+)\s*(days?|ദിവസം|weeks?|ആഴ്ച|months?|മാസം)/i);
  if (durationMatch) {
    const num = parseInt(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    if (unit.includes('week') || unit.includes('ആഴ്ച')) duration = `${num * 7} days`;
    else if (unit.includes('month') || unit.includes('മാസം')) duration = `${num * 30} days`;
    else duration = `${num} days`;
  }

  let notes = '';
  if (/after\s*food|ഭക്ഷണത്തിന്\s*ശേഷം/i.test(input)) notes = 'After food';
  else if (/before\s*food|ഭക്ഷണത്തിന്\s*മുമ്പ്|empty\s*stomach/i.test(input)) notes = 'Before food';

  return {
    name: medName.charAt(0).toUpperCase() + medName.slice(1),
    dosage, frequency, duration, times, notes,
  };
}

export function generateTTSMessage(medName: string, dosage: string): string {
  return `${medName} ${dosage} കഴിക്കാൻ സമയമായി. മറക്കരുത്.`;
}

export function getVitalAlert(type: string, primary: number, secondary: number): string | null {
  switch (type) {
    case 'bp':
      if (primary >= 180 || secondary >= 120) return '🚨 BP വളരെ ഉയർന്നതാണ്! ഉടനെ ഡോക്ടറെ കാണുക.';
      if (primary >= 140 || secondary >= 90) return '⚠️ BP ഉയർന്നതാണ്. വിശ്രമിക്കുക, 30 മിനിറ്റ് കഴിഞ്ഞ് വീണ്ടും നോക്കുക.';
      if (primary < 90 || secondary < 60) return '⚠️ BP കുറവാണ്. വെള്ളം കുടിക്കുക, കിടക്കുക.';
      return null;
    case 'sugar':
      if (primary > 300) return '🚨 ഷുഗർ വളരെ ഉയർന്നതാണ്! ഉടനെ ആശുപത്രിയിൽ പോകുക.';
      if (primary > 200) return '⚠️ ഷുഗർ ഉയർന്നതാണ്. മരുന്ന് കഴിച്ചോ? ഡോക്ടറെ വിളിക്കുക.';
      if (primary < 70) return '🚨 ഷുഗർ വളരെ കുറവാണ്! ഉടനെ മധുരം കഴിക്കുക.';
      return null;
    case 'spo2':
      if (primary < 90) return '🚨 ഓക്സിജൻ വളരെ കുറവാണ്! ഉടനെ ആശുപത്രിയിൽ പോകുക.';
      if (primary < 94) return '⚠️ ഓക്സിജൻ കുറവാണ്. ആഴത്തിൽ ശ്വസിക്കുക. മെച്ചപ്പെട്ടില്ലെങ്കിൽ ഡോക്ടറെ വിളിക്കുക.';
      return null;
    case 'temperature':
      if (primary > 103) return '🚨 പനി വളരെ കൂടുതലാണ്! ഉടനെ ആശുപത്രിയിൽ പോകുക.';
      if (primary > 100.4) return '⚠️ പനിയുണ്ട്. പാരസെറ്റമോൾ കഴിക്കുക, തണുത്ത തുണി വയ്ക്കുക.';
      return null;
    case 'heart_rate':
      if (primary > 120) return '⚠️ ഹൃദയമിടിപ്പ് കൂടുതലാണ്. വിശ്രമിക്കുക.';
      if (primary < 50) return '⚠️ ഹൃദയമിടിപ്പ് കുറവാണ്. തലകറക്കം ഉണ്ടെങ്കിൽ ഡോക്ടറെ വിളിക്കുക.';
      return null;
    default:
      return null;
  }
}
