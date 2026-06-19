import { supabase } from '../lib/supabase';
import type {
  ProcessFlow,
  ProcessStage,
  ProcessFlowTransition,
  ProcessFlowFormData,
  ProcessStageFormData,
  ProcessStageField,
  ProcessFlowInstance,
  StageHistoryEntry,
  ProcessFlowEntityConfig,
  ProcessFlowEntityConfigFormData,
  ProcessFlowDraft,
} from '../types/processFlow';

export async function fetchProcessFlows(): Promise<ProcessFlow[]> {
  const { data, error } = await supabase
    .from('process_flow')
    .select('*')
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data as ProcessFlow[];
}

export async function fetchProcessFlowsForEntity(entityId: string): Promise<ProcessFlow[]> {
  const { data, error } = await supabase
    .from('process_flow')
    .select('*')
    .eq('entity_definition_id', entityId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data as ProcessFlow[];
}

export async function fetchProcessFlowWithDetails(flowId: string): Promise<ProcessFlow> {
  const { data: flow, error: flowError } = await supabase
    .from('process_flow')
    .select('*')
    .eq('process_flow_id', flowId)
    .maybeSingle();
  if (flowError) throw flowError;
  if (!flow) throw new Error('Process flow not found');

  const { data: stages, error: stagesError } = await supabase
    .from('process_stage')
    .select('*')
    .eq('process_flow_id', flowId)
    .order('display_order');
  if (stagesError) throw stagesError;

  const { data: transitions, error: transError } = await supabase
    .from('process_flow_transition')
    .select('*')
    .eq('process_flow_id', flowId)
    .order('created_at');
  if (transError) throw transError;

  return {
    ...(flow as ProcessFlow),
    stages: (stages ?? []) as ProcessStage[],
    transitions: (transitions ?? []) as ProcessFlowTransition[],
  };
}

export async function createProcessFlow(payload: ProcessFlowFormData): Promise<ProcessFlow> {
  const { data, error } = await supabase
    .from('process_flow')
    .insert({ ...payload, is_system: false })
    .select()
    .single();
  if (error) throw error;
  return data as ProcessFlow;
}

export async function updateProcessFlow(
  flowId: string,
  updates: Partial<ProcessFlowFormData>
): Promise<ProcessFlow> {
  const { data, error } = await supabase
    .from('process_flow')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('process_flow_id', flowId)
    .select()
    .single();
  if (error) throw error;
  return data as ProcessFlow;
}

// ─── Draft / Publish ──────────────────────────────────────────────────────────

/** Persists the working model as the flow's draft. Does NOT touch the live stages/transitions. */
export async function saveDraft(flowId: string, draft: ProcessFlowDraft): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase
    .from('process_flow')
    .update({
      draft_json: draft,
      has_draft: true,
      draft_modified_at: new Date().toISOString(),
      draft_modified_by: session?.user.id ?? null,
    })
    .eq('process_flow_id', flowId);
  if (error) throw error;
}

/** Discards the flow's draft. The live published flow is unaffected. */
export async function clearDraft(flowId: string): Promise<void> {
  const { error } = await supabase
    .from('process_flow')
    .update({ draft_json: null, has_draft: false, draft_modified_at: null, draft_modified_by: null })
    .eq('process_flow_id', flowId);
  if (error) throw error;
}

/** Reads the flow's saved draft (null if none). */
export async function fetchProcessFlowDraft(
  flowId: string,
): Promise<{ has_draft: boolean; draft_json: ProcessFlowDraft | null; draft_modified_at: string | null } | null> {
  const { data, error } = await supabase
    .from('process_flow')
    .select('has_draft, draft_json, draft_modified_at')
    .eq('process_flow_id', flowId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as { has_draft: boolean; draft_json: ProcessFlowDraft | null; draft_modified_at: string | null };
}

/** Publishes a fully id-resolved snapshot to the live flow via the admin Edge Function (atomic, server-side). */
export async function publishProcessFlowDraft(flowId: string, snapshot: ProcessFlowDraft): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-process-flow`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: 'publish', flow_id: flowId, snapshot }),
  });
  if (!res.ok) {
    const raw = await res.text();
    let body: { error?: string } = {};
    try { body = JSON.parse(raw); } catch { /* non-JSON body */ }
    throw new Error(body.error ?? `Publish failed: ${res.status} ${raw}`);
  }
}

export async function fetchFormsForEntity(entityDefinitionId: string): Promise<{ form_id: string; name: string; form_type: string; is_default: boolean }[]> {
  const { data, error } = await supabase
    .from('form_definition')
    .select('form_id, name, form_type, is_default')
    .eq('entity_definition_id', entityDefinitionId)
    .eq('form_type', 'main')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw error;
  return (data ?? []) as { form_id: string; name: string; form_type: string; is_default: boolean }[];
}

export async function softDeleteProcessFlow(flowId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-process-flow`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: 'soft_delete', flow_id: flowId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
}

