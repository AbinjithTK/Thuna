/**
 * Intelligent Agent Tools — Prescription/Report Processing + Medication + Reminders
 *
 * These tools allow Gemma 4 to:
 * 1. Extract medications/conditions from uploaded prescription photos
 * 2. Save medications with dates to the local DB
 * 3. Schedule TTS reminders for medication times
 * 4. Query active medications and upcoming reminders
 */
import { database, Medication, Condition, Reminder } from '../db';
import { Q } from '@nozbe/watermelondb';
import type { CactusLMTool } from 'cactus-react-native';

// ============================================================================
// Tool Schemas
// ============================================================================

export const AGENT_TOOLS: CactusLMTool[] = [
  {
    name: 'save_medication',
    description:
      'Save a medication to the patient database. Use when a prescription is read or doctor advises medicine. ' +
      'Includes name, dosage, frequency, dates, and prescriber info.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: { type: 'string', description: 'Patient name or ID' },
        medication_name: { type: 'string', description: 'Medicine name e.g. Amoxicillin, Paracetamol' },
        dosage: { type: 'string', description: 'Dosage e.g. 500mg, 5ml' },
        frequency: { type: 'string', description: 'How often e.g. 3 times daily, every 8 hours, twice daily' },
        start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
        end_date: { type: 'string', description: 'End date YYYY-MM-DD (when to stop)' },
        prescriber: { type: 'string', description: 'Doctor name if known' },
        notes: { type: 'string', description: 'Additional notes e.g. take after food' },
      },
      required: ['patient_id', 'medication_name', 'dosage', 'frequency'],
    },
  },
  {
    name: 'save_condition',
    description:
      'Record a diagnosed medical condition for a patient. Use when a diagnosis is made or read from a report.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: { type: 'string', description: 'Patient name or ID' },
        condition_name: { type: 'string', description: 'Condition e.g. Diabetes Type 2, Hypertension' },
        diagnosed_date: { type: 'string', description: 'Date diagnosed YYYY-MM-DD' },
        severity: { type: 'string', description: 'mild, moderate, severe' },
        status: { type: 'string', description: 'active, chronic, resolved' },
        notes: { type: 'string', description: 'Additional clinical notes' },
      },
      required: ['patient_id', 'condition_name'],
    },
  },
  {
    name: 'schedule_reminder',
    description:
      'Create a medication reminder that will trigger TTS notifications at specified times. ' +
      'The reminder speaks in Malayalam to remind the patient to take their medicine.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: { type: 'string', description: 'Patient name or ID' },
        medication: { type: 'string', description: 'Medicine name' },
        dosage: { type: 'string', description: 'Dosage to take' },
        time_slots: { type: 'string', description: 'JSON array of times e.g. ["08:00","14:00","20:00"]' },
        start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
        end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        tts_message: { type: 'string', description: 'Malayalam message to speak e.g. "പാരസെറ്റമോൾ 500mg കഴിക്കാൻ സമയമായി"' },
      },
      required: ['patient_id', 'medication', 'time_slots', 'tts_message'],
    },
  },
  {
    name: 'get_active_medications',
    description: 'Get all active medications for a patient.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: { type: 'string', description: 'Patient name or ID' },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'get_active_reminders',
    description: 'Get all active reminders for a patient.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: { type: 'string', description: 'Patient name or ID' },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'get_conditions',
    description: 'Get all medical conditions for a patient.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: { type: 'string', description: 'Patient name or ID' },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'stop_reminder',
    description: 'Deactivate a medication reminder (e.g. when course is complete).',
    parameters: {
      type: 'object',
      properties: {
        reminder_id: { type: 'string', description: 'Reminder ID to deactivate' },
      },
      required: ['reminder_id'],
    },
  },
  {
    name: 'get_current_datetime',
    description: 'Get the current date and time. Use to set proper dates for medications and reminders.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ============================================================================
// Tool Executors
// ============================================================================

export async function executeAgentTool(
  toolName: string,
  args: Record<string, any>,
): Promise<Record<string, any>> {
  switch (toolName) {
    case 'save_medication': return saveMedication(args);
    case 'save_condition': return saveCondition(args);
    case 'schedule_reminder': return scheduleReminder(args);
    case 'get_active_medications': return getActiveMedications(args);
    case 'get_active_reminders': return getActiveReminders(args);
    case 'get_conditions': return getConditions(args);
    case 'stop_reminder': return stopReminder(args);
    case 'get_current_datetime': return getCurrentDatetime();
    default: return { error: `Unknown agent tool: ${toolName}` };
  }
}

// ── SAVE MEDICATION ─────────────────────────────────────────────────────────

async function saveMedication(args: Record<string, any>) {
  const { patient_id, medication_name, dosage, frequency, start_date, end_date, prescriber, notes } = args;
  const today = new Date().toISOString().split('T')[0];

  try {
    await database.write(async () => {
      await database.get<Medication>('medications').create((m: any) => {
        m.patientId = patient_id;
        m.name = medication_name;
        m.dosage = dosage || '';
        m.frequency = frequency || '';
        m.prescribedDate = start_date || today;
        m.endDate = end_date || '';
        m.prescriber = prescriber || '';
        m.notes = notes || '';
        m.isActive = true;
        m.createdAt = Date.now();
      });
    });

    return {
      success: true,
      message_ml: `${medication_name} ${dosage} സേവ് ചെയ്തു. ${frequency} കഴിക്കണം.`,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── SAVE CONDITION ──────────────────────────────────────────────────────────

async function saveCondition(args: Record<string, any>) {
  const { patient_id, condition_name, diagnosed_date, severity, status, notes } = args;
  const today = new Date().toISOString().split('T')[0];

  try {
    await database.write(async () => {
      await database.get<Condition>('conditions').create((c: any) => {
        c.patientId = patient_id;
        c.conditionName = condition_name;
        c.diagnosedDate = diagnosed_date || today;
        c.severity = severity || 'moderate';
        c.status = status || 'active';
        c.notes = notes || '';
        c.createdAt = Date.now();
      });
    });

    return {
      success: true,
      message_ml: `${condition_name} രേഖപ്പെടുത്തി. (${status || 'active'})`,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── SCHEDULE REMINDER ───────────────────────────────────────────────────────

async function scheduleReminder(args: Record<string, any>) {
  const { patient_id, medication, dosage, time_slots, start_date, end_date, tts_message } = args;
  const reminderId = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const today = new Date().toISOString().split('T')[0];

  try {
    const slots = typeof time_slots === 'string' ? time_slots : JSON.stringify(time_slots);

    await database.write(async () => {
      await database.get<Reminder>('reminders').create((r: any) => {
        r.reminderId = reminderId;
        r.patientId = patient_id;
        r.medication = medication;
        r.dosage = dosage || '';
        r.frequency = '';
        r.timeSlots = slots;
        r.startDate = start_date || today;
        r.endDate = end_date || '';
        r.ttsMessage = tts_message;
        r.isActive = true;
        r.createdAt = Date.now();
      });
    });

    return {
      success: true,
      reminder_id: reminderId,
      message_ml: `റിമൈൻഡർ സെറ്റ് ചെയ്തു: ${medication} — ${slots}`,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── GET ACTIVE MEDICATIONS ──────────────────────────────────────────────────

async function getActiveMedications(args: Record<string, any>) {
  const { patient_id } = args;

  try {
    const meds = await database
      .get<Medication>('medications')
      .query(Q.where('patient_id', patient_id), Q.where('is_active', true))
      .fetch();

    return {
      success: true,
      count: meds.length,
      medications: meds.map(m => ({
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        prescribed: m.prescribedDate,
        end_date: m.endDate,
        prescriber: m.prescriber,
        notes: m.notes,
      })),
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── GET ACTIVE REMINDERS ────────────────────────────────────────────────────

async function getActiveReminders(args: Record<string, any>) {
  const { patient_id } = args;

  try {
    const reminders = await database
      .get<Reminder>('reminders')
      .query(Q.where('patient_id', patient_id), Q.where('is_active', true))
      .fetch();

    return {
      success: true,
      count: reminders.length,
      reminders: reminders.map(r => ({
        id: r.reminderId,
        medication: r.medication,
        dosage: r.dosage,
        times: r.timeSlots,
        start: r.startDate,
        end: r.endDate,
        message: r.ttsMessage,
      })),
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── GET CONDITIONS ──────────────────────────────────────────────────────────

async function getConditions(args: Record<string, any>) {
  const { patient_id } = args;

  try {
    const conditions = await database
      .get<Condition>('conditions')
      .query(Q.where('patient_id', patient_id))
      .fetch();

    return {
      success: true,
      count: conditions.length,
      conditions: conditions.map(c => ({
        name: c.conditionName,
        diagnosed: c.diagnosedDate,
        severity: c.severity,
        status: c.status,
        notes: c.notes,
      })),
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── STOP REMINDER ───────────────────────────────────────────────────────────

async function stopReminder(args: Record<string, any>) {
  const { reminder_id } = args;

  try {
    const reminders = await database
      .get<Reminder>('reminders')
      .query(Q.where('reminder_id', reminder_id))
      .fetch();

    if (reminders.length === 0) {
      return { success: false, error: 'Reminder not found' };
    }

    await database.write(async () => {
      await reminders[0].update((r: any) => { r.isActive = false; });
    });

    return { success: true, message_ml: 'റിമൈൻഡർ നിർത്തി.' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── GET CURRENT DATETIME ────────────────────────────────────────────────────

function getCurrentDatetime() {
  const now = new Date();
  return {
    date: now.toISOString().split('T')[0],
    time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
    day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()],
    timestamp: now.toISOString(),
  };
}
