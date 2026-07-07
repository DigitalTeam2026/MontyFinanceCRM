// Shared, field-type-aware value input for every condition builder in the system
// (business rules, approval processes, data policies, digital rules, …).
//
// Given the FieldDefinition of the column being compared, it renders the correct
// editor for the value:
//   • lookup        → searchable dropdown of the target records (labels, not IDs)
//   • choice / optionset → dropdown of the configured choices
//   • boolean       → Yes / No dropdown
//   • statecode     → dropdown of the entity's states
//   • statusreason  → dropdown of the entity's status reasons
//   • date/datetime → native date pickers
//   • number/etc.   → numeric input
//   • everything else → text input
//
// Lookup options are resolved WITHOUT hardcoded per-table maps: the target PK is
// read from entity_definition.primary_key_column (per the lookup-pk-convention),
// the label comes from primary_field_name with lookupLabel fallbacks, and the
// soft-delete predicate is probed via lookupSoftDelete so it works for EVERY
// entity in the system, including ones created after this file was written.

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import FilterSelect from './FilterSelect';
import { supabase } from '../../lib/supabase';
import type { FieldDefinition } from '../../types/field';
import { lookupLabelColumns, pickLookupLabel } from '../services/lookupLabel';
import {
  applySoftDeleteFilter,
  candidateSoftDeleteModes,
  isMissingColumnError,
  rememberSoftDeleteMode,
} from './lookupSoftDelete';

export interface Option {
  value: string;
  label: string;
}

export type ConditionValueVariant = 'inline' | 'boxed';

