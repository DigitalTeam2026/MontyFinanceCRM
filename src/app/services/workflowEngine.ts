import { supabase } from '../../lib/supabase';
import { createNotification } from './notificationService';
import type {
  WorkflowStep,
  WorkflowStepType,
  WorkflowTriggerConditions,
  WorkflowFilterCondition,
  SendNotificationConfig,
  UpdateRecordConfig,
  AssignRecordConfig,
  CreateRecordConfig,
  ConditionConfig,
  WaitConfig,
  WebhookConfig,
} from '../../types/workflow';

export interface WorkflowContext {
  entityName: string;
  recordId: string;
  record: Record<string, unknown>;
  triggerUserId: string;
}

interface StepResult {
  status: 'success' | 'failed' | 'skipped';
  result?: Record<string, unknown>;
  error?: string;
  branchTrue?: boolean;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function runWorkflowsForEvent(
  entityLogicalName: string,
  triggerType: 'on_create' | 'on_update' | 'on_status_change',
  recordId: string,
  record: Record<string, unknown>,
  triggerUserId: string,
  prevRecord?: Record<string, unknown> | null
): Promise<void> {
  try {
    const { data: entityDef } = await supabase
      .from('entity_definition')
      .select('entity_definition_id')
      .eq('logical_name', entityLogicalName)
      .maybeSingle();

    if (!entityDef) return;

    const { data: workflows } = await supabase
      .from('workflow_definition')
      .select('workflow_id, trigger_conditions')
      .eq('entity_definition_id', entityDef.entity_definition_id)
      .eq('trigger_type', triggerType)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (!workflows?.length) return;

    const ctx: WorkflowContext = { entityName: entityLogicalName, recordId, record, triggerUserId };

    for (const wf of workflows) {
      // Power Automate parity: a workflow only runs when its trigger conditions
      // (filtering attributes + trigger condition + status transition) are met.
      // Without this gate every active workflow fires on every save.
      if (!matchesTriggerConditions(
        (wf as { trigger_conditions: WorkflowTriggerConditions | null }).trigger_conditions,
        triggerType,
        record,
        prevRecord ?? null,
      )) {
        continue;
      }
      runWorkflow((wf as { workflow_id: string }).workflow_id, ctx, triggerType).catch(() => {});
    }
  } catch {
  }
}

// ─── Trigger-condition gate ─────────────────────────────────────────────────────
// Mirrors Power Automate's Dataverse trigger: a flow stays dormant unless its
// filtering attributes moved, the chosen status transition happened, AND every
// trigger condition holds against the new row.

function matchesTriggerConditions(
  tc: WorkflowTriggerConditions | null | undefined,
  triggerType: 'on_create' | 'on_update' | 'on_status_change',
  record: Record<string, unknown>,
  prevRecord: Record<string, unknown> | null,
): boolean {
  if (!tc) return true;

  // 1. Filtering attributes — on an update, at least one watched field must have
  //    actually changed vs the pre-image. (On create there is no pre-image, so
  //    "changed" is meaningless and this check is skipped.)
  if (triggerType !== 'on_create' && tc.watch_fields?.length && prevRecord) {
    const anyChanged = tc.watch_fields.some((f) => !valuesEqual(record[f], prevRecord[f]));
    if (!anyChanged) return false;
  }

  // 2. Status transition — prev must equal status_from (when set) and the new row
  //    must equal status_to (when set). Catches a SPECIFIC transition, not any edit.
  if (triggerType === 'on_status_change') {
    if (tc.status_from && getStatusValue(prevRecord) !== tc.status_from) return false;
    if (tc.status_to && getStatusValue(record) !== tc.status_to) return false;
  }

  // 3. Trigger condition — ALL filter conditions must hold against the new row.
  //    This is the "only proceed when the value is now X" guard (e.g. is_approved = true).
  if (tc.filter_conditions?.length) {
    if (!tc.filter_conditions.every((c) => evalFilterCondition(c, record))) return false;
  }

  return true;
}

function evalFilterCondition(cond: WorkflowFilterCondition, record: Record<string, unknown>): boolean {
  const raw = record[cond.field];
  const val = raw == null ? '' : String(raw);
  const cmp = cond.value ?? '';
  switch (cond.operator) {
    case 'eq':          return val === cmp;
    case 'neq':         return val !== cmp;
    case 'contains':    return val.toLowerCase().includes(cmp.toLowerCase());
    case 'gt':          return Number(val) > Number(cmp);
    case 'lt':          return Number(val) < Number(cmp);
    case 'is_null':     return raw == null || val === '';
    case 'is_not_null': return raw != null && val !== '';
    default:            return true;
  }
}

// Status lives under different physical names across entities; probe the usual ones.
function getStatusValue(record: Record<string, unknown> | null): string {
  if (!record) return '';
  for (const k of ['statuscode', 'status_code', 'statecode', 'state_code', 'status']) {
    if (record[k] != null) return String(record[k]);
  }
  return '';
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  return String(a ?? '') === String(b ?? '');
}

// ─── Single workflow runner ───────────────────────────────────────────────────

export async function runWorkflow(
  workflowId: string,
  ctx: WorkflowContext,
  triggerType: string
): Promise<void> {
  const { data: steps } = await supabase
    .from('workflow_step')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('step_order');

  if (!steps?.length) return;

  const runId = await startRunLog(workflowId, ctx, triggerType);

  let stepCount = 0;
  let runStatus: 'completed' | 'failed' | 'partial' = 'completed';
  let lastError: string | undefined;

  let currentRecord = { ...ctx.record };

  for (const step of steps) {
    const result = await executeStep(step as WorkflowStep, { ...ctx, record: currentRecord });
    stepCount++;

    await logStep(runId, step as WorkflowStep, result);

    if (result.status === 'failed') {
      lastError = result.error;
      runStatus = stepCount === 1 ? 'failed' : 'partial';
      break;
    }

    if ((step as WorkflowStep).step_type === 'condition' && result.branchTrue === false) {
      break;
    }

    if ((step as WorkflowStep).step_type === 'update_record' && result.result?.updatedRecord) {
      currentRecord = { ...currentRecord, ...(result.result.updatedRecord as Record<string, unknown>) };
    }
  }

  await finishRunLog(runId, runStatus, stepCount, lastError);

  try {
    await supabase.rpc('increment_workflow_run_count', { wf_id: workflowId });
  } catch {
  }
}

// ─── Step dispatcher ──────────────────────────────────────────────────────────

async function executeStep(step: WorkflowStep, ctx: WorkflowContext): Promise<StepResult> {
  try {
    switch (step.step_type as WorkflowStepType) {
      case 'send_notification': return await execSendNotification(step, ctx);
      case 'update_record':     return await execUpdateRecord(step, ctx);
      case 'assign_record':     return await execAssignRecord(step, ctx);
      case 'create_record':     return await execCreateRecord(step, ctx);
      case 'condition':         return await execCondition(step, ctx);
      case 'wait':              return await execWait(step, ctx);
      case 'webhook':           return await execWebhook(step, ctx);
      default:                  return { status: 'skipped' };
    }
  } catch (e: unknown) {
    return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── send_notification ────────────────────────────────────────────────────────

async function execSendNotification(step: WorkflowStep, ctx: WorkflowContext): Promise<StepResult> {
  const config = step.config_json as SendNotificationConfig;
  if (!config?.recipients?.length) return { status: 'skipped' };

  const recipientIds = await resolveRecipients(config, ctx);
  let sent = 0;

  for (const recipientId of recipientIds) {
    if (!recipientId) continue;
    try {
      await createNotification({
        recipient_id: recipientId,
        sender_id: null,
        type: 'workflow_alert',
        title: config.subject ?? 'Workflow notification',
        body: config.body ? interpolate(config.body, ctx.record) : null,
        entity_name: ctx.entityName,
        record_id: ctx.recordId,
      });
      sent++;
    } catch {
    }
  }

  return { status: 'success', result: { sent, recipients: recipientIds.length } };
}

// ─── update_record ────────────────────────────────────────────────────────────

async function execUpdateRecord(step: WorkflowStep, ctx: WorkflowContext): Promise<StepResult> {
  const config = step.config_json as UpdateRecordConfig;
  if (!config?.field_updates?.length) return { status: 'skipped' };

  const patch: Record<string, unknown> = {};
  for (const u of config.field_updates) {
    if (!u.field_logical_name) continue;
    if (u.value_type === 'static') {
      patch[u.field_logical_name] = u.value;
    } else if (u.value_type === 'field_ref') {
      patch[u.field_logical_name] = ctx.record[u.value] ?? null;
    } else if (u.value_type === 'formula') {
      patch[u.field_logical_name] = evalFormula(u.value, ctx.record);
    }
  }

  if (!Object.keys(patch).length) return { status: 'skipped' };

  const { error } = await supabase
    .from(ctx.entityName)
    .update({ ...patch, modified_at: new Date().toISOString() })
    .eq(`${ctx.entityName}_id`, ctx.recordId);

  if (error) return { status: 'failed', error: error.message };

  return { status: 'success', result: { updatedRecord: patch, fields: Object.keys(patch) } };
}

// ─── assign_record ────────────────────────────────────────────────────────────

async function execAssignRecord(step: WorkflowStep, ctx: WorkflowContext): Promise<StepResult> {
  const config = step.config_json as AssignRecordConfig;
  const ownerField = config.ownership_field ?? 'owner_id';

  let newOwnerId: string | null = null;

  if (config.assign_to === 'user' && config.user_id) {
    newOwnerId = config.user_id;
  } else if (config.assign_to === 'field_value' && config.field_ref) {
    const val = ctx.record[config.field_ref];
    if (typeof val === 'string') newOwnerId = val;
  } else if (config.assign_to === 'team' && config.team_id) {
    const { error } = await supabase
      .from(ctx.entityName)
      .update({ team_id: config.team_id, modified_at: new Date().toISOString() })
      .eq(`${ctx.entityName}_id`, ctx.recordId);
    if (error) return { status: 'failed', error: error.message };
    return { status: 'success', result: { assigned_team: config.team_id } };
  }

  if (!newOwnerId) return { status: 'skipped' };

  const { error } = await supabase
    .from(ctx.entityName)
    .update({ [ownerField]: newOwnerId, modified_at: new Date().toISOString() })
    .eq(`${ctx.entityName}_id`, ctx.recordId);

  if (error) return { status: 'failed', error: error.message };

  return { status: 'success', result: { assigned_owner: newOwnerId } };
}

// ─── create_record ────────────────────────────────────────────────────────────

async function execCreateRecord(step: WorkflowStep, ctx: WorkflowContext): Promise<StepResult> {
  const config = step.config_json as CreateRecordConfig;
  if (!config?.target_entity_logical_name) return { status: 'skipped' };

  const newRecord: Record<string, unknown> = {};

  for (const m of config.field_mappings ?? []) {
    if (!m.target_field) continue;
    if (m.source_type === 'static') {
      newRecord[m.target_field] = m.source_value;
    } else if (m.source_type === 'field_ref') {
      newRecord[m.target_field] = ctx.record[m.source_value] ?? null;
    } else if (m.source_type === 'current_user') {
      newRecord[m.target_field] = ctx.triggerUserId;
    }
  }

  const { data, error } = await supabase
    .from(config.target_entity_logical_name)
    .insert(newRecord)
    .select()
    .maybeSingle();

  if (error) return { status: 'failed', error: error.message };

  return { status: 'success', result: { created_entity: config.target_entity_logical_name, created_id: (data as Record<string, unknown> | null)?.[`${config.target_entity_logical_name}_id`] } };
}

// ─── condition ────────────────────────────────────────────────────────────────

async function execCondition(step: WorkflowStep, ctx: WorkflowContext): Promise<StepResult> {
  const config = step.config_json as ConditionConfig;
  if (!config?.conditions?.length) return { status: 'success', branchTrue: true };

  const allMet = config.conditions.every((c) => {
    const raw = ctx.record[c.field];
    const val = raw == null ? '' : String(raw);
    const cmp = c.value ?? '';

    switch (c.operator) {
      case 'eq':           return val === cmp;
      case 'neq':          return val !== cmp;
      case 'contains':     return val.toLowerCase().includes(cmp.toLowerCase());
      case 'gt':           return Number(val) > Number(cmp);
      case 'lt':           return Number(val) < Number(cmp);
      case 'gte':          return Number(val) >= Number(cmp);
      case 'lte':          return Number(val) <= Number(cmp);
      case 'is_null':      return raw == null || val === '';
      case 'is_not_null':  return raw != null && val !== '';
      default:             return true;
    }
  });

  return { status: 'success', branchTrue: allMet, result: { branch: allMet ? 'true' : 'false' } };
}

// ─── wait ─────────────────────────────────────────────────────────────────────

async function execWait(step: WorkflowStep, ctx: WorkflowContext): Promise<StepResult> {
  const config = step.config_json as WaitConfig;

  let resumeAt: Date;

  if (config.wait_type === 'duration') {
    const value = config.duration_value ?? 1;
    const unit = config.duration_unit ?? 'hours';
    const ms = unit === 'minutes' ? value * 60_000
             : unit === 'hours'   ? value * 3_600_000
             :                      value * 86_400_000;
    resumeAt = new Date(Date.now() + ms);
  } else if (config.wait_type === 'until_field' && config.field_ref) {
    const dateVal = ctx.record[config.field_ref];
    resumeAt = dateVal ? new Date(String(dateVal)) : new Date(Date.now() + 3_600_000);
  } else {
    return { status: 'skipped' };
  }

  const { error } = await supabase
    .from('scheduled_workflow_step')
    .insert({
      workflow_id: step.workflow_id,
      workflow_step_id: step.workflow_step_id,
      entity_name: ctx.entityName,
      record_id: ctx.recordId,
      trigger_user_id: ctx.triggerUserId,
      context_snapshot: ctx.record,
      resume_at: resumeAt.toISOString(),
      status: 'pending',
    });

  if (error) return { status: 'failed', error: error.message };

  return { status: 'success', result: { resume_at: resumeAt.toISOString(), scheduled: true } };
}

// ─── webhook ──────────────────────────────────────────────────────────────────

async function execWebhook(step: WorkflowStep, ctx: WorkflowContext): Promise<StepResult> {
  const config = step.config_json as WebhookConfig;
  if (!config?.url) return { status: 'skipped' };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const edgeFnUrl = `${supabaseUrl}/functions/v1/workflow-webhook`;

  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token ?? anonKey;

  const payload = {
    // The edge function resolves the URL from this step server-side (authoritative);
    // `url` is sent only as a fallback and is SSRF-validated server-side regardless.
    workflow_step_id: step.workflow_step_id,
    url: config.url,
    method: config.method ?? 'POST',
    headers: Object.fromEntries((config.headers ?? []).map((h) => [h.key, h.value])),
    body: config.body_template ? interpolate(config.body_template, ctx.record) : undefined,
    record: ctx.record,
    entity_name: ctx.entityName,
    record_id: ctx.recordId,
  };

  const resp = await fetch(edgeFnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    return {
      status: 'failed',
      error: `Webhook proxy returned ${resp.status}: ${body?.error ?? 'unknown error'}`,
      result: { status_code: resp.status, body },
    };
  }

  return {
    status: 'success',
    result: { status_code: body.status_code ?? resp.status, body: body.response_preview ?? body.response_body },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveRecipients(config: SendNotificationConfig, ctx: WorkflowContext): Promise<string[]> {
  const ids: string[] = [];

  for (const r of config.recipients ?? []) {
    if (r.type === 'specific_user' && r.user_id) {
      ids.push(r.user_id);
    } else if (r.type === 'owner') {
      const ownerId = ctx.record.owner_id as string | null;
      if (ownerId) ids.push(ownerId);
    } else if (r.type === 'creator') {
      const creatorId = ctx.record.created_by as string | null;
      if (creatorId) ids.push(creatorId);
    } else if (r.type === 'field_ref' && r.field_ref) {
      const val = ctx.record[r.field_ref];
      if (typeof val === 'string') {
        const { data } = await supabase.rpc('fn_lookup_user_by_email', { p_email: val });
        if (data) ids.push(data as string);
      }
    }
  }

  return [...new Set(ids)];
}

function interpolate(template: string, record: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = record[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

function evalFormula(formula: string, record: Record<string, unknown>): unknown {
  const interpolated = interpolate(formula, record);
  if (interpolated === 'now()') return new Date().toISOString();
  if (interpolated === 'today()') return new Date().toISOString().split('T')[0];
  const num = Number(interpolated);
  if (!isNaN(num)) return num;
  return interpolated;
}

// ─── Run log helpers ──────────────────────────────────────────────────────────

async function startRunLog(workflowId: string, ctx: WorkflowContext, triggerType: string): Promise<string> {
  const { data } = await supabase
    .from('workflow_run_log')
    .insert({
      workflow_id: workflowId,
      entity_name: ctx.entityName,
      record_id: ctx.recordId,
      trigger_type: triggerType,
      status: 'running',
    })
    .select('run_id')
    .maybeSingle();

  return (data as { run_id: string } | null)?.run_id ?? '';
}

async function finishRunLog(
  runId: string,
  status: 'completed' | 'failed' | 'partial',
  stepsExecuted: number,
  errorMessage?: string
): Promise<void> {
  if (!runId) return;
  await supabase
    .from('workflow_run_log')
    .update({
      status,
      steps_executed: stepsExecuted,
      error_message: errorMessage ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('run_id', runId);
}

async function logStep(runId: string, step: WorkflowStep, result: StepResult): Promise<void> {
  if (!runId) return;
  await supabase
    .from('workflow_step_log')
    .insert({
      run_id: runId,
      workflow_step_id: step.workflow_step_id,
      step_type: step.step_type,
      step_name: step.label ?? step.name,
      status: result.status,
      result_json: result.result ?? null,
      error_message: result.error ?? null,
    });
}

export async function triggerWorkflowNotifications(
  ctx: WorkflowContext,
  steps: WorkflowStep[]
): Promise<void> {
  const notifSteps = steps.filter((s) => s.step_type === 'send_notification');
  for (const step of notifSteps) {
    await execSendNotification(step, ctx).catch(() => {});
  }
}
