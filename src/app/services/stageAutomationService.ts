import { supabase } from '../../lib/supabase';
import type { AppEntity } from '../types';
import type { RecordData } from './recordService';
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTriggerConditions,
  UpdateRecordConfig,
  AssignRecordConfig,
} from '../../types/workflow';
import { getEntityTable } from './recordService';

export interface StageAutomationResult {
  fieldPatches: RecordData;
  notifications: StageNotification[];
  triggeredWorkflows: string[];
}

export interface StageNotification {
  type: 'info' | 'success' | 'warning';
  message: string;
}

interface EntityDef {
  entity_definition_id: string;
}

async function resolveEntityId(entity: AppEntity): Promise<string | null> {
  const logicalName = await getEntityTable(entity);
  if (!logicalName) return null;
  const { data } = await supabase
    .from('entity_definition')
    .select('entity_definition_id')
    .eq('logical_name', logicalName)
    .maybeSingle();
  return (data as EntityDef | null)?.entity_definition_id ?? null;
}

async function fetchStageWorkflows(
  entityDefId: string,
  fromStage: string,
  toStage: string,
): Promise<{ workflow: WorkflowDefinition; steps: WorkflowStep[] }[]> {
  const { data: workflows, error } = await supabase
    .from('workflow_definition')
    .select('*')
    .eq('entity_definition_id', entityDefId)
    .eq('trigger_type', 'on_status_change')
    .eq('is_active', true)
    .is('deleted_at', null);

  if (error || !workflows) return [];

  const matched: { workflow: WorkflowDefinition; steps: WorkflowStep[] }[] = [];

  for (const wf of workflows as WorkflowDefinition[]) {
    const conds = wf.trigger_conditions as WorkflowTriggerConditions;
    const fromMatch = !conds.status_from || conds.status_from === '*' || conds.status_from === fromStage;
    const toMatch = !conds.status_to || conds.status_to === '*' || conds.status_to === toStage;

    if (!fromMatch || !toMatch) continue;

    const { data: steps } = await supabase
      .from('workflow_step')
      .select('*')
      .eq('workflow_id', wf.workflow_id)
      .order('step_order');

    matched.push({ workflow: wf, steps: (steps ?? []) as WorkflowStep[] });
  }

  return matched;
}

function applyUpdateRecordStep(
  config: UpdateRecordConfig,
  patches: RecordData,
  currentValues: RecordData,
): void {
  for (const update of config.field_updates ?? []) {
    if (!update.field_logical_name) continue;
    if (update.value_type === 'static') {
      patches[update.field_logical_name] = update.value;
    } else if (update.value_type === 'field_ref') {
      patches[update.field_logical_name] = currentValues[update.value] ?? null;
    }
  }
}

function applyAssignRecordStep(
  config: AssignRecordConfig,
  patches: RecordData,
  currentValues: RecordData,
): void {
  const ownerField = config.ownership_field ?? 'owner_id';
  if (config.assign_to === 'user' && config.user_id) {
    patches[ownerField] = config.user_id;
  } else if (config.assign_to === 'field_value' && config.field_ref) {
    patches[ownerField] = currentValues[config.field_ref] ?? null;
  }
}

async function incrementRunCount(workflowId: string): Promise<void> {
  await supabase.rpc('increment_workflow_run_count', { wf_id: workflowId }).then(() => {
    supabase
      .from('workflow_definition')
      .update({ last_triggered_at: new Date().toISOString() })
      .eq('workflow_id', workflowId);
  });
}

export async function runStageAutomations(
  entity: AppEntity,
  fromStage: string,
  toStage: string,
  currentValues: RecordData,
): Promise<StageAutomationResult> {
  const result: StageAutomationResult = {
    fieldPatches: {},
    notifications: [],
    triggeredWorkflows: [],
  };

  if (fromStage === toStage) return result;

  const entityDefId = await resolveEntityId(entity);
  if (!entityDefId) return result;

  const matched = await fetchStageWorkflows(entityDefId, fromStage, toStage);

  for (const { workflow, steps } of matched) {
    let hadSteps = false;

    for (const step of steps) {
      if (step.step_type === 'update_record') {
        applyUpdateRecordStep(step.config_json as UpdateRecordConfig, result.fieldPatches, currentValues);
        hadSteps = true;
      } else if (step.step_type === 'assign_record') {
        applyAssignRecordStep(step.config_json as AssignRecordConfig, result.fieldPatches, currentValues);
        hadSteps = true;
      } else if (step.step_type === 'send_notification') {
        hadSteps = true;
      }
    }

    if (hadSteps || steps.length === 0) {
      result.triggeredWorkflows.push(workflow.name);
      result.notifications.push({
        type: 'info',
        message: `Automation "${workflow.name}" ran`,
      });
      incrementRunCount(workflow.workflow_id);
    }
  }

  return result;
}
