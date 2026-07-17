import { supabase } from '../lib/supabase';
import type {
  AutomationRule,
  AutomationRuleAction,
  AutomationActionType,
  AutomationBranch,
  AutomationActionConfig,
  AutomationRunAfter,
  AutomationJob,
  AutomationJobActionLog,
  AutomationRunHistoryRow,
  ScheduleConfig,
} from '../types/automationRule';

/**
 * Compute the next fire time for a schedule config (mirrors the server worker's
 * computeNextRun; server local time). Returned as an ISO string for next_run_at.
 */
export function computeNextRunAt(cfg: ScheduleConfig, from: Date = new Date()): string {
  const clamp = (v: number | undefined, lo: number, hi: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : d;
  };
  const minute = clamp(cfg.minute, 0, 59, 0);
  const hour = clamp(cfg.hour, 0, 23, 8);
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);

  if (cfg.frequency === 'hourly') {
    d.setMinutes(minute);
    if (d <= from) d.setTime(d.getTime() + 3_600_000);
  } else if (cfg.frequency === 'weekly') {
    const weekday = clamp(cfg.weekday, 0, 6, 1);
    d.setHours(hour, minute, 0, 0);
    let delta = (weekday - d.getDay() + 7) % 7;
    if (delta === 0 && d <= from) delta = 7;
    d.setDate(d.getDate() + delta);
  } else if (cfg.frequency === 'monthly') {
    const monthday = clamp(cfg.monthday, 1, 31, 1);
    const setDay = (dt: Date) => {
      const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
      dt.setDate(Math.min(monthday, last));
    };
    d.setHours(hour, minute, 0, 0);
    setDay(d);
    if (d <= from) { d.setDate(1); d.setMonth(d.getMonth() + 1); setDay(d); }
  } else {
    d.setHours(hour, minute, 0, 0);
    if (d <= from) d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

// ── Rules ──────────────────────────────────────────────────────────────────

export async function fetchAllRules(): Promise<AutomationRule[]> {
  const { data, error } = await supabase
    .from('automation_rule')
    .select('*')
    .order('modified_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AutomationRule[];
}

export async function fetchRuleById(ruleId: string): Promise<AutomationRule> {
  const { data, error } = await supabase
    .from('automation_rule')
    .select('*')
    .eq('automation_rule_id', ruleId)
    .single();
  if (error) throw error;
  const actions = await fetchActions(ruleId);
  return { ...(data as AutomationRule), actions };
}

export async function createRule(payload: {
  name: string;
  table_logical_name: string;
  trigger_type?: AutomationRule['trigger_type'];
  trigger_event?: AutomationRule['trigger_event'];
  field_logical_name?: string | null;
  operator?: AutomationRule['operator'];
  trigger_value?: unknown;
  schedule_config?: ScheduleConfig | null;
  description?: string | null;
  category_id?: string | null;
  created_by?: string | null;
}): Promise<AutomationRule> {
  const triggerType = payload.trigger_type ?? 'event';
  const schedule = triggerType === 'schedule' ? (payload.schedule_config ?? null) : null;
  const { data, error } = await supabase
    .from('automation_rule')
    .insert({
      name: payload.name,
      table_logical_name: payload.table_logical_name,
      category_id: payload.category_id ?? null,
      trigger_type: triggerType,
      trigger_event: payload.trigger_event ?? 'update',
      field_logical_name: payload.field_logical_name ?? null,
      operator: payload.operator ?? 'changes_to',
      trigger_value: payload.trigger_value ?? null,
      schedule_config: schedule,
      next_run_at: schedule ? computeNextRunAt(schedule) : null,
      description: payload.description ?? null,
      conditions: [],
      enabled: false,
      is_published: false,
      created_by: payload.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AutomationRule;
}

export async function updateRule(
  ruleId: string,
  updates: Partial<Pick<AutomationRule,
    'name' | 'description' | 'category_id' | 'table_logical_name' | 'trigger_event' | 'field_logical_name' |
    'operator' | 'trigger_value' | 'conditions' | 'enabled' | 'is_published' | 'batch_window_seconds' |
    'schedule_config' | 'next_run_at'>>,
): Promise<AutomationRule> {
  const { data, error } = await supabase
    .from('automation_rule')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('automation_rule_id', ruleId)
    .select()
    .single();
  if (error) throw error;
  return data as AutomationRule;
}

/**
 * Duplicate a rule and all of its actions. The clone is created disabled and
 * unpublished (safe to review before turning on), named "<name> (copy)". Copies
 * the full trigger config, conditions, batch window and schedule; action rows are
 * recreated with fresh ids preserving type/config/sort_order/run_after.
 */
export async function cloneRule(ruleId: string, createdBy?: string | null): Promise<AutomationRule> {
  const src = (
    await supabase.from('automation_rule').select('*').eq('automation_rule_id', ruleId).single()
  );
  if (src.error) throw src.error;
  const r = src.data as AutomationRule;

  const schedule = r.trigger_type === 'schedule' ? (r.schedule_config ?? null) : null;
  const { data, error } = await supabase
    .from('automation_rule')
    .insert({
      name: `${r.name} (copy)`,
      table_logical_name: r.table_logical_name,
      category_id: r.category_id ?? null,
      trigger_type: r.trigger_type,
      trigger_event: r.trigger_event,
      field_logical_name: r.field_logical_name ?? null,
      operator: r.operator,
      trigger_value: r.trigger_value ?? null,
      conditions: r.conditions ?? [],
      batch_window_seconds: r.batch_window_seconds ?? null,
      schedule_config: schedule,
      next_run_at: schedule ? computeNextRunAt(schedule) : null,
      description: r.description ?? null,
      enabled: false,
      is_published: false,
      created_by: createdBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  const clone = data as AutomationRule;

  const actions = await fetchActions(ruleId);
  // Pass 1: create every action (flat) and map old id -> new id.
  const idMap = new Map<string, string>();
  for (const a of actions) {
    const created = await createAction(clone.automation_rule_id, a.action_type, a.config, a.sort_order);
    idMap.set(a.automation_rule_action_id, created.automation_rule_action_id);
  }
  // Pass 2: restore run_after / run_condition / label and re-link the branch tree
  // (parent_action_id must point at the CLONE's actions, not the source's).
  for (const a of actions) {
    const newId = idMap.get(a.automation_rule_action_id);
    if (!newId) continue;
    const updates: Parameters<typeof updateAction>[1] = {};
    if (a.run_after && a.run_after !== 'success') updates.run_after = a.run_after;
    if (a.run_condition) updates.run_condition = a.run_condition;
    if (a.label) updates.label = a.label;
    if (a.parent_action_id) {
      updates.parent_action_id = idMap.get(a.parent_action_id) ?? null;
      updates.branch = a.branch ?? null;
    }
    if (Object.keys(updates).length) await updateAction(newId, updates);
  }
  return clone;
}

export async function setRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('automation_rule')
    .update({ enabled, modified_at: new Date().toISOString() })
    .eq('automation_rule_id', ruleId);
  if (error) throw error;
}

export async function deleteRule(ruleId: string): Promise<void> {
  // Hard delete; automation_rule_action + jobs cascade via FK.
  const { error } = await supabase
    .from('automation_rule')
    .delete()
    .eq('automation_rule_id', ruleId);
  if (error) throw error;
}

// ── Actions ────────────────────────────────────────────────────────────────

export async function fetchActions(ruleId: string): Promise<AutomationRuleAction[]> {
  const { data, error } = await supabase
    .from('automation_rule_action')
    .select('*')
    .eq('rule_id', ruleId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AutomationRuleAction[];
}

export async function createAction(
  ruleId: string,
  actionType: AutomationActionType,
  config: AutomationActionConfig,
  sortOrder: number,
  placement?: { parent_action_id?: string | null; branch?: AutomationBranch | null },
): Promise<AutomationRuleAction> {
  const { data, error } = await supabase
    .from('automation_rule_action')
    .insert({
      rule_id: ruleId, action_type: actionType, config, sort_order: sortOrder, run_after: 'success',
      parent_action_id: placement?.parent_action_id ?? null,
      branch: placement?.branch ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AutomationRuleAction;
}

export async function updateAction(
  actionId: string,
  updates: Partial<Pick<AutomationRuleAction, 'config' | 'sort_order' | 'action_type' | 'run_after' | 'run_condition' | 'label' | 'parent_action_id' | 'branch'>>,
): Promise<void> {
  const { error } = await supabase
    .from('automation_rule_action')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('automation_rule_action_id', actionId);
  if (error) throw error;
}

/**
 * Move an action to a new position (and optionally a new parent/branch), then
 * re-pack the sort_order of every sibling in the destination group so the order
 * is contiguous. `siblingIdsInOrder` is the destination group's action ids in the
 * desired final order (including the moved action).
 */
export async function moveAction(
  actionId: string,
  dest: { parent_action_id: string | null; branch: AutomationBranch | null },
  siblingIdsInOrder: string[],
): Promise<void> {
  // First place the moved action into its new group.
  await updateAction(actionId, { parent_action_id: dest.parent_action_id, branch: dest.branch });
  // Then renumber the whole destination group contiguously.
  await Promise.all(
    siblingIdsInOrder.map((id, i) => updateAction(id, { sort_order: i })),
  );
}

/**
 * Duplicate one action in place — the copy lands immediately AFTER the original in
 * the same group (top level or a Condition branch). For a Condition, its entire
 * branch subtree is deep-copied too (fresh ids, parent links remapped, like
 * `cloneRule`). Preserves config, label (root gets " (copy)"), run_after and
 * run_condition. Returns the new root action's id.
 */
export async function duplicateAction(ruleId: string, actionId: string): Promise<string | null> {
  const actions = await fetchActions(ruleId);
  const byId = new Map(actions.map((a) => [a.automation_rule_action_id, a]));
  const src = byId.get(actionId);
  if (!src) return null;

  // Collect the source + all descendants (pre-order) so parent links can be remapped.
  const subtree: AutomationRuleAction[] = [];
  const collect = (id: string) => {
    const node = byId.get(id);
    if (!node) return;
    subtree.push(node);
    for (const a of actions) if ((a.parent_action_id ?? null) === id) collect(a.automation_rule_action_id);
  };
  collect(actionId);

  // Pass 1: create every clone (flat) and map old id -> new id.
  const idMap = new Map<string, string>();
  for (const a of subtree) {
    const created = await createAction(ruleId, a.action_type, a.config, a.sort_order);
    idMap.set(a.automation_rule_action_id, created.automation_rule_action_id);
  }
  // Pass 2: restore metadata and re-link parents to the CLONE's ids. The root clone
  // is placed into the source's own group/branch; descendants under their new parent.
  for (const a of subtree) {
    const newId = idMap.get(a.automation_rule_action_id);
    if (!newId) continue;
    const updates: Parameters<typeof updateAction>[1] = {};
    if (a.run_after && a.run_after !== 'success') updates.run_after = a.run_after;
    if (a.run_condition) updates.run_condition = a.run_condition;
    if (a.automation_rule_action_id === actionId) {
      updates.label = src.label ? `${src.label} (copy)` : null;
      updates.parent_action_id = src.parent_action_id ?? null;
      updates.branch = src.branch ?? null;
    } else {
      if (a.label) updates.label = a.label;
      if (a.parent_action_id) {
        updates.parent_action_id = idMap.get(a.parent_action_id) ?? null;
        updates.branch = a.branch ?? null;
      }
    }
    if (Object.keys(updates).length) await updateAction(newId, updates);
  }

  // Slot the root clone right after the source in its group, then renumber.
  const rootCloneId = idMap.get(actionId)!;
  const group = actions
    .filter((a) => (a.parent_action_id ?? null) === (src.parent_action_id ?? null) && (a.branch ?? null) === (src.branch ?? null))
    .sort((x, y) => x.sort_order - y.sort_order)
    .map((a) => a.automation_rule_action_id);
  const at = group.indexOf(actionId);
  const finalOrder = [...group.slice(0, at + 1), rootCloneId, ...group.slice(at + 1)];
  await moveAction(rootCloneId, { parent_action_id: src.parent_action_id ?? null, branch: src.branch ?? null }, finalOrder);
  return rootCloneId;
}

export async function deleteAction(actionId: string): Promise<void> {
  const { error } = await supabase
    .from('automation_rule_action')
    .delete()
    .eq('automation_rule_action_id', actionId);
  if (error) throw error;
}

// ── Field choices (for the trigger-value picker) ─────────────────────────────

export interface ChoiceOption { value: string; label: string }

/**
 * Resolve the selectable options for a Choice/option-set field, from either an
 * inline `config_json.choices` list or a named `config_json.option_set_name`.
 */
export async function fetchFieldChoices(config: Record<string, unknown> | null): Promise<ChoiceOption[]> {
  if (!config) return [];
  const inline = config.choices as Array<{ value: unknown; label?: string; display_label?: string }> | undefined;
  if (Array.isArray(inline) && inline.length) {
    return inline.map((c) => ({ value: String(c.value), label: String(c.label ?? c.display_label ?? c.value) }));
  }
  const name = (config.option_set_name ?? config.optionSetName) as string | undefined;
  if (!name) return [];
  const { data: os } = await supabase
    .from('option_set')
    .select('option_set_id')
    .eq('name', name)
    .maybeSingle();
  if (!os) return [];
  const { data: vals } = await supabase
    .from('option_set_value')
    .select('value, display_label')
    .eq('option_set_id', (os as { option_set_id: string }).option_set_id)
    .eq('is_active', true)
    .order('display_order');
  return ((vals ?? []) as Array<{ value: unknown; display_label: string }>).map((v) => ({
    value: String(v.value),
    label: v.display_label,
  }));
}

/** Latest failure message for a rule (for the list card's error banner), or null. */
export async function fetchLatestError(ruleId: string): Promise<string | null> {
  const { data } = await supabase
    .from('automation_job')
    .select('error, finished_at')
    .eq('rule_id', ruleId)
    .in('status', ['failed', 'dead'])
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { error?: string | null } | null)?.error ?? null;
}

// ── AI flow builder ──────────────────────────────────────────────────────────

export interface AiFlowSpec {
  name: string;
  summary: string;
  trigger: {
    trigger_event: AutomationRule['trigger_event'];
    field_logical_name: string | null;
    operator: AutomationRule['operator'];
    trigger_value: unknown;
    conditions: AutomationRule['conditions'];
  };
  actions: Array<{
    action_type: AutomationActionType;
    run_after: AutomationRunAfter;
    config: AutomationActionConfig;
  }>;
}

/**
 * Apply an AI-drafted spec to a rule: overwrite the trigger and REPLACE all
 * actions with the generated ones (in order, carrying run_after). Returns after
 * every write completes.
 */
export async function applyAiFlow(rule: AutomationRule, spec: AiFlowSpec): Promise<void> {
  await updateRule(rule.automation_rule_id, {
    trigger_event: spec.trigger.trigger_event,
    field_logical_name: spec.trigger.field_logical_name,
    operator: spec.trigger.operator,
    trigger_value: spec.trigger.trigger_value,
    conditions: Array.isArray(spec.trigger.conditions) ? spec.trigger.conditions : [],
  });
  // Replace existing actions with the generated set.
  const existing = await fetchActions(rule.automation_rule_id);
  await Promise.all(existing.map((a) => deleteAction(a.automation_rule_action_id)));
  for (let i = 0; i < spec.actions.length; i++) {
    const a = spec.actions[i];
    const created = await createAction(rule.automation_rule_id, a.action_type, a.config, i);
    if (a.run_after && a.run_after !== 'success') {
      await updateAction(created.automation_rule_action_id, { run_after: a.run_after });
    }
  }
}

// ── Related-export source discovery ──────────────────────────────────────────

export interface RelatedParentOption { lookup_field: string; target_entity_logical: string; label: string }
export interface RelatedChildOption { child_entity_logical: string; child_fk_physical: string; label: string }
export interface RelatedSourceOptions { parents: RelatedParentOption[]; children: RelatedChildOption[] }

/**
 * For a `related_export_email` builder: the related records reachable from an
 * entity — parents (its own N:1 lookup fields → one related record) and children
 * (1:N relationships → a list that expands the report into rows).
 */
export async function fetchRelatedSourceOptions(entityLogical: string): Promise<RelatedSourceOptions> {
  const { fetchEntities } = await import('./entityService');
  const { fetchFieldsForEntity } = await import('./fieldService');
  const { fetchRelationshipsForEntity } = await import('./relationshipService');

  const ents = await fetchEntities();
  const ent = ents.find((e) => e.logical_name === entityLogical);
  if (!ent) return { parents: [], children: [] };
  const byId = new Map(ents.map((e) => [e.entity_definition_id, e]));

  const fields = await fetchFieldsForEntity(ent.entity_definition_id);
  const parents: RelatedParentOption[] = [];
  for (const f of fields) {
    const t = (f.field_type?.name ?? '').toLowerCase();
    if (!f.lookup_entity_id || !['lookup', 'owner', 'customer'].includes(t)) continue;
    const te = byId.get(f.lookup_entity_id);
    if (!te) continue;
    parents.push({ lookup_field: f.logical_name, target_entity_logical: te.logical_name, label: `${te.display_name} (via ${f.display_name})` });
  }

  const rels = await fetchRelationshipsForEntity(ent.entity_definition_id);
  const children: RelatedChildOption[] = [];
  const seen = new Set<string>();
  for (const r of rels) {
    let childLogical: string | undefined;
    let childDisplay: string | undefined;
    if (r.relationship_type === '1:N' && r.source_entity_name === entityLogical) {
      childLogical = r.target_entity_name; childDisplay = r.target_entity_display_name;
    } else if (r.relationship_type === 'N:1' && r.target_entity_name === entityLogical) {
      childLogical = r.source_entity_name; childDisplay = r.source_entity_display_name;
    }
    if (!childLogical || !r.lookup_field_physical_column) continue;
    const key = `${childLogical}:${r.lookup_field_physical_column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    children.push({
      child_entity_logical: childLogical,
      child_fk_physical: r.lookup_field_physical_column,
      label: `${childDisplay ?? childLogical} (via ${r.lookup_field_display_name ?? r.lookup_field_physical_column})`,
    });
  }
  return { parents, children };
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const u = data?.user as { user_id?: string; id?: string } | null;
    return u?.user_id ?? u?.id ?? null;
  } catch {
    return null;
  }
}

// ── Run history ──────────────────────────────────────────────────────────────

export async function fetchRunHistory(ruleId: string, limit = 50): Promise<AutomationRunHistoryRow[]> {
  const { data: jobs, error } = await supabase
    .from('automation_job')
    .select('*')
    .eq('rule_id', ruleId)
    .order('queued_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const jobRows = (jobs ?? []) as AutomationJob[];
  if (jobRows.length === 0) return [];

  const jobIds = jobRows.map((j) => j.automation_job_id);
  const { data: logs, error: logErr } = await supabase
    .from('automation_job_action_log')
    .select('*')
    .in('job_id', jobIds);
  if (logErr) throw logErr;
  const logRows = (logs ?? []) as AutomationJobActionLog[];

  const byJob = new Map<string, AutomationJobActionLog[]>();
  for (const l of logRows) {
    const arr = byJob.get(l.job_id) ?? [];
    arr.push(l);
    byJob.set(l.job_id, arr);
  }
  return jobRows.map((j) => ({
    ...j,
    action_logs: (byJob.get(j.automation_job_id) ?? []).sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    ),
  }));
}

/**
 * Re-run a past run: enqueue a fresh job for the same record + captured snapshot,
 * which the worker executes with the rule's CURRENT actions/config. A new
 * idempotency key (so it isn't deduped against the original) and depth 0. Returns
 * the new job id.
 */
export async function rerunRun(
  run: Pick<AutomationJob, 'rule_id' | 'record_table' | 'record_id' | 'trigger_event' | 'change_snapshot' | 'created_by'>,
): Promise<string> {
  const rand = Math.random().toString(36).slice(2, 8);
  const idem = `${run.rule_id}:${run.record_id ?? 'none'}:rerun-${Date.now()}-${rand}`;
  const { data, error } = await supabase
    .from('automation_job')
    .insert({
      rule_id: run.rule_id,
      record_table: run.record_table,
      record_id: run.record_id,
      trigger_event: run.trigger_event ?? 'manual',
      change_snapshot: run.change_snapshot ?? {},
      status: 'pending',
      idempotency_key: idem,
      depth: 0,
      created_by: run.created_by ?? null,
    })
    .select('automation_job_id')
    .single();
  if (error) throw error;
  return (data as { automation_job_id: string }).automation_job_id;
}
