import FilterSelect from '../FilterSelect';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, ExternalLink, Info, Lock, HelpCircle, EyeOff, Search, Loader2, ScanSearch, X, Calculator } from 'lucide-react';
import { evaluateFieldCalc, formatCalcValue } from '../../services/calcEngine';
import { supabase } from '../../../lib/supabase';
import { useFormDensity, densityStyles } from '../../context/FormDensityContext';
import type { DesignerControl, LookupConfig } from '../../../types/form';
import { buildRecordUrl } from '../../../App';
import OptionSetSelect from './OptionSetSelect';
import ProductPickerSelect from './ProductPickerSelect';
import LookupDialog from './LookupDialog';
import StatecodeSelect from './StatecodeSelect';
import StatuscodeSelect from './StatusreasonSelect';

export const PRODUCT_PICKER_SENTINEL = '__product_picker__';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(s: string): boolean {
  return UUID_RE.test(s);
}

// Common human-readable columns to try, in priority order, when a lookup row's
// configured label column is empty/null — so a lookup ALWAYS shows text, never a
// raw GUID, as long as any name-like column has a value.
const FALLBACK_LABEL_COLUMNS = [
  'full_name', 'name', 'account_name', 'topic', 'title', 'subject',
  'display_name', 'label', 'email', 'first_name', 'last_name',
];

/**
 * Pick the best display string for a lookup row: the configured column first, then
 * common name-like columns, never returning a value that is itself a UUID (which
 * would just be another opaque id). Returns '' when the row has no usable text.
 */
export function pickLookupLabel(row: Record<string, unknown>, preferredCol: string): string {
  const asText = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v).trim();
    return s && !isValidUUID(s) ? s : '';
  };
  const primary = asText(row[preferredCol]);
  if (primary) return primary;
  for (const col of FALLBACK_LABEL_COLUMNS) {
    if (col === preferredCol) continue;
    const v = asText(row[col]);
    if (v) return v;
  }
  return '';
}

const LOOKUP_SEARCH_CONFIG: Record<string, { table: string; pk: string; labelField: string; searchField?: string; noIsDeleted?: boolean }> = {
  accounts:      { table: 'account',      pk: 'account_id',      labelField: 'account_name' },
  contacts:      { table: 'contact',      pk: 'contact_id',      labelField: 'full_name' },
  opportunities: { table: 'opportunity',  pk: 'opportunity_id',  labelField: 'topic' },
  leads:         { table: 'lead',         pk: 'lead_id',         labelField: 'full_name' },
  users:         { table: 'crm_user',     pk: 'user_id',         labelField: 'email',  noIsDeleted: true },
};

const PK_OVERRIDES: Record<string, string> = {
  product_family: 'family_id',
  line_of_business: 'lob_id',
  crm_user: 'user_id',
  security_role: 'role_id',
};

const DELETED_AT_TABLES = new Set([
  'business_unit', 'country', 'crm_user', 'industry', 'line_of_business',
  'product', 'product_family', 'security_role', 'team',
]);

// Runtime cache for dynamic entity configs resolved from DB
const dynamicEntityConfigCache: Record<string, { table: string; pk: string; labelField: string; noIsDeleted?: boolean } | null> = {};

async function resolveDynamicEntityConfig(entitySlug: string): Promise<{ table: string; pk: string; labelField: string; noIsDeleted?: boolean } | null> {
  if (entitySlug in dynamicEntityConfigCache) return dynamicEntityConfigCache[entitySlug];
  const logicalName = entitySlug.replace(/s$/, ''); // rough singularize
  const { data } = await supabase
    .from('entity_definition')
    .select('physical_table_name, primary_field_name, logical_name, primary_key_column')
    .or(`logical_name.eq.${entitySlug},logical_name.eq.${logicalName}`)
    .maybeSingle();
  if (!data) { dynamicEntityConfigCache[entitySlug] = null; return null; }
  const table = data.physical_table_name;
  const labelField = data.primary_field_name ?? 'name';
  // Resolve the real primary key authoritatively rather than guessing `${table}_id`,
  // which breaks for prefixed/irregular tables (e.g. crm_leadsource → leadsource_id,
  // product_family → family_id). Order: stored value → static override → live catalog
  // lookup (covers entities created before the backfill) → convention as last resort.
  let pk = data.primary_key_column ?? PK_OVERRIDES[table];
  if (!pk) {
    const { data: rpcPk } = await supabase.rpc('get_entity_primary_key', { p_table: table });
    pk = (typeof rpcPk === 'string' && rpcPk) ? rpcPk : `${table}_id`;
  }
  const noIsDeleted = table === 'crm_user' || DELETED_AT_TABLES.has(table);
  const cfg = { table, pk, labelField, noIsDeleted };
  dynamicEntityConfigCache[entitySlug] = cfg;
  return cfg;
}

