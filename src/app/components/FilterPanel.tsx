import { uuid } from '../../lib/uuid';
import FilterSelect from './FilterSelect';
import { useState, useEffect } from 'react';
import {
  X, Plus, SlidersHorizontal, Save, Trash2, BookmarkCheck, Loader2, Search, Filter } from 'lucide-react';
import type { AppEntity } from '../types';
import { ENTITY_DEFINITION_ID } from '../types';
import type { ActiveFilter, FilterOperator, SavedFilter } from '../services/listService';
import {
  fetchSavedFilters,
  saveFilter,
  deleteSavedFilter,
} from '../services/listService';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { resolveStateCodeLabel, resolveStatusReasonLabel } from '../services/displayResolver';
import { supabase } from '../../lib/supabase';

interface FilterPanelProps {
  entity: AppEntity;
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  onClose: () => void;
  userId?: string;
  entityDefinitionId?: string | null;
}

type FieldType = 'text' | 'select' | 'date' | 'number' | 'boolean' | 'lookup';

interface FilterableField {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  lookupTable?: string;
  lookupLabelColumn?: string;
  lookupPkColumn?: string;
}

const OPERATORS_BY_TYPE: Record<FieldType, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: 'contains',     label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'eq',           label: 'equals' },
    { value: 'neq',          label: 'not equals' },
    { value: 'starts_with',  label: 'starts with' },
    { value: 'is_empty',     label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  select: [
    { value: 'eq',  label: 'is' },
    { value: 'neq', label: 'is not' },
  ],
  date: [
    { value: 'last_7_days',  label: 'last 7 days' },
    { value: 'last_30_days', label: 'last 30 days' },
    { value: 'last_90_days', label: 'last 90 days' },
    { value: 'this_month',   label: 'this month' },
    { value: 'this_year',    label: 'this year' },
    { value: 'eq',           label: 'on date' },
    { value: 'gt',           label: 'after' },
    { value: 'lt',           label: 'before' },
    { value: 'gte',          label: 'on or after' },
    { value: 'lte',          label: 'on or before' },
  ],
  number: [
    { value: 'eq',  label: 'equals' },
    { value: 'neq', label: 'not equals' },
    { value: 'gt',  label: 'greater than' },
    { value: 'gte', label: 'at least' },
    { value: 'lt',  label: 'less than' },
    { value: 'lte', label: 'at most' },
  ],
  boolean: [
    { value: 'eq', label: 'is' },
  ],
  lookup: [
    { value: 'eq',           label: 'is' },
    { value: 'neq',          label: 'is not' },
    { value: 'is_empty',     label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
};

const NO_VALUE_OPERATORS: FilterOperator[] = ['is_empty', 'is_not_empty', 'last_7_days', 'last_30_days', 'last_90_days', 'this_month', 'this_year'];

const SKIP_FILTER_COLUMNS = new Set([
  'deleted_at', 'is_deleted', 'created_by', 'modified_by',
]);

// A condition sourced from a saved view carries the *logical* field name
// (statecode / statusreason), but buildFilterableFields keys its options by the
// *physical* column (state_code / status_reason). Alias the two so a chip's value
// resolves to its label ("Active") regardless of which surface created the filter.
const LOGICAL_STATUS_ALIAS: Record<string, string> = {
  statecode: 'state_code',
  statusreason: 'status_reason',
};

function defaultOperator(type: FieldType): FilterOperator {
  return OPERATORS_BY_TYPE[type][0].value;
}

function operatorLabel(op: FilterOperator): string {
  for (const ops of Object.values(OPERATORS_BY_TYPE)) {
    const found = ops.find((o) => o.value === op);
    if (found) return found.label;
  }
  return op;
}

function mapFieldTypeToFilterType(typeName: string): FieldType {
  const t = typeName.toLowerCase();
  if (t === 'boolean' || t === 'twooptions' || t === 'two_options') return 'boolean';
  if (t === 'optionset' || t === 'option_set' || t === 'choice' || t === 'picklist') return 'select';
  if (t === 'lookup') return 'lookup';
  if (t === 'date' || t === 'datetime') return 'date';
  if (t === 'number' || t === 'integer' || t === 'decimal' || t === 'currency' || t === 'whole_number') return 'number';
  return 'text';
}

async function loadStatecodeOptions(entityDefId: string): Promise<{ value: string; label: string }[]> {
  const { data } = await supabase
    .from('statecode_definition')
    .select('state_value, display_label')
    .eq('entity_definition_id', entityDefId)
    .order('sort_order');
  return (data ?? []).map((r) => ({ value: String(r.state_value), label: r.display_label }));
}

async function loadStatusReasonOptions(entityDefId: string): Promise<{ value: string; label: string }[]> {
  // Resolve labels regardless of is_active — some seeds (lead/opportunity) inserted
  // reason rows without setting is_active, which would otherwise leave the map empty
  // and leak raw codes (1/2/3). Mirrors the grid resolver in listService.ts.
  const { data } = await supabase
    .from('status_reason_definition')
    .select('reason_value, display_label')
    .eq('entity_definition_id', entityDefId)
    .order('sort_order');
  return (data ?? []).map((r) => ({ value: String(r.reason_value), label: r.display_label }));
}

async function loadOptionSetOptions(osName: string): Promise<{ value: string; label: string }[]> {
  const { data: os } = await supabase
    .from('option_set')
    .select('option_set_id')
    .eq('name', osName)
    .maybeSingle();
  if (!os) return [];
  // Resolve labels regardless of is_active so option values seeded without an
  // is_active flag still map to their labels instead of leaking the raw code.
  const { data } = await supabase
    .from('option_set_value')
    .select('value, display_label')
    .eq('option_set_id', os.option_set_id)
    .order('sort_order');
  return (data ?? []).map((r) => ({ value: r.value, label: r.display_label }));
}

async function buildFilterableFields(entityDefId: string): Promise<FilterableField[]> {
  const allFields = await fetchFieldsForEntity(entityDefId);

  const fields: FilterableField[] = [];
  const optionSetPromises: { index: number; osName: string }[] = [];

  for (const f of allFields) {
    if (!f.is_active || f.deleted_at) continue;
    if (!f.is_filterable && f.physical_column_name !== 'state_code' && f.physical_column_name !== 'status_reason') continue;
    if (SKIP_FILTER_COLUMNS.has(f.physical_column_name)) continue;

    const typeName = f.field_type?.name ?? 'text';
    if (typeName === 'calculated' || typeName === 'autonumber' || typeName === 'rollup') continue;

    const phys = f.physical_column_name;

    if (phys === 'state_code') {
      const opts = await loadStatecodeOptions(entityDefId);
      fields.push({ key: 'state_code', label: f.display_name || 'Status', type: 'select', options: opts });
      continue;
    }

    if (phys === 'status_reason') {
      const opts = await loadStatusReasonOptions(entityDefId);
      fields.push({ key: 'status_reason', label: f.display_name || 'Status Reason', type: 'select', options: opts });
      continue;
    }

    const filterType = mapFieldTypeToFilterType(typeName);

    if (filterType === 'select') {
      const cfg = f.config_json as Record<string, unknown> | null;
      const osName = (cfg?.option_set_name as string) ?? null;
      if (osName) {
        const index = fields.length;
        fields.push({ key: phys, label: f.display_name, type: 'select', options: [] });
        optionSetPromises.push({ index, osName });
      } else {
        const choices = (cfg?.choices as { value: string; label: string }[]) ?? [];
        fields.push({ key: phys, label: f.display_name, type: 'select', options: choices.map((c) => ({ value: c.value, label: c.label })) });
      }
      continue;
    }

    if (filterType === 'boolean') {
      fields.push({
        key: phys,
        label: f.display_name,
        type: 'boolean',
        options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }],
      });
      continue;
    }

    if (filterType === 'lookup' && f.lookup_entity) {
      const table = f.lookup_entity.physical_table_name;
      const labelCol = f.lookup_entity.primary_field_name || 'name';
      const pkOverrides: Record<string, string> = {
        crm_user: 'user_id',
        product_family: 'family_id',
      };
      // Prefer the real PK from metadata; the `${table}_id` guess breaks on
      // crm_-prefixed tables (e.g. crm_leadsource → leadsource_id, not crm_leadsource_id).
      const pkCol = f.lookup_entity.primary_key_column
        ?? pkOverrides[table] ?? `${table.replace(/^crm_/, '')}_id`;
      fields.push({
        key: phys,
        label: f.display_name,
        type: 'lookup',
        lookupTable: table,
        lookupLabelColumn: labelCol,
        lookupPkColumn: pkCol,
      });
      continue;
    }

    fields.push({ key: phys, label: f.display_name, type: filterType });
  }

  const osResults = await Promise.all(
    optionSetPromises.map(({ osName }) => loadOptionSetOptions(osName))
  );
  for (let i = 0; i < optionSetPromises.length; i++) {
    fields[optionSetPromises[i].index].options = osResults[i];
  }

  return fields;
}

