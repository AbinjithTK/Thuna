import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { ehrSchema } from './schema';
import { Patient, Vital, Medication, Condition, Reminder, LabResult, AdherenceLog, EhrRecord } from './models';

const adapter = new SQLiteAdapter({
  schema: ehrSchema,
  dbName: 'thuna_health',
  jsi: true,
});

export const database = new Database({
  adapter,
  modelClasses: [Patient, Vital, Medication, Condition, Reminder, LabResult, AdherenceLog, EhrRecord],
});

export { Patient, Vital, Medication, Condition, Reminder, LabResult, AdherenceLog, EhrRecord };
