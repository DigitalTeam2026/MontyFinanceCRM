import { uuid } from '../../lib/uuid';
import FilterSelect from './FilterSelect';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  UserCheck,
  Pencil,
  Download,
  Trash2,
  X,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Search,
  Plus,
  Share2,
} from 'lucide-react';
import type { AppEntity } from '../types';
import type { ListRow } from '../services/listService';
import { bulkUpdateRows } from '../services/listService';
import { exportSheetsToXlsx } from '../services/xlsxExport';
import { removeRecentItem, removePinnedRecord } from '../services/recentPinsService';
import { checkDeleteRules, executeDelete } from '../services/deleteService';
import { fetchFieldsForEntity } from '../../services/fieldService';
import type { FieldDefinition } from '../../types/field';
import type { ColumnState } from './ColumnCustomizer';
import { supabase } from '../../lib/supabase';
import {
  type SoftDeleteMode,
  applySoftDeleteFilter,
  candidateSoftDeleteModes,
  isMissingColumnError,
  rememberSoftDeleteMode,
  resolveSoftDeleteMode,
} from './lookupSoftDelete';
import { usePermissions } from '../context/PermissionContext';

interface BulkUser {
  id: string;
  email: string;
}

type ModalType = 'assign' | 'update' | 'delete' | null;
type OpResult = { updated?: number; deleted?: number; errors: number; message?: string } | null;

interface Props {
  entity: AppEntity;
  entityDefinitionId?: string | null;
  selected: Set<string>;
  rows: ListRow[];
  columns?: ColumnState[];
  users: BulkUser[];
  userId?: string;
  canWrite: boolean;
  canDelete: boolean;
  canAssign?: boolean;
  canExport?: boolean;
  canBulkEdit?: boolean;
  canActivate?: boolean;
  canDeactivate?: boolean;
  canShare?: boolean;
  onShare?: (recordId: string) => void;
  onClear: () => void;
  onComplete: () => void;
}

const NEVER_EDIT = new Set([
  'created_at', 'modified_at', 'deleted_at', 'created_by', 'modified_by',
  'account_number',
]);

const INPUT_BASE =
  'w-full text-[13px] text-slate-800 border border-slate-200 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition placeholder-slate-400';

/* ------------------------------------------------------------------ */
/*  Generic shared UI                                                  */
/* ------------------------------------------------------------------ */

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full mx-4 ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 rounded-t-xl">
          <h2 className="text-[14px] font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ResultBanner({ result, onClose }: { result: OpResult; onClose: () => void }) {
  if (!result) return null;
  const count = result.updated ?? result.deleted ?? 0;
  const ok = result.errors === 0;
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium ${ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
      {ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
      {ok
        ? `${count} record${count !== 1 ? 's' : ''} updated`
        : `${count} updated, ${result.errors} failed${result.message ? ` — ${result.message}` : ''}`}
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100"><X size={11} /></button>
    </div>
  );
}

function formatExportDate(val: unknown): string {
  if (!val || typeof val !== 'string') return '';
  try { return new Date(val).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return String(val); }
}

function formatExportCurrency(val: unknown, currencyCode?: string | null): string {
  if (val == null || val === '') return '';
  const num = Number(val);
  if (isNaN(num)) return '';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode ?? 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num); } catch { return String(num); }
}