export async function setDefaultStage(flowId: string, stageId: string | null): Promise<void> {
  const { error } = await supabase
    .from('process_flow')
    .update({ default_stage_id: stageId, modified_at: new Date().toISOString() })
    .eq('process_flow_id', flowId);
  if (error) throw error;
}

export async function setEntityDefaultFlow(
  entityLogicalName: string,
  flowId: string | null,
  allowFlowSwitch?: boolean,
): Promise<void> {
  const updates: Record<string, unknown> = {
    default_process_flow_id: flowId,
    modified_at: new Date().toISOString(),
  };
  if (allowFlowSwitch !== undefined) {
    updates.allow_manual_flow_switch = allowFlowSwitch;
  }
  const { error } = await supabase
    .from('entity_definition')
    .update(updates)
    .eq('logical_name', entityLogicalName);
  if (error) throw error;
}

export async function getEntityDefaultFlowId(entityLogicalName: string): Promise<string | null> {
  const { data } = await supabase
    .from('entity_definition')
    .select('default_process_flow_id, allow_manual_flow_switch')
    .eq('logical_name', entityLogicalName)
    .maybeSingle();
  return data?.default_process_flow_id ?? null;
}

export async function getEntityFlowSwitchAllowed(entityLogicalName: string): Promise<boolean> {
  const { data } = await supabase
    .from('entity_definition')
    .select('allow_manual_flow_switch')
    .eq('logical_name', entityLogicalName)
    .maybeSingle();
  return data?.allow_manual_flow_switch ?? true;
}

export async function switchRecordProcessFlow(
  entityTable: string,
  recordPk: string,
  recordId: string,
  flowId: string,
  firstStageId: string,
): Promise<void> {
  const { error } = await supabase
    .from(entityTable)
    .update({ active_process_flow_id: flowId, active_process_stage_id: firstStageId })
    .eq(recordPk, recordId);
  if (error) throw error;
}

export async function updateRecordActiveStage(
  entityTable: string,
  recordPk: string,
  recordId: string,
  stageId: string,
  finished = false,
): Promise<void> {
  const { error } = await supabase.rpc('update_bpf_stage', {
    p_table: entityTable,
    p_pk: recordPk,
    p_record_id: recordId,
    p_stage_id: stageId,
    p_finished: finished,
  });
  if (error) throw error;
}

// ─── Stages ──────────────────────────────────────────────────────────────────

export async function createProcessStage(
  flowId: string,
  payload: ProcessStageFormData
): Promise<ProcessStage> {
  const { data, error } = await supabase
    .from('process_stage')
    .insert({ ...payload, process_flow_id: flowId })
    .select()
    .single();
  if (error) throw error;
  return data as ProcessStage;
}

export async function updateProcessStage(
  stageId: string,
  updates: Partial<ProcessStageFormData>
): Promise<ProcessStage> {
  const { data, error } = await supabase
    .from('process_stage')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('process_stage_id', stageId)
    .select()
    .single();
  if (error) throw error;
  return data as ProcessStage;
}

export async function deleteProcessStage(stageId: string): Promise<void> {
  const { error } = await supabase
    .from('process_stage')
    .delete()
    .eq('process_stage_id', stageId);
  if (error) throw error;
}

export async function reorderProcessStages(
  stages: { process_stage_id: string; display_order: number }[]
): Promise<void> {
  const updates = stages.map((s) =>
    supabase
      .from('process_stage')
      .update({ display_order: s.display_order, modified_at: new Date().toISOString() })
      .eq('process_stage_id', s.process_stage_id)
  );
  await Promise.all(updates);
}

// ─── Transitions ─────────────────────────────────────────────────────────────

