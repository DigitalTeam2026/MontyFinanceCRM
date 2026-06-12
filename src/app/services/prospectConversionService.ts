/**
 * Prospect → Lead conversion service (public API used by UI components).
 *
 * This is the single entry-point for all conversion actions.
 * UI components call convertProspectToLead(prospectId) and receive
 * a typed result – they never talk to Supabase directly.
 *
 * The heavy lifting (atomicity, validation, field mapping) lives in:
 *   • Backend:  convert_prospect_to_lead RPC (migration 20260612160000)
 *   • Preview:  entityConversionEngine.buildConversionPreview
 */

import type { RecordData } from './recordService';
import {
  buildConversionPreview,
  executeProspectToLeadConversion,
} from './entityConversionEngine';
import type { ConversionPreview, ConversionResult } from './entityConversionEngine';

export type { ConversionPreview, ConversionResult };

/**
 * Loads a read-only preview of the conversion: which fields will be set on
 * the new Lead, which required fields are missing, and the rule being used.
 *
 * Returns null when no active Prospect→Lead conversion rule is configured.
 */
export async function loadProspectConversionPreview(
  prospectValues: RecordData,
): Promise<ConversionPreview | null> {
  return buildConversionPreview('prospect', 'lead', prospectValues);
}

/**
 * Executes the Prospect→Lead conversion atomically via the backend RPC.
 *
 * The UI sends only the prospectId – the backend loads the Prospect,
 * applies the Digital-Rule field mappings, creates the Lead, updates the
 * Prospect status, and returns the new Lead ID.
 *
 * Throws a user-friendly error on failure (double-conversion, inactive
 * prospect, missing required fields, permission denied, etc.).
 */
export async function convertProspectToLead(
  prospectId: string,
  userId: string,
): Promise<ConversionResult> {
  return executeProspectToLeadConversion(prospectId, userId);
}

// ─── Guard helpers used by the form page ─────────────────────────────────────

/**
 * Returns true when a Prospect record's state_code indicates it is Active.
 * state_code may be stored as the numeric state_value ('1') or the textual
 * label ('active'/'Active') depending on how the record was created, so both
 * representations are accepted.
 */
export function isProspectActive(values: RecordData): boolean {
  const sc = String(values.state_code ?? values.statecode ?? '').trim().toLowerCase();
  return sc === '1' || sc === 'active';
}

/** Returns true when the Prospect has already been converted. */
export function isProspectConverted(values: RecordData): boolean {
  const sc = String(values.state_code ?? values.statecode ?? '').trim().toLowerCase();
  return (
    sc === '3' ||
    sc === 'converted' ||
    !!(values.converted_lead_id)
  );
}

/** Returns the converted Lead ID stored on the Prospect, or null. */
export function getConvertedLeadId(values: RecordData): string | null {
  return (values.converted_lead_id as string | null | undefined) ?? null;
}
