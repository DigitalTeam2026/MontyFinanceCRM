import FilterSelect from '../../app/components/FilterSelect';
import { useState, useRef, useEffect, useMemo } from 'react';
import { Filter, X, Search, Check } from 'lucide-react';
import type { FieldDefinition } from '../../types/field';

export interface ColumnFilter {
  fieldId: string;
  operator: string;
  value: unknown;
  valueTo?: unknown;
}

type FieldCategory = 'text' | 'choice' | 'boolean' | 'lookup' | 'date' | 'number';

const TEXT_OPS = [
  { value: 'eq', label: 'Equals' },
  { value: 'neq', label: 'Does not equal' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'begins_with', label: 'Begins with' },
  { value: 'not_begins_with', label: 'Does not begin with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'not_ends_with', label: 'Does not end with' },
  { value: 'has_data', label: 'Contains data' },
  { value: 'no_data', label: 'Does not contain data' },
];

const CHOICE_OPS = [
  { value: 'eq', label: 'Equals' },
  { value: 'neq', label: 'Does not equal' },
  { value: 'has_data', label: 'Contains data' },
  { value: 'no_data', label: 'Does not contain data' },
];

const BOOLEAN_OPS = [
  { value: 'eq', label: 'Equals' },
  { value: 'neq', label: 'Does not equal' },
  { value: 'has_data', label: 'Contains data' },
  { value: 'no_data', label: 'Does not contain data' },
];

const LOOKUP_OPS = [
  { value: 'eq', label: 'Equals' },
  { value: 'neq', label: 'Does not equal' },
  { value: 'has_data', label: 'Contains data' },
  { value: 'no_data', label: 'Does not contain data' },
];

const DATE_OPS = [
  { value: 'eq', label: 'Equals' },
  { value: 'neq', label: 'Does not equal' },
  { value: 'lt', label: 'Before' },
  { value: 'gt', label: 'After' },
  { value: 'lte', label: 'On or before' },
  { value: 'gte', label: 'On or after' },
  { value: 'between', label: 'Between' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'next_week', label: 'Next week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'next_month', label: 'Next month' },
  { value: 'has_data', label: 'Contains data' },
  { value: 'no_data', label: 'Does not contain data' },
];

const NUMBER_OPS = [
  { value: 'eq', label: 'Equals' },
  { value: 'neq', label: 'Does not equal' },
  { value: 'gt', label: 'Greater than' },
  { value: 'gte', label: 'Greater than or equal' },
  { value: 'lt', label: 'Less than' },
  { value: 'lte', label: 'Less than or equal' },
  { value: 'between', label: 'Between' },
  { value: 'has_data', label: 'Contains data' },
  { value: 'no_data', label: 'Does not contain data' },
];

function getFieldCategory(field: FieldDefinition): FieldCategory {
  const t = field.field_type?.name ?? '';
  if (['choice', 'optionset', 'statecode', 'statusreason'].includes(t)) return 'choice';
  if (t === 'boolean') return 'boolean';
  if (t === 'lookup') return 'lookup';
  if (t === 'datetime') return 'date';
  if (['number', 'integer', 'decimal', 'currency', 'whole_number'].includes(t)) return 'number';
  return 'text';
}

function getOpsForCategory(cat: FieldCategory) {
  switch (cat) {
    case 'choice': return CHOICE_OPS;
    case 'boolean': return BOOLEAN_OPS;
    case 'lookup': return LOOKUP_OPS;
    case 'date': return DATE_OPS;
    case 'number': return NUMBER_OPS;
    default: return TEXT_OPS;
  }
}

const NO_VALUE_OPS = new Set([
  'has_data', 'no_data', 'today', 'yesterday', 'tomorrow',
  'this_week', 'last_week', 'next_week', 'this_month', 'last_month', 'next_month',
]);

interface ColumnFilterDropdownProps {
  field: FieldDefinition;
  existingFilter?: ColumnFilter;
  onApply: (filter: ColumnFilter) => void;
  onRemove: () => void;
  onClose: () => void;
  anchorRect: DOMRect | null;
}

export default function ColumnFilterDropdown({
  field, existingFilter, onApply, onRemove, onClose, anchorRect,
}: ColumnFilterDropdownProps) {
  const cat = getFieldCategory(field);
  const ops = getOpsForCategory(cat);
  const [operator, setOperator] = useState(existingFilter?.operator ?? ops[0].value);
  const [value, setValue] = useState<unknown>(existingFilter?.value ?? '');
  const [valueTo, setValueTo] = useState<unknown>(existingFilter?.valueTo ?? '');
  const [choiceSearch, setChoiceSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const choices = useMemo(() => {
    if (cat !== 'choice') return [];
    return ((field.config_json as { choices?: { value: string; label: string; color?: string }[] })?.choices ?? []);
  }, [field, cat]);

  const filteredChoices = useMemo(() => {
    if (!choiceSearch) return choices;
    const lower = choiceSearch.toLowerCase();
    return choices.filter((c) => c.label.toLowerCase().includes(lower));
  }, [choices, choiceSearch]);

  const needsValue = !NO_VALUE_OPS.has(operator);
  const isBetween = operator === 'between';

  const handleApply = () => {
    onApply({ fieldId: field.field_definition_id, operator, value, valueTo: isBetween ? valueTo : undefined });
  };

  const style: React.CSSProperties = {};
  if (anchorRect) {
    style.position = 'fixed';
    style.top = anchorRect.bottom + 4;
    style.left = Math.min(anchorRect.left, window.innerWidth - 320);
    style.zIndex = 9999;
  }

  return (
    <div ref={ref} className="w-[300px] bg-white rounded-lg shadow-xl border border-[var(--border)]" style={style}>
      <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center gap-2">
        <Filter size={12} className="text-[var(--ink-400)]" />
        <span className="text-[12px] font-semibold text-[var(--ink-700)] flex-1 truncate">
          Filter: {field.display_name}
        </span>
        <button onClick={onClose} className="p-0.5 text-[var(--ink-400)] hover:text-[var(--ink-700)] transition-colors">
          <X size={13} />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {/* Operator Select */}
        <div>
          <label className="text-[10px] font-semibold text-[var(--ink-400)] uppercase tracking-wider">Condition</label>
          <div className="relative mt-1">
            <FilterSelect
              value={operator}
              onChange={(e) => { setOperator(e.target.value); setValue(''); setValueTo(''); }}
              className="w-full px-2.5 py-1.5 text-[12px] border border-[var(--border)] rounded bg-white pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] text-[var(--ink-700)]"
            >
              {ops.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
            </FilterSelect>
            </div>
        </div>

        {/* Value Input */}
        {needsValue && (
          <div>
            <label className="text-[10px] font-semibold text-[var(--ink-400)] uppercase tracking-wider">Value</label>
            <div className="mt-1">
              {cat === 'boolean' ? (
                <BooleanInput value={value} onChange={setValue} />
              ) : cat === 'choice' ? (
                <ChoiceInput
                  choices={filteredChoices}
                  allChoices={choices}
                  value={value}
                  onChange={setValue}
                  search={choiceSearch}
                  onSearchChange={setChoiceSearch}
                />
              ) : cat === 'date' ? (
                <div className="space-y-1.5">
                  <input
                    type="date"
                    value={String(value || '')}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[12px] border border-[var(--border)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] text-[var(--ink-700)]"
                  />
                  {isBetween && (
                    <>
                      <span className="text-[11px] text-[var(--ink-400)]">and</span>
                      <input
                        type="date"
                        value={String(valueTo || '')}
                        onChange={(e) => setValueTo(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-[12px] border border-[var(--border)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] text-[var(--ink-700)]"
                      />
                    </>
                  )}
                </div>
              ) : cat === 'number' ? (
                <div className="space-y-1.5">
                  <input
                    type="number"
                    value={String(value || '')}
                    onChange={(e) => setValue(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Enter value"
                    className="w-full px-2.5 py-1.5 text-[12px] border border-[var(--border)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] text-[var(--ink-700)] placeholder:text-[var(--ink-300)]"
                  />
                  {isBetween && (
                    <>
                      <span className="text-[11px] text-[var(--ink-400)]">and</span>
                      <input
                        type="number"
                        value={String(valueTo || '')}
                        onChange={(e) => setValueTo(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Enter value"
                        className="w-full px-2.5 py-1.5 text-[12px] border border-[var(--border)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] text-[var(--ink-700)] placeholder:text-[var(--ink-300)]"
                      />
                    </>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={String(value || '')}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter value"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-[var(--border)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] text-[var(--ink-700)] placeholder:text-[var(--ink-300)]"
                  autoFocus
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-t border-[var(--border)] flex items-center gap-2">
        <button
          onClick={handleApply}
          className="flex-1 px-3 py-1.5 text-[12px] font-medium bg-[var(--navy-accent)] hover:bg-[#245da0] text-white rounded transition-colors"
        >
          Apply filter
        </button>
        {existingFilter && (
          <button
            onClick={onRemove}
            className="px-3 py-1.5 text-[12px] font-medium border border-[var(--border)] text-[var(--ink-600)] hover:bg-[var(--ink-50)] rounded transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function BooleanInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const boolStr = value === true || value === 'true' ? 'true'
    : value === false || value === 'false' ? 'false'
    : '';
  return (
    <div className="relative">
      <FilterSelect
        value={boolStr}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-[12px] border border-[var(--border)] rounded bg-white pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] text-[var(--ink-700)]"
      >
        <option value="">Any</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </FilterSelect>
      </div>
  );
}

function ChoiceInput({ choices, allChoices, value, onChange, search, onSearchChange }: {
  choices: { value: string; label: string; color?: string }[];
  allChoices: { value: string; label: string; color?: string }[];
  value: unknown;
  onChange: (v: unknown) => void;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const selectedValues = new Set(Array.isArray(value) ? value : value ? [String(value)] : []);

  const toggle = (choiceVal: string) => {
    const next = new Set(selectedValues);
    if (next.has(choiceVal)) next.delete(choiceVal);
    else next.add(choiceVal);
    const arr = Array.from(next);
    onChange(arr.length === 1 ? arr[0] : arr);
  };

  return (
    <div>
      {allChoices.length > 6 && (
        <div className="relative mb-1.5">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-300)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search options..."
            className="w-full pl-7 pr-3 py-1.5 text-[11px] border border-[var(--border)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] text-[var(--ink-700)] placeholder:text-[var(--ink-300)]"
          />
        </div>
      )}
      <div className="max-h-[140px] overflow-y-auto space-y-0.5">
        {choices.map((c) => {
          const checked = selectedValues.has(c.value);
          return (
            <button
              key={c.value}
              onClick={() => toggle(c.value)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] rounded transition-colors ${
                checked ? 'bg-[#e5efff]' : 'hover:bg-[var(--ink-50)]'
              }`}
            >
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                checked ? 'bg-[var(--navy-accent)] border-[var(--navy-accent)]' : 'border-[var(--ink-200)]'
              }`}>
                {checked && <Check size={9} className="text-white" />}
              </div>
              {c.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />}
              <span className="text-[var(--ink-700)] truncate">{c.label}</span>
            </button>
          );
        })}
        {choices.length === 0 && (
          <p className="text-[11px] text-[var(--ink-300)] py-2 text-center">No options found</p>
        )}
      </div>
    </div>
  );
}

/* Utility: build a Supabase filter chain from active ColumnFilter[] */
export function applyColumnFilters(
  query: ReturnType<ReturnType<typeof import('../../lib/supabase').supabase.from>['select']>,
  filters: ColumnFilter[],
  allFields: FieldDefinition[],
) {
  for (const f of filters) {
    const field = allFields.find((fd) => fd.field_definition_id === f.fieldId);
    if (!field) continue;
    const col = field.physical_column_name;
    const val = f.value;

    switch (f.operator) {
      case 'eq': query = query.eq(col, val); break;
      case 'neq': query = query.neq(col, val); break;
      case 'contains': query = query.ilike(col, `%${val}%`); break;
      case 'not_contains': query = query.not(col, 'ilike', `%${val}%`); break;
      case 'begins_with': query = query.ilike(col, `${val}%`); break;
      case 'not_begins_with': query = query.not(col, 'ilike', `${val}%`); break;
      case 'ends_with': query = query.ilike(col, `%${val}`); break;
      case 'not_ends_with': query = query.not(col, 'ilike', `%${val}`); break;
      case 'gt': query = query.gt(col, val); break;
      case 'gte': query = query.gte(col, val); break;
      case 'lt': query = query.lt(col, val); break;
      case 'lte': query = query.lte(col, val); break;
      case 'between':
        query = query.gte(col, val).lte(col, f.valueTo);
        break;
      case 'has_data': query = query.not(col, 'is', null); break;
      case 'no_data': query = query.is(col, null); break;
      case 'today': {
        const t = todayRange();
        query = query.gte(col, t.from).lt(col, t.to);
        break;
      }
      case 'yesterday': {
        const t = dayOffset(-1);
        query = query.gte(col, t.from).lt(col, t.to);
        break;
      }
      case 'tomorrow': {
        const t = dayOffset(1);
        query = query.gte(col, t.from).lt(col, t.to);
        break;
      }
      case 'this_week': {
        const t = weekRange(0);
        query = query.gte(col, t.from).lt(col, t.to);
        break;
      }
      case 'last_week': {
        const t = weekRange(-1);
        query = query.gte(col, t.from).lt(col, t.to);
        break;
      }
      case 'next_week': {
        const t = weekRange(1);
        query = query.gte(col, t.from).lt(col, t.to);
        break;
      }
      case 'this_month': {
        const t = monthRange(0);
        query = query.gte(col, t.from).lt(col, t.to);
        break;
      }
      case 'last_month': {
        const t = monthRange(-1);
        query = query.gte(col, t.from).lt(col, t.to);
        break;
      }
      case 'next_month': {
        const t = monthRange(1);
        query = query.gte(col, t.from).lt(col, t.to);
        break;
      }
    }
  }
  return query;
}

function todayRange() {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
  return { from, to };
}

function dayOffset(offset: number) {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).toISOString();
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset + 1).toISOString();
  return { from, to };
}

function weekRange(offset: number) {
  const d = new Date();
  const day = d.getDay();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + offset * 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { from: start.toISOString(), to: end.toISOString() };
}

function monthRange(offset: number) {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth() + offset, 1).toISOString();
  const to = new Date(d.getFullYear(), d.getMonth() + offset + 1, 1).toISOString();
  return { from, to };
}

export function getFilterSummary(filter: ColumnFilter, field: FieldDefinition): string {
  const ops = getOpsForCategory(getFieldCategory(field));
  const opLabel = ops.find((o) => o.value === filter.operator)?.label ?? filter.operator;
  if (NO_VALUE_OPS.has(filter.operator)) return `${field.display_name} ${opLabel}`;
  const valStr = Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value ?? '');
  if (filter.operator === 'between') return `${field.display_name} ${opLabel} ${valStr} and ${filter.valueTo}`;
  return `${field.display_name} ${opLabel} "${valStr}"`;
}
