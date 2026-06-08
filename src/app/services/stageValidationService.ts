import type { FormRuleState, FieldRuleState } from './businessRulesEngine';
import type { DesignerLayout } from '../../types/form';
import type { RecordData } from './recordService';
import type { LoadedProcessFlow } from './processFlowEngine';
import {
  validateStageAdvance as engineValidateStageAdvance,
  evaluateStageFieldVisibility as engineEvaluateStageFieldVisibility,
  mergeStageVisibilityIntoRuleState as engineMergeStageVisibility,
} from './processFlowEngine';

export interface StageGateViolation {
  field: string;
  label: string;
  reason: 'required' | 'condition';
  message: string;
}

export interface StageValidationResult {
  valid: boolean;
  violations: StageGateViolation[];
  blockedByTransition?: boolean;
  blockedByBackward?: boolean;
  requiresApproval?: boolean;
}

export function evaluateStageFieldVisibility(
  _entity: string,
  values: RecordData,
  processFlow?: LoadedProcessFlow | null,
): Partial<Record<string, Pick<FieldRuleState, 'isHidden'>>> {
  if (!processFlow) return {};
  return engineEvaluateStageFieldVisibility(processFlow, values);
}

export function mergeStageVisibilityIntoRuleState(
  _entity: string,
  values: RecordData,
  ruleState: FormRuleState,
  processFlow?: LoadedProcessFlow | null,
): FormRuleState {
  if (!processFlow) return ruleState;
  return engineMergeStageVisibility(processFlow, values, ruleState);
}

export function validateStageAdvance(
  _entity: string,
  targetStage: string,
  values: RecordData,
  layout: DesignerLayout | null,
  ruleState: FormRuleState,
  processFlow?: LoadedProcessFlow | null,
): StageValidationResult {
  if (!processFlow) {
    return { valid: true, violations: [] };
  }

  const stageField = processFlow.flow.stage_field;
  const fromStage = String(values[stageField] ?? '');

  return engineValidateStageAdvance(processFlow, fromStage, targetStage, values, layout, ruleState);
}
