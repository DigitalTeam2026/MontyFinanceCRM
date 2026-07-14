import { useState, useRef, useEffect, useCallback } from 'react';
import {
  GripVertical, Columns3, RotateCcw,
  Pencil, Check, X, Search, Plus, Trash2, Save, Loader2,
  Link2, ChevronLeft, Building2, SlidersHorizontal,
} from 'lucide-react';
import type { ListColumn } from '../services/listService';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { fetchRelationshipsForEntity } from '../../services/relationshipService';
import type { RelationshipDefinitionWithEntities } from '../../types/relationship';
import { fetchLookupFieldOptions } from '../services/lookupLabel';
import FilterSelect from './FilterSelect';

export interface ColumnState {
  key: string;
  label: string;
  visible: boolean;
  sortable?: boolean;
  type?: string;
  /** ID used when saving to a view_column record */
  field_definition_id?: string | null;
  /** If set, this column comes from a related entity via this relationship */
  relationship_definition_id?: string | null;
  /** Display name of the related entity (for badge) */
  related_entity_display_name?: string;
  /** Physical table name of the related entity (e.g. "account") — used for list join */
  related_table_name?: string;
  /** Physical FK column on the source table (e.g. "account_id") — used for list join */
  fk_physical_column?: string;
  /** Physical DB column of the field on the related table (e.g. "website") */
  field_physical_column?: string;
  /** User-defined label override */
  labelOverride?: string;
  /** Column width in pixels */
  width?: number | null;
  /** For lookup columns: the physical table to search when filtering (e.g. "account") */
  lookup_table?: string;
  /** For lookup columns: the primary display field on the lookup table (e.g. "account_name") */
  lookup_label_field?: string;
  /** Per-view override of which lookup field the filter searches/displays by.
   *  NULL/undefined = use entity primary field + fallbacks. */
  lookup_label_field_override?: string | null;
  /** For choice/option-set columns: the option_set.name used to load filter options */
  option_set_name?: string;
  /** For inline-choice columns: the choices stored directly in config_json */
  inline_choices?: { value: string; label: string; color?: string; icon?: string }[];
}

interface AvailableField {
  field_definition_id: string;
  logical_name: string;
  display_name: string;
  field_type_name?: string;
  physical_column_name?: string;
  lookup_table?: string;
  lookup_label_field?: string;
}

interface ColumnCustomizerProps {
  columns: ColumnState[];
  defaultColumns: ListColumn[];
  entityDefinitionId?: string | null;
  activeViewName?: string | null;
  isSystemView?: boolean;
  hasUnsavedChanges?: boolean;
  savingView?: boolean;
  onChange: (cols: ColumnState[]) => void;
  onClose: () => void;
  onSaveView?: () => void;
  isRedesign?: boolean;
}

type AddSubTab = 'current' | 'related';

