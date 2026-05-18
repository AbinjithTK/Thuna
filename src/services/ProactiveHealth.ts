/**
 * ProactiveHealth — Generates proactive health prompts and checks.
 *
 * Features:
 * 1. Medication adherence reminders (missed doses)
 * 2. Medication expiry auto-deactivation
 * 3. Compound vital correlation alerts
 * 4. Follow-up question generation
 *
 * All checks run locally against WatermelonDB.
 */

import { database, Medication, Reminder, Vital, Condition, AdherenceLog } from '../db';
import { Q } from '@nozbe/watermelondb';

// ============================================================================
// Types
// ============================================================================

export interface ProactiveAlert {
  type: 'missed_dose' | 'expiry' | 'compound_risk' | 'follow_up' | 'check_in';
  severity: 'info' | 'warning' | 'critical';
  message: string;       // Malayalam message
  messageEn: string;     // English fallback
  actionable: boolean;
}

// ============================================================================
// Main Check — Run on app open or after each conversation turn
// ============================================================================

export async function runProactiveChecks(patientId: string): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];

  try {
    // 1. Check for expired medications and auto-deactivate
    const expiryAlerts = await checkMedicationExpiry(patientId);
    alerts.push(...expiryAlerts);

    // 2. Check for missed doses today
    const missedAlerts = await checkMissedDoses(patientId);
    alerts.push(...missedAlerts);

    // 3. Check for compound vital risks
    const compoundAlerts = await checkCompoundVitalRisks(patientId);
    alerts.push(...compoundAlerts);

    // 4. Generate follow-up if no vitals recorded recently
    const followUpAlerts = await checkFollowUpNeeded(patientId);
    alerts.push(...followUpAlerts);
  } catch (e) {
    console.warn('ProactiveHealth check error:', e);
  }

  return alerts;
}

// ============================================================================
// 1. Medication Expiry — Auto-deactivate expired medications
// ============================================================================

async function checkMedicationExpiry(patientId: string): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];
  const today = new Date().toISOString().split('T')[0];

  const activeMeds = await database.get<Medication>('medications')
    .query(Q.where('patient_id', patientId), Q.where('is_active', true))
    .fetch();

  for (const med of activeMeds) {
    if (med.endDate && med.endDate <= today) {
      // Auto-deactivate expired medication
      await database.write(async () => {
        await med.update((r: any) => { r.isActive = false; });
      });

      // Also deactivate its reminder
      const reminders = await database.get<Reminder>('reminders')
        .query(Q.where('patient_id', patientId), Q.where('medication', med.name), Q.where('is_active', true))
        .fetch();
      for (const rem of reminders) {
        await database.write(async () => {
          await rem.update((r: any) => { r.isActive = false; });
        });
      }

      alerts.push({
        type: 'expiry',
        severity: 'info',
        message: `${med.name} ${med.dosage} കോഴ്സ് പൂർത്തിയായി. ഡോക്ടറോട് ചോദിക്കണോ?`,
        messageEn: `${med.name} ${med.dosage} course completed. Need to consult doctor?`,
        actionable: true,
      });
    }
  }

  return alerts;
}

// ============================================================================
// 2. Missed Doses — Check if scheduled medications weren't taken today
// ============================================================================

async function checkMissedDoses(patientId: string): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const currentHour = now.getHours();

  // Get active reminders
  const activeReminders = await database.get<Reminder>('reminders')
    .query(Q.where('patient_id', patientId), Q.where('is_active', true))
    .fetch();

  // Get today's adherence logs
  const todayLogs = await database.get<AdherenceLog>('adherence_log')
    .query(Q.where('patient_id', patientId), Q.where('date', today))
    .fetch();

  const takenMeds = new Set(todayLogs.map(l => l.medicationName.toLowerCase()));

  for (const rem of activeReminders) {
    if (!rem.medication) continue;

    // Parse time slots
    let times: string[] = [];
    try { times = JSON.parse(rem.timeSlots); } catch { continue; }

    // Check if any scheduled time has passed without a log
    const missedTimes = times.filter(t => {
      const [h] = t.split(':').map(Number);
      return h < currentHour; // Time has passed
    });

    if (missedTimes.length > 0 && !takenMeds.has(rem.medication.toLowerCase())) {
      alerts.push({
        type: 'missed_dose',
        severity: 'warning',
        message: `${rem.medication} ${rem.dosage || ''} ഇന്ന് കഴിച്ചോ? ${missedTimes.join(', ')} ന് കഴിക്കേണ്ടതായിരുന്നു.`,
        messageEn: `Did you take ${rem.medication} ${rem.dosage || ''} today? Was scheduled at ${missedTimes.join(', ')}.`,
        actionable: true,
      });
    }
  }

  // Limit to max 2 missed dose alerts to avoid overwhelming
  return alerts.slice(0, 2);
}

