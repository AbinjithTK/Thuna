/**
 * HealthReport — Generates a text-based health summary for sharing with doctors.
 *
 * Produces a structured report including:
 * - Patient demographics
 * - Active conditions
 * - Current medications
 * - Recent vitals with trends
 * - Lab results
 * - Adherence summary
 *
 * Output is plain text (shareable via any messaging app).
 */

import { database, Patient, Medication, Condition, Vital, LabResult, AdherenceLog, Reminder } from '../db';
import { Q } from '@nozbe/watermelondb';

export interface HealthReportData {
  generatedAt: string;
  patientName: string;
  patientAge: string;
  conditions: Array<{ name: string; status: string; since: string }>;
  medications: Array<{ name: string; dosage: string; frequency: string; since: string }>;
  vitals: Array<{ type: string; value: string; date: string }>;
  labResults: Array<{ test: string; value: string; normal: string; date: string; abnormal: boolean }>;
  adherenceRate: number; // 0-100
  activeReminders: number;
}

export async function generateHealthReport(patientId: string, patientName: string, patientAge: string): Promise<HealthReportData> {
  const now = new Date();
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

  // Conditions
  const conditions = await database.get<Condition>('conditions')
    .query(Q.where('patient_id', patientId)).fetch();

  // Active medications
  const medications = await database.get<Medication>('medications')
    .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();

  // Recent vitals (last 30 days)
  const vitals = await database.get<Vital>('vitals')
    .query(Q.where('patient_id', patientId), Q.where('recorded_at', Q.gte(thirtyDaysAgo)), Q.sortBy('recorded_at', Q.desc))
    .fetch();

  // Lab results
  const labResults = await database.get<LabResult>('lab_results')
    .query(Q.where('patient_id', patientId), Q.sortBy('created_at', Q.desc), Q.take(10)).fetch();

  // Adherence (last 7 days)
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const adherenceLogs = await database.get<AdherenceLog>('adherence_log')
    .query(Q.where('patient_id', patientId), Q.where('taken_at', Q.gte(weekAgo))).fetch();
  const activeReminders = await database.get<Reminder>('reminders')
    .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();

  // Calculate adherence rate
  const expectedDoses = activeReminders.reduce((sum, r) => {
    try {
      const times = JSON.parse(r.timeSlots);
      return sum + (Array.isArray(times) ? times.length * 7 : 7);
    } catch { return sum + 7; }
  }, 0);
  const adherenceRate = expectedDoses > 0 ? Math.min(100, Math.round((adherenceLogs.length / expectedDoses) * 100)) : 0;

  return {
    generatedAt: now.toISOString(),
    patientName,
    patientAge,
    conditions: conditions.map(c => ({ name: c.conditionName, status: c.status, since: c.diagnosedDate })),
    medications: medications.map(m => ({ name: m.name, dosage: m.dosage, frequency: m.frequency, since: m.prescribedDate })),
    vitals: vitals.slice(0, 20).map(v => ({
      type: v.vitalType,
      value: v.valueSecondary ? `${v.valuePrimary}/${v.valueSecondary} ${v.unit}` : `${v.valuePrimary} ${v.unit}`,
      date: new Date(v.recordedAt).toLocaleDateString('en-IN'),
    })),
    labResults: labResults.map(l => ({
      test: l.testName,
      value: `${l.value} ${l.unit}`,
      normal: `${l.referenceLow}-${l.referenceHigh} ${l.unit}`,
      date: l.testDate,
      abnormal: l.isAbnormal,
    })),
    adherenceRate,
    activeReminders: activeReminders.length,
  };
}

export function formatReportAsText(report: HealthReportData): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════');
  lines.push('       THUNA HEALTH REPORT');
  lines.push('═══════════════════════════════════════');
  lines.push(`Patient: ${report.patientName}`);
  lines.push(`Age: ${report.patientAge}`);
  lines.push(`Generated: ${new Date(report.generatedAt).toLocaleDateString('en-IN')}`);
  lines.push('');

  // Conditions
  lines.push('── CONDITIONS ──────────────────────');
  if (report.conditions.length === 0) {
    lines.push('  None recorded');
  } else {
    for (const c of report.conditions) {
      lines.push(`  • ${c.name} (${c.status}) — since ${c.since || 'unknown'}`);
    }
  }
  lines.push('');

  // Medications
  lines.push('── ACTIVE MEDICATIONS ──────────────');
  if (report.medications.length === 0) {
    lines.push('  None');
  } else {
    for (const m of report.medications) {
      lines.push(`  • ${m.name} ${m.dosage} — ${m.frequency}`);
    }
  }
  lines.push('');

  // Vitals
  lines.push('── RECENT VITALS (30 days) ─────────');
  if (report.vitals.length === 0) {
    lines.push('  No readings');
  } else {
    const byType: Record<string, typeof report.vitals> = {};
    for (const v of report.vitals) {
      if (!byType[v.type]) byType[v.type] = [];
      byType[v.type].push(v);
    }
    for (const [type, readings] of Object.entries(byType)) {
      const label = { bp: 'Blood Pressure', sugar: 'Blood Sugar', spo2: 'SpO2', temperature: 'Temperature', heart_rate: 'Heart Rate', weight: 'Weight' }[type] || type;
      lines.push(`  ${label}:`);
      for (const r of readings.slice(0, 5)) {
        lines.push(`    ${r.date}: ${r.value}`);
      }
    }
  }
  lines.push('');

  // Lab Results
  if (report.labResults.length > 0) {
    lines.push('── LAB RESULTS ─────────────────────');
    for (const l of report.labResults) {
      const flag = l.abnormal ? ' ⚠️ ABNORMAL' : '';
      lines.push(`  • ${l.test}: ${l.value} (ref: ${l.normal})${flag} — ${l.date}`);
    }
    lines.push('');
  }

  // Adherence
  lines.push('── MEDICATION ADHERENCE (7 days) ───');
  lines.push(`  Rate: ${report.adherenceRate}%`);
  lines.push(`  Active reminders: ${report.activeReminders}`);
  lines.push('');

  lines.push('═══════════════════════════════════════');
  lines.push('Generated by Thuna — Offline AI Health Companion');
  lines.push('Powered by Gemma 4 E2B (on-device)');

  return lines.join('\n');
}