async function exportToXlsx(entity: AppEntity, rows: ListRow[], ids: Set<string>, columns?: ColumnState[]) {
  const selected = rows.filter((r) => ids.has(r.id));
  if (selected.length === 0) return;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const idHeader = `${String(entity).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} ID`;

  let headers: string[];
  let dataRows: unknown[][];

  if (!columns || columns.length === 0) {
    const keys = Object.keys(selected[0]).filter((k) => k !== 'id');
    headers = [idHeader, ...keys];
    dataRows = selected.map((r) => [r.id, ...keys.map((k) => r[k] ?? '')]);
  } else {
    headers = [idHeader, ...columns.map((c) => c.labelOverride || c.label)];
    dataRows = selected.map((row) => [
      row.id,
      ...columns.map((col) => {
        const val = row[col.key];
        if (val == null || val === '') return '';
        if (typeof val === 'object' && !Array.isArray(val)) return '';
        const strVal = String(val);
        if (UUID_RE.test(strVal)) return '';
        const colType = col.type;
        if (colType === 'date') return formatExportDate(val);
        if (colType === 'currency') return formatExportCurrency(val, row.currency_code as string | null);
        if (colType === 'boolean') {
          const isTrue = val === true || val === 'true' || val === '1' || val === 1;
          const isFalse = val === false || val === 'false' || val === '0' || val === 0;
          return isTrue ? 'Yes' : isFalse ? 'No' : '';
        }
        if (colType === 'owner') return /^[0-9a-f]{8}-/i.test(strVal) ? '' : strVal.split('@')[0];
        return strVal;
      }),
    ]);
  }

  const colWidths = headers.map((h, i) => (i === 0 ? 38 : Math.max(h.length + 4, 14)));
  await exportSheetsToXlsx(
    [{ name: 'Export', rows: [headers, ...dataRows], colWidths }],
    `${entity}-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

/* ------------------------------------------------------------------ */
/*  Lookup entity resolution                                           */
/* ------------------------------------------------------------------ */

interface LookupEntityCfg {
  table: string;
  pk: string;
  labelCol: string;
}

function getLookupEntityConfig(field: FieldDefinition): LookupEntityCfg | null {
  if (field.lookup_entity?.physical_table_name) {
    const table = field.lookup_entity.physical_table_name;
    const labelCol = table === 'crm_user'
      ? 'email'
      : (field.lookup_entity.primary_field_name || 'name');
    // Prefer the real PK from metadata. The previous `${table}_id` guess produced
    // wrong names like `crm_leadsource_id` (actual PK is `leadsource_id`), which
    // 400'd every lookup query. Fall back to a prefix-stripped guess if metadata
    // is missing (the `crm_` prefix is dropped for the PK column by convention).
    const pk = field.lookup_entity.primary_key_column
      || (table === 'crm_user' ? 'user_id' : `${table.replace(/^crm_/, '')}_id`);
    return { table, pk, labelCol };
  }
  const cfg = field.config_json as Record<string, unknown> | null;
  if (cfg?.entity_table && cfg?.pk_column && cfg?.label_column) {
    return { table: cfg.entity_table as string, pk: cfg.pk_column as string, labelCol: cfg.label_column as string };
  }
  if (cfg?.lookupEntity) {
    const table = cfg.lookupEntity as string;
    const labelCol = (cfg.lookupLabelField as string) || 'name';
    const pkGuess = `${table.replace(/s$/, '')}_id`;
    return { table, pk: pkGuess, labelCol };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Option Set loader                                                  */
/* ------------------------------------------------------------------ */

interface OptionItem { value: string; label: string }

const optionSetCache: Record<string, OptionItem[]> = {};

async function loadOptionSetValues(osName: string): Promise<OptionItem[]> {
  if (optionSetCache[osName]) return optionSetCache[osName];
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
  const items = (data ?? []).map((r) => ({ value: r.value, label: r.display_label }));
  optionSetCache[osName] = items;
  return items;
}

function getOptionSetName(field: FieldDefinition): string | null {
  const cfg = field.config_json as Record<string, unknown> | null;
  return (cfg?.option_set_name as string) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Statecode / StatusReason loaders                                   */
/* ------------------------------------------------------------------ */

interface StateOption { value: string; label: string; is_active_state: boolean }
interface ReasonOption { value: string; label: string; color: string; statecodeValue: string }

const stateCache: Record<string, StateOption[]> = {};
const reasonCache: Record<string, ReasonOption[]> = {};

async function loadStatecodes(entityDefId: string): Promise<StateOption[]> {
  const key = `sc:${entityDefId}`;
  if (stateCache[key]) return stateCache[key];
  const { data } = await supabase
    .from('statecode_definition')
    .select('state_value, display_label, is_active_state')
    .eq('entity_definition_id', entityDefId)
    .order('sort_order');
  const items: StateOption[] = (data ?? []).map((r) => ({
    value: String(r.state_value),
    label: r.display_label,
    is_active_state: r.is_active_state,
  }));
  stateCache[key] = items;
  return items;
}

async function loadStatusReasons(entityDefId: string): Promise<ReasonOption[]> {
  const key = `sr:${entityDefId}`;
  if (reasonCache[key]) return reasonCache[key];
  const { data } = await supabase
    .from('status_reason_definition')
    .select('reason_value, display_label, color, statecode_definition!inner(state_value)')
    .eq('entity_definition_id', entityDefId)
    .eq('is_active', true)
    .order('sort_order');
  const items: ReasonOption[] = (data ?? []).map((r) => ({
    value: String(r.reason_value),
    label: r.display_label,
    color: r.color ?? '#6B7280',
    statecodeValue: String((r.statecode_definition as unknown as { state_value: number }).state_value),
  }));
  reasonCache[key] = items;
  return items;
}

/* ------------------------------------------------------------------ */
/*  BulkFieldInput — renders the correct control per field type        */
/* ------------------------------------------------------------------ */

function BulkFieldInput({
  field,
  value,
  onChange,
  entityDefinitionId,
  siblingValues,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  entityDefinitionId?: string;
  siblingValues?: Record<string, unknown>;
}) {
  const typeName = field.field_type?.name ?? 'text';
  const physCol = field.physical_column_name;

  /* ---- Lookup ---- */
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<{ id: string; label: string }[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupSelectedLabel, setLookupSelectedLabel] = useState('');
  const lookupRef = useRef<HTMLDivElement>(null);
  const lookupInputRef = useRef<HTMLInputElement>(null);
  const lookupDropRef = useRef<HTMLDivElement>(null);
  const [lookupDropPos, setLookupDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  /* ---- Option set / choice ---- */
  const [osOptions, setOsOptions] = useState<OptionItem[]>([]);

  /* ---- Statecode / StatusReason ---- */
  const [statecodes, setStatecodes] = useState<StateOption[]>([]);
  const [reasons, setReasons] = useState<ReasonOption[]>([]);

  useEffect(() => {
    if (!lookupOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (lookupRef.current?.contains(t) || lookupDropRef.current?.contains(t)) return;
      setLookupOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [lookupOpen]);

  const computeLookupPos = useCallback(() => {
    if (!lookupInputRef.current) return null;
    const rect = lookupInputRef.current.getBoundingClientRect();
    return { top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width };
  }, []);

  useEffect(() => {
    if (typeName !== 'lookup' || !lookupOpen) return;
    const cfg = getLookupEntityConfig(field);
    if (!cfg) return;
    const t = setTimeout(async () => {
      setLookupLoading(true);
      const buildQuery = (mode: SoftDeleteMode) => {
        let q = applySoftDeleteFilter(
          supabase.from(cfg.table).select(`${cfg.pk},${cfg.labelCol}`),
          mode,
        ).limit(20);
        if (lookupQuery.trim()) q = q.ilike(cfg.labelCol, `%${lookupQuery}%`);
        return q;
      };
      // Probe soft-delete predicates in order; the table's actual shape may not be
      // `deleted_at`. Cache the first that succeeds so we don't 400 on the next open.
      let res: { data?: unknown[] | null; error?: unknown } | null = null;
      let usedMode: SoftDeleteMode = resolveSoftDeleteMode(cfg.table);
      for (const mode of candidateSoftDeleteModes(cfg.table)) {
        res = await buildQuery(mode);
        usedMode = mode;
        if (!res.error || !isMissingColumnError(res.error)) break;
      }
      if (res && !res.error) rememberSoftDeleteMode(cfg.table, usedMode);
      setLookupResults(
        ((res?.data ?? []) as unknown as Record<string, unknown>[]).map((r: Record<string, unknown>) => ({
          id: String(r[cfg.pk] ?? ''),
          label: String(r[cfg.labelCol] ?? ''),
        }))
      );
      setLookupLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [lookupQuery, lookupOpen, typeName]);

  useEffect(() => {
    const osName = getOptionSetName(field);
    if ((typeName === 'optionset' || typeName === 'option_set' || typeName === 'choice' || typeName === 'picklist') && osName) {
      loadOptionSetValues(osName).then(setOsOptions);
    } else if (typeName === 'choice' || typeName === 'optionset' || typeName === 'option_set') {
      const choices = (field.config_json as { choices?: OptionItem[] } | null)?.choices ?? [];
      setOsOptions(choices);
    }
  }, [field.field_definition_id, typeName]);

  useEffect(() => {
    if (physCol === 'state_code' && entityDefinitionId) {
      loadStatecodes(entityDefinitionId).then(setStatecodes);
    }
    if (physCol === 'status_reason' && entityDefinitionId) {
      loadStatusReasons(entityDefinitionId).then(setReasons);
    }
  }, [physCol, entityDefinitionId]);

  /* ---- Statecode ---- */
  if (physCol === 'state_code') {
    return (
      <FilterSelect
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={INPUT_BASE}
      >
        <option value="">-- Select Status --</option>
        {statecodes.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </FilterSelect>
    );
  }

  /* ---- StatusReason ---- */
  if (physCol === 'status_reason') {
    const parentStatecode = siblingValues?.state_code;
    const filtered = parentStatecode != null
      ? reasons.filter((r) => r.statecodeValue === String(parentStatecode))
      : reasons;
    return (
      <div className="space-y-1">
        {parentStatecode == null && reasons.length > 0 && (
          <p className="text-[10px] text-amber-600">Tip: Also set Status to filter reasons by status.</p>
        )}
        <FilterSelect
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={INPUT_BASE}
        >
          <option value="">-- Select Status Reason --</option>
          {filtered.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </FilterSelect>
      </div>
    );
  }

  /* ---- Boolean ---- */
  if (typeName === 'boolean') {
    return (
      <FilterSelect
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          if (e.target.value === '') onChange(null);
          else onChange(e.target.value === 'true');
        }}
        className={INPUT_BASE}
      >
        <option value="">-- Select --</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </FilterSelect>
    );
  }

  /* ---- Choice / Option Set ---- */
  if (typeName === 'choice' || typeName === 'optionset' || typeName === 'option_set' || typeName === 'picklist') {
    return (
      <FilterSelect
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value || null)}
        className={INPUT_BASE}
      >
        <option value="">-- Select --</option>
        {osOptions.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </FilterSelect>
    );
  }

  /* ---- Lookup ---- */
  if (typeName === 'lookup') {
    const cfg = getLookupEntityConfig(field);
    if (!cfg) {
      return <input type="text" value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} className={INPUT_BASE} placeholder={field.placeholder ?? `Enter ${field.display_name}`} />;
    }
    const lookupPortal = lookupOpen && lookupDropPos ? createPortal(
      <div
        ref={lookupDropRef}
        style={{ position: 'absolute', top: lookupDropPos.top, left: lookupDropPos.left, width: lookupDropPos.width, zIndex: 9999 }}
        className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
      >
        {lookupLoading ? (
          <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-slate-400" /></div>
        ) : lookupResults.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-slate-400 text-center">No results</div>
        ) : (
          <div className="max-h-52 overflow-y-auto">
            {lookupResults.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(r.id);
                  setLookupSelectedLabel(r.label);
                  setLookupOpen(false);
                  setLookupQuery('');
                }}
                className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-blue-50 transition"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>,
      document.body,
    ) : null;

    return (
      <div className="relative" ref={lookupRef}>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={lookupInputRef}
            type="text"
            value={lookupOpen ? lookupQuery : (lookupSelectedLabel || (value ? '' : ''))}
            onChange={(e) => {
              setLookupQuery(e.target.value);
              if (!lookupOpen) { setLookupDropPos(computeLookupPos()); setLookupOpen(true); }
            }}
            onFocus={() => { setLookupDropPos(computeLookupPos()); setLookupOpen(true); setLookupQuery(''); }}
            placeholder={`Search ${field.display_name}...`}
            className={`${INPUT_BASE} pl-8`}
          />
          {(lookupSelectedLabel || value) && !lookupOpen && (
            <div className="absolute inset-0 flex items-center pl-8 pr-8 pointer-events-none">
              <span className="text-[13px] text-slate-800 truncate">{lookupSelectedLabel}</span>
            </div>
          )}
          {(lookupSelectedLabel || value) && !lookupOpen && (
            <button
              type="button"
              onClick={() => { onChange(null); setLookupSelectedLabel(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 z-10"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {lookupPortal}
      </div>
    );
  }

  /* ---- Number / Currency / Decimal / Integer ---- */
  if (typeName === 'number' || typeName === 'currency' || typeName === 'decimal' || typeName === 'integer') {
    return (
      <input
        type="number"
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={INPUT_BASE}
        min={field.min_value ?? undefined}
        max={field.max_value ?? undefined}
        placeholder={field.placeholder ?? `Enter ${field.display_name}`}
      />
    );
  }

  /* ---- Date ---- */
  if (typeName === 'date') {
    return (
      <input
        type="date"
        value={value == null ? '' : String(value).slice(0, 10)}
        onChange={(e) => onChange(e.target.value || null)}
        className={INPUT_BASE}
      />
    );
  }

  /* ---- DateTime ---- */
  if (typeName === 'datetime') {
    return (
      <input
        type="datetime-local"
        value={value == null ? '' : String(value).slice(0, 16)}
        onChange={(e) => onChange(e.target.value || null)}
        className={INPUT_BASE}
      />
    );
  }

  /* ---- Textarea ---- */
  if (typeName === 'textarea') {
    return (
      <textarea
        rows={2}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_BASE} resize-y min-h-[56px]`}
        placeholder={field.placeholder ?? `Enter ${field.display_name}`}
      />
    );
  }

  /* ---- Default: text ---- */
  return (
    <input
      type="text"
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value)}
      maxLength={field.max_length ?? undefined}
      className={INPUT_BASE}
      placeholder={field.placeholder ?? `Enter ${field.display_name}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Type badge for field selector                                      */
/* ------------------------------------------------------------------ */

const TYPE_COLORS: Record<string, string> = {
  text: 'bg-slate-100 text-slate-600',
  textarea: 'bg-slate-100 text-slate-600',
  number: 'bg-sky-50 text-sky-700',
  integer: 'bg-sky-50 text-sky-700',
  decimal: 'bg-sky-50 text-sky-700',
  currency: 'bg-emerald-50 text-emerald-700',
  boolean: 'bg-amber-50 text-amber-700',
  date: 'bg-blue-50 text-blue-700',
  datetime: 'bg-blue-50 text-blue-700',
  lookup: 'bg-teal-50 text-teal-700',
  choice: 'bg-orange-50 text-orange-700',
  optionset: 'bg-orange-50 text-orange-700',
  option_set: 'bg-orange-50 text-orange-700',
  picklist: 'bg-orange-50 text-orange-700',
};

function TypeBadge({ typeName }: { typeName: string }) {
  const cls = TYPE_COLORS[typeName] ?? 'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${cls}`}>
      {typeName === 'option_set' ? 'optionset' : typeName}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  BulkEditRow — a single field-value pair                            */
