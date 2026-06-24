// Field-type-aware trigger-condition builder for workflows. Each row is
// [field] [operator] [value], where the value editor adapts to the field type by
// reusing the shared ConditionValueInput (choice → dropdown, lookup → searchable
// picker, date → date picker, boolean → Yes/No, number/text → inputs). The
// `is any of` / `is none of` operators accept multiple values (chips) for
// choice / multi-choice / lookup fields. Output maps 1:1 to the engine's
// trigger_conditions.filter_conditions, which it evaluates against the new row.

import { Plus, Trash2, X } from 'lucide-react';
import type { FieldDefinition } from '../../types/field';
import type { WorkflowFilterCondition } from '../../types/workflow';
import FilterSelect from '../../app/components/FilterSelect';
import ConditionValueInput from '../../app/components/ConditionValueInput';

type Op = WorkflowFilterCondition['operator'];

let condCtr = 0;
const newCondId = () => `cond_${++condCtr}_${Math.floor(Math.random() * 1e6)}`;

const NULL_OPS: { value: Op; label: string }[] = [
  { value: 'is_null', label: 'is empty' },
  { value: 'is_not_null', label: 'is not empty' },
];

const OPS = {
  text:    [{ value: 'eq', label: 'equals' }, { value: 'neq', label: 'not equals' }, { value: 'contains', label: 'contains' }, ...NULL_OPS] as { value: Op; label: string }[],
  number:  [{ value: 'eq', label: 'equals' }, { value: 'neq', label: 'not equals' }, { value: 'gt', label: 'greater than' }, { value: 'lt', label: 'less than' }, ...NULL_OPS] as { value: Op; label: string }[],
  date:    [{ value: 'eq', label: 'on' }, { value: 'neq', label: 'not on' }, { value: 'gt', label: 'after' }, { value: 'lt', label: 'before' }, ...NULL_OPS] as { value: Op; label: string }[],
  boolean: [{ value: 'eq', label: 'equals' }, ...NULL_OPS] as { value: Op; label: string }[],
  choice:  [{ value: 'eq', label: 'equals' }, { value: 'neq', label: 'not equals' }, { value: 'in', label: 'is any of' }, { value: 'not_in', label: 'is none of' }, ...NULL_OPS] as { value: Op; label: string }[],
  multi:   [{ value: 'in', label: 'has any of' }, { value: 'not_in', label: 'has none of' }, ...NULL_OPS] as { value: Op; label: string }[],
  lookup:  [{ value: 'eq', label: 'equals' }, { value: 'neq', label: 'not equals' }, { value: 'in', label: 'is any of' }, { value: 'not_in', label: 'is none of' }, ...NULL_OPS] as { value: Op; label: string }[],
};

function opsForField(field?: FieldDefinition | null): { value: Op; label: string }[] {
  const t = field?.field_type?.name ?? 'text';
  if (['number', 'decimal', 'currency', 'integer', 'whole_number'].includes(t)) return OPS.number;
  if (['date', 'datetime'].includes(t)) return OPS.date;
  if (t === 'boolean') return OPS.boolean;
  if (['choice', 'optionset'].includes(t)) return OPS.choice;
  if (t === 'multi_choice') return OPS.multi;
  if (t === 'lookup') return OPS.lookup;
  return OPS.text;
}

interface Props {
  fields: FieldDefinition[];
  conditions: WorkflowFilterCondition[];
  onChange: (next: WorkflowFilterCondition[]) => void;
}

export default function WorkflowFilterConditions({ fields, conditions, onChange }: Props) {
  const update = (id: string, patch: Partial<WorkflowFilterCondition>) =>
    onChange(conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => onChange(conditions.filter((c) => c.id !== id));
  const add = () => onChange([...conditions, { id: newCondId(), field: '', operator: 'eq', value: '' }]);

  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-2">
        Conditions <span className="font-normal text-slate-400">(all must match — optional)</span>
      </label>

      {conditions.length === 0 ? (
        <p className="text-[11px] text-slate-400 mb-2">No value conditions. The workflow fires whenever the watched fields change, regardless of value.</p>
      ) : (
        <div className="space-y-2 mb-2">
          {conditions.map((c) => {
            const field = fields.find((f) => f.logical_name === c.field) ?? null;
            const ops = opsForField(field);
            const needsValue = c.operator !== 'is_null' && c.operator !== 'is_not_null';
            const isMulti = c.operator === 'in' || c.operator === 'not_in';
            return (
              <div key={c.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2">
                <div className="w-32 shrink-0">
                  <FilterSelect
                    value={c.field}
                    forceSearch
                    onChange={(e) => {
                      const f = fields.find((x) => x.logical_name === e.target.value) ?? null;
                      update(c.id, { field: e.target.value, operator: opsForField(f)[0].value, value: '' });
                    }}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                  >
                    <option value="">Field…</option>
                    {fields.map((f) => (
                      <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>
                    ))}
                  </FilterSelect>
                </div>

                <div className="w-28 shrink-0">
                  <FilterSelect
                    value={c.operator}
                    onChange={(e) => update(c.id, { operator: e.target.value as Op, value: '' })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                  >
                    {ops.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </FilterSelect>
                </div>

                <div className="flex-1 min-w-0">
                  {!needsValue ? (
                    <span className="text-[11px] text-slate-400 px-1">no value needed</span>
                  ) : isMulti ? (
                    <MultiValue field={field} value={c.value ?? ''} onChange={(v) => update(c.id, { value: v })} />
                  ) : (
                    <ConditionValueInput field={field} value={c.value ?? ''} onChange={(v) => update(c.id, { value: v })} variant="boxed" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="w-6 h-6 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-dashed border-blue-200 rounded-xl hover:bg-blue-50"
      >
        <Plus size={12} /> Add condition
      </button>
    </div>
  );
}

// Multi-value picker for `in` / `not_in`. Only ever wraps a dropdown field type
// (choice / multi-choice / lookup), so picking appends to the comma-separated
// list and the picker resets. Choice labels resolve from the field's options;
// lookup values fall back to a short id (label resolution lives inside the picker).
function MultiValue({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition | null;
  value: string;
  onChange: (v: string) => void;
}) {
  const parts = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const cfg = field?.config_json as Record<string, unknown> | null;
  const choices = Array.isArray(cfg?.choices) ? (cfg!.choices as { value: string; label: string }[]) : [];
  const labelFor = (v: string) => choices.find((o) => o.value === v)?.label ?? (v.length > 10 ? `${v.slice(0, 8)}…` : v);

  return (
    <div>
      {parts.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {parts.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full pl-2 pr-1 py-0.5">
              {labelFor(p)}
              <button
                type="button"
                onClick={() => onChange(parts.filter((x) => x !== p).join(','))}
                className="w-3 h-3 flex items-center justify-center rounded-full hover:bg-blue-200 text-blue-500"
              >
                <X size={8} />
              </button>
            </span>
          ))}
        </div>
      )}
      <ConditionValueInput
        field={field}
        value=""
        placeholder="Add value…"
        onChange={(v) => {
          if (v && !parts.includes(v)) onChange([...parts, v].join(','));
        }}
        variant="boxed"
      />
    </div>
  );
}
