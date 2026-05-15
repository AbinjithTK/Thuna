/**
 * AgentEngine — The real backend logic.
 * 
 * Architecture:
 * 1. User input → IntentParser (deterministic, fast)
 * 2. Based on intent → execute database operations
 * 3. Build context from DB results
 * 4. Pass context + user input to Gemma 4 for natural response generation
 * 
 * This separates "doing things" (deterministic) from "talking" (LLM).
 * The LLM never needs to call tools — it just generates the response.
 */

import { parseIntent, generateTTSMessage, Intent, MedicationData } from './IntentParser';
import { executeAgentTool } from '../tools/agentTools';

export interface AgentResult {
  intent: Intent;
  toolsExecuted: Array<{ tool: string; success: boolean; message?: string }>;
  contextForLLM: string;
  directResponse?: string; // If we can respond without LLM
}

export async function runAgent(userInput: string, patientId: string = 'default'): Promise<AgentResult> {
  const intent = parseIntent(userInput);
  const toolsExecuted: Array<{ tool: string; success: boolean; message?: string }> = [];
  let contextForLLM = '';
  let directResponse: string | undefined;

  switch (intent.type) {
    case 'add_medication': {
      const med = intent.data;
      const today = new Date().toISOString().split('T')[0];
      
      // 1. Save medication
      const saveResult = await executeAgentTool('save_medication', {
        patient_id: patientId,
        medication_name: med.name,
        dosage: med.dosage,
        frequency: med.frequency,
        start_date: today,
        end_date: med.duration ? calculateEndDate(today, med.duration) : '',
        notes: med.notes,
      });
      toolsExecuted.push({ tool: 'save_medication', success: saveResult.success, message: saveResult.message_ml });

      // 2. Set reminder automatically
      const ttsMsg = generateTTSMessage(med.name, med.dosage);
      const reminderResult = await executeAgentTool('schedule_reminder', {
        patient_id: patientId,
        medication: med.name,
        dosage: med.dosage,
        time_slots: JSON.stringify(med.times),
        start_date: today,
        end_date: med.duration ? calculateEndDate(today, med.duration) : '',
        tts_message: ttsMsg,
      });
      toolsExecuted.push({ tool: 'schedule_reminder', success: reminderResult.success, message: reminderResult.message_ml });

      contextForLLM = `User told about medication: ${med.name} ${med.dosage} ${med.frequency} ${med.duration}. I saved it and set reminder at times ${med.times.join(', ')}. Notes: ${med.notes || 'none'}. Tell the user in nadan Malayalam that everything is saved and reminder is set.`;
      break;
    }

    case 'add_condition': {
      const cond = intent.data;
      const saveResult = await executeAgentTool('save_condition', {
        patient_id: patientId,
        condition_name: cond.name,
        severity: cond.severity,
        status: 'active',
      });
      toolsExecuted.push({ tool: 'save_condition', success: saveResult.success, message: saveResult.message_ml });

      contextForLLM = `User mentioned they have ${cond.name} (${cond.severity}). I recorded it. Ask follow-up questions about when diagnosed, current treatment, and any symptoms. Respond in nadan Malayalam.`;
      break;
    }

    case 'set_reminder': {
      // Already handled in add_medication, but if user explicitly asks
      contextForLLM = `User wants to set a reminder. Ask them: which medication, what time, and for how many days. Respond in nadan Malayalam.`;
      break;
    }

    case 'query_medications': {
      const result = await executeAgentTool('get_active_medications', { patient_id: patientId });
      toolsExecuted.push({ tool: 'get_active_medications', success: result.success });

      if (result.medications && result.medications.length > 0) {
        const medList = result.medications.map((m: any) => `${m.name} ${m.dosage} (${m.frequency})`).join(', ');
        contextForLLM = `Patient's active medications: ${medList}. Tell them in nadan Malayalam what they're taking.`;
      } else {
        contextForLLM = `Patient has no medications recorded. Tell them in nadan Malayalam.`;
      }
      break;
    }

    case 'query_conditions': {
      const result = await executeAgentTool('get_conditions', { patient_id: patientId });
      toolsExecuted.push({ tool: 'get_conditions', success: result.success });

      if (result.conditions && result.conditions.length > 0) {
        const condList = result.conditions.map((c: any) => `${c.name} (${c.status})`).join(', ');
        contextForLLM = `Patient's conditions: ${condList}. Summarize in nadan Malayalam.`;
      } else {
        contextForLLM = `No conditions recorded. Tell them in nadan Malayalam.`;
      }
      break;
    }

    case 'query_reminders': {
      const result = await executeAgentTool('get_active_reminders', { patient_id: patientId });
      toolsExecuted.push({ tool: 'get_active_reminders', success: result.success });

      if (result.reminders && result.reminders.length > 0) {
        const remList = result.reminders.map((r: any) => `${r.medication} ${r.dosage} at ${r.times}`).join(', ');
        contextForLLM = `Active reminders: ${remList}. Tell them in nadan Malayalam.`;
      } else {
        contextForLLM = `No active reminders. Tell them in nadan Malayalam.`;
      }
      break;
    }

    case 'symptom_report': {
      contextForLLM = `Patient reports symptoms: "${userInput}". Respond as a nadan Malayalam village doctor — ask clarifying questions, give immediate advice, and suggest when to go to hospital. Be brief and direct.`;
      break;
    }

    case 'general_chat': {
      contextForLLM = `User said: "${userInput}". Respond naturally in nadan Malayalam as a friendly health assistant. Be brief.`;
      break;
    }
  }

  return { intent, toolsExecuted, contextForLLM, directResponse };
}

function calculateEndDate(startDate: string, duration: string): string {
  const match = duration.match(/(\d+)/);
  if (!match) return '';
  const days = parseInt(match[1], 10);
  const start = new Date(startDate);
  start.setDate(start.getDate() + days);
  return start.toISOString().split('T')[0];
}
