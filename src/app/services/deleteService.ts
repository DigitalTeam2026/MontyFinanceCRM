import { supabase } from '../../lib/supabase';
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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function getAuthHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return `Bearer ${data.session?.access_token ?? SUPABASE_ANON_KEY}`;
}

async function callDeleteEngine(body: {
  entity: string;
  record_ids: string[];
  confirmed?: boolean;
  dry_run?: boolean;
}): Promise<Response> {
  const url = `${SUPABASE_URL}/functions/v1/execute-delete-rules`;
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: await getAuthHeader(),
      'Content-Type': 'application/json',
      Apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
}

export async function checkDeleteRules(
  entity: AppEntity | string,
  recordIds: string[]
): Promise<DeleteRuleCheckResult> {
  const res = await callDeleteEngine({
    entity: entity as string,
    record_ids: recordIds,
    dry_run: true,
  });
  const json = await res.json();
  if (json.blocked) {
    return {
      requires_confirmation: false,
      confirmation_messages: [],
      rules_matched: [],
      blocked: true,
      block_messages: json.block_messages ?? [json.error ?? 'Delete blocked'],
    };
  }
  return {
    requires_confirmation: json.requires_confirmation ?? false,
    confirmation_messages: json.confirmation_messages ?? [],
    rules_matched: json.rules_matched ?? [],
  };
}

export async function executeDelete(
  entity: AppEntity | string,
  recordIds: string[],
  confirmed = false
): Promise<DeleteResult> {
  const res = await callDeleteEngine({
    entity: entity as string,
    record_ids: recordIds,
    confirmed,
  });
  const json = await res.json();

  if (json.requires_confirmation && !confirmed) {
    return {
      success: false,
      deleted: 0,
      errors: 0,
      actions_executed: [],
      blocked: false,
      block_messages: json.confirmation_messages,
    };
  }

  if (json.blocked) {
    return {
      success: false,
      deleted: 0,
      errors: 0,
      actions_executed: [],
      blocked: true,
      block_messages: json.block_messages ?? [json.error ?? 'Delete blocked'],
    };
  }

  if (!res.ok) {
    return {
      success: false,
      deleted: 0,
      errors: recordIds.length,
      actions_executed: json.actions_executed ?? [],
      error: json.error ?? 'Delete failed',
    };
  }

  return {
    success: json.success ?? true,
    deleted: json.deleted ?? recordIds.length,
    errors: json.errors ?? 0,
    actions_executed: json.actions_executed ?? [],
  };
}
