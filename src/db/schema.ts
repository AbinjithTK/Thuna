/**
 * WatermelonDB Schema — Full openEHR Health Tracking
 * Covers: Vitals, Medications, Conditions, Reminders, Lab Results, Adherence
 */
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const ehrSchema = appSchema({
  version: 3,
  tables: [
    // ── Patient Profile ─────────────────────────────────────────────────
    tableSchema({
      name: 'patients',
      columns: [
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'age', type: 'string' },
        { name: 'gender', type: 'string' },
        { name: 'blood_group', type: 'string' },
        { name: 'village', type: 'string' },
        { name: 'emergency_contact', type: 'string' },
        { name: 'allergies', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ── Vitals (BP, Sugar, SpO2, Temp, HR, Weight, Pain) ────────────────
    tableSchema({
      name: 'vitals',
      columns: [
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'vital_type', type: 'string', isIndexed: true }, // bp, sugar, spo2, temp, hr, weight, pain, mood, sleep
        { name: 'value_primary', type: 'number' },   // systolic, fasting sugar, spo2%, temp, hr, weight, pain score
        { name: 'value_secondary', type: 'number' }, // diastolic, pp sugar, null for others
        { name: 'unit', type: 'string' },            // mmHg, mg/dL, %, °C, bpm, kg, /10
        { name: 'context', type: 'string' },         // fasting, post-meal, morning, evening, resting
        { name: 'notes', type: 'string' },
        { name: 'recorded_at', type: 'number', isIndexed: true },
      ],
    }),

    // ── Medications ─────────────────────────────────────────────────────
    tableSchema({
      name: 'medications',
      columns: [
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'dosage', type: 'string' },
        { name: 'frequency', type: 'string' },
        { name: 'route', type: 'string' },           // oral, injection, topical, inhaler
        { name: 'prescribed_date', type: 'string' },
        { name: 'end_date', type: 'string' },
        { name: 'prescriber', type: 'string' },
        { name: 'reason', type: 'string' },          // why prescribed
        { name: 'notes', type: 'string' },
        { name: 'is_active', type: 'boolean', isIndexed: true },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ── Conditions / Diagnoses ──────────────────────────────────────────
    tableSchema({
      name: 'conditions',
      columns: [
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'condition_name', type: 'string' },
        { name: 'icd_code', type: 'string' },        // ICD-10 code if known
        { name: 'diagnosed_date', type: 'string' },
        { name: 'severity', type: 'string' },        // mild, moderate, severe
        { name: 'status', type: 'string' },          // active, chronic, resolved, remission
        { name: 'treating_doctor', type: 'string' },
        { name: 'notes', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ── Reminders ───────────────────────────────────────────────────────
    tableSchema({
      name: 'reminders',
      columns: [
        { name: 'reminder_id', type: 'string', isIndexed: true },
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'reminder_type', type: 'string' },   // medication, vital_check, appointment, exercise
        { name: 'medication', type: 'string' },
        { name: 'dosage', type: 'string' },
        { name: 'time_slots', type: 'string' },      // JSON array
        { name: 'start_date', type: 'string' },
        { name: 'end_date', type: 'string' },
        { name: 'tts_message', type: 'string' },
        { name: 'is_active', type: 'boolean', isIndexed: true },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ── Lab Results ─────────────────────────────────────────────────────
    tableSchema({
      name: 'lab_results',
      columns: [
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'test_name', type: 'string' },       // HbA1c, TSH, Creatinine, Hemoglobin, Cholesterol
        { name: 'value', type: 'number' },
        { name: 'unit', type: 'string' },
        { name: 'reference_low', type: 'number' },
        { name: 'reference_high', type: 'number' },
        { name: 'is_abnormal', type: 'boolean' },
        { name: 'lab_name', type: 'string' },
        { name: 'test_date', type: 'string' },
        { name: 'notes', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ── Medication Adherence Log ────────────────────────────────────────
    tableSchema({
      name: 'adherence_log',
      columns: [
        { name: 'patient_id', type: 'string', isIndexed: true },
        { name: 'medication_name', type: 'string' },
        { name: 'scheduled_time', type: 'string' },
        { name: 'taken_at', type: 'number' },        // timestamp when marked as taken
        { name: 'status', type: 'string' },          // taken, missed, skipped, late
        { name: 'date', type: 'string', isIndexed: true },
      ],
    }),

    // ── openEHR Compositions (generic flat JSON store) ──────────────────
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
  ],
});