const lookupOptionsCache = new Map<string, { value: string; label: string }[]>();

async function loadLookupOptions(
  table: string,
  labelCol: string,
  pkCol: string,
): Promise<{ value: string; label: string }[]> {
  const cacheKey = `${table}:${labelCol}:${pkCol}`;
  const cached = lookupOptionsCache.get(cacheKey);
  if (cached) return cached;

  const deletedAtTables = new Set(['industry', 'country', 'product', 'product_family', 'crm_user', 'business_unit', 'security_role', 'team']);
  const noSoftDelete = new Set(['currency', 'organization']);

  let q = supabase.from(table).select(`${pkCol}, ${labelCol}`).order(labelCol);

  if (deletedAtTables.has(table)) {
    q = q.is('deleted_at', null);
  } else if (!noSoftDelete.has(table)) {
    q = q.eq('is_deleted', false);
  }

  const stateCodeTables = new Set(['industry', 'country', 'product', 'product_family']);
  if (stateCodeTables.has(table)) {
    q = q.eq('state_code', 1);
  }
  if (table === 'crm_user') {
    q = q.eq('is_active', true);
  }

  if (table === 'crm_user') {
    q = supabase.from(table).select(`${pkCol}, ${labelCol}, email`).is('deleted_at', null).eq('is_active', true).order('email');
  }

  const { data } = await q.limit(500);
  const opts = ((data ?? []) as unknown as Record<string, unknown>[]).map((r: Record<string, unknown>) => ({
    value: String(r[pkCol] ?? ''),
    label: String(r[labelCol] ?? '') || String((r as Record<string, unknown>).email ?? '') || String(r[pkCol] ?? ''),
  })).filter((o) => o.value && o.label);

  lookupOptionsCache.set(cacheKey, opts);
  return opts;
}