// ============================================================================
// 3. Compound Vital Risk — Cross-correlate vitals with conditions
// ============================================================================

async function checkCompoundVitalRisks(patientId: string): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];

  // Get conditions
  const conditions = await database.get<Condition>('conditions')
    .query(Q.where('patient_id', patientId))
    .fetch();
  const conditionNames = conditions.map(c => c.conditionName.toLowerCase());

  // Get latest vitals (last 24 hours)
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentVitals = await database.get<Vital>('vitals')
    .query(Q.where('patient_id', patientId), Q.where('recorded_at', Q.gte(dayAgo)))
    .fetch();

  if (recentVitals.length === 0) return alerts;

  // Build vital map
  const latestByType: Record<string, { primary: number; secondary: number }> = {};
  for (const v of recentVitals) {
    latestByType[v.vitalType] = { primary: v.valuePrimary, secondary: v.valueSecondary };
  }

  // Compound risk: Diabetes + High Sugar + High BP
  const hasDiabetes = conditionNames.some(c => c.includes('diabetes') || c.includes('sugar'));
  const hasHypertension = conditionNames.some(c => c.includes('hypertension') || c.includes('bp'));

  if (hasDiabetes && latestByType.sugar && latestByType.sugar.primary > 200) {
    if (latestByType.bp && latestByType.bp.primary > 140) {
      alerts.push({
        type: 'compound_risk',
        severity: 'critical',
        message: '🚨 ഷുഗറും BP-യും ഒരുമിച്ച് ഉയർന്നിരിക്കുന്നു. ഡോക്ടറെ വിളിക്കുക.',
        messageEn: 'Both sugar and BP are elevated together. Call your doctor.',
        actionable: true,
      });
    }
  }

  // Compound risk: Low SpO2 + Fever
  if (latestByType.spo2 && latestByType.spo2.primary < 94) {
    if (latestByType.temperature && latestByType.temperature.primary > 100.4) {
      alerts.push({
        type: 'compound_risk',
        severity: 'critical',
        message: '🚨 ഓക്സിജൻ കുറവും പനിയും ഒരുമിച്ച്. ഉടൻ ആശുപത്രിയിൽ പോകുക.',
        messageEn: 'Low oxygen + fever together. Go to hospital immediately.',
        actionable: true,
      });
    }
  }

  // Compound risk: High BP + High Heart Rate (possible hypertensive crisis)
  if (latestByType.bp && latestByType.bp.primary > 160) {
    if (latestByType.heart_rate && latestByType.heart_rate.primary > 100) {
      alerts.push({
        type: 'compound_risk',
        severity: 'critical',
        message: '🚨 BP വളരെ ഉയർന്നതും ഹൃദയമിടിപ്പ് കൂടുതലും. വിശ്രമിക്കുക, ഡോക്ടറെ വിളിക്കുക.',
        messageEn: 'Very high BP + elevated heart rate. Rest and call doctor.',
        actionable: true,
      });
    }
  }

  // Risk: Diabetes patient with low sugar (hypoglycemia)
  if (hasDiabetes && latestByType.sugar && latestByType.sugar.primary < 70) {
    alerts.push({
      type: 'compound_risk',
      severity: 'critical',
      message: '🚨 ഷുഗർ വളരെ കുറവ്! ഉടനെ മധുരം കഴിക്കുക. 15 മിനിറ്റ് കഴിഞ്ഞ് വീണ്ടും നോക്കുക.',
      messageEn: 'Very low sugar! Eat something sweet immediately. Recheck in 15 minutes.',
      actionable: true,
    });
  }

  return alerts;
}

