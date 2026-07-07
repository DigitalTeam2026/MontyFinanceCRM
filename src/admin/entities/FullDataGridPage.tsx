import { uuid } from '../../lib/uuid';
import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Save, RefreshCw, Download, X, ChevronDown, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown, Trash2, Search, Filter, Columns3, Pencil, RotateCcw,
  ChevronsLeft, ChevronsRight, ChevronRight as BreadcrumbChevron,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { EntityDefinition } from '../../types/entity';
import type { FieldDefinition } from '../../types/field';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { getTableColumns } from '../../app/services/recordService';
import ColumnSelectorPanel, { getFieldTypeIcon } from './ColumnSelectorPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import ColumnFilterDropdown, {
  type ColumnFilter,
  applyColumnFilters,
  getFilterSummary,
} from './ColumnFilterDropdown';

/** Cached metadata for a lookup field's target entity */
interface LookupMeta {
  table: string;
  pk: string;
  labelField: string;
  entityName: string;
}

/** Cache: fieldDefinitionId -> Map<fkValue, displayLabel> */
type LookupDisplayCache = Map<string, Map<string, string>>;

interface FullDataGridPageProps {
  entity: EntityDefinition;
  onBack: () => void;
}

type RecordRow = Record<string, unknown> & { _pk: string };
type SortDir = 'asc' | 'desc' | null;
interface SortState { field: string; dir: SortDir }
type EditMap = Map<string, Map<string, unknown>>;
/** An unsaved row being created inline. localId is a client-side key (not the DB PK). */
interface NewRow { localId: string; data: Record<string, unknown> }

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200];
const ALPHA = 'All,#,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z'.split(',');
const AVATAR_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
  '#e11d48', '#0ea5e9', '#84cc16', '#a855f7', '#d946ef',
];

