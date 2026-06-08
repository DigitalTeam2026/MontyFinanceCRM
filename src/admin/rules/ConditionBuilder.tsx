import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, GitBranch, Loader2 } from 'lucide-react';
import type { FieldDefinition } from '../../types/field';
import { supabase } from '../../lib/supabase';
import type { ProcessFlow, ProcessStage } from '../../types/processFlow';
import type {
  RuleConditionGroup,
  RuleCondition,
  ConditionGroupOperator,
  ConditionOperator,
  ProcessFlowField,
} from '../../types/businessRule';
import {
  COND_OPERATORS_BY_TYPE,
  COND_OPERATOR_LABELS,
  PROCESS_FLOW_OPERATORS,
  PROCESS_FLOW_FIELD_OPTIONS,
  STAGE_CATEGORY_OPTIONS,
  validateProcessFlowCondition,
} from '../../types/businessRule';

let idCtr = 0;
const cid = () => `c_${Date.now()}_${idCtr++}`;
const gid = () => `g_${Date.now()}_${idCtr++}`;

// Name column per physical table for lookup dropdowns
const TABLE_NAME_COL: Record<string, string> = {
  account: 'account_name',
  contact: 'full_name',
  crm_user: 'full_name',
  currency: 'name',
  country: 'name',
  industry: 'name',
  product: 'name',
  product_family: 'name',
  lead: 'full_name',
  opportunity: 'topic',
  campaign: 'name',
  event: 'name',
  crm_source: 'name',
  business_unit: 'name',
  team: 'name',
  security_role: 'name',
  segment: 'name',
  journey: 'name',
  marketing_email: 'subject',
};

// Primary key column per physical table
const TABLE_PK_COL: Record<string, string> = {
  account: 'account_id',
  contact: 'contact_id',
  crm_user: 'user_id',
  currency: 'currency_id',
  country: 'country_id',
  industry: 'industry_id',
  product: 'product_id',
  product_family: 'family_id',
  lead: 'lead_id',
  opportunity: 'opportunity_id',
  campaign: 'campaign_id',
  event: 'event_id',
  crm_source: 'source_id',
  business_unit: 'business_unit_id',
  team: 'team_id',
  security_role: 'role_id',
  segment: 'segment_id',
  journey: 'journey_id',
  marketing_email: 'email_id',
};

function getOps(field?: FieldDefinition): ConditionOperator[] {
  if (!field) return ['eq', 'neq', 'is_null', 'is_not_null'];
  return COND_OPERATORS_BY_TYPE[field.field_type?.name ?? 'text'] ?? COND_OPERATORS_BY_TYPE.text;
}
const needsVal = (op: ConditionOperator) => op !== 'is_null' && op !== 'is_not_null';
const needsTwo = (op: ConditionOperator) => op === 'between';

function getConfigFlags(field?: FieldDefinition) {
  const cfg = field?.config_json as Record<string, unknown> | null;
  return {
    isStatecodeField: !!(cfg?.is_statecode_field),
    isStatusreasonField: !!(cfg?.is_statusreason_field),
    choices: Array.isArray(cfg?.choices) ? (cfg!.choices as { value: string; label: string }[]) : [],
  };
}

interface ConditionBuilderProps {
  fields: FieldDefinition[];
  group: RuleConditionGroup | null;
  onChange: (group: RuleConditionGroup | null) => void;
  processFlows?: ProcessFlow[];
  loadFlowStages?: (flowId: string) => Promise<ProcessStage[]>;
}

export default function ConditionBuilder({
  fields,
  group,
  onChange,
  processFlows = [],
  loadFlowStages,
}: ConditionBuilderProps) {
  const root: RuleConditionGroup = group ?? { id: gid(), operator: 'AND', conditions: [], groups: [] };
  const isEmpty = root.conditions.length === 0 && root.groups.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-500">
          {isEmpty ? 'No conditions — rule will always execute' : 'Rule executes when conditions are met'}
        </p>
        {!isEmpty && (
          <button onClick={() => onChange(null)} className="text-[10px] text-red-400 hover:text-red-600">
            Clear all
          </button>
        )}
      </div>
      <CondGroupNode
        group={root}
        fields={fields}
        depth={0}
        onChange={onChange}
        onRemove={undefined}
        processFlows={processFlows}
        loadFlowStages={loadFlowStages}
      />
    </div>
  );
}