function LookupFilterInput({
  field,
  value,
  onChange,
}: {
  field: FilterableField;
  value: string;
  onChange: (value: string) => void;
}) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!field.lookupTable || !field.lookupLabelColumn || !field.lookupPkColumn) return;
    setLoading(true);
    loadLookupOptions(field.lookupTable, field.lookupLabelColumn, field.lookupPkColumn)
      .then((opts) => { setOptions(opts); setLoading(false); })
      .catch(() => setLoading(false));
  }, [field.lookupTable, field.lookupLabelColumn, field.lookupPkColumn]);

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const selectedLabel = options.find((o) => o.value === value)?.label;

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-slate-400">
        <Loader2 size={10} className="animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={selectedLabel ? `Selected: ${selectedLabel}` : `Search ${field.label}...`}
          className="w-full text-[11px] border border-slate-200 rounded-md pl-6 pr-2 py-1.5 text-slate-700 placeholder-slate-400 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-md bg-white">
        {filtered.length === 0 ? (
          <p className="px-2 py-2 text-[10px] text-slate-400 text-center">No results</p>
        ) : (
          filtered.slice(0, 100).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setSearch(''); }}
              className={`w-full text-left px-2 py-1.5 text-[11px] hover:bg-blue-50 transition truncate ${
                o.value === value ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'
              }`}
            >
              {o.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

interface DraftCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

export default function FilterPanel({ entity, filters, onFiltersChange, onClose, userId, entityDefinitionId: entityDefIdProp }: FilterPanelProps) {
  const [fields, setFields] = useState<FilterableField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftCondition[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTab, setSavedTab] = useState<'active' | 'saved'>('active');
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all');
  // Labels resolved from the DB for applied conditions whose value can't be
  // resolved from local field options (e.g. custom entities or status columns).
  const [extraLabels, setExtraLabels] = useState<Record<string, string>>({});
  const resolverEntityDefId = ENTITY_DEFINITION_ID[entity] ?? entityDefIdProp ?? null;

  useEffect(() => {
    let cancelled = false;
    setFieldsLoading(true);
    const entityDefId = ENTITY_DEFINITION_ID[entity] ?? entityDefIdProp ?? null;
    if (entityDefId) {
      buildFilterableFields(entityDefId).then((f) => {
        if (!cancelled) { setFields(f); setFieldsLoading(false); }
      }).catch(() => {
        if (!cancelled) { setFields([]); setFieldsLoading(false); }
      });
    } else {
      setFields([]);
      setFieldsLoading(false);
    }
    return () => { cancelled = true; };
  }, [entity, entityDefIdProp]);

  // Auto-add one empty condition when fields load and there are no existing filters
  useEffect(() => {
    if (!fieldsLoading && fields.length > 0 && filters.length === 0 && drafts.length === 0) {
      const field = fields[0];
      setDrafts([{ id: uuid(), field: field.key, operator: defaultOperator(field.type), value: '' }]);
    }
  }, [fieldsLoading, fields.length]);

  useEffect(() => {
    if (userId) {
      fetchSavedFilters(entity).then(setSavedFilters);
    }
  }, [entity, userId]);

  const addDraft = () => {
    if (fields.length === 0) return;
    const field = fields[0];
    setDrafts((d) => [
      ...d,
      { id: uuid(), field: field.key, operator: defaultOperator(field.type), value: '' },
    ]);
  };

  const updateDraft = (id: string, changes: Partial<DraftCondition>) => {
    setDrafts((d) => d.map((dr) => dr.id === id ? { ...dr, ...changes } : dr));
  };

  const removeDraft = (id: string) => {
    setDrafts((d) => d.filter((dr) => dr.id !== id));
  };

  const getFieldMeta = (key: string): FilterableField =>
    fields.find((f) => f.key === key) ?? { key, label: key, type: 'text' };

  const applyDrafts = () => {
    const valid = drafts.filter((d) => {
      const noVal = NO_VALUE_OPERATORS.includes(d.operator);
      return noVal || d.value.trim() !== '';
    });
    if (valid.length === 0) return;
    const newFilters: ActiveFilter[] = valid.map((d) => ({
      id: d.id,
      field: d.field,
      label: getFieldMeta(d.field).label,
      operator: d.operator,
      value: d.value,
    }));
    onFiltersChange([...filters, ...newFilters]);
    setDrafts([]);
  };

  const removeActive = (id: string) => {
    onFiltersChange(filters.filter((f) => f.id !== id));
  };

  const clearAll = () => onFiltersChange([]);

  const handleSave = async () => {
    if (!saveName.trim() || !userId || filters.length === 0) return;
    setSaving(true);
    const result = await saveFilter(entity, saveName.trim(), filters, userId);
    if (result) setSavedFilters((prev) => [...prev, result]);
    setSaveName('');
    setShowSaveInput(false);
    setSaving(false);
  };

  const loadSaved = (sf: SavedFilter) => {
    onFiltersChange(sf.conditions.map((c) => ({ ...c, id: uuid() })));
    setSavedTab('active');
  };

  const handleDeleteSaved = async (id: string) => {
    await deleteSavedFilter(id);
    setSavedFilters((prev) => prev.filter((sf) => sf.id !== id));
  };

  const getDisplayValue = (field: string, value: string): string => {
    const normField = LOGICAL_STATUS_ALIAS[field] ?? field;
    const meta = getFieldMeta(normField);
    if (meta.options) {
      const opt = meta.options.find((o) => o.value === value);
      if (opt) return opt.label;
    }
    if (meta.type === 'lookup' && meta.lookupTable && meta.lookupLabelColumn && meta.lookupPkColumn) {
      const cached = lookupOptionsCache.get(`${meta.lookupTable}:${meta.lookupLabelColumn}:${meta.lookupPkColumn}`);
      if (cached) {
        const opt = cached.find((o) => o.value === value);
        if (opt) return opt.label;
      }
    }
    // DB-resolved fallback for status columns whose options aren't in `fields`.
    const resolved = extraLabels[`${field}:${value}`];
    if (resolved) return resolved;
    return value;
  };

  // Resolve labels for applied status conditions that local options can't cover
  // (custom entities, or a saved/column filter keyed differently than `fields`),
  // so chips never show a raw code like "1" instead of "Active".
  useEffect(() => {
    if (!resolverEntityDefId) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const f of filters) {
        if (!f.value) continue;
        const key = `${f.field}:${f.value}`;
        if (extraLabels[key]) continue;
        const normField = LOGICAL_STATUS_ALIAS[f.field] ?? f.field;
        const meta = getFieldMeta(normField);
        if (meta.options?.some((o) => o.value === f.value)) continue;
        let label: string | null = null;
        if (normField === 'state_code') {
          label = await resolveStateCodeLabel(resolverEntityDefId, f.value);
        } else if (normField === 'status_reason') {
          label = await resolveStatusReasonLabel(resolverEntityDefId, f.value);
        }
        if (label) updates[key] = label;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setExtraLabels((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, fields, resolverEntityDefId]);

  const activeCount = filters.length;
  const totalConditions = filters.length + drafts.length;

  const renderValueInput = (draft: DraftCondition) => {
    const fieldMeta = getFieldMeta(draft.field);
    const noVal = NO_VALUE_OPERATORS.includes(draft.operator);
    if (noVal) return null;
    if (fieldMeta.type === 'lookup' && fieldMeta.lookupTable) {
      return (
        <LookupFilterInput
          field={fieldMeta}
          value={draft.value}
          onChange={(v) => updateDraft(draft.id, { value: v })}
        />
      );
    }
    if ((fieldMeta.type === 'select' || fieldMeta.type === 'boolean') && fieldMeta.options) {
      return (
        <div className="relative">
          <FilterSelect
            value={draft.value}
            onChange={(e) => updateDraft(draft.id, { value: e.target.value })}
            className="w-full text-[11px] border rounded-lg px-2.5 py-2 text-[var(--text)] bg-white focus:outline-none appearance-none pr-6 transition"
            style={{ borderColor: 'var(--border)' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
          >
            <option value="">Select value...</option>
            {fieldMeta.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </FilterSelect>
          </div>
      );
    }
    if (fieldMeta.type === 'date') {
      return (
        <input
          type="date"
          value={draft.value}
          onChange={(e) => updateDraft(draft.id, { value: e.target.value })}
          className="w-full text-[11px] border rounded-lg px-2.5 py-2 text-[var(--text)] bg-white focus:outline-none transition"
          style={{ borderColor: 'var(--border)' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
        />
      );
    }
    if (fieldMeta.type === 'number') {
      return (
        <input
          type="number"
          value={draft.value}
          onChange={(e) => updateDraft(draft.id, { value: e.target.value })}
          placeholder="Enter number..."
          className="w-full text-[11px] border rounded-lg px-2.5 py-2 text-[var(--text)] placeholder-[var(--muted)] bg-white focus:outline-none transition"
          style={{ borderColor: 'var(--border)' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
        />
      );
    }
    return (
      <input
        type="text"
        value={draft.value}
        onChange={(e) => updateDraft(draft.id, { value: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter') applyDrafts(); }}
        placeholder="Enter value..."
        className="w-full text-[11px] border rounded-lg px-2.5 py-2 text-[var(--text)] placeholder-[var(--muted)] bg-white focus:outline-none transition"
        style={{ borderColor: 'var(--border)' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
      />
    );
  };

  return (
    <div className="flex flex-col h-full shrink-0 bg-white" style={{ width: 320, borderLeft: '1px solid var(--border)' }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 py-3.5" style={{ borderBottom: '1px solid var(--surface-2)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--row-hover)' }}>
          <Filter size={13} style={{ color: 'var(--link)' }} />
        </div>
        <span className="flex-1 text-[13px] font-semibold text-[var(--text)]">Filters</span>
        {activeCount > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
            style={{ background: 'var(--link)', color: 'var(--surface)' }}>
            {activeCount}
          </span>
        )}
        {userId && (
          <button
            onClick={() => setSavedTab(savedTab === 'saved' ? 'active' : 'saved')}
            className="p-1 rounded-md transition"
            style={{ color: savedTab === 'saved' ? 'var(--link)' : 'var(--muted)' }}
            title="Saved filters"
          >
            <BookmarkCheck size={13} />
          </button>
        )}
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition"
        >
          <X size={13} />
        </button>
      </div>

      {/* ── Saved filters pane ── */}
      {savedTab === 'saved' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {savedFilters.length === 0 ? (
            <div className="text-center py-10">
              <BookmarkCheck size={24} className="mx-auto mb-2" style={{ color: 'var(--border)' }} />
              <p className="text-[12px] text-[var(--muted)]">No saved filters yet</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--border)' }}>Apply filters then save them for quick reuse</p>
            </div>
          ) : (
            savedFilters.map((sf) => (
              <div
                key={sf.id}
                className="flex items-start gap-2 p-2.5 rounded-xl cursor-pointer group transition"
                style={{ border: '1px solid var(--border)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.background = 'var(--row-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = ''; }}
                onClick={() => { loadSaved(sf); setSavedTab('active'); }}
              >
                <BookmarkCheck size={13} className="mt-0.5 shrink-0 transition" style={{ color: 'var(--muted)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[var(--text)] truncate">{sf.name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    {sf.conditions.length} condition{sf.conditions.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteSaved(sf.id); }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition text-[var(--border)] hover:text-red-500"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Active conditions pane ── */}
      {savedTab === 'active' && (
        <>
          {/* Match All / Any toggle */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--surface-2)' }}>
            <span className="text-[11px] text-[var(--muted)] font-medium">Match</span>
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {(['all', 'any'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setMatchMode(mode)}
                  className="px-3 py-1 text-[11px] font-semibold capitalize transition"
                  style={matchMode === mode
                    ? { background: 'var(--link)', color: 'var(--surface)' }
                    : { background: 'var(--surface-2)', color: 'var(--muted)' }}
                >
                  {mode}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-[var(--muted)] font-medium">of the following</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {fieldsLoading ? (
              <div className="flex items-center justify-center py-10 gap-2">
                <Loader2 size={16} className="animate-spin" style={{ color: 'var(--muted)' }} />
                <span className="text-[12px]" style={{ color: 'var(--muted)' }}>Loading fields…</span>
              </div>
            ) : (
              <div className="p-3 space-y-1.5">

                {/* Applied filter rows (read-only summary rows) */}
                {filters.map((f, i) => (
                  <div key={f.id} className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-wide shrink-0 w-10 text-right"
                      style={{ color: 'var(--muted)' }}>
                      {i === 0 ? 'WHERE' : 'AND'}
                    </span>
                    <div className="flex-1 flex items-center gap-1.5 rounded-xl px-3 py-2 min-w-0"
                      style={{ background: 'var(--row-hover)', border: '1px solid var(--surface-2)' }}>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-semibold truncate block" style={{ color: 'var(--link)' }}>{f.label}</span>
                        <span className="text-[10px] block truncate" style={{ color: 'var(--muted)' }}>
                          {operatorLabel(f.operator)}
                          {!NO_VALUE_OPERATORS.includes(f.operator) && f.value && (
                            <span className="font-semibold ml-1" style={{ color: 'var(--text)' }}>"{getDisplayValue(f.field, f.value)}"</span>
                          )}
                        </span>
                      </div>
                      <button onClick={() => removeActive(f.id)} className="shrink-0 transition hover:scale-110" style={{ color: 'var(--muted)' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}>
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Draft condition rows (editable) */}
                {drafts.map((draft, i) => {
                  const rowIndex = filters.length + i;
                  const fieldMeta = getFieldMeta(draft.field);
                  const ops = OPERATORS_BY_TYPE[fieldMeta.type] ?? OPERATORS_BY_TYPE.text;

                  return (
                    <div key={draft.id} className="flex items-start gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-wide shrink-0 w-10 text-right pt-2.5"
                        style={{ color: 'var(--muted)' }}>
                        {rowIndex === 0 ? 'WHERE' : 'AND'}
                      </span>
                      <div className="flex-1 space-y-1.5 rounded-xl p-2.5"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        {/* Field selector */}
                        <div className="relative">
                          <FilterSelect
                            value={draft.field}
                            onChange={(e) => {
                              const newField = fields.find((fd) => fd.key === e.target.value);
                              updateDraft(draft.id, {
                                field: e.target.value,
                                operator: newField ? defaultOperator(newField.type) : 'eq',
                                value: '',
                              });
                            }}
                            className="w-full text-[11px] border rounded-lg px-2.5 py-2 bg-white focus:outline-none appearance-none pr-6 transition font-medium"
                            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
                          >
                            {fields.map((fd) => (
                              <option key={fd.key} value={fd.key}>{fd.label}</option>
                            ))}
                          </FilterSelect>
                          </div>
                        {/* Operator selector */}
                        <div className="relative">
                          <FilterSelect
                            value={draft.operator}
                            onChange={(e) => updateDraft(draft.id, { operator: e.target.value as FilterOperator, value: '' })}
                            className="w-full text-[11px] border rounded-lg px-2.5 py-2 bg-white focus:outline-none appearance-none pr-6 transition"
                            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
                          >
                            {ops.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </FilterSelect>
                          </div>
                        {/* Value input */}
                        {renderValueInput(draft)}
                      </div>
                      <button
                        onClick={() => removeDraft(draft.id)}
                        className="mt-2.5 shrink-0 w-5 h-5 flex items-center justify-center rounded-md transition"
                        style={{ color: 'var(--muted)' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; (e.currentTarget as HTMLElement).style.background = ''; }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}

                {/* Empty state */}
                {totalConditions === 0 && (
                  <div className="text-center py-8">
                    <SlidersHorizontal size={22} className="mx-auto mb-2" style={{ color: 'var(--border)' }} />
                    <p className="text-[12px]" style={{ color: 'var(--muted)' }}>No conditions yet</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--border)' }}>Add a condition below to filter records</p>
                  </div>
                )}

                {/* + Add condition */}
                {fields.length > 0 && (
                  <button
                    onClick={addDraft}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition"
                    style={{
                      borderRadius: 10, border: '1.5px dashed var(--surface-2)',
                      color: 'var(--link)', background: 'var(--row-hover)', marginTop: 4,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--row-hover)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--row-hover)'; }}
                  >
                    <Plus size={13} />
                    Add condition
                  </button>
                )}

                {/* Save filter set */}
                {userId && filters.length > 0 && (
                  <div className="pt-1">
                    {showSaveInput ? (
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={saveName}
                          onChange={(e) => setSaveName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveInput(false); }}
                          placeholder="Filter set name..."
                          autoFocus
                          className="flex-1 text-[11px] border border-[var(--border)] rounded-lg px-2.5 py-2 text-[var(--text)] placeholder-[var(--muted)] focus:outline-none"
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
                        />
                        <button
                          onClick={handleSave}
                          disabled={saving || !saveName.trim()}
                          className="px-2.5 py-2 text-[11px] font-semibold text-white rounded-lg disabled:opacity-40 transition"
                          style={{ background: 'var(--link)' }}
                        >
                          {saving ? '…' : 'Save'}
                        </button>
                        <button onClick={() => setShowSaveInput(false)} className="px-2 py-2 rounded-lg text-[var(--muted)] hover:text-[var(--text)] transition">
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowSaveInput(true)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] transition rounded-lg"
                        style={{ border: '1px solid var(--border)' }}
                      >
                        <Save size={11} />
                        Save this filter set
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--surface-2)' }}>
            {totalConditions > 0 && (
              <span className="flex-1 text-[11px] font-medium truncate" style={{ color: 'var(--muted)' }}>
                {totalConditions} condition{totalConditions !== 1 ? 's' : ''}
              </span>
            )}
            {(activeCount > 0 || drafts.length > 0) && (
              <button
                onClick={() => { clearAll(); setDrafts([]); }}
                className="px-3 py-1.5 text-[12px] font-medium rounded-lg hover:bg-[var(--surface-2)] transition"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                Clear all
              </button>
            )}
            {drafts.length > 0 && (
              <button
                onClick={applyDrafts}
                className="px-3 py-1.5 text-[12px] font-semibold text-white rounded-lg transition"
                style={{ background: 'linear-gradient(135deg,var(--link),var(--link))', boxShadow: '0 4px 12px rgba(59,111,255,.25)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.08)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ''; }}
              >
                Apply filters
              </button>
            )}
            {drafts.length === 0 && totalConditions === 0 && (
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-[12px] font-medium rounded-lg hover:bg-[var(--surface-2)] transition ml-auto"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                Close
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
