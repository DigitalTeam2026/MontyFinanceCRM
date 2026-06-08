import { supabase } from '../lib/supabase';
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTriggerType,
  WorkflowTriggerConditions,
  WorkflowStepType,
  WorkflowStepConfig,
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

export async function fetchWorkflowById(workflowId: string): Promise<WorkflowDefinition> {
  const { data, error } = await supabase
    .from('workflow_definition')
    .select('*')
    .eq('workflow_id', workflowId)
    .single();
  if (error) throw error;
  return data as WorkflowDefinition;
}

export async function fetchStepsForWorkflow(workflowId: string): Promise<WorkflowStep[]> {
  const { data, error } = await supabase
    .from('workflow_step')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('step_order');
  if (error) throw error;
  return data as WorkflowStep[];
}

export async function createWorkflow(payload: {
  entity_definition_id: string;
  name: string;
  description?: string | null;
  trigger_type: WorkflowTriggerType;
}): Promise<WorkflowDefinition> {
  const { data, error } = await supabase
    .from('workflow_definition')
    .insert({
      ...payload,
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
    Pick<WorkflowDefinition, 'name' | 'description' | 'trigger_type' | 'trigger_conditions' | 'is_active'>
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

  const cloned = data as WorkflowDefinition;

  const { data: srcSteps } = await supabase
    .from('workflow_step')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('step_order');

  if (srcSteps && srcSteps.length > 0) {
    const clonedSteps = (srcSteps as WorkflowStep[]).map((s) => ({
      workflow_id: cloned.workflow_id,
      step_type: s.step_type,
      name: s.name,
      label: s.label,
      description: s.description,
      step_order: s.step_order,
      config_json: s.config_json,
      next_step_id: null,
      next_step_on_false: null,
      position_x: s.position_x,
      position_y: s.position_y,
    }));
    await supabase.from('workflow_step').insert(clonedSteps);
  }

  return cloned;
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

export async function addStep(payload: {
  workflow_id: string;
  step_type: WorkflowStepType;
  name: string;
  step_order: number;
  config_json?: WorkflowStepConfig;
  position_x?: number;
  position_y?: number;
}): Promise<WorkflowStep> {
  const { data, error } = await supabase
    .from('workflow_step')
    .insert({
      ...payload,
      config_json: payload.config_json ?? {},
      position_x: payload.position_x ?? 0,
      position_y: payload.position_y ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data as WorkflowStep;
}

export async function updateStep(
  stepId: string,
  updates: Partial<Pick<WorkflowStep, 'name' | 'label' | 'description' | 'step_type' | 'config_json' | 'next_step_id' | 'next_step_on_false' | 'step_order' | 'position_x' | 'position_y'>>
): Promise<WorkflowStep> {
  const { data, error } = await supabase
    .from('workflow_step')
    .update(updates)
    .eq('workflow_step_id', stepId)
    .select()
    .single();
  if (error) throw error;
  return data as WorkflowStep;
}

export async function deleteStep(stepId: string): Promise<void> {
  const { error } = await supabase
    .from('workflow_step')
    .delete()
    .eq('workflow_step_id', stepId);
  if (error) throw error;
}

export async function saveAllSteps(workflowId: string, steps: WorkflowStep[]): Promise<void> {
  const { error: delErr } = await supabase
    .from('workflow_step')
    .delete()
    .eq('workflow_id', workflowId);
  if (delErr) throw delErr;

  if (steps.length === 0) return;

  const rows = steps.map((s) => ({
    workflow_step_id: s.workflow_step_id,
    workflow_id: workflowId,
    step_type: s.step_type,
    name: s.name,
    label: s.label,
    description: s.description,
    step_order: s.step_order,
    config_json: s.config_json,
    next_step_id: s.next_step_id,
    next_step_on_false: s.next_step_on_false,
    position_x: s.position_x,
    position_y: s.position_y,
  }));

  const { error } = await supabase.from('workflow_step').insert(rows);
  if (error) throw error;
}
