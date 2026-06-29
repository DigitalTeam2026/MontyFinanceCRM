// workflowActions — the side-effecting "functions" registry, a CRM-backed port of
// the reference actions.js. Each action is a small plugin. In the reference they
// call a REST `api`; here they call Supabase / the CRM directly so the CRM stays
// the source of truth. Add a new function = add one registerAction() line.
//
// The record actions (list/get/create/update/delete) are your CRM "connector" —
// the equivalents of Power Automate's Dataverse row actions. They take an entity
// by its LOGICAL name and resolve the physical table + primary key from
// entity_definition, so flows are authored in business terms, not DB names.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from '../../lib/supabase';
import { createNotification } from './notificationService';
import {
  candidateSoftDeleteModes,
  applySoftDeleteFilter,
  rememberSoftDeleteMode,
  isMissingColumnError,
} from '../components/lookupSoftDelete';
import { coerceJson, applyFilters, softDeletePatch } from './workflowActionsHelpers';
import type { FlowEngine } from './workflowEngineV2';

export function registerActions(engine: FlowEngine): FlowEngine {
  // create_task — insert a task/activity row. Table/columns are configurable via params.
  engine.registerAction('create_task', async (p: any) => {
    const table = p.table || 'task';
    const row: Record<string, unknown> = {
      subject: p.title,
      owner_id: p.assignee ?? null,
    };
    if (p.dueInDays != null) {
      row.scheduledend = new Date(Date.now() + Number(p.dueInDays) * 86400000).toISOString();
    }
    const { data, error } = await supabase.from(table).insert(row).select().maybeSingle();
    if (error) throw new Error(error.message);
    return { id: (data as any)?.[`${table}_id`] ?? null };
  });

  // ── record actions: your CRM "connector" (the Dataverse-row equivalents) ──

  // list_records — query rows and return an ARRAY (feeds straight into apply_to_each).
  // params: { entity, filters?, select?, orderBy?, ascending?, limit?, includeDeleted? }
  // filters: [{ field, op, value }] (ops: eq/neq/gt/gte/lt/lte/like/contains/in/is_empty)
  //          or a plain object { field: value, ... } meaning equals.
  // Soft-deleted rows are excluded by default (probing the table's soft-delete shape);
  // pass includeDeleted: true to return everything.
  engine.registerAction('list_records', async (p: any) => {
    const { table } = await resolveEntity(p.entity);
    const base = () => {
      let q: any = supabase.from(table).select(p.select || '*');
      q = applyFilters(q, p.filters);
      if (p.orderBy) q = q.order(p.orderBy, { ascending: p.ascending !== false });
      if (p.limit != null) q = q.limit(Number(p.limit));
      return q;
    };

    if (p.includeDeleted) {
      const { data, error } = await base();
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    // Probe soft-delete modes in order, self-healing per table (same approach as lookups).
    let lastErr: any = null;
    for (const mode of candidateSoftDeleteModes(table)) {
      const { data, error } = await applySoftDeleteFilter(base(), mode);
      if (!error) { rememberSoftDeleteMode(table, mode); return data ?? []; }
      if (!isMissingColumnError(error)) throw new Error(error.message);  // a real error (e.g. bad filter field)
      lastErr = error;
    }
    throw new Error(lastErr?.message || 'list_records failed');
  });

  // get_record — fetch a single row by id. params: { entity, recordId, select?, pk? }
  engine.registerAction('get_record', async (p: any) => {
    const { table, pk } = await resolveEntity(p.entity);
    const key = p.pk || pk;
    const { data, error } = await supabase.from(table).select(p.select || '*').eq(key, p.recordId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

  // create_record — insert a row. params: { entity, fields, pk? } → { id, record }
  engine.registerAction('create_record', async (p: any) => {
    const { table, pk } = await resolveEntity(p.entity);
    const key = p.pk || pk;
    const { data, error } = await supabase.from(table).insert(coerceJson(p.fields) ?? {}).select().maybeSingle();
    if (error) throw new Error(error.message);
    return { id: (data as any)?.[key] ?? null, record: data ?? null };
  });

  // update_record — patch fields on a record. params: { entity, recordId, fields, pk? }
  engine.registerAction('update_record', async (p: any) => {
    const { table, pk } = await resolveEntity(p.entity);
    const key = p.pk || pk;
    const { error } = await supabase.from(table).update(coerceJson(p.fields) ?? {}).eq(key, p.recordId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

  // assign_owner — set the owner of a record. params: { entity, recordId, ownerId, ownerField?, pk? }
  engine.registerAction('assign_owner', async (p: any) => {
    const { table, pk } = await resolveEntity(p.entity);
    const key = p.pk || pk;
    const field = p.ownerField || 'owner_id';
    const { error } = await supabase.from(table).update({ [field]: p.ownerId }).eq(key, p.recordId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

  // delete_record — remove a single row by id (or rows matching filters). Set
  // { soft: true } to soft-delete using the table's own soft-delete column
  // (is_deleted / deleted_at / is_active), or pass softField to force one.
  // params: { entity, recordId?, filters?, pk?, soft?, softField? }
  engine.registerAction('delete_record', async (p: any) => {
    const { table, pk } = await resolveEntity(p.entity);
    const key = p.pk || pk;
    if (p.recordId == null && !p.filters) throw new Error('delete_record requires recordId or filters');
    const scope = (q: any) => (p.recordId != null ? q.eq(key, p.recordId) : applyFilters(q, p.filters));

    if (p.soft) {
      const { field, value } = softDeletePatch(table, p.softField);
      const { error } = await scope(supabase.from(table).update({ [field]: value }));
      if (error) throw new Error(error.message);
      return { ok: true, soft: true, field };
    }

    const { error } = await scope(supabase.from(table).delete());
    if (error) throw new Error(error.message);
    return { ok: true };
  });

  // send_email — Outlook-style send. Recipients given as EMAIL addresses go out as a
  // real email via Microsoft 365 (the send-email edge function → Graph sendMail).
  // Recipients given as a CRM user UUID get an in-app notification instead. Both can
  // be mixed in one step, and if the mailer isn't configured the email recipients are
  // simply reported (in-app delivery still works).
  engine.registerAction('send_email', async (p: any) => {
    const toAll = splitRecipients(p.to ?? p.recipientId);
    const ccEmails = splitRecipients(p.cc).filter(isEmail);
    const bccEmails = splitRecipients(p.bcc).filter(isEmail);
    const emails = toAll.filter(isEmail);
    const userIds = toAll.filter((v) => isUuid(v));
    const isHtml = p.isHtml !== false;
    const body = p.bodyHtml ?? p.body ?? '';
    const subject = p.subject ?? '';
    const attachments = (Array.isArray(p.attachments) ? p.attachments : [])
      .map(toGraphAttachment)
      .filter(Boolean) as { name: string; contentType: string; contentBytes: string }[];

    const out: Record<string, unknown> = {};

    // 1) Real email via Microsoft Graph when there are email recipients.
    if (emails.length) {
      const res = await sendEmailViaGraph({
        to: emails, cc: ccEmails, bcc: bccEmails, subject, body, isHtml,
        importance: p.importance, replyTo: splitRecipients(p.replyTo), from: p.from,
        attachments,
      });
      out.email = res.ok ? 'sent' : res.notConfigured ? 'not_configured' : 'failed';
      out.to = emails;
      if (!res.ok) out.emailError = res.error;
    }

    // 2) In-app notification for any user-id recipients (works with no mailer).
    for (const uid of userIds) {
      await createNotification({
        recipient_id: uid,
        sender_id: null,
        type: 'workflow_alert',
        title: subject || 'Workflow notification',
        body: isHtml ? stripHtml(body) : body,
        entity_name: p.entity ?? null,
        record_id: p.recordId ?? null,
      });
    }
    if (userIds.length) out.inApp = userIds.length;

    if (!emails.length && !userIds.length) out.delivered = 'queued'; // nothing resolvable
    return out;
  });

  // http_request — generic external API call, proxied through the SSRF-validated
  // workflow-webhook edge function (never call arbitrary URLs straight from here).
  engine.registerAction('http_request', async (p: any) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token ?? anonKey;

    const resp = await fetch(`${supabaseUrl}/functions/v1/workflow-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        url: p.url,
        method: p.method || 'GET',
        headers: p.headers || {},
        body: p.body,
      }),
    });
    const body = await resp.json().catch(() => ({}));
    return { status: body.status_code ?? resp.status, body: body.response_preview ?? body.response_body };
  });

  return engine;
}

// ── entity resolution: logical name → physical table + primary key ─────────────
interface EntityMeta { table: string; pk: string; }
const entityMetaCache = new Map<string, EntityMeta>();

// Resolve an entity given by its logical name to its physical table and PK column.
// Falls back to treating the given name as a physical table (pk = `${name}_id`)
// when it isn't a registered logical entity, so passing a raw table name still works.
async function resolveEntity(entity: string): Promise<EntityMeta> {
  if (!entity) throw new Error('This action requires an "entity" param (the table\'s logical name).');
  const cached = entityMetaCache.get(entity);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('entity_definition')
    .select('physical_table_name, primary_key_column, logical_name')
    .eq('logical_name', entity)
    .maybeSingle();

  const table = (data?.physical_table_name as string) || entity;
  const pk = (data?.primary_key_column as string) || `${(data?.logical_name as string) || entity}_id`;
  const meta: EntityMeta = { table, pk };
  // Only cache a definitive resolution (a transient error shouldn't pin a wrong fallback).
  if (!error) entityMetaCache.set(entity, meta);
  return meta;
}

// The column + value to write for a soft delete on `table` (or an explicit field).
function softDeletePatch(table: string, softField?: string): { field: string; value: unknown } {
  if (softField) {
    return { field: softField, value: softField === 'deleted_at' ? new Date().toISOString() : true };
  }
  const mode = resolveSoftDeleteMode(table);
  if (mode === 'none') throw new Error(`delete_record: ${table} has no soft-delete column — use a hard delete (omit soft) or pass softField.`);
  if (mode === 'deleted_at') return { field: 'deleted_at', value: new Date().toISOString() };
  if (mode === 'is_active') return { field: 'is_active', value: false };
  return { field: 'is_deleted', value: true };
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Send a one-off TEST email straight through the Graph mailer (used by the composer's
// "Send test email" button). Placeholders are NOT resolved — put a real address in `to`.
export async function sendTestEmail(p: any): Promise<{ ok: boolean; notConfigured?: boolean; error?: string; to?: string[] }> {
  const to = splitRecipients(p.to ?? p.recipientId).filter(isEmail);
  const cc = splitRecipients(p.cc).filter(isEmail);
  const bcc = splitRecipients(p.bcc).filter(isEmail);
  if (!to.length) {
    return { ok: false, error: 'Put at least one real email address in “To” to send a test (a {{placeholder}} or user id can’t be tested directly).' };
  }
  const attachments = (Array.isArray(p.attachments) ? p.attachments : [])
    .map(toGraphAttachment)
    .filter(Boolean) as { name: string; contentType: string; contentBytes: string }[];
  const res = await sendEmailViaGraph({
    to, cc, bcc,
    subject: p.subject ? `[TEST] ${p.subject}` : '[TEST] Workflow email',
    body: p.body ?? '<p>This is a test email from the workflow email composer.</p>',
    isHtml: p.isHtml !== false,
    importance: p.importance, replyTo: splitRecipients(p.replyTo), from: p.from,
    attachments,
  });
  return { ...res, to };
}

// Split a recipients param (array, or comma/semicolon-separated string) into a list.
function splitRecipients(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Convert a composer attachment ({ name, type, content: dataURL | base64 }) to the
// Graph fileAttachment shape ({ name, contentType, contentBytes }). Returns null if
// there's no usable content.
function toGraphAttachment(a: any): { name: string; contentType: string; contentBytes: string } | null {
  if (!a) return null;
  const content = a.content ?? a.contentBytes ?? a.dataUrl;
  if (typeof content !== 'string' || !content) return null;
  const m = content.match(/^data:([^;]*);base64,(.*)$/);
  if (m) return { name: a.name ?? 'attachment', contentType: a.type || m[1] || 'application/octet-stream', contentBytes: m[2] };
  return { name: a.name ?? 'attachment', contentType: a.type || 'application/octet-stream', contentBytes: content };
}

// Call the send-email edge function (Microsoft Graph). Returns { ok, notConfigured?, error? }.
async function sendEmailViaGraph(body: Record<string, unknown>): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token ?? anonKey;
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => ({}));
    return { ok: !!json.ok, notConfigured: !!json.notConfigured, error: json.error };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

// Reduce an HTML body to readable plain text for the in-app notification fallback.
function stripHtml(s: any): string {
  if (typeof s !== 'string') return s == null ? '' : String(s);
  return s
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