interface ConditionValueInputProps {
  /** The field/column being compared. Drives which editor is shown. */
  field?: FieldDefinition | null;
  /** Field type name; falls back to field.field_type.name when omitted. */
  fieldTypeName?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** `inline` = borderless (rule builder rows); `boxed` = bordered (panels). */
  variant?: ConditionValueVariant;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Static PK overrides for legacy tables whose primary_key_column may be unset.
const PK_OVERRIDES: Record<string, string> = {
  product_family: 'family_id',
  line_of_business: 'lob_id',
  crm_user: 'user_id',
  security_role: 'role_id',
  crm_source: 'source_id',
  marketing_email: 'email_id',
};

function cls(variant: ConditionValueVariant, kind: 'select' | 'input'): string {
  if (variant === 'boxed') {
    return 'w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100' +
      (kind === 'select' ? ' appearance-none' : '');
  }
  // inline (borderless)
  return kind === 'select'
    ? 'flex-1 min-w-0 appearance-none text-xs text-slate-700 bg-transparent border-0 focus:outline-none pr-4'
    : 'flex-1 min-w-0 text-xs text-slate-700 bg-transparent border-0 focus:outline-none placeholder:text-slate-300';
}

export default function ConditionValueInput({
  field,
  fieldTypeName,
  value,
  onChange,
  disabled,
  placeholder = 'Value…',
  variant = 'inline',
}: ConditionValueInputProps) {
  const typeName = fieldTypeName ?? field?.field_type?.name ?? 'text';
  const cfg = field?.config_json as Record<string, unknown> | null;
  const isStatecodeField = !!cfg?.is_statecode_field;
  const isStatusreasonField = !!cfg?.is_statusreason_field;
  const isChoice = typeName === 'choice' || typeName === 'multi_choice' || typeName === 'optionset';
  const isLookup = typeName === 'lookup';
  const isBool = typeName === 'boolean';

  const inlineChoices: Option[] = Array.isArray(cfg?.choices) ? (cfg!.choices as Option[]) : [];
  const optionSetName = (cfg?.option_set_name as string | undefined) ?? undefined;

  // Boolean editor shows "Yes" by default (value || 'true' below), but that
  // default lives only in the DOM until the user changes the dropdown — so a
  // condition left untouched was saved with value = null while visibly reading
  // "Yes". Commit the displayed default to state so what's shown is what's saved.
  useEffect(() => {
    if (isBool && value !== 'true' && value !== 'false') onChange('true');
  }, [isBool, value]);

  const [statecodeOptions, setStatecodeOptions] = useState<Option[]>([]);
  const [statusreasonOptions, setStatusreasonOptions] = useState<Option[]>([]);
  const [optionSetOptions, setOptionSetOptions] = useState<Option[]>([]);
  const [lookupOptions, setLookupOptions] = useState<Option[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Choice fields store either inline choices (config_json.choices) or a named
  // option set (config_json.option_set_name). Load the latter from the option-set
  // tables so the value editor shows labels, not the raw stored code.
  const choices: Option[] = inlineChoices.length > 0 ? inlineChoices : optionSetOptions;

  useEffect(() => {
    if (!field) return;
    if (isStatecodeField) {
      supabase
        .from('statecode_definition')
        .select('state_value, display_label')
        .eq('entity_definition_id', field.entity_definition_id)
        .order('sort_order')
        .then(({ data }) =>
          setStatecodeOptions((data ?? []).map((r) => ({ value: String(r.state_value), label: r.display_label }))),
        );
    }
    if (isStatusreasonField) {
      supabase
        .from('status_reason_definition')
        .select('reason_value, display_label')
        .eq('entity_definition_id', field.entity_definition_id)
        .order('sort_order')
        .then(({ data }) =>
          setStatusreasonOptions((data ?? []).map((r) => ({ value: String(r.reason_value), label: r.display_label }))),
        );
    }
  }, [field?.field_definition_id, isStatecodeField, isStatusreasonField]);

  useEffect(() => {
    let cancelled = false;
    if (!isChoice || inlineChoices.length > 0 || !optionSetName) {
      setOptionSetOptions([]);
      return;
    }
    (async () => {
      const { data: os } = await supabase
        .from('option_set')
        .select('option_set_id')
        .eq('name', optionSetName)
        .maybeSingle();
      if (cancelled || !os) return;
      // Resolve labels regardless of is_active so codes never leak.
      const { data } = await supabase
        .from('option_set_value')
        .select('value, display_label')
        .eq('option_set_id', os.option_set_id)
        .order('sort_order');
      if (cancelled) return;
      setOptionSetOptions((data ?? []).map((r: { value: string | number; display_label: string }) => ({ value: String(r.value), label: r.display_label })));
    })();
    return () => { cancelled = true; };
  }, [isChoice, optionSetName, inlineChoices.length]);

  useEffect(() => {
    let cancelled = false;
    if (!isLookup || !field?.lookup_entity_id) {
      setLookupOptions([]);
      return;
    }
    setLookupLoading(true);
    (async () => {
      // Resolve the target table, label column and PK authoritatively from
      // metadata — never guess `${table}_id` (breaks for crm_-prefixed tables).
      const { data: ent } = await supabase
        .from('entity_definition')
        .select('physical_table_name, primary_field_name, primary_key_column')
        .eq('entity_definition_id', field.lookup_entity_id)
        .maybeSingle();
      if (cancelled) return;
      if (!ent?.physical_table_name) {
        setLookupOptions([]);
        setLookupLoading(false);
        return;
      }
      const table = ent.physical_table_name as string;
      const pkCol =
        (ent.primary_key_column as string | null) ??
        PK_OVERRIDES[table] ??
        `${table.replace(/^crm_/, '')}_id`;
      const labelCol = (ent.primary_field_name as string | null) ?? 'name';
      const labelCols = lookupLabelColumns(labelCol, table);
      const selectCols = [...new Set([pkCol, ...labelCols])].join(', ');

      // Probe soft-delete modes until one works, then cache it for the table.
      let rows: Record<string, unknown>[] | null = null;
      for (const mode of candidateSoftDeleteModes(table)) {
        let q = supabase.from(table).select(selectCols).order(labelCol).limit(200);
        q = applySoftDeleteFilter(q, mode);
        const { data, error } = await q;
        if (!error) {
          rememberSoftDeleteMode(table, mode);
          rows = (data ?? []) as unknown as Record<string, unknown>[];
          break;
        }
        if (!isMissingColumnError(error)) break; // a non-column error won't be fixed by another mode
      }
      if (cancelled) return;
      setLookupOptions(
        (rows ?? []).map((r) => ({
          value: String(r[pkCol] ?? ''),
          label: pickLookupLabel(r, labelCol, labelCols.slice(1)) || String(r[pkCol] ?? ''),
        })),
      );
      setLookupLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [field?.field_definition_id, field?.lookup_entity_id, isLookup]);

  const selectCls = cls(variant, 'select');
  const inputCls = cls(variant, 'input');
  const wrap = variant === 'boxed' ? 'relative w-full' : 'relative flex-1 min-w-0';

  if (isBool) {
    return (
      <div className={wrap}>
        <FilterSelect value={value || 'true'} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={selectCls}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </FilterSelect>
      </div>
    );
  }

  if (isStatecodeField && statecodeOptions.length > 0) {
    return (
      <SelectFromOptions wrap={wrap} cls={selectCls} value={value} onChange={onChange} disabled={disabled} options={statecodeOptions} />
    );
  }

  if (isStatusreasonField && statusreasonOptions.length > 0) {
    return (
      <SelectFromOptions wrap={wrap} cls={selectCls} value={value} onChange={onChange} disabled={disabled} options={statusreasonOptions} />
    );
  }

  if (isChoice && choices.length > 0) {
    return (
      <SelectFromOptions wrap={wrap} cls={selectCls} value={value} onChange={onChange} disabled={disabled} options={choices} />
    );
  }

  if (isLookup) {
    if (lookupLoading) {
      return (
        <div className={variant === 'boxed' ? 'w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400' : 'flex-1 min-w-0 flex items-center gap-1.5 text-xs text-slate-400'}>
          <Loader2 size={10} className="animate-spin" /> Loading…
        </div>
      );
    }
    if (lookupOptions.length > 0) {
      return (
        <SelectFromOptions wrap={wrap} cls={selectCls} value={value} onChange={onChange} disabled={disabled} options={lookupOptions} />
      );
    }
    // No options loaded — preserve any existing UUID value so saved rules don't lose it.
    const isUuid = UUID_RE.test(value);
    return (
      <div className={wrap}>
        <FilterSelect value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={selectCls}>
          <option value="">— Select —</option>
          {isUuid && value && <option value={value}>{value.slice(0, 8)}…</option>}
        </FilterSelect>
      </div>
    );
  }

  const inputType =
    ['number', 'decimal', 'currency', 'integer', 'whole_number'].includes(typeName) ? 'number'
    : typeName === 'date' ? 'date'
    : typeName === 'datetime' ? 'datetime-local'
    : 'text';

  return (
    <input
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={inputCls}
    />
  );
}

function SelectFromOptions({
  wrap,
  cls,
  value,
  onChange,
  disabled,
  options,
}: {
  wrap: string;
  cls: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: Option[];
}) {
  return (
    <div className={wrap}>
      <FilterSelect value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={cls}>
        <option value="">— Select —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </FilterSelect>
    </div>
  );
}