export default function ColumnCustomizer({
  columns,
  defaultColumns,
  entityDefinitionId,
  activeViewName,
  isSystemView,
  hasUnsavedChanges,
  savingView,
  onChange,
  onClose,
  onSaveView,
  isRedesign = false,
}: ColumnCustomizerProps) {
  const [tab, setTab] = useState<'manage' | 'add'>('manage');
  const [addSubTab, setAddSubTab] = useState<AddSubTab>('current');
  const [selectedRelationship, setSelectedRelationship] = useState<RelationshipDefinitionWithEntities | null>(null);

  const [local, setLocal] = useState<ColumnState[]>(columns);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [search, setSearch] = useState('');

  const [currentFields, setCurrentFields] = useState<AvailableField[]>([]);
  const [relatedFields, setRelatedFields] = useState<AvailableField[]>([]);
  const [relationships, setRelationships] = useState<RelationshipDefinitionWithEntities[]>([]);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [loadingRelFields, setLoadingRelFields] = useState(false);

  // Per-column "filter/search by field" picker (lookup columns only)
  const [fieldPickerKey, setFieldPickerKey] = useState<string | null>(null);
  const [lookupFieldOpts, setLookupFieldOpts] = useState<Record<string, { value: string; label: string }[]>>({});
  const [loadingLookupTable, setLoadingLookupTable] = useState<string | null>(null);

  const dragIndex = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (panelRef.current && !panelRef.current.contains(target)) {
        // Don't close when interacting with a portaled overlay (e.g. the
        // FilterSelect dropdown for the per-column "filter by" field picker).
        if (target.closest?.('[data-overlay-portal]')) return;
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Load current entity fields when Add tab opens
  useEffect(() => {
    if (tab !== 'add' || !entityDefinitionId || currentFields.length > 0) return;
    setLoadingCurrent(true);
    fetchFieldsForEntity(entityDefinitionId)
      .then((fields) =>
        setCurrentFields(fields.map((f) => {
          const le = (f as unknown as Record<string, unknown>).lookup_entity as { physical_table_name?: string; primary_field_name?: string } | null;
          const lookupTable = le?.physical_table_name;
          const lookupLabel = lookupTable === 'crm_user' ? 'email' : le?.primary_field_name;
          return {
            field_definition_id: f.field_definition_id,
            logical_name: f.logical_name,
            display_name: f.display_name,
            field_type_name: (f.field_type as { name?: string } | null)?.name ?? undefined,
            physical_column_name: f.physical_column_name,
            lookup_table: lookupTable,
            lookup_label_field: lookupLabel,
          };
        }))
      )
      .catch(() => {})
      .finally(() => setLoadingCurrent(false));
  }, [tab, entityDefinitionId, currentFields.length]);

  // Load relationships when switching to Related sub-tab
  useEffect(() => {
    if (tab !== 'add' || addSubTab !== 'related' || !entityDefinitionId || relationships.length > 0) return;
    setLoadingRelated(true);
    fetchRelationshipsForEntity(entityDefinitionId)
      .then((rels) => {
        // Only N:1 lookups from this entity to another (meaningful for column joining)
        const n1 = rels.filter(
          (r) => r.relationship_type === 'N:1' && r.source_entity_id === entityDefinitionId
        );
        setRelationships(n1);
      })
      .catch(() => {})
      .finally(() => setLoadingRelated(false));
  }, [tab, addSubTab, entityDefinitionId, relationships.length]);

  // Load fields for selected related entity
  useEffect(() => {
    if (!selectedRelationship) { setRelatedFields([]); return; }
    setLoadingRelFields(true);
    fetchFieldsForEntity(selectedRelationship.target_entity_id)
      .then((fields) =>
        setRelatedFields(fields.map((f) => {
          const le = (f as unknown as Record<string, unknown>).lookup_entity as { physical_table_name?: string; primary_field_name?: string } | null;
          const lookupTable = le?.physical_table_name;
          const lookupLabel = lookupTable === 'crm_user' ? 'email' : le?.primary_field_name;
          return {
            field_definition_id: f.field_definition_id,
            logical_name: f.logical_name,
            display_name: f.display_name,
            field_type_name: (f.field_type as { name?: string } | null)?.name ?? undefined,
            physical_column_name: f.physical_column_name,
            lookup_table: lookupTable,
            lookup_label_field: lookupLabel,
          };
        }))
      )
      .catch(() => {})
      .finally(() => setLoadingRelFields(false));
  }, [selectedRelationship]);

  // Reset search when switching tabs/relationships
  useEffect(() => { setSearch(''); }, [tab, addSubTab, selectedRelationship]);

  const emit = useCallback((updated: ColumnState[]) => {
    setLocal(updated);
    onChange(updated);
  }, [onChange]);

  const removeColumn = (key: string) => {
    emit(local.map((c) => c.key === key ? { ...c, visible: false } : c));
  };

  const startEdit = (col: ColumnState) => {
    setEditingKey(col.key);
    setEditValue(col.labelOverride ?? col.label);
  };

  const commitEdit = (key: string) => {
    const trimmed = editValue.trim();
    emit(local.map((c) => c.key === key ? { ...c, labelOverride: trimmed || undefined } : c));
    setEditingKey(null);
  };

  const cancelEdit = () => setEditingKey(null);

  const loadLookupFieldOpts = useCallback(async (table: string) => {
    if (!table || lookupFieldOpts[table]) return;
    setLoadingLookupTable(table);
    try {
      const opts = await fetchLookupFieldOptions(table);
      setLookupFieldOpts((prev) => ({ ...prev, [table]: opts }));
    } catch { /* leave options empty on failure */ }
    finally { setLoadingLookupTable(null); }
  }, [lookupFieldOpts]);

  const toggleFieldPicker = (col: ColumnState) => {
    if (fieldPickerKey === col.key) { setFieldPickerKey(null); return; }
    setFieldPickerKey(col.key);
    if (col.lookup_table) loadLookupFieldOpts(col.lookup_table);
  };

  const setLookupOverride = (key: string, value: string | null) => {
    emit(local.map((c) => c.key === key
      // Fold the override into lookup_label_field so the grid + filter use it
      // immediately this session; on reload it's re-resolved from the stored override.
      ? { ...c, lookup_label_field_override: value, lookup_label_field: value || c.lookup_label_field }
      : c));
  };

  const onDragStart = (i: number) => { dragIndex.current = i; };
  const onDragEnter = (i: number) => {
    if (dragIndex.current === null || dragIndex.current === i) return;
    const updated = [...local.filter((c) => c.visible)];
    const hidden = local.filter((c) => !c.visible);
    const [moved] = updated.splice(dragIndex.current, 1);
    updated.splice(i, 0, moved);
    dragIndex.current = i;
    emit([...updated, ...hidden]);
  };
  const onDragEnd = () => { dragIndex.current = null; };

  const reset = () => {
    emit(defaultColumns.map((c) => ({
      key: c.key,
      label: c.label,
      visible: true,
      sortable: c.sortable,
      type: c.type,
      field_definition_id: c.field_definition_id ?? null,
      field_physical_column: c.field_physical_column,
      labelOverride: undefined,
      width: null,
    })));
  };

  const columnKey = (field: AvailableField, relId?: string) =>
    relId ? `rel:${relId}:${field.logical_name}` : field.logical_name;

  const addField = (field: AvailableField, relationship?: RelationshipDefinitionWithEntities) => {
    const key = columnKey(field, relationship?.relationship_definition_id);
    const relId = relationship?.relationship_definition_id ?? null;
    // Find existing column by key OR by field_definition_id + relationship
    const existing = local.find((c) =>
      c.key === key ||
      (c.field_definition_id === field.field_definition_id &&
        (c.relationship_definition_id ?? null) === relId)
    );
    if (existing) {
      // Re-show hidden column (already added, just not visible)
      emit(local.map((c) => (c.key === existing.key ? { ...c, visible: true } : c)));
    } else {
      const relLabel = relationship
        ? `${relationship.target_entity_display_name}: ${field.display_name}`
        : field.display_name;
      const resolvedType = mapFieldType(field.field_type_name, field.lookup_table);
      emit([
        ...local,
        {
          key,
          label: relLabel,
          visible: true,
          sortable: false,
          type: resolvedType,
          field_definition_id: field.field_definition_id,
          relationship_definition_id: relationship?.relationship_definition_id ?? null,
          related_entity_display_name: relationship?.target_entity_display_name,
          related_table_name: relationship?.target_entity_table_name,
          fk_physical_column: relationship?.lookup_field_physical_column,
          field_physical_column: field.physical_column_name,
          lookup_table: field.lookup_table,
          lookup_label_field: field.lookup_label_field,
          labelOverride: undefined,
          width: null,
        },
      ]);
    }
  };

  const isAdded = (field: AvailableField, relId?: string) => {
    const key = columnKey(field, relId);
    return local.some((c) => {
      if (!c.visible) return false;
      // Match by key (primary check)
      if (c.key === key) return true;
      // Match by field_definition_id + same relationship (covers key mismatches from saved views)
      if (
        c.field_definition_id &&
        c.field_definition_id === field.field_definition_id &&
        (c.relationship_definition_id ?? null) === (relId ?? null)
      ) return true;
      return false;
    });
  };

  const visibleCols = local.filter((c) => c.visible);

  const filterFields = (fields: AvailableField[]) =>
    fields.filter(
      (f) =>
        f.display_name.toLowerCase().includes(search.toLowerCase()) ||
        f.logical_name.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div
      ref={panelRef}
      className="absolute top-full left-0 mt-1 z-50 bg-white shadow-2xl overflow-hidden flex flex-col"
      style={{ width: 380, border: `1px solid ${isRedesign ? '#e7eaf1' : 'rgb(226,232,240)'}`, borderRadius: isRedesign ? 16 : 12 }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${isRedesign ? 'bg-[#f7f9fc] border-[#e7eaf1]' : 'bg-slate-50 border-slate-100'}`}>
        <div className="flex items-center gap-2">
          <Columns3 size={14} className="text-slate-500" />
          <span className="text-[13px] font-semibold text-slate-800">Edit Columns</span>
          {activeViewName && (
            <span className="text-[11px] text-slate-400 truncate max-w-[120px]">· {activeViewName}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={reset}
            title="Reset to default columns"
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition"
          >
            <RotateCcw size={11} />
            Reset
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-200 transition">
            <X size={14} className="text-slate-400" />
          </button>
        </div>
      </div>

      {/* Main tabs */}
      <div className="flex border-b border-slate-100 shrink-0">
        {(['manage', 'add'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[12px] font-medium transition ${
              tab === t
                ? isRedesign
                  ? 'text-[#3b6fff] border-b-2 border-[#3b6fff] bg-[#f0f4ff]'
                  : 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t === 'manage' ? `Current Columns (${visibleCols.length})` : 'Add Columns'}
          </button>
        ))}
      </div>

      {/* ── MANAGE TAB ── */}
      {tab === 'manage' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto" style={{ maxHeight: 360 }}>
            {visibleCols.length === 0 && (
              <p className="text-[12px] text-slate-400 text-center py-10">
                No visible columns. Use "Add Columns" to add some.
              </p>
            )}
            {visibleCols.map((col, i) => {
              const isEditing = editingKey === col.key;
              const displayLabel = col.labelOverride || col.label;
              const isRelated = !!col.relationship_definition_id;
              const isLookupCol = !!col.lookup_table && col.lookup_table !== 'crm_user' && !isRelated;
              const pickerOpen = fieldPickerKey === col.key;

              return (
                <div key={col.key} className="border-b border-slate-50">
                <div
                  draggable={!isEditing}
                  onDragStart={() => onDragStart(i)}
                  onDragEnter={() => onDragEnter(i)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 group transition-colors select-none"
                >
                  <GripVertical size={14} className="text-slate-300 group-hover:text-slate-400 shrink-0 cursor-grab active:cursor-grabbing" />

                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-1 min-w-0">
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(col.key);
                          if (e.key === 'Escape') cancelEdit();
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 px-2 py-1 text-[12px] border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder={col.label}
                      />
                      <button onClick={() => commitEdit(col.key)} className="p-0.5 text-blue-500 hover:text-blue-700 shrink-0">
                        <Check size={13} />
                      </button>
                      <button onClick={cancelEdit} className="p-0.5 text-slate-400 hover:text-slate-600 shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="text-[12px] font-medium text-slate-700 truncate">
                        {displayLabel}
                        {col.labelOverride && (
                          <span className="ml-1 text-[10px] text-blue-400 font-normal">(renamed)</span>
                        )}
                      </span>
                      {isRelated && col.related_entity_display_name && (
                        <span className="flex items-center gap-0.5 text-[10px] text-slate-400 mt-0.5">
                          <Link2 size={9} />
                          {col.related_entity_display_name}
                        </span>
                      )}
                    </div>
                  )}

                  {!isEditing && isLookupCol && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFieldPicker(col); }}
                      className={`p-1 transition shrink-0 ${
                        col.lookup_label_field_override || pickerOpen
                          ? 'opacity-100 text-blue-500'
                          : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600'
                      }`}
                      title="Choose which field this lookup is filtered / searched by (this view only)"
                    >
                      <SlidersHorizontal size={11} />
                    </button>
                  )}

                  {!isEditing && (
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(col); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-600 transition shrink-0"
                      title="Rename column"
                    >
                      <Pencil size={11} />
                    </button>
                  )}

                  <button
                    onClick={() => removeColumn(col.key)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition shrink-0"
                    title="Remove column"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {pickerOpen && isLookupCol && (
                  <div
                    className="px-3 pb-3 pt-1 bg-slate-50/70"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                      Filter / search this column by
                    </label>
                    {loadingLookupTable === col.lookup_table ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 py-1.5">
                        <Loader2 size={11} className="animate-spin" /> Loading fields…
                      </div>
                    ) : (
                      <FilterSelect
                        value={col.lookup_label_field_override ?? ''}
                        onChange={(e) => setLookupOverride(col.key, e.target.value || null)}
                        className="w-full px-2 py-1.5 text-[12px] border border-slate-200 rounded bg-white text-slate-700"
                      >
                        <option value="">Default (record name + fallbacks)</option>
                        {(lookupFieldOpts[col.lookup_table!] ?? []).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </FilterSelect>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">
                      Applies to this view only. Controls both the column filter list and the displayed text.
                    </p>
                  </div>
                )}
                </div>
              );
            })}
          </div>

          {local.some((c) => !c.visible) && (
            <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setTab('add')} className="text-[11px] text-blue-600 hover:underline">
                {local.filter((c) => !c.visible).length} hidden column{local.filter((c) => !c.visible).length !== 1 ? 's' : ''} — click Add Columns to restore
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── ADD COLUMNS TAB ── */}
      {tab === 'add' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub-tabs: Current Entity / Related */}
          <div className="flex border-b border-slate-100 bg-slate-50 shrink-0">
            {(['current', 'related'] as AddSubTab[]).map((st) => (
              <button
                key={st}
                onClick={() => { setAddSubTab(st); setSelectedRelationship(null); }}
                className={`flex-1 py-2 text-[11px] font-medium transition flex items-center justify-center gap-1.5 ${
                  addSubTab === st
                    ? 'text-blue-700 border-b-2 border-blue-500 bg-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {st === 'current' ? (
                  <><Columns3 size={11} /> Current Entity</>
                ) : (
                  <><Link2 size={11} /> Related</>
                )}
              </button>
            ))}
          </div>

          {/* Search bar */}
          {(addSubTab === 'current' || selectedRelationship) && (
            <div className="px-3 py-2 border-b border-slate-100 shrink-0">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search fields..."
                  className="w-full pl-7 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* ── Current Entity fields ── */}
          {addSubTab === 'current' && (
            <div className="flex-1 overflow-y-auto" style={{ maxHeight: 320 }}>
              {loadingCurrent && <Spinner />}
              {!loadingCurrent && !entityDefinitionId && <EmptyMsg text="No entity context available." />}
              {!loadingCurrent && filterFields(currentFields).length === 0 && entityDefinitionId && (
                <EmptyMsg text="No fields found." />
              )}
              {!loadingCurrent && filterFields(currentFields).map((field) => {
                const added = isAdded(field);
                return (
                  <FieldRow
                    key={field.field_definition_id}
                    field={field}
                    added={added}
                    onAdd={() => addField(field)}
                  />
                );
              })}
            </div>
          )}

          {/* ── Related: pick a relationship ── */}
          {addSubTab === 'related' && !selectedRelationship && (
            <div className="flex-1 overflow-y-auto" style={{ maxHeight: 320 }}>
              {loadingRelated && <Spinner />}
              {!loadingRelated && relationships.length === 0 && (
                <EmptyMsg text="No N:1 lookup relationships found for this entity." />
              )}
              {!loadingRelated && relationships.map((rel) => (
                <button
                  key={rel.relationship_definition_id}
                  onClick={() => setSelectedRelationship(rel)}
                  className="w-full flex items-center gap-3 px-3 py-3 hover:bg-slate-50 border-b border-slate-50 transition-colors text-left group"
                >
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Building2 size={14} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-slate-700 truncate">{rel.target_entity_display_name}</p>
                    <p className="text-[10px] text-slate-400 truncate">via {rel.lookup_field_display_name ?? rel.display_name}</p>
                  </div>
                  <ChevronLeft size={13} className="text-slate-300 group-hover:text-slate-500 rotate-180 shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          )}

          {/* ── Related: fields for selected relationship ── */}
          {addSubTab === 'related' && selectedRelationship && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Back breadcrumb */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-blue-50/40 shrink-0">
                <button
                  onClick={() => { setSelectedRelationship(null); setSearch(''); }}
                  className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                >
                  <ChevronLeft size={12} />
                  Related
                </button>
                <span className="text-[11px] text-slate-400">/</span>
                <span className="text-[11px] font-semibold text-slate-700 truncate">
                  {selectedRelationship.target_entity_display_name}
                </span>
                <span className="ml-auto text-[10px] text-slate-400 truncate max-w-[120px]">
                  via {selectedRelationship.lookup_field_display_name ?? selectedRelationship.display_name}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto" style={{ maxHeight: 280 }}>
                {loadingRelFields && <Spinner />}
                {!loadingRelFields && filterFields(relatedFields).length === 0 && (
                  <EmptyMsg text="No fields found." />
                )}
                {!loadingRelFields && filterFields(relatedFields).map((field) => {
                  const added = isAdded(field, selectedRelationship.relationship_definition_id);
                  return (
                    <FieldRow
                      key={field.field_definition_id}
                      field={field}
                      added={added}
                      onAdd={() => addField(field, selectedRelationship)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-slate-100 bg-slate-50 shrink-0">
        {activeViewName && !isSystemView ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {hasUnsavedChanges && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              )}
              <p className="text-[11px] text-slate-500 truncate">
                {hasUnsavedChanges ? 'Unsaved changes' : 'No unsaved changes'}
              </p>
            </div>
            <button
              onClick={onSaveView}
              disabled={savingView || !hasUnsavedChanges}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md transition shrink-0 ${
                hasUnsavedChanges
                  ? 'text-white'
                  : 'text-slate-400 bg-slate-100 cursor-default'
              } disabled:opacity-60`}
              style={hasUnsavedChanges && isRedesign
                ? { background: 'linear-gradient(135deg,#3b6fff,#22d3ee)', borderRadius: 8 }
                : hasUnsavedChanges
                ? { background: '#2563eb' }
                : undefined}
              onMouseEnter={(e) => { if (hasUnsavedChanges && isRedesign) e.currentTarget.style.filter = 'brightness(1.07)'; }}
              onMouseLeave={(e) => { if (isRedesign) e.currentTarget.style.filter = ''; }}
            >
              {savingView ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              Save Changes
            </button>
          </div>
        ) : (
          <p className="text-[10px] text-slate-400">
            {tab === 'manage'
              ? 'Drag to reorder · pencil to rename · trash to remove'
              : addSubTab === 'related' && selectedRelationship
                ? `Adding fields from ${selectedRelationship.target_entity_display_name}`
                : 'Select fields to add to this view'}
          </p>
        )}
      </div>
    </div>
  );
}

function FieldRow({ field, added, onAdd }: { field: AvailableField; added: boolean; onAdd: () => void }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 group border-b border-slate-50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className={`text-[12px] font-medium truncate ${added ? 'text-slate-400' : 'text-slate-700'}`}>
          {field.display_name}
        </p>
        <p className="text-[10px] text-slate-400">{field.field_type_name ?? field.logical_name}</p>
      </div>
      {added ? (
        <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium shrink-0">
          <Check size={11} />
          Added
        </span>
      ) : (
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 opacity-0 group-hover:opacity-100 transition shrink-0"
        >
          <Plus size={12} />
          Add
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 size={16} className="animate-spin text-slate-400" />
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return <p className="text-[12px] text-slate-400 text-center py-10">{text}</p>;
}

function mapFieldType(fieldTypeName?: string, lookupTable?: string): string {
  if (!fieldTypeName) return 'text';
  const n = fieldTypeName.toLowerCase();
  if (n === 'currency' || n === 'decimal' || n === 'integer' || n === 'number' || n === 'whole_number') return 'currency';
  if (n === 'date' || n === 'datetime') return 'date';
  if (n === 'phone') return 'phone';
  if (n === 'option_set' || n === 'optionset' || n === 'status' || n === 'choice' || n === 'multi_choice' || n === 'multi_option_set' || n === 'picklist') return 'badge';
  if (n === 'boolean' || n === 'two_options' || n === 'twooptions') return 'boolean';
  if (n === 'lookup') return lookupTable === 'crm_user' ? 'owner' : 'lookup';
  if (n === 'email' || n === 'url' || n === 'text' || n === 'textarea' || n === 'long_text') return 'text';
  return 'text';
}
