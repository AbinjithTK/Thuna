/**
 * WatermelonDB Models for openEHR records, patients, reminders, medications, conditions.
 */
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class EhrRecord extends Model {
  static table = 'ehr_records';
  @field('composition_id') compositionId!: string;
  @field('archetype_id') archetypeId!: string;
  @field('patient_id') patientId!: string;
  @field('flat_payload') flatPayload!: string;
  @field('template_id') templateId!: string;
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
  @field('is_synced') isSynced!: boolean;
}

export class Patient extends Model {
  static table = 'patients';
  @field('patient_id') patientId!: string;
  @field('name') name!: string;
  @field('age') age!: string;
  @field('gender') gender!: string;
  @field('village') village!: string;
  @field('created_at') createdAt!: number;
}

export class Reminder extends Model {
  static table = 'reminders';
  @field('reminder_id') reminderId!: string;
  @field('patient_id') patientId!: string;
  @field('medication') medication!: string;
  @field('dosage') dosage!: string;
  @field('frequency') frequency!: string;
  @field('time_slots') timeSlots!: string;
  @field('start_date') startDate!: string;
  @field('end_date') endDate!: string;
  @field('tts_message') ttsMessage!: string;
  @field('is_active') isActive!: boolean;
  @field('created_at') createdAt!: number;
}

export class Medication extends Model {
  static table = 'medications';
  @field('patient_id') patientId!: string;
  @field('name') name!: string;
  @field('dosage') dosage!: string;
  @field('frequency') frequency!: string;
  @field('prescribed_date') prescribedDate!: string;
  @field('end_date') endDate!: string;
  @field('prescriber') prescriber!: string;
  @field('notes') notes!: string;
  @field('is_active') isActive!: boolean;
  @field('created_at') createdAt!: number;
}

export class Condition extends Model {
  static table = 'conditions';
  @field('patient_id') patientId!: string;
  @field('condition_name') conditionName!: string;
  @field('diagnosed_date') diagnosedDate!: string;
  @field('severity') severity!: string;
  @field('status') status!: string;
  @field('notes') notes!: string;
  @field('created_at') createdAt!: number;
}
