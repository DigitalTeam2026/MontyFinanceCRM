import { useState, useEffect } from 'react';
import {
  X, Plus, SlidersHorizontal, Save, Trash2, BookmarkCheck, ChevronDown, Loader2, Search,
} from 'lucide-react';
import type { AppEntity } from '../types';
import { ENTITY_DEFINITION_ID } from '../types';
import type { ActiveFilter, FilterOperator, SavedFilter } from '../services/listService';
import {
  fetchSavedFilters,
  saveFilter,
  deleteSavedFilter,
} from '../services/listService';
import { fetchFieldsForEntity } from '../../services/fieldService';
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
  const { data } = await supabase
    .from('status_reason_definition')
    .select('reason_value, display_label')
    .eq('entity_definition_id', entityDefId)
    .eq('is_active', true)
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
  const { data } = await supabase
    .from('option_set_value')
    .select('value, display_label')
    .eq('option_set_id', os.option_set_id)
    .eq('is_active', true)
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
      const pkCol = pkOverrides[table] ?? `${table}_id`;
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
  const opts = (data ?? []).map((r: Record<string, unknown>) => ({
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
      setDrafts([{ id: crypto.randomUUID(), field: field.key, operator: defaultOperator(field.type), value: '' }]);
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
      { id: crypto.randomUUID(), field: field.key, operator: defaultOperator(field.type), value: '' },
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
    onFiltersChange(sf.conditions.map((c) => ({ ...c, id: crypto.randomUUID() })));
    setSavedTab('active');
  };

  const handleDeleteSaved = async (id: string) => {
    await deleteSavedFilter(id);
    setSavedFilters((prev) => prev.filter((sf) => sf.id !== id));
  };

  const getDisplayValue = (field: string, value: string): string => {
    const meta = getFieldMeta(field);
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
    return value;
  };

  const activeCount = filters.length;

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full shrink-0 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-slate-500" />
          <span className="text-[13px] font-semibold text-slate-700">Filters</span>
          {activeCount > 0 && (
            <span className="text-[10px] bg-blue-600 text-white font-semibold px-1.5 py-0.5 rounded-full leading-none">
              {activeCount}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition p-1 rounded hover:bg-slate-100">
          <X size={14} />
        </button>
      </div>

      {userId && (
        <div className="flex border-b border-slate-100">
          {(['active', 'saved'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSavedTab(tab)}
              className={`flex-1 py-2 text-[11px] font-semibold uppercase tracking-wide transition ${
                savedTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab === 'active' ? `Active${activeCount > 0 ? ` (${activeCount})` : ''}` : `Saved (${savedFilters.length})`}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {savedTab === 'active' ? (
          <div className="p-3 space-y-3">
            {filters.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Applied -- all must match (AND)</span>
                  <button onClick={clearAll} className="text-[10px] text-red-500 hover:text-red-700 font-medium transition">
                    Clear all
                  </button>
                </div>
                <div className="space-y-1.5">
                  {filters.map((f, i) => (
                    <div key={f.id} className="flex items-start gap-1.5">
                      {i > 0 && (
                        <span className="text-[9px] font-bold text-slate-400 uppercase mt-2 w-6 text-center shrink-0">AND</span>
                      )}
                      {i === 0 && <span className="w-6 shrink-0" />}
                      <div className="flex-1 flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5 min-w-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-blue-700 truncate">{f.label}</p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {operatorLabel(f.operator)}
                            {!NO_VALUE_OPERATORS.includes(f.operator) && f.value && (
                              <span className="text-slate-700 font-medium ml-1">"{getDisplayValue(f.field, f.value)}"</span>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => removeActive(f.id)}
                          className="text-slate-300 hover:text-red-500 transition shrink-0"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fieldsLoading && (
              <div className="flex items-center justify-center py-8 gap-2">
                <Loader2 size={16} className="animate-spin text-slate-400" />
                <span className="text-[12px] text-slate-500">Loading fields...</span>
              </div>
            )}

            {!fieldsLoading && drafts.length === 0 && filters.length === 0 && (
              <div className="text-center py-8">
                <SlidersHorizontal size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-[12px] text-slate-400">No filters applied</p>
                <p className="text-[11px] text-slate-300 mt-0.5">Add conditions below to filter records</p>
              </div>
            )}

            {drafts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="h-px flex-1 bg-slate-100" />
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">New conditions</span>
                  <div className="h-px flex-1 bg-slate-100" />
                </div>
                {drafts.map((draft, i) => {
                  const fieldMeta = getFieldMeta(draft.field);
                  const ops = OPERATORS_BY_TYPE[fieldMeta.type] ?? OPERATORS_BY_TYPE.text;
                  const noVal = NO_VALUE_OPERATORS.includes(draft.operator);

                  return (
                    <div key={draft.id} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
                      {(i > 0 || filters.length > 0) && (
                        <div className="flex items-center gap-1.5">
                          <div className="h-px flex-1 bg-slate-200" />
                          <span className="text-[9px] font-bold text-slate-400 uppercase">AND</span>
                          <div className="h-px flex-1 bg-slate-200" />
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <select
                            value={draft.field}
                            onChange={(e) => {
                              const newField = fields.find((f) => f.key === e.target.value);
                              updateDraft(draft.id, {
                                field: e.target.value,
                                operator: newField ? defaultOperator(newField.type) : 'eq',
                                value: '',
                              });
                            }}
                            className="w-full text-[11px] border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none pr-6"
                          >
                            {fields.map((f) => (
                              <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                          </select>
                          <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        <button
                          onClick={() => removeDraft(draft.id)}
                          className="text-slate-300 hover:text-red-500 transition p-0.5"
                        >
                          <X size={12} />
                        </button>
                      </div>

                      <div className="relative">
                        <select
                          value={draft.operator}
                          onChange={(e) => updateDraft(draft.id, { operator: e.target.value as FilterOperator, value: '' })}
                          className="w-full text-[11px] border border-slate-200 rounded-md px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none pr-6"
                        >
                          {ops.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>

                      {!noVal && (
                        <>
                          {fieldMeta.type === 'lookup' && fieldMeta.lookupTable ? (
                            <LookupFilterInput
                              field={fieldMeta}
                              value={draft.value}
                              onChange={(v) => updateDraft(draft.id, { value: v })}
                            />
                          ) : (fieldMeta.type === 'select' || fieldMeta.type === 'boolean') && fieldMeta.options ? (
                            <div className="relative">
                              <select
                                value={draft.value}
                                onChange={(e) => updateDraft(draft.id, { value: e.target.value })}
                                className="w-full text-[11px] border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none pr-6"
                              >
                                <option value="">Select value...</option>
                                {fieldMeta.options.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                              <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                          ) : fieldMeta.type === 'date' ? (
                            <input
                              type="date"
                              value={draft.value}
                              onChange={(e) => updateDraft(draft.id, { value: e.target.value })}
                              className="w-full text-[11px] border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : fieldMeta.type === 'number' ? (
                            <input
                              type="number"
                              value={draft.value}
                              onChange={(e) => updateDraft(draft.id, { value: e.target.value })}
                              placeholder="Enter number..."
                              className="w-full text-[11px] border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 placeholder-slate-400 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <input
                              type="text"
                              value={draft.value}
                              onChange={(e) => updateDraft(draft.id, { value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') applyDrafts(); }}
                              placeholder="Enter value..."
                              className="w-full text-[11px] border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 placeholder-slate-400 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!fieldsLoading && fields.length > 0 && (
              <div className="space-y-2 pt-1">
                <button
                  onClick={addDraft}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium text-slate-600 bg-slate-50 border border-dashed border-slate-300 rounded-lg hover:bg-slate-100 hover:border-slate-400 transition"
                >
                  <Plus size={13} />
                  Add condition
                </button>

                {drafts.length > 0 && (
                  <button
                    onClick={applyDrafts}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                  >
                    Apply filters
                  </button>
                )}
              </div>
            )}

            {userId && filters.length > 0 && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                {showSaveInput ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveInput(false); }}
                      placeholder="Filter set name..."
                      autoFocus
                      className="flex-1 text-[11px] border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleSave}
                      disabled={saving || !saveName.trim()}
                      className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 transition"
                    >
                      {saving ? '...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setShowSaveInput(false)}
                      className="px-2 py-1.5 text-slate-400 hover:text-slate-600 transition"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSaveInput(true)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition"
                  >
                    <Save size={11} />
                    Save this filter set
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {savedFilters.length === 0 ? (
              <div className="text-center py-10">
                <BookmarkCheck size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-[12px] text-slate-400">No saved filters yet</p>
                <p className="text-[11px] text-slate-300 mt-0.5">Apply filters then save them for quick reuse</p>
              </div>
            ) : (
              savedFilters.map((sf) => (
                <div
                  key={sf.id}
                  className="flex items-start gap-2 p-2.5 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition group cursor-pointer"
                  onClick={() => loadSaved(sf)}
                >
                  <BookmarkCheck size={13} className="text-slate-400 group-hover:text-blue-500 transition mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-slate-700 group-hover:text-blue-700 transition truncate">{sf.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {sf.conditions.length} condition{sf.conditions.length !== 1 ? 's' : ''}
                    </p>
                    <div className="mt-1 space-y-0.5">
                      {sf.conditions.slice(0, 3).map((c, i) => (
                        <p key={c.id} className="text-[10px] text-slate-500 truncate">
                          {i > 0 && <span className="text-slate-300 font-bold mr-1">AND</span>}
                          <span className="font-medium">{c.label}</span>
                          <span className="text-slate-400 mx-1">{operatorLabel(c.operator)}</span>
                          {!NO_VALUE_OPERATORS.includes(c.operator) && c.value && (
                            <span className="font-medium">"{c.value}"</span>
                          )}
                        </p>
                      ))}
                      {sf.conditions.length > 3 && (
                        <p className="text-[10px] text-slate-400">+{sf.conditions.length - 3} more</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteSaved(sf.id); }}
                    className="text-slate-300 hover:text-red-500 transition shrink-0 p-0.5 opacity-0 group-hover:opacity-100"
                    title="Delete saved filter"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
