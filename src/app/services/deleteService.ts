import { sendRaw } from '../../lib/api';
import type { AppEntity } from '../types';

export interface DeleteRuleCheckResult {
  requires_confirmation: boolean;
  confirmation_messages: string[];
  rules_matched: string[];
  blocked?: boolean;
  block_messages?: string[];
}

export interface DeleteResult {
  success: boolean;
  deleted: number;
  errors: number;
  actions_executed: string[];
  blocked?: boolean;
  block_messages?: string[];
  error?: string;
}

// The Supabase edge function `execute-delete-rules` was removed with Supabase
// cloud. Delete now goes through the local Node API (server/deleteRules.js),
// reached same-origin at /api/delete-rules (IIS/Vite proxy the API). sendRaw
// always resolves (never throws) and attaches the Bearer token, so callers can
// no longer hang on a rejected fetch.
async function callDeleteEngine(body: {
  entity: string;
  record_ids: string[];
  confirmed?: boolean;
  dry_run?: boolean;
}): Promise<Record<string, unknown>> {
  const { ok, status, body: resBody } = await sendRaw<Record<string, unknown>>(
    '/api/delete-rules',
    { method: 'POST', body: JSON.stringify(body) },
  );
  const json = (resBody ?? {}) as Record<string, unknown>;
  // Carry the HTTP status through so executeDelete() can map non-2xx to errors,
  // mirroring the previous `res.ok` check on the raw Response.
  return { ...json, __ok: ok, __status: status };
}

export async function checkDeleteRules(
  entity: AppEntity | string,
  recordIds: string[]
): Promise<DeleteRuleCheckResult> {
  const json = await callDeleteEngine({
    entity: entity as string,
    record_ids: recordIds,
    dry_run: true,
  });
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String) : [];
  if (json.blocked) {
    return {
      requires_confirmation: false,
      confirmation_messages: [],
      rules_matched: [],
      blocked: true,
      block_messages: json.block_messages
        ? asStrings(json.block_messages)
        : [String(json.error ?? 'Delete blocked')],
    };
  }
  return {
    requires_confirmation: Boolean(json.requires_confirmation),
    confirmation_messages: asStrings(json.confirmation_messages),
    rules_matched: asStrings(json.rules_matched),
  };
}

export async function executeDelete(
  entity: AppEntity | string,
  recordIds: string[],
  confirmed = false
): Promise<DeleteResult> {
  const json = await callDeleteEngine({
    entity: entity as string,
    record_ids: recordIds,
    confirmed,
  });

  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String) : [];
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' ? v : fallback;

  if (json.requires_confirmation && !confirmed) {
    return {
      success: false,
      deleted: 0,
      errors: 0,
      actions_executed: [],
      blocked: false,
      block_messages: asStrings(json.confirmation_messages),
    };
  }

  if (json.blocked) {
    return {
      success: false,
      deleted: 0,
      errors: 0,
      actions_executed: [],
      blocked: true,
      block_messages: json.block_messages
        ? asStrings(json.block_messages)
        : [String(json.error ?? 'Delete blocked')],
    };
  }

  if (!json.__ok) {
    return {
      success: false,
      deleted: 0,
      errors: recordIds.length,
      actions_executed: asStrings(json.actions_executed),
      error: String(json.error ?? 'Delete failed'),
    };
  }

  return {
    success: json.success !== false,
    deleted: num(json.deleted, recordIds.length),
    errors: num(json.errors, 0),
    actions_executed: asStrings(json.actions_executed),
  };
}
