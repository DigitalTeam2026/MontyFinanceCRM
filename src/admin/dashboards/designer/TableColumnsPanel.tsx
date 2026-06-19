// Table-visual "Selected columns" editor (Data tab). Replaces the old checkbox
// list with a Power BI–style two-section experience:
//   • Available columns — searchable list of entity fields; click to add.
//   • Selected columns  — drag to reorder, toggle visibility, edit, remove.
// Each selected column expands into a full settings panel (General / Behavior /
// Formatting). The custom display label only renames the HEADER — the physical
// `field` is always what the query, sort and filter use.

import { useState } from 'react';
import {
  Search, Plus, Trash2, GripVertical, Eye, EyeOff, Pencil, ChevronDown, ChevronRight,
  RotateCcw, Type as TypeIcon, Hash, Calendar, ToggleLeft, Link2, List,
} from 'lucide-react';
import type { FieldDefinition } from '../../../types/field';
import type {
  TableColumnConfig, ColumnAlignment, ColumnTextTransform, ColumnDateFormat, NumberFormat,
} from '../types/dashboard';
import {
  makeColumn, headerLabel, normalizeFieldType, filterKindOf,
} from '../visuals/tableColumns';
import {
  PropertyField, PropertyToggle, PropertySelect, PropertyTextInput, PropertyNumberInput,
  propControlCls,
} from './PropertyControls';

interface Props {
  columns: TableColumnConfig[];
  fields: FieldDefinition[];
  entityLabel?: string;
  /** Persist the new column list (parent syncs query_config.columns too). */
  onChange: (cols: TableColumnConfig[]) => void;
}

function TypeIconFor({ dataType }: { dataType?: string }) {
  const cls = 'shrink-0 text-slate-500';
  switch (filterKindOf(dataType)) {
    case 'number': return <Hash size={12} className={cls} />;
    case 'date': return <Calendar size={12} className={cls} />;
    case 'boolean': return <ToggleLeft size={12} className={cls} />;
    case 'lookup': return <Link2 size={12} className={cls} />;
    case 'choice': return <List size={12} className={cls} />;
    default: return <TypeIcon size={12} className={cls} />;
  }
}

