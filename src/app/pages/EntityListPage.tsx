import FilterSelect from '../components/FilterSelect';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronUp,
  ChevronDown,
  SlidersHorizontal,
  Inbox,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Upload,
  UserCheck,
  Filter,
  X,
  Search,
  Plus,
  Lock,
  Loader2,
  Share2,
} from 'lucide-react';
import type { AppEntity, AppModule } from '../types';
import { ENTITY_LOGICAL_NAME, ENTITY_DEFINITION_ID } from '../types';
import { supabase } from '../../lib/supabase';
import type { ActiveFilter, ListRow, RelatedColumnSpec } from '../services/listService';
import { fetchEntityList, ENTITY_COLUMNS, updateRowFields, fetchCrmUsers } from '../services/listService';
import { evaluateRowHighlight, getEntityRules } from '../services/rowHighlightService';
import { hasAnyEntityPrivilege } from '../services/permissionService';
import FilterPanel from '../components/FilterPanel';
import InlineRowActions from '../components/InlineRowActions';
import ColumnCustomizer, { type ColumnState } from '../components/ColumnCustomizer';
import ViewSelector from '../components/ViewSelector';
import SaveViewModal from '../components/SaveViewModal';
import ShareViewModal from '../components/ShareViewModal';
import ShareRecordModal from '../components/ShareRecordModal';
import BulkActionsBar from '../components/BulkActionsBar';
import { usePermissions } from '../context/PermissionContext';
import { useToast, toFriendlyError } from '../context/ToastContext';
import type { ViewDefinition } from '../../types/view';
import { fetchViewColumns, updateViewColumns } from '../../services/viewService';
import ColumnFilterDropdown from '../components/ColumnFilterDropdown';
import { resolveGridValues } from '../services/gridResolver';
import { renderListCell } from '../components/list/renderListCell';
import { buildColumnState, buildColumnStatesFromViewColumns } from '../services/viewColumnState';
import ImportFromExcelModal from '../components/ImportFromExcelModal';
import { fetchSharedRecordIds } from '../services/recordShareService';
import * as XLSX from 'xlsx';
import { downloadWorkbook } from '../services/importEngine';

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number];

const INLINE_EDITABLE_COLS: Partial<Record<AppEntity, string[]>> = {
  accounts:      ['account_name', 'industry', 'phone', 'website'],
  contacts:      ['email', 'mobile_phone', 'job_title'],
  leads:         ['email', 'company_name'],
  opportunities: ['estimated_value', 'estimated_close_date'],
  tickets:       [],
};

const HIGHLIGHT_DOT_COLORS: Record<string, string> = {
  red:     'bg-red-500',
  rose:    'bg-rose-500',
  amber:   'bg-amber-500',
  orange:  'bg-orange-500',
  green:   'bg-green-500',
  emerald: 'bg-emerald-500',
  teal:    'bg-teal-500',
  sky:     'bg-sky-500',
  blue:    'bg-blue-500',
};