// ============================================================================
// 4. Follow-up Needed — Remind to check vitals if not recorded recently
// ============================================================================

async function checkFollowUpNeeded(patientId: string): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];

  // Check if patient has conditions that need regular monitoring
  const conditions = await database.get<Condition>('conditions')
    .query(Q.where('patient_id', patientId))
    .fetch();

  if (conditions.length === 0) return alerts;

  const conditionNames = conditions.map(c => c.conditionName.toLowerCase());
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

  // If diabetic, check if sugar was recorded in last 3 days
  if (conditionNames.some(c => c.includes('diabetes'))) {
    const recentSugar = await database.get<Vital>('vitals')
      .query(Q.where('patient_id', patientId), Q.where('vital_type', 'sugar'), Q.where('recorded_at', Q.gte(threeDaysAgo)))
      .fetch();

    if (recentSugar.length === 0) {
      alerts.push({
        type: 'follow_up',
        severity: 'info',
        message: '3 ദിവസമായി ഷുഗർ ചെക്ക് ചെയ്തിട്ടില്ല. ഇന്ന് ചെക്ക് ചെയ്യാമോ?',
        messageEn: 'Sugar not checked in 3 days. Can you check today?',
        actionable: true,
      });
    }
  }

  // If hypertensive, check if BP was recorded in last 3 days
  if (conditionNames.some(c => c.includes('hypertension'))) {
    const recentBP = await database.get<Vital>('vitals')
      .query(Q.where('patient_id', patientId), Q.where('vital_type', 'bp'), Q.where('recorded_at', Q.gte(threeDaysAgo)))
      .fetch();

    if (recentBP.length === 0) {
      alerts.push({
        type: 'follow_up',
        severity: 'info',
        message: '3 ദിവസമായി BP ചെക്ക് ചെയ്തിട്ടില്ല. ഇന്ന് ചെക്ക് ചെയ്യാമോ?',
        messageEn: 'BP not checked in 3 days. Can you check today?',
        actionable: true,
      });
    }
  }

  return alerts;
}

// ============================================================================
// Generate Follow-up Question Based on Context
// ============================================================================

export function generateFollowUpQuestion(
  lastIntent: string,
  patientConditions: string[],
): string | null {
  // After recording a vital, suggest related actions
  if (lastIntent === 'add_vital') {
    if (patientConditions.some(c => c.includes('diabetes'))) {
      return 'ഇന്ന് രാവിലെ മരുന്ന് കഴിച്ചോ?'; // Did you take morning medicine?
    }
  }

  // After adding medication, ask about allergies
  if (lastIntent === 'add_medication') {
    return 'ഈ മരുന്നിന് allergy ഉണ്ടോ?'; // Any allergy to this medicine?
  }

  return null;
}


// ============================================================================
// Daily Morning Summary — Generate greeting with health status
// ============================================================================

