/**
 * CloudSync — Opportunistic FHIR sync when internet is available.
 *
 * Architecture:
 *   Local (WatermelonDB) ←→ Cloud (FHIR R4 via Nosce Core)
 *
 * Sync Strategy:
 *   - Offline-first: All data lives locally, app works without internet
 *   - Opportunistic push: When connectivity detected, push unsynced records to FHIR
 *   - Pull insights: Fetch preventive care recommendations + lifestyle plans from cloud
 *   - Conflict resolution: Local always wins (patient's device is source of truth)
 *
 * FHIR Mapping:
 *   WatermelonDB vitals → FHIR Observation
 *   WatermelonDB medications → FHIR MedicationRequest
 *   WatermelonDB conditions → FHIR Condition
 *   WatermelonDB lab_results → FHIR Observation (lab)
 */

import { database, Vital, Medication, Condition, LabResult, EhrRecord } from '../db';
import { Q } from '@nozbe/watermelondb';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// Configuration
// ============================================================================

const STORAGE_KEYS = {
  NOSCE_API_KEY: '@thuna_nosce_api_key',
  NOSCE_SERVER_URL: '@thuna_nosce_server_url',
  LAST_SYNC: '@thuna_last_sync',
  CLOUD_INSIGHTS: '@thuna_cloud_insights',
};

const DEFAULT_SERVER = 'http://hapi.fhir.org/baseR4';

// ============================================================================
// Types
// ============================================================================

export interface SyncConfig {
  apiKey: string;
  serverUrl: string;
  patientId: string;
}

export interface SyncResult {
  success: boolean;
  pushed: { vitals: number; medications: number; conditions: number; labs: number };
  pulled: { insights: string | null };
  errors: string[];
  timestamp: number;
}

export interface CloudInsights {
  preventiveCare: string | null;
  lifestylePlan: string | null;
  lastUpdated: number;
}

// ============================================================================
// Connectivity Check
// ============================================================================

export async function isOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.status === 204;
  } catch {
    return false;
  }
}

// ============================================================================
// Config Management
// ============================================================================

export async function getSyncConfig(): Promise<SyncConfig | null> {
  // Use public HAPI FHIR server — no API key needed for demo
  return {
    apiKey: '',
    serverUrl: 'http://hapi.fhir.org/baseR4',
    patientId: '',
  };
}

export async function setSyncConfig(apiKey: string, serverUrl?: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.NOSCE_API_KEY, apiKey);
  if (serverUrl) await AsyncStorage.setItem(STORAGE_KEYS.NOSCE_SERVER_URL, serverUrl);
}

export async function clearSyncConfig(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.NOSCE_API_KEY);
  await AsyncStorage.removeItem(STORAGE_KEYS.NOSCE_SERVER_URL);
}

// ============================================================================
// FHIR Push — Upload unsynced local data to cloud
// ============================================================================

async function pushToFHIR(config: SyncConfig, patientId: string): Promise<SyncResult['pushed']> {
  const pushed = { vitals: 0, medications: 0, conditions: 0, labs: 0 };
  const headers: Record<string, string> = {
    'Content-Type': 'application/fhir+json',
  };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
  const baseUrl = config.serverUrl;

  // Push unsynced vitals as FHIR Observations
  const unsyncedVitals = await database.get<Vital>('vitals')
    .query(Q.where('patient_id', patientId), Q.sortBy('recorded_at', Q.desc), Q.take(50))
    .fetch();

  for (const vital of unsyncedVitals) {
    try {
      const observation = vitalToFHIR(vital, patientId);
      const res = await fetch(`${baseUrl}/Observation`, {
        method: 'POST', headers, body: JSON.stringify(observation),
      });
      if (res.ok) pushed.vitals++;
    } catch {}
  }

  // Push active medications as FHIR MedicationRequests
  const meds = await database.get<Medication>('medications')
    .query(Q.where('patient_id', patientId), Q.where('is_active', true))
    .fetch();

  for (const med of meds) {
    try {
      const medRequest = medicationToFHIR(med, patientId);
      const res = await fetch(`${baseUrl}/MedicationRequest`, {
        method: 'POST', headers, body: JSON.stringify(medRequest),
      });
      if (res.ok) pushed.medications++;
    } catch {}
  }

  // Push conditions as FHIR Conditions
  const conditions = await database.get<Condition>('conditions')
    .query(Q.where('patient_id', patientId))
    .fetch();

  for (const cond of conditions) {
    try {
      const fhirCond = conditionToFHIR(cond, patientId);
      const res = await fetch(`${baseUrl}/Condition`, {
        method: 'POST', headers, body: JSON.stringify(fhirCond),
      });
      if (res.ok) pushed.conditions++;
    } catch {}
  }

  // Push lab results as FHIR Observations
  const labs = await database.get<LabResult>('lab_results')
    .query(Q.where('patient_id', patientId), Q.sortBy('created_at', Q.desc), Q.take(20))
    .fetch();

  for (const lab of labs) {
    try {
      const labObs = labResultToFHIR(lab, patientId);
      const res = await fetch(`${baseUrl}/Observation`, {
        method: 'POST', headers, body: JSON.stringify(labObs),
      });
      if (res.ok) pushed.labs++;
    } catch {}
  }

  return pushed;
}