function CondGroupNode({
  group,
  fields,
  depth,
  onChange,
  onRemove,
  processFlows,
  loadFlowStages,
}: {
  group: RuleConditionGroup;
  fields: FieldDefinition[];
  depth: number;
  onChange: (g: RuleConditionGroup) => void;
  onRemove?: () => void;
  processFlows: ProcessFlow[];
  loadFlowStages?: (flowId: string) => Promise<ProcessStage[]>;
}) {
  const setOp = (op: ConditionGroupOperator) => onChange({ ...group, operator: op });

  const addEntityCond = () => {
    const f = fields[0];
    const ops = getOps(f);
    const cond: RuleCondition = {
      id: cid(),
      field_logical_name: f?.logical_name ?? '',
      field_display_name: f?.display_name ?? '',
      field_type_name: f?.field_type?.name ?? 'text',
      operator: ops[0] ?? 'eq',
      value: null,
      source: 'entity',
    };
    onChange({ ...group, conditions: [...group.conditions, cond] });
  };

  const addProcessCond = () => {
    const cond: RuleCondition = {
      id: cid(),
      field_logical_name: '__process_flow__',
      field_display_name: 'Process Flow',
      field_type_name: 'text',
      operator: 'eq',
      value: null,
      source: 'process_flow',
      process_flow_field: 'process_flow',
      process_flow_id: null,
    };
    onChange({ ...group, conditions: [...group.conditions, cond] });
  };

  const addGroup = () => {
    const sub: RuleConditionGroup = { id: gid(), operator: 'AND', conditions: [], groups: [] };
    onChange({ ...group, groups: [...group.groups, sub] });
  };

  const updateCond = (id: string, c: RuleCondition) =>
    onChange({ ...group, conditions: group.conditions.map((x) => (x.id === id ? c : x)) });

  const removeCond = (id: string) =>
    onChange({ ...group, conditions: group.conditions.filter((x) => x.id !== id) });

  const updateSub = (i: number, g: RuleConditionGroup) => {
    const groups = [...group.groups];
    groups[i] = g;
    onChange({ ...group, groups });
  };

  const removeSub = (i: number) =>
    onChange({ ...group, groups: group.groups.filter((_, idx) => idx !== i) });

  const borderColors = ['border-slate-200', 'border-blue-200', 'border-teal-200'];
  const bgColors = ['bg-white', 'bg-blue-50/30', 'bg-teal-50/20'];
  const bc = borderColors[Math.min(depth, 2)];
  const bg = bgColors[Math.min(depth, 2)];

  return (
    <div className={`border-2 rounded-xl p-3 ${bc} ${bg}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Match</span>
        <div className="flex rounded-lg overflow-hidden border border-slate-200">
          {(['AND', 'OR'] as ConditionGroupOperator[]).map((op) => (
            <button
              key={op}
              onClick={() => setOp(op)}
              className={`px-3 py-1 text-xs font-bold transition-colors ${
                group.operator === op ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'
              }`}
            >
              {op}
            </button>
          ))}
        </div>
        {onRemove && (
          <button onClick={onRemove} className="ml-auto text-slate-300 hover:text-red-500 transition-colors">
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {group.conditions.map((c) =>
          c.source === 'process_flow' ? (
            <ProcessFlowCondRow
              key={c.id}
              cond={c}
              processFlows={processFlows}
              loadFlowStages={loadFlowStages}
              onChange={(u) => updateCond(c.id, u)}
              onRemove={() => removeCond(c.id)}
            />
          ) : (
            <EntityCondRow
              key={c.id}
              cond={c}
              fields={fields}
              onChange={(u) => updateCond(c.id, u)}
              onRemove={() => removeCond(c.id)}
            />
          )
        )}
        {group.groups.map((sub, i) => (
          <CondGroupNode
            key={sub.id}
            group={sub}
            fields={fields}
            depth={depth + 1}
            onChange={(u) => updateSub(i, u)}
            onRemove={() => removeSub(i)}
            processFlows={processFlows}
            loadFlowStages={loadFlowStages}
          />
        ))}
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={addEntityCond}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Plus size={11} /> Add Condition
        </button>
        {processFlows.length > 0 && (
          <button
            onClick={addProcessCond}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <GitBranch size={11} /> Process Flow
          </button>
        )}
        {depth < 2 && (
          <button
            onClick={addGroup}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Plus size={11} /> Add Group
          </button>
        )}
      </div>
    </div>
  );
}

function EntityCondRow({
  cond,
  fields,
  onChange,
  onRemove,
}: {
  cond: RuleCondition;
  fields: FieldDefinition[];
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
}) {
  const sel = fields.find((f) => f.logical_name === cond.field_logical_name);
  const ops = getOps(sel);
  const typeName = sel?.field_type?.name ?? 'text';

  const handleField = (ln: string) => {
    const f = fields.find((x) => x.logical_name === ln);
    const newOps = getOps(f);
    onChange({
      ...cond,
      field_logical_name: ln,
      field_display_name: f?.display_name ?? ln,
      field_type_name: f?.field_type?.name ?? 'text',
      operator: newOps[0] ?? 'eq',
      value: null,
      value2: null,
      source: 'entity',
    });
  };

  const handleOp = (op: ConditionOperator) =>
    onChange({ ...cond, operator: op, value: needsVal(op) ? cond.value : null, value2: null });

  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
      <div className="relative w-36 shrink-0">
        <select
          value={cond.field_logical_name}
          onChange={(e) => handleField(e.target.value)}
          className="w-full appearance-none text-xs font-medium text-slate-700 bg-transparent border-0 focus:outline-none pr-5"
        >
          {fields.map((f) => (
            <option key={f.field_definition_id} value={f.logical_name}>
              {f.display_name}
            </option>
          ))}
        </select>
        <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>

      <div className="w-px h-4 bg-slate-200 shrink-0" />

      <div className="relative w-36 shrink-0">
        <select
          value={cond.operator}
          onChange={(e) => handleOp(e.target.value as ConditionOperator)}
          className="w-full appearance-none text-xs text-slate-500 bg-transparent border-0 focus:outline-none pr-5"
        >
          {ops.map((op) => (
            <option key={op} value={op}>{COND_OPERATOR_LABELS[op]}</option>
          ))}
        </select>
        <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>

      {needsVal(cond.operator) && (
        <>
          <div className="w-px h-4 bg-slate-200 shrink-0" />
          <CondValueInput
            field={sel}
            fieldTypeName={typeName}
            value={(cond.value as string) ?? ''}
            onChange={(v) => onChange({ ...cond, value: v })}
          />
        </>
      )}

      {needsTwo(cond.operator) && (
        <>
          <span className="text-[10px] text-slate-400 shrink-0">and</span>
          <input
            type="text"
            value={cond.value2 ?? ''}
            onChange={(e) => onChange({ ...cond, value2: e.target.value })}
            placeholder="Value..."
            className="flex-1 min-w-0 text-xs text-slate-700 bg-transparent border-0 focus:outline-none placeholder:text-slate-300"
          />
        </>
      )}

      <button onClick={onRemove} className="shrink-0 p-1 text-slate-300 hover:text-red-500 transition-colors">
        <Trash2 size={11} />
      </button>
    </div>
  );
}

// ─── Condition value input — field-type-aware ─────────────────────────────────

interface CondValueInputProps {
  field?: FieldDefinition;
  fieldTypeName: string;
  value: string;
  onChange: (v: string) => void;
}

function CondValueInput({ field, fieldTypeName, value, onChange }: CondValueInputProps) {
  const cfg = field?.config_json as Record<string, unknown> | null;
  const isStatecodeField = !!(cfg?.is_statecode_field);
  const isStatusreasonField = !!(cfg?.is_statusreason_field);
  const isChoice = fieldTypeName === 'choice' || fieldTypeName === 'multi_choice' || fieldTypeName === 'optionset';
  const isLookup = fieldTypeName === 'lookup';
  const isBool = fieldTypeName === 'boolean';

  const choices = Array.isArray(cfg?.choices) ? (cfg!.choices as { value: string; label: string }[]) : [];

  const [statecodeOptions, setStatecodeOptions] = useState<{ value: string; label: string }[]>([]);
  const [statusreasonOptions, setStatusreasonOptions] = useState<{ value: string; label: string }[]>([]);
  const [lookupOptions, setLookupOptions] = useState<{ value: string; label: string }[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (!field) return;
    if (isStatecodeField) {
      supabase
        .from('statecode_definition')
        .select('state_value, display_label')
        .eq('entity_definition_id', field.entity_definition_id)
        .order('sort_order')
        .then(({ data }) => {
          setStatecodeOptions((data ?? []).map((r) => ({ value: String(r.state_value), label: r.display_label })));
        });
    }
    if (isStatusreasonField) {
      supabase
        .from('status_reason_definition')
        .select('reason_value, display_label')
        .eq('entity_definition_id', field.entity_definition_id)
        .order('sort_order')
        .then(({ data }) => {
          setStatusreasonOptions((data ?? []).map((r) => ({ value: String(r.reason_value), label: r.display_label })));
        });
    }
  }, [field?.field_definition_id, isStatecodeField, isStatusreasonField]);

  useEffect(() => {
    if (!isLookup || !field?.lookup_entity_id) return;
    setLookupLoading(true);
    supabase
      .from('entity_definition')
      .select('physical_table_name, logical_name')
      .eq('entity_definition_id', field.lookup_entity_id)
      .maybeSingle()
      .then(async ({ data: ent }) => {
        if (!ent) { setLookupLoading(false); return; }
        const table = ent.physical_table_name as string;
        const pkCol = TABLE_PK_COL[table] ?? `${table}_id`;
        const nameCol = TABLE_NAME_COL[table] ?? 'name';
        const { data } = await supabase.from(table).select(`${pkCol}, ${nameCol}`).order(nameCol).limit(200);
        setLookupOptions(
          (data ?? []).map((r: Record<string, unknown>) => ({
            value: String(r[pkCol] ?? ''),
            label: String(r[nameCol] ?? r[pkCol] ?? ''),
          }))
        );
        setLookupLoading(false);
      });
  }, [field?.field_definition_id, isLookup]);

  const selectCls = 'flex-1 min-w-0 appearance-none text-xs text-slate-700 bg-transparent border-0 focus:outline-none pr-4';

  if (isBool) {
    return (
      <div className="relative flex-1 min-w-0">
        <select value={value || 'true'} onChange={(e) => onChange(e.target.value)} className={selectCls}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
        <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    );
  }

  if (isStatecodeField && statecodeOptions.length > 0) {
    return (
      <div className="relative flex-1 min-w-0">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
          <option value="">— Select —</option>
          {statecodeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    );
  }

  if (isStatusreasonField && statusreasonOptions.length > 0) {
    return (
      <div className="relative flex-1 min-w-0">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
          <option value="">— Select —</option>
          {statusreasonOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    );
  }

  if (isChoice && choices.length > 0) {
    return (
      <div className="relative flex-1 min-w-0">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
          <option value="">— Select —</option>
          {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    );
  }

  if (isLookup) {
    if (lookupLoading) {
      return (
        <div className="flex-1 min-w-0 flex items-center gap-1.5 text-xs text-slate-400">
          <Loader2 size={10} className="animate-spin" /> Loading...
        </div>
      );
    }
    if (lookupOptions.length > 0) {
      return (
        <div className="relative flex-1 min-w-0">
          <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
            <option value="">— Select —</option>
            {lookupOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      );
    }
    // Fallback: no options loaded — still allow editing but show a select with current value if it looks like a UUID
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuid = UUID_RE.test(value);
    return (
      <div className="relative flex-1 min-w-0">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
          <option value="">— Select —</option>
          {isUuid && value && <option value={value}>{value.slice(0, 8)}…</option>}
        </select>
        <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    );
  }

  const inputType =
    ['number', 'decimal', 'currency', 'integer'].includes(fieldTypeName) ? 'number'
    : fieldTypeName === 'date' ? 'date'
    : fieldTypeName === 'datetime' ? 'datetime-local'
    : 'text';

  return (
    <input
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value..."
      className="flex-1 min-w-0 text-xs text-slate-700 bg-transparent border-0 focus:outline-none placeholder:text-slate-300"
    />
  );
}

function ProcessFlowCondRow({
  cond,
  processFlows,
  loadFlowStages,
  onChange,
  onRemove,
}: {
  cond: RuleCondition;
  processFlows: ProcessFlow[];
  loadFlowStages?: (flowId: string) => Promise<ProcessStage[]>;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
}) {
  const [stages, setStages] = useState<ProcessStage[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);

  const pfField = cond.process_flow_field ?? 'process_flow';
  const validationError = validateProcessFlowCondition(cond);

  useEffect(() => {
    if (pfField === 'current_stage' && cond.process_flow_id && loadFlowStages) {
      setLoadingStages(true);
      loadFlowStages(cond.process_flow_id)
        .then(setStages)
        .finally(() => setLoadingStages(false));
    } else {
      setStages([]);
    }
  }, [pfField, cond.process_flow_id, loadFlowStages]);

  const handleFieldChange = (f: ProcessFlowField) => {
    onChange({
      ...cond,
      process_flow_field: f,
      process_flow_id: f === 'current_stage' ? cond.process_flow_id : null,
      value: null,
    });
  };

  const handleFlowChange = (flowId: string) => {
    onChange({ ...cond, process_flow_id: flowId || null, value: null });
  };

  const handleOperatorChange = (op: ConditionOperator) => {
    onChange({ ...cond, operator: op });
  };

  const handleValueChange = (v: string) => {
    onChange({ ...cond, value: v || null });
  };

  return (
    <div className={`flex flex-col gap-1.5 bg-teal-50/20 border rounded-lg px-3 py-2 ${
      validationError ? 'border-red-300' : 'border-teal-200'
    }`} style={{ borderLeftWidth: '3px', borderLeftColor: validationError ? '#fca5a5' : '#5eead4' }}>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 shrink-0">
          <GitBranch size={10} className="text-teal-500" />
          <span className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider">Process</span>
        </div>

        <div className="w-px h-4 bg-teal-200 shrink-0" />

        <div className="relative shrink-0">
          <select
            value={pfField}
            onChange={(e) => handleFieldChange(e.target.value as ProcessFlowField)}
            className="appearance-none text-xs font-medium text-slate-700 bg-transparent border-0 focus:outline-none pr-5"
          >
            {PROCESS_FLOW_FIELD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        <div className="w-px h-4 bg-teal-200 shrink-0" />

        <div className="relative shrink-0">
          <select
            value={cond.operator}
            onChange={(e) => handleOperatorChange(e.target.value as ConditionOperator)}
            className="appearance-none text-xs text-slate-500 bg-transparent border-0 focus:outline-none pr-5"
          >
            {PROCESS_FLOW_OPERATORS.map((op) => (
              <option key={op} value={op}>{COND_OPERATOR_LABELS[op]}</option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        <div className="w-px h-4 bg-teal-200 shrink-0" />

        {pfField === 'current_stage' && (
          <>
            <div className="relative shrink-0">
              <select
                value={cond.process_flow_id ?? ''}
                onChange={(e) => handleFlowChange(e.target.value)}
                className="appearance-none text-xs text-slate-600 bg-transparent border-0 focus:outline-none pr-5 max-w-[110px]"
              >
                <option value="">— Flow —</option>
                {processFlows.map((f) => (
                  <option key={f.process_flow_id} value={f.process_flow_id}>{f.name}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <div className="w-px h-4 bg-teal-200 shrink-0" />
            <div className="relative flex-1">
              {loadingStages ? (
                <span className="text-[10px] text-slate-400 italic">Loading stages...</span>
              ) : (
                <select
                  value={(cond.value as string) ?? ''}
                  onChange={(e) => handleValueChange(e.target.value)}
                  disabled={!cond.process_flow_id || stages.length === 0}
                  className="w-full appearance-none text-xs text-slate-700 bg-transparent border-0 focus:outline-none pr-5 disabled:text-slate-300"
                >
                  <option value="">— Stage —</option>
                  {stages.map((s) => (
                    <option key={s.process_stage_id} value={s.process_stage_id}>{s.name}</option>
                  ))}
                </select>
              )}
              <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </>
        )}

        {pfField === 'process_flow' && (
          <div className="relative flex-1">
            <select
              value={(cond.value as string) ?? ''}
              onChange={(e) => handleValueChange(e.target.value)}
              className="w-full appearance-none text-xs text-slate-700 bg-transparent border-0 focus:outline-none pr-5"
            >
              <option value="">— Select Flow —</option>
              {processFlows.map((f) => (
                <option key={f.process_flow_id} value={f.process_flow_id}>{f.name}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}

        {pfField === 'stage_category' && (
          <div className="relative flex-1">
            <select
              value={(cond.value as string) ?? ''}
              onChange={(e) => handleValueChange(e.target.value)}
              className="w-full appearance-none text-xs text-slate-700 bg-transparent border-0 focus:outline-none pr-5"
            >
              <option value="">— Select Category —</option>
              {STAGE_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}

        <button onClick={onRemove} className="shrink-0 p-1 text-slate-300 hover:text-red-500 transition-colors">
          <Trash2 size={11} />
        </button>
      </div>

      {validationError && (
        <p className="text-[10px] text-red-500 pl-1">{validationError}</p>
      )}
    </div>
  );
}
