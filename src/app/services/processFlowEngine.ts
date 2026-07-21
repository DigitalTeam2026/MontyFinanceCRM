import { supabase } from '../../lib/supabase';
import type { ProcessFlow, ProcessStage, ProcessFlowTransition, GateCondition, TransitionCondition, ConditionGroup } from '../../types/processFlow';
import { isConditionGroup } from '../../types/processFlow';
import type { RecordData } from './recordService';
import type { DesignerLayout } from '../../types/form';
import type { FormRuleState, FieldRuleState } from './businessRulesEngine';
import { getTable } from './metadata/metadataStore';

export interface LoadedProcessFlow {
  flow: ProcessFlow;
  stages: ProcessStage[];
  activeStages: ProcessStage[];
  terminalStages: ProcessStage[];
  transitions: ProcessFlowTransition[];
  stageByKey: Map<string, ProcessStage>;
  stageById: Map<string, ProcessStage>;
}

export interface StageGateViolation {
  field: string;
  label: string;
  reason: 'required' | 'condition';
  message: string;
}

export interface StageValidationResult {
  valid: boolean;
  violations: StageGateViolation[];
  blockedByTransition: boolean;
  blockedByBackward: boolean;
  requiresApproval: boolean;
}

export interface AssignmentRule {
  rule_id: string;
  process_flow_id: string;
  name: string;
  conditions: { field: string; operator: string; value: unknown }[];
  priority: number;
}

const flowCache = new Map<string, { data: LoadedProcessFlow; ts: number }>();
const CACHE_TTL_MS = 60_000;

