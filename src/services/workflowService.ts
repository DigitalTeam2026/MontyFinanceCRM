import { supabase } from '../lib/supabase';
import type {
  WorkflowDefinition,
  WorkflowTriggerType,
} from '../types/workflow';

export async function fetchWorkflowsForEntity(entityId: string): Promise<WorkflowDefinition[]> {
  const { data, error } = await supabase
    .from('workflow_definition')
    .select('*')
    .eq('entity_definition_id', entityId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data as WorkflowDefinition[];
}

// All workflows regardless of owning table — flows are no longer entity-scoped
// (the table is chosen inside the trigger).
export async function fetchAllWorkflows(): Promise<WorkflowDefinition[]> {
  const { data, error } = await supabase
    .from('workflow_definition')
    .select('*')
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data as WorkflowDefinition[];
}

export interface WorkflowRunLog {
  run_id: string;
  workflow_id: string;
  entity_name: string;
  record_id: string | null;
  trigger_type: string;
  status: 'running' | 'completed' | 'failed' | 'partial';
  steps_executed: number;
  error_message: string | null;
  trace_json: Record<string, unknown>[] | null;
  started_at: string;
  completed_at: string | null;
}

// Most recent run-log rows for a workflow (newest first) — drives the Run history tab.
export async function fetchWorkflowRuns(workflowId: string, limit = 50): Promise<WorkflowRunLog[]> {
  const { data, error } = await supabase
    .from('workflow_run_log')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as WorkflowRunLog[];
}

export async function fetchWorkflowById(workflowId: string): Promise<WorkflowDefinition> {
  const { data, error } = await supabase
    .from('workflow_definition')
    .select('*')
    .eq('workflow_id', workflowId)
    .single();
  if (error) throw error;
  return data as WorkflowDefinition;
}

export async function createWorkflow(payload: {
  entity_definition_id?: string | null;
  name: string;
  description?: string | null;
  trigger_type: WorkflowTriggerType;
}): Promise<WorkflowDefinition> {
  const { data, error } = await supabase
    .from('workflow_definition')
    .insert({
      ...payload,
      entity_definition_id: payload.entity_definition_id ?? null,
      trigger_conditions: {},
      run_as: 'system',
      is_active: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as WorkflowDefinition;
}

export async function saveWorkflow(
  workflowId: string,
  updates: Partial<
    Pick<WorkflowDefinition, 'name' | 'description' | 'entity_definition_id' | 'trigger_type' | 'trigger_conditions' | 'is_active' | 'definition'>
  >
): Promise<WorkflowDefinition> {
  const { data, error } = await supabase
    .from('workflow_definition')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('workflow_id', workflowId)
    .select()
    .single();
  if (error) throw error;
  return data as WorkflowDefinition;
}

export async function cloneWorkflow(workflowId: string, newName: string): Promise<WorkflowDefinition> {
  const { data: source, error: fetchErr } = await supabase
    .from('workflow_definition')
    .select('*')
    .eq('workflow_id', workflowId)
    .single();
  if (fetchErr) throw fetchErr;

  const {
    workflow_id: _id,
    created_at: _ca,
    modified_at: _ma,
    deleted_at: _da,
    created_by: _cb,
    last_triggered_at: _lta,
    run_count: _rc,
    ...rest
  } = source as WorkflowDefinition;

  const { data, error } = await supabase
    .from('workflow_definition')
    .insert({
      ...rest,
      name: newName,
      is_system: false,
      is_deletable: true,
      is_active: false,
      run_count: 0,
    })
    .select()
    .single();
  if (error) throw error;

  // The whole flow (including its v2 `definition`) is copied via `...rest` above —
  // there are no separate step rows to clone in the v2 model.
  return data as WorkflowDefinition;
}

export async function softDeleteWorkflow(workflowId: string): Promise<void> {
  const { error } = await supabase
    .from('workflow_definition')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('workflow_id', workflowId);
  if (error) throw error;
}

export async function toggleWorkflowActive(workflowId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('workflow_definition')
    .update({ is_active: isActive, modified_at: new Date().toISOString() })
    .eq('workflow_id', workflowId);
  if (error) throw error;
}