interface LookupOption {
  id: string;
  label: string;
}

interface LookupFieldProps {
  entitySlug: string | null;
  value: string;
  displayLabel: string;
  readonly: boolean;
  inputBase: string;
  ds: { input: string };
  borderCls: string;
  label: string;
  onOpenRecord?: (slug: string, id: string) => void;
  onChange: (val: unknown) => void;
  onLabelChange?: (label: string) => void;
  onBlur: () => void;
  /** Lookup configuration from the form designer */
  lookupConfig?: LookupConfig | null;
  /** Current form field values, used for dependent filtering */
  formValues?: Record<string, unknown>;
}

// Entity metadata needed by LookupDialog, keyed by entitySlug
const ENTITY_META: Record<string, { logicalName: string; table: string; pk: string; labelCol: string }> = {
  accounts:      { logicalName: 'account',      table: 'account',      pk: 'account_id',      labelCol: 'account_name' },
  contacts:      { logicalName: 'contact',      table: 'contact',      pk: 'contact_id',      labelCol: 'full_name' },
  opportunities: { logicalName: 'opportunity',  table: 'opportunity',  pk: 'opportunity_id',  labelCol: 'topic' },
  leads:         { logicalName: 'lead',         table: 'lead',         pk: 'lead_id',         labelCol: 'full_name' },
  users:         { logicalName: 'crm_user',     table: 'crm_user',     pk: 'user_id',         labelCol: 'email' },
};

// Runtime cache for dynamically-resolved entity meta (for custom entities)
const dynamicEntityMetaCache: Record<string, { logicalName: string; table: string; pk: string; labelCol: string } | null> = {};

