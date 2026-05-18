/**
 * AgentEngine — Executes intents deterministically, builds context for LLM.
 */

import { parseIntent, generateTTSMessage, getVitalAlert, Intent, MedicationData } from './IntentParser';
import { database, Vital, Medication, Condition, Reminder, LabResult, AdherenceLog } from '../db';
import { Q } from '@nozbe/watermelondb';
import { detectDeviceAction, executeDeviceAction } from '../services/DeviceActions';

export interface AgentResult {
  intent: Intent;
  toolsExecuted: Array<{ tool: string; success: boolean; message?: string }>;
  contextForLLM: string;
  alert?: string; // Critical health alert to show prominently
}

export async function runAgent(userInput: string, patientId: string = 'default'): Promise<AgentResult> {
  const intent = parseIntent(userInput);
  const toolsExecuted: Array<{ tool: string; success: boolean; message?: string }> = [];
  let contextForLLM = '';
  let alert: string | undefined;

  // ── Device Actions (call, open app, flashlight, youtube) — check FIRST ──
  const deviceAction = detectDeviceAction(userInput);
  if (deviceAction) {
    const result = await executeDeviceAction(deviceAction);
    toolsExecuted.push({ tool: `device_${deviceAction.type}`, success: result.executed, message: result.message });

    if (deviceAction.type === 'call') {
      contextForLLM = result.executed
        ? `Phone dialer opened for "${deviceAction.target}". Confirm briefly in Malayalam.`
        : `Could not call "${deviceAction.target}". Ask user to check the number. Respond in Malayalam.`;
    } else if (deviceAction.type === 'youtube_search') {
      contextForLLM = result.executed
        ? `YouTube opened with search: "${deviceAction.target}". Say something fun in Malayalam like "enjoy ചെയ്യൂ!" Keep it very short.`
        : `Could not open YouTube. Suggest user open manually. Malayalam.`;
    } else if (deviceAction.type === 'open_app') {
      contextForLLM = result.executed
        ? `${result.message} Confirm in one short Malayalam sentence.`
        : `${result.message} Respond helpfully in Malayalam.`;
    } else if (deviceAction.type === 'flashlight') {
      contextForLLM = `${result.message} Respond in Malayalam.`;
    }

    return { intent, toolsExecuted, contextForLLM, alert };
  }

  // Check for compound intents — user might mention multiple things
  const secondaryIntents = extractSecondaryIntents(userInput, intent);

  try {
    switch (intent.type) {
      case 'add_vital': {
        const v = intent.data;
        
        // Get previous readings for trend analysis
        const previousVitals = await database.get<Vital>('vitals')
          .query(Q.where('patient_id', patientId), Q.where('vital_type', v.type), Q.sortBy('recorded_at', Q.desc), Q.take(3))
          .fetch();

        await database.write(async () => {
          await database.get<Vital>('vitals').create((r: any) => {
            r.patientId = patientId;
            r.vitalType = v.type;
            r.valuePrimary = v.primary;
            r.valueSecondary = v.secondary;
            r.unit = v.unit;
            r.context = v.context;
            r.notes = '';
            r.recordedAt = Date.now();
          });
        });
        toolsExecuted.push({ tool: 'save_vital', success: true, message: `${v.type}: ${v.primary}${v.secondary ? '/' + v.secondary : ''} ${v.unit}` });

        // Check for critical alerts
        alert = getVitalAlert(v.type, v.primary, v.secondary) || undefined;

        // Trend analysis
        let trendInfo = '';
        if (previousVitals.length >= 2) {
          const prevValue = previousVitals[0].valuePrimary;
          const diff = v.primary - prevValue;
          if (Math.abs(diff) > 0) {
            const direction = diff > 0 ? 'increased' : 'decreased';
            trendInfo = ` Trend: ${direction} by ${Math.abs(diff)} from last reading (${prevValue}${v.unit}).`;
            if (previousVitals.length >= 3) {
              const avg = previousVitals.reduce((sum, vt) => sum + vt.valuePrimary, 0) / previousVitals.length;
              trendInfo += ` 3-reading average: ${Math.round(avg)}${v.unit}.`;
            }
          }
        }

        const typeLabel = { bp: 'BP', sugar: 'Sugar', spo2: 'SpO2', temperature: 'Temperature', heart_rate: 'Heart Rate', weight: 'Weight', pain: 'Pain' }[v.type] || v.type;
        const valueStr = v.secondary ? `${v.primary}/${v.secondary}` : `${v.primary}`;
        contextForLLM = `Patient recorded ${typeLabel}: ${valueStr} ${v.unit}${v.context ? ' (' + v.context + ')' : ''}. ${alert ? 'ALERT: ' + alert : 'Value recorded successfully.'}${trendInfo} Respond in nadan Malayalam — acknowledge the reading, mention if normal/abnormal, note the trend if relevant, give brief advice.`;
        break;
      }

      case 'add_medication': {
        const med = intent.data;
        const today = new Date().toISOString().split('T')[0];
        const endDate = med.duration ? calculateEndDate(today, med.duration) : '';

        // Check for potential drug interactions with existing medications
        const existingMeds = await database.get<Medication>('medications')
          .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();
        const interactionWarning = checkDrugInteractions(med.name, existingMeds.map(m => m.name));

        await database.write(async () => {
          await database.get<Medication>('medications').create((r: any) => {
            r.patientId = patientId;
            r.name = med.name;
            r.dosage = med.dosage;
            r.frequency = med.frequency;
            r.route = 'oral';
            r.prescribedDate = today;
            r.endDate = endDate;
            r.prescriber = '';
            r.reason = '';
            r.notes = med.notes;
            r.isActive = true;
            r.createdAt = Date.now();
          });

          // Auto-create reminder
          await database.get<Reminder>('reminders').create((r: any) => {
            r.reminderId = `rem_${Date.now()}`;
            r.patientId = patientId;
            r.reminderType = 'medication';
            r.medication = med.name;
            r.dosage = med.dosage;
            r.timeSlots = JSON.stringify(med.times);
            r.startDate = today;
            r.endDate = endDate;
            r.ttsMessage = generateTTSMessage(med.name, med.dosage, med.notes);
            r.isActive = true;
            r.createdAt = Date.now();
          });
        });

        toolsExecuted.push({ tool: 'save_medication', success: true, message: `${med.name} ${med.dosage}` });
        toolsExecuted.push({ tool: 'schedule_reminder', success: true, message: med.times.join(', ') });
        if (interactionWarning) {
          toolsExecuted.push({ tool: 'drug_interaction_check', success: true, message: interactionWarning });
        }

        contextForLLM = `Saved medication: ${med.name} ${med.dosage} ${med.frequency}${med.duration ? ' for ' + med.duration : ''}. Reminder set at ${med.times.join(', ')}. ${med.notes ? 'Note: ' + med.notes : ''}${interactionWarning ? '. ⚠️ INTERACTION WARNING: ' + interactionWarning : ''}. Confirm to user in nadan Malayalam.${interactionWarning ? ' Mention the interaction warning clearly.' : ''}`;
        if (interactionWarning) alert = interactionWarning;
        break;
      }

      case 'add_condition': {
        const cond = intent.data;
        await database.write(async () => {
          await database.get<Condition>('conditions').create((r: any) => {
            r.patientId = patientId;
            r.conditionName = cond.name;
            r.icdCode = cond.icdCode;
            r.diagnosedDate = new Date().toISOString().split('T')[0];
            r.severity = cond.severity;
            r.status = 'active';
            r.treatingDoctor = '';
            r.notes = '';
            r.createdAt = Date.now();
          });
        });
        toolsExecuted.push({ tool: 'save_condition', success: true, message: cond.name });

        contextForLLM = `Recorded condition: ${cond.name} (${cond.severity}, ICD: ${cond.icdCode}). Ask follow-up: when diagnosed, current treatment, any recent tests. Respond in nadan Malayalam.`;
        break;
      }

      case 'add_lab_result': {
        const lab = intent.data;
        const isAbnormal = lab.value < lab.refLow || lab.value > lab.refHigh;

        await database.write(async () => {
          await database.get<LabResult>('lab_results').create((r: any) => {
            r.patientId = patientId;
            r.testName = lab.testName;
            r.value = lab.value;
            r.unit = lab.unit;
            r.referenceLow = lab.refLow;
            r.referenceHigh = lab.refHigh;
            r.isAbnormal = isAbnormal;
            r.labName = '';
            r.testDate = new Date().toISOString().split('T')[0];
            r.notes = '';
            r.createdAt = Date.now();
          });
        });
        toolsExecuted.push({ tool: 'save_lab_result', success: true, message: `${lab.testName}: ${lab.value} ${lab.unit}` });

        contextForLLM = `Lab result recorded: ${lab.testName} = ${lab.value} ${lab.unit} (normal range: ${lab.refLow}-${lab.refHigh}). ${isAbnormal ? 'ABNORMAL — outside normal range.' : 'Within normal range.'} Explain to user in nadan Malayalam what this means.`;
        break;
      }

      case 'mark_taken': {
        await database.write(async () => {
          await database.get<AdherenceLog>('adherence_log').create((r: any) => {
            r.patientId = patientId;
            r.medicationName = intent.medication;
            r.scheduledTime = '';
            r.takenAt = Date.now();
            r.status = 'taken';
            r.date = new Date().toISOString().split('T')[0];
          });
        });
        toolsExecuted.push({ tool: 'log_adherence', success: true, message: intent.medication });
        contextForLLM = `Patient confirmed taking ${intent.medication}. Acknowledge in nadan Malayalam, encourage them.`;
        break;
      }

      case 'query_medications': {
        const meds = await database.get<Medication>('medications').query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();
        const medList = meds.map(m => `${m.name} ${m.dosage} (${m.frequency})`).join(', ');

        // Calculate adherence for last 7 days
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const adherenceLogs = await database.get<AdherenceLog>('adherence_log')
          .query(Q.where('patient_id', patientId), Q.where('taken_at', Q.gte(weekAgo.getTime()))).fetch();
        const adherenceInfo = adherenceLogs.length > 0
          ? ` Adherence this week: ${adherenceLogs.length} doses logged.`
          : '';

        contextForLLM = meds.length > 0
          ? `Patient's active medications: ${medList}.${adherenceInfo} List them in nadan Malayalam. If adherence is low, gently encourage.`
          : `No medications recorded. Tell them in nadan Malayalam.`;
        break;
      }

      case 'query_conditions': {
        const conds = await database.get<Condition>('conditions').query(Q.where('patient_id', patientId)).fetch();
        const condList = conds.map(c => `${c.conditionName} (${c.status})`).join(', ');
        contextForLLM = conds.length > 0
          ? `Patient's conditions: ${condList}. Summarize in nadan Malayalam.`
          : `No conditions recorded. Tell them in nadan Malayalam.`;
        break;
      }

      case 'query_vitals': {
        const vitals = await database.get<Vital>('vitals').query(
          Q.where('patient_id', patientId),
          Q.sortBy('recorded_at', Q.desc),
          Q.take(5),
        ).fetch();
        const vitalList = vitals.map(v => {
          const val = v.valueSecondary ? `${v.valuePrimary}/${v.valueSecondary}` : `${v.valuePrimary}`;
          return `${v.vitalType}: ${val} ${v.unit} (${new Date(v.recordedAt).toLocaleDateString()})`;
        }).join(', ');
        contextForLLM = vitals.length > 0
          ? `Recent vitals: ${vitalList}. Summarize trends in nadan Malayalam.`
          : `No vitals recorded yet. Tell them in nadan Malayalam.`;
        break;
      }

      case 'query_today_doses': {
        const today = new Date().toISOString().split('T')[0];
        const todayLogs = await database.get<AdherenceLog>('adherence_log')
          .query(Q.where('patient_id', patientId), Q.where('date', today)).fetch();
        const activeMeds = await database.get<Medication>('medications')
          .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();

        if (todayLogs.length > 0) {
          const takenList = todayLogs.map(l => {
            const time = new Date(l.takenAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            return `${l.medicationName} (${time})`;
          }).join(', ');
          const remaining = activeMeds.filter(m => !todayLogs.some(l => l.medicationName.toLowerCase() === m.name.toLowerCase()));
          const remainingInfo = remaining.length > 0 ? ` ഇനി കഴിക്കേണ്ടത്: ${remaining.map(m => `${m.name} ${m.dosage}`).join(', ')}.` : ' ഇന്നത്തെ എല്ലാ മരുന്നും കഴിച്ചു!';
          contextForLLM = `ഇന്ന് കഴിച്ച മരുന്നുകൾ: ${takenList}.${remainingInfo} Tell them clearly in Malayalam what they took and what's remaining.`;
        } else {
          const medList = activeMeds.map(m => `${m.name} ${m.dosage}`).join(', ');
          contextForLLM = activeMeds.length > 0
            ? `ഇന്ന് ഇതുവരെ ഒരു മരുന്നും record ചെയ്തിട്ടില്ല. Active medications: ${medList}. Tell them in Malayalam — they haven't logged any dose today. Remind them gently.`
            : `No medications recorded. Tell them in Malayalam.`;
        }
        break;
      }

      case 'query_reminders': {
        const rems = await database.get<Reminder>('reminders').query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();
        const remList = rems.map(r => `${r.medication} ${r.dosage} at ${r.timeSlots}`).join(', ');
        contextForLLM = rems.length > 0
          ? `Active reminders: ${remList}. Tell them in nadan Malayalam.`
          : `No active reminders. Tell them in nadan Malayalam.`;
        break;
      }

      case 'query_lab_results': {
        const labs = await database.get<LabResult>('lab_results')
          .query(Q.where('patient_id', patientId), Q.sortBy('created_at', Q.desc), Q.take(5)).fetch();
        const labList = labs.map(l => {
          const flag = l.isAbnormal ? '⚠️' : '✓';
          return `${l.testName}: ${l.value} ${l.unit} (ref: ${l.referenceLow}-${l.referenceHigh}) ${flag} [${l.testDate}]`;
        }).join(', ');
        contextForLLM = labs.length > 0
          ? `Recent lab results: ${labList}. Explain each in nadan Malayalam — which are normal, which need attention.`
          : `No lab results recorded. Tell them in nadan Malayalam.`;
        break;
      }

      case 'query_adherence': {
        const weekAgo2 = new Date();
        weekAgo2.setDate(weekAgo2.getDate() - 7);
        const logs = await database.get<AdherenceLog>('adherence_log')
          .query(Q.where('patient_id', patientId), Q.where('taken_at', Q.gte(weekAgo2.getTime())), Q.sortBy('taken_at', Q.desc)).fetch();
        const activeMeds = await database.get<Medication>('medications')
          .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();
        const expectedPerDay = activeMeds.length; // Simplified: 1 dose per med per day
        const expectedWeek = expectedPerDay * 7;
        const rate = expectedWeek > 0 ? Math.round((logs.length / expectedWeek) * 100) : 0;
        const recentLogs = logs.slice(0, 5).map(l => `${l.medicationName} (${new Date(l.takenAt).toLocaleDateString()})`).join(', ');
        contextForLLM = `Adherence rate this week: ${rate}% (${logs.length} doses logged out of ~${expectedWeek} expected). Recent: ${recentLogs || 'none'}. Summarize in nadan Malayalam. If rate is low, gently encourage. If high, praise them.`;
        break;
      }

      case 'stop_medication': {
        const medName = intent.medication;
        const medsToStop = await database.get<Medication>('medications')
          .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();
        const matchedMed = medsToStop.find(m => m.name.toLowerCase().includes(medName.toLowerCase()));

        if (matchedMed) {
          await database.write(async () => {
            await matchedMed.update((r: any) => { r.isActive = false; });
          });
          // Also deactivate related reminders
          const relatedReminders = await database.get<Reminder>('reminders')
            .query(Q.where('patient_id', patientId), Q.where('medication', matchedMed.name), Q.where('is_active', true)).fetch();
          for (const rem of relatedReminders) {
            await database.write(async () => { await rem.update((r: any) => { r.isActive = false; }); });
          }
          toolsExecuted.push({ tool: 'stop_medication', success: true, message: matchedMed.name });
          toolsExecuted.push({ tool: 'stop_reminder', success: true, message: `${relatedReminders.length} reminders deactivated` });
          contextForLLM = `Stopped medication: ${matchedMed.name} ${matchedMed.dosage}. ${relatedReminders.length} related reminder(s) also deactivated. Confirm in nadan Malayalam. Ask if doctor advised stopping.`;
        } else {
          contextForLLM = `Could not find active medication matching "${medName}". Ask user to clarify which medicine to stop. Respond in nadan Malayalam.`;
        }
        break;
      }

      case 'stop_reminder': {
        const remMed = intent.medication;
        const remsToStop = await database.get<Reminder>('reminders')
          .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();
        const matchedRem = remMed
          ? remsToStop.find(r => r.medication?.toLowerCase().includes(remMed.toLowerCase()))
          : remsToStop[remsToStop.length - 1]; // Stop most recent if no specific med

        if (matchedRem) {
          await database.write(async () => {
            await matchedRem.update((r: any) => { r.isActive = false; });
          });
          toolsExecuted.push({ tool: 'stop_reminder', success: true, message: matchedRem.medication });
          contextForLLM = `Reminder for ${matchedRem.medication} stopped. Confirm in nadan Malayalam.`;
        } else {
          contextForLLM = `No active reminder found${remMed ? ` for "${remMed}"` : ''}. Tell them in nadan Malayalam.`;
        }
        break;
      }

      case 'set_reminder': {
        const remData = intent.data;
        const today = new Date().toISOString().split('T')[0];
        await database.write(async () => {
          await database.get<Reminder>('reminders').create((r: any) => {
            r.reminderId = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            r.patientId = patientId;
            r.reminderType = 'custom';
            r.medication = remData.medication;
            r.dosage = remData.dosage;
            r.timeSlots = JSON.stringify(remData.times);
            r.startDate = today;
            r.endDate = '';
            r.ttsMessage = remData.ttsMessage;
            r.isActive = true;
            r.createdAt = Date.now();
          });
        });
        toolsExecuted.push({ tool: 'set_reminder', success: true, message: `${remData.medication} at ${remData.times.join(', ')}` });
        contextForLLM = `Reminder set: "${remData.medication}" at ${remData.times.join(', ')}. Confirm in nadan Malayalam.`;
        break;
      }

      case 'update_profile': {
        // Profile updates are handled via UserContext, not DB directly
        // We pass the info to the LLM to confirm and the UI handles the actual update
        toolsExecuted.push({ tool: 'update_profile', success: true, message: `${intent.field}: ${intent.value}` });
        contextForLLM = `Patient wants to update their ${intent.field} to "${intent.value}". Acknowledge in nadan Malayalam and confirm the update was noted.`;
        break;
      }

      case 'symptom_report': {
        // Save symptom to EHR records so it appears in timeline
        const today = new Date().toISOString().split('T')[0];
        await database.write(async () => {
          await database.get<Vital>('vitals').create((r: any) => {
            r.patientId = patientId;
            r.vitalType = 'symptom';
            r.valuePrimary = 1; // presence flag
            r.valueSecondary = 0;
            r.unit = '';
            r.context = userInput.slice(0, 200); // Store the symptom description
            r.notes = today;
            r.recordedAt = Date.now();
          });
        });
        toolsExecuted.push({ tool: 'save_symptom', success: true, message: userInput.slice(0, 50) });

        // Brief context — only conditions, not full history dump
        const symConditions = await database.get<Condition>('conditions')
          .query(Q.where('patient_id', patientId)).fetch();
        const symCondNames = symConditions.map(c => c.conditionName).join(', ');
        const symNote = symCondNames ? ` Patient has: ${symCondNames}.` : '';

        contextForLLM = `Patient reports: ${userInput}.${symNote} Symptom recorded. Respond in Malayalam — short, warm. If mild, home care. If concerning, suggest doctor.`;
        break;
      }

      case 'general_chat':
      default: {
        // For general chat — just pass the user's message directly.
        // NO patient context injection. Let the LLM be a natural conversationalist.
        // The system prompt already defines the personality.
        contextForLLM = userInput;
        break;
      }
    }
  } catch (e: any) {
    toolsExecuted.push({ tool: 'error', success: false, message: e.message });
    contextForLLM = `Error occurred: ${e.message}. Apologize in nadan Malayalam and ask user to try again.`;
  }

  return { intent, toolsExecuted, contextForLLM, alert };
}

/**
 * Extract secondary intents from compound messages.
 * E.g., "BP 130/85 and sugar 145" should record both vitals.
 */
function extractSecondaryIntents(input: string, primaryIntent: Intent): Intent[] {
  const secondary: Intent[] = [];

  // If primary is a vital, check for additional vitals in the same message
  if (primaryIntent.type === 'add_vital') {
    const vitalPatterns = [
      { pattern: /(?:bp|blood\s*pressure|ബിപി)\s*:?\s*(\d{2,3})\s*[\/\-]\s*(\d{2,3})/i, type: 'bp' },
      { pattern: /(?:sugar|glucose|ഷുഗർ)\s*:?\s*(\d{2,3})/i, type: 'sugar' },
      { pattern: /(?:spo2|oxygen|ഓക്സിജൻ)\s*:?\s*(\d{2,3})/i, type: 'spo2' },
      { pattern: /(?:temp|temperature|fever|പനി)\s*:?\s*(\d{2,3}\.?\d?)/i, type: 'temperature' },
      { pattern: /(?:pulse|heart\s*rate|hr|പൾസ്)\s*:?\s*(\d{2,3})/i, type: 'heart_rate' },
    ];

    let matchCount = 0;
    for (const vp of vitalPatterns) {
      if (vp.pattern.test(input) && vp.type !== primaryIntent.data.type) {
        matchCount++;
        if (matchCount > 0) {
          const secondaryIntent = parseIntent(input.replace(primaryIntent.data.type === 'bp' ? /\d{2,3}\s*\/\s*\d{2,3}/ : /\d+/, ''));
          if (secondaryIntent.type === 'add_vital' && secondaryIntent.data.type !== primaryIntent.data.type) {
            secondary.push(secondaryIntent);
          }
        }
      }
    }
  }

  // Check if there's a query intent alongside a data-entry intent
  if (primaryIntent.type !== 'general_chat' && primaryIntent.type !== 'symptom_report') {
    if (/what.*med|my.*med|medicine.*taking|മരുന്ന്.*എന്ത/i.test(input) && primaryIntent.type !== 'query_medications') {
      secondary.push({ type: 'query_medications', patientId: 'default' });
    }
    if (/reminder|alarm|when.*take|ഓർമ്മ/i.test(input) && primaryIntent.type !== 'query_reminders') {
      secondary.push({ type: 'query_reminders', patientId: 'default' });
    }
  }

  return secondary;
}

/**
 * Get full patient context for symptom analysis.
 * Includes conditions, medications, and recent vitals.
 */
async function getPatientContext(patientId: string): Promise<string> {
  try {
    const conditions = await database.get<Condition>('conditions')
      .query(Q.where('patient_id', patientId)).fetch();
    const medications = await database.get<Medication>('medications')
      .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();
    const recentVitals = await database.get<Vital>('vitals')
      .query(Q.where('patient_id', patientId), Q.sortBy('recorded_at', Q.desc), Q.take(3)).fetch();

    const parts: string[] = [];
    if (conditions.length > 0) {
      parts.push(`Conditions: ${conditions.map(c => c.conditionName).join(', ')}`);
    }
    if (medications.length > 0) {
      parts.push(`Current medications: ${medications.map(m => `${m.name} ${m.dosage}`).join(', ')}`);
    }
    if (recentVitals.length > 0) {
      parts.push(`Recent vitals: ${recentVitals.map(v => {
        const val = v.valueSecondary ? `${v.valuePrimary}/${v.valueSecondary}` : `${v.valuePrimary}`;
        return `${v.vitalType}=${val}${v.unit}`;
      }).join(', ')}`);
    }

    return parts.length > 0 ? `[Patient history: ${parts.join('. ')}]` : '';
  } catch {
    return '';
  }
}

/**
 * Get light patient context (just conditions) for general chat personalization.
 */
async function getLightPatientContext(patientId: string): Promise<string> {
  try {
    const conditions = await database.get<Condition>('conditions')
      .query(Q.where('patient_id', patientId)).fetch();
    if (conditions.length > 0) {
      return `Has: ${conditions.map(c => c.conditionName).join(', ')}`;
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Basic drug interaction checker — flags known dangerous combinations.
 * This runs entirely on-device with no network calls.
 */
function checkDrugInteractions(newMed: string, existingMeds: string[]): string | null {
  const lower = newMed.toLowerCase();
  const existing = existingMeds.map(m => m.toLowerCase());

  // Known dangerous interactions (simplified clinical database)
  const INTERACTIONS: Array<{ drugs: string[]; warning: string }> = [
    { drugs: ['warfarin', 'aspirin'], warning: 'Warfarin + Aspirin: Increased bleeding risk. Consult doctor.' },
    { drugs: ['warfarin', 'ibuprofen'], warning: 'Warfarin + Ibuprofen: High bleeding risk. Avoid combination.' },
    { drugs: ['metformin', 'alcohol'], warning: 'Metformin + Alcohol: Risk of lactic acidosis.' },
    { drugs: ['amlodipine', 'atorvastatin'], warning: 'Amlodipine + Atorvastatin: Monitor for muscle pain (myopathy).' },
    { drugs: ['losartan', 'potassium'], warning: 'Losartan + Potassium: Risk of hyperkalemia. Monitor levels.' },
    { drugs: ['metformin', 'glimepiride'], warning: 'Metformin + Glimepiride: Monitor for hypoglycemia (low sugar).' },
    { drugs: ['aspirin', 'clopidogrel'], warning: 'Aspirin + Clopidogrel: Increased bleeding risk. Usually intentional but monitor.' },
    { drugs: ['ramipril', 'losartan'], warning: 'ACE inhibitor + ARB: Dual RAAS blockade. Risk of kidney injury.' },
    { drugs: ['ramipril', 'telmisartan'], warning: 'ACE inhibitor + ARB: Dual RAAS blockade. Risk of kidney injury.' },
    { drugs: ['enalapril', 'losartan'], warning: 'ACE inhibitor + ARB: Dual RAAS blockade. Risk of kidney injury.' },
    { drugs: ['ciprofloxacin', 'theophylline'], warning: 'Ciprofloxacin + Theophylline: Toxic theophylline levels.' },
    { drugs: ['omeprazole', 'clopidogrel'], warning: 'Omeprazole reduces Clopidogrel effectiveness. Use pantoprazole instead.' },
    { drugs: ['gabapentin', 'pregabalin'], warning: 'Gabapentin + Pregabalin: Duplicate therapy. Excessive sedation risk.' },
    { drugs: ['tramadol', 'sertraline'], warning: 'Tramadol + SSRI: Serotonin syndrome risk. Monitor closely.' },
    { drugs: ['tramadol', 'duloxetine'], warning: 'Tramadol + SNRI: Serotonin syndrome risk. Monitor closely.' },
  ];

  for (const interaction of INTERACTIONS) {
    const [drug1, drug2] = interaction.drugs;
    if (
      (lower.includes(drug1) && existing.some(e => e.includes(drug2))) ||
      (lower.includes(drug2) && existing.some(e => e.includes(drug1)))
    ) {
      return interaction.warning;
    }
  }

  // Check for duplicate therapy (same drug being added again)
  if (existing.some(e => e === lower)) {
    return `${newMed} is already in your active medications. Duplicate?`;
  }

  return null;
}

function calculateEndDate(startDate: string, duration: string): string {
  const match = duration.match(/(\d+)/);
  if (!match) return '';
  const days = parseInt(match[1], 10);
  const start = new Date(startDate);
  start.setDate(start.getDate() + days);
  return start.toISOString().split('T')[0];
}
