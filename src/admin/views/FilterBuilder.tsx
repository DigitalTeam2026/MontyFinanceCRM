import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, Loader2 } from 'lucide-react';
import type { FieldDefinition } from '../../types/field';
import type {
  FilterGroup,
  FilterCondition,
  FilterGroupOperator,
  FilterOperator,
} from '../../types/view';
import { OPERATOR_LABELS, OPERATORS_BY_TYPE } from '../../types/view';
import { supabase } from '../../lib/supabase';

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

let idCounter = 0;
const cid = () => `cond_${Date.now()}_${idCounter++}`;
const gid = () => `grp_${Date.now()}_${idCounter++}`;

const DEFAULT_FILTER: FilterGroup = {
  id: gid(),
  operator: 'AND',
  conditions: [],
  groups: [],
};

function getOperators(field?: FieldDefinition): FilterOperator[] {
  if (!field) return ['eq', 'neq', 'is_null', 'is_not_null'];
  const typeName = field.field_type?.name ?? 'text';
  return OPERATORS_BY_TYPE[typeName] ?? OPERATORS_BY_TYPE.text;
}

function needsValue(op: FilterOperator): boolean {
  return op !== 'is_null' && op !== 'is_not_null';
}

function needsTwoValues(op: FilterOperator): boolean {
  return op === 'between';
}

interface FilterBuilderProps {
  fields: FieldDefinition[];
  filter: FilterGroup | null;
  onChange: (filter: FilterGroup | null) => void;
}

