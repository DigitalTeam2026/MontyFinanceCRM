// Runtime Table / Record-list visual. Renders the per-column configuration
// (custom header labels, width, alignment, pinning, formatting) and provides the
// interactive header experience: a per-column header menu (sort / filter / hide /
// pin / auto-size / reset width), type-aware column filters that re-query the
// server, and an active-filter chip bar.
//
// Key contract (§12): the custom display label only changes the HEADER. The
// query, sort and filter always use the column's physical `field`. Lookup/choice/
// boolean values arrive already resolved to labels (see labelResolver), so cells
// show "MontyPay Point of Sale", never the raw GUID.

import { useEffect, useMemo, useState } from 'react';
import {
  Inbox, Check, Filter, ArrowUp, ArrowDown, MoreVertical, X, EyeOff, Pin, PinOff,
  Maximize2, RotateCcw, Search,
} from 'lucide-react';
import type {
  DashboardVisual, ThemeConfig, VisualFilter, OrderBySpec, FilterOp, TableColumnConfig,
} from '../types/dashboard';
import { pick } from './colorConfig';
import { formatLabel } from './formatValue';
import {
  effectiveColumns, makeColumnFromName, headerLabel, filterKindOf, opsForKind,
  NO_VALUE_OPS, RANGE_OPS, resolveDatePreset, type DatePresetOp,
} from './tableColumns';
import { getFilterFieldInfo, type FilterFieldInfo } from './labelResolver';
import AnchoredPopover from '../../../app/components/overlay/AnchoredPopover';
import FilterSelect from '../../../app/components/FilterSelect';
import type { RawValue } from './useCrossFilter';

interface Props {
  visual: DashboardVisual;
  theme: ThemeConfig;
  rows: Record<string, unknown>[];
  total?: number;
  emit: (fieldId: string | undefined, value: RawValue, native?: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean }, ordered?: RawValue[]) => void;
  highlight?: Set<string>;
  /** Active per-column filters (lifted into VisualRenderer so they re-query). */
  columnFilters: VisualFilter[];
  onColumnFiltersChange: (filters: VisualFilter[]) => void;
  /** Active single-column sort (lifted into VisualRenderer's query). */
  sort?: OrderBySpec;
  onSortChange: (sort: OrderBySpec | undefined) => void;
}

const rawOf = (r: Record<string, unknown>, key: string) =>
  (r.__raw as Record<string, unknown> | undefined)?.[key] ?? r[key];

const DEFAULT_WIDTH = 150;