async function loadFlowById(flowId: string): Promise<LoadedProcessFlow | null> {
  const cacheKey = `id:${flowId}`;
  const cached = flowCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  let flow: ProcessFlow | null;
  let stages: ProcessStage[];
  let transitions: ProcessFlowTransition[];

  const snapFlows = getTable<ProcessFlow & { is_active: boolean; deleted_at: string | null }>('process_flow');
  if (snapFlows !== null) {
    // Sales reads the published snapshot; Admin Studio falls through to live.
    flow = snapFlows.find((f) => f.process_flow_id === flowId && f.is_active === true && f.deleted_at == null) ?? null;
    if (!flow) return null;
    stages = (getTable<ProcessStage>('process_stage') ?? [])
      .filter((s) => s.process_flow_id === flowId)
      .sort((a, b) => ((a as { display_order?: number }).display_order ?? 0) - ((b as { display_order?: number }).display_order ?? 0));
    transitions = (getTable<ProcessFlowTransition>('process_flow_transition') ?? [])
      .filter((t) => t.process_flow_id === flowId);
  } else {
    const { data: flowRow } = await supabase
      .from('process_flow')
      .select('*')
      .eq('process_flow_id', flowId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (!flowRow) return null;
    flow = flowRow as ProcessFlow;

    const [{ data: stagesRaw }, { data: transitionsRaw }] = await Promise.all([
      supabase.from('process_stage').select('*').eq('process_flow_id', flowId).order('display_order'),
      supabase.from('process_flow_transition').select('*').eq('process_flow_id', flowId),
    ]);
    stages = (stagesRaw ?? []) as ProcessStage[];
    transitions = (transitionsRaw ?? []) as ProcessFlowTransition[];
  }

  const activeStages = stages.filter((s) => s.stage_type === 'active');
  const terminalStages = stages.filter((s) => s.stage_type !== 'active');

  const result: LoadedProcessFlow = {
    flow: flow as ProcessFlow,
    stages,
    activeStages,
    terminalStages,
    transitions,
    stageByKey: new Map(stages.map((s) => [s.stage_key, s])),
    stageById: new Map(stages.map((s) => [s.process_stage_id, s])),
  };

  flowCache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

/**
 * Resolve which process flow a record should use (Dynamics 365-style):
 * 1. If record already has active_process_flow_id → use it (record owns its flow)
 * 2. If record has a product selected:
 *    a. Find a flow scoped to that exact product (product_id match)
 *    b. Find a flow scoped to the product's line of business (lob_id match)
 * 3. If entity has a default_process_flow_id → use that for new records
 * 4. Fallback: first active flow for the entity (legacy safety net)
 */
export async function resolveProcessFlowForRecord(
  entityLogicalName: string,
  record: RecordData | null,
): Promise<LoadedProcessFlow | null> {
  // 1. Record-owned flow
  if (record?.active_process_flow_id) {
    const byId = await loadFlowById(record.active_process_flow_id as string);
    if (byId) return byId;
  }

  // Get entity definition
  const { data: entityDef } = await supabase
    .from('entity_definition')
    .select('entity_definition_id, default_process_flow_id')
    .eq('logical_name', entityLogicalName)
    .maybeSingle();

  if (!entityDef) return null;

  // 2. Product-based flow resolution
  const productId = record?.product_id as string | null | undefined;
  if (productId) {
    // 2a. Flow scoped to the exact product
    const { data: productFlows } = await supabase
      .from('process_flow')
      .select('process_flow_id')
      .eq('entity_definition_id', entityDef.entity_definition_id)
      .eq('product_id', productId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at')
      .limit(1);

    if (productFlows && productFlows.length > 0) {
      const pf = await loadFlowById(productFlows[0].process_flow_id);
      if (pf) return pf;
    }

    // 2b. Flow scoped to the product's LOB
    const { data: product } = await supabase
      .from('product')
      .select('lob_id')
      .eq('product_id', productId)
      .maybeSingle();

    if (product?.lob_id) {
      const { data: lobFlows } = await supabase
        .from('process_flow')
        .select('process_flow_id')
        .eq('entity_definition_id', entityDef.entity_definition_id)
        .eq('lob_id', product.lob_id)
        .is('product_id', null)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at')
        .limit(1);

      if (lobFlows && lobFlows.length > 0) {
        const pf = await loadFlowById(lobFlows[0].process_flow_id);
        if (pf) return pf;
      }
    }
  }

  // 3. Entity default flow
  if (entityDef.default_process_flow_id) {
    const defaultFlow = await loadFlowById(entityDef.default_process_flow_id);
    if (defaultFlow) return defaultFlow;
  }

  // 4. Fallback: first active global flow (no product/lob scope)
  const { data: flows } = await supabase
    .from('process_flow')
    .select('process_flow_id')
    .eq('entity_definition_id', entityDef.entity_definition_id)
    .is('product_id', null)
    .is('lob_id', null)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('is_system', { ascending: false })
    .order('created_at')
    .limit(1);

  if (!flows || flows.length === 0) return null;
  return loadFlowById(flows[0].process_flow_id);
}

/**
 * Legacy entry point — loads flow without record context.
 * Kept for backwards compat; calls resolveProcessFlowForRecord with null record.
 */
export async function loadProcessFlowForEntity(
  entityLogicalName: string,
): Promise<LoadedProcessFlow | null> {
  return resolveProcessFlowForRecord(entityLogicalName, null);
}

/**
 * Load a specific flow by ID (used when switching flows).
 */
export async function loadProcessFlowById(flowId: string): Promise<LoadedProcessFlow | null> {
  return loadFlowById(flowId);
}

/**
 * For cross-entity BPFs, resolve the entity-specific form_id from process_flow_entity_config.
 * Returns the form_id for the given entity within the flow, or null.
 */
export async function getEntityFormIdForFlow(
  flowId: string,
  entityLogicalName: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('process_flow_entity_config')
    .select('form_id, entity_definition_id!inner(logical_name)')
    .eq('process_flow_id', flowId)
    .limit(10);

  if (!data || data.length === 0) return null;
  const match = data.find(
    (c: Record<string, unknown>) =>
      (c.entity_definition_id as Record<string, unknown>)?.logical_name === entityLogicalName,
  );
  return (match?.form_id as string) ?? null;
}

/**
 * Evaluate assignment rules for a record and return the matching flow ID, or null.
 */
export async function resolveFlowByAssignmentRules(
  entityDefinitionId: string,
  record: RecordData,
): Promise<string | null> {
  const { data: rules } = await supabase
    .from('process_flow_assignment_rule')
    .select('rule_id, process_flow_id, conditions, priority')
    .eq('entity_definition_id', entityDefinitionId)
    .eq('is_active', true)
    .order('priority');

  if (!rules || rules.length === 0) return null;

  for (const rule of rules as AssignmentRule[]) {
    const conditions = rule.conditions ?? [];
    const allMatch = conditions.every((cond) => evalAssignmentCondition(cond, record));
    if (allMatch) return rule.process_flow_id;
  }

  return null;
}

function evalAssignmentCondition(
  cond: { field: string; operator: string; value: unknown },
  record: RecordData,
): boolean {
  const v = record[cond.field];
  switch (cond.operator) {
    case 'not_empty': return v != null && String(v).trim() !== '';
    case 'empty': return v == null || String(v).trim() === '';
    case 'eq': return String(v ?? '') === String(cond.value ?? '');
    case 'neq': return String(v ?? '') !== String(cond.value ?? '');
    case 'gt': return Number(v) > Number(cond.value);
    case 'gte': return Number(v) >= Number(cond.value);
    case 'lt': return Number(v) < Number(cond.value);
    case 'lte': return Number(v) <= Number(cond.value);
    default: return true;
  }
}

export function invalidateProcessFlowCache(entityLogicalName?: string) {
  if (entityLogicalName) {
    for (const key of flowCache.keys()) {
      if (!key.startsWith('id:')) flowCache.delete(key);
    }
  } else {
    flowCache.clear();
  }
}

export function invalidateFlowCacheById(flowId: string) {
  flowCache.delete(`id:${flowId}`);
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function evalGateCondition(cond: GateCondition, values: RecordData): boolean {
  const v = values[cond.field];
  switch (cond.operator) {
    case 'not_empty': return !isEmpty(v);
    case 'eq':  return String(v ?? '') === String(cond.value ?? '');
    case 'neq': return String(v ?? '') !== String(cond.value ?? '');
    case 'gt':  return Number(v) > Number(cond.value);
    case 'gte': return Number(v) >= Number(cond.value);
    case 'lt':  return Number(v) < Number(cond.value);
    case 'lte': return Number(v) <= Number(cond.value);
    default: return true;
  }
}

export function isTransitionAllowed(
  pf: LoadedProcessFlow,
  fromStageKey: string,
  toStageKey: string,
): boolean {
  const fromStage = pf.stageByKey.get(fromStageKey);
  const toStage   = pf.stageByKey.get(toStageKey);
  if (!fromStage || !toStage) return true;
  if (pf.transitions.length === 0) return true;
  return pf.transitions.some(
    (t) =>
      t.from_stage_id === fromStage.process_stage_id &&
      t.to_stage_id   === toStage.process_stage_id,
  );
}

/**
 * Evaluate a transition's conditions against a record's field values.
 * All conditions must pass (AND logic).
 */
function evalTransitionCondition(cond: TransitionCondition, values: RecordData): boolean {
  const v = values[cond.field];
  switch (cond.operator) {
    case 'not_empty': return v != null && String(v).trim() !== '';
    case 'empty':     return v == null || String(v).trim() === '';
    case 'eq':        return String(v ?? '') === String(cond.value ?? '');
    case 'neq':       return String(v ?? '') !== String(cond.value ?? '');
    case 'gt':        return Number(v) > Number(cond.value);
    case 'gte':       return Number(v) >= Number(cond.value);
    case 'lt':        return Number(v) < Number(cond.value);
    case 'lte':       return Number(v) <= Number(cond.value);
    default:          return true;
  }
}

/**
 * Given the current stage, resolve the best next stage using conditional branching.
 *
 * Algorithm (Dynamics 365-style):
 * 1. Get all outgoing transitions from the current stage, sorted by priority ASC.
 * 2. For each transition that has conditions: evaluate all conditions (AND). Take first match.
 * 3. If no conditional transition matches, use the one marked is_default.
 * 4. If no default, fall back to the first transition (by priority).
 * 5. Returns null if no transitions exist from this stage.
 */
export function resolveNextStage(
  pf: LoadedProcessFlow,
  fromStageKey: string,
  values: RecordData,
): ProcessStage | null {
  const fromStage = pf.stageByKey.get(fromStageKey);
  if (!fromStage) return null;

  const outgoing = pf.transitions
    .filter((t) => t.from_stage_id === fromStage.process_stage_id)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  if (outgoing.length === 0) {
    const currentIdx = pf.activeStages.findIndex((s) => s.stage_key === fromStageKey);

    // If the current stage is a branch stage (yes/no arm of a condition), skip over sibling
    // branch stages so that both arms converge on the same post-condition stage.
    const siblingBranchIds = new Set<string>();
    for (const s of pf.activeStages) {
      if (s.component_type === 'condition' && s.branch_yes_stage_id && s.branch_no_stage_id) {
        // If fromStage is one branch arm, mark the other arm as a sibling to skip
        if (s.branch_yes_stage_id === fromStage.process_stage_id) {
          siblingBranchIds.add(s.branch_no_stage_id);
        } else if (s.branch_no_stage_id === fromStage.process_stage_id) {
          siblingBranchIds.add(s.branch_yes_stage_id);
        }
      }
    }

    // Walk forward, skipping condition nodes and sibling branch stages
    for (let i = currentIdx + 1; i < pf.activeStages.length; i++) {
      const candidate = pf.activeStages[i];
      if (candidate.component_type === 'condition') continue;
      if (siblingBranchIds.has(candidate.process_stage_id)) continue;
      return candidate;
    }
    return null;
  }

  const conditional = outgoing.filter((t) => (t.conditions ?? []).length > 0);
  const defaultT = outgoing.find((t) => t.is_default);

  for (const t of conditional) {
    const allMatch = (t.conditions ?? []).every((c) => evalTransitionCondition(c, values));
    if (allMatch) {
      return pf.stageById.get(t.to_stage_id) ?? null;
    }
  }

  const fallback = defaultT ?? outgoing[0];
  return pf.stageById.get(fallback.to_stage_id) ?? null;
}

/**
 * Return only the stages (active + terminal) that belong to the given entity definition ID.
 * Used to show only lead-side stages when viewing a lead, or opp-side stages when viewing an opp.
 * If entityDefId is null/undefined, returns all stages unfiltered.
 */
export function filterLoadedFlowForEntity(
  pf: LoadedProcessFlow,
  entityDefId: string | null | undefined,
): LoadedProcessFlow {
  if (!entityDefId) return pf;

  const ctx = buildStageEntityContext(pf);

  const activeStages = pf.activeStages.filter((s) => ctx.get(s.stage_key) === entityDefId);
  // Terminal stages belong to the last entity in the flow
  const lastActiveEntityId = pf.activeStages.length > 0
    ? (ctx.get(pf.activeStages[pf.activeStages.length - 1].stage_key) ?? pf.flow.entity_definition_id)
    : pf.flow.entity_definition_id;
  const terminalStages = lastActiveEntityId === entityDefId ? pf.terminalStages : [];

  if (activeStages.length === pf.activeStages.length && terminalStages.length === pf.terminalStages.length) {
    return pf;
  }

  const allFiltered = [...activeStages, ...terminalStages];
  const stageByKey = new Map(allFiltered.map((s) => [s.stage_key, s]));
  const stageById = new Map(allFiltered.map((s) => [s.process_stage_id, s]));

  return {
    ...pf,
    activeStages,
    terminalStages,
    stageByKey,
    stageById,
  };
}

/**
 * Return the first active stage for a given entity within a cross-entity flow.
 * Returns null if the flow has no stages for that entity.
 */
export function getFirstStageForEntity(
  pf: LoadedProcessFlow,
  entityDefId: string,
): import('../../types/processFlow').ProcessStage | null {
  const ctx = buildStageEntityContext(pf);
  return pf.activeStages.find((s) => ctx.get(s.stage_key) === entityDefId) ?? null;
}

/**
 * Walk the ordered active stages and return the effective entity ID for each stage key.
 * Stages inherit the entity from the nearest preceding stage that has an explicit target_entity_id.
 * If no prior stage has one, the flow's primary entity is used.
 */
export function buildStageEntityContext(pf: LoadedProcessFlow): Map<string, string> {
  const ctx = new Map<string, string>();
  let current = pf.flow.entity_definition_id;
  for (const stage of pf.activeStages) {
    if (stage.target_entity_id) current = stage.target_entity_id;
    ctx.set(stage.stage_key, current);
  }
  for (const stage of pf.terminalStages) {
    ctx.set(stage.stage_key, current);
  }

  // A condition is a ROUTER, not a stage the record ever sits on, so it belongs to the entity it
  // branches INTO — not to whatever happens to precede it in display_order. A condition placed at
  // an entity handoff (last lead stage, then the condition, then the opp-side arms) would otherwise
  // inherit the lead, and filterLoadedFlowForEntity would drop it from the opp-side bar while
  // KEEPING both its arms. resolveRuntimePath then sees no one pointing at the YES arm, promotes it
  // to trunk, and renders it unconditionally alongside the arm a later condition selects — the
  // duplicate "Legal Documents / Agreement / Final Stage" bar. Re-point conditions at their branch.
  const byId = new Map(pf.activeStages.map((s) => [s.process_stage_id, s]));
  const entityOfBranch = (stage: ProcessStage, seen: Set<string>): string | null => {
    if (seen.has(stage.process_stage_id)) return null; // cycle guard
    seen.add(stage.process_stage_id);
    for (const targetId of [stage.branch_yes_stage_id, stage.branch_no_stage_id]) {
      const target = targetId ? byId.get(targetId) : undefined;
      if (!target) continue;
      // Chained conditions: keep descending until a real stage is reached.
      const resolved = target.component_type === 'condition'
        ? entityOfBranch(target, seen)
        : (ctx.get(target.stage_key) ?? null);
      if (resolved) return resolved;
    }
    return null;
  };
  for (const stage of pf.activeStages) {
    if (stage.component_type !== 'condition') continue;
    const branchEntity = entityOfBranch(stage, new Set());
    if (branchEntity) ctx.set(stage.stage_key, branchEntity);
  }

  return ctx;
}

/**
 * Detect if a stage in the flow is an entity boundary crossing (the first stage on a new entity).
 * Returns { isCrossEntity, isEntityBoundary, effectiveEntityId, targetEntityId, targetRelationshipName, createLinkedRecord }
 *
 * isCrossEntity  — the stage operates on a different entity than the flow's primary entity
 * isEntityBoundary — this stage is the actual crossing point (relationship config lives here)
 */
export function getCrossEntityInfo(
  pf: LoadedProcessFlow,
  stageKey: string,
): {
  isCrossEntity: boolean;
  isEntityBoundary: boolean;
  effectiveEntityId: string;
  targetEntityId: string | null;
  targetRelationshipName: string;
  relationshipDefinitionId: string | null;
  createLinkedRecord: boolean;
} {
  const stage = pf.stageByKey.get(stageKey);
  const fallback = {
    isCrossEntity: false,
    isEntityBoundary: false,
    effectiveEntityId: pf.flow.entity_definition_id,
    targetEntityId: null,
    targetRelationshipName: '',
    relationshipDefinitionId: null,
    createLinkedRecord: false,
  };
  if (!stage) return fallback;

  const isTerminal = stage.stage_type !== 'active';
  const stageIdx = isTerminal ? -1 : pf.activeStages.findIndex((s) => s.stage_key === stageKey);
  const searchFrom = isTerminal ? pf.activeStages.length - 1 : stageIdx - 1;

  let inheritedEntityId = pf.flow.entity_definition_id;
  for (let i = searchFrom; i >= 0; i--) {
    if (pf.activeStages[i].target_entity_id) {
      inheritedEntityId = pf.activeStages[i].target_entity_id!;
      break;
    }
  }

  const effectiveEntityId = stage.target_entity_id ?? inheritedEntityId;
  const isCrossEntity = effectiveEntityId !== pf.flow.entity_definition_id;
  const isEntityBoundary = !!stage.target_entity_id && stage.target_entity_id !== inheritedEntityId;

  return {
    isCrossEntity,
    isEntityBoundary,
    effectiveEntityId,
    targetEntityId: stage.target_entity_id ?? null,
    targetRelationshipName: stage.target_relationship_name ?? '',
    relationshipDefinitionId: stage.relationship_definition_id ?? null,
    createLinkedRecord: stage.create_linked_record ?? false,
  };
}

/**
 * Resolve the physical FK column name for a cross-entity stage boundary.
 *
 * Dual-path resolution:
 * 1. If the stage has relationship_definition_id set, look it up from the provided
 *    relationship metadata map and return the lookup field's physical_column_name.
 * 2. Fall back to the stage's target_relationship_name text value (legacy behavior).
 *
 * The caller must pass a Map<relationshipDefinitionId, physicalColumnName> built from
 * relationship_definition + field_definition data if they want path 1 to work.
 * If the map is not provided or the ID is not found, path 2 is used transparently.
 */
export function resolveRelationshipColumn(
  relationshipDefinitionId: string | null,
  targetRelationshipName: string,
  relColumnMap: Map<string, string>,
): string {
  if (relationshipDefinitionId) {
    const physicalCol = relColumnMap.get(relationshipDefinitionId);
    if (physicalCol) return physicalCol;
  }
  // Fallback: use the text name directly (existing behavior, zero regression)
  return targetRelationshipName;
}

export function isBackwardMovement(
  pf: LoadedProcessFlow,
  fromStageKey: string,
  toStageKey: string,
): boolean {
  const fromIdx = pf.activeStages.findIndex((s) => s.stage_key === fromStageKey);
  const toIdx   = pf.activeStages.findIndex((s) => s.stage_key === toStageKey);
  if (fromIdx < 0 || toIdx < 0) return false;
  return toIdx < fromIdx;
}

export function validateStageAdvance(
  pf: LoadedProcessFlow,
  fromStageKey: string,
  toStageKey: string,
  values: RecordData,
  layout: DesignerLayout | null,
  ruleState: FormRuleState,
): StageValidationResult {
  const violations: StageGateViolation[] = [];

  const toStage   = pf.stageByKey.get(toStageKey);
  const fromStage = pf.stageByKey.get(fromStageKey);

  const isBackward = isBackwardMovement(pf, fromStageKey, toStageKey);

  if (isBackward) {
    if (fromStage && !fromStage.allow_backward_movement) {
      return {
        valid: false,
        violations: [{
          field: pf.flow.stage_field,
          label: 'Stage',
          reason: 'condition',
          message: `Cannot move backward from "${fromStage.name}". Backward movement is not allowed for this stage.`,
        }],
        blockedByTransition: false,
        blockedByBackward: true,
        requiresApproval: false,
      };
    }
    return { valid: true, violations: [], blockedByTransition: false, blockedByBackward: false, requiresApproval: false };
  }

  const transitionAllowed = isTransitionAllowed(pf, fromStageKey, toStageKey);
  if (!transitionAllowed) {
    return {
      valid: false,
      violations: [{
        field: pf.flow.stage_field,
        label: 'Stage',
        reason: 'condition',
        message: `Transition from "${fromStage?.name ?? fromStageKey}" to "${toStage?.name ?? toStageKey}" is not allowed.`,
      }],
      blockedByTransition: true,
      blockedByBackward: false,
      requiresApproval: false,
    };
  }

  if (toStage) {
    const formRequiredFields = new Map<string, string>();
    if (layout) {
      const targetValues = { ...values, [pf.flow.stage_field]: toStageKey };
      const targetVisibility = evaluateStageFieldVisibility(pf, targetValues);
      const currentVisibility = evaluateStageFieldVisibility(pf, values);

      for (const tab of layout.tabs) {
        for (const section of tab.sections) {
          for (const control of section.controls) {
            if (control.control_type !== 'field' || !control.field_logical_name) continue;
            const fieldName = control.field_logical_name;
            if (targetVisibility[fieldName]?.isHidden) continue;
            const rs = ruleState.fields[fieldName];
            const hiddenByCurrentStage = currentVisibility[fieldName]?.isHidden ?? false;
            const hiddenByRule = rs?.isHidden && !hiddenByCurrentStage;
            if (hiddenByRule) continue;
            const isRequired = rs?.isRequired || control.is_required_override;
            if (isRequired) {
              const label = control.label_override ?? control.field_display_name ?? fieldName;
              formRequiredFields.set(fieldName, label);
            }
          }
        }
      }
    }

    for (const [field, label] of formRequiredFields.entries()) {
      if (isEmpty(values[field])) {
        violations.push({ field, label, reason: 'required', message: `${label} is required` });
      }
    }

    for (const rf of toStage.gate_required_fields ?? []) {
      if (formRequiredFields.has(rf.field)) continue;
      if (isEmpty(values[rf.field])) {
        violations.push({
          field: rf.field,
          label: rf.label,
          reason: 'required',
          message: `${rf.label} is required to advance`,
        });
      }
    }

    for (const cond of toStage.gate_conditions ?? []) {
      if (!evalGateCondition(cond, values)) {
        violations.push({
          field: cond.field,
          label: cond.label,
          reason: 'condition',
          message: cond.message,
        });
      }
    }

    const transition = pf.transitions.find(
      (t) =>
        fromStage && toStage &&
        t.from_stage_id === fromStage.process_stage_id &&
        t.to_stage_id   === toStage.process_stage_id,
    );
    if (transition) {
      for (const fieldName of transition.requires_fields ?? []) {
        if (!violations.find((v) => v.field === fieldName) && isEmpty(values[fieldName])) {
          violations.push({
            field: fieldName,
            label: fieldName,
            reason: 'required',
            message: `${fieldName} is required for this transition`,
          });
        }
      }
    }
  }

  const seen = new Set<string>();
  const dedupedViolations = violations.filter((v) => {
    if (seen.has(v.field)) return false;
    seen.add(v.field);
    return true;
  });

  const requiresApproval = toStage?.requires_entry_approval ?? false;

  return {
    valid: dedupedViolations.length === 0,
    violations: dedupedViolations,
    blockedByTransition: false,
    blockedByBackward: false,
    requiresApproval,
  };
}

export function evaluateStageFieldVisibility(
  pf: LoadedProcessFlow,
  values: RecordData,
): Partial<Record<string, Pick<FieldRuleState, 'isHidden'>>> {
  const result: Partial<Record<string, Pick<FieldRuleState, 'isHidden'>>> = {};

  const currentStageKey = String(values[pf.flow.stage_field] ?? '');
  const currentStage = pf.stageByKey.get(currentStageKey);
  if (!currentStage) return result;

  const activeStages = pf.activeStages;
  const currentIdx = activeStages.findIndex((s) => s.stage_key === currentStageKey);

  const visibleFields = new Set<string>();

  for (let i = 0; i <= currentIdx; i++) {
    const stage = activeStages[i];
    for (const vf of stage.stage_visible_fields ?? []) {
      visibleFields.add(vf.field);
    }
  }

  const allStageManagedFields = new Set<string>();
  for (const stage of activeStages) {
    for (const vf of stage.stage_visible_fields ?? []) {
      allStageManagedFields.add(vf.field);
    }
  }

  for (const field of allStageManagedFields) {
    if (!visibleFields.has(field)) {
      result[field] = { isHidden: true };
    }
  }

  return result;
}

/**
 * Evaluate a condition component stage and return the target stage to navigate to.
 * A `condition` component has condition_entity_id/condition_field/operator/value,
 * branch_yes_stage_id, branch_no_stage_id.
 *
 * Cross-entity support: callers may pass a `relatedValues` map keyed by entity_definition_id
 * to supply field values for entities other than the primary record. If the condition targets
 * a cross-entity record and relatedValues is provided, the field is looked up there first.
 * Falls back to `values` (the primary record) if not found.
 *
 * Returns null if the stage is not a condition component or has no branch configured.
 */
export function evaluateConditionBranch(
  pf: LoadedProcessFlow,
  stageKey: string,
  values: RecordData,
  relatedValues?: Map<string, RecordData>,
): ProcessStage | null {
  const stage = pf.stageByKey.get(stageKey);
  if (!stage || stage.component_type !== 'condition') return null;

  const { condition_entity_id, branch_yes_stage_id, branch_no_stage_id } = stage;

  // Resolve which record to evaluate the field from
  let sourceValues = values;
  if (condition_entity_id && condition_entity_id !== pf.flow.entity_definition_id && relatedValues) {
    const relRecord = relatedValues.get(condition_entity_id);
    if (relRecord) sourceValues = relRecord;
  }

  const evalLeaf = (field: string, operator: string, value: string | null): boolean => {
    const fieldVal = sourceValues[field];
    // A choice/option-set value can hold MULTIPLE selected codes as a comma-separated list, so
    // `eq` means "field is ANY of these" and `neq` means "field is NONE of these". A single value
    // yields a one-element list, so this is identical to plain equality for existing conditions.
    const valList = value == null ? [] : String(value).split(',').filter((s) => s.trim() !== '');
    const inSet = valList.some((cv) => String(fieldVal ?? '') === cv);
    switch (operator) {
      case 'not_empty': return fieldVal != null && String(fieldVal).trim() !== '';
      case 'empty':     return fieldVal == null || String(fieldVal).trim() === '';
      case 'eq':        return valList.length ? inSet : String(fieldVal ?? '') === String(value ?? '');
      case 'neq':       return valList.length ? !inSet : String(fieldVal ?? '') !== String(value ?? '');
      case 'gt':        return Number(fieldVal) > Number(value);
      case 'gte':       return Number(fieldVal) >= Number(value);
      case 'lt':        return Number(fieldVal) < Number(value);
      case 'lte':       return Number(fieldVal) <= Number(value);
      case 'contains':  return String(fieldVal ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
      case 'not_contains': return !String(fieldVal ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
      default:          return false;
    }
  };

  const evalGroup = (group: ConditionGroup): boolean => {
    const results = group.rules.map((r) => (isConditionGroup(r) ? evalGroup(r) : evalLeaf(r.field, r.operator, r.value)));
    if (results.length === 0) return false;
    return group.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  };

  let result: boolean;
  const group = stage.condition_rules;
  if (group && Array.isArray(group.rules) && group.rules.length > 0) {
    result = evalGroup(group);
  } else {
    if (!stage.condition_field || !stage.condition_operator) return null;
    result = evalLeaf(stage.condition_field, stage.condition_operator, stage.condition_value);
  }

  const targetId = result ? branch_yes_stage_id : branch_no_stage_id;
  if (!targetId) return null;
  return pf.stageById.get(targetId) ?? null;
}

/**
 * Walk the stage sequence from the given stage key, automatically traversing through any
 * `condition` component stages by evaluating their branches.
 * Returns the first non-condition stage in the resolved path, or null if none.
 * Used during stage advancement: if the next stage is a condition, resolve through it automatically.
 */
export function resolveNextNonConditionStage(
  pf: LoadedProcessFlow,
  fromStageKey: string,
  values: RecordData,
  maxHops = 10,
  relatedValues?: Map<string, RecordData>,
): ProcessStage | null {
  let currentKey = fromStageKey;

  for (let i = 0; i < maxHops; i++) {
    const stage = pf.stageByKey.get(currentKey);
    if (!stage) return null;

    if (stage.component_type === 'condition') {
      const branch = evaluateConditionBranch(pf, currentKey, values, relatedValues);
      if (!branch) return null;
      currentKey = branch.stage_key;
      continue;
    }

    // Not a condition stage — this is the resolved destination
    if (currentKey !== fromStageKey) return stage;
    return null;
  }

  return null;
}

/**
 * Resolve the runtime-visible path for the process stage bar.
 * Excludes condition component nodes entirely, and for each condition evaluates
 * its branch to determine which Yes/No path stages to display.
 *
 * A stage is "branch-exclusive" if it's referenced as branch_yes_stage_id or
 * branch_no_stage_id of any condition. For each condition:
 * - Evaluate the condition against current record values
 * - The winning branch stage is included; the losing branch stage is excluded
 * - Stages not referenced by any condition branch are always included (main path)
 */
export function resolveRuntimePath(
  pf: LoadedProcessFlow,
  values: RecordData,
  relatedValues?: Map<string, RecordData>,
): ProcessStage[] {
  const active = pf.activeStages; // already display_order-sorted
  const hasConditions = active.some((s) => s.component_type === 'condition');
  if (!hasConditions) return active;

  // The flow is a TREE, not a flat list: trunk stages (the main line) run in display_order and
  // terminate at a condition; each condition forks into a YES/NO branch, and branch stages chain
  // onward via branch_yes_stage_id. To show ONLY the path the record's values select, we WALK the
  // tree from the trunk head, evaluating each condition and following just the winning branch.
  // (The old code returned every non-condition stage minus a single losing node, so every branch's
  // stages piled into one long bar — 3 stages became 16+.)
  const activeIds = new Set(active.map((s) => s.process_stage_id));
  const byId = (id: string | null | undefined): ProcessStage | null =>
    id && activeIds.has(id) ? (pf.stageById.get(id) ?? null) : null;

  // Branch targets: any active stage pointed at by a condition's YES/NO branch OR by a branch
  // continuation (a plain stage's branch_yes). These are reached only by walking INTO a branch,
  // so they are not part of the main trunk. Whatever remains is the trunk, in display_order.
  const branchTargetIds = new Set<string>();
  for (const s of active) {
    if (byId(s.branch_yes_stage_id)) branchTargetIds.add(s.branch_yes_stage_id!);
    if (byId(s.branch_no_stage_id)) branchTargetIds.add(s.branch_no_stage_id!);
  }
  const trunk = active.filter((s) => !branchTargetIds.has(s.process_stage_id));
  const trunkNextOf = new Map<string, ProcessStage | null>();
  for (let i = 0; i < trunk.length; i++) trunkNextOf.set(trunk[i].process_stage_id, trunk[i + 1] ?? null);

  const path: ProcessStage[] = [];
  const visited = new Set<string>();
  let node: ProcessStage | null = trunk[0] ?? active[0] ?? null;
  let onTrunk = true; // false once we descend into a condition branch (branches don't rejoin the trunk)
  const maxHops = active.length + 4;

  for (let hop = 0; node && hop < maxHops; hop++) {
    if (visited.has(node.process_stage_id)) break; // cycle guard
    visited.add(node.process_stage_id);

    if (node.component_type === 'condition') {
      // Follow ONLY the branch whose predicate the record satisfies. A null winner means the
      // winning branch is empty (or the condition is unconfigured) → the path simply ends here.
      node = evaluateConditionBranch(pf, node.stage_key, values, relatedValues);
      onTrunk = false;
      continue;
    }

    // Plain stage — part of the resolved path.
    path.push(node);

    // Next hop: a branch continuation (branch_yes on a plain stage) wins; otherwise, while still on
    // the trunk, step to the next trunk node by display_order; otherwise this branch tail ends.
    const cont = byId(node.branch_yes_stage_id);
    if (cont) { node = cont; onTrunk = false; continue; }
    node = onTrunk ? (trunkNextOf.get(node.process_stage_id) ?? null) : null;
  }

  return path;
}

export function mergeStageVisibilityIntoRuleState(
  pf: LoadedProcessFlow,
  values: RecordData,
  ruleState: FormRuleState,
): FormRuleState {
  const stageVisibility = evaluateStageFieldVisibility(pf, values);
  if (Object.keys(stageVisibility).length === 0) return ruleState;

  const mergedFields = { ...ruleState.fields };
  for (const [field, vis] of Object.entries(stageVisibility)) {
    if (!vis) continue;
    if (mergedFields[field]) {
      mergedFields[field] = { ...mergedFields[field], isHidden: mergedFields[field].isHidden || vis.isHidden };
    } else {
      mergedFields[field] = {
        isHidden: vis.isHidden,
        isReadonly: false,
        isRequired: false,
        forcedValue: undefined,
        defaultValue: undefined,
        clearValue: false,
        message: null,
        filteredOptions: null,
      };
    }
  }
  return { ...ruleState, fields: mergedFields };
}
