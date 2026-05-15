import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class Patient extends Model {
  static table = 'patients';
  @field('patient_id') patientId!: string;
  @field('name') name!: string;
  @field('age') age!: string;
  @field('gender') gender!: string;
  @field('blood_group') bloodGroup!: string;
  @field('village') village!: string;
  @field('emergency_contact') emergencyContact!: string;
  @field('allergies') allergies!: string;
  @field('created_at') createdAt!: number;
}

export class Vital extends Model {
  static table = 'vitals';
  @field('patient_id') patientId!: string;
  @field('vital_type') vitalType!: string;
  @field('value_primary') valuePrimary!: number;
  @field('value_secondary') valueSecondary!: number;
  @field('unit') unit!: string;
  @field('context') context!: string;
  @field('notes') notes!: string;
  @field('recorded_at') recordedAt!: number;
}

export class Medication extends Model {
  static table = 'medications';
  @field('patient_id') patientId!: string;
  @field('name') name!: string;
  @field('dosage') dosage!: string;
  @field('frequency') frequency!: string;
  @field('route') route!: string;
  @field('prescribed_date') prescribedDate!: string;
  @field('end_date') endDate!: string;
  @field('prescriber') prescriber!: string;
  @field('reason') reason!: string;
  @field('notes') notes!: string;
  @field('is_active') isActive!: boolean;
  @field('created_at') createdAt!: number;
}

export class Condition extends Model {
  static table = 'conditions';
  @field('patient_id') patientId!: string;
  @field('condition_name') conditionName!: string;
  @field('icd_code') icdCode!: string;
  @field('diagnosed_date') diagnosedDate!: string;
  @field('severity') severity!: string;
  @field('status') status!: string;
  @field('treating_doctor') treatingDoctor!: string;
  @field('notes') notes!: string;
  @field('created_at') createdAt!: number;
}

export class Reminder extends Model {
  static table = 'reminders';
  @field('reminder_id') reminderId!: string;
  @field('patient_id') patientId!: string;
  @field('reminder_type') reminderType!: string;
  @field('medication') medication!: string;
  @field('dosage') dosage!: string;
  @field('time_slots') timeSlots!: string;
  @field('start_date') startDate!: string;
  @field('end_date') endDate!: string;
  @field('tts_message') ttsMessage!: string;
  @field('is_active') isActive!: boolean;
  @field('created_at') createdAt!: number;
}

export class LabResult extends Model {
  static table = 'lab_results';
  @field('patient_id') patientId!: string;
  @field('test_name') testName!: string;
  @field('value') value!: number;
  @field('unit') unit!: string;
  @field('reference_low') referenceLow!: number;
  @field('reference_high') referenceHigh!: number;
  @field('is_abnormal') isAbnormal!: boolean;
  @field('lab_name') labName!: string;
  @field('test_date') testDate!: string;
  @field('notes') notes!: string;
  @field('created_at') createdAt!: number;
}

export class AdherenceLog extends Model {
  static table = 'adherence_log';
  @field('patient_id') patientId!: string;
  @field('medication_name') medicationName!: string;
  @field('scheduled_time') scheduledTime!: string;
  @field('taken_at') takenAt!: number;
  @field('status') status!: string;
  @field('date') date!: string;
}

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
