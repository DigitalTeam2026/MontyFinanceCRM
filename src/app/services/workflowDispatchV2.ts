// workflowDispatchV2 — runs engine-v2 (nested JSON) flows on CRM record events.
// Coexists with the legacy flat engine: only workflows that have a `definition`
// (authored in the new format) run here. The run trace is persisted for audit.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from '../../lib/supabase';
import { FlowEngine, type FlowDefinition, type FlowEvent } from './workflowEngineV2';
import { registerActions } from './workflowActions';

// One engine with the action registry, reused across events.
const engine = registerActions(new FlowEngine());

const EVENT_TYPE: Record<'on_create' | 'on_update' | 'on_delete', string> = {
  on_create: 'record.created',
  on_update: 'record.updated',
  on_delete: 'record.deleted',
};

export async function runFlowsV2ForEvent(
  entityLogicalName: string,
  trigger: 'on_create' | 'on_update' | 'on_delete',
  recordId: string,
  record: Record<string, unknown>,
  before?: Record<string, unknown> | null,
): Promise<void> {
  try {
    // Only active flows that have a v2 definition; the engine itself filters by
    // trigger type / entity / conditions via matchesTrigger.
    const { data: workflows } = await supabase
      .from('workflow_definition')
      .select('workflow_id, definition')
      .not('definition', 'is', null)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (!workflows?.length) return;

    // Callers pass the physical table name; the Designer's trigger.entity is the
    // logical name. Resolve to the logical name so they match (identical for tables
    // with no prefix, different for crm_-prefixed ones).
    const event: FlowEvent = {
      type: EVENT_TYPE[trigger],
      entity: await resolveLogicalEntity(entityLogicalName),
      recordId,
      record,
      before: before ?? {},
      changedFields: diffFields(before ?? {}, record),
    };

    for (const wf of workflows) {
      const def = (wf as { definition: FlowDefinition | null }).definition;
      if (!def) continue;
      runOne((wf as { workflow_id: string }).workflow_id, def, event).catch(() => {});
    }
  } catch {
    /* dispatch is best-effort and must never block the save */
  }
}

async function runOne(workflowId: string, def: FlowDefinition, event: FlowEvent): Promise<void> {
  try {
    const result = await engine.run(def, event);
    if (result.skipped) return; // trigger didn't match — nothing to log

    const failed = (result.status ?? 'Succeeded').toLowerCase().includes('fail');
    await supabase.from('workflow_run_log').insert({
      workflow_id: workflowId,
      entity_name: event.entity,
      record_id: event.recordId ?? null,
      trigger_type: event.type,
      status: failed ? 'failed' : 'completed',
      steps_executed: result.trace.length,
      error_message: failed ? lastTraceError(result.trace) : null,
      trace_json: result.trace,
      completed_at: new Date().toISOString(),
    });

    try { await supabase.rpc('increment_workflow_run_count', { wf_id: workflowId }); } catch { /* non-fatal */ }
  } catch (err: any) {
    // The engine threw (e.g. an action failed) — record the failure so it's visible
    // in the run history instead of silently disappearing.
    await supabase.from('workflow_run_log').insert({
      workflow_id: workflowId,
      entity_name: event.entity,
      record_id: event.recordId ?? null,
      trigger_type: event.type,
      status: 'failed',
      steps_executed: 0,
      error_message: String(err?.message ?? err),
      trace_json: null,
      completed_at: new Date().toISOString(),
    }).then(() => {}, () => {});
  }
}

// The most recent error captured in a run trace (scope catch / action failure).
function lastTraceError(trace: any[]): string | null {
  for (let i = trace.length - 1; i >= 0; i--) {
    if (trace[i]?.error) return String(trace[i].error);
  }
  return null;
}

// Map a physical table name (or logical name) to the canonical logical_name used
// in trigger.entity. Cached; falls back to the input when nothing is found.
const logicalEntityCache = new Map<string, string>();
async function resolveLogicalEntity(name: string): Promise<string> {
  if (logicalEntityCache.has(name)) return logicalEntityCache.get(name)!;
  let logical = name;
  try {
    const { data } = await supabase
      .from('entity_definition')
      .select('logical_name')
      .or(`logical_name.eq.${name},physical_table_name.eq.${name}`)
      .limit(1);
    logical = (data?.[0]?.logical_name as string) || name;
  } catch { /* fall back to the given name */ }
  logicalEntityCache.set(name, logical);
  return logical;
}

function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const k of keys) if (before[k] !== after[k]) changed.push(k);
  return changed;
}