export default function FilterBuilder({ fields, filter, onChange }: FilterBuilderProps) {
  const raw = filter ?? { ...DEFAULT_FILTER, id: gid() };
  const root: FilterGroup = {
    ...raw,
    conditions: raw.conditions ?? [],
    groups: raw.groups ?? [],
  };

  const updateRoot = (updated: FilterGroup) => onChange(updated);

  const clear = () => onChange(null);

  const isEmpty = root.conditions.length === 0 && (root.groups ?? []).length === 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {isEmpty ? 'No filters — all records will be shown' : 'Showing filtered records'}
        </p>
        {!isEmpty && (
          <button onClick={clear} className="text-[10px] text-red-400 hover:text-red-600 transition-colors">
            Clear all
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <FilterGroupNode
          group={root}
          fields={fields}
          depth={0}
          onChange={updateRoot}
          onRemove={undefined}
        />
      </div>
    </div>
  );
}

function FilterGroupNode({
  group,
  fields,
  depth,
  onChange,
  onRemove,
}: {
  group: FilterGroup;
  fields: FieldDefinition[];
  depth: number;
  onChange: (g: FilterGroup) => void;
  onRemove?: () => void;
}) {
  const conditions = group.conditions ?? [];
  const groups = group.groups ?? [];

  const setOperator = (op: FilterGroupOperator) => onChange({ ...group, operator: op });

  const addCondition = () => {
    const firstField = fields[0];
    const ops = getOperators(firstField);
    const cond: FilterCondition = {
      id: cid(),
      field_logical_name: firstField?.logical_name ?? '',
      field_display_name: firstField?.display_name ?? '',
      field_type_name: firstField?.field_type?.name ?? 'text',
      operator: ops[0] ?? 'eq',
      value: null,
    };
    onChange({ ...group, conditions: [...conditions, cond] });
  };

  const addGroup = () => {
    const subGroup: FilterGroup = { id: gid(), operator: 'AND', conditions: [], groups: [] };
    onChange({ ...group, groups: [...groups, subGroup] });
  };

  const updateCondition = (condId: string, updated: FilterCondition) => {
    onChange({
      ...group,
      conditions: conditions.map((c) => (c.id === condId ? updated : c)),
    });
  };

  const removeCondition = (condId: string) => {
    onChange({ ...group, conditions: conditions.filter((c) => c.id !== condId) });
  };

  const updateSubGroup = (gIdx: number, updated: FilterGroup) => {
    const updatedGroups = [...groups];
    updatedGroups[gIdx] = updated;
    onChange({ ...group, groups: updatedGroups });
  };

  const removeSubGroup = (gIdx: number) => {
    onChange({ ...group, groups: groups.filter((_, i) => i !== gIdx) });
  };

  const borderColor = depth === 0 ? 'border-slate-200' : depth === 1 ? 'border-blue-200' : 'border-emerald-200';
  const bgColor = depth === 0 ? 'bg-white' : depth === 1 ? 'bg-blue-50/30' : 'bg-emerald-50/30';

  return (
    <div className={`border-2 rounded-xl p-3 ${borderColor} ${bgColor}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Match</span>
        <div className="flex rounded-lg overflow-hidden border border-slate-200">
          {(['AND', 'OR'] as FilterGroupOperator[]).map((op) => (
            <button
              key={op}
              onClick={() => setOperator(op)}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                group.operator === op
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {op}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-slate-400">conditions</span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="ml-auto p-1 text-slate-300 hover:text-red-500 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {conditions.map((cond) => (
          <ConditionRow
            key={cond.id}
            condition={cond}
            fields={fields}
            onChange={(updated) => updateCondition(cond.id, updated)}
            onRemove={() => removeCondition(cond.id)}
          />
        ))}

        {groups.map((subGroup, gIdx) => (
          <FilterGroupNode
            key={subGroup.id}
            group={subGroup}
            fields={fields}
            depth={depth + 1}
            onChange={(updated) => updateSubGroup(gIdx, updated)}
            onRemove={() => removeSubGroup(gIdx)}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={addCondition}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Plus size={11} />
          Add Condition
        </button>
        {depth < 2 && (
          <button
            onClick={addGroup}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Plus size={11} />
            Add Group
          </button>
        )}
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  fields,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  fields: FieldDefinition[];
  onChange: (c: FilterCondition) => void;
  onRemove: () => void;
}) {
  const selectedField = fields.find((f) => f.logical_name === condition.field_logical_name);
  const ops = getOperators(selectedField);

  const handleFieldChange = (logicalName: string) => {
    const field = fields.find((f) => f.logical_name === logicalName);
    const newOps = getOperators(field);
    onChange({
      ...condition,
      field_logical_name: logicalName,
      field_display_name: field?.display_name ?? logicalName,
      field_type_name: field?.field_type?.name ?? 'text',
      operator: newOps[0] ?? 'eq',
      value: null,
      value2: null,
    });
  };

  const handleOperatorChange = (op: FilterOperator) => {
    onChange({ ...condition, operator: op, value: needsValue(op) ? condition.value : null, value2: null });
  };

  const showValue = needsValue(condition.operator);
  const showSecond = needsTwoValues(condition.operator);
  const fieldTypeName = selectedField?.field_type?.name ?? 'text';
  const isBool = fieldTypeName === 'boolean';
  const isChoice = fieldTypeName === 'choice' || fieldTypeName === 'multi_choice';
  const isLookup = fieldTypeName === 'lookup';
  const isStatecode = selectedField?.logical_name === 'statecode';
  const isStatusreason = selectedField?.logical_name === 'statusreason';

  return (
    <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2">
      <div className="relative shrink-0 w-36">
        <select
          value={condition.field_logical_name}
          onChange={(e) => handleFieldChange(e.target.value)}
          className="w-full appearance-none text-xs text-slate-700 border-0 bg-transparent focus:outline-none pr-5 font-medium"
        >
          {fields.map((f) => (
            <option key={f.field_definition_id} value={f.logical_name}>
              {f.display_name}
            </option>
          ))}
        </select>
        <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>

      <div className="h-4 w-px bg-slate-200 shrink-0" />

      <div className="relative shrink-0 w-36">
        <select
          value={condition.operator}
          onChange={(e) => handleOperatorChange(e.target.value as FilterOperator)}
          className="w-full appearance-none text-xs text-slate-500 border-0 bg-transparent focus:outline-none pr-5"
        >
          {ops.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </option>
          ))}
        </select>
        <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>

      {showValue && (
        <>
          <div className="h-4 w-px bg-slate-200 shrink-0" />
          <FilterValueInput
            fieldTypeName={fieldTypeName}
            isBool={isBool}
            isChoice={isChoice}
            isLookup={isLookup}
            isStatecode={isStatecode}
            isStatusreason={isStatusreason}
            field={selectedField}
            value={(condition.value as string) ?? ''}
            onChange={(v) => onChange({ ...condition, value: v })}
          />
        </>
      )}

      {showSecond && (
        <>
          <span className="text-[10px] text-slate-400 shrink-0">and</span>
          <input
            type="text"
            value={condition.value2 ?? ''}
            onChange={(e) => onChange({ ...condition, value2: e.target.value })}
            placeholder="Value..."
            className="flex-1 text-xs text-slate-700 border-0 bg-transparent focus:outline-none placeholder:text-slate-300 min-w-0"
          />
        </>
      )}

      <button
        onClick={onRemove}
        className="p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

interface FilterValueInputProps {
  fieldTypeName: string;
  isBool: boolean;
  isChoice: boolean;
  isLookup: boolean;
  isStatecode: boolean;
  isStatusreason: boolean;
  field?: FieldDefinition;
  value: string;
  onChange: (v: string) => void;
}

function FilterValueInput({
  fieldTypeName,
  isBool,
  isChoice,
  isLookup,
  isStatecode,
  isStatusreason,
  field,
  value,
  onChange,
}: FilterValueInputProps) {
  const [statecodeOptions, setStatecodeOptions] = useState<{ value: string; label: string }[]>([]);
  const [statusreasonOptions, setStatusreasonOptions] = useState<{ value: string; label: string }[]>([]);
  const [lookupOptions, setLookupOptions] = useState<{ value: string; label: string }[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (!field) return;
    if (isStatecode) {
      supabase
        .from('statecode_definition')
        .select('state_value, display_label')
        .eq('entity_definition_id', field.entity_definition_id)
        .order('sort_order')
        .then(({ data }) => {
          setStatecodeOptions((data ?? []).map((r) => ({ value: String(r.state_value), label: r.display_label })));
        });
    }
    if (isStatusreason) {
      supabase
        .from('status_reason_definition')
        .select('reason_value, display_label')
        .eq('entity_definition_id', field.entity_definition_id)
        .order('sort_order')
        .then(({ data }) => {
          setStatusreasonOptions((data ?? []).map((r) => ({ value: String(r.reason_value), label: r.display_label })));
        });
    }
  }, [field, isStatecode, isStatusreason]);

  useEffect(() => {
    if (!isLookup || !field?.lookup_entity_id) return;
    setLookupLoading(true);
    supabase
      .from('entity_definition')
      .select('physical_table_name')
      .eq('entity_definition_id', field.lookup_entity_id)
      .maybeSingle()
      .then(async ({ data: ent }) => {
        if (!ent) { setLookupLoading(false); return; }
        const table = ent.physical_table_name as string;
        const pkCol = TABLE_PK_COL[table] ?? `${table}_id`;
        const nameCol = TABLE_NAME_COL[table] ?? 'name';
        const { data } = await supabase.from(table).select(`${pkCol}, ${nameCol}`).order(nameCol).limit(200);
        setLookupOptions(
          ((data ?? []) as unknown as Record<string, unknown>[]).map((r: Record<string, unknown>) => ({
            value: String(r[pkCol] ?? ''),
            label: String(r[nameCol] ?? r[pkCol] ?? ''),
          }))
        );
        setLookupLoading(false);
      });
  }, [field?.field_definition_id, isLookup]);

  const cls = 'flex-1 min-w-0 text-xs text-slate-700 border-0 bg-transparent focus:outline-none placeholder:text-slate-300';
  const selectCls = 'flex-1 min-w-0 appearance-none text-xs text-slate-700 border-0 bg-transparent focus:outline-none pr-4';

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

  if (isStatecode && statecodeOptions.length > 0) {
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

  if (isStatusreason && statusreasonOptions.length > 0) {
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

  if (isChoice) {
    const choices = (field?.config_json as { choices?: { value: string; label: string }[] } | null)?.choices ?? [];
    if (choices.length > 0) {
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
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search value..."
        className={cls}
      />
    );
  }

  return (
    <input
      type={['number', 'decimal', 'currency'].includes(fieldTypeName) ? 'number' : ['date', 'datetime'].includes(fieldTypeName) ? 'date' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value..."
      className={cls}
    />
  );
}
