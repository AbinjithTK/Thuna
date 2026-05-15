/**
 * WatermelonDB Schema for local openEHR + Reminders storage.
 */
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const ehrSchema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'ehr_records',
      columns: [
        { name: 'composition_id', type: 'string', isIndexed: true },
        { name: 'archetype_id', type: 'string', isIndexed: true },
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'flat_payload', type: 'string' },
        { name: 'template_id', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'is_synced', type: 'boolean', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'patients',
      columns: [
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'age', type: 'string' },
        { name: 'gender', type: 'string' },
        { name: 'village', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'reminders',
      columns: [
        { name: 'reminder_id', type: 'string', isIndexed: true },
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'medication', type: 'string' },
        { name: 'dosage', type: 'string' },
        { name: 'frequency', type: 'string' }, // e.g. "3 times daily", "every 8 hours"
        { name: 'time_slots', type: 'string' }, // JSON array: ["08:00","14:00","20:00"]
        { name: 'start_date', type: 'string' },
        { name: 'end_date', type: 'string' },
        { name: 'tts_message', type: 'string' }, // Malayalam TTS message for notification
        { name: 'is_active', type: 'boolean', isIndexed: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'medications',
      columns: [
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'dosage', type: 'string' },
        { name: 'frequency', type: 'string' },
        { name: 'prescribed_date', type: 'string' },
        { name: 'end_date', type: 'string' },
        { name: 'prescriber', type: 'string' },
        { name: 'notes', type: 'string' },
        { name: 'is_active', type: 'boolean', isIndexed: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'conditions',
      columns: [
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'condition_name', type: 'string' },
        { name: 'diagnosed_date', type: 'string' },
        { name: 'severity', type: 'string' },
        { name: 'status', type: 'string' }, // active, resolved, chronic
        { name: 'notes', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});
