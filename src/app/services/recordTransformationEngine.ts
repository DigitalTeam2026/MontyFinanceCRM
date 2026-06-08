import { supabase } from '../../lib/supabase';
import { getTableColumns, filterToExistingColumns } from './recordService';
import type {
  RecordTransformationRule,
  RecordTransformationTarget,
  RecordTransformationFieldMapping,
  TransformationTargetEntity,
} from '../../types/recordTransformation';
import {
  fetchTransformationRulesForEntity,
  countInstancesForSourceAndTarget,
  insertTransformationInstance,
} from '../../services/recordTransformationService';
import type { RecordData } from './recordService';

// Cache resolved relationship columns for the lifetime of a single execution
async function resolveRelationshipFkColumn(
  relationshipDefinitionId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('relationship_definition')
    .select('source_lookup_field_id, field_definition:field_definition!source_lookup_field_id(physical_column_name)')
    .eq('relationship_definition_id', relationshipDefinitionId)
    .maybeSingle();

  if (!data) return null;
  const fd = data.field_definition as { physical_column_name: string } | null;
  return fd?.physical_column_name ?? null;
}

export interface TransformationPreviewTarget {
  target_entity: TransformationTargetEntity;
  creation_mode: RecordTransformationTarget['creation_mode'];
  action_visibility: RecordTransformationTarget['action_visibility'];
  max_instances_per_source: number;
  blocked_message: string | null;
  requires_target_entity: string | null;
  previewValues: RecordData;
  missingRequired: string[];
}

export interface TransformationPreview {
  rule: RecordTransformationRule;
  targets: TransformationPreviewTarget[];
  hasRequired: boolean;
}

export interface TransformationExecuteOptions {
  ruleId: string;
  sourceRecordId: string;
  sourceEntity: string;
  sourceValues: RecordData;
  userId: string;
  targetSelections: Record<TransformationTargetEntity, boolean>;
}

export interface TransformationExecuteResult {
  createdIds: Partial<Record<TransformationTargetEntity, string>>;
  skipped: TransformationTargetEntity[];
  blockedByMaxInstances: TransformationTargetEntity[];
}

// ── Physical column name maps ────────────────────────────────────────────────

const LEAD_LOGICAL_TO_PHYSICAL: Record<string, string> = {
  firstname: 'first_name',
  lastname: 'last_name',
  emailaddress1: 'email',
  telephone1: 'phone',
  mobilephone: 'mobile_phone',
  companyname: 'company_name',
  jobtitle: 'job_title',
  description: 'description',
  websiteurl: 'website',
  industrycode: 'industry',
  address1_line1: 'address_line1',
  address1_city: 'city',
  address1_stateorprovince: 'state_province',
  address1_postalcode: 'postal_code',
  address1_country: 'country_code',
  estimatedvalue: 'estimated_value',
  leadsourcecode: 'lead_source',
  productid: 'product_id',
};

const ACCOUNT_LOGICAL_TO_PHYSICAL: Record<string, string> = {
  name: 'account_name',
  telephone1: 'phone',
  websiteurl: 'website',
  industrycode: 'industry',
  address1_city: 'city',
  address1_line1: 'address_line1',
  address1_country: 'country_code',
  address1_stateorprovince: 'state_province',
  address1_postalcode: 'postal_code',
  description: 'description',
};

const CONTACT_LOGICAL_TO_PHYSICAL: Record<string, string> = {
  firstname: 'first_name',
  lastname: 'last_name',
  fullname: 'full_name',
  emailaddress1: 'email',
  telephone1: 'phone',
  mobilephone: 'mobile_phone',
  jobtitle: 'job_title',
  description: 'description',
  address1_city: 'city',
  address1_line1: 'address_line1',
  address1_country: 'country_code',
  address1_stateorprovince: 'state_province',
  address1_postalcode: 'postal_code',
  parentaccountid: 'account_id',
};

const OPPORTUNITY_LOGICAL_TO_PHYSICAL: Record<string, string> = {
  name: 'topic',
  description: 'description',
  estimatedvalue: 'estimated_value',
  estimatedclosedate: 'estimated_close_date',
  closeprobability: 'close_probability',
  leadsourcecode: 'lead_source',
  parentaccountid: 'account_id',
  parentcontactid: 'contact_id',
  productid: 'product_id',
};

const TICKET_LOGICAL_TO_PHYSICAL: Record<string, string> = {
  title: 'title',
  description: 'description',
  prioritycode: 'priority',
  statuscode: 'status',
  customerid: 'account_id',
  contactid: 'contact_id',
};

const ENTITY_TABLE_MAP: Record<TransformationTargetEntity, string> = {
  account:     'account',
  contact:     'contact',
  opportunity: 'opportunity',
  lead:        'lead',
  ticket:      'ticket',
};

