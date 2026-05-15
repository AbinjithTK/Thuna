/**
 * WHO IMCI Triage Protocol — Tool Definitions & Executors
 *
 * These tools are passed to Cactus LM via the `tools` parameter.
 * The model decides which to call based on patient symptoms.
 * All execution happens locally on-device — zero network calls.
 */

import type { CactusLMTool } from 'cactus-react-native';

// ============================================================================
// Tool Schemas (passed to cactusLM.complete({ tools }))
// ============================================================================

export const TRIAGE_TOOLS: CactusLMTool[] = [
  {
    name: 'assess_danger_signs',
    description:
      'Assess general danger signs in a patient based on WHO IMCI protocol. ' +
      'Check for: inability to drink/breastfeed, vomiting everything, convulsions, ' +
      'lethargy/unconsciousness.',
    parameters: {
      type: 'object',
      properties: {
        symptoms: {
          type: 'string',
          description: 'Patient symptoms described by the CHW',
        },
        patient_age: {
          type: 'string',
          description: 'Patient age: infant (0-2mo), child (2mo-5yr), adult (5yr+)',
        },
      },
      required: ['symptoms'],
    },
  },
  {
    name: 'classify_illness',
    description:
      'Classify illness using IMCI tables. Categories: ARI, diarrhea, ' +
      'fever/malaria, malnutrition, ear infection, skin condition.',
    parameters: {
      type: 'object',
      properties: {
        symptoms: {
          type: 'string',
          description: 'Specific symptoms to classify',
        },
        danger_signs_present: {
          type: 'boolean',
          description: 'Whether general danger signs were found',
        },
      },
      required: ['symptoms'],
    },
  },
  {
    name: 'determine_treatment',
    description:
      'Determine first-line treatment based on classification. ' +
      'Returns medication, dosage, and care instructions for CHW level.',
    parameters: {
      type: 'object',
      properties: {
        classification: {
          type: 'string',
          description: 'Illness classification from classify_illness',
        },
        patient_age: {
          type: 'string',
          description: 'Patient age for dosage calculation',
        },
        severity: {
          type: 'string',
          description: 'Severity: mild, moderate, severe',
        },
      },
      required: ['classification'],
    },
  },
  {
    name: 'assign_referral_urgency',
    description:
      'Assign urgency level. Green = treat locally, Yellow = monitor 2 days, ' +
      'Red = refer to health facility immediately.',
    parameters: {
      type: 'object',
      properties: {
        classification: {
          type: 'string',
          description: 'Illness classification',
        },
        danger_signs: {
          type: 'boolean',
          description: 'Whether danger signs are present',
        },
        treatment_available: {
          type: 'boolean',
          description: 'Whether CHW has required supplies',
        },
      },
      required: ['classification', 'danger_signs'],
    },
  },
];

// ============================================================================
// Tool Executors (run locally on-device)
// ============================================================================

