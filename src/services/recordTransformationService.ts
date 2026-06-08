import type {
  RecordTransformationRule,
  RecordTransformationInstance,
} from '../types/recordTransformation';

export async function fetchTransformationRules(): Promise<RecordTransformationRule[]> {
  return [];
}

export async function fetchTransformationRulesForEntity(_sourceEntity: string): Promise<RecordTransformationRule[]> {
  return [];
}

export async function fetchTransformationRuleWithDetails(_ruleId: string): Promise<RecordTransformationRule & {
  targets: never[];
  mappings: never[];
}> {
  throw new Error('Record transformation rules are not available.');
}

export async function countInstancesForSourceAndTarget(
  _ruleId: string,
  _sourceRecordId: string,
  _targetEntity: string,
): Promise<number> {
  return 0;
}

export async function insertTransformationInstance(
  _payload: Omit<RecordTransformationInstance, 'record_transformation_instance_id' | 'created_at'>,
): Promise<RecordTransformationInstance> {
  throw new Error('Record transformation instances are not available.');
}

export async function fetchInstancesForSourceRecord(
  _sourceRecordId: string,
  _ruleId: string,
): Promise<RecordTransformationInstance[]> {
  return [];
}
