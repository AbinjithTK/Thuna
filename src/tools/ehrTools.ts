/**
 * openEHR CRUD Tools — callable by Gemma 4 via function calling.
 *
 * These tools manage patient health records stored locally as
 * openEHR Flat JSON compositions in WatermelonDB/SQLite.
 *
 * Architecture:
 *   Gemma 4 → emits tool_call JSON → Tool Multiplexer → WatermelonDB → SQLite
 */
import { database, EhrRecord, Patient } from '../db';
import { Q } from '@nozbe/watermelondb';
import type { CactusLMTool } from 'cactus-react-native';

// ============================================================================
// Tool Schemas (passed to Gemma 4 via cactusLM.complete({ tools }))
// ============================================================================

export const EHR_TOOLS: CactusLMTool[] = [
  {
    name: 'create_ehr_record',
    description:
      'Save a new clinical observation/composition locally using openEHR Flat JSON paths. ' +
      'Use for recording vitals, symptoms, diagnoses, or triage outcomes.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: {
          type: 'string',
          description: 'Patient identifier (name or ID)',
        },
        archetype_id: {
          type: 'string',
          description: 'openEHR archetype e.g. openEHR-EHR-OBSERVATION.blood_pressure.v2',
        },
        flat_payload: {
          type: 'string',
          description: 'JSON string of flat path key-value pairs e.g. {"systolic|magnitude": 120, "diastolic|magnitude": 80}',
        },
      },
      required: ['patient_id', 'archetype_id', 'flat_payload'],
    },
  },
  {
    name: 'read_patient_history',
    description:
      'Query historical health records for a patient from the local database. ' +
      'Returns recent clinical observations, vitals, and triage results.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: {
          type: 'string',
          description: 'Patient identifier to look up',
        },
        limit: {
          type: 'number',
          description: 'Max records to return (default 5)',
        },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'update_ehr_record',
    description:
      'Update an existing clinical record with new flat path values. ' +
      'Merges new values into the existing flat payload.',
    parameters: {
      type: 'object',
      properties: {
        composition_id: {
          type: 'string',
          description: 'The composition ID of the record to update',
        },
        patch_payload: {
          type: 'string',
          description: 'JSON string of flat paths to update e.g. {"follow_up_date": "2026-05-20"}',
        },
      },
      required: ['composition_id', 'patch_payload'],
    },
  },
  {
    name: 'delete_ehr_record',
    description:
      'Remove a clinical record from local storage using its composition ID.',
    parameters: {
      type: 'object',
      properties: {
        composition_id: {
          type: 'string',
          description: 'The exact composition ID to delete',
        },
      },
      required: ['composition_id'],
    },
  },
  {
    name: 'list_patients',
    description: 'List all patients registered in the local database.',
    parameters: {
      type: 'object',
      properties: {
        village: {
          type: 'string',
          description: 'Optional: filter by village name',
        },
      },
      required: [],
    },
  },
];

// ============================================================================
// Tool Executors (run locally on-device against WatermelonDB)
// ============================================================================

export async function executeEhrTool(
  toolName: string,
  args: Record<string, any>,
): Promise<Record<string, any>> {
  switch (toolName) {
    case 'create_ehr_record':
      return createEhrRecord(args);
    case 'read_patient_history':
      return readPatientHistory(args);
    case 'update_ehr_record':
      return updateEhrRecord(args);
    case 'delete_ehr_record':
      return deleteEhrRecord(args);
    case 'list_patients':
      return listPatients(args);
    default:
      return { error: `Unknown EHR tool: ${toolName}` };
  }
}

// ── CREATE ──────────────────────────────────────────────────────────────────