const ENTITY_LOGICAL_TO_PHYSICAL: Record<string, Record<string, string>> = {
  account:     ACCOUNT_LOGICAL_TO_PHYSICAL,
  contact:     CONTACT_LOGICAL_TO_PHYSICAL,
  opportunity: OPPORTUNITY_LOGICAL_TO_PHYSICAL,
  lead:        LEAD_LOGICAL_TO_PHYSICAL,
  ticket:      TICKET_LOGICAL_TO_PHYSICAL,
};

function getSourceValue(
  sourceValues: RecordData,
  sourceEntity: string,
  logicalField: string
): unknown {
  const physicalMap = ENTITY_LOGICAL_TO_PHYSICAL[sourceEntity] ?? {};
  const physicalCol = physicalMap[logicalField] ?? logicalField;
  if (physicalCol in sourceValues) return sourceValues[physicalCol];
  if (logicalField in sourceValues) return sourceValues[logicalField];
  return undefined;
}

function evaluateExpression(expr: string, sourceValues: RecordData, sourceEntity: string): string {
  return expr.replace(/\{(\w+)\}/g, (_match, field) => {
    const val = getSourceValue(sourceValues, sourceEntity, field);
    return val != null ? String(val) : '';
  });
}

function buildTargetRecord(
  mappings: RecordTransformationFieldMapping[],
  sourceValues: RecordData,
  sourceEntity: string,
  targetEntity: TransformationTargetEntity
): RecordData {
  const targetPhysicalMap = ENTITY_LOGICAL_TO_PHYSICAL[targetEntity] ?? {};
  const record: RecordData = {};

  for (const mapping of mappings) {
    let value: unknown;

    if (mapping.value_type === 'field') {
      // inherit_mode only applies to field-type mappings
      if (mapping.inherit_mode === 'default') {
        value = mapping.default_value ?? getSourceValue(sourceValues, sourceEntity, mapping.source_field);
      } else {
        // 'source' and 'user_input' both copy from source in automated execution
        value = getSourceValue(sourceValues, sourceEntity, mapping.source_field);
      }
    } else if (mapping.value_type === 'static') {
      value = mapping.static_value ?? '';
    } else if (mapping.value_type === 'expression') {
      value = evaluateExpression(mapping.expression_value ?? '', sourceValues, sourceEntity);
    }

    const physicalCol = targetPhysicalMap[mapping.target_field] ?? mapping.target_field;
    record[physicalCol] = value;
  }

  return record;
}