export function LookupField({
  entitySlug,
  value,
  displayLabel,
  readonly,
  inputBase,
  ds,
  borderCls,
  label,
  onOpenRecord,
  onChange,
  onLabelChange,
  onBlur,
  lookupConfig,
  formValues,
}: LookupFieldProps) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [localLabel, setLocalLabel] = useState<string | null>(null);
  // True once we've attempted to resolve a label for the current value — lets us show a
  // "(no name)" placeholder for a referenced record that has no name (or was deleted)
  // instead of leaking a raw GUID, without flickering the placeholder before we've tried.
  const [triedResolve, setTriedResolve] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasValue = !!(value && isValidUUID(value));
  const [resolvedMeta, setResolvedMeta] = useState<{ logicalName: string; table: string; pk: string; labelCol: string } | null>(
    entitySlug ? (ENTITY_META[entitySlug] ?? null) : null
  );

  // Resolve meta for dynamic/custom entities not in ENTITY_META
  useEffect(() => {
    if (!entitySlug) return;
    if (ENTITY_META[entitySlug]) { setResolvedMeta(ENTITY_META[entitySlug]); return; }
    if (entitySlug in dynamicEntityMetaCache) { setResolvedMeta(dynamicEntityMetaCache[entitySlug]); return; }
    resolveDynamicEntityConfig(entitySlug).then((cfg) => {
      if (!cfg) { dynamicEntityMetaCache[entitySlug] = null; setResolvedMeta(null); return; }
      const m = { logicalName: entitySlug, table: cfg.table, pk: cfg.pk, labelCol: cfg.labelField };
      dynamicEntityMetaCache[entitySlug] = m;
      setResolvedMeta(m);
    });
  }, [entitySlug]);

  const meta = resolvedMeta;

  // Re-attempt resolution whenever the selected value changes.
  useEffect(() => { setTriedResolve(false); }, [value]);

  useEffect(() => {
    if (!hasValue || displayLabel || localLabel || !meta) return;
    let cancelled = false;
    // Select the whole row so we can fall back to any name-like column when the
    // configured label column is empty — guarantees a lookup shows text, not a GUID.
    supabase
      .from(meta.table)
      .select('*')
      .eq(meta.pk, value)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const lbl = data ? pickLookupLabel(data as Record<string, unknown>, meta.labelCol) : '';
        if (lbl) {
          setLocalLabel(lbl);
          onLabelChange?.(lbl);
        }
        // Mark resolution attempted even when no label was found (empty/deleted row),
        // so the display can fall back to a placeholder instead of the GUID.
        setTriedResolve(true);
      });
    return () => { cancelled = true; };
  }, [hasValue, value, displayLabel, localLabel, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // ── Dependent filter — mirrors logic in LookupDialog ──────────────────────
  const filterFkColumn = lookupConfig?.filter_fk_column ?? null;
  const filterSourceFieldName = lookupConfig?.filter_by_field_logical_name ?? null;

  const filterValue = useMemo(() => {
    if (!filterSourceFieldName || !formValues) return null;
    const fv = formValues as Record<string, unknown>;
    const direct = fv[filterSourceFieldName];
    if (direct) return direct as string;
    const asPhysical = filterSourceFieldName.replace(/([a-z])id$/i, '$1_id');
    const via = fv[asPhysical];
    if (via) return via as string;
    const root = filterSourceFieldName.replace(/id$/i, '').toLowerCase();
    const match = Object.keys(fv).find(
      (k) => k.toLowerCase().startsWith(root) && k.endsWith('_id') && fv[k]
    );
    return match ? (fv[match] as string) : null;
  }, [filterSourceFieldName, formValues]);

  const filterRequired = !!(filterFkColumn && filterSourceFieldName);
  const filterMissing = filterRequired && !filterValue;

  const search = useCallback(async (q: string) => {
    if (!entitySlug || filterMissing) return;

    // Get config — from static map or resolve dynamically from DB
    let cfg = LOOKUP_SEARCH_CONFIG[entitySlug] ?? null;
    if (!cfg) cfg = await resolveDynamicEntityConfig(entitySlug);
    if (!cfg) return;

    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let qb: any = supabase
        .from(cfg.table)
        .select(`${cfg.pk}, ${cfg.labelField}`)
        .ilike(cfg.labelField, `%${q}%`)
        .limit(10);
      if (!cfg.noIsDeleted) qb = qb.eq('is_deleted', false);
      else if (cfg.table === 'crm_user') qb = qb.eq('is_active', true);
      else qb = qb.is('deleted_at', null);
      // Apply dependent filter (e.g. only contacts for the selected account)
      if (filterFkColumn && filterValue) {
        qb = qb.eq(filterFkColumn, filterValue);
      }
      const { data } = await qb;
      setOptions(
        (data ?? []).map((r: Record<string, unknown>) => ({
          id: r[cfg!.pk] as string,
          label: r[cfg!.labelField] as string,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [entitySlug, filterMissing, filterFkColumn, filterValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (filterMissing) return;
    const q = e.target.value;
    setQuery(q);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length === 0) { setOptions([]); return; }
    debounceRef.current = setTimeout(() => search(q.trim()), 250);
  };

  const handleSelect = (opt: LookupOption) => {
    setLocalLabel(opt.label);
    onChange(opt.id);
    onLabelChange?.(opt.label);
    setQuery('');
    setOpen(false);
    onBlur();
  };

  const handleClear = () => {
    setLocalLabel(null);
    onChange('');
    setQuery('');
    setOptions([]);
    onBlur();
  };

  const handleDialogSelect = (id: string, lbl: string) => {
    setLocalLabel(lbl);
    onChange(id);
    onLabelChange?.(lbl);
    setDialogOpen(false);
    onBlur();
  };

  // Magnifier button — always shown when not readonly
  const browseBtn = !readonly && (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); setDialogOpen(true); }}
      className="flex-shrink-0 p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
      title={`Browse ${label}`}
    >
      <ScanSearch size={14} />
    </button>
  );

  if (hasValue) {
    // Never surface a raw GUID: use the resolved label; if the value is a UUID we can't
    // resolve to any text (referenced record has no name or was deleted), show a muted
    // "(no name)" placeholder once resolution has been attempted.
    const resolvedLabel = displayLabel || localLabel || (isValidUUID(value) ? '' : value);
    const shownLabel = resolvedLabel || (triedResolve ? '(no name)' : '');
    const isPlaceholder = !resolvedLabel;
    return (
      <>
        <div className={`flex items-center gap-1.5 ${ds.input} border ${borderCls} rounded-md bg-white`}>
          {entitySlug && onOpenRecord ? (
            <a
              href={buildRecordUrl(entitySlug, value)}
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                  e.preventDefault();
                  onOpenRecord(entitySlug, value);
                }
              }}
              className={`flex-1 hover:underline truncate text-left leading-none ${isPlaceholder ? 'text-slate-400 italic' : 'text-[var(--link)]'}`}
              title={isPlaceholder ? 'Referenced record has no name' : `Open ${shownLabel}`}
            >
              {shownLabel}
            </a>
          ) : (
            <span className={`flex-1 truncate leading-none ${isPlaceholder ? 'text-slate-400 italic' : 'text-slate-700'}`}>{shownLabel}</span>
          )}
          {browseBtn}
          {!readonly && (
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-600 flex-shrink-0 transition text-[13px] leading-none"
              title="Clear"
            >
              ×
            </button>
          )}
          {entitySlug && onOpenRecord && (
            <>
              <button
                type="button"
                onClick={() => onOpenRecord(entitySlug, value)}
                className="text-slate-400 hover:text-blue-500 flex-shrink-0 transition"
                title="Open in same tab"
              >
                <ExternalLink size={11} />
              </button>
              <a
                href={buildRecordUrl(entitySlug, value)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-blue-400 flex-shrink-0 transition text-[9px] font-bold leading-none select-none"
                title="Open in new tab"
              >
                ↗
              </a>
            </>
          )}
        </div>
        {dialogOpen && meta && (
          <LookupDialog
            label={label}
            entityLogicalName={meta.logicalName}
            entityTable={meta.table}
            pkColumn={meta.pk}
            labelColumn={meta.labelCol}
            lookupConfig={lookupConfig}
            formValues={formValues ?? {}}
            onSelect={handleDialogSelect}
            onClose={() => setDialogOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div ref={containerRef} className="relative flex items-center gap-1">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={() => { if (query.trim().length >= 1 && !filterMissing) setOpen(true); }}
            onBlur={onBlur}
            disabled={readonly || filterMissing}
            placeholder={filterMissing
              ? `Select ${filterSourceFieldName?.replace(/_id$/, '').replace(/_/g, ' ') ?? 'parent'} first`
              : `Search ${label.toLowerCase()}...`}
            className={`${inputBase} pl-7`}
            autoComplete="off"
          />
          {loading && (
            <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin pointer-events-none" />
          )}
        </div>
        {browseBtn}
        {open && (query.trim().length >= 1) && (
          <div className="absolute z-50 top-full left-0 right-8 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            {options.length === 0 && !loading && (
              <div className="px-3 py-2 text-[12px] text-slate-400">No results for "{query}"</div>
            )}
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {dialogOpen && meta && (
        <LookupDialog
          label={label}
          entityLogicalName={meta.logicalName}
          entityTable={meta.table}
          pkColumn={meta.pk}
          labelColumn={meta.labelCol}
          lookupConfig={lookupConfig}
          formValues={formValues ?? {}}
          onSelect={handleDialogSelect}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

interface FormFieldProps {
  control: DesignerControl;
  value: unknown;
  onChange: (fieldLogicalName: string, value: unknown) => void;
  isHidden?: boolean;
  isReadonly?: boolean;
  isRequired?: boolean;
  isPermissionLocked?: boolean;
  isMasked?: boolean;
  errorMessage?: string | null;
  ruleMessage?: { text: string; level: 'info' | 'warning' | 'error'; blocksSave: boolean } | null;
  choiceOptions?: { value: string; label: string }[];
  filteredOptions?: string[] | null;
  optionSetName?: string;
  onOpenRecord?: (entitySlug: string, id: string) => void;
  onLookupLabelChange?: (fieldLogicalName: string, label: string) => void;
  lookupLabel?: string;
  helpText?: string | null;
  currencySymbol?: string;
  /** Lookup configuration from form designer (view + dependent filter) */
  lookupConfig?: LookupConfig | null;
  /** All current form field values, used for dependent lookup filtering */
  formValues?: Record<string, unknown>;
  /** Entity definition ID — required to render statecode / statusreason fields */
  entityDefinitionId?: string;
}

function HelpTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center ml-0.5"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <HelpCircle size={11} className="text-slate-300 hover:text-slate-400 cursor-help transition" />
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none w-56">
          <div className="bg-slate-800 text-white text-[11px] leading-snug px-2.5 py-2 rounded-lg shadow-xl">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
          </div>
        </div>
      )}
    </span>
  );
}

function MultiChoiceDropdown({
  choices,
  selected,
  onToggle,
  activeError,
}: {
  choices: { value: string; label: string }[];
  selected: string[];
  onToggle: (val: string) => void;
  activeError: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = 208; // max-h-52
    const goUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(goUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const scrollHandler = () => { updatePosition(); };
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', scrollHandler, true);
    window.addEventListener('resize', scrollHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', scrollHandler, true);
      window.removeEventListener('resize', scrollHandler);
    };
  }, [open, updatePosition]);

  const borderCls = activeError
    ? 'border-red-400'
    : open
    ? 'border-blue-500 ring-1 ring-blue-500'
    : 'border-slate-200 hover:border-slate-300';

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      data-overlay-portal=""
      style={dropdownStyle}
      className="bg-white border border-slate-200 rounded-md shadow-xl overflow-auto max-h-52"
    >
      {choices.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-slate-400">No options available</div>
      ) : (
        choices.map((c) => {
          const isSelected = selected.includes(c.value);
          return (
            <div
              key={c.value}
              onMouseDown={(e) => { e.preventDefault(); onToggle(c.value); }}
              className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-[13px] select-none transition-colors ${isSelected ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                {isSelected && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {c.label}
            </div>
          );
        })
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative w-full">
      <div
        ref={triggerRef}
        className={`min-h-[34px] w-full border rounded-md bg-white cursor-pointer transition-colors flex items-center gap-1 px-2 py-1 ${borderCls}`}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selected.length === 0 ? (
            <span className="text-slate-400 text-[13px] leading-5 select-none py-0.5">Select options...</span>
          ) : (
            selected.map((v) => {
              const ch = choices.find((c) => c.value === v);
              return (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 select-none"
                >
                  {ch?.label ?? v}
                  <button
                    type="button"
                    onMouseDown={(e) => { e.stopPropagation(); onToggle(v); }}
                    className="text-blue-400 hover:text-blue-700 focus:outline-none"
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })
          )}
        </div>
        <svg
          className={`shrink-0 w-4 h-4 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>
      {dropdown}
    </div>
  );
}

function validateValue(
  value: unknown,
  fieldType: string,
  required: boolean,
  label: string,
): string | null {
  const isEmpty = value == null
    || (Array.isArray(value) ? (value as unknown[]).length === 0 : String(value).trim() === '');
  const strVal = value == null ? '' : String(value).trim();

  if (required && isEmpty) {
    return `${label} is required`;
  }

  if (isEmpty) return null;

  if (fieldType === 'email') {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(strVal)) return 'Enter a valid email address';
  }

  if (fieldType === 'url') {
    try {
      const u = new URL(strVal);
      if (!['http:', 'https:'].includes(u.protocol)) return 'URL must start with http:// or https://';
    } catch {
      return 'Enter a valid URL (e.g. https://example.com)';
    }
  }

  if (fieldType === 'phone') {
    const phoneRe = /^[+\d][\d\s\-().]{6,}$/;
    if (!phoneRe.test(strVal)) return 'Enter a valid phone number';
  }

  if (fieldType === 'number' || fieldType === 'integer' || fieldType === 'decimal' || fieldType === 'currency') {
    if (isNaN(Number(value))) return 'Must be a valid number';
  }

  return null;
}

export default function FormField({
  control,
  value,
  onChange,
  isHidden = false,
  isReadonly = false,
  isRequired = false,
  isPermissionLocked = false,
  isMasked = false,
  errorMessage,
  ruleMessage,
  choiceOptions,
  filteredOptions,
  optionSetName,
  onOpenRecord,
  onLookupLabelChange,
  lookupLabel,
  helpText,
  currencySymbol,
  lookupConfig,
  formValues,
  entityDefinitionId,
}: FormFieldProps) {
  const { density } = useFormDensity();
  const ds = densityStyles[density];
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (errorMessage) setTouched(true);
  }, [errorMessage]);

  // Transient "just saved" flash: when a field's value changes and is valid, show
  // a success border + check for ~2s, then fade back to the normal border. The
  // resting state is a plain input — no permanent green ring (which trains users
  // to ignore green). Skips the initial mount so existing values don't all light up.
  const [justSaved, setJustSaved] = useState(false);
  const prevValueRef = useRef(value);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; prevValueRef.current = value; return; }
    if (value === prevValueRef.current) return;
    prevValueRef.current = value;
    const hasVal = value != null && (Array.isArray(value) ? (value as unknown[]).length > 0 : String(value).trim() !== '');
    if (hasVal && !errorMessage) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(t);
    }
    setJustSaved(false);
  }, [value, errorMessage]);

  if (isHidden) return null;

  const label = control.label_override ?? control.field_display_name ?? '';
  const fieldName = control.field_logical_name ?? '';
  const fieldType = control.field_type_name ?? 'text';
  const readonly = isReadonly || control.is_readonly;
  const required = isRequired || control.is_required_override;

  const inlineError = touched ? validateValue(value, fieldType, required, label) : null;
  const activeError = errorMessage ?? inlineError;
  const handleChange = useCallback((val: unknown) => {
    if (!readonly) onChange(fieldName, val);
  }, [readonly, onChange, fieldName]);

  const handleBlur = useCallback(() => {
    setTouched(true);
  }, []);

  const borderCls = readonly
    ? 'border-[var(--border)]'
    : activeError
    ? 'border-[var(--danger)] focus:ring-[var(--danger)] focus:border-[var(--danger)]'
    : justSaved
    ? 'border-[var(--success)] focus:ring-[var(--success)] focus:border-[var(--success)]'
    : 'border-[var(--border)] focus:ring-[var(--link)] focus:border-[var(--link)]';

  const showInlineIcon = !readonly && (activeError || justSaved) && fieldType !== 'textarea' && fieldType !== 'choice' && fieldType !== 'multi_choice' && fieldType !== 'boolean';
  const iconPadding = showInlineIcon ? 'pr-7' : '';
  const inputBase = `w-full ${ds.input} ${iconPadding} text-[var(--text)] bg-[var(--input-bg)] border ${borderCls} rounded-md placeholder-[var(--muted)] focus:outline-none focus:ring-1 transition disabled:bg-[var(--surface-2)] disabled:text-[var(--muted)] disabled:cursor-not-allowed`;

  const renderInput = () => {
    const strVal = value == null ? '' : String(value);

    const sharedBlurProps = { onBlur: handleBlur };

    switch (fieldType) {
      case 'textarea':
        return (
          <textarea
            value={strVal}
            onChange={(e) => handleChange(e.target.value)}
            {...sharedBlurProps}
            disabled={readonly}
            rows={ds.textareaRows}
            placeholder={`Enter ${label.toLowerCase()}...`}
            className={`${inputBase} resize-y ${ds.textarea}`}
          />
        );

      case 'boolean':
        return (
          <FilterSelect
            value={value === null || value === undefined ? '' : String(Boolean(value))}
            onChange={(e) => {
              if (e.target.value === '') handleChange(null);
              else handleChange(e.target.value === 'true');
            }}
            disabled={readonly}
            className={inputBase}
          >
            <option value="">-- Select --</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </FilterSelect>
        );

      case 'date':
        return (
          <input
            type="date"
            value={strVal}
            onChange={(e) => handleChange(e.target.value || null)}
            {...sharedBlurProps}
            disabled={readonly}
            className={inputBase}
          />
        );

      case 'datetime':
        return (
          <input
            type="datetime-local"
            value={strVal ? strVal.slice(0, 16) : ''}
            onChange={(e) => handleChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
            {...sharedBlurProps}
            disabled={readonly}
            className={inputBase}
          />
        );

      case 'number':
      case 'integer':
        return (
          <input
            type="number"
            value={strVal}
            onChange={(e) => handleChange(e.target.value === '' ? null : Number(e.target.value))}
            {...sharedBlurProps}
            disabled={readonly}
            placeholder="0"
            className={inputBase}
          />
        );

      case 'whole_number':
        return (
          <div className="relative">
            <input
              type="number"
              step="any"
              value={strVal}
              onChange={(e) => handleChange(e.target.value === '' ? null : Number(e.target.value))}
              {...sharedBlurProps}
              disabled={readonly}
              placeholder="0"
              className={`${inputBase} pr-7`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400 pointer-events-none select-none">%</span>
          </div>
        );

      case 'decimal':
      case 'currency': {
        const isCurrency = fieldType === 'currency';
        const symbol = isCurrency ? (currencySymbol ?? '$') : null;
        const symbolWidth = symbol && symbol.length > 1 ? 'pl-8' : 'pl-6';
        return (
          <div className="relative">
            {symbol && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400 pointer-events-none select-none">{symbol}</span>
            )}
            <input
              type="number"
              step="0.01"
              value={strVal}
              onChange={(e) => handleChange(e.target.value === '' ? null : Number(e.target.value))}
              {...sharedBlurProps}
              disabled={readonly}
              placeholder="0.00"
              className={`${inputBase} ${symbol ? symbolWidth : ''}`}
            />
          </div>
        );
      }

      case 'email':
        return (
          <input
            type="email"
            value={strVal}
            onChange={(e) => handleChange(e.target.value)}
            {...sharedBlurProps}
            disabled={readonly}
            placeholder="name@example.com"
            className={inputBase}
          />
        );

      case 'phone':
        return (
          <input
            type="tel"
            value={strVal}
            onChange={(e) => handleChange(e.target.value)}
            {...sharedBlurProps}
            disabled={readonly}
            placeholder="+1 (555) 000-0000"
            className={inputBase}
          />
        );

      case 'url':
        return (
          <input
            type="url"
            value={strVal}
            onChange={(e) => handleChange(e.target.value)}
            {...sharedBlurProps}
            disabled={readonly}
            placeholder="https://"
            className={inputBase}
          />
        );

      case 'choice': {
        // ── statecode/status field — "Status" parent, loads from statecode_definition ──
        if ((fieldName === 'statecode' || fieldName === 'statuscode') && entityDefinitionId) {
          return (
            <StatecodeSelect
              entityDefinitionId={entityDefinitionId}
              value={strVal}
              onChange={(v) => { handleChange(v || null); handleBlur(); }}
              isReadonly={readonly}
            />
          );
        }

        // ── statusreason/reason field — filtered by current statecode value ──
        if ((fieldName === 'statusreason' || fieldName === 'reason') && entityDefinitionId) {
          const statecodeVal = String(
            formValues?.['statecode'] ?? formValues?.['state_code'] ?? ''
          );
          return (
            <StatuscodeSelect
              entityDefinitionId={entityDefinitionId}
              statecodeValue={statecodeVal}
              value={strVal}
              onChange={(v) => { handleChange(v || null); handleBlur(); }}
              isReadonly={readonly}
            />
          );
        }

        if (optionSetName === PRODUCT_PICKER_SENTINEL) {
          return (
            <ProductPickerSelect
              value={strVal}
              onChange={(v) => { handleChange(v || null); handleBlur(); }}
              isReadonly={readonly}
            />
          );
        }
        if (optionSetName) {
          return (
            <OptionSetSelect
              optionSetName={optionSetName}
              value={strVal}
              onChange={(v) => { handleChange(v || null); handleBlur(); }}
              isReadonly={readonly}
            />
          );
        }
        return (
          <FilterSelect
            value={strVal}
            onChange={(e) => { handleChange(e.target.value || null); handleBlur(); }}
            disabled={readonly}
            className={inputBase}
          >
            <option value="">— Select —</option>
            {(choiceOptions ?? [])
              .filter((opt) => !filteredOptions || filteredOptions.includes(opt.value))
              .map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
          </FilterSelect>
        );
      }

      case 'lookup': {
        if (optionSetName === PRODUCT_PICKER_SENTINEL) {
          return (
            <ProductPickerSelect
              value={strVal}
              onChange={(v) => { handleChange(v || null); handleBlur(); }}
              isReadonly={readonly}
            />
          );
        }
        return (
          <LookupField
            entitySlug={control.lookup_entity_slug ?? null}
            value={strVal}
            displayLabel={lookupLabel || (strVal && !isValidUUID(strVal) ? strVal : '')}
            readonly={readonly}
            inputBase={inputBase}
            ds={ds}
            borderCls={borderCls}
            label={label}
            onOpenRecord={onOpenRecord}
            onChange={handleChange}
            onLabelChange={onLookupLabelChange && control.field_logical_name
              ? (lbl) => onLookupLabelChange(control.field_logical_name!, lbl)
              : undefined}
            onBlur={handleBlur}
            lookupConfig={lookupConfig ?? control.lookup_config ?? null}
            formValues={formValues}
          />
        );
      }

      case 'multi_choice': {
        const choices = choiceOptions ?? [];
        let selected: string[] = [];
        if (Array.isArray(value)) {
          selected = (value as unknown[]).map(String).filter(Boolean);
        } else if (typeof value === 'string' && value.trim()) {
          const s = value.trim();
          if (s.startsWith('[')) {
            try { selected = (JSON.parse(s) as unknown[]).map(String).filter(Boolean); } catch { selected = [s]; }
          } else {
            selected = s.split(',').map((v) => v.trim()).filter(Boolean);
          }
        }

        const toggle = (val: string) => {
          if (readonly) return;
          const next = selected.includes(val)
            ? selected.filter((v) => v !== val)
            : [...selected, val];
          handleChange(next.length > 0 ? next : null);
          handleBlur();
        };

        if (readonly) {
          if (selected.length === 0) return <span className="text-slate-400 text-[13px]">—</span>;
          return (
            <div className="flex flex-wrap gap-1.5 py-1">
              {selected.map((v) => {
                const ch = choices.find((c) => c.value === v);
                return (
                  <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    {ch?.label ?? v}
                  </span>
                );
              })}
            </div>
          );
        }

        return <MultiChoiceDropdown choices={choices} selected={selected} onToggle={toggle} activeError={!!activeError} />;
      }

      case 'calculated': {
        const cfg = control.config_json as Record<string, unknown> | null | undefined;
        const hasDefinition = !!(cfg?.calculation || cfg?.formula);
        if (!hasDefinition) {
          return (
            <div className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-md text-slate-400">
              <Calculator size={12} className="shrink-0" />
              <span className="text-[12px] italic">No calculation configured</span>
            </div>
          );
        }
        const { value, resultType } = evaluateFieldCalc(cfg, formValues ?? {});
        return (
          <div className="flex items-center gap-2 px-2.5 py-2 bg-[#f0f4ff] border border-[#c7d9ff] rounded-md">
            <Calculator size={12} className="text-[#3b6fff] shrink-0" />
            <span className="text-[13px] font-semibold text-[#111827]">
              {formatCalcValue(value, resultType)}
            </span>
          </div>
        );
      }

      default:
        return (
          <input
            type="text"
            value={strVal}
            onChange={(e) => handleChange(e.target.value)}
            {...sharedBlurProps}
            disabled={readonly}
            placeholder={`Enter ${label.toLowerCase()}...`}
            className={inputBase}
          />
        );
    }
  };

  if (fieldType === 'boolean') {
    return (
      <div className={`flex flex-col ${ds.fieldGap} ${control.column_span === 2 ? 'col-span-2' : ''}`}>
        <label className={`flex items-center gap-1.5 ${ds.label} font-medium`}>
          <span className="text-slate-500">{label}</span>
          {required && <span className="text-red-500">*</span>}
          {isPermissionLocked && <span title="Read-only (restricted by your security role)" className="inline-flex"><Lock size={10} className="text-slate-300" /></span>}
        </label>
        <div className="relative">
          {renderInput()}
        </div>
        {activeError && !isPermissionLocked && (
          <p className="flex items-center gap-1 text-[11px] text-red-500">
            <AlertCircle size={11} className="shrink-0" />
            {activeError}
          </p>
        )}
      </div>
    );
  }

  if (isMasked) {
    return (
      <div className={`flex flex-col ${ds.fieldGap} ${control.column_span === 2 ? 'col-span-2' : ''}`}>
        <label className={`flex items-center gap-1.5 ${ds.label} font-medium`}>
          <span className="text-slate-500">{label}</span>
          <span title="You do not have permission to view this field" className="inline-flex"><EyeOff size={10} className="text-slate-300 ml-0.5" /></span>
        </label>
        <div className={`flex items-center gap-2 ${ds.input} border border-slate-200 rounded-md bg-slate-50 text-slate-400 select-none cursor-not-allowed`}>
          <span className="tracking-widest text-[15px] leading-none">••••••••</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${ds.fieldGap} ${control.column_span === 2 ? 'col-span-2' : ''}`}>
      <label className={`flex items-center gap-1.5 ${ds.label} font-medium`}>
        <span className={activeError ? 'text-red-600' : 'text-slate-500'}>{label}</span>
        {required && (
          <span
            className={`text-[10px] font-bold leading-none ${
              activeError ? 'text-red-500' : 'text-red-400'
            }`}
            title="Required"
          >
            *
          </span>
        )}
        {isPermissionLocked && (
          <span title="Read-only (restricted by your security role)" className="inline-flex">
            <Lock size={10} className="text-slate-400 ml-0.5" />
          </span>
        )}
        {helpText && !isPermissionLocked && (
          <HelpTooltip text={helpText} />
        )}
        {justSaved && !isPermissionLocked && (
          <CheckCircle2 size={11} className="ml-auto" style={{ color: 'var(--success)' }} />
        )}
      </label>

      <div className={`relative ${isPermissionLocked ? 'opacity-80' : ''}`}>
        {renderInput()}
        {isPermissionLocked && (
          <Lock
            size={11}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
          />
        )}
        {!isPermissionLocked && showInlineIcon && activeError && (
          <AlertCircle
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-400 pointer-events-none"
          />
        )}
        {!isPermissionLocked && showInlineIcon && justSaved && (
          <CheckCircle2
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--success)' }}
          />
        )}
      </div>

      {activeError && !isPermissionLocked ? (
        <p className="flex items-center gap-1 text-[11px] text-red-500 leading-tight">
          <AlertCircle size={11} className="shrink-0 mt-px" />
          {activeError}
        </p>
      ) : required && !touched && !isPermissionLocked ? (
        <p className="text-[10px] text-slate-400 leading-tight">Required</p>
      ) : null}
      {ruleMessage && !activeError && (
        <p className={`flex items-center gap-1 text-[11px] leading-tight ${
          ruleMessage.level === 'error'
            ? 'text-red-500'
            : ruleMessage.level === 'warning'
            ? 'text-amber-600'
            : 'text-blue-500'
        }`}>
          {ruleMessage.level === 'error'
            ? <AlertCircle size={11} className="shrink-0 mt-px" />
            : ruleMessage.level === 'warning'
            ? <AlertTriangle size={11} className="shrink-0 mt-px" />
            : <Info size={11} className="shrink-0 mt-px" />}
          {ruleMessage.text}
        </p>
      )}
    </div>
  );
}