export default function TableColumnsPanel({ columns, fields, entityLabel, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const selectedFieldNames = new Set(columns.map((c) => c.field));
  const available = fields.filter((f) =>
    !selectedFieldNames.has(f.physical_column_name) &&
    (f.display_name.toLowerCase().includes(search.toLowerCase()) ||
      f.physical_column_name.toLowerCase().includes(search.toLowerCase())));

  const addField = (f: FieldDefinition) => onChange([...columns, makeColumn(f)]);
  const addAll = () => onChange([...columns, ...available.map(makeColumn)]);
  const removeCol = (id: string) => { onChange(columns.filter((c) => c.id !== id)); if (editing === id) setEditing(null); };
  const patchCol = (id: string, patch: Partial<TableColumnConfig>) =>
    onChange(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  // Drag-to-reorder (native HTML5 DnD).
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const from = columns.findIndex((c) => c.id === dragId);
    const to = columns.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
    setDragId(null);
  };

  return (
    <div className="space-y-3">
      {/* ── Selected columns ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-300 text-[11px] font-medium">Selected columns ({columns.length})</span>
          {columns.length > 0 && (
            <button onClick={() => onChange([])} className="text-[10px] text-slate-500 hover:text-red-400">Clear all</button>
          )}
        </div>
        <div className="rounded border border-slate-700 divide-y divide-slate-700/60 overflow-hidden">
          {columns.length === 0 && (
            <p className="text-slate-500 px-2 py-2 text-[11px]">No columns selected. Add fields below.</p>
          )}
          {columns.map((c) => {
            const isEditing = editing === c.id;
            return (
              <div key={c.id}
                draggable={c.reorderable !== false}
                onDragStart={() => setDragId(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(c.id)}
                className={`bg-slate-900/40 ${dragId === c.id ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-1.5 px-1.5 py-1">
                  <GripVertical size={13} className={`shrink-0 ${c.reorderable !== false ? 'text-slate-600 cursor-grab' : 'text-slate-800'}`} />
                  <TypeIconFor dataType={c.dataType} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[12px] text-slate-200" title={headerLabel(c)}>{headerLabel(c)}</p>
                    <p className="truncate text-[10px] text-slate-500" title={c.field}>Source: {c.field}</p>
                  </div>
                  <button onClick={() => patchCol(c.id, { visible: c.visible === false ? true : false })}
                    title={c.visible === false ? 'Hidden' : 'Visible'}
                    className={`shrink-0 ${c.visible === false ? 'text-slate-600' : 'text-slate-300'} hover:text-blue-400`}>
                    {c.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button onClick={() => setEditing(isEditing ? null : c.id)} title="Edit column"
                    className={`shrink-0 ${isEditing ? 'text-blue-400' : 'text-slate-400'} hover:text-blue-300`}>
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => removeCol(c.id)} title="Remove column" className="shrink-0 text-slate-500 hover:text-red-400">
                    <Trash2 size={12} />
                  </button>
                </div>
                {isEditing && (
                  <ColumnEditor column={c} fields={fields} entityLabel={entityLabel} onPatch={(p) => patchCol(c.id, p)} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Available columns ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-300 text-[11px] font-medium">Available columns</span>
          {available.length > 0 && (
            <button onClick={addAll} className="text-[10px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5">
              <Plus size={11} /> Add all
            </button>
          )}
        </div>
        <div className="relative mb-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search fields…"
            className={`${propControlCls} pl-7`} />
        </div>
        <div className="max-h-44 overflow-auto rounded border border-slate-700 p-1 space-y-0.5">
          {!fields.length && <p className="text-slate-500 px-1 py-0.5 text-[11px]">Select an entity first.</p>}
          {fields.length > 0 && available.length === 0 && (
            <p className="text-slate-500 px-1 py-0.5 text-[11px]">{search ? 'No matching fields.' : 'All fields added.'}</p>
          )}
          {available.map((f) => (
            <button key={f.field_definition_id} onClick={() => addField(f)}
              className="w-full flex items-center gap-2 px-1.5 py-1 hover:bg-slate-700/40 rounded text-left">
              <Plus size={12} className="shrink-0 text-blue-400" />
              <TypeIconFor dataType={normalizeFieldType(f)} />
              <span className="flex-1 truncate text-[12px] text-slate-200">{f.display_name}</span>
              <span className="text-[10px] text-slate-500 truncate max-w-[90px]" title={f.physical_column_name}>{f.physical_column_name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Per-column settings (General / Behavior / Formatting) ─────────────────────
function ColumnEditor({ column, fields, entityLabel, onPatch }: {
  column: TableColumnConfig; fields: FieldDefinition[]; entityLabel?: string;
  onPatch: (patch: Partial<TableColumnConfig>) => void;
}) {
  const [open, setOpen] = useState<'general' | 'behavior' | 'format' | null>('general');
  const field = fields.find((f) => f.physical_column_name === column.field);
  const kind = filterKindOf(column.dataType);
  const fmt = column.format ?? {};
  const setFmt = (patch: Partial<NonNullable<TableColumnConfig['format']>>) => onPatch({ format: { ...fmt, ...patch } });

  return (
    <div className="px-2 pb-2 pt-1 bg-slate-900/70 border-t border-slate-700/60 space-y-1.5">
      {/* General */}
      <Accordion label="General" open={open === 'general'} onToggle={() => setOpen(open === 'general' ? null : 'general')}>
        <PropertyField label="Display label" help="Header shown to users. The query still uses the field below.">
          <div className="flex gap-1">
            <PropertyTextInput value={column.displayLabel ?? ''} onChange={(v) => onPatch({ displayLabel: v })}
              placeholder={field?.display_name ?? column.field} />
            {field && (
              <button onClick={() => onPatch({ displayLabel: field.display_name })} title="Reset to metadata label"
                className="shrink-0 px-2 rounded-md border border-slate-600 bg-slate-900 text-slate-400 hover:text-blue-400">
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        </PropertyField>
        <PropertyField label="Source field"><p className="text-[11px] text-slate-400 px-0.5 py-1">{column.field}{entityLabel ? ` · ${entityLabel}` : ''}</p></PropertyField>
        <PropertyField label="Description / tooltip">
          <PropertyTextInput value={column.description ?? ''} onChange={(v) => onPatch({ description: v })} placeholder="Shown on header hover" />
        </PropertyField>
        <div className="grid grid-cols-3 gap-2">
          <PropertyField label="Width"><PropertyNumberInput value={column.width ?? 0} min={0} onChange={(n) => onPatch({ width: n || undefined })} placeholder="auto" /></PropertyField>
          <PropertyField label="Min width"><PropertyNumberInput value={column.minWidth ?? 0} min={0} onChange={(n) => onPatch({ minWidth: n || undefined })} placeholder="—" /></PropertyField>
          <PropertyField label="Max width"><PropertyNumberInput value={column.maxWidth ?? 0} min={0} onChange={(n) => onPatch({ maxWidth: n || undefined })} placeholder="—" /></PropertyField>
        </div>
        <PropertyField label="Alignment">
          <PropertySelect value={column.alignment ?? 'left'} onChange={(e) => onPatch({ alignment: e.target.value as ColumnAlignment })}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </PropertySelect>
        </PropertyField>
        <PropertyToggle label="Freeze / pin left" checked={column.pinned === 'left'} onChange={(v) => onPatch({ pinned: v ? 'left' : null })} />
        <PropertyToggle label="Visible" checked={column.visible !== false} onChange={(v) => onPatch({ visible: v })} />
      </Accordion>

      {/* Behavior */}
      <Accordion label="Behavior" open={open === 'behavior'} onToggle={() => setOpen(open === 'behavior' ? null : 'behavior')}>
        <PropertyToggle label="Sortable" checked={column.sortable !== false} onChange={(v) => onPatch({ sortable: v })} />
        <PropertyToggle label="Filterable" checked={column.filterable !== false} onChange={(v) => onPatch({ filterable: v })} />
        <PropertyToggle label="Resizable" checked={column.resizable !== false} onChange={(v) => onPatch({ resizable: v })} />
        <PropertyToggle label="Reorderable" checked={column.reorderable !== false} onChange={(v) => onPatch({ reorderable: v })} />
        <PropertyToggle label="Searchable" checked={column.searchable !== false} onChange={(v) => onPatch({ searchable: v })} />
      </Accordion>

      {/* Formatting (type-aware) */}
      <Accordion label="Formatting" open={open === 'format'} onToggle={() => setOpen(open === 'format' ? null : 'format')}>
        {kind === 'text' && (
          <PropertyField label="Text format">
            <PropertySelect value={fmt.text ?? 'none'} onChange={(e) => setFmt({ text: e.target.value as ColumnTextTransform })}>
              <option value="none">None</option><option value="uppercase">UPPERCASE</option>
              <option value="lowercase">lowercase</option><option value="capitalize">Capitalize</option>
            </PropertySelect>
          </PropertyField>
        )}
        {kind === 'number' && (
          <>
            <PropertyField label="Number format">
              <PropertySelect value={fmt.number ?? (column.dataType === 'currency' ? 'currency' : 'number')} onChange={(e) => setFmt({ number: e.target.value as NumberFormat })}>
                <option value="number">Number</option><option value="currency">Currency</option>
                <option value="percentage">Percentage</option><option value="compact">Compact</option>
              </PropertySelect>
            </PropertyField>
            <div className="grid grid-cols-2 gap-2">
              <PropertyField label="Decimals"><PropertyNumberInput value={fmt.decimals ?? 0} min={0} max={6} onChange={(n) => setFmt({ decimals: n })} /></PropertyField>
              {(fmt.number ?? '') === 'currency' && (
                <PropertyField label="Currency code"><PropertyTextInput value={fmt.currencyCode ?? 'USD'} onChange={(v) => setFmt({ currencyCode: v.toUpperCase() })} placeholder="USD" /></PropertyField>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PropertyField label="Prefix"><PropertyTextInput value={fmt.prefix ?? ''} onChange={(v) => setFmt({ prefix: v })} /></PropertyField>
              <PropertyField label="Suffix"><PropertyTextInput value={fmt.suffix ?? ''} onChange={(v) => setFmt({ suffix: v })} /></PropertyField>
            </div>
            <PropertyToggle label="Thousands separator" checked={fmt.thousands !== false} onChange={(v) => setFmt({ thousands: v })} />
          </>
        )}
        {kind === 'date' && (
          <PropertyField label="Date format">
            <PropertySelect value={fmt.dateFormat ?? 'medium'} onChange={(e) => setFmt({ dateFormat: e.target.value as ColumnDateFormat })}>
              <option value="short">Short (6/17/26)</option><option value="medium">Medium (Jun 17, 2026)</option>
              <option value="long">Long (June 17, 2026)</option><option value="relative">Relative (2 days ago)</option>
              <option value="iso">ISO (2026-06-17)</option>
            </PropertySelect>
          </PropertyField>
        )}
        {kind === 'boolean' && (
          <div className="grid grid-cols-2 gap-2">
            <PropertyField label="True label"><PropertyTextInput value={fmt.booleanTrue ?? 'Yes'} onChange={(v) => setFmt({ booleanTrue: v })} /></PropertyField>
            <PropertyField label="False label"><PropertyTextInput value={fmt.booleanFalse ?? 'No'} onChange={(v) => setFmt({ booleanFalse: v })} /></PropertyField>
          </div>
        )}
        {kind === 'lookup' && (
          <p className="text-[10px] text-slate-500 leading-snug flex items-start gap-1">
            <Link2 size={11} className="mt-px shrink-0" />
            Lookup columns show the related record's display name automatically (never the raw ID).
          </p>
        )}
        <PropertyField label="Empty value text"><PropertyTextInput value={fmt.emptyText ?? ''} onChange={(v) => setFmt({ emptyText: v })} placeholder="—" /></PropertyField>
      </Accordion>
    </div>
  );
}

function Accordion({ label, open, onToggle, children }: {
  label: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-slate-700/60 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700/30">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {label}
      </button>
      {open && <div className="px-2 pb-2 pt-1 space-y-2">{children}</div>}
    </div>
  );
}