export async function generateMorningSummary(patientId: string, patientName: string): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get yesterday's vitals
    const yesterdayStart = new Date(Date.now() - 24 * 60 * 60 * 1000).setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(Date.now() - 24 * 60 * 60 * 1000).setHours(23, 59, 59, 999);
    const yesterdayVitals = await database.get<Vital>('vitals')
      .query(Q.where('patient_id', patientId), Q.where('recorded_at', Q.gte(yesterdayStart)), Q.where('recorded_at', Q.lte(yesterdayEnd)))
      .fetch();

    // Get yesterday's adherence
    const yesterdayLogs = await database.get<AdherenceLog>('adherence_log')
      .query(Q.where('patient_id', patientId), Q.where('date', yesterday)).fetch();

    // Get active medications count
    const activeMeds = await database.get<Medication>('medications')
      .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();

    // Get conditions for context
    const conditions = await database.get<Condition>('conditions')
      .query(Q.where('patient_id', patientId)).fetch();
    const hasDiabetes = conditions.some(c => c.conditionName.toLowerCase().includes('diabetes'));
    const hasBP = conditions.some(c => c.conditionName.toLowerCase().includes('hypertension'));

    // Build summary
    let summary = `സുപ്രഭാതം ${patientName}! `;

    // Yesterday's vitals
    if (yesterdayVitals.length > 0) {
      const vitalSummary = yesterdayVitals
        .filter(v => v.vitalType !== 'symptom')
        .map(v => {
          const val = v.valueSecondary ? `${v.valuePrimary}/${v.valueSecondary}` : `${v.valuePrimary}`;
          const label = { bp: 'BP', sugar: 'Sugar', spo2: 'SpO2', temperature: 'Temp', heart_rate: 'HR' }[v.vitalType] || v.vitalType;
          return `${label}: ${val}${v.unit}`;
        }).join(', ');
      if (vitalSummary) summary += `ഇന്നലെ: ${vitalSummary}. `;
    }

    // Adherence
    if (activeMeds.length > 0) {
      const rate = yesterdayLogs.length;
      summary += `ഇന്നലെ ${rate}/${activeMeds.length} മരുന്ന് കഴിച്ചു. `;
    }

    // Today's plan
    summary += `ഇന്ന് ${activeMeds.length} മരുന്ന് കഴിക്കണം. `;

    // Suggest vital check based on conditions
    if (hasDiabetes) summary += 'ഷുഗർ ചെക്ക് ചെയ്യാമോ? ';
    else if (hasBP) summary += 'BP ചെക്ക് ചെയ്യാമോ? ';

    return summary.trim();
  } catch {
    return `സുപ്രഭാതം ${patientName}! ഇന്ന് എങ്ങനെ ഉണ്ട്?`;
  }
}

// ============================================================================
// Family Status Message — Shareable daily status for family WhatsApp group
// ============================================================================

export async function generateFamilyStatus(patientId: string, patientName: string): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Today's vitals
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayVitals = await database.get<Vital>('vitals')
      .query(Q.where('patient_id', patientId), Q.where('recorded_at', Q.gte(todayStart)))
      .fetch();

    // Today's adherence
    const todayLogs = await database.get<AdherenceLog>('adherence_log')
      .query(Q.where('patient_id', patientId), Q.where('date', today)).fetch();

    // Active meds
    const activeMeds = await database.get<Medication>('medications')
      .query(Q.where('patient_id', patientId), Q.where('is_active', true)).fetch();

    // Symptoms today
    const todaySymptoms = todayVitals.filter(v => v.vitalType === 'symptom');

    // Build status
    const lines: string[] = [];
    lines.push(`📋 ${patientName} — ${now.toLocaleDateString('en-IN')} Status`);
    lines.push('');

    // Vitals
    const realVitals = todayVitals.filter(v => v.vitalType !== 'symptom');
    if (realVitals.length > 0) {
      lines.push('📊 Vitals:');
      for (const v of realVitals) {
        const val = v.valueSecondary ? `${v.valuePrimary}/${v.valueSecondary}` : `${v.valuePrimary}`;
        const label = { bp: 'BP', sugar: 'Sugar', spo2: 'SpO2', temperature: 'Temp', heart_rate: 'HR', weight: 'Weight' }[v.vitalType] || v.vitalType;
        lines.push(`  ${label}: ${val} ${v.unit}`);
      }
    } else {
      lines.push('📊 No vitals recorded today');
    }

    // Medications
    lines.push('');
    lines.push(`💊 Medicines: ${todayLogs.length}/${activeMeds.length} taken`);
    if (todayLogs.length > 0) {
      for (const l of todayLogs) {
        lines.push(`  ✅ ${l.medicationName}`);
      }
    }
    const missed = activeMeds.filter(m => !todayLogs.some(l => l.medicationName.toLowerCase() === m.name.toLowerCase()));
    if (missed.length > 0) {
      for (const m of missed) {
        lines.push(`  ⏳ ${m.name} ${m.dosage} — pending`);
      }
    }

    // Symptoms
    if (todaySymptoms.length > 0) {
      lines.push('');
      lines.push('🤒 Reported:');
      for (const s of todaySymptoms) {
        lines.push(`  ${s.context || 'symptom'}`);
      }
    }

    lines.push('');
    lines.push('— Sent from Thuna (തുണ)');

    return lines.join('\n');
  } catch {
    return `${patientName} — Status unavailable. Check app.`;
  }
}