function HighlightLegend({ entity }: { entity: AppEntity }) {
  const rules = getEntityRules(entity);
  if (rules.length === 0) return null;
  return (
    <div
      className="flex items-center justify-end gap-4 px-5 py-1.5 overflow-x-auto shrink-0"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
    >
      {rules.map((r) => (
        <span key={r.id} className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${HIGHLIGHT_DOT_COLORS[r.color] ?? 'bg-[var(--ink-300)]'}`} />
          <span className="text-[11px] text-[#5b6472]">{r.label}</span>
        </span>
      ))}
    </div>
  );
}

interface ParentFilterContext {
  fkColumn: string;
  parentId: string;
  parentLabel: string;
  parentEntity: string;
}

interface EntityListPageProps {
  module: AppModule;
  entity: AppEntity;
  search: string;
  onSearchChange?: (value: string) => void;
  onNewRecord?: () => void;
  onOpenRecord?: (id: string, label?: string) => void;
  userId?: string;
  initialFilters?: ActiveFilter[];
  filterContextLabel?: string;
  parentFilter?: ParentFilterContext;
  onClearParentFilter?: () => void;
  /** Saved view to auto-select on mount (restored from the URL after a refresh). */
  initialViewId?: string;
  /** Fired whenever the active saved view changes, so the URL can track it. */
  onActiveViewChange?: (viewId: string | null) => void;
  creationBlocked?: boolean;
  creationBlockedMessage?: string | null;
}

function columnSnapshot(cols: ColumnState[]): string {
  // Preserve order — reordering columns is a meaningful change that should enable Save.
  return JSON.stringify(
    cols
      .filter((c) => c.visible)
      .map((c) => ({ key: c.key, labelOverride: c.labelOverride ?? null, width: c.width ?? null }))
  );
}

export default function EntityListPage({ entity, search, onSearchChange, onNewRecord, onOpenRecord, userId, initialFilters, filterContextLabel, parentFilter, onClearParentFilter, initialViewId, onActiveViewChange, creationBlocked, creationBlockedMessage }: EntityListPageProps) {
  const { getEntityPrivilege, isActionAllowed, accessContext, permissions, ready: permissionsReady } = usePermissions();
  const { showError, showSuccess } = useToast();
  const entityName = ENTITY_LOGICAL_NAME[entity] ?? entity;
  const staticEntityDefId = ENTITY_DEFINITION_ID[entity] ?? null;
  const [resolvedEntityDefId, setResolvedEntityDefId] = useState<string | null>(staticEntityDefId);

  useEffect(() => {
    if (staticEntityDefId) { setResolvedEntityDefId(staticEntityDefId); return; }
    setResolvedEntityDefId(null);
    let cancelled = false;
    supabase
      .from('entity_definition')
      .select('entity_definition_id')
      .eq('logical_name', entityName)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setResolvedEntityDefId(data?.entity_definition_id ?? null); });
    return () => { cancelled = true; };
  }, [entityName, staticEntityDefId]);

  const entityDefinitionId = resolvedEntityDefId;
  // Apply the Dynamics-style redesign consistently across every entity list.
  const isRedesign = true;
  const priv = getEntityPrivilege(entityName);
  const canRead = priv.can_read;
  // Entity-open gate: any one of the six privileges lets the user open the
  // entity; each action below is still gated by its own flag.
  const canOpenEntity = permissions.isSystemAdmin || hasAnyEntityPrivilege(priv);
  const canCreate = priv.can_create && !creationBlocked;
  const canWrite = priv.can_write;
  const canDelete = priv.can_delete;
  const canBulkDelete = priv.can_delete && isActionAllowed(entityName, 'bulk_delete');
  const canAssign = priv.can_assign;
  const canBulkAssign = priv.can_assign && isActionAllowed(entityName, 'bulk_assign');
  const canBulkEdit = priv.can_write && isActionAllowed(entityName, 'bulk_edit');
  const canShare = priv.can_share;
  const canActivate = isActionAllowed(entityName, 'activate');
  const canDeactivate = isActionAllowed(entityName, 'deactivate');
  const canExportCsv = priv.can_read && isActionAllowed(entityName, 'export_to_csv');
  const canExportExcel = priv.can_read && isActionAllowed(entityName, 'export_to_excel');
  const canImport = (priv.can_create || priv.can_write) && isActionAllowed(entityName, 'import_from_excel');
  // Read access level — undefined means no restriction (system admin or org-level)
  const readAccessLevel = (!permissions.isSystemAdmin && priv.can_read) ? priv.read_access_level : undefined;

  const [rows, setRows] = useState<ListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [sortKey, setSortKey] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<ActiveFilter[]>(initialFilters ?? []);
  const [showFilters, setShowFilters] = useState(false);
  const [activeParentFilter, setActiveParentFilter] = useState<ParentFilterContext | undefined>(parentFilter);

  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  const [crmUsers, setCrmUsers] = useState<{ id: string; email: string }[]>([]);
  const [columnStates, setColumnStates] = useState<ColumnState[]>(() => buildColumnState(entity));
  const [showColCustomizer, setShowColCustomizer] = useState(false);
  const colBtnRef = useRef<HTMLDivElement>(null);

  // View management
  const [viewsReady, setViewsReady] = useState(false);
  const [activeView, setActiveView] = useState<ViewDefinition | null>(null);
  const [savedColumnSnapshot, setSavedColumnSnapshot] = useState<string>('');
  const [savingViewColumns, setSavingViewColumns] = useState(false);
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [shareTarget, setShareTarget] = useState<ViewDefinition | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [shareRecordTarget, setShareRecordTarget] = useState<{ id: string; label: string } | null>(null);
  const [shareBulkIds, setShareBulkIds] = useState<string[] | null>(null);

  const toolbarRef = useRef<HTMLDivElement>(null);

  // Column header menu state (Dynamics-style: Sort A-Z / Sort Z-A / Filter by)
  const [colMenuKey, setColMenuKey] = useState<string | null>(null);
  const [colMenuAnchor, setColMenuAnchor] = useState<HTMLElement | null>(null);
  const colMenuRef = useRef<HTMLDivElement>(null);

  // Column filter dropdown state
  const [colFilterKey, setColFilterKey] = useState<string | null>(null);
  const [colFilterAnchor, setColFilterAnchor] = useState<HTMLElement | null>(null);
  const colFilterRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const prevEntity = useRef(entity);
  const editableCols = INLINE_EDITABLE_COLS[entity] ?? [];
  const visibleColumns = columnStates.filter((c) => c.visible);
  // Stable string of visible column keys — triggers reload when columns change
  const relatedColKeys = visibleColumns
    .map((c) => c.key)
    .join(',');

  const fetchGeneration = useRef(0);
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Ref populated before the save/load callbacks so they always read latest state
  const columnStatesRef = useRef<ColumnState[]>([]);

  const load = useCallback(async () => {
    const gen = ++fetchGeneration.current;
    setLoading(true);
    setError(null);
    try {
      // Build RelatedColumnSpec from visible related columns (cross-entity via relationship_definition_id)
      const LABEL_FALLBACKS: Record<string, string[]> = {
        lead: ['topic', 'company_name', 'email'],
        contact: ['email', 'business_phone'],
      };
      const relatedColumns: RelatedColumnSpec[] = columnStatesRef.current
        .filter((c) => c.visible && c.relationship_definition_id && c.field_definition_id)
        .map((c) => ({
          colKey: c.key,
          relatedTable: c.related_table_name ?? '',
          fkColumn: c.fk_physical_column ?? '',
          fieldPhysicalColumn: c.field_physical_column ?? '',
          fallbackFields: LABEL_FALLBACKS[c.related_table_name ?? ''],
        }))
        .filter((s) => s.relatedTable && s.fkColumn && s.fieldPhysicalColumn);

      // Build a map from logical column key → physical DB column so non-lookup columns resolve
      const columnKeyMap: Record<string, string> = {};
      for (const c of columnStatesRef.current) {
        if (!c.visible) continue;
        if (c.relationship_definition_id) continue;
        if (c.lookup_table && c.lookup_label_field) continue;
        const phys = c.field_physical_column;
        if (phys && phys !== c.key) columnKeyMap[c.key] = phys;
      }

      // Always fetch shared record IDs so records shared with the current user
      // are visible regardless of their normal read access scope.
      let sharedRecordIds: Set<string> | undefined;
      if (accessContext?.userId) {
        const { readIds } = await fetchSharedRecordIds(accessContext.userId, entityName);
        if (readIds.size > 0) sharedRecordIds = readIds;
      }

      const result = await fetchEntityList(entity, {
        search: debouncedSearch,
        sortKey,
        sortDir,
        page,
        pageSize,
        filters,
        relatedColumns,
        columnKeyMap,
        readAccessLevel,
        accessContext: readAccessLevel ? accessContext : undefined,
        sharedRecordIds,
      });
      if (gen !== fetchGeneration.current) return;
      const resolved = await resolveGridValues(result.rows, columnStatesRef.current);
      if (gen !== fetchGeneration.current) return;
      setRows(resolved);
      setTotal(result.total);
    } catch (e) {
      if (gen !== fetchGeneration.current) return;
      console.error(`[EntityListPage] load error for ${entity}:`, e);
      setError('Unable to load records. Please try again.');
    } finally {
      if (gen === fetchGeneration.current) setLoading(false);
    }
  }, [entity, debouncedSearch, sortKey, sortDir, page, pageSize, filters, relatedColKeys, readAccessLevel, accessContext]);

  useEffect(() => {
    fetchCrmUsers().then(setCrmUsers);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement).isContentEditable) return;
      if (!canCreate) return;
      onNewRecord?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canCreate, onNewRecord]);

  // Close column header menu on outside click
  useEffect(() => {
    if (!colMenuKey) return;
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node) &&
          colMenuAnchor && !colMenuAnchor.contains(e.target as Node)) {
        setColMenuKey(null);
        setColMenuAnchor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colMenuKey, colMenuAnchor]);

  useEffect(() => {
    if (prevEntity.current !== entity) {
      prevEntity.current = entity;
      setPage(1);
      setSortKey('created_at');
      setSortDir('desc');
      setSelected(new Set());
      setFilters(initialFilters ?? []);
      setEditingRowId(null);
      setColumnStates(buildColumnState(entity));
      setSavedColumnSnapshot('');
      setShowColCustomizer(false);
      setActiveView(null);
      setViewsReady(false);
      setActiveParentFilter(parentFilter);
    }
    if (!viewsReady || !permissionsReady) return;
    // Default-deny: do not query the entity at all without read privilege.
    // The Access Denied screen is rendered separately; this blocks the data call.
    if (!canRead) return;
    load();
  }, [entity, debouncedSearch, sortKey, sortDir, page, pageSize, filters, relatedColKeys, load, viewsReady, permissionsReady, canRead]);

  /** Apply a saved view's columns, filters, and sort to the current grid state */
  const applyView = useCallback(async (view: ViewDefinition) => {
    // Build view filters
    const viewFilters: ActiveFilter[] = (view.filter_json?.conditions ?? []).map((c, idx) => ({
      id: c.id ?? `view-cond-${idx}`,
      field: c.field_logical_name,
      label: c.field_display_name,
      operator: c.operator as ActiveFilter['operator'],
      value: Array.isArray(c.value) ? c.value.join(',') : (c.value ?? ''),
    }));

    // Preserve parent FK filter when applying a view
    setFilters((prev) => {
      const parentFilters = prev.filter((f) => f.id.startsWith('parent_'));
      return [...parentFilters, ...viewFilters];
    });
    // Apply sort from view
    if (view.sort_json?.length) {
      const first = view.sort_json[0];
      const logicalToPhysical: Record<string, string> = { statecode: 'state_code', statusreason: 'status_reason' };
      setSortKey(logicalToPhysical[first.field_logical_name] ?? first.field_logical_name);
      setSortDir(first.direction);
    }

    // Apply columns
    try {
      const cols = await fetchViewColumns(view.view_id);
      const states = buildColumnStatesFromViewColumns(entity, cols);

      setColumnStates(states);
      setSavedColumnSnapshot(columnSnapshot(states));
      // Update ref immediately so the next load() call sees the new related columns
      columnStatesRef.current = states;
      setPage(1);
    } catch {
      // Non-fatal — fall back to default columns
    }
  }, [entity]);

  // columnsModified: true only when viewing a non-system view, a snapshot exists,
  // and the current column layout differs from what was last saved/loaded.
  const columnsModified = !!activeView && !activeView.is_system
    && savedColumnSnapshot !== ''
    && columnSnapshot(columnStates) !== savedColumnSnapshot;

  // Refs so save/switch callbacks always see the latest values without stale closures
  const columnsModifiedRef = useRef(false);
  const activeViewRef = useRef<ViewDefinition | null>(null);
  columnsModifiedRef.current = columnsModified;
  activeViewRef.current = activeView;
  columnStatesRef.current = columnStates;

  const handleSaveViewColumns = useCallback(async () => {
    const view = activeViewRef.current;
    if (!view) return;
    setSavingViewColumns(true);
    try {
      const cols = columnStatesRef.current
        .filter((c) => c.visible && c.field_definition_id)
        .map((c, i) => ({
          field_definition_id: c.field_definition_id!,
          label_override: c.labelOverride ?? null,
          width: c.width ?? null,
          is_sortable: c.sortable ?? false,
          display_order: i,
          relationship_definition_id: c.relationship_definition_id ?? null,
          lookup_label_field_override: c.lookup_label_field_override ?? null,
        }));
      await updateViewColumns(view.view_id, cols);
      setSavedColumnSnapshot(columnSnapshot(columnStatesRef.current));
      showSuccess('View columns saved.');
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to save view columns.'));
    } finally {
      setSavingViewColumns(false);
    }
  }, [showSuccess, showError]);

  /** Switch to a view — prompts to save unsaved column changes first */
  const handleViewChange = useCallback(async (view: ViewDefinition | null) => {
    if (columnsModifiedRef.current) {
      const save = window.confirm(
        `You have unsaved column changes in "${activeViewRef.current?.name}".\n\nOK to save then switch, Cancel to discard and switch.`
      );
      if (save) await handleSaveViewColumns();
    }
    setActiveView(view);
    onActiveViewChange?.(view?.view_id ?? null);
    setSavedColumnSnapshot('');
    if (!view) {
      setColumnStates(buildColumnState(entity));
      setFilters((prev) => prev.filter((f) => f.id.startsWith('parent_')));
      setSortKey('created_at');
      setSortDir('desc');
      setPage(1);
      return;
    }
    await applyView(view);
  }, [entity, applyView, handleSaveViewColumns, onActiveViewChange]);

  /** Called once on initial load for the resolved view — no unsaved-changes check */
  const handleDefaultViewLoaded = useCallback(async (view: ViewDefinition) => {
    setActiveView(view);
    onActiveViewChange?.(view.view_id);
    setSavedColumnSnapshot('');
    await applyView(view);
  }, [applyView, onActiveViewChange]);

  const handleViewsResolved = useCallback(() => {
    setViewsReady(true);
  }, []);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const openColMenu = (e: React.MouseEvent, colKey: string) => {
    e.stopPropagation();
    // Combined sort+filter panel — route directly to colFilter
    if (colFilterKey === colKey) { setColFilterKey(null); setColFilterAnchor(null); return; }
    setColFilterKey(colKey);
    setColFilterAnchor(e.currentTarget as HTMLElement);
    setColMenuKey(null);
    setColMenuAnchor(null);
  };

  const openColFilter = (e: React.MouseEvent, colKey: string) => {
    e.stopPropagation();
    if (colFilterKey === colKey) { setColFilterKey(null); setColFilterAnchor(null); return; }
    setColFilterKey(colKey);
    setColFilterAnchor(e.currentTarget as HTMLElement);
  };

  const applyColFilter = (colKey: string, filter: ActiveFilter | null) => {
    setFilters((prev) => {
      const without = prev.filter((f) => f.id !== `col-filter-${colKey}` && !f.id.startsWith(`col-${colKey}-`));
      if (!filter) return without;
      return [...without, { ...filter, id: `col-filter-${colKey}` }];
    });
    setPage(1);
    setColFilterKey(null);
    setColFilterAnchor(null);
  };

  const getColFilter = (colKey: string): ActiveFilter | null =>
    filters.find((f) => f.id === `col-filter-${colKey}` || f.id.startsWith(`col-${colKey}-`)) ?? null;

  const handlePageSizeChange = (newSize: PageSizeOption) => {
    setPageSize(newSize);
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;
  const totalPages = Math.ceil(total / pageSize);

  const startEdit = (row: ListRow) => {
    const draft: Record<string, string> = {};
    for (const col of editableCols) {
      draft[col] = String(row[col] ?? '');
    }
    setEditDraft(draft);
    setEditingRowId(row.id);
  };

  const cancelEdit = () => {
    setEditingRowId(null);
    setEditDraft({});
  };

  const saveEdit = async (rowId: string) => {
    if (!userId) return;
    setSavingRowId(rowId);
    try {
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(editDraft)) {
        fields[k] = v === '' ? null : v;
      }
      await updateRowFields(entity, rowId, fields, userId);
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, ...fields } : r))
      );
      setEditingRowId(null);
      setEditDraft({});
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to save changes. Please try again.'));
    } finally {
      setSavingRowId(null);
    }
  };

  const handleChangeStatus = async (rowId: string, status: string) => {
    if (!userId) return;
    try {
      await updateRowFields(entity, rowId, { state_code: status }, userId);
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, state_code: status } : r))
      );
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to update status. Please try again.'));
    }
  };

  const handleAssign = async (rowId: string, assignUserId: string, assignUserEmail?: string) => {
    if (!userId) return;
    try {
      await updateRowFields(entity, rowId, { owner_id: assignUserId }, userId);
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, owner_id: assignUserId, owner_email: assignUserEmail ?? r.owner_email } : r))
      );
      showSuccess('Record reassigned successfully.');
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to reassign the record. Please try again.'));
    }
  };

  const renderCell = (row: ListRow, col: ColumnState) => {
    const colKey = col.key;
    const colType = col.type;
    const isEditing = editingRowId === row.id;
    const isEditable = editableCols.includes(colKey);

    if (isEditing && isEditable) {
      return (
        <input
          type={colType === 'currency' ? 'number' : 'text'}
          value={editDraft[colKey] ?? ''}
          onChange={(e) => setEditDraft((d) => ({ ...d, [colKey]: e.target.value }))}
          onClick={(e) => e.stopPropagation()}
          className="w-full px-1.5 py-0.5 text-[12px] border border-[var(--navy-accent)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)] text-[var(--ink-900)]"
          autoFocus={editableCols[0] === colKey}
        />
      );
    }

    // Display path is shared with the dashboard drill-down so cells look identical.
    return renderListCell(row, col, { onOpenRecord, isRedesign });
  };

  if (!permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="text-blue-500 animate-spin" />
      </div>
    );
  }

  // Fully denied only when the user has NONE of the six privileges.
  if (!canOpenEntity) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 gap-4 p-8">
        <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
          <Lock size={24} className="text-red-400" />
        </div>
        <div className="text-center">
          <h2 className="text-[16px] font-semibold text-slate-700 mb-1">Access Denied</h2>
          <p className="text-[13px] text-slate-500 max-w-sm">You do not have permission to access this entity. Contact your administrator to request access.</p>
        </div>
      </div>
    );
  }

  // Entity is open but the user cannot READ the record list (e.g. create-only).
  // Show a focused panel that still allows the actions they DO have.
  if (!canRead) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 gap-4 p-8">
        <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
          <Lock size={24} className="text-amber-400" />
        </div>
        <div className="text-center">
          <h2 className="text-[16px] font-semibold text-slate-700 mb-1">List view not available</h2>
          <p className="text-[13px] text-slate-500 max-w-sm">You do not have permission to view records for this entity, but you can still perform the actions granted to your role.</p>
        </div>
        {canCreate && onNewRecord && (
          <button
            onClick={onNewRecord}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            <Plus size={14} />
            New
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex-1 flex overflow-hidden${isRedesign ? ' rd-active' : ''}`}>
      {isRedesign && (
        <style>{`
          .rd-active{font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
          .rd-pill{display:inline-flex;align-items:center;gap:5px;padding:2px 9px 2px 7px;border-radius:99px;font-size:11px;font-weight:600;line-height:1.5;}
          .rd-pill-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
          .rd-pill-green{background:color-mix(in srgb, var(--success) 13%, transparent);color:var(--success);}.rd-pill-green .rd-pill-dot{background:var(--success);}
          .rd-pill-gray{background:color-mix(in srgb, var(--muted) 16%, transparent);color:var(--muted);}.rd-pill-gray .rd-pill-dot{background:var(--muted);}
          .rd-pill-amber{background:var(--warn-bg);color:var(--warn-text);}.rd-pill-amber .rd-pill-dot{background:var(--warn-text);}
          .rd-pill-red{background:color-mix(in srgb, var(--danger) 14%, transparent);color:var(--danger);}.rd-pill-red .rd-pill-dot{background:var(--danger);}
          .rd-pill-blue{background:color-mix(in srgb, var(--link) 13%, transparent);color:var(--link);}.rd-pill-blue .rd-pill-dot{background:var(--link);}
          .rd-avatar{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#3b6fff,#22d3ee);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-transform:uppercase;}
          .rd-active .rd-row:hover td{background:var(--row-hover) !important;}
        `}</style>
      )}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--surface)' }}>
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--surface)' }}>
        {/* --- Command bar (48px, surface, bottom border) --- */}
        <div
          className="h-[48px] flex items-center gap-1 px-3 shrink-0"
          style={{
            borderBottom: selected.size > 0 ? '1px solid var(--border)' : '1px solid var(--border)',
            background: selected.size > 0 ? 'var(--surface-2)' : 'var(--surface)',
            fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif",
          }}
          ref={toolbarRef}
        >
          {selected.size > 0 ? (
            /* Contextual command bar when rows selected */
            <div className="flex items-center gap-0.5 flex-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-semibold text-[var(--link)] shrink-0" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
                {selected.size} selected
                <button onClick={() => setSelected(new Set())} className="ml-0.5 opacity-70 hover:opacity-100 leading-none">
                  <X size={11} />
                </button>
              </span>
              <CmdSep />
              <BulkActionsBar
                entity={entity}
                entityDefinitionId={entityDefinitionId}
                selected={selected}
                rows={rows}
                columns={visibleColumns}
                users={crmUsers}
                userId={userId}
                canWrite={canWrite}
                canDelete={selected.size > 1 ? canBulkDelete : canDelete}
                canAssign={selected.size > 1 ? canBulkAssign : canAssign}
                canExport={canExportExcel}
                canBulkEdit={selected.size > 1 ? canBulkEdit : canWrite}
                canActivate={canActivate}
                canDeactivate={canDeactivate}
                canShare={canShare}
                onShare={(id) => {
                  const ids = Array.from(selected);
                  if (ids.length > 1) {
                    setShareBulkIds(ids);
                  } else {
                    const row = rows.find((r) => r.id === id);
                    const allCols = ENTITY_COLUMNS[entity] ?? [];
                    const linkCol = allCols.find((c) => c.type === 'link');
                    const label = linkCol && row ? String(row[linkCol.key] ?? '') : id;
                    setShareRecordTarget({ id, label });
                  }
                }}
                onClear={() => setSelected(new Set())}
                onComplete={load}
              />
            </div>
          ) : (
            /* Default command bar */
            <>
              {canCreate && onNewRecord && (
                <button
                  onClick={onNewRecord}
                  className="flex items-center gap-1.5 px-3 h-[32px] text-[12px] font-semibold shrink-0 transition-colors"
                  style={{ background: 'var(--primary)', color: 'var(--primary-text)', borderRadius: 6 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 88%, #000)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--primary)'; }}
                >
                  <Plus size={13} />
                  <span>New</span>
                </button>
              )}
              {canCreate && onNewRecord && <CmdSep />}
              <CmdBtn onClick={load}>
                <RefreshCw size={14} />
                <span>Refresh</span>
              </CmdBtn>
              <CmdBtn onClick={() => setShowFilters((v) => !v)} active={showFilters || filters.length > 0}>
                <SlidersHorizontal size={14} />
                <span>Filters</span>
                {filters.length > 0 && (
                  <span className="text-[9px] bg-[var(--navy-accent)] text-white w-4 h-4 rounded-full flex items-center justify-center font-bold leading-none">
                    {filters.length}
                  </span>
                )}
              </CmdBtn>
              {userId && (() => {
                const myFilter = filters.find((f) => f.field === 'owner_id' && f.value === userId);
                return (
                  <CmdBtn
                    onClick={() => {
                      if (myFilter) {
                        setFilters((prev) => prev.filter((f) => f.id !== myFilter.id));
                      } else {
                        setFilters((prev) => [
                          ...prev.filter((f) => f.field !== 'owner_id'),
                          { id: `assigned_me_${Date.now()}`, field: 'owner_id', label: 'Owner', operator: 'eq', value: userId },
                        ]);
                      }
                      setPage(1);
                    }}
                    active={!!myFilter}
                  >
                    <UserCheck size={14} />
                    <span>Mine</span>
                  </CmdBtn>
                );
              })()}
              <div ref={colBtnRef} className="relative">
                <CmdBtn onClick={() => setShowColCustomizer((v) => !v)} active={showColCustomizer}>
                  <Columns3 size={14} />
                  <span>Edit columns</span>
                  {columnsModified && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved column changes" />
                  )}
                </CmdBtn>
                {showColCustomizer && (
                  <ColumnCustomizer
                    columns={columnStates}
                    defaultColumns={ENTITY_COLUMNS[entity] ?? []}
                    entityDefinitionId={entityDefinitionId}
                    activeViewName={activeView?.name ?? null}
                    isSystemView={activeView?.is_system ?? false}
                    hasUnsavedChanges={columnsModified}
                    savingView={savingViewColumns}
                    onChange={setColumnStates}
                    onClose={() => setShowColCustomizer(false)}
                    onSaveView={handleSaveViewColumns}
                    isRedesign={isRedesign}
                  />
                )}
              </div>
              {(canImport || canExportExcel) && <CmdSep />}
              {canImport && (
                <CmdBtn onClick={() => setShowImportModal(true)}>
                  <Upload size={14} />
                  <span>Import</span>
                </CmdBtn>
              )}
              {canExportExcel && (
                <CmdBtn onClick={() => {
                  if (rows.length === 0) return;
                  const cols = visibleColumns;
                  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                  const idHeader = `${entityName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} ID`;
                  const headers = [idHeader, ...cols.map((c) => c.labelOverride || c.label)];
                  const dataRows = rows.map((row) => [
                    row.id,
                    ...cols.map((col) => {
                      const val = row[col.key];
                      if (val == null || val === '') return '';
                      if (typeof val === 'object' && !Array.isArray(val)) return '';
                      const s = String(val);
                      if (UUID_RE.test(s)) return '';
                      if (col.type === 'date') { try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return s; } }
                      if (col.type === 'currency') { const n = Number(val); if (!isNaN(n)) { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: (row.currency_code as string) ?? 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n); } catch { return String(n); } } return ''; }
                      if (col.type === 'boolean') return (val === true || val === 'true' || val === '1' || val === 1) ? 'Yes' : (val === false || val === 'false' || val === '0' || val === 0) ? 'No' : '';
                      if (col.type === 'owner') return /^[0-9a-f]{8}-/i.test(s) ? '' : s.split('@')[0];
                      return s;
                    }),
                  ]);
                  const wb = XLSX.utils.book_new();
                  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
                  ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 38 : Math.max(h.length + 4, 14) }));
                  XLSX.utils.book_append_sheet(wb, ws, 'Export');
                  downloadWorkbook(wb, `${entity}-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
                }}>
                  <Download size={14} />
                  <span>Export</span>
                </CmdBtn>
              )}
              <div className="flex-1" />
              {loading ? (
                <span className="text-[11px] text-[var(--muted)] animate-pulse">Loading…</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--muted)] px-3 py-1" style={{ background: 'color-mix(in srgb, var(--link) 12%, transparent)', border: '1px solid var(--border)', borderRadius: 99 }}>
                  <span className="font-bold text-[var(--link)]">{total.toLocaleString()}</span>
                  &nbsp;record{total !== 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        </div>

        {/* --- View row (white, bottom border) --- */}
        <div
          className="flex items-center gap-3 px-4 py-2 shrink-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif" }}
        >
          <ViewSelector
            entityDefinitionId={entityDefinitionId}
            activeViewId={activeView?.view_id ?? null}
            initialViewId={initialViewId}
            currentUserId={userId}
            onViewChange={handleViewChange}
            onDefaultViewLoaded={handleDefaultViewLoaded}
            onViewsResolved={handleViewsResolved}
            onSaveAsNew={() => setShowSaveViewModal(true)}
            onShareView={(v) => setShareTarget(v)}
          />
          <div className="flex-1" />
          <button
            onClick={() => setShowColCustomizer((v) => !v)}
            className="flex items-center gap-1.5 px-2 h-[32px] text-[13px] font-medium text-[var(--muted)] shrink-0 transition rounded-md hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
          >
            <Columns3 size={14} />
            <span>Edit columns</span>
          </button>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 px-2 h-[32px] text-[13px] font-medium text-[var(--muted)] shrink-0 transition rounded-md hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
          >
            <Filter size={14} />
            <span>Edit filters</span>
          </button>
          <div className="relative w-[210px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Filter by keyword"
              className="w-full h-[32px] pl-8 pr-7 text-[12px] text-[var(--text)] placeholder-[var(--muted)] focus:outline-none transition"
              style={{ background: 'var(--input-bg)', border: '1px solid transparent', borderRadius: 10 }}
              onFocus={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.border = '1px solid var(--border)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--link) 14%, transparent)'; }}
              onBlur={(e) => { if (!e.currentTarget.value) { e.currentTarget.style.background = 'var(--input-bg)'; e.currentTarget.style.border = '1px solid transparent'; } e.currentTarget.style.boxShadow = ''; }}
            />
            {search && (
              <button
                onClick={() => onSearchChange?.('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {getEntityRules(entity).length > 0 && (
          <HighlightLegend entity={entity} />
        )}

        {activeParentFilter && (
          <div
            className="flex items-center gap-2 px-4 py-2"
            style={{ background: 'color-mix(in srgb, var(--link) 12%, transparent)', borderBottom: '1px solid var(--border)' }}
          >
            <span className="text-[11px] text-[var(--link)]">
              Showing <span className="font-semibold">{entity}</span> for <span className="font-semibold">{activeParentFilter.parentLabel}</span>
            </span>
            <button
              onClick={() => {
                const parentFilterId = `parent_${activeParentFilter.fkColumn}`;
                setFilters((prev) => prev.filter((f) => f.id !== parentFilterId));
                setActiveParentFilter(undefined);
                setPage(1);
                if (onClearParentFilter) onClearParentFilter();
              }}
              className="ml-1 text-[10px] text-[var(--link)] hover:underline font-medium"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* --- Data grid --- */}
        <div className="flex-1 overflow-auto" style={{ background: 'var(--surface)' }}>
          {error ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <p className="text-[13px] text-red-500 font-medium">{error}</p>
              <button onClick={load} className="mt-3 text-[12px] text-[var(--link)] hover:underline">
                Try again
              </button>
            </div>
          ) : (
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={`w-10 px-3 py-2 bg-[var(--surface-2)]`} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      className="crm-checkbox"
                    />
                  </th>
                  {visibleColumns.map((col) => {
                    const colHasFilter = !!getColFilter(col.key);
                    const colPanelOpen = colFilterKey === col.key;
                    return (
                      <th
                        key={col.key}
                        style={col.width ? { width: col.width, borderBottom: '1px solid var(--divider)' } : { borderBottom: '1px solid var(--divider)' }}
                        className={`bg-[var(--surface-2)] text-left whitespace-nowrap select-none relative group/th`}
                      >
                        <button
                          onClick={(e) => openColMenu(e, col.key)}
                          className={`w-full flex items-center gap-1.5 px-3.5 py-2.5 text-left transition-colors ${
                            colPanelOpen || colHasFilter
                              ? 'bg-[var(--ink-50)]'
                              : 'hover:bg-[var(--ink-50)]'
                          }`}
                        >
                          <span className={`text-[12px] font-semibold truncate ${
                            colHasFilter ? 'text-[var(--link)]' : 'text-[var(--muted)]'
                          }`}>
                            {col.labelOverride || col.label}
                          </span>
                          {col.relationship_definition_id && (
                            <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-[var(--ink-50)] text-[var(--ink-400)] leading-none shrink-0" style={{ border: '1px solid var(--border)' }}>
                              {col.related_entity_display_name ?? 'Rel'}
                            </span>
                          )}
                          <span className="ml-auto flex items-center gap-0.5 shrink-0">
                            {col.sortable && sortKey === (col.field_physical_column ?? col.key) && (
                              sortDir === 'asc'
                                ? <ChevronUp size={12} className="text-[var(--navy-accent)]" />
                                : <ChevronDown size={12} className="text-[var(--navy-accent)]" />
                            )}
                            {colHasFilter && (
                              <Filter size={10} className="text-[var(--navy-accent)]" />
                            )}
                            <ChevronDown size={11} className={`transition-all ${colPanelOpen ? 'rotate-180 text-[var(--navy-accent)] opacity-100' : 'text-[var(--ink-300)] opacity-0 group-hover/th:opacity-100'}`} />
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  <th className={`w-36 px-3 py-2 bg-[var(--surface-2)]`} style={{ borderBottom: '1px solid var(--divider)' }} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: pageSize < 10 ? pageSize : 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--divider)' }}>
                        <div className="w-3.5 h-3.5 rounded" style={{ background: 'var(--ink-100)' }} />
                      </td>
                      {visibleColumns.map((col) => (
                        <td key={col.key} className="px-3 py-2" style={{ borderBottom: '1px solid var(--divider)' }}>
                          <div className={`h-3 rounded ${col.type === 'badge' ? 'w-16' : col.type === 'currency' ? 'w-20' : col.type === 'date' ? 'w-24' : 'w-32'}`} style={{ opacity: 1 - i * 0.07, background: 'var(--ink-100)' }} />
                        </td>
                      ))}
                      <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--divider)' }} />
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 2}>
                      <div className="flex flex-col items-center justify-center py-24 text-[var(--ink-400)]">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--ink-50)' }}>
                          <Inbox size={22} className="text-[var(--ink-300)]" />
                        </div>
                        <p className="text-[14px] font-medium text-[var(--ink-600)] mb-1">No records found</p>
                        <p className="text-[12px] text-[var(--ink-400)]">
                          {filters.length > 0 || debouncedSearch
                            ? 'Try adjusting your filters or search terms.'
                            : 'Get started by creating a new record.'}
                        </p>
                        {(filters.length > 0 || debouncedSearch) ? (
                          <button onClick={() => setFilters([])} className="mt-3 text-[12px] text-[var(--link)] hover:underline">
                            Clear filters
                          </button>
                        ) : (
                          <button onClick={onNewRecord} className="mt-3 text-[12px] text-[var(--link)] hover:underline font-medium">
                            Create first record
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isSelected = selected.has(row.id);
                    const isEditingThis = editingRowId === row.id;
                    const isSaving = savingRowId === row.id;
                    const highlight = !isEditingThis && !isSelected ? evaluateRowHighlight(entity, row) : null;

                    return (
                      <tr
                        key={row.id}
                        onMouseEnter={() => setHoveredRow(row.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        onClick={() => {
                          if (!isEditingThis) {
                            const allCols = ENTITY_COLUMNS[entity] ?? [];
                            const linkCol = allCols.find((c) => c.type === 'link');
                            const label = linkCol ? String(row[linkCol.key] ?? '') : undefined;
                            onOpenRecord?.(row.id, label);
                          }
                        }}
                        className={`group transition-colors duration-100 cursor-pointer${isRedesign ? ' rd-row' : ''} ${
                          !isEditingThis && !isSelected && highlight ? highlight.leftBorderClass : ''
                        } ${isSaving ? 'opacity-60' : ''}`}
                        style={{
                          height: 44,
                          background: isEditingThis
                            ? 'color-mix(in srgb, var(--link) 14%, transparent)'
                            : isSelected
                            ? 'color-mix(in srgb, var(--link) 12%, transparent)'
                            : 'var(--surface)',
                        }}
                      >
                        <td
                          className="px-3"
                          style={{
                            borderBottom: '1px solid var(--divider)',
                            borderLeft: isSelected ? '3px solid var(--navy-accent)' : '3px solid transparent',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(row.id)}
                            className="crm-checkbox"
                          />
                        </td>
                        {visibleColumns.map((col) => (
                          <td
                            key={col.key}
                            className="whitespace-nowrap text-[14px]"
                            style={{ borderBottom: '1px solid var(--divider)', padding: '9px 14px' }}
                            onClick={isEditingThis ? (e) => e.stopPropagation() : undefined}
                          >
                            {renderCell(row, col)}
                          </td>
                        ))}
                        <td
                          className="px-3 text-right"
                          style={{ borderBottom: '1px solid var(--divider)', minWidth: 80 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-2">
                            {highlight && !isEditingThis && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-100 ${highlight.badgeClass}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${highlight.badgeDotClass}`} />
                                {highlight.rule.label}
                              </span>
                            )}
                            {isEditingThis && (
                              <InlineRowActions
                                rowId={row.id}
                                entity={entity}
                                canWrite={canWrite}
                                isEditing={isEditingThis}
                                onEdit={() => startEdit(row)}
                                onSave={() => saveEdit(row.id)}
                                onCancel={cancelEdit}
                                onChangeStatus={(status) => handleChangeStatus(row.id, status)}
                                onAssign={(uid, email) => handleAssign(row.id, uid, email)}
                                assignUsers={crmUsers}
                              />
                            )}
                            {!isEditingThis && canShare && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const allCols = ENTITY_COLUMNS[entity] ?? [];
                                  const linkCol = allCols.find((c) => c.type === 'link');
                                  const label = linkCol ? String(row[linkCol.key] ?? '') : row.id;
                                  setShareRecordTarget({ id: row.id, label });
                                }}
                                title="Share record"
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[var(--muted)] hover:text-[var(--link)] hover:bg-[var(--row-hover)] rounded transition opacity-0 group-hover:opacity-100 duration-100"
                              >
                                <Share2 size={11} />
                                Share
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* --- Alphabet bar (30px) --- */}
        <AlphabetBar />

        {/* --- Pagination footer (42px) --- */}
        <div
          className="h-[42px] px-5 flex items-center justify-between shrink-0 bg-white"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            {selected.size > 0 && (
              <span className="text-[12px] text-[var(--navy-accent)] font-semibold">{selected.size} selected</span>
            )}
            {selected.size > 0 && <span className="text-[var(--ink-200)]">|</span>}
            <span className="text-[12px] text-[var(--ink-500)] tabular-nums">
              {loading
                ? <span className="inline-block w-28 h-3 rounded animate-pulse align-middle" style={{ background: 'var(--ink-100)' }} />
                : total === 0
                ? 'No records'
                : `Showing ${((page - 1) * pageSize + 1).toLocaleString()}–${Math.min(page * pageSize, total).toLocaleString()} of ${total.toLocaleString()}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--ink-400)]">Rows per page</span>
              <FilterSelect
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value) as PageSizeOption)}
                className="h-[24px] px-1 text-[11px] border rounded bg-white text-[var(--ink-700)] focus:outline-none"
                style={{ borderColor: 'var(--border)' }}
              >
                {PAGE_SIZE_OPTIONS.map((sz) => (
                  <option key={sz} value={sz}>{sz}</option>
                ))}
              </FilterSelect>
            </div>
            <div className="flex items-center gap-0.5">
              <PgBtn disabled={page <= 1 || loading} onClick={() => setPage(1)} title="First page">
                <ChevronLeft size={9} className="mr-[-3px]" /><ChevronLeft size={9} />
              </PgBtn>
              <PgBtn disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={12} />
              </PgBtn>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    disabled={loading}
                    className={`w-6 h-6 text-[11px] rounded transition font-medium ${
                      p === page
                        ? 'bg-[var(--navy-accent)] text-white'
                        : 'text-[var(--ink-600)] hover:bg-[var(--ink-50)]'
                    }`}
                    style={p !== page ? { border: '1px solid var(--border)' } : undefined}
                  >
                    {p}
                  </button>
                );
              })}
              <PgBtn disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={12} />
              </PgBtn>
              <PgBtn disabled={page >= totalPages || loading} onClick={() => setPage(totalPages)} title="Last page">
                <ChevronRight size={9} className="mr-[-3px]" /><ChevronRight size={9} />
              </PgBtn>
            </div>
          </div>
        </div>
        </div>
      </div>

      {showFilters && (
        <FilterPanel
          entity={entity}
          filters={filters}
          onFiltersChange={(f) => { setFilters(f); setPage(1); }}
          onClose={() => setShowFilters(false)}
          userId={userId}
          entityDefinitionId={entityDefinitionId}
        />
      )}

      {showSaveViewModal && entityDefinitionId && (
        <SaveViewModal
          entityDefinitionId={entityDefinitionId}
          columnStates={columnStates}
          filters={filters}
          sortKey={sortKey}
          sortDir={sortDir}
          onSaved={(viewId, viewName) => {
            setShowSaveViewModal(false);
            showSuccess(`View "${viewName}" saved.`);
            // ViewSelector will reload automatically on next open
          }}
          onClose={() => setShowSaveViewModal(false)}
        />
      )}

      {shareTarget && (
        <ShareViewModal
          view={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}

      {shareBulkIds && (
        <ShareRecordModal
          entity={entity}
          recordIds={shareBulkIds}
          onClose={() => setShareBulkIds(null)}
        />
      )}

      {shareRecordTarget && (
        <ShareRecordModal
          entity={entity}
          recordId={shareRecordTarget.id}
          recordLabel={shareRecordTarget.label}
          onClose={() => setShareRecordTarget(null)}
        />
      )}

      {showImportModal && (
        <ImportFromExcelModal
          entity={entity}
          entityLabel={entityName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          viewName={activeView?.name ?? 'Default View'}
          viewColumns={columnStates}
          userId={userId ?? ''}
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => { load(); showSuccess('Import completed. Grid refreshed.'); }}
        />
      )}

      {/* Combined sort + filter panel for column headers */}
      {colFilterKey && colFilterAnchor && (() => {
        const col = visibleColumns.find((c) => c.key === colFilterKey);
        if (!col) return null;
        return (
          <ColumnFilterDropdown
            column={col}
            currentFilter={getColFilter(colFilterKey)}
            anchorEl={colFilterAnchor}
            entityDefinitionId={entityDefinitionId}
            entityTable={entityName}
            onApply={(filter) => applyColFilter(colFilterKey, filter)}
            onClose={() => { setColFilterKey(null); setColFilterAnchor(null); }}
            isRedesign={isRedesign}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={col.sortable ? (dir) => {
              const sk = col.field_physical_column ?? col.key;
              setSortKey(sk);
              setSortDir(dir);
              setPage(1);
            } : undefined}
          />
        );
      })()}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function CmdBtn({ children, onClick, active }: { children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`h-[32px] flex items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors ${
        active
          ? 'text-[var(--link)] bg-[var(--surface-2)]'
          : 'text-[var(--muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]'
      }`}
      style={{ borderRadius: 6, border: 'none' }}
    >
      {children}
    </button>
  );
}

function CmdSep() {
  return <div className="w-px h-[16px] mx-1.5 shrink-0" style={{ background: 'var(--border)' }} />;
}

function PgBtn({ children, disabled, onClick, title }: { children: React.ReactNode; disabled: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="w-6 h-6 flex items-center justify-center text-[var(--ink-500)] rounded transition disabled:opacity-30 hover:bg-[var(--ink-50)]"
      style={{ border: '1px solid var(--border)' }}
    >
      {children}
    </button>
  );
}

function AlphabetBar() {
  const letters = ['All', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  return (
    <div
      className="h-[34px] flex items-center justify-center gap-0 px-3 shrink-0 bg-white"
      style={{ borderTop: '1px solid var(--divider)' }}
    >
      {letters.map((l) => (
        <button
          key={l}
          className="flex-1 max-w-[30px] h-full flex items-center justify-center text-[12px] font-medium text-[var(--ink-500)] hover:text-[var(--navy-accent)] hover:bg-[var(--ink-50)] transition-colors"
        >
          {l}
        </button>
      ))}
    </div>
  );
}
