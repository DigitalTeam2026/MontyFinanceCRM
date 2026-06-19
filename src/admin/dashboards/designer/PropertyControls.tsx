// Reusable property-panel controls shared by every visual's Data / Format /
// Advanced panel. The goals (see the dashboard designer spec):
//   • one full-width control per row by default — never cram two important
//     dropdowns side by side in the narrow right panel;
//   • labels always above inputs, with optional help text + inline validation;
//   • dropdowns are min-36px tall, full width, searchable (FilterSelect) and
//     show friendly field labels with an entity · type subtitle;
//   • long values ellipsize with a hover tooltip instead of clipping.
// Style every panel through these primitives — do NOT hand-roll inputs per visual.

import type { ReactNode, ChangeEventHandler } from 'react';
import {
  AlertCircle, Type as TypeIcon, Hash, Calendar, ToggleLeft, Link2, List, FileText,
} from 'lucide-react';
import type { FieldDefinition } from '../../../types/field';
import FilterSelect from '../../../app/components/FilterSelect';

// ── shared control styling ───────────────────────────────────────────────────
// 36px min height, full width, generous padding so dropdown text never clips.
export const propControlCls =
  'w-full min-h-[36px] px-2.5 py-2 text-[12px] rounded-md border border-slate-600 bg-slate-900 ' +
  'text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

// ── field-type categorisation (drives measure-specific field filtering) ───────
export const NUMERIC_TYPES = new Set(['number', 'decimal', 'integer', 'currency', 'money', 'whole_number', 'float', 'percentage']);
export const DATE_TYPES = new Set(['date', 'datetime']);

export const fieldTypeNameOf = (f: FieldDefinition): string => f.field_type?.name ?? 'text';
export const isNumericField = (f: FieldDefinition): boolean => NUMERIC_TYPES.has(fieldTypeNameOf(f));
export const isDateTypeField = (f: FieldDefinition): boolean => DATE_TYPES.has(fieldTypeNameOf(f));

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Text', textarea: 'Multiline Text', email: 'Email', phone: 'Phone', url: 'URL',
  number: 'Number', whole_number: 'Number', integer: 'Integer', decimal: 'Decimal',
  float: 'Decimal', currency: 'Currency', money: 'Currency', percentage: 'Percentage',
  date: 'Date', datetime: 'Date and Time', boolean: 'Yes/No', lookup: 'Lookup',
  choice: 'Choice', multi_choice: 'Multi-choice', option_set: 'Choice', select: 'Choice',
};

export function fieldTypeLabel(f: FieldDefinition): string {
  const t = fieldTypeNameOf(f);
  return FIELD_TYPE_LABELS[t] ?? f.field_type?.display_name ?? t;
}

function FieldTypeIcon({ f }: { f: FieldDefinition }) {
  const t = fieldTypeNameOf(f);
  const cls = 'shrink-0 text-slate-500';
  if (NUMERIC_TYPES.has(t)) return <Hash size={11} className={cls} />;
  if (DATE_TYPES.has(t)) return <Calendar size={11} className={cls} />;
  if (t === 'boolean') return <ToggleLeft size={11} className={cls} />;
  if (t === 'lookup') return <Link2 size={11} className={cls} />;
  if (['choice', 'multi_choice', 'option_set', 'select'].includes(t)) return <List size={11} className={cls} />;
  if (t === 'textarea') return <FileText size={11} className={cls} />;
  return <TypeIcon size={11} className={cls} />;
}

// ── layout primitives ────────────────────────────────────────────────────────
/** A titled, non-collapsible group of controls inside a panel tab. */
export function PropertySection({ title, children, divider = true }: {
  title?: string; children: ReactNode; divider?: boolean;
}) {
  return (
    <div className={`space-y-3 ${divider ? 'border-t border-slate-700/60 pt-3' : ''}`}>
      {title && <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>}
      {children}
    </div>
  );
}

/** Label-above-input field wrapper with optional help text + validation message. */
export function PropertyField({ label, help, error, tooltip, htmlFor, children }: {
  label: string; help?: ReactNode; error?: ReactNode; tooltip?: string; htmlFor?: string; children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-[11px] font-medium text-slate-300 truncate" title={tooltip ?? label}>
        {label}
      </label>
      {children}
      {help && !error && <PropertyHelpText>{help}</PropertyHelpText>}
      {error && <PropertyValidationMessage>{error}</PropertyValidationMessage>}
    </div>
  );
}

export function PropertyHelpText({ children }: { children: ReactNode }) {
  return <p className="text-[10px] leading-snug text-slate-500">{children}</p>;
}

export function PropertyValidationMessage({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1 text-[10px] leading-snug text-amber-400">
      <AlertCircle size={11} className="mt-px shrink-0" /> <span>{children}</span>
    </p>
  );
}

// ── inputs ───────────────────────────────────────────────────────────────────
export function PropertySelect({ value, onChange, children, placeholder, title, invalid, disabled }: {
  value: string; onChange: ChangeEventHandler<HTMLSelectElement>; children: ReactNode;
  placeholder?: string; title?: string; invalid?: boolean; disabled?: boolean;
}) {
  return (
    <FilterSelect
      value={value} onChange={onChange} placeholder={placeholder} title={title} disabled={disabled}
      className={`${propControlCls} ${invalid ? '!border-amber-500/70' : ''}`}
    >
      {children}
    </FilterSelect>
  );
}

