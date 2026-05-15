import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { ehrSchema } from './schema';
import { EhrRecord, Patient, Reminder, Medication, Condition } from './models';

const adapter = new SQLiteAdapter({
  schema: ehrSchema,
  dbName: 'mededge_ehr',
  jsi: true,
});

export const database = new Database({
  adapter,
  modelClasses: [EhrRecord, Patient, Reminder, Medication, Condition],
});

export { EhrRecord, Patient, Reminder, Medication, Condition };