async function insertInstanceSafe(
  payload: Parameters<typeof insertTransformationInstance>[0]
): Promise<void> {
  try {
    await insertTransformationInstance(payload);
  } catch (err) {
    console.warn('[TransformationEngine] Instance logging failed (non-fatal):', err);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchRulesForEntity(sourceEntity: string): Promise<RecordTransformationRule[]> {
  return fetchTransformationRulesForEntity(sourceEntity);
}

export async function buildTransformationPreview(
  rule: RecordTransformationRule & { targets: RecordTransformationTarget[]; mappings: RecordTransformationFieldMapping[] },
  sourceValues: RecordData
): Promise<TransformationPreview> {
  const previewTargets: TransformationPreviewTarget[] = [];

  for (const target of rule.targets ?? []) {
    const targetMappings = (rule.mappings ?? []).filter(m => m.target_entity === target.target_entity);
    const previewValues = buildTargetRecord(targetMappings, sourceValues, rule.source_entity, target.target_entity);

    const missingRequired = targetMappings
      .filter(m => m.is_required)
      .filter(m => {
        const physicalMap = ENTITY_LOGICAL_TO_PHYSICAL[target.target_entity] ?? {};
        const physicalCol = physicalMap[m.target_field] ?? m.target_field;
        const val = previewValues[physicalCol];
        return val == null || String(val).trim() === '';
      })
      .map(m => m.target_field);

    previewTargets.push({
      target_entity: target.target_entity,
      creation_mode: target.creation_mode,
      action_visibility: target.action_visibility ?? 'always',
      max_instances_per_source: target.max_instances_per_source ?? 1,
      blocked_message: target.blocked_message ?? null,
      requires_target_entity: target.requires_source_entity ?? null,
      previewValues,
      missingRequired,
    });
  }

  const hasRequired = previewTargets.some(t => t.missingRequired.length > 0);

  return { rule, targets: previewTargets, hasRequired };
}

export async function executeTransformation(
  opts: TransformationExecuteOptions,
  rule: RecordTransformationRule & { targets: RecordTransformationTarget[]; mappings: RecordTransformationFieldMapping[] }
): Promise<TransformationExecuteResult> {
  const createdIds: Partial<Record<TransformationTargetEntity, string>> = {};
  const skipped: TransformationTargetEntity[] = [];
  const blockedByMaxInstances: TransformationTargetEntity[] = [];

  const orderedTargets = [...(rule.targets ?? [])].sort((a, b) => a.display_order - b.display_order);

  const baseInstancePayload = {
    rule_id: opts.ruleId,
    source_entity: opts.sourceEntity,
    source_record_id: opts.sourceRecordId as unknown as string,
    initiated_by: opts.userId,
  };

  for (const target of orderedTargets) {
    const shouldCreate = opts.targetSelections[target.target_entity] !== false;

    if (!shouldCreate || target.creation_mode === 'never') {
      skipped.push(target.target_entity);
      await insertInstanceSafe({
        ...baseInstancePayload,
        target_entity: target.target_entity,
        target_record_id: null,
        status: 'skipped',
        completed_at: new Date().toISOString(),
        error_message: target.creation_mode === 'never' ? 'Creation mode is never' : 'Deselected by user',
      });
      continue;
    }

    // Check requires_source_entity prerequisite
    if (target.requires_source_entity) {
      const prereqCreated = createdIds[target.requires_source_entity as TransformationTargetEntity];
      if (!prereqCreated) {
        skipped.push(target.target_entity);
        await insertInstanceSafe({
          ...baseInstancePayload,
          target_entity: target.target_entity,
          target_record_id: null,
          status: 'skipped',
          completed_at: new Date().toISOString(),
          error_message: `Prerequisite entity '${target.requires_source_entity}' was not created in this run`,
        });
        continue;
      }
    }

    // Check max_instances_per_source
    const maxInstances = target.max_instances_per_source ?? 1;
    if (maxInstances > 0) {
      const existingCount = await countInstancesForSourceAndTarget(
        opts.ruleId,
        opts.sourceRecordId,
        target.target_entity
      );
      if (existingCount >= maxInstances) {
        blockedByMaxInstances.push(target.target_entity);
        await insertInstanceSafe({
          ...baseInstancePayload,
          target_entity: target.target_entity,
          target_record_id: null,
          status: 'skipped',
          completed_at: new Date().toISOString(),
          error_message: `Max instances (${maxInstances}) reached`,
        });
        continue;
      }
    }

    const targetMappings = (rule.mappings ?? []).filter(m => m.target_entity === target.target_entity);
    const record = buildTargetRecord(targetMappings, opts.sourceValues, opts.sourceEntity, target.target_entity);

    const table = ENTITY_TABLE_MAP[target.target_entity];
    if (!table) {
      skipped.push(target.target_entity);
      continue;
    }

    const tCols = await getTableColumns(table);
    if (tCols.has('created_by')) record['created_by'] = opts.userId;
    if (tCols.has('modified_by')) record['modified_by'] = opts.userId;
    if (tCols.has('owner_id')) record['owner_id'] = opts.userId;
    if (tCols.has('owner_type')) record['owner_type'] = 'user';

    if (target.target_entity === 'account' && !record['account_name']) {
      record['account_name'] = 'New Account';
    }
    if (target.target_entity === 'contact' && !record['last_name']) {
      record['last_name'] = 'Unknown';
    }
    if (target.target_entity === 'opportunity' && !record['topic']) {
      record['topic'] = 'New Opportunity';
    }
    if (target.target_entity === 'lead' && !record['last_name']) {
      record['last_name'] = 'Unknown';
    }
    if (target.target_entity === 'ticket' && !record['title']) {
      record['title'] = 'New Ticket';
    }

    // Path 1: relationship_definition_id is set — resolve FK column from metadata
    if (target.relationship_definition_id) {
      const fkColumn = await resolveRelationshipFkColumn(target.relationship_definition_id);
      if (fkColumn) {
        // The FK value is the source record itself
        record[fkColumn] = opts.sourceRecordId;
      }
    } else {
      // Path 2: fallback — hardcoded implicit linking for known entity chains
      if (target.target_entity === 'contact' && createdIds.account) {
        record['account_id'] = createdIds.account;
      }
      if (target.target_entity === 'opportunity') {
        if (createdIds.account) record['account_id'] = createdIds.account;
        if (createdIds.contact) record['contact_id'] = createdIds.contact;
      }
    }

    try {
      const safeRecord = tCols.size > 0 ? filterToExistingColumns(record, tCols) : record;
      const { data, error } = await supabase
        .from(table)
        .insert(safeRecord)
        .select()
        .single();

      if (error) throw new Error(`Failed to create ${target.target_entity}: ${error.message}`);

      const pkField = `${target.target_entity}_id`;
      const newId = (data as Record<string, unknown>)[pkField] as string;
      createdIds[target.target_entity] = newId;

      await insertInstanceSafe({
        ...baseInstancePayload,
        target_entity: target.target_entity,
        target_record_id: newId as unknown as string,
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: null,
      });
    } catch (err) {
      await insertInstanceSafe({
        ...baseInstancePayload,
        target_entity: target.target_entity,
        target_record_id: null,
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  return { createdIds, skipped, blockedByMaxInstances };
}

export function getRulesForManualTrigger(
  rules: RecordTransformationRule[]
): RecordTransformationRule[] {
  return rules.filter(r => r.trigger_type === 'manual' && r.is_active);
}