/* ------------------------------------------------------------------ */

interface UpdateRowData {
  id: string;
  fieldId: string;
  value: unknown;
}

interface DropPos { top: number; left: number; width: number }

function BulkEditRow({
  index,
  availableFields,
  selectedFieldId,
  value,
  field,
  entityDefinitionId,
  siblingValues,
  onFieldChange,
  onValueChange,
  onRemove,
  canRemove,
}: {
  index: number;
  availableFields: FieldDefinition[];
  selectedFieldId: string;
  value: unknown;
  field: FieldDefinition | undefined;
  entityDefinitionId?: string;
  siblingValues: Record<string, unknown>;
  onFieldChange: (fieldId: string) => void;
  onValueChange: (value: unknown) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [fieldSearch, setFieldSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropPos, setDropPos] = useState<DropPos | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const computePos = useCallback((): DropPos | null => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    return {
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    };
  }, []);

  const openDropdown = () => {
    setDropPos(computePos());
    setDropdownOpen(true);
    setFieldSearch('');
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || dropdownRef.current?.contains(t)) return;
      setDropdownOpen(false);
    };
    const handleScroll = () => { if (dropdownOpen) setDropPos(computePos()); };
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [dropdownOpen, computePos]);

  const filtered = availableFields.filter((f) => {
    if (!fieldSearch) return true;
    const q = fieldSearch.toLowerCase();
    return (
      f.display_name.toLowerCase().includes(q) ||
      f.physical_column_name.toLowerCase().includes(q) ||
      (f.field_type?.name ?? '').toLowerCase().includes(q)
    );
  });

  const typeName = field?.field_type?.name ?? '';

  const portalDropdown = dropdownOpen && dropPos ? createPortal(
    <div
      ref={dropdownRef}
      style={{ position: 'absolute', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
      className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
    >
      <div className="p-2 border-b border-slate-100 bg-slate-50/80">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by name, schema name, or type..."
            value={fieldSearch}
            onChange={(e) => setFieldSearch(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-[12px] bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-[12px] text-slate-400 text-center">No fields found</div>
        ) : filtered.map((f) => {
          const fType = f.field_type?.name ?? '';
          return (
            <button
              key={f.field_definition_id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onFieldChange(f.field_definition_id);
                setDropdownOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-[12px] transition flex items-center gap-2 ${
                selectedFieldId === f.field_definition_id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="font-medium truncate flex-1">{f.display_name}</span>
              <span className="text-[10px] text-slate-400 shrink-0 max-w-[120px] text-right truncate">{f.physical_column_name}</span>
              <TypeBadge typeName={fType} />
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100">
        <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
          {index + 1}
        </span>

        {/* Field selector trigger */}
        <div className="flex-1 min-w-0" ref={triggerRef}>
          <div
            className={`flex items-center justify-between w-full px-3 py-2 rounded-lg cursor-pointer transition text-[12px] ${
              field
                ? 'bg-slate-50 border border-slate-200 hover:border-slate-300'
                : 'bg-blue-50/60 border border-blue-200 hover:border-blue-300'
            }`}
            onClick={() => dropdownOpen ? setDropdownOpen(false) : openDropdown()}
          >
            {field ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-slate-800 font-semibold truncate">{field.display_name}</span>
                <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">{field.physical_column_name}</span>
              </div>
            ) : (
              <span className="text-blue-500 font-medium">Choose a field...</span>
            )}
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {typeName && <TypeBadge typeName={typeName} />}
              <ChevronDown size={13} className={`text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </div>

        {/* Remove button */}
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-0 disabled:pointer-events-none transition"
        >
          <X size={14} />
        </button>
      </div>

      {/* Value input area */}
      {field && (
        <div className="px-3 py-3 pl-11">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">New Value</label>
          <BulkFieldInput
            field={field}
            value={value}
            onChange={onValueChange}
            entityDefinitionId={entityDefinitionId}
            siblingValues={siblingValues}
          />
        </div>
      )}

      {portalDropdown}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BulkEditModal                                                      */
/* ------------------------------------------------------------------ */

function BulkEditModal({
  selectedCount,
  fields,
  fieldsLoading,
  updateRows,
  selectedFieldIds,
  entityDefinitionId,
  isReady,
  busy,
  onRowsChange,
  onSubmit,
  onClose,
}: {
  selectedCount: number;
  fields: FieldDefinition[];
  fieldsLoading: boolean;
  updateRows: UpdateRowData[];
  selectedFieldIds: Set<string>;
  entityDefinitionId?: string;
  isReady: boolean;
  busy: boolean;
  onRowsChange: (rows: UpdateRowData[]) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const addRow = () => {
    onRowsChange([...updateRows, { id: uuid(), fieldId: '', value: '' }]);
  };

  const removeRow = (id: string) => {
    onRowsChange(updateRows.filter((r) => r.id !== id));
  };

  const updateRowField = (id: string, fieldId: string) => {
    onRowsChange(updateRows.map((r) => r.id === id ? { ...r, fieldId, value: '' } : r));
  };

  const updateRowValue = (id: string, value: unknown) => {
    onRowsChange(updateRows.map((r) => r.id === id ? { ...r, value } : r));
  };

  const canAddMore = updateRows.length < fields.length;
  const filledCount = updateRows.filter((r) => r.fieldId).length;

  // Build a map of physical_column -> value for sibling awareness (statecode/statusreason link)
  const siblingValues: Record<string, unknown> = {};
  for (const row of updateRows) {
    if (!row.fieldId) continue;
    const f = fields.find((ff) => ff.field_definition_id === row.fieldId);
    if (f) siblingValues[f.physical_column_name] = row.value;
  }

  useEffect(() => {
    if (!fieldsLoading && fields.length > 0 && updateRows.length === 0) {
      addRow();
    }
  }, [fieldsLoading, fields.length]);

  return (
    <Modal title={`Edit ${selectedCount} Record${selectedCount !== 1 ? 's' : ''}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-slate-500">
            Set one or more fields to new values across all {selectedCount} selected record{selectedCount !== 1 ? 's' : ''}.
          </p>
          <span className="text-[11px] font-medium text-slate-400">
            {filledCount} field{filledCount !== 1 ? 's' : ''} selected
          </span>
        </div>

        {fieldsLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <Loader2 size={16} className="animate-spin text-slate-400" />
            <span className="text-[12px] text-slate-500">Loading entity fields...</span>
          </div>
        ) : fields.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[12px] text-slate-400">No editable fields available for this entity.</p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-1 -mr-1">
            {updateRows.map((row, idx) => {
              const availableFields = fields.filter(
                (f) => f.field_definition_id === row.fieldId || !selectedFieldIds.has(f.field_definition_id)
              );
              const field = fields.find((f) => f.field_definition_id === row.fieldId);

              return (
                <BulkEditRow
                  key={row.id}
                  index={idx}
                  availableFields={availableFields}
                  selectedFieldId={row.fieldId}
                  value={row.value}
                  field={field}
                  entityDefinitionId={entityDefinitionId}
                  siblingValues={siblingValues}
                  onFieldChange={(fid) => updateRowField(row.id, fid)}
                  onValueChange={(v) => updateRowValue(row.id, v)}
                  onRemove={() => removeRow(row.id)}
                  canRemove={updateRows.length > 1}
                />
              );
            })}
          </div>
        )}

        {!fieldsLoading && fields.length > 0 && (
          <button
            type="button"
            onClick={addRow}
            disabled={!canAddMore}
            className="flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700 disabled:text-slate-300 disabled:cursor-not-allowed transition py-1"
          >
            <Plus size={14} />
            Add another field
          </button>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-[12px] text-slate-600 hover:bg-slate-100 rounded-lg transition font-medium">
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!isReady}
            className="flex items-center gap-1.5 px-5 py-2 text-[12px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition shadow-sm"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
            Update {selectedCount} Record{selectedCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function BulkActionsBar({
  entity,
  entityDefinitionId,
  selected,
  rows,
  columns,
  users,
  userId,
  canWrite,
  canDelete,
  canAssign = true,
  canExport = true,
  canBulkEdit = true,
  canActivate = true,
  canDeactivate = true,
  canShare = false,
  onShare,
  onClear,
  onComplete,
}: Props) {
  const [modal, setModal] = useState<ModalType>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OpResult>(null);

  const [assignUserId, setAssignUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userSearchRef = useRef<HTMLInputElement>(null);

  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [updateRows, setUpdateRows] = useState<UpdateRowData[]>([]);
  const [deleteRuleMessages, setDeleteRuleMessages] = useState<string[]>([]);
  const [deleteCheckLoading, setDeleteCheckLoading] = useState(false);
  const { getFieldRestriction } = usePermissions();

  const filteredUsers = users.filter((u) =>
    !userSearch || u.email.toLowerCase().includes(userSearch.toLowerCase())
  );
  const chosenUser = users.find((u) => u.id === assignUserId);

  const editableFields = fields.filter((f) => {
    if (!f.is_active || f.deleted_at) return false;
    if (NEVER_EDIT.has(f.physical_column_name)) return false;
    const typeName = f.field_type?.name ?? '';
    if (typeName === 'calculated' || typeName === 'autonumber' || typeName === 'rollup') return false;
    // Skip primary key columns (ending with _id that are the entity's own PK)
    if (f.physical_column_name.endsWith('_id') && f.physical_column_name === f.logical_name && f.is_system && !f.is_schema_editable) {
      const isPK = f.physical_column_name === `${entity.replace(/s$/, '')}_id` || f.physical_column_name === 'user_id';
      if (isPK) return false;
    }
    const restriction = getFieldRestriction(entity, f.logical_name);
    if (restriction.is_hidden || restriction.is_readonly) return false;
    return true;
  });

  useEffect(() => {
    if (modal === 'assign') {
      setAssignUserId('');
      setUserSearch('');
      setShowUserDropdown(false);
    }
    if (modal === 'update') {
      setUpdateRows([]);
    }
  }, [modal]);

  useEffect(() => {
    if (modal !== 'update' || !entityDefinitionId) return;
    setFieldsLoading(true);
    fetchFieldsForEntity(entityDefinitionId)
      .then((all) => {
        setFields(all);
        setUpdateRows([]);
      })
      .finally(() => setFieldsLoading(false));
  }, [modal, entityDefinitionId]);

  const closeModal = () => setModal(null);

  const handleAssign = async () => {
    if (!assignUserId || !userId) return;
    setBusy(true);
    const r = await bulkUpdateRows(entity, Array.from(selected), { owner_id: assignUserId }, userId);
    setBusy(false);
    setResult(r);
    closeModal();
    onComplete();
  };

  const handleUpdate = async () => {
    if (!userId || validUpdateRows.length === 0) return;
    setBusy(true);
    const payload: Record<string, unknown> = {};
    for (const row of validUpdateRows) {
      const field = editableFields.find((f) => f.field_definition_id === row.fieldId);
      if (field) payload[field.physical_column_name] = row.value;
    }
    const r = await bulkUpdateRows(entity, Array.from(selected), payload, userId);
    setBusy(false);
    setResult(r);
    closeModal();
    onComplete();
  };

  const openDeleteModal = async () => {
    setDeleteRuleMessages([]);
    setDeleteCheckLoading(true);
    setModal('delete');
    try {
      const check = await checkDeleteRules(entity, Array.from(selected));
      if (check.blocked) {
        setDeleteRuleMessages(check.block_messages ?? ['Delete is blocked by a Digital Rule.']);
      } else if (check.requires_confirmation) {
        setDeleteRuleMessages(check.confirmation_messages);
      }
    } catch {
      // Fallback: show standard confirmation
    } finally {
      setDeleteCheckLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!userId) return;
    setBusy(true);
    const ids = Array.from(selected);
    try {
      const r = await executeDelete(entity, ids, true);
      if (r.success) {
        await Promise.all(
          ids.flatMap((id) => [
            removeRecentItem(userId, entity, id),
            removePinnedRecord(userId, entity, id),
          ])
        );
      }
      const failed = r.success ? r.errors : (r.errors || ids.length);
      setResult({ deleted: r.deleted, errors: failed, message: r.blocked ? r.block_messages?.[0] : r.error });
    } catch (e) {
      // Never leave the button spinning: surface the failure instead.
      setResult({ deleted: 0, errors: ids.length, message: e instanceof Error ? e.message : 'Delete failed' });
    } finally {
      setBusy(false);
      closeModal();
      onClear();
      onComplete();
    }
  };

  const showActivateDeactivate = entity !== 'leads' && entity !== 'opportunities';

  const hasGroup1 = showActivateDeactivate && (canActivate || canDeactivate);
  const hasGroup2 = (canWrite && canAssign) || (canWrite && canBulkEdit) || canExport || (canShare && selected.size >= 1 && !!onShare);
  const hasGroup3 = canDelete;

  const handleActivate = async () => {
    if (!userId) return;
    setBusy(true);
    const r = await bulkUpdateRows(entity, Array.from(selected), { state_code: 1, status_reason: 1 }, userId);
    setBusy(false);
    setResult(r);
    onComplete();
  };

  const handleDeactivate = async () => {
    if (!userId) return;
    setBusy(true);
    const r = await bulkUpdateRows(entity, Array.from(selected), { state_code: 2, status_reason: 2 }, userId);
    setBusy(false);
    setResult(r);
    onComplete();
  };

  const handleExport = () => exportToXlsx(entity, rows, selected, columns);

  const selectedFieldIds = new Set(updateRows.map((r) => r.fieldId));
  const validUpdateRows = updateRows.filter((r) => {
    if (!r.fieldId) return false;
    if (r.value === '' || r.value == null) return false;
    return editableFields.some((f) => f.field_definition_id === r.fieldId);
  });
  const isUpdateReady = validUpdateRows.length > 0 && !busy;

  return (
    <>
      <div className="flex items-center gap-0.5 flex-wrap">
        {result && <ResultBanner result={result} onClose={() => setResult(null)} />}

        {/* Group 1: Activate / Deactivate */}
        {showActivateDeactivate && canActivate && (
          <button
            onClick={handleActivate}
            disabled={busy}
            className="h-[30px] flex items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors disabled:opacity-40 text-[#5b6472] hover:bg-[#e7f8ef] hover:text-[#0f9d63]"
            style={{ borderRadius: 10 }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ToggleRight size={14} />}
            Activate
          </button>
        )}
        {showActivateDeactivate && canDeactivate && (
          <button
            onClick={handleDeactivate}
            disabled={busy}
            className="h-[30px] flex items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors disabled:opacity-40 text-[#5b6472] hover:bg-[#fdf4e3] hover:text-[#c2820a]"
            style={{ borderRadius: 10 }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ToggleLeft size={14} />}
            Deactivate
          </button>
        )}

        {/* Divider G1 → G2 */}
        {hasGroup1 && hasGroup2 && <div className="w-px h-[16px] mx-1.5 shrink-0" style={{ background: '#d9e4ff' }} />}

        {/* Group 2: Assign / Edit / Export / Share */}
        {canWrite && canAssign && (
          <button
            onClick={() => setModal('assign')}
            className="h-[30px] flex items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors text-[#5b6472] hover:bg-[#f4f6fb] hover:text-[#161a22]"
            style={{ borderRadius: 10 }}
          >
            <UserCheck size={14} />
            Assign
          </button>
        )}
        {canWrite && canBulkEdit && (
          <button
            onClick={() => setModal('update')}
            className="h-[30px] flex items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors text-[#5b6472] hover:bg-[#f4f6fb] hover:text-[#161a22]"
            style={{ borderRadius: 10 }}
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
        {canExport && (
          <button
            onClick={handleExport}
            className="h-[30px] flex items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors text-[#5b6472] hover:bg-[#f4f6fb] hover:text-[#161a22]"
            style={{ borderRadius: 10 }}
          >
            <Download size={14} />
            Export
          </button>
        )}
        {canShare && selected.size >= 1 && onShare && (
          <button
            onClick={() => onShare(Array.from(selected)[0])}
            className="h-[30px] flex items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors text-[#5b6472] hover:bg-[#f4f6fb] hover:text-[#161a22]"
            style={{ borderRadius: 10 }}
          >
            <Share2 size={14} />
            Share
          </button>
        )}

        {/* Divider G2 → G3 */}
        {(hasGroup1 || hasGroup2) && hasGroup3 && <div className="w-px h-[16px] mx-1.5 shrink-0" style={{ background: '#d9e4ff' }} />}

        {/* Group 3: Delete */}
        {canDelete && (
          <button
            onClick={openDeleteModal}
            className="h-[30px] flex items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors text-[#5b6472] hover:bg-[#fdecef] hover:text-[#dc2b46]"
            style={{ borderRadius: 10 }}
          >
            <Trash2 size={14} />
            Delete
          </button>
        )}
      </div>

      {modal === 'assign' && (
        <Modal title={`Assign ${selected.size} Record${selected.size !== 1 ? 's' : ''}`} onClose={closeModal}>
          <div className="space-y-4">
            <p className="text-[12px] text-slate-500">Choose a user to assign as owner for all selected records.</p>
            <div className="relative">
              <div
                className="flex items-center justify-between w-full px-3 py-2 border border-slate-200 rounded-lg bg-white cursor-pointer hover:border-slate-300 transition text-[13px]"
                onClick={() => {
                  setShowUserDropdown((v) => !v);
                  setTimeout(() => userSearchRef.current?.focus(), 50);
                }}
              >
                <span className={chosenUser ? 'text-slate-800' : 'text-slate-400'}>
                  {chosenUser?.email ?? 'Select a user...'}
                </span>
                <ChevronDown size={13} className="text-slate-400" />
              </div>
              {showUserDropdown && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-slate-100">
                    <input
                      ref={userSearchRef}
                      type="text"
                      placeholder="Search users..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full px-2 py-1.5 text-[12px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                      <div className="px-3 py-3 text-[12px] text-slate-400 text-center">No users found</div>
                    ) : filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => { setAssignUserId(u.id); setShowUserDropdown(false); }}
                        className={`w-full text-left px-3 py-2 text-[12px] hover:bg-slate-50 transition ${assignUserId === u.id ? 'text-blue-700 bg-blue-50 font-medium' : 'text-slate-700'}`}
                      >
                        {u.email}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={closeModal} className="px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100 rounded-md transition">Cancel</button>
              <button
                onClick={handleAssign}
                disabled={!assignUserId || busy}
                className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />}
                Assign
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'update' && (
        <BulkEditModal
          selectedCount={selected.size}
          fields={editableFields}
          fieldsLoading={fieldsLoading}
          updateRows={updateRows}
          selectedFieldIds={selectedFieldIds}
          entityDefinitionId={entityDefinitionId ?? undefined}
          isReady={isUpdateReady}
          busy={busy}
          onRowsChange={setUpdateRows}
          onSubmit={handleUpdate}
          onClose={closeModal}
        />
      )}

      {modal === 'delete' && (
        <Modal title="Confirm Delete" onClose={closeModal}>
          <div className="space-y-4">
            {deleteCheckLoading ? (
              <div className="flex items-center justify-center py-6 gap-2">
                <Loader2 size={16} className="animate-spin text-slate-400" />
                <span className="text-[12px] text-slate-500">Checking delete rules...</span>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-[12px] text-red-700">
                      You are about to delete <strong>{selected.size} record{selected.size !== 1 ? 's' : ''}</strong>. This action cannot be undone.
                    </p>
                    {deleteRuleMessages.map((msg, i) => (
                      <p key={i} className="text-[12px] text-red-600 font-medium">{msg}</p>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button onClick={closeModal} className="px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100 rounded-md transition">Cancel</button>
                  <button
                    onClick={handleDelete}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Delete {selected.size} Record{selected.size !== 1 ? 's' : ''}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