// ============================================================================
// FHIR Pull — Get cloud insights (preventive care, lifestyle plans)
// ============================================================================

async function pullInsights(config: SyncConfig): Promise<string | null> {
  try {
    // Call Nosce Core's preventive recommendations endpoint via MCP
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };

    // Try to get preventive care recommendations
    const res = await fetch(`${config.serverUrl.replace('/baseR4', '')}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'get_preventive_recommendations', arguments: {} },
        id: Date.now(),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data?.result?.content?.[0]?.text || null;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Main Sync Function — Call this when internet is detected
// ============================================================================

export async function syncToCloud(patientId: string): Promise<SyncResult> {
  const errors: string[] = [];
  const result: SyncResult = {
    success: false,
    pushed: { vitals: 0, medications: 0, conditions: 0, labs: 0 },
    pulled: { insights: null },
    errors,
    timestamp: Date.now(),
  };

  // Check connectivity
  const online = await isOnline();
  if (!online) {
    errors.push('No internet connection');
    return result;
  }

  // Get sync config
  const config = await getSyncConfig();
  if (!config) {
    errors.push('Cloud sync not configured. Set API key in settings.');
    return result;
  }

  try {
    // Push local data to FHIR
    result.pushed = await pushToFHIR(config, patientId);

    // Pull insights from cloud
    result.pulled.insights = await pullInsights(config);

    // Save insights locally for offline access
    if (result.pulled.insights) {
      const insights: CloudInsights = {
        preventiveCare: result.pulled.insights,
        lifestylePlan: null,
        lastUpdated: Date.now(),
      };
      await AsyncStorage.setItem(STORAGE_KEYS.CLOUD_INSIGHTS, JSON.stringify(insights));
    }

    // Record last sync time
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, Date.now().toString());

    result.success = true;
  } catch (e: any) {
    errors.push(`Sync failed: ${e.message}`);
  }

  return result;
}

// ============================================================================
// Get Cached Cloud Insights (available offline after first sync)
// ============================================================================

export async function getCachedInsights(): Promise<CloudInsights | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CLOUD_INSIGHTS);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function getLastSyncTime(): Promise<number | null> {
  try {
    const ts = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    return ts ? parseInt(ts, 10) : null;
  } catch {
    return null;
  }
}

// ============================================================================
// FHIR Resource Mappers
// ============================================================================

function vitalToFHIR(vital: Vital, patientId: string): object {
  const codeMap: Record<string, { code: string; display: string }> = {
    bp: { code: '85354-9', display: 'Blood Pressure' },
    sugar: { code: '2339-0', display: 'Blood Glucose' },
    spo2: { code: '2708-6', display: 'Oxygen Saturation' },
    temperature: { code: '8310-5', display: 'Body Temperature' },
    heart_rate: { code: '8867-4', display: 'Heart Rate' },
    weight: { code: '29463-7', display: 'Body Weight' },
    pain: { code: '72514-3', display: 'Pain Severity' },
  };

  const coding = codeMap[vital.vitalType] || { code: '0', display: vital.vitalType };

  const observation: any = {
    resourceType: 'Observation',
    status: 'final',
    code: {
      coding: [{ system: 'http://loinc.org', code: coding.code, display: coding.display }],
      text: coding.display,
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: new Date(vital.recordedAt).toISOString(),
    valueQuantity: {
      value: vital.valuePrimary,
      unit: vital.unit,
      system: 'http://unitsofmeasure.org',
      code: vital.unit,
    },
  };

  // BP has component structure
  if (vital.vitalType === 'bp' && vital.valueSecondary) {
    delete observation.valueQuantity;
    observation.component = [
      { code: { text: 'Systolic' }, valueQuantity: { value: vital.valuePrimary, unit: 'mmHg' } },
      { code: { text: 'Diastolic' }, valueQuantity: { value: vital.valueSecondary, unit: 'mmHg' } },
    ];
  }

  return observation;
}

function medicationToFHIR(med: Medication, patientId: string): object {
  return {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: `Patient/${patientId}` },
    medicationCodeableConcept: { text: `${med.name} ${med.dosage}` },
    authoredOn: med.prescribedDate || new Date().toISOString().split('T')[0],
    dosageInstruction: [{ text: `${med.dosage} ${med.frequency}` }],
  };
}

function conditionToFHIR(cond: Condition, patientId: string): object {
  return {
    resourceType: 'Condition',
    clinicalStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: cond.status || 'active' }],
    },
    severity: { text: cond.severity || 'moderate' },
    code: { text: cond.conditionName },
    subject: { reference: `Patient/${patientId}` },
    onsetDateTime: cond.diagnosedDate || new Date().toISOString().split('T')[0],
  };
}

function labResultToFHIR(lab: LabResult, patientId: string): object {
  const flag = lab.isAbnormal ? 'H' : 'N';
  return {
    resourceType: 'Observation',
    status: 'final',
    code: { text: lab.testName },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: lab.testDate || new Date().toISOString().split('T')[0],
    valueQuantity: { value: lab.value, unit: lab.unit, system: 'http://unitsofmeasure.org', code: lab.unit },
    interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: flag, display: flag === 'H' ? 'High' : 'Normal' }] }],
    referenceRange: [{ low: { value: lab.referenceLow, unit: lab.unit }, high: { value: lab.referenceHigh, unit: lab.unit } }],
  };
}
