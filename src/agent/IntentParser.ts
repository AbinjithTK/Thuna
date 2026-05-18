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
  | { type: 'stop_medication'; medication: string }
  | { type: 'stop_reminder'; medication: string }
  | { type: 'query_medications'; patientId: string }
  | { type: 'query_conditions'; patientId: string }
  | { type: 'query_reminders'; patientId: string }
  | { type: 'query_vitals'; patientId: string; vitalType?: string }
  | { type: 'query_lab_results'; patientId: string }
  | { type: 'query_adherence'; patientId: string }
  | { type: 'query_today_doses'; patientId: string }
  | { type: 'mark_taken'; medication: string }
  | { type: 'update_profile'; field: string; value: string }
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
  'atenolol', 'ramipril', 'sitagliptin', 'pioglitazone', 'rosuvastatin',
  'lisinopril', 'enalapril', 'vildagliptin', 'gliclazide', 'voglibose',
  'rabeprazole', 'domperidone', 'ondansetron', 'loperamide', 'doxycycline',
  'ciprofloxacin', 'norfloxacin', 'fluconazole', 'aceclofenac', 'diclofenac',
  'tramadol', 'gabapentin', 'pregabalin', 'duloxetine', 'sertraline',
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
  // Blood Pressure: "BP 130/85", "130 by 85", "bp 130 over 85", "ബിപി 130 85", "രക്തസമ്മർദ്ദം 140/90"
  {
    pattern: /(?:bp|blood\s*pressure|ബിപി|രക്തസമ്മർദ്ദം|pressure)\s*:?\s*(\d{2,3})\s*[\/\-by over,\s]\s*(\d{2,3})/i,
    type: 'bp', unit: 'mmHg',
    extractFn: (m) => ({ primary: parseInt(m[1]), secondary: parseInt(m[2]), context: '' }),
  },
  // Standalone "130/85" or "130/80 bp" or "ഇന്ന് 130/90"
  {
    pattern: /(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:mmhg|bp|ബിപി|ആണ്)?/i,
    type: 'bp', unit: 'mmHg',
    extractFn: (m) => {
      const sys = parseInt(m[1]), dia = parseInt(m[2]);
      if (sys >= 70 && sys <= 250 && dia >= 40 && dia <= 150) return { primary: sys, secondary: dia, context: '' };
      return { primary: 0, secondary: 0, context: '' };
    },
  },
  // Blood Sugar: "sugar 145", "ഷുഗർ 180", "പഞ്ചസാര 145", "ഇന്ന് sugar 200", "fasting 110"
  {
    pattern: /(?:sugar|glucose|ഷുഗർ|പഞ്ചസാര|രക്തത്തിലെ\s*പഞ്ചസാര|fasting|pp)\s*:?\s*(\d{2,3})/i,
    type: 'sugar', unit: 'mg/dL',
    extractFn: (m) => ({
      primary: parseInt(m[1]), secondary: 0,
      context: /fasting|ഫാസ്റ്റിംഗ്|empty|വെറും\s*വയറ്/i.test(m.input || '') ? 'fasting' : /pp|post|after\s*food|ഭക്ഷണ.*ശേഷം/i.test(m.input || '') ? 'post-meal' : 'random',
    }),
  },
  // Also catch "ഷുഗർ ഇന്ന് 180 ആണ്" — number after context
  {
    pattern: /(\d{2,3})\s*(?:ആണ്|anu|aayi)?\s*(?:sugar|ഷുഗർ|പഞ്ചസാര)/i,
    type: 'sugar', unit: 'mg/dL',
    extractFn: (m) => ({ primary: parseInt(m[1]), secondary: 0, context: 'random' }),
  },
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
  { keywords: /migraine|headache|തലവേദന/i, name: 'Migraine', icd: 'G43' },
  { keywords: /depression|വിഷാദം/i, name: 'Depression', icd: 'F32' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════════════════════════════

export function parseIntent(input: string): Intent {
  // Input sanitization
  if (!input || typeof input !== 'string') return { type: 'general_chat', text: '' };
  if (input.length > 2000) input = input.slice(0, 2000);
  
  const lower = input.toLowerCase();

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 1: "Did I take medicine today?" — most common elderly question
  // ═══════════════════════════════════════════════════════════════════════
  if (/did i take|did i have|കഴിച്ചോ|എടുത്തോ|ഇന്ന്.*മരുന്ന്|today.*medicine|already.*took|ഇന്ന്.*കഴിച്ച|മരുന്ന്.*കഴിച്ചോ|ഗുളിക.*കഴിച്ചോ|tablet.*കഴിച്ചോ|ഇന്ന്.*എടുത്തോ/i.test(input)) {
    return { type: 'query_today_doses', patientId: 'default' };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 2: Mark medicine as taken — "കഴിച്ചു", "took metformin"
  // ═══════════════════════════════════════════════════════════════════════
  if (/took|taken|കഴിച്ചു|എടുത്തു|had my|മരുന്ന്\s*കഴിച്ചു|ഗുളിക\s*കഴിച്ചു|tablet\s*കഴിച്ചു|medicine\s*കഴിച്ചു/i.test(input) && !/did|ചോ\?|ഓ\?|കഴിച്ചോ/i.test(input)) {
    const med = MEDICATIONS.find(m => lower.includes(m.toLowerCase()));
    if (med) return { type: 'mark_taken', medication: med };
    if (/medicine|med|tablet|മരുന്ന്|ഗുളിക|ടാബ്ലറ്റ്/i.test(input)) {
      return { type: 'mark_taken', medication: 'medicine' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 3: Vital recording — numbers with context (BP 130/90, sugar 180)
  // ═══════════════════════════════════════════════════════════════════════
  for (const vp of VITAL_PATTERNS) {
    const match = input.match(vp.pattern);
    if (match) {
      const extracted = vp.extractFn(match);
      if (extracted.primary > 0) {
        return { type: 'add_vital', data: { type: vp.type, primary: extracted.primary, secondary: extracted.secondary, unit: vp.unit, context: extracted.context } };
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 4: Reminder — broad detection for any scheduling request
  // ═══════════════════════════════════════════════════════════════════════
  const hasReminderWord = /remind|ഓർമ്മ|alarm|അലാറം|schedule|notify|alert|set.*time|timer/i.test(input);
  const hasTimeWord = /\d\s*(am|pm|മണി|o'clock)|morning|evening|night|afternoon|tomorrow|രാവിലെ|വൈകുന്നേരം|രാത്രി|ഉച്ച|നാളെ/i.test(input);
  const hasActionWord = /need to|have to|should|want to|don't forget|must|വേണം|കഴിക്കണം|ചെയ്യണം|പോകണം|എടുക്കണം|മറക്കരുത്/i.test(input);
  const isQueryingReminders = /show|list|what.*reminder|my.*reminder|എന്റെ.*ഓർമ്മ|how many/i.test(input);

  if ((hasReminderWord || (hasTimeWord && hasActionWord)) && !isQueryingReminders) {
    const timeMatch = input.match(/(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?/);
    const hourMatch = input.match(/(\d{1,2})\s*(am|pm|AM|PM|മണി|o'clock)/i);
    const plainNumMatch = input.match(/at\s*(\d{1,2})/i);
    let times = ['08:00'];

    if (timeMatch) {
      let h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2]);
      if (timeMatch[3] && /pm/i.test(timeMatch[3]) && h < 12) h += 12;
      if (timeMatch[3] && /am/i.test(timeMatch[3]) && h === 12) h = 0;
      times = [`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`];
    } else if (hourMatch) {
      let h = parseInt(hourMatch[1]);
      if (/pm/i.test(hourMatch[2]) && h < 12) h += 12;
      if (/am/i.test(hourMatch[2]) && h === 12) h = 0;
      times = [`${h.toString().padStart(2, '0')}:00`];
    } else if (plainNumMatch) {
      let h = parseInt(plainNumMatch[1]);
      if (h <= 6) h += 12; // "at 6" likely means 6pm not 6am
      times = [`${h.toString().padStart(2, '0')}:00`];
    } else if (/morning|രാവിലെ/i.test(input)) { times = ['08:00']; }
    else if (/evening|വൈകുന്നേരം/i.test(input)) { times = ['18:00']; }
    else if (/night|രാത്രി/i.test(input)) { times = ['21:00']; }
    else if (/afternoon|ഉച്ച/i.test(input)) { times = ['14:00']; }

    // Extract title — remove all the trigger words, keep the actual task
    let title = input
      .replace(/remind.*me.*to|remind me|set.*remind|set.*alarm|ഓർമ്മിപ്പിക്ക|ഓർമ്മിപ്പിക്കണം|remind|reminder|alarm|please|at|in the|need to|have to|should|want to|don't forget|must/gi, '')
      .replace(/\d{1,2}:\d{2}\s*(am|pm)?/gi, '')
      .replace(/\d{1,2}\s*(am|pm|മണി|o'clock)/gi, '')
      .replace(/at\s*\d+/gi, '')
      .replace(/morning|evening|night|afternoon|tomorrow|രാവിലെ|വൈകുന്നേരം|രാത്രി|ഉച്ച|നാളെ/gi, '')
      .replace(/വേണം|കഴിക്കണം|ചെയ്യണം|പോകണം|എടുക്കണം|മറക്കരുത്/gi, '')
      .replace(/to\s+/gi, '')
      .trim();
    if (!title || title.length < 2) title = 'Reminder';

    return { type: 'set_reminder', data: { medication: title, dosage: '', times, durationDays: 30, ttsMessage: `${title} — സമയമായി` } };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 5: Stop medication/reminder
  // ═══════════════════════════════════════════════════════════════════════
  if (/stop.*med|remove.*med|discontinue|നിർത്ത.*മരുന്ന്|മരുന്ന്.*നിർത്ത|no more/i.test(input)) {
    const med = MEDICATIONS.find(m => lower.includes(m.toLowerCase()));
    if (med) return { type: 'stop_medication', medication: med };
  }
  if (/stop.*remind|cancel.*remind|remove.*remind|delete.*remind|റിമൈൻഡർ.*നിർത്ത|alarm.*off/i.test(input)) {
    const med = MEDICATIONS.find(m => lower.includes(m.toLowerCase()));
    return { type: 'stop_reminder', medication: med || '' };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 6: Lab results
  // ═══════════════════════════════════════════════════════════════════════
  for (const lp of LAB_PATTERNS) {
    const match = input.match(lp.pattern);
    if (match && match[1]) {
      return { type: 'add_lab_result', data: { testName: lp.testName, value: parseFloat(match[1]), unit: lp.unit, refLow: lp.refLow, refHigh: lp.refHigh } };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 7: Medication addition (needs medicine name + dosage)
  // ═══════════════════════════════════════════════════════════════════════
  const medMatch = MEDICATIONS.find(med => lower.includes(med.toLowerCase()));
  if (medMatch && DOSAGE_PATTERN.test(input)) {
    return { type: 'add_medication', data: extractMedication(input, medMatch) };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 8: Condition addition ("I have diabetes")
  // ═══════════════════════════════════════════════════════════════════════
  for (const cond of CONDITIONS) {
    if (cond.keywords.test(input) && /have|diagnosed|i have|എനിക്ക്|ഉണ്ട്|ആണ്|രോഗം|disease|problem/i.test(input)) {
      return { type: 'add_condition', data: { name: cond.name, severity: /severe|serious|ഗുരുതര|കഠിനം/i.test(input) ? 'severe' : 'moderate', icdCode: cond.icd } };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 9: Queries (read data back) — Malayalam + English
  // ═══════════════════════════════════════════════════════════════════════
  if (/what.*medication|my.*med|medicine.*taking|മരുന്ന്.*എന്ത|show.*med|എന്റെ.*മരുന്ന്|എന്ത്.*മരുന്ന്|ഏത്.*മരുന്ന്|മരുന്ന്.*ലിസ്റ്റ്|medicine.*list/i.test(input)) {
    return { type: 'query_medications', patientId: 'default' };
  }
  if (/what.*condition|my.*disease|health.*issue|രോഗ.*എന്ത|condition|എന്റെ.*രോഗ|എന്ത്.*രോഗം|ആരോഗ്യ.*പ്രശ്നം|disease/i.test(input)) {
    return { type: 'query_conditions', patientId: 'default' };
  }
  if (/my.*reminder|show.*reminder|list.*reminder|what.*reminder|എന്റെ.*ഓർമ്മ|when.*take|എപ്പോൾ.*കഴിക്ക|ഓർമ്മ.*ലിസ്റ്റ്|reminder.*list/i.test(input)) {
    return { type: 'query_reminders', patientId: 'default' };
  }
  if (/vitals?|readings?|bp.*history|sugar.*history|my.*bp|my.*sugar|എന്റെ.*bp|എന്റെ.*ഷുഗർ|ബിപി.*എത്ര|ഷുഗർ.*എത്ര|രക്തസമ്മർദ്ദം|പഞ്ചസാര/i.test(input)) {
    let vitalType: string | undefined;
    if (/bp|pressure|ബിപി|രക്തസമ്മർദ്ദം/i.test(input)) vitalType = 'bp';
    if (/sugar|glucose|ഷുഗർ|പഞ്ചസാര/i.test(input)) vitalType = 'sugar';
    if (/spo2|oxygen|ഓക്സിജൻ/i.test(input)) vitalType = 'spo2';
    return { type: 'query_vitals', patientId: 'default', vitalType };
  }
  if (/lab.*result|test.*result|report|ടെസ്റ്റ്.*റിസൾട്ട്|ലാബ്|പരിശോധന.*ഫലം|blood.*test/i.test(input)) {
    return { type: 'query_lab_results', patientId: 'default' };
  }
  if (/adherence|compliance|how.*regular|എത്ര.*കഴിച്ചു|track|മരുന്ന്.*മുടങ്ങി|regular.*ആയി/i.test(input)) {
    return { type: 'query_adherence', patientId: 'default' };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 10: Profile updates
  // ═══════════════════════════════════════════════════════════════════════
  if (/my.*age.*is|i am.*years|എന്റെ.*പ്രായം/i.test(input)) {
    const ageMatch = input.match(/(\d{1,3})\s*(?:years?|yrs?|വയസ്സ്)?/i);
    if (ageMatch) return { type: 'update_profile', field: 'age', value: ageMatch[1] };
  }
  if (/blood.*group|രക്ത.*ഗ്രൂപ്പ്/i.test(input)) {
    const bgMatch = input.match(/(A|B|AB|O)[+-]/i);
    if (bgMatch) return { type: 'update_profile', field: 'bloodGroup', value: bgMatch[0].toUpperCase() };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 11: Symptoms (save to timeline) — expanded Malayalam
  // ═══════════════════════════════════════════════════════════════════════
  if (/fever|cough|pain|headache|vomit|diarr|rash|breathing|dizz|nausea|tired|weak|swelling|itching|burning|cold|sore|cramp|stiff|numb|bleed|പനി|ചുമ|വേദന|ഛർദ്ദി|തലവേദന|ശ്വാസം|ക്ഷീണം|നീർക്കെട്ട്|ചൊറിച്ചിൽ|വയറുവേദന|നെഞ്ചുവേദന|കാൽവേദന|മുതുകുവേദന|തലചുറ്റൽ|ഓക്കാനം|വിറയൽ|ജലദോഷം|തൊണ്ടവേദന|ശരീരവേദന|ഉറക്കമില്ല|വിശപ്പില്ല|ക്ഷീണം|ബലഹീനത/i.test(input)) {
    return { type: 'symptom_report', symptoms: input };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DEFAULT: General chat — let LLM handle naturally
  // ═══════════════════════════════════════════════════════════════════════
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

export function generateTTSMessage(medName: string, dosage: string, notes?: string): string {
  let message = `${medName} ${dosage} കഴിക്കാൻ സമയമായി.`;

  // Add food instructions if available
  if (notes) {
    if (/after\s*food|ഭക്ഷണത്തിന്\s*ശേഷം/i.test(notes)) {
      message += ' ഭക്ഷണം കഴിച്ചതിന് ശേഷം കഴിക്കുക.';
    } else if (/before\s*food|ഭക്ഷണത്തിന്\s*മുമ്പ്|empty/i.test(notes)) {
      message += ' ഭക്ഷണത്തിന് മുമ്പ് കഴിക്കുക.';
    } else if (notes.trim()) {
      message += ` ${notes}.`;
    }
  }

  message += ' മറക്കരുത്.';
  return message;
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