async function createEhrRecord(args: Record<string, any>) {
  const { patient_id, archetype_id, flat_payload } = args;
  const compositionId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Parse flat_payload if it's a string
    const payload = typeof flat_payload === 'string' ? flat_payload : JSON.stringify(flat_payload);

    await database.write(async () => {
      // Ensure patient exists
      const existingPatients = await database
        .get<Patient>('patients')
        .query(Q.where('patient_id', patient_id))
        .fetch();

      if (existingPatients.length === 0) {
        await database.get<Patient>('patients').create((p: any) => {
          p.patientId = patient_id;
          p.name = patient_id;
          p.age = '';
          p.gender = '';
          p.village = '';
          p.createdAt = Date.now();
        });
      }

      // Create the EHR record
      await database.get<EhrRecord>('ehr_records').create((r: any) => {
        r.compositionId = compositionId;
        r.archetypeId = archetype_id;
        r.patientId = patient_id;
        r.flatPayload = payload;
        r.templateId = archetype_id.split('.').slice(-2, -1)[0] || '';
        r.createdAt = Date.now();
        r.updatedAt = Date.now();
        r.isSynced = false;
      });
    });

    return {
      success: true,
      composition_id: compositionId,
      message_ml: `രേഖ സേവ് ചെയ്തു. ID: ${compositionId}`,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── READ ────────────────────────────────────────────────────────────────────

async function readPatientHistory(args: Record<string, any>) {
  const { patient_id, limit = 5 } = args;

  try {
    const records = await database
      .get<EhrRecord>('ehr_records')
      .query(Q.where('patient_id', patient_id), Q.sortBy('created_at', Q.desc), Q.take(limit))
      .fetch();

    if (records.length === 0) {
      return {
        success: true,
        records: [],
        message_ml: `${patient_id} എന്ന രോഗിക്ക് രേഖകൾ ഇല്ല.`,
      };
    }

    const formatted = records.map(r => ({
      composition_id: r.compositionId,
      archetype: r.archetypeId,
      data: JSON.parse(r.flatPayload),
      date: new Date(r.createdAt).toLocaleDateString('ml-IN'),
    }));

    return {
      success: true,
      patient_id,
      record_count: records.length,
      records: formatted,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── UPDATE ──────────────────────────────────────────────────────────────────

async function updateEhrRecord(args: Record<string, any>) {
  const { composition_id, patch_payload } = args;

  try {
    const records = await database
      .get<EhrRecord>('ehr_records')
      .query(Q.where('composition_id', composition_id))
      .fetch();

    if (records.length === 0) {
      return { success: false, error: `Record ${composition_id} not found` };
    }

    const record = records[0];
    const existingPayload = JSON.parse(record.flatPayload);
    const patch = typeof patch_payload === 'string' ? JSON.parse(patch_payload) : patch_payload;
    const merged = { ...existingPayload, ...patch };

    await database.write(async () => {
      await record.update((r: any) => {
        r.flatPayload = JSON.stringify(merged);
        r.updatedAt = Date.now();
        r.isSynced = false;
      });
    });

    return {
      success: true,
      composition_id,
      message_ml: `രേഖ അപ്ഡേറ്റ് ചെയ്തു.`,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

async function deleteEhrRecord(args: Record<string, any>) {
  const { composition_id } = args;

  try {
    const records = await database
      .get<EhrRecord>('ehr_records')
      .query(Q.where('composition_id', composition_id))
      .fetch();

    if (records.length === 0) {
      return { success: false, error: `Record ${composition_id} not found` };
    }

    await database.write(async () => {
      await records[0].destroyPermanently();
    });

    return {
      success: true,
      message_ml: `രേഖ ${composition_id} ഡിലീറ്റ് ചെയ്തു.`,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── LIST PATIENTS ───────────────────────────────────────────────────────────

async function listPatients(args: Record<string, any>) {
  const { village } = args;

  try {
    let query = database.get<Patient>('patients').query();
    if (village) {
      query = database.get<Patient>('patients').query(Q.where('village', village));
    }

    const patients = await query.fetch();

    return {
      success: true,
      count: patients.length,
      patients: patients.map(p => ({
        id: p.patientId,
        name: p.name,
        age: p.age,
        gender: p.gender,
        village: p.village,
      })),
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