export function PropertyTextInput({ value, onChange, placeholder, title }: {
  value: string; onChange: (v: string) => void; placeholder?: string; title?: string;
}) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} title={title ?? value}
      className={propControlCls} />
  );
}

export function PropertyNumberInput({ value, onChange, min, max, step, placeholder }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; placeholder?: string;
}) {
  return (
    <input type="number" value={value} min={min} max={max} step={step} placeholder={placeholder}
      onChange={(e) => onChange(Number(e.target.value))} className={propControlCls} />
  );
}

export function PropertyToggle({ label, checked, onChange, help }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; help?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center justify-between gap-2 py-0.5 cursor-pointer">
        <span className="text-[12px] text-slate-300 truncate" title={label}>{label}</span>
        <button type="button" onClick={() => onChange(!checked)}
          className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${checked ? 'bg-blue-500' : 'bg-slate-600'}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </label>
      {help && <PropertyHelpText>{help}</PropertyHelpText>}
    </div>
  );
}

// ── field picker with friendly labels (RelatedFieldOption) ────────────────────
/**
 * Searchable text for a field option. The option's visible content is a custom
 * component, which FilterSelect can't read for filtering — so we hand it every
 * sensible token (friendly label, logical/physical/schema names, type, entity)
 * via the option's `data-search` prop. Without this, search matches nothing.
 */
export function fieldSearchText(field: FieldDefinition, entityLabel?: string): string {
  return [
    field.display_name,
    field.logical_name,
    field.physical_column_name,
    field.lookup_entity?.primary_field_name,
    field.description ?? '',
    fieldTypeLabel(field),
    fieldTypeNameOf(field),
    entityLabel ?? '',
  ].filter(Boolean).join(' ');
}

/** One option row: field name + an "Entity · Type" subtitle and a type icon. */
export function RelatedFieldOption({ field, entityLabel }: { field: FieldDefinition; entityLabel?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      <FieldTypeIcon f={field} />
      <span className="truncate">{field.display_name}</span>
      <span className="text-slate-500 text-[10px] whitespace-nowrap">
        {entityLabel ? `${entityLabel} · ` : ''}{fieldTypeLabel(field)}
      </span>
    </span>
  );
}

/**
 * Full-width, searchable field dropdown that renders friendly labels (name +
 * entity · type). Long selected values ellipsize; the full label shows on hover.
 */
export function FieldSelect({ fields, value, onChange, placeholder = 'Select a field', entityLabel, invalid, includeNone, noneLabel = '— None —' }: {
  fields: FieldDefinition[];
  value: string | undefined;
  onChange: (col: string) => void;
  placeholder?: string;
  entityLabel?: string;
  invalid?: boolean;
  /** Show a leading "— None —" option (for optional bindings like Category). */
  includeNone?: boolean;
  noneLabel?: string;
}) {
  const selected = fields.find((f) => f.physical_column_name === value);
  const title = selected
    ? `${selected.display_name} — ${entityLabel ? `${entityLabel} · ` : ''}${fieldTypeLabel(selected)}`
    : placeholder;
  return (
    <PropertySelect value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      placeholder={includeNone ? noneLabel : placeholder} title={title} invalid={invalid}>
      <option value="">{includeNone ? noneLabel : placeholder}</option>
      {fields.map((f) => (
        <option key={f.field_definition_id} value={f.physical_column_name} data-search={fieldSearchText(f, entityLabel)}>
          <RelatedFieldOption field={f} entityLabel={entityLabel} />
        </option>
      ))}
    </PropertySelect>
  );
}

// ── measure helpers (shared by chart + KPI measure controls) ──────────────────
import type { AggFn } from '../types/dashboard';

export const MEASURE_TYPES: { value: AggFn; label: string }[] = [
  { value: 'count', label: 'Count' },
  { value: 'count_distinct', label: 'Count Distinct' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
];

/** Fields allowed as the measure field for a given aggregation. */
export function allowedMeasureFields(fn: AggFn, fields: FieldDefinition[]): FieldDefinition[] {
  switch (fn) {
    case 'count': return [];
    case 'count_distinct': return fields;                                  // text, lookup, choice, number, date — any
    case 'sum':
    case 'avg': return fields.filter(isNumericField);                      // numeric / currency only
    case 'min':
    case 'max': return fields.filter((f) => isNumericField(f) || isDateTypeField(f)); // numeric / currency / date
    default: return fields;
  }
}

/** Human note describing which field types an aggregation accepts. */
export function measureFieldHint(fn: AggFn): string {
  switch (fn) {
    case 'count_distinct': return 'Required. Counts unique values — text, choice, lookup, number or date.';
    case 'sum': return 'Required. Sum works on number, decimal, money and currency fields only.';
    case 'avg': return 'Required. Average works on numeric and currency fields only.';
    case 'min':
    case 'max': return 'Required. Works on numeric, currency and date fields.';
    default: return '';
  }
}

/** Validation message for a chosen (fn, field), or null when valid. */
export function measureFieldError(fn: AggFn, field: string | undefined, fields: FieldDefinition[]): string | null {
  if (fn === 'count') return null;
  if (!field || field === '*') return 'Select a measure field.';
  const f = fields.find((x) => x.physical_column_name === field);
  if (!f) return null; // field not loaded yet — don't flag prematurely
  if ((fn === 'sum' || fn === 'avg') && !isNumericField(f)) return 'This aggregation requires a numeric or currency field.';
  if ((fn === 'min' || fn === 'max') && !isNumericField(f) && !isDateTypeField(f)) return 'Min/Max require a numeric, currency or date field.';
  return null;
}