export default function FullDataGridPage({ entity, onBack }: FullDataGridPageProps) {
  const [allFields, setAllFields] = useState<FieldDefinition[]>([]);
  const [visibleFieldIds, setVisibleFieldIds] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sort, setSort] = useState<SortState>({ field: '', dir: null });
  const [edits, setEdits] = useState<EditMap>(new Map());
  const [editingCell, setEditingCell] = useState<{ pk: string; fieldId: string } | null>(null);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  // localId -> error message for new rows whose insert failed (kept visible).
  const [newRowErrors, setNewRowErrors] = useState<Map<string, string>>(new Map());
  // Summary of the last save attempt's failures, shown as a dismissable banner.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Which column backs soft-delete for this table (resolved at load time):
  // 'deleted_at' (preferred), legacy 'is_deleted', or null (hard-delete only).
  const [softDeleteCol, setSoftDeleteCol] = useState<'deleted_at' | 'is_deleted' | null>(null);
  // Recycle-bin toggle — 'active' shows live rows, 'deleted' shows the bin.
  const [viewMode, setViewMode] = useState<'active' | 'deleted'>('active');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [alphaFilter, setAlphaFilter] = useState('All');
  const [keyword, setKeyword] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [activeFilterField, setActiveFilterField] = useState<{ field: FieldDefinition; rect: DOMRect } | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [lookupMeta, setLookupMeta] = useState<Map<string, LookupMeta>>(new Map());
  const [lookupCache, setLookupCache] = useState<LookupDisplayCache>(new Map());

  const resizingRef = useRef<{ fieldId: string; startX: number; startW: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const table = entity.physical_table_name;
  const pk = guessPK(entity);

  const loadPreferences = useCallback(async (entityId: string, allF: FieldDefinition[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return defaultVisibleFields(allF);
    const { data } = await supabase
      .from('admin_grid_column_pref')
      .select('visible_field_ids, column_order, column_widths')
      .eq('entity_definition_id', entityId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (data?.visible_field_ids && Array.isArray(data.visible_field_ids) && data.visible_field_ids.length > 0) {
      const order = (data.column_order as string[] | null) ?? data.visible_field_ids as string[];
      setColumnWidths((data.column_widths as Record<string, number>) ?? {});
      return order.filter((id: string) => allF.some((f) => f.field_definition_id === id && f.is_active));
    }
    return defaultVisibleFields(allF);
  }, []);

  const savePreferences = useCallback(async (entityId: string, fieldIds: string[], widths: Record<string, number>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('admin_grid_column_pref')
      .upsert({
        entity_definition_id: entityId,
        user_id: user.id,
        visible_field_ids: fieldIds,
        column_order: fieldIds,
        column_widths: widths,
        modified_at: new Date().toISOString(),
      }, { onConflict: 'entity_definition_id,user_id' });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const allF = await fetchFieldsForEntity(entity.entity_definition_id);
      const active = allF.filter((f) => f.is_active);
      setAllFields(active);
      const visIds = await loadPreferences(entity.entity_definition_id, active);
      setVisibleFieldIds(visIds);

      // Resolve the soft-delete column from the live schema (cached). Prefer the
      // standard deleted_at timestamp; fall back to a legacy is_deleted boolean.
      const tCols = await getTableColumns(table);
      const sdCol: 'deleted_at' | 'is_deleted' | null =
        tCols.has('deleted_at') ? 'deleted_at' : tCols.has('is_deleted') ? 'is_deleted' : null;
      setSoftDeleteCol(sdCol);
      // A table with no soft-delete column can't have a recycle bin — force active.
      const mode = sdCol ? viewMode : 'active';

      const primaryField = active.find((f) => f.physical_column_name === entity.primary_field_name || f.logical_name === 'name');

      let countQuery = supabase.from(table).select('*', { count: 'exact', head: true });
      if (sdCol === 'deleted_at') countQuery = mode === 'deleted' ? countQuery.not('deleted_at', 'is', null) : countQuery.is('deleted_at', null);
      else if (sdCol === 'is_deleted') countQuery = countQuery.eq('is_deleted', mode === 'deleted');
      if (alphaFilter !== 'All' && primaryField) {
        if (alphaFilter === '#') countQuery = countQuery.not(primaryField.physical_column_name, 'like', 'A%');
        else countQuery = countQuery.ilike(primaryField.physical_column_name, `${alphaFilter}%`);
      }
      if (keyword && primaryField) {
        countQuery = countQuery.ilike(primaryField.physical_column_name, `%${keyword}%`);
      }
      countQuery = applyColumnFilters(countQuery, columnFilters, active);
      const countRes = await countQuery;
      setTotalCount(countRes.count ?? 0);

      let query = supabase.from(table).select('*').range(page * rowsPerPage, (page + 1) * rowsPerPage - 1);
      if (sdCol === 'deleted_at') query = mode === 'deleted' ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
      else if (sdCol === 'is_deleted') query = query.eq('is_deleted', mode === 'deleted');
      if (alphaFilter !== 'All' && primaryField) {
        if (alphaFilter === '#') query = query.not(primaryField.physical_column_name, 'like', 'A%');
        else query = query.ilike(primaryField.physical_column_name, `${alphaFilter}%`);
      }
      if (keyword && primaryField) {
        query = query.ilike(primaryField.physical_column_name, `%${keyword}%`);
      }
      query = applyColumnFilters(query, columnFilters, active);

      if (sort.field && sort.dir) {
        const sf = active.find((f) => f.field_definition_id === sort.field);
        if (sf) query = query.order(sf.physical_column_name, { ascending: sort.dir === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecords((data ?? []).map((r: Record<string, unknown>) => ({ ...r, _pk: String(r[pk] ?? '') })));
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [entity, table, pk, sort, page, rowsPerPage, alphaFilter, keyword, columnFilters, viewMode, loadPreferences]);

  useEffect(() => { loadData(); }, [loadData]);

  // Switching to a different entity resets the recycle-bin view + selection.
  useEffect(() => {
    setViewMode('active');
    setSelectedRows(new Set());
  }, [entity.entity_definition_id]);

  // Resolve lookup metadata (target table, PK, label field) for all lookup fields
  useEffect(() => {
    const lookupFields = allFields.filter(
      (f) => (f.field_type?.name === 'lookup' || f.field_type?.name === 'owner') && f.lookup_entity_id
    );
    if (lookupFields.length === 0) return;
    const entityIds = [...new Set(lookupFields.map((f) => f.lookup_entity_id!))];
    supabase
      .from('entity_definition')
      .select('entity_definition_id, physical_table_name, primary_field_name, display_name, logical_name, is_custom')
      .in('entity_definition_id', entityIds)
      .then(({ data }) => {
        if (!data) return;
        const entMap = new Map(data.map((e) => [e.entity_definition_id, e]));
        const meta = new Map<string, LookupMeta>();
        for (const f of lookupFields) {
          const ent = entMap.get(f.lookup_entity_id!);
          if (!ent) continue;
          const tbl = ent.physical_table_name;
          // Custom entities key on `<logical_name>_id` (not `<table>_id`); mirror guessPK.
          const pkName = PK_OVERRIDES[tbl] ?? (ent.is_custom ? `${ent.logical_name}_id` : `${tbl}_id`);
          const labelField = tbl === 'crm_user' ? 'email' : (ent.primary_field_name ?? 'name');
          meta.set(f.field_definition_id, { table: tbl, pk: pkName, labelField, entityName: ent.display_name });
        }
        setLookupMeta(meta);
      });
  }, [allFields]);

  // Resolve lookup display values whenever records or lookup metadata change
  useEffect(() => {
    if (lookupMeta.size === 0 || records.length === 0) return;
    const toResolve = new Map<string, { meta: LookupMeta; fkValues: Set<string> }>();
    for (const [fieldId, meta] of lookupMeta) {
      const field = allFields.find((f) => f.field_definition_id === fieldId);
      if (!field) continue;
      const fkValues = new Set<string>();
      for (const record of records) {
        const val = record[field.physical_column_name];
        if (val && typeof val === 'string' && val.length > 0) fkValues.add(val);
      }
      if (fkValues.size > 0) toResolve.set(fieldId, { meta, fkValues });
    }
    if (toResolve.size === 0) return;

    Promise.all(
      [...toResolve.entries()].map(async ([fieldId, { meta, fkValues }]) => {
        const ids = [...fkValues];
        const { data } = await supabase
          .from(meta.table)
          .select(`${meta.pk}, ${meta.labelField}`)
          .in(meta.pk, ids);
        const map = new Map<string, string>();
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
          map.set(String(row[meta.pk]), String(row[meta.labelField] ?? ''));
        }
        return [fieldId, map] as [string, Map<string, string>];
      })
    ).then((results) => {
      setLookupCache((prev) => {
        const next = new Map(prev);
        for (const [fieldId, map] of results) next.set(fieldId, map);
        return next;
      });
    });
  }, [lookupMeta, records, allFields]);

  const visibleFields = useMemo(() => orderFieldsByIds(allFields, visibleFieldIds), [allFields, visibleFieldIds]);
  const hiddenCount = allFields.length - visibleFieldIds.length;
  const hasEdits = edits.size > 0 || newRows.length > 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const rangeStart = totalCount === 0 ? 0 : page * rowsPerPage + 1;
  const rangeEnd = Math.min((page + 1) * rowsPerPage, totalCount);
  const allSelected = records.length > 0 && records.every((r) => selectedRows.has(r._pk));

  const getCellValue = (record: RecordRow, field: FieldDefinition): unknown => {
    const rowEdits = edits.get(record._pk);
    if (rowEdits?.has(field.field_definition_id)) return rowEdits.get(field.field_definition_id);
    if (field.physical_column_name.startsWith('custom_fields.')) {
      const cfKey = field.physical_column_name.replace('custom_fields.', '');
      const cf = record.custom_fields as Record<string, unknown> | null;
      return cf?.[cfKey] ?? '';
    }
    return record[field.physical_column_name] ?? '';
  };

  const setCellValue = (rowPk: string, fieldId: string, value: unknown) => {
    setEdits((prev) => {
      const next = new Map(prev);
      const row = next.get(rowPk) ?? new Map();
      row.set(fieldId, value);
      next.set(rowPk, row);
      return next;
    });
  };

  const addNewRow = () => {
    setNewRows((prev) => [...prev, { localId: uuid(), data: {} }]);
  };

  const updateNewRow = (localId: string, fieldId: string, value: unknown) => {
    setNewRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, data: { ...r.data, [fieldId]: value } } : r)));
  };

  const removeNewRow = (localId: string) => {
    setNewRows((prev) => prev.filter((r) => r.localId !== localId));
    setNewRowErrors((prev) => {
      if (!prev.has(localId)) return prev;
      const next = new Map(prev);
      next.delete(localId);
      return next;
    });
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const tCols = await getTableColumns(table);
      const failures: string[] = [];

      // ── Insert each new row independently so one failure doesn't block the rest.
      // Successfully inserted rows are dropped; failed rows stay visible with their error.
      const remainingNewRows: NewRow[] = [];
      const nextRowErrors = new Map<string, string>();
      for (const nr of newRows) {
        const insertData: Record<string, unknown> = {};
        for (const f of visibleFields) {
          const val = nr.data[f.field_definition_id];
          if (val !== undefined && val !== '') {
            if (f.physical_column_name.startsWith('custom_fields.')) {
              if (!insertData.custom_fields) insertData.custom_fields = {};
              const cfKey = f.physical_column_name.replace('custom_fields.', '');
              (insertData.custom_fields as Record<string, unknown>)[cfKey] = val;
            } else {
              insertData[f.physical_column_name] = val;
            }
          }
        }
        if (user && tCols.has('created_by')) insertData.created_by = user.id;
        if (user && tCols.has('owner_id')) insertData.owner_id = user.id;
        if (user && tCols.has('owner_type')) insertData.owner_type = 'user';

        const { error } = await supabase.from(table).insert(insertData);
        if (error) {
          remainingNewRows.push(nr);
          nextRowErrors.set(nr.localId, error.message);
          failures.push(error.message);
        }
      }

      // ── Apply edits to existing rows; keep failed edits so they stay visible.
      const remainingEdits: EditMap = new Map();
      for (const [rowPk, rowEdits] of edits.entries()) {
        const updateData: Record<string, unknown> = {};
        const cfPatch: Record<string, unknown> = {};
        for (const [fieldId, value] of rowEdits.entries()) {
          const field = allFields.find((f) => f.field_definition_id === fieldId);
          if (!field) continue;
          if (field.physical_column_name.startsWith('custom_fields.')) {
            cfPatch[field.physical_column_name.replace('custom_fields.', '')] = value === '' ? null : value;
          } else {
            updateData[field.physical_column_name] = value === '' ? null : value;
          }
        }
        if (Object.keys(cfPatch).length > 0) {
          const existing = records.find((r) => r._pk === rowPk);
          updateData.custom_fields = { ...((existing?.custom_fields as Record<string, unknown>) ?? {}), ...cfPatch };
        }
        if (tCols.has('modified_at')) updateData.modified_at = new Date().toISOString();
        if (user && tCols.has('modified_by')) updateData.modified_by = user.id;

        const { error } = await supabase.from(table).update(updateData).eq(pk, rowPk);
        if (error) {
          remainingEdits.set(rowPk, rowEdits);
          failures.push(error.message);
        }
      }

      setNewRows(remainingNewRows);
      setNewRowErrors(nextRowErrors);
      setEdits(remainingEdits);
      setEditingCell(null);
      setSaveError(failures.length ? failures.join(' · ') : null);

      // Refresh so saved records (and the updated count) come straight from the DB.
      // Any rows that failed remain in state and stay rendered above the grid.
      await loadData();
    } finally { setSaving(false); }
  };

  const handleCancelEdits = () => {
    setEdits(new Map());
    setNewRows([]);
    setNewRowErrors(new Map());
    setSaveError(null);
    setEditingCell(null);
  };

  // Delete the selected rows. Tables with a soft-delete column are soft-deleted
  // (moved to the recycle bin); all others are hard-deleted. Used in Active view.
  const handleDeleteSelected = async () => {
    const ids = [...selectedRows];
    if (ids.length === 0) return;
    setDeleting(true);
    setSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const tCols = await getTableColumns(table);
      let error;
      if (softDeleteCol) {
        const patch: Record<string, unknown> =
          softDeleteCol === 'deleted_at' ? { deleted_at: new Date().toISOString() } : { is_deleted: true };
        if (tCols.has('modified_at')) patch.modified_at = new Date().toISOString();
        if (user && tCols.has('modified_by')) patch.modified_by = user.id;
        ({ error } = await supabase.from(table).update(patch).in(pk, ids));
      } else {
        ({ error } = await supabase.from(table).delete().in(pk, ids));
      }
      if (error) { setSaveError(error.message); return; }
      setSelectedRows(new Set());
      setDeleteConfirm(false);
      await loadData();
    } finally {
      setDeleting(false);
    }
  };

  // Restore the selected soft-deleted rows (clear the soft-delete column).
  const handleRestoreSelected = async () => {
    const ids = [...selectedRows];
    if (ids.length === 0 || !softDeleteCol) return;
    setDeleting(true);
    setSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const tCols = await getTableColumns(table);
      const patch: Record<string, unknown> =
        softDeleteCol === 'deleted_at' ? { deleted_at: null } : { is_deleted: false };
      if (tCols.has('modified_at')) patch.modified_at = new Date().toISOString();
      if (user && tCols.has('modified_by')) patch.modified_by = user.id;
      const { error } = await supabase.from(table).update(patch).in(pk, ids);
      if (error) { setSaveError(error.message); return; }
      setSelectedRows(new Set());
      await loadData();
    } finally {
      setDeleting(false);
    }
  };

  // Permanently delete the selected rows (recycle bin → Delete forever).
  const handlePurgeSelected = async () => {
    const ids = [...selectedRows];
    if (ids.length === 0) return;
    setDeleting(true);
    setSaveError(null);
    try {
      const { error } = await supabase.from(table).delete().in(pk, ids);
      if (error) { setSaveError(error.message); return; }
      setSelectedRows(new Set());
      setPurgeConfirm(false);
      await loadData();
    } finally {
      setDeleting(false);
    }
  };

  const handleColumnSave = (newFieldIds: string[]) => {
    setVisibleFieldIds(newFieldIds);
    setShowColumnSelector(false);
    savePreferences(entity.entity_definition_id, newFieldIds, columnWidths);
  };

  const handleSort = (fieldId: string) => {
    setSort((prev) => {
      if (prev.field !== fieldId) return { field: fieldId, dir: 'asc' };
      if (prev.dir === 'asc') return { field: fieldId, dir: 'desc' };
      return { field: '', dir: null };
    });
  };

  const handleResizeStart = (e: React.MouseEvent, fieldId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const currentW = columnWidths[fieldId] ?? 180;
    resizingRef.current = { fieldId, startX: e.clientX, startW: currentW };
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const diff = ev.clientX - resizingRef.current.startX;
      setColumnWidths((prev) => ({ ...prev, [resizingRef.current!.fieldId]: Math.max(80, resizingRef.current!.startW + diff) }));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (resizingRef.current) savePreferences(entity.entity_definition_id, visibleFieldIds, columnWidths);
      resizingRef.current = null;
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelectedRows(new Set());
    else setSelectedRows(new Set(records.map((r) => r._pk)));
  };

  const toggleRow = (rowPk: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowPk)) next.delete(rowPk); else next.add(rowPk);
      return next;
    });
  };

  const handleColumnFilterClick = (field: FieldDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setActiveFilterField({ field, rect });
  };

  const handleApplyFilter = (filter: ColumnFilter) => {
    setColumnFilters((prev) => {
      const next = prev.filter((f) => f.fieldId !== filter.fieldId);
      return [...next, filter];
    });
    setActiveFilterField(null);
    setPage(0);
  };

  const handleRemoveFilter = (fieldId: string) => {
    setColumnFilters((prev) => prev.filter((f) => f.fieldId !== fieldId));
    setActiveFilterField(null);
    setPage(0);
  };

  const handleClearAllFilters = () => {
    setColumnFilters([]);
    setPage(0);
  };

  const handleExportCsv = () => {
    if (records.length === 0) return;
    const headers = visibleFields.map((f) => f.display_name);
    const rows = records.map((r) =>
      visibleFields.map((f) => {
        const val = getCellValue(r, f);
        return val === null || val === undefined ? '' : String(val);
      })
    );
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entity.display_name}_records.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg)]">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-[var(--border)] px-5 py-2 flex items-center gap-1.5 shrink-0 text-[12px]">
        <button onClick={onBack} className="text-[var(--link)] hover:underline font-medium">Tables</button>
        <BreadcrumbChevron size={11} className="text-[var(--ink-300)]" />
        <button onClick={onBack} className="text-[var(--link)] hover:underline font-medium">{entity.display_name}</button>
        <BreadcrumbChevron size={11} className="text-[var(--ink-300)]" />
        <span className="text-[var(--ink-700)] font-semibold">Data</span>
      </div>

      {/* Page title bar */}
      <div className="bg-white border-b border-[var(--border)] px-5 py-3 flex items-center gap-3 shrink-0">
        <h1 className="text-[16px] font-semibold text-[var(--ink-900)]">{entity.display_name} records</h1>
        <span className="text-[12px] text-[var(--ink-400)] font-medium">{totalCount.toLocaleString()} total</span>
      </div>

      {/* Command Bar */}
      <div className="bg-white border-b border-[var(--divider)] px-3 py-1.5 flex items-center gap-0.5 shrink-0">
        <CmdBtn icon={<Plus size={13} />} onClick={addNewRow} active={newRows.length > 0} disabled={viewMode === 'deleted'}>
          New
        </CmdBtn>
        <CmdSep />
        {hasEdits ? (
          <>
            <CmdBtn
              icon={saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
              onClick={handleSaveAll}
              primary
              disabled={saving}
            >
              Save changes
            </CmdBtn>
            <CmdBtn icon={<X size={13} />} onClick={handleCancelEdits}>
              Cancel
            </CmdBtn>
            <CmdSep />
          </>
        ) : (
          <>
            <CmdBtn icon={<Pencil size={13} />} disabled>Edit</CmdBtn>
            <CmdSep />
          </>
        )}
        <CmdBtn icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />} onClick={loadData}>
          Refresh
        </CmdBtn>
        <CmdBtn icon={<Download size={13} />} onClick={handleExportCsv}>
          Export
        </CmdBtn>
        {selectedRows.size > 0 && (
          <>
            <CmdSep />
            {viewMode === 'deleted' ? (
              <>
                <CmdBtn icon={<RotateCcw size={13} />} onClick={handleRestoreSelected} disabled={deleting}>
                  Restore ({selectedRows.size})
                </CmdBtn>
                <CmdBtn icon={<Trash2 size={13} />} danger onClick={() => setPurgeConfirm(true)} disabled={deleting}>
                  Delete forever ({selectedRows.size})
                </CmdBtn>
              </>
            ) : (
              <CmdBtn icon={<Trash2 size={13} />} danger onClick={() => setDeleteConfirm(true)} disabled={deleting}>
                Delete ({selectedRows.size})
              </CmdBtn>
            )}
          </>
        )}
        {softDeleteCol && (
          <>
            <CmdSep />
            <div className="flex items-center rounded-sm border border-[var(--border)] overflow-hidden">
              {([['active', 'Active'], ['deleted', 'Recycle bin']] as const).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => { if (viewMode !== m) { setViewMode(m); setSelectedRows(new Set()); setPage(0); } }}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    viewMode === m ? 'bg-[var(--navy-accent)] text-white' : 'text-[var(--ink-600)] hover:bg-[var(--ink-50)]'
                  }`}
                >
                  {m === 'deleted' ? <span className="inline-flex items-center gap-1"><Trash2 size={11} />{label}</span> : label}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex-1" />
        {hasEdits && (
          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-sm border border-amber-200 mr-2">
            Unsaved changes
          </span>
        )}
      </div>

      {/* Save error banner — keeps failed rows visible and explains why */}
      {saveError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-start gap-2 shrink-0">
          <X size={14} className="text-red-500 shrink-0 mt-0.5" />
          <span className="flex-1 text-[12px] text-red-700 leading-snug">
            <span className="font-semibold">Some changes could not be saved. </span>{saveError}
          </span>
          <button
            onClick={() => setSaveError(null)}
            className="text-red-400 hover:text-red-600 shrink-0"
            title="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Sub-command bar: Edit columns, Edit filters, Keyword */}
      <div className="bg-white border-b border-[var(--divider)] px-4 py-1.5 flex items-center gap-3 shrink-0">
        <button
          onClick={() => setShowColumnSelector(true)}
          className="flex items-center gap-1.5 text-[12px] text-[var(--ink-600)] hover:text-[var(--navy-accent)] font-medium transition-colors"
        >
          <Columns3 size={13} className="text-[var(--ink-400)]" />
          Edit columns
        </button>
        <button
          onClick={() => setShowFilterPanel((v) => !v)}
          className={`flex items-center gap-1.5 text-[12px] font-medium transition-colors ${
            columnFilters.length > 0 || showFilterPanel
              ? 'text-[var(--navy-accent)]'
              : 'text-[var(--ink-600)] hover:text-[var(--navy-accent)]'
          }`}
        >
          <Filter size={13} className={columnFilters.length > 0 || showFilterPanel ? 'text-[var(--navy-accent)]' : 'text-[var(--ink-400)]'} />
          Edit filters
          {columnFilters.length > 0 && (
            <span className="ml-0.5 px-1.5 py-0 text-[10px] font-bold rounded-full bg-[var(--navy-accent)] text-white leading-relaxed">
              {columnFilters.length}
            </span>
          )}
        </button>
        <div className="flex-1" />
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-300)]" />
          <input
            type="text"
            placeholder="Filter by keyword"
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(0); }}
            className="pl-8 pr-3 py-1.5 text-[12px] border border-[var(--border)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] w-56 placeholder:text-[var(--ink-300)] text-[var(--ink-700)]"
          />
          {keyword && (
            <button onClick={() => { setKeyword(''); setPage(0); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-400)] hover:text-[var(--ink-600)]">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilterPanel && (
        <FilterFieldPanel
          allFields={allFields}
          columnFilters={columnFilters}
          onApply={handleApplyFilter}
          onRemove={handleRemoveFilter}
          onClearAll={handleClearAllFilters}
          onClose={() => setShowFilterPanel(false)}
        />
      )}

      {/* Active Filters Bar */}
      {columnFilters.length > 0 && (
        <div className="bg-[#f0f6ff] border-b border-[#d0e0f5] px-4 py-1.5 flex items-center gap-2 shrink-0 flex-wrap">
          <span className="text-[10px] font-semibold text-[var(--navy-accent)] uppercase tracking-wider mr-1">Active filters:</span>
          {columnFilters.map((cf) => {
            const field = allFields.find((f) => f.field_definition_id === cf.fieldId);
            if (!field) return null;
            return (
              <span
                key={cf.fieldId}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-white border border-[#c5d8ee] rounded text-[var(--ink-700)]"
              >
                {getFilterSummary(cf, field)}
                <button
                  onClick={() => handleRemoveFilter(cf.fieldId)}
                  className="ml-0.5 text-[var(--ink-400)] hover:text-[var(--ink-700)]"
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
          <button
            onClick={handleClearAllFilters}
            className="text-[11px] font-medium text-[var(--navy-accent)] hover:underline ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Grid container - takes all remaining space */}
      <div ref={gridRef} className="flex-1 overflow-auto min-h-0">
        <table className="w-full border-collapse text-[12.5px]" style={{ minWidth: visibleFields.length * 140 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#fafbfc] border-b border-[var(--border)]">
              <th className="w-10 px-2 py-2 text-center border-r border-[var(--divider)] bg-[#fafbfc] sticky left-0 z-20">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="crm-checkbox"
                />
              </th>
              <th className="w-9 px-2 py-2 text-center text-[10px] font-semibold text-[var(--ink-400)] border-r border-[var(--divider)] bg-[#fafbfc]">
                #
              </th>
              {visibleFields.map((field) => {
                const w = columnWidths[field.field_definition_id] ?? 180;
                const isSorted = sort.field === field.field_definition_id;
                const typeName = field.field_type?.name ?? '';
                const hasFilter = columnFilters.some((f) => f.fieldId === field.field_definition_id);
                return (
                  <th
                    key={field.field_definition_id}
                    className="relative text-left px-3 py-2 font-medium border-r border-[var(--divider)] bg-[#fafbfc] select-none group whitespace-nowrap"
                    style={{ width: w, minWidth: 80, maxWidth: 500 }}
                  >
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleSort(field.field_definition_id)}
                        className="flex items-center gap-1.5 flex-1 min-w-0 text-left hover:text-[var(--navy-accent)] transition-colors"
                      >
                        <span className="text-[var(--ink-300)] shrink-0">{getFieldTypeIcon(typeName)}</span>
                        <span className="truncate text-[11px] font-semibold text-[var(--navy-accent)] uppercase tracking-wide">
                          {field.display_name}
                          {field.is_required && <span className="text-red-500 ml-0.5">*</span>}
                        </span>
                        {isSorted && (
                          sort.dir === 'asc'
                            ? <ArrowUp size={11} className="text-[var(--navy-accent)] shrink-0" />
                            : <ArrowDown size={11} className="text-[var(--navy-accent)] shrink-0" />
                        )}
                      </button>
                      <button
                        onClick={(e) => handleColumnFilterClick(field, e)}
                        className={`p-0.5 rounded shrink-0 transition-colors ${
                          hasFilter
                            ? 'text-[var(--navy-accent)] bg-[#e5efff]'
                            : 'text-[var(--ink-300)] opacity-0 group-hover:opacity-100 hover:text-[var(--navy-accent)] hover:bg-[var(--ink-50)]'
                        }`}
                        title={`Filter ${field.display_name}`}
                      >
                        <Filter size={10} />
                      </button>
                    </div>
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--navy-accent)]/30 transition-colors"
                      onMouseDown={(e) => handleResizeStart(e, field.field_definition_id)}
                    />
                  </th>
                );
              })}
              <th className="px-3 py-2 bg-[#fafbfc] whitespace-nowrap">
                <button
                  onClick={() => setShowColumnSelector(true)}
                  className="flex items-center gap-1 text-[11px] text-[var(--navy-accent)] hover:underline font-medium transition-colors"
                >
                  +{hiddenCount} more <ChevronDown size={10} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {newRows.map((nr) => {
              const rowError = newRowErrors.get(nr.localId);
              return (
                <tr
                  key={nr.localId}
                  className={`border-b ${rowError ? 'bg-red-50 border-red-200' : 'bg-[#f0f6ff] border-[#d0e0f5]'}`}
                  title={rowError ?? undefined}
                >
                  <td className="w-10 px-2 py-0 text-center border-r border-[var(--divider)]">
                    <button
                      onClick={() => removeNewRow(nr.localId)}
                      className="text-[var(--ink-300)] hover:text-red-500 transition-colors"
                      title="Discard this new row"
                    >
                      <X size={13} />
                    </button>
                  </td>
                  <td className={`w-9 px-2 py-0 text-center text-[11px] font-bold border-r border-[var(--divider)] ${rowError ? 'text-red-500' : 'text-[var(--navy-accent)]'}`}>+</td>
                  {visibleFields.map((field) => (
                    <td key={field.field_definition_id} className="px-0 py-0 border-r border-[var(--divider)]">
                      <CellEditor
                        field={field}
                        value={nr.data[field.field_definition_id] ?? ''}
                        onChange={(val) => updateNewRow(nr.localId, field.field_definition_id, val)}
                        autoFocus={false}
                        lookupMeta={lookupMeta}
                        lookupCache={lookupCache}
                      />
                    </td>
                  ))}
                  <td />
                </tr>
              );
            })}

            {loading && records.length === 0 ? (
              <tr>
                <td colSpan={visibleFields.length + 3} className="py-24 text-center">
                  <RefreshCw size={20} className="animate-spin text-[var(--ink-200)] mx-auto" />
                  <p className="text-[12px] text-[var(--ink-300)] mt-2">Loading records...</p>
                </td>
              </tr>
            ) : records.length === 0 && newRows.length === 0 ? (
              <tr>
                <td colSpan={visibleFields.length + 3} className="py-24 text-center">
                  <p className="text-[13px] text-[var(--ink-400)]">No records found</p>
                  <p className="text-[11px] text-[var(--ink-300)] mt-1">Try adjusting your filters or search query</p>
                </td>
              </tr>
            ) : (
              records.map((record, rowIdx) => {
                const rowHasEdits = edits.has(record._pk);
                const isRowSelected = selectedRows.has(record._pk);
                const rowNum = page * rowsPerPage + rowIdx + 1;

                return (
                  <tr
                    key={record._pk}
                    className={`border-b border-[var(--divider)] transition-colors ${
                      isRowSelected
                        ? 'bg-[#eaf2fd]'
                        : rowHasEdits
                          ? 'bg-amber-50/30'
                          : 'hover:bg-[#f6f8fb]'
                    }`}
                    style={isRowSelected ? { boxShadow: 'inset 2px 0 0 var(--navy-accent)' } : undefined}
                  >
                    <td className="w-10 px-2 py-0 text-center border-r border-[var(--divider)]">
                      <input
                        type="checkbox"
                        checked={isRowSelected}
                        onChange={() => toggleRow(record._pk)}
                        className="crm-checkbox"
                      />
                    </td>
                    <td className="w-9 px-2 py-2 text-center text-[11px] text-[var(--ink-300)] border-r border-[var(--divider)] font-mono">
                      {rowNum}
                    </td>
                    {visibleFields.map((field) => {
                      const isEditing = editingCell?.pk === record._pk && editingCell?.fieldId === field.field_definition_id;
                      const cellVal = getCellValue(record, field);
                      const cellEdited = edits.get(record._pk)?.has(field.field_definition_id);

                      return (
                        <td
                          key={field.field_definition_id}
                          className={`px-0 py-0 border-r border-[var(--divider)] relative ${cellEdited ? 'bg-amber-50/40' : ''}`}
                        >
                          {isEditing ? (
                            <CellEditor
                              field={field}
                              value={cellVal}
                              onChange={(val) => setCellValue(record._pk, field.field_definition_id, val)}
                              onBlur={() => setEditingCell(null)}
                              autoFocus
                              lookupMeta={lookupMeta}
                              lookupCache={lookupCache}
                            />
                          ) : (
                            <div
                              className={`px-3 py-[7px] min-h-[36px] truncate text-[var(--ink-700)] leading-tight flex items-center ${viewMode === 'deleted' ? 'cursor-default' : 'cursor-text'}`}
                              onClick={() => { if (viewMode !== 'deleted') setEditingCell({ pk: record._pk, fieldId: field.field_definition_id }); }}
                            >
                              <CellDisplay field={field} value={cellVal} lookupCache={lookupCache} />
                            </div>
                          )}
                          {cellEdited && <div className="absolute top-0 left-0 w-0.5 h-full bg-[var(--navy-accent)]" />}
                        </td>
                      );
                    })}
                    <td />
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Alphabet Index Bar */}
      <div className="flex items-center gap-0 px-2 py-1 border-t border-[var(--border)] bg-white overflow-x-auto shrink-0">
        {ALPHA.map((letter) => (
          <button
            key={letter}
            onClick={() => { setAlphaFilter(letter); setPage(0); }}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              alphaFilter === letter
                ? 'bg-[var(--navy-accent)] text-white'
                : 'text-[var(--ink-400)] hover:text-[var(--navy-accent)] hover:bg-[var(--ink-50)]'
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* Footer: Pagination */}
      <div className="flex items-center px-4 py-2 border-t border-[var(--border)] bg-white text-[12px] shrink-0">
        <span className="text-[var(--ink-500)]">
          {selectedRows.size > 0
            ? <><span className="font-semibold text-[var(--navy-accent)]">{selectedRows.size}</span> selected</>
            : <>{rangeStart} - {rangeEnd} of {totalCount.toLocaleString()}</>
          }
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--ink-400)]">Rows per page</span>
            <FilterSelect
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
              className="px-1.5 py-0.5 border border-[var(--border)] rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] text-[var(--ink-700)]"
            >
              {ROWS_PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </FilterSelect>
          </div>
          <div className="flex items-center gap-1">
            <PagBtn onClick={() => setPage(0)} disabled={page === 0}><ChevronsLeft size={13} /></PagBtn>
            <PagBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft size={13} /></PagBtn>
            <span className="px-2.5 py-0.5 bg-[var(--navy-accent)] text-white rounded text-[11px] font-semibold min-w-[28px] text-center">
              {page + 1}
            </span>
            <span className="text-[var(--ink-400)] text-[11px]">of {totalPages}</span>
            <PagBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><ChevronRight size={13} /></PagBtn>
            <PagBtn onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}><ChevronsRight size={13} /></PagBtn>
          </div>
        </div>
      </div>

      {/* Column Selector Panel */}
      {showColumnSelector && (
        <ColumnSelectorPanel
          fields={allFields}
          visibleFieldIds={visibleFieldIds}
          onSave={handleColumnSave}
          onCancel={() => setShowColumnSelector(false)}
        />
      )}

      {/* Column Filter Dropdown */}
      {activeFilterField && (
        <ColumnFilterDropdown
          field={activeFilterField.field}
          existingFilter={columnFilters.find((f) => f.fieldId === activeFilterField.field.field_definition_id)}
          onApply={handleApplyFilter}
          onRemove={() => handleRemoveFilter(activeFilterField.field.field_definition_id)}
          onClose={() => setActiveFilterField(null)}
          anchorRect={activeFilterField.rect}
        />
      )}

      {/* Delete confirmation for the selected rows (soft-delete when supported) */}
      {deleteConfirm && (
        <ConfirmDialog
          title={`Delete ${selectedRows.size} record${selectedRows.size === 1 ? '' : 's'}?`}
          message={
            softDeleteCol
              ? `The selected record${selectedRows.size === 1 ? '' : 's'} will be moved to the recycle bin. You can restore ${selectedRows.size === 1 ? 'it' : 'them'} later.`
              : `This permanently deletes the selected record${selectedRows.size === 1 ? '' : 's'}. This cannot be undone.`
          }
          confirmLabel="Delete"
          destructive
          loading={deleting}
          onConfirm={handleDeleteSelected}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}

      {/* Permanent-delete confirmation (recycle bin → Delete forever) */}
      {purgeConfirm && (
        <ConfirmDialog
          title={`Permanently delete ${selectedRows.size} record${selectedRows.size === 1 ? '' : 's'}?`}
          message={`This permanently removes the selected record${selectedRows.size === 1 ? '' : 's'} from the database. This cannot be undone.`}
          confirmLabel="Delete forever"
          destructive
          loading={deleting}
          onConfirm={handlePurgeSelected}
          onCancel={() => setPurgeConfirm(false)}
        />
      )}
    </div>
  );
}

/* ====== Cell Display ====== */

function CellDisplay({ field, value, lookupCache }: { field: FieldDefinition; value: unknown; lookupCache?: LookupDisplayCache }) {
  const typeName = field.field_type?.name ?? '';

  if (value === null || value === undefined || value === '') {
    return <span className="text-[var(--ink-200)]">--</span>;
  }

  if (typeName === 'boolean') {
    return <span className="text-[var(--ink-600)]">{value === true || value === 'true' ? 'Yes' : 'No'}</span>;
  }

  if (typeName === 'datetime') {
    try {
      const d = new Date(String(value));
      return <span>{d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })} {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>;
    } catch {
      return <span>{String(value)}</span>;
    }
  }

  if ((typeName === 'choice' || typeName === 'optionset' || typeName === 'statecode' || typeName === 'statusreason') && field.config_json) {
    const choices = (field.config_json as { choices?: { value: string; label: string; color?: string }[] })?.choices ?? [];
    const match = choices.find((c) => c.value === String(value));
    if (match) {
      const color = match.color ?? '#64748b';
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span>{match.label}</span>
        </span>
      );
    }
  }

  if (typeName === 'multi_choice' && field.config_json) {
    const choices = (field.config_json as { choices?: { value: string; label: string }[] })?.choices ?? [];
    let vals: string[] = [];
    if (Array.isArray(value)) vals = (value as unknown[]).map(String);
    else if (typeof value === 'string' && value.startsWith('[')) {
      try { vals = JSON.parse(value); } catch { vals = [value]; }
    } else if (typeof value === 'string' && value) {
      vals = value.split(',').map((s) => s.trim());
    }
    if (vals.length === 0) return <span className="text-[var(--ink-200)]">--</span>;
    const labels = vals.map((v) => choices.find((c) => c.value === v)?.label ?? v);
    return <span className="text-[var(--ink-700)]">{labels.join(', ')}</span>;
  }

  if (typeName === 'lookup' || typeName === 'owner') {
    const strVal = String(value);
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(strVal);
    if (isUUID) {
      const displayName = lookupCache?.get(field.field_definition_id)?.get(strVal);
      if (displayName) {
        const initials = displayName.substring(0, 2).toUpperCase();
        const colorIdx = strVal.charCodeAt(0) % AVATAR_COLORS.length;
        return (
          <span className="inline-flex items-center gap-2">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
              style={{ backgroundColor: AVATAR_COLORS[colorIdx] }}
            >
              {initials}
            </span>
            <span className="text-[var(--link)] truncate">{displayName}</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-2">
          <span className="w-5 h-5 rounded-full flex items-center justify-center bg-slate-200 shrink-0 animate-pulse" />
          <span className="text-[var(--ink-200)] truncate text-[11px]">—</span>
        </span>
      );
    }
    return <span className="text-[var(--link)]">{strVal}</span>;
  }

  const strValue = String(value);
  const isPrimary = field.physical_column_name === 'name' || field.physical_column_name === 'first_name' || field.physical_column_name === 'topic' || field.physical_column_name === 'title';
  if (isPrimary) return <span className="text-[var(--link)] font-medium">{strValue}</span>;

  return <span>{strValue}</span>;
}

/* ====== Cell Editor ====== */

function CellEditor({ field, value, onChange, onBlur, autoFocus, lookupMeta, lookupCache }: {
  field: FieldDefinition; value: unknown; onChange: (val: unknown) => void; onBlur?: () => void; autoFocus: boolean;
  lookupMeta?: Map<string, LookupMeta>; lookupCache?: LookupDisplayCache;
}) {
  const typeName = field.field_type?.name ?? '';
  const strVal = value === null || value === undefined ? '' : String(value);
  const cls = 'w-full h-full px-3 py-[7px] text-[12.5px] bg-white border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--navy-accent)]/40 text-[var(--ink-700)]';

  if (typeName === 'boolean') {
    return (
      <FilterSelect value={strVal === 'true' || strVal === '1' ? 'true' : strVal === 'false' || strVal === '0' ? 'false' : ''} onChange={(e) => onChange(e.target.value === 'true' ? true : e.target.value === 'false' ? false : null)} onBlur={onBlur} autoFocus={autoFocus} className={cls}>
        <option value="">--</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </FilterSelect>
    );
  }

  if (typeName === 'choice' || typeName === 'optionset' || typeName === 'statecode' || typeName === 'statusreason') {
    const choices = (field.config_json as { choices?: { value: string; label: string }[] } | null)?.choices ?? [];
    return (
      <FilterSelect value={strVal} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} autoFocus={autoFocus} className={cls}>
        <option value="">--</option>
        {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </FilterSelect>
    );
  }

  if (typeName === 'datetime') {
    const dtVal = strVal ? formatDateForInput(strVal) : '';
    return <input type="datetime-local" value={dtVal} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : '')} onBlur={onBlur} autoFocus={autoFocus} className={cls} />;
  }

  if (typeName === 'number' || typeName === 'integer' || typeName === 'decimal' || typeName === 'currency') {
    return <input type="number" value={strVal} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} onBlur={onBlur} autoFocus={autoFocus} step={typeName === 'integer' ? '1' : 'any'} className={cls} />;
  }

  if ((typeName === 'lookup' || typeName === 'owner') && lookupMeta?.has(field.field_definition_id)) {
    return (
      <LookupCellEditor
        field={field}
        value={strVal}
        onChange={onChange}
        onBlur={onBlur}
        autoFocus={autoFocus}
        meta={lookupMeta.get(field.field_definition_id)!}
        lookupCache={lookupCache}
      />
    );
  }

  return <input type="text" value={strVal} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} autoFocus={autoFocus} className={cls} />;
}

/* ====== Lookup Cell Editor with searchable dropdown ====== */

function LookupCellEditor({ field, value, onChange, onBlur, autoFocus, meta, lookupCache }: {
  field: FieldDefinition; value: string; onChange: (val: unknown) => void; onBlur?: () => void; autoFocus: boolean;
  meta: LookupMeta; lookupCache?: LookupDisplayCache;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(true);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const currentLabel = value ? lookupCache?.get(field.field_definition_id)?.get(value) ?? '' : '';

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  useEffect(() => {
    setSearch(currentLabel);
  }, [currentLabel]);

  useEffect(() => {
    if (!open) return;
    const q = search.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        let query = supabase
          .from(meta.table)
          .select(`${meta.pk}, ${meta.labelField}`)
          .limit(20);
        if (q.length > 0) {
          query = query.ilike(meta.labelField, `%${q}%`);
        }
        query = query.order(meta.labelField, { ascending: true });
        const { data } = await query;
        setResults(
          ((data ?? []) as unknown as Record<string, unknown>[]).map((r: Record<string, unknown>) => ({
            id: String(r[meta.pk]),
            label: String(r[meta.labelField] ?? ''),
          }))
        );
        setHighlightIdx(0);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, open, meta]);

  const select = (id: string) => {
    onChange(id || null);
    setOpen(false);
    onBlur?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[highlightIdx]) select(results[highlightIdx].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
      onBlur?.();
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        onBlur?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onBlur]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={`Search ${meta.entityName}...`}
          className="w-full h-full px-3 py-[7px] text-[12.5px] bg-white border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--navy-accent)]/40 text-[var(--ink-700)] pr-14"
        />
        {value && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(null); setSearch(''); }}
            className="absolute right-7 top-1/2 -translate-y-1/2 text-[var(--ink-300)] hover:text-[var(--ink-600)] p-0.5"
          >
            <X size={11} />
          </button>
        )}
        <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-300)] pointer-events-none" />
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-[var(--border)] rounded-b shadow-lg max-h-[200px] overflow-y-auto">
          {searching && results.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-[var(--ink-300)] text-center">
              <RefreshCw size={12} className="animate-spin inline-block mr-1.5" />Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-[var(--ink-300)] text-center">
              No results found
            </div>
          ) : (
            <>
              {value && (
                <button
                  onClick={() => select('')}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--ink-400)] hover:bg-[var(--ink-50)] border-b border-[var(--divider)]"
                >
                  -- Clear selection --
                </button>
              )}
              {results.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => select(r.id)}
                  className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors flex items-center gap-2 ${
                    i === highlightIdx
                      ? 'bg-[#e5efff] text-[var(--navy-accent)]'
                      : r.id === value
                        ? 'bg-[#f0f6ff] text-[var(--ink-700)]'
                        : 'text-[var(--ink-700)] hover:bg-[var(--ink-50)]'
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                    style={{ backgroundColor: AVATAR_COLORS[r.id.charCodeAt(0) % AVATAR_COLORS.length] }}
                  >
                    {r.label.substring(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate">{r.label}</span>
                  {r.id === value && (
                    <span className="ml-auto text-[var(--navy-accent)] text-[10px] font-semibold shrink-0">Selected</span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ====== Filter Field Panel ====== */

function FilterFieldPanel({ allFields, columnFilters, onApply, onRemove, onClearAll, onClose }: {
  allFields: FieldDefinition[];
  columnFilters: ColumnFilter[];
  onApply: (filter: ColumnFilter) => void;
  onRemove: (fieldId: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const filterableFields = allFields.filter((f) => {
    const t = f.field_type?.name ?? '';
    return !['calculated'].includes(t) && f.is_active;
  });

  const filtered = filterableFields.filter(
    (f) => !search || f.display_name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedField = selectedFieldId ? allFields.find((f) => f.field_definition_id === selectedFieldId) : null;
  const existingFilter = selectedFieldId ? columnFilters.find((cf) => cf.fieldId === selectedFieldId) : undefined;

  return (
    <div className="bg-white border-b border-[var(--border)] shrink-0 flex" style={{ height: 280 }}>
      {/* Left: field list */}
      <div className="w-[260px] border-r border-[var(--border)] flex flex-col">
        <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-2">
          <Filter size={12} className="text-[var(--ink-400)]" />
          <span className="text-[12px] font-semibold text-[var(--ink-700)] flex-1">Filter by column</span>
          <button onClick={onClose} className="text-[var(--ink-400)] hover:text-[var(--ink-700)] transition-colors">
            <X size={13} />
          </button>
        </div>
        <div className="px-2 py-1.5 border-b border-[var(--border)]">
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ink-300)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search columns..."
              className="w-full pl-7 pr-2 py-1 text-[11px] border border-[var(--border)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] text-[var(--ink-700)] placeholder:text-[var(--ink-300)]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((f) => {
            const hasFilter = columnFilters.some((cf) => cf.fieldId === f.field_definition_id);
            const isActive = selectedFieldId === f.field_definition_id;
            return (
              <button
                key={f.field_definition_id}
                onClick={() => setSelectedFieldId(f.field_definition_id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left transition-colors ${
                  isActive
                    ? 'bg-[#e5efff] text-[var(--navy-accent)]'
                    : 'text-[var(--ink-700)] hover:bg-[var(--ink-50)]'
                }`}
              >
                <span className="text-[var(--ink-300)] shrink-0">{getFieldTypeIcon(f.field_type?.name ?? '')}</span>
                <span className="truncate flex-1">{f.display_name}</span>
                {hasFilter && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--navy-accent)] shrink-0" />
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-[11px] text-[var(--ink-300)] py-4 text-center">No columns match</p>
          )}
        </div>
        {columnFilters.length > 0 && (
          <div className="px-3 py-2 border-t border-[var(--border)]">
            <button
              onClick={onClearAll}
              className="text-[11px] font-medium text-red-600 hover:text-red-700 transition-colors"
            >
              Clear all filters ({columnFilters.length})
            </button>
          </div>
        )}
      </div>

      {/* Right: filter config for selected field */}
      <div className="flex-1 flex items-center justify-center">
        {selectedField ? (
          <ColumnFilterDropdown
            field={selectedField}
            existingFilter={existingFilter}
            onApply={(filter) => { onApply(filter); setSelectedFieldId(null); }}
            onRemove={() => { onRemove(selectedField.field_definition_id); setSelectedFieldId(null); }}
            onClose={() => setSelectedFieldId(null)}
            anchorRect={null}
          />
        ) : (
          <div className="text-center px-8">
            <Filter size={20} className="text-[var(--ink-200)] mx-auto mb-2" />
            <p className="text-[12px] text-[var(--ink-400)]">Select a column from the list to add or edit a filter</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ====== Sub-components ====== */

function CmdBtn({ children, onClick, icon, primary, danger, disabled, active }: {
  children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; primary?: boolean; danger?: boolean; disabled?: boolean; active?: boolean;
}) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-sm transition-all disabled:opacity-40';
  const style = primary
    ? `${base} bg-[var(--navy-accent)] hover:bg-[#245da0] text-white`
    : danger
      ? `${base} text-[#c0392b] hover:bg-red-50`
      : active
        ? `${base} bg-[#e5efff] text-[var(--navy-accent)] ring-1 ring-[var(--navy-accent)]/20`
        : `${base} text-[var(--ink-600)] hover:bg-[var(--ink-50)] hover:text-[var(--ink-900)]`;
  return <button className={style} onClick={onClick} disabled={disabled}>{icon}{children}</button>;
}

function CmdSep() {
  return <div className="w-px h-[18px] bg-[var(--border)] mx-0.5" />;
}

function PagBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 flex items-center justify-center rounded border border-[var(--border)] text-[var(--ink-400)] hover:bg-[var(--ink-50)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

/* ====== Helpers ====== */

const PK_OVERRIDES: Record<string, string> = {
  crm_user: 'user_id',
  security_role: 'role_id',
  product_family: 'family_id',
  line_of_business: 'lob_id',
  crm_source: 'source_id',
  marketing_email: 'email_id',
};

function guessPK(entity: EntityDefinition): string {
  const t = entity.physical_table_name;
  if (PK_OVERRIDES[t]) return PK_OVERRIDES[t];
  // Custom entities are created with a PK column of `<logical_name>_id` (see the
  // create_crm_entity RPC), which differs from the physical table name — e.g. table
  // `crm_continent` has PK `continent_id`, not `crm_continent_id`. Deriving the PK
  // from the table name there yields a missing column, collapsing every row's _pk to
  // '' and making row selection select all rows at once.
  if (entity.is_custom) return `${entity.logical_name}_id`;
  if (t === 'account') return 'account_id';
  if (t === 'contact') return 'contact_id';
  if (t === 'lead') return 'lead_id';
  if (t === 'opportunity') return 'opportunity_id';
  if (t === 'ticket') return 'ticket_id';
  return `${t}_id`;
}

function defaultVisibleFields(fields: FieldDefinition[]): string[] {
  const nameField = fields.find((f) => f.physical_column_name === 'name' || f.logical_name === 'name');
  const primary = nameField ? [nameField.field_definition_id] : [];
  const rest = fields
    .filter((f) => !primary.includes(f.field_definition_id) && f.is_active && !isAuditField(f))
    .slice(0, 8 - primary.length)
    .map((f) => f.field_definition_id);
  return [...primary, ...rest];
}

function isAuditField(f: FieldDefinition): boolean {
  const hidden = new Set(['createdon', 'modifiedon', 'ownerid', 'createdby', 'modifiedby']);
  return hidden.has(f.logical_name);
}

function orderFieldsByIds(allFields: FieldDefinition[], ids: string[]): FieldDefinition[] {
  const map = new Map(allFields.map((f) => [f.field_definition_id, f]));
  return ids.map((id) => map.get(id)).filter(Boolean) as FieldDefinition[];
}

function formatDateForInput(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
}