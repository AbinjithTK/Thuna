/**
 * PrescriptionOCR — Uses Gemma 4 multimodal to extract medications from prescription photos.
 *
 * Flow:
 *   1. User captures prescription photo
 *   2. Image sent to Gemma 4 E2B with structured extraction prompt
 *   3. Model returns JSON array of medications
 *   4. Each medication is saved to WatermelonDB with auto-reminders
 *
 * All processing happens on-device — zero network calls.
 */

import { database, Medication, Reminder } from '../db';
import { generateTTSMessage } from '../agent/IntentParser';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  times: string[];
  notes: string;
  prescriber: string;
}

export interface OCRResult {
  success: boolean;
  medications: ExtractedMedication[];
  rawText: string;
  error?: string;
}

// ============================================================================
// Extraction Prompt
// ============================================================================

export const PRESCRIPTION_EXTRACTION_PROMPT = `You are a medical prescription reader. Extract ALL medications from this prescription image.

Return a JSON array. For each medication include:
- name: medicine name (capitalize first letter)
- dosage: e.g. "500mg", "5ml", "10mg"
- frequency: e.g. "twice daily", "3 times daily", "once daily"
- duration: e.g. "7 days", "14 days", "30 days" (empty if not specified)
- times: array of times e.g. ["08:00", "20:00"] based on frequency
- notes: e.g. "after food", "before food", "empty stomach" (empty if not specified)
- prescriber: doctor name if visible (empty if not)

Frequency to times mapping:
- once daily → ["08:00"]
- twice daily → ["08:00", "20:00"]
- 3 times daily → ["08:00", "14:00", "20:00"]
- at night → ["21:00"]
- morning → ["08:00"]

IMPORTANT: Return ONLY valid JSON array. No explanation text.

Example output:
[
  {"name": "Amoxicillin", "dosage": "500mg", "frequency": "3 times daily", "duration": "7 days", "times": ["08:00", "14:00", "20:00"], "notes": "after food", "prescriber": "Dr. Kumar"},
  {"name": "Paracetamol", "dosage": "650mg", "frequency": "as needed", "duration": "", "times": ["08:00"], "notes": "for fever", "prescriber": ""}
]`;

// ============================================================================
// Parse LLM Response
// ============================================================================

export function parseOCRResponse(responseText: string): OCRResult {
  try {
    // Try to find JSON array in the response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { success: false, medications: [], rawText: responseText, error: 'No JSON array found in response' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { success: false, medications: [], rawText: responseText, error: 'Empty or invalid array' };
    }

    const medications: ExtractedMedication[] = parsed.map((item: any) => ({
      name: String(item.name || '').trim(),
      dosage: String(item.dosage || '').trim(),
      frequency: String(item.frequency || 'as prescribed').trim(),
      duration: String(item.duration || '').trim(),
      times: Array.isArray(item.times) ? item.times : ['08:00'],
      notes: String(item.notes || '').trim(),
      prescriber: String(item.prescriber || '').trim(),
    })).filter((m: ExtractedMedication) => m.name.length > 0 && m.dosage.length > 0);

    return { success: true, medications, rawText: responseText };
  } catch (e: any) {
    return { success: false, medications: [], rawText: responseText, error: `Parse error: ${e.message}` };
  }
}

// ============================================================================
// Save Extracted Medications to DB
// ============================================================================

export async function savePrescriptionMedications(
  medications: ExtractedMedication[],
  patientId: string,
): Promise<{ saved: number; reminders: number; errors: string[] }> {
  let saved = 0;
  let reminders = 0;
  const errors: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const med of medications) {
    try {
      const endDate = med.duration ? calculateEndDate(today, med.duration) : '';

      await database.write(async () => {
        // Save medication
        await database.get<Medication>('medications').create((r: any) => {
          r.patientId = patientId;
          r.name = med.name;
          r.dosage = med.dosage;
          r.frequency = med.frequency;
          r.route = 'oral';
          r.prescribedDate = today;
          r.endDate = endDate;
          r.prescriber = med.prescriber;
          r.reason = '';
          r.notes = med.notes;
          r.isActive = true;
          r.createdAt = Date.now();
        });

        // Auto-create reminder
        await database.get<Reminder>('reminders').create((r: any) => {
          r.reminderId = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          r.patientId = patientId;
          r.reminderType = 'medication';
          r.medication = med.name;
          r.dosage = med.dosage;
          r.timeSlots = JSON.stringify(med.times);
          r.startDate = today;
          r.endDate = endDate;
          r.ttsMessage = generateTTSMessage(med.name, med.dosage);
          r.isActive = true;
          r.createdAt = Date.now();
        });
      });

      saved++;
      reminders++;
    } catch (e: any) {
      errors.push(`${med.name}: ${e.message}`);
    }
  }

  return { saved, reminders, errors };
}

function calculateEndDate(startDate: string, duration: string): string {
  const match = duration.match(/(\d+)/);
  if (!match) return '';
  const days = parseInt(match[1], 10);
  const start = new Date(startDate);
  start.setDate(start.getDate() + days);
  return start.toISOString().split('T')[0];
}