export function executeTriageTool(
  toolName: string,
  args: Record<string, any>,
): Record<string, any> {
  switch (toolName) {
    case 'assess_danger_signs':
      return assessDangerSigns(args);
    case 'classify_illness':
      return classifyIllness(args);
    case 'determine_treatment':
      return determineTreatment(args);
    case 'assign_referral_urgency':
      return assignReferralUrgency(args);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

function assessDangerSigns(args: Record<string, any>) {
  const symptoms = (args.symptoms || '').toLowerCase();
  const dangerKeywords = [
    'convulsion', 'seizure', 'unconscious', 'lethargy',
    'cannot drink', 'cannot breastfeed', 'vomiting everything',
    'not eating', 'stiff neck', 'bulging fontanelle',
    'അപസ്മാരം', 'ബോധമില്ല', 'കുടിക്കാൻ കഴിയുന്നില്ല', 'ഛർദ്ദി',
  ];

  const found = dangerKeywords.filter(k => symptoms.includes(k));
  const hasDanger = found.length > 0;

  return {
    danger_signs_present: hasDanger,
    signs_found: found,
    recommendation_ml: hasDanger
      ? 'അടിയന്തരം: അപകട ലക്ഷണങ്ങൾ കണ്ടെത്തി. റഫറൽ മുൻ ചികിത്സ ആവശ്യമാണ്.'
      : 'അപകട ലക്ഷണങ്ങൾ ഇല്ല. രോഗ വർഗ്ഗീകരണം തുടരുക.',
  };
}

function classifyIllness(args: Record<string, any>) {
  const symptoms = (args.symptoms || '').toLowerCase();
  const hasDanger = args.danger_signs_present || false;

  let classification = 'unclassified';
  let severity = 'mild';

  if (/cough|breathing|ചുമ|ശ്വാസം/.test(symptoms)) {
    classification = 'ARI (Acute Respiratory Infection)';
    severity = /fast breathing|chest indrawing/.test(symptoms) ? 'severe' : 'moderate';
  } else if (/diarr|വയറിളക്കം|loose stool/.test(symptoms)) {
    classification = 'Diarrheal Disease';
    severity = /blood|dehydrat/.test(symptoms) ? 'severe' : 'moderate';
  } else if (/fever|പനി|malaria/.test(symptoms)) {
    classification = 'Fever / Possible Malaria';
    severity = /stiff neck/.test(symptoms) || hasDanger ? 'severe' : 'moderate';
  } else if (/rash|skin|wound|ചർമ്മം/.test(symptoms)) {
    classification = 'Skin/Wound Condition';
    severity = /infected/.test(symptoms) ? 'moderate' : 'mild';
  } else if (/ear|ചെവി|discharge/.test(symptoms)) {
    classification = 'Ear Infection';
    severity = 'moderate';
  } else if (/weight|thin|മെലിഞ്ഞ/.test(symptoms)) {
    classification = 'Malnutrition';
    severity = 'moderate';
  }

  if (hasDanger) severity = 'severe';

  return { classification, severity, confidence: hasDanger ? 'high' : 'moderate' };
}

function determineTreatment(args: Record<string, any>) {
  const classification = (args.classification || '').toLowerCase();
  const severity = args.severity || 'mild';

  if (/ari|respiratory/.test(classification)) {
    return {
      medication_ml: severity === 'severe'
        ? 'ആന്റിബയോട്ടിക്കിന്റെ ആദ്യ ഡോസ് (അമോക്സിസിലിൻ). ഉടൻ റഫർ ചെയ്യുക.'
        : 'തൊണ്ട ശമിപ്പിക്കുക. കൂടുതൽ ദ്രാവകങ്ങൾ നൽകുക.',
      home_care: ['Keep child warm', 'Continue feeding', 'Clear nose if blocked'],
    };
  } else if (/diarr/.test(classification)) {
    return {
      medication_ml: 'ORS (ഓറൽ റീഹൈഡ്രേഷൻ സാൾട്ട്സ്) + സിങ്ക്',
      home_care: ['Give ORS after each loose stool', 'Continue breastfeeding', 'Zinc 10-14 days'],
    };
  } else if (/fever|malaria/.test(classification)) {
    return {
      medication_ml: severity === 'severe'
        ? 'ആർട്ടിസുനേറ്റ്/ACT ആദ്യ ഡോസ്. ഉടൻ റഫർ ചെയ്യുക.'
        : 'പനിക്ക് പാരസെറ്റമോൾ. മലേറിയ ടെസ്റ്റ് പോസിറ്റീവ് ആണെങ്കിൽ ACT.',
      home_care: ['Tepid sponging', 'Increase fluids', 'Use bed net'],
    };
  }

  return {
    medication_ml: 'ലക്ഷണാധിഷ്ഠിത ചികിത്സ. 48 മണിക്കൂർ നിരീക്ഷിക്കുക.',
    home_care: ['Rest', 'Monitor symptoms', 'Return in 2 days'],
  };
}

function assignReferralUrgency(args: Record<string, any>) {
  const hasDanger = args.danger_signs || false;
  const treatmentAvailable = args.treatment_available ?? true;
  const classification = (args.classification || '').toLowerCase();

  let urgency: string;
  let referralNeeded: boolean;

  if (hasDanger) {
    urgency = 'red';
    referralNeeded = true;
  } else if (!treatmentAvailable || /severe|unclassified/.test(classification)) {
    urgency = 'yellow';
    referralNeeded = true;
  } else {
    urgency = 'green';
    referralNeeded = false;
  }

  return {
    urgency,
    referral_needed: referralNeeded,
    reason_ml:
      urgency === 'red'
        ? 'അപകട ലക്ഷണങ്ങൾ — ഉടൻ റഫർ ചെയ്യുക'
        : urgency === 'yellow'
          ? 'ക്ലിനിക്കൽ വിലയിരുത്തൽ ആവശ്യമാണ്'
          : 'കമ്മ്യൂണിറ്റി തലത്തിൽ ചികിത്സിക്കാം',
  };
}