export async function upsertTransition(
  flowId: string,
  fromStageId: string,
  toStageId: string,
  transitionName: string,
  requiresFields: string[] = []
): Promise<ProcessFlowTransition> {
  const { data, error } = await supabase
    .from('process_flow_transition')
    .upsert(
      {
        process_flow_id: flowId,
        from_stage_id: fromStageId,
        to_stage_id: toStageId,
        transition_name: transitionName,
        requires_fields: requiresFields,
      },
      { onConflict: 'from_stage_id,to_stage_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data as ProcessFlowTransition;
}

export async function deleteTransition(transitionId: string): Promise<void> {
  const { error } = await supabase
    .from('process_flow_transition')
    .delete()
    .eq('transition_id', transitionId);
  if (error) throw error;
}

export async function replaceAllTransitions(
  flowId: string,
  transitions: {
    from_stage_id: string;
    to_stage_id: string;
    transition_name: string;
    requires_fields: string[];
    conditions: import('../types/processFlow').TransitionCondition[];
    priority: number;
    is_default: boolean;
  }[]
): Promise<void> {
  const { error: delError } = await supabase
    .from('process_flow_transition')
    .delete()
    .eq('process_flow_id', flowId);
  if (delError) throw delError;

  if (transitions.length > 0) {
    const { error: insError } = await supabase
      .from('process_flow_transition')
      .insert(transitions.map((t) => ({ ...t, process_flow_id: flowId })));
    if (insError) throw insError;
  }
}

// ─── Stage Fields (Steps) ─────────────────────────────────────────────────────

export async function fetchStageFields(stageId: string): Promise<ProcessStageField[]> {
  const { data, error } = await supabase
    .from('process_stage_fields')
    .select('*')
    .eq('process_stage_id', stageId)
    .order('display_order');
  if (error) throw error;
  return data as ProcessStageField[];
}

/** All stage fields for a flow, grouped by process_stage_id (used by the draft working model). */
export async function fetchStageFieldsForFlow(flowId: string): Promise<Record<string, ProcessStageField[]>> {
  const { data, error } = await supabase
    .from('process_stage_fields')
    .select('*')
    .eq('process_flow_id', flowId)
    .order('display_order');
  if (error) throw error;
  const map: Record<string, ProcessStageField[]> = {};
  for (const row of (data ?? []) as ProcessStageField[]) {
    (map[row.process_stage_id] ??= []).push(row);
  }
  return map;
}

export async function addStageField(
  stageId: string,
  flowId: string,
  fieldLogicalName: string,
  displayOrder: number,
  displayLabel?: string,
  relatedEntityId?: string | null,
): Promise<ProcessStageField> {
  const { data, error } = await supabase
    .from('process_stage_fields')
    .insert({
      process_stage_id: stageId,
      process_flow_id: flowId,
      field_logical_name: fieldLogicalName,
      display_label: displayLabel ?? null,
      display_order: displayOrder,
      is_visible: true,
      is_required: false,
      is_readonly: false,
      related_entity_id: relatedEntityId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProcessStageField;
}

export async function updateStageField(
  psfId: string,
  updates: Partial<Pick<ProcessStageField, 'field_logical_name' | 'display_label' | 'is_required' | 'is_readonly' | 'is_visible' | 'display_order' | 'related_entity_id'>>
): Promise<void> {
  const { error } = await supabase
    .from('process_stage_fields')
    .update(updates)
    .eq('psf_id', psfId);
  if (error) throw error;
}

export async function deleteStageField(psfId: string): Promise<void> {
  const { error } = await supabase
    .from('process_stage_fields')
    .delete()
    .eq('psf_id', psfId);
  if (error) throw error;
}

export async function reorderStageFields(
  fields: { psf_id: string; display_order: number }[]
): Promise<void> {
  await Promise.all(
    fields.map((f) =>
      supabase
        .from('process_stage_fields')
        .update({ display_order: f.display_order })
        .eq('psf_id', f.psf_id)
    )
  );
}

// ─── Process Flow Instances ───────────────────────────────────────────────────

export async function getOrCreateFlowInstance(
  flowId: string,
  entityDefinitionId: string,
  recordId: string,
  firstStageId: string,
): Promise<ProcessFlowInstance> {
  const { data: existing } = await supabase
    .from('process_flow_instance')
    .select('*')
    .eq('process_flow_id', flowId)
    .eq('record_id', recordId)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) return existing as ProcessFlowInstance;

  const { data, error } = await supabase
    .from('process_flow_instance')
    .insert({
      process_flow_id: flowId,
      entity_definition_id: entityDefinitionId,
      record_id: recordId,
      current_stage_id: firstStageId,
      status: 'active',
      started_on: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProcessFlowInstance;
}

export async function updateFlowInstanceStage(
  instanceId: string,
  stageId: string,
  isTerminal = false,
): Promise<void> {
  const { error } = await supabase
    .from('process_flow_instance')
    .update({
      current_stage_id: stageId,
      status: isTerminal ? 'completed' : 'active',
      completed_on: isTerminal ? new Date().toISOString() : null,
      modified_at: new Date().toISOString(),
    })
    .eq('instance_id', instanceId);
  if (error) throw error;
}

export async function recordStageTransition(
  instanceId: string,
  fromStageId: string | null,
  fromStageKey: string | null,
  toStageId: string,
  toStageKey: string,
  durationSeconds: number | null = null,
  comment: string | null = null,
): Promise<void> {
  const { error } = await supabase
    .from('process_stage_history')
    .insert({
      instance_id: instanceId,
      from_stage_id: fromStageId,
      from_stage_key: fromStageKey,
      to_stage_id: toStageId,
      to_stage_key: toStageKey,
      changed_on: new Date().toISOString(),
      duration_seconds: durationSeconds,
      comment,
      transition_result: 'success',
    });
  if (error) console.warn('Stage history write failed:', error.message);
}

export async function fetchStageHistory(instanceId: string): Promise<StageHistoryEntry[]> {
  const { data, error } = await supabase
    .from('process_stage_history')
    .select('*')
    .eq('instance_id', instanceId)
    .order('changed_on');
  if (error) throw error;
  return (data ?? []) as StageHistoryEntry[];
}

export async function fetchInstanceForRecord(
  flowId: string,
  recordId: string,
): Promise<ProcessFlowInstance | null> {
  const { data } = await supabase
    .from('process_flow_instance')
    .select('*')
    .eq('process_flow_id', flowId)
    .eq('record_id', recordId)
    .order('started_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as ProcessFlowInstance | null;
}

// ─── Entity Config ────────────────────────────────────────────────────────────

export async function fetchEntityConfigs(flowId: string): Promise<ProcessFlowEntityConfig[]> {
  const { data, error } = await supabase
    .from('process_flow_entity_config')
    .select(`
      *,
      entity_definition:entity_definition_id ( display_name, logical_name ),
      form_definition:form_id ( name ),
      relationship_definition:relationship_definition_id ( display_name )
    `)
    .eq('process_flow_id', flowId)
    .order('display_order');
  if (error) throw error;
  return ((data ?? []) as unknown[]).map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const ed = r.entity_definition as Record<string, string> | null;
    const fd = r.form_definition as Record<string, string> | null;
    const rd = r.relationship_definition as Record<string, string> | null;
    return {
      ...r,
      entity_display_name: ed?.display_name ?? '',
      entity_logical_name: ed?.logical_name ?? '',
      form_name: fd?.name ?? null,
      relationship_display_name: rd?.display_name ?? null,
    } as ProcessFlowEntityConfig;
  });
}

export async function upsertEntityConfig(
  flowId: string,
  payload: ProcessFlowEntityConfigFormData & { is_primary?: boolean },
): Promise<ProcessFlowEntityConfig> {
  const { data, error } = await supabase
    .from('process_flow_entity_config')
    .upsert(
      { ...payload, process_flow_id: flowId, modified_at: new Date().toISOString() },
      { onConflict: 'process_flow_id,entity_definition_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data as ProcessFlowEntityConfig;
}

export async function deleteEntityConfig(configId: string): Promise<void> {
  const { error } = await supabase
    .from('process_flow_entity_config')
    .delete()
    .eq('config_id', configId);
  if (error) throw error;
}

export async function ensurePrimaryEntityConfig(
  flowId: string,
  entityDefinitionId: string,
  formId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('process_flow_entity_config')
    .upsert(
      {
        process_flow_id: flowId,
        entity_definition_id: entityDefinitionId,
        is_primary: true,
        form_id: formId,
        relationship_column: '',
        link_behavior: 'open_existing',
        display_order: 0,
        modified_at: new Date().toISOString(),
      },
      { onConflict: 'process_flow_id,entity_definition_id' },
    );
  if (error) throw error;
}
