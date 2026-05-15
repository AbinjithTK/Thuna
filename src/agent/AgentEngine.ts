/**
 * AgentEngine — Executes intents deterministically, builds context for LLM.
 */

import { parseIntent, generateTTSMessage, getVitalAlert, Intent, MedicationData } from './IntentParser';
import { database, Vital, Medication, Condition, Reminder, LabResult, AdherenceLog } from '../db';
import { Q } from '@nozbe/watermelondb';

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

  try {
    switch (intent.type) {
      case 'add_vital': {
        const v = intent.data;
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

        const typeLabel = { bp: 'BP', sugar: 'Sugar', spo2: 'SpO2', temperature: 'Temperature', heart_rate: 'Heart Rate', weight: 'Weight', pain: 'Pain' }[v.type] || v.type;
        const valueStr = v.secondary ? `${v.primary}/${v.secondary}` : `${v.primary}`;
        contextForLLM = `Patient recorded ${typeLabel}: ${valueStr} ${v.unit}${v.context ? ' (' + v.context + ')' : ''}. ${alert ? 'ALERT: ' + alert : 'Value recorded successfully.'}. Respond in nadan Malayalam — acknowledge the reading, mention if normal/abnormal, give brief advice.`;
        break;
      }

      case 'add_medication': {
        const med = intent.data;
        const today = new Date().toISOString().split('T')[0];
        const endDate = med.duration ? calculateEndDate(today, med.duration) : '';

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
            r.ttsMessage = generateTTSMessage(med.name, med.dosage);
            r.isActive = true;
            r.createdAt = Date.now();
          });
        });

        toolsExecuted.push({ tool: 'save_medication', success: true, message: `${med.name} ${med.dosage}` });
        toolsExecuted.push({ tool: 'schedule_reminder', success: true, message: med.times.join(', ') });

        contextForLLM = `Saved medication: ${med.name} ${med.dosage} ${med.frequency}${med.duration ? ' for ' + med.duration : ''}. Reminder set at ${med.times.join(', ')}. ${med.notes ? 'Note: ' + med.notes : ''}. Confirm to user in nadan Malayalam.`;
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
        contextForLLM = meds.length > 0
          ? `Patient's active medications: ${medList}. List them in nadan Malayalam.`
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

      case 'query_reminders': {
        const rems = await database.get<Reminder>('reminders').query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();
        const remList = rems.map(r => `${r.medication} ${r.dosage} at ${r.timeSlots}`).join(', ');
        contextForLLM = rems.length > 0
          ? `Active reminders: ${remList}. Tell them in nadan Malayalam.`
          : `No active reminders. Tell them in nadan Malayalam.`;
        break;
      }

      case 'symptom_report': {
        contextForLLM = `Patient reports: "${userInput}". Respond as nadan Malayalam village doctor — ask 1-2 clarifying questions, give immediate advice, say when to go to hospital. Be brief and direct.`;
        break;
      }

      case 'general_chat':
      default: {
        contextForLLM = `User said: "${userInput}". Respond naturally in nadan Malayalam as a friendly health companion. Be brief, warm, helpful.`;
        break;
      }
    }
  } catch (e: any) {
    toolsExecuted.push({ tool: 'error', success: false, message: e.message });
    contextForLLM = `Error occurred: ${e.message}. Apologize in nadan Malayalam and ask user to try again.`;
  }

  return { intent, toolsExecuted, contextForLLM, alert };
}

function calculateEndDate(startDate: string, duration: string): string {
  const match = duration.match(/(\d+)/);
  if (!match) return '';
  const days = parseInt(match[1], 10);
  const start = new Date(startDate);
  start.setDate(start.getDate() + days);
  return start.toISOString().split('T')[0];
}