export default function TableVisual({
  visual, theme, rows, total, emit, highlight, columnFilters, onColumnFiltersChange, sort, onSortChange,
}: Props) {
  const fmt = visual.format_config;
  const entity = visual.query_config.entity ?? '';

  // Configured (or legacy-derived) columns + per-session view overrides. When the
  // visual has no column config AND no legacy columns list, fall back to every
  // returned field (matches the old DataTable's "show everything" behaviour).
  const cols = useMemo(() => {
    const c = effectiveColumns(visual);
    if (c.length) return c;
    const first = rows[0];
    if (!first) return [];
    return Object.keys(first).filter((k) => k !== '__raw').map((k) => makeColumnFromName(k));
  }, [visual, rows]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [widthOverride, setWidthOverride] = useState<Record<string, number | undefined>>({});
  const [pinOverride, setPinOverride] = useState<Record<string, 'left' | null>>({});

  // Header menu + filter popover anchors (one open at a time, keyed by column id).
  // The anchor ELEMENT is held in state — reading a ref during the same render
  // would leave the popover unpositioned on first open.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [filterFor, setFilterFor] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);

  // Reset view overrides when the visual identity changes.
  useEffect(() => { setHidden(new Set()); setWidthOverride({}); setPinOverride({}); }, [visual.dashboard_visual_id]);

  const isPinned = (c: TableColumnConfig) => (c.id in pinOverride ? pinOverride[c.id] === 'left' : c.pinned === 'left');
  const widthOf = (c: TableColumnConfig) => (c.id in widthOverride ? widthOverride[c.id] : c.width);

  const visibleCols = cols.filter((c) => c.visible !== false && !hidden.has(c.id));
  // Pinned columns float to the left.
  const orderedCols = [...visibleCols].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)));

  // Sticky-left offsets for pinned columns (accumulated effective widths).
  const leftOffsets = new Map<string, number>();
  let acc = 0;
  for (const c of orderedCols) {
    if (!isPinned(c)) break;
    leftOffsets.set(c.id, acc);
    acc += widthOf(c) ?? DEFAULT_WIDTH;
  }

  if (!rows.length && !columnFilters.length) {
    return <Empty text={fmt.emptyMessage ?? 'No data'} color={fmt.emptyStateColor} theme={theme} />;
  }

  const keyCol = orderedCols[0]?.field;
  const ordered: RawValue[] = keyCol ? rows.map((r) => ({ raw: rawOf(r, keyCol), label: formatLabel(r[keyCol]) })) : [];

  // Colours (fall back to theme when unset).
  const headerBg = pick(fmt.headerBg, theme.surfaceBackground);
  const headerText = pick(fmt.headerTextColor, theme.secondaryText);
  const cellText = pick(fmt.cellTextColor, theme.primaryText);
  const borderC = pick(fmt.borderColor, theme.borderColor);
  const gridC = pick(fmt.gridLineColor, theme.gridLineColor);
  const totalBg = pick(fmt.totalRowBg, theme.surfaceBackground);
  const totalText = pick(fmt.totalRowTextColor, theme.secondaryText);
  const selBg = pick(fmt.selectedRowColor ?? fmt.selectedColor, theme.primaryAccent);
  const accent = pick(fmt.selectedColor, theme.primaryAccent);

  const filterByField = new Map(columnFilters.map((f) => [f.field, f]));

  const applyFilter = (field: string, filter: VisualFilter | null) => {
    const rest = columnFilters.filter((f) => f.field !== field);
    onColumnFiltersChange(filter ? [...rest, filter] : rest);
  };

  const toggleSort = (c: TableColumnConfig) => {
    if (c.sortable === false) return;
    if (sort?.key !== c.field) onSortChange({ key: c.field, dir: 'asc' });
    else if (sort.dir === 'asc') onSortChange({ key: c.field, dir: 'desc' });
    else onSortChange(undefined);
  };

  const menuCol = cols.find((c) => c.id === menuFor) ?? null;
  const filterCol = cols.find((c) => c.id === filterFor) ?? null;

  return (
    <div className="h-full w-full flex flex-col text-[12px]">
      {/* Active-filter chip bar (§10). */}
      {columnFilters.length > 0 && (
        <FilterChips columns={cols} filters={columnFilters} theme={theme}
          onClear={(field) => applyFilter(field, null)} onClearAll={() => onColumnFiltersChange([])} />
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse" style={{ tableLayout: 'auto' }}>
          <thead className="sticky top-0 z-10" style={{ background: headerBg }}>
            <tr>
              {orderedCols.map((c) => {
                const active = filterByField.has(c.field);
                const sorted = sort?.key === c.field ? sort.dir : undefined;
                const w = widthOf(c);
                const pinned = isPinned(c);
                return (
                  <th key={c.id} title={c.description || headerLabel(c)}
                    className="font-medium px-3 py-1.5 whitespace-nowrap select-none group"
                    style={{
                      color: headerText, borderBottom: `1px solid ${borderC}`,
                      textAlign: c.alignment ?? 'left',
                      width: w, minWidth: c.minWidth, maxWidth: c.maxWidth,
                      position: pinned ? 'sticky' : undefined, left: pinned ? leftOffsets.get(c.id) : undefined,
                      zIndex: pinned ? 11 : undefined, background: pinned ? headerBg : undefined,
                    }}>
                    <div className="flex items-center gap-1" style={{ justifyContent: c.alignment === 'right' ? 'flex-end' : c.alignment === 'center' ? 'center' : 'flex-start' }}>
                      <button onClick={() => toggleSort(c)} disabled={c.sortable === false}
                        className={`truncate ${c.sortable !== false ? 'cursor-pointer hover:underline' : 'cursor-default'}`}>
                        {headerLabel(c)}
                      </button>
                      {sorted === 'asc' && <ArrowUp size={11} className="shrink-0" />}
                      {sorted === 'desc' && <ArrowDown size={11} className="shrink-0" />}
                      {c.filterable !== false && (
                        <button
                          onClick={(e) => { const o = filterFor === c.id; setFilterFor(o ? null : c.id); setFilterAnchor(o ? null : e.currentTarget); setMenuFor(null); }}
                          title="Filter column"
                          className={`shrink-0 transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'}`}
                          style={{ color: active ? accent : 'inherit' }}>
                          <Filter size={11} fill={active ? accent : 'none'} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { const o = menuFor === c.id; setMenuFor(o ? null : c.id); setMenuAnchor(o ? null : e.currentTarget); setFilterFor(null); }}
                        title="Column options"
                        className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100">
                        <MoreVertical size={11} />
                      </button>
                      {c.resizable !== false && (
                        <ResizeHandle width={w ?? DEFAULT_WIDTH} onResize={(nw) => setWidthOverride((p) => ({ ...p, [c.id]: nw }))} />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const raw = keyCol ? rawOf(r, keyCol) : undefined;
              const selected = !!highlight?.has(String(raw));
              const baseBg = i % 2 === 1 ? (fmt.altRowBg ?? fmt.rowBg) : fmt.rowBg;
              const dim = highlight && highlight.size > 0 && !selected;
              return (
                <tr key={i} className="cursor-pointer transition-colors"
                  style={{ background: selected ? selBg : baseBg, opacity: dim ? 0.45 : 1, boxShadow: selected ? `inset 3px 0 0 ${accent}` : undefined }}
                  onMouseEnter={(e) => { if (!selected && fmt.hoverColor) e.currentTarget.style.background = fmt.hoverColor; }}
                  onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = baseBg ?? ''; }}
                  onClick={(e) => keyCol && emit(keyCol, { raw, label: formatLabel(r[keyCol]) }, e, ordered)}>
                  {orderedCols.map((c, ci) => {
                    const pinned = isPinned(c);
                    return (
                      <td key={c.id} className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{
                          color: cellText, borderBottom: `1px solid ${gridC}`,
                          textAlign: c.alignment ?? 'left', maxWidth: c.maxWidth ?? widthOf(c),
                          position: pinned ? 'sticky' : undefined, left: pinned ? leftOffsets.get(c.id) : undefined,
                          zIndex: pinned ? 1 : undefined, background: pinned ? (selected ? selBg : (baseBg ?? theme.cardBackground)) : undefined,
                        }}>
                        {ci === 0 && selected && <Check size={11} className="inline mr-1 -mt-0.5" />}
                        {formatCell(c, r)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="text-center text-[11px] py-4" style={{ color: theme.secondaryText }}>No rows match the current filter.</p>
        )}
      </div>

      {total != null && total > rows.length && (
        <p className="px-3 py-1.5 text-[11px] shrink-0" style={{ color: totalText, background: totalBg }}>{rows.length} of {total}</p>
      )}

      {/* Header options menu (§9). */}
      {menuCol && (
        <HeaderMenu anchor={menuAnchor} column={menuCol} theme={theme}
          sortDir={sort?.key === menuCol.field ? sort.dir : undefined}
          hasFilter={filterByField.has(menuCol.field)} pinned={isPinned(menuCol)}
          onClose={() => { setMenuFor(null); setMenuAnchor(null); }}
          onSort={(dir) => { onSortChange(dir ? { key: menuCol.field, dir } : undefined); setMenuFor(null); }}
          onFilter={() => { setFilterAnchor(menuAnchor); setMenuFor(null); setFilterFor(menuCol.id); }}
          onClearFilter={() => { applyFilter(menuCol.field, null); setMenuFor(null); }}
          onHide={() => { setHidden((p) => new Set(p).add(menuCol.id)); setMenuFor(null); }}
          onPin={(v) => { setPinOverride((p) => ({ ...p, [menuCol.id]: v ? 'left' : null })); setMenuFor(null); }}
          onAutoSize={() => { setWidthOverride((p) => ({ ...p, [menuCol.id]: undefined })); setMenuFor(null); }}
          onResetWidth={() => { setWidthOverride((p) => { const n = { ...p }; delete n[menuCol.id]; return n; }); setMenuFor(null); }} />
      )}

      {/* Per-column filter editor (§4/§5). */}
      {filterCol && (
        <ColumnFilterEditor anchor={filterAnchor} column={filterCol} entity={entity} theme={theme}
          current={filterByField.get(filterCol.field)}
          onClose={() => { setFilterFor(null); setFilterAnchor(null); }}
          onApply={(f) => { applyFilter(filterCol.field, f); setFilterFor(null); }}
          onClear={() => { applyFilter(filterCol.field, null); setFilterFor(null); }} />
      )}
    </div>
  );
}

// ── per-cell formatting ───────────────────────────────────────────────────────
function applyTextTransform(s: string, t?: string): string {
  switch (t) {
    case 'uppercase': return s.toUpperCase();
    case 'lowercase': return s.toLowerCase();
    case 'capitalize': return s.replace(/\b\w/g, (m) => m.toUpperCase());
    default: return s;
  }
}

function formatNum(value: unknown, col: TableColumnConfig): string {
  const f = col.format ?? {};
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  const mode = f.number ?? (col.dataType === 'currency' ? 'currency' : col.dataType === 'percentage' ? 'percentage' : 'number');
  const decimals = f.decimals ?? (mode === 'percentage' ? 1 : 0);
  let out: string;
  if (mode === 'currency') {
    out = new Intl.NumberFormat(undefined, { style: 'currency', currency: f.currencyCode || 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
  } else if (mode === 'percentage') {
    out = `${new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)}%`;
  } else if (mode === 'compact') {
    out = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } else {
    out = new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: f.thousands !== false }).format(n);
  }
  return `${f.prefix ?? ''}${out}${f.suffix ?? ''}`;
}

function formatDateCell(value: unknown, mode?: string): string {
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return formatLabel(value);
  switch (mode) {
    case 'short': return d.toLocaleDateString();
    case 'long': return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    case 'iso': return d.toISOString().slice(0, 10);
    case 'relative': {
      const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      if (days > 0) return `${days} days ago`;
      return `in ${-days} days`;
    }
    default: return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}

const TRUTHY = new Set(['true', 't', '1', 'yes', 'y']);
const FALSY = new Set(['false', 'f', '0', 'no', 'n']);

function formatCell(col: TableColumnConfig, row: Record<string, unknown>): string {
  const f = col.format ?? {};
  const empty = f.emptyText || '—';
  const display = row[col.field];
  const raw = rawOf(row, col.field);
  const kind = filterKindOf(col.dataType);

  if (kind === 'number') {
    if (raw == null || raw === '') return empty;
    return formatNum(raw, col);
  }
  if (display == null || display === '') return empty;
  switch (kind) {
    case 'date': return formatDateCell(display, f.dateFormat);
    case 'boolean': {
      if (f.booleanTrue || f.booleanFalse) {
        const s = String(raw).toLowerCase();
        if (TRUTHY.has(s) || raw === true) return f.booleanTrue || 'Yes';
        if (FALSY.has(s) || raw === false) return f.booleanFalse || 'No';
      }
      return formatLabel(display);
    }
    case 'text': return applyTextTransform(formatLabel(display), f.text);
    default: return formatLabel(display);   // lookup / choice — already resolved to a label
  }
}

// ── header options menu (§9) ──────────────────────────────────────────────────
function HeaderMenu({ anchor, column, theme, sortDir, hasFilter, pinned, onClose, onSort, onFilter, onClearFilter, onHide, onPin, onAutoSize, onResetWidth }: {
  anchor: HTMLElement | null; column: TableColumnConfig; theme: ThemeConfig;
  sortDir?: 'asc' | 'desc'; hasFilter: boolean; pinned: boolean;
  onClose: () => void; onSort: (dir: 'asc' | 'desc' | null) => void; onFilter: () => void;
  onClearFilter: () => void; onHide: () => void; onPin: (v: boolean) => void;
  onAutoSize: () => void; onResetWidth: () => void;
}) {
  const sortable = column.sortable !== false;
  const filterable = column.filterable !== false;
  const resizable = column.resizable !== false;
  return (
    <AnchoredPopover anchorEl={anchor} open onClose={onClose} role="menu" placement="bottom-end" minWidth={180}
      className="rounded-lg border shadow-xl py-1 text-[12px]"
      style={{ background: theme.cardBackground, borderColor: theme.borderColor, color: theme.primaryText }}>
      {sortable && <>
        <MenuItem icon={<ArrowUp size={12} />} label="Sort ascending" active={sortDir === 'asc'} onClick={() => onSort('asc')} theme={theme} />
        <MenuItem icon={<ArrowDown size={12} />} label="Sort descending" active={sortDir === 'desc'} onClick={() => onSort('desc')} theme={theme} />
        {sortDir && <MenuItem icon={<X size={12} />} label="Clear sort" onClick={() => onSort(null)} theme={theme} />}
        <Divider theme={theme} />
      </>}
      {filterable && <>
        <MenuItem icon={<Filter size={12} />} label="Filter…" onClick={onFilter} theme={theme} />
        {hasFilter && <MenuItem icon={<X size={12} />} label="Clear filter" onClick={onClearFilter} theme={theme} />}
        <Divider theme={theme} />
      </>}
      <MenuItem icon={<EyeOff size={12} />} label="Hide column" onClick={onHide} theme={theme} />
      {pinned
        ? <MenuItem icon={<PinOff size={12} />} label="Unpin" onClick={() => onPin(false)} theme={theme} />
        : <MenuItem icon={<Pin size={12} />} label="Pin left" onClick={() => onPin(true)} theme={theme} />}
      {resizable && <>
        <MenuItem icon={<Maximize2 size={12} />} label="Auto-size" onClick={onAutoSize} theme={theme} />
        <MenuItem icon={<RotateCcw size={12} />} label="Reset width" onClick={onResetWidth} theme={theme} />
      </>}
    </AnchoredPopover>
  );
}

function MenuItem({ icon, label, active, onClick, theme }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; theme: ThemeConfig;
}) {
  return (
    <button onClick={onClick} role="menuitem"
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-black/10"
      style={{ color: active ? theme.primaryAccent : theme.primaryText }}>
      <span className="shrink-0 opacity-70">{icon}</span>{label}{active && <Check size={11} className="ml-auto" />}
    </button>
  );
}

function Divider({ theme }: { theme: ThemeConfig }) {
  return <div className="my-1 border-t" style={{ borderColor: theme.borderColor }} />;
}

// ── per-column filter editor (§4/§5) ──────────────────────────────────────────
function ColumnFilterEditor({ anchor, column, entity, theme, current, onClose, onApply, onClear }: {
  anchor: HTMLElement | null; column: TableColumnConfig; entity: string; theme: ThemeConfig;
  current?: VisualFilter; onClose: () => void;
  onApply: (filter: VisualFilter) => void; onClear: () => void;
}) {
  const kind = filterKindOf(column.dataType);
  const ops = opsForKind(kind);
  const [op, setOp] = useState<string>(String(current?.op ?? ops[0].op));
  const [value, setValue] = useState<unknown>(current?.value ?? '');
  const [value2, setValue2] = useState<unknown>(current?.value2 ?? '');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(Array.isArray(current?.value) ? (current!.value as unknown[]).map(String) : current?.value != null ? [String(current!.value)] : []));
  const [info, setInfo] = useState<FilterFieldInfo | null>(null);
  const [optSearch, setOptSearch] = useState('');

  // Load label-driven options for choice / lookup / boolean columns.
  const needsOptions = kind === 'choice' || kind === 'lookup' || kind === 'boolean';
  useEffect(() => {
    if (!needsOptions || !entity) return;
    let alive = true;
    getFilterFieldInfo(entity, column.field).then((fi) => { if (alive) setInfo(fi); }).catch(() => { if (alive) setInfo({ kind: 'text', options: [] }); });
    return () => { alive = false; };
  }, [needsOptions, entity, column.field]);

  const inputCls = 'w-full px-2 py-1.5 text-[12px] rounded border';
  const inputStyle = { background: theme.surfaceBackground, borderColor: theme.borderColor, color: theme.primaryText };

  const commit = () => {
    if (NO_VALUE_OPS.has(op)) {
      // Date presets resolve to a concrete range; empty ops carry no value.
      if (['today', 'yesterday', 'this_week', 'this_month'].includes(op)) {
        const r = resolveDatePreset(op as DatePresetOp, new Date());
        onApply({ field: column.field, op: r.op, value: r.value, value2: r.value2 });
      } else {
        onApply({ field: column.field, op: op as FilterOp });
      }
      return;
    }
    if (kind === 'choice' || kind === 'lookup') {
      const vals = [...selected];
      if (!vals.length) { onClear(); return; }
      onApply({ field: column.field, op: (op === 'not_in' ? 'not_in' : 'in') as FilterOp, value: vals });
      return;
    }
    if (kind === 'boolean') {
      onApply({ field: column.field, op: 'eq', value });
      return;
    }
    if (op === 'relative') {
      const r = resolveDatePreset('relative', new Date(), Number(value) || 7);
      onApply({ field: column.field, op: r.op, value: r.value, value2: r.value2 });
      return;
    }
    if (RANGE_OPS.has(op)) {
      onApply({ field: column.field, op: op as FilterOp, value, value2 });
      return;
    }
    onApply({ field: column.field, op: op as FilterOp, value });
  };

  const filteredOpts = (info?.options ?? []).filter((o) => o.label.toLowerCase().includes(optSearch.toLowerCase()));
  const showValue = !NO_VALUE_OPS.has(op);

  return (
    <AnchoredPopover anchorEl={anchor} open onClose={onClose} role="dialog" placement="bottom-start" width={240}
      className="rounded-lg border shadow-xl p-2.5 space-y-2"
      style={{ background: theme.cardBackground, borderColor: theme.borderColor, color: theme.primaryText }}>
      <p className="text-[11px] font-medium truncate" title={headerLabel(column)}>{headerLabel(column)}</p>

      {kind === 'boolean' ? (
        <div className="space-y-1">
          {[{ v: 'true', l: 'Yes' }, { v: 'false', l: 'No' }].map((o) => (
            <label key={o.v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="bool" checked={String(value) === o.v} onChange={() => { setOp('eq'); setValue(o.v); }} />
              <span>{o.l}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="bool" checked={op === 'is_empty'} onChange={() => setOp('is_empty')} />
            <span>Is empty</span>
          </label>
        </div>
      ) : (
        <>
          <FilterSelect value={op} onChange={(e) => setOp(e.target.value)} className={inputCls} style={inputStyle}>
            {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
          </FilterSelect>

          {showValue && (kind === 'choice' || kind === 'lookup') && (
            <div className="space-y-1">
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
                <input value={optSearch} onChange={(e) => setOptSearch(e.target.value)} placeholder="Search…"
                  className={`${inputCls} pl-6`} style={inputStyle} />
              </div>
              <div className="max-h-40 overflow-auto rounded border" style={{ borderColor: theme.borderColor }}>
                {!info && <p className="px-2 py-1 text-[11px] opacity-60">Loading…</p>}
                {info && filteredOpts.length === 0 && <p className="px-2 py-1 text-[11px] opacity-60">No values.</p>}
                {filteredOpts.map((o) => {
                  const on = selected.has(o.value);
                  return (
                    <label key={o.value} className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-black/10">
                      <input type="checkbox" checked={on} onChange={() => setSelected((p) => { const n = new Set(p); if (on) n.delete(o.value); else n.add(o.value); return n; })} />
                      <span className="truncate text-[12px]" title={o.label}>{o.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {showValue && op === 'relative' && (
            <input type="number" min={1} value={String(value || 7)} onChange={(e) => setValue(e.target.value)}
              placeholder="Days" className={inputCls} style={inputStyle} />
          )}

          {showValue && kind !== 'choice' && kind !== 'lookup' && op !== 'relative' && (
            <div className="flex gap-1">
              <input type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'}
                value={String(value ?? '')} onChange={(e) => setValue(e.target.value)} placeholder="Value"
                className={inputCls} style={inputStyle} />
              {RANGE_OPS.has(op) && (
                <input type={kind === 'number' ? 'number' : 'date'}
                  value={String(value2 ?? '')} onChange={(e) => setValue2(e.target.value)} placeholder="To"
                  className={inputCls} style={inputStyle} />
              )}
            </div>
          )}
        </>
      )}

      <div className="flex gap-1.5 pt-0.5">
        <button onClick={commit} className="flex-1 px-2 py-1 rounded text-[12px] font-medium text-white" style={{ background: theme.primaryAccent }}>Apply</button>
        <button onClick={onClear} className="px-2 py-1 rounded text-[12px] border" style={{ borderColor: theme.borderColor }}>Clear</button>
      </div>
    </AnchoredPopover>
  );
}

// ── active-filter chips (§10) ─────────────────────────────────────────────────
const OP_LABEL: Record<string, string> = {
  eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', on: 'on', before: 'before',
  after: 'after', between: 'between', contains: 'contains', not_contains: 'not contains',
  starts_with: 'starts with', ends_with: 'ends with', is_empty: 'is empty',
  is_not_empty: 'is not empty', in: 'is any of', not_in: 'is not any of',
};

function FilterChips({ columns, filters, theme, onClear, onClearAll }: {
  columns: TableColumnConfig[]; filters: VisualFilter[]; theme: ThemeConfig;
  onClear: (field: string) => void; onClearAll: () => void;
}) {
  const labelFor = (field: string) => {
    const c = columns.find((x) => x.field === field);
    return c ? headerLabel(c) : field;
  };
  const valueText = (f: VisualFilter) => {
    if (NO_VALUE_OPS.has(String(f.op))) return '';
    if (Array.isArray(f.value)) return ` (${(f.value as unknown[]).length})`;
    if (f.op === 'between') return ` ${formatLabel(f.value)}–${formatLabel(f.value2)}`;
    return ` ${formatLabel(f.value)}`;
  };
  return (
    <div className="flex items-center gap-1 flex-wrap px-2 py-1.5 shrink-0 border-b" style={{ borderColor: theme.borderColor }}>
      <Filter size={11} style={{ color: theme.primaryAccent }} className="shrink-0" />
      {filters.map((f, i) => (
        <span key={`${f.field}-${i}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
          style={{ background: theme.surfaceBackground, color: theme.primaryText }}>
          <b className="font-medium">{labelFor(f.field)}</b>
          <span className="opacity-70">{OP_LABEL[String(f.op)] ?? f.op}{valueText(f)}</span>
          <button onClick={() => onClear(f.field)} className="opacity-60 hover:opacity-100"><X size={10} /></button>
        </span>
      ))}
      <button onClick={onClearAll} className="text-[10px] ml-1 opacity-70 hover:opacity-100" style={{ color: theme.primaryAccent }}>Clear all</button>
    </div>
  );
}

function Empty({ text, color, theme }: { text: string; color?: string; theme: ThemeConfig }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-1.5 text-center px-3" style={{ color: color || theme.secondaryText }}>
      <Inbox size={16} /><span className="text-[11px] leading-snug">{text}</span>
    </div>
  );
}

// ── header resize handle ──────────────────────────────────────────────────────
function ResizeHandle({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startW = width;
    const onMove = (ev: MouseEvent) => onResize(Math.max(40, startW + (ev.clientX - startX)));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.userSelect = ''; };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  };
  return <span onMouseDown={onDown} className="shrink-0 -mr-2 ml-auto w-1.5 h-4 cursor-col-resize opacity-0 group-hover:opacity-40 hover:!opacity-100 bg-current rounded" title="Drag to resize" />;
}
