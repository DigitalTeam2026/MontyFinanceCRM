import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Save, RefreshCw, Star, StarOff, Columns3, Filter, ArrowUpDown, Search, Globe, User, Settings2, Copy, Check, X } from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { ViewDefinition, ViewColumn, FilterGroup, SortDefinition } from '../../types/view';
import type { FieldDefinition } from '../../types/field';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { cloneView, fetchViewColumns, saveView, saveViewColumns, setDefaultView } from '../../services/viewService';
import ColumnSelector from './ColumnSelector';
import FilterBuilder from './FilterBuilder';
import SortBuilder from './SortBuilder';
import QuickFindEditor from './QuickFindEditor';

type ActiveTab = 'columns' | 'filter' | 'sort' | 'quickfind';

const VIEW_TYPE_ICONS: Record<string, React.ReactNode> = {
  public: <Globe size={12} />,
  personal: <User size={12} />,
  system: <Settings2 size={12} />,
};

interface ViewDesignerPageProps {
  view: ViewDefinition;
  entityId: string;
  onBack: () => void;
  onViewUpdate: (v: ViewDefinition) => void;
}

export default function ViewDesignerPage({
  view: initialView,
  entityId,
  onBack,
  onViewUpdate,
}: ViewDesignerPageProps) {
  const { showSuccess, showError } = useToast();
  const [view, setView] = useState<ViewDefinition>(initialView);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [columns, setColumns] = useState<ViewColumn[]>([]);
  const [filter, setFilter] = useState<FilterGroup | null>(initialView.filter_json ?? null);
  const [sorts, setSorts] = useState<SortDefinition[]>(initialView.sort_json ?? []);
  const [quickFind, setQuickFind] = useState<string[]>(initialView.quick_find_fields ?? []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('columns');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(view.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [flds, cols] = await Promise.all([
          fetchFieldsForEntity(entityId),
          fetchViewColumns(view.view_id),
        ]);
        setFields(flds);
        setColumns(cols);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [view.view_id, entityId]);

  const markDirty = () => setDirty(true);

  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== view.name) {
      setView((v) => ({ ...v, name: trimmed }));
      setDraftName(trimmed);
      markDirty();
    } else {
      setDraftName(view.name);
    }
    setEditingName(false);
  };

  const startEditingName = () => {
    setDraftName(view.name);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await saveView(view.view_id, {
        name: view.name,
        filter_json: filter,
        sort_json: sorts,
        quick_find_fields: quickFind,
      });
      await saveViewColumns(view.view_id, columns);
      setView(updated);
      onViewUpdate(updated);
      setDirty(false);
      showSuccess('View saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to save view');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async () => {
    try {
      await setDefaultView(view.view_id, entityId);
      setView((v) => ({ ...v, is_default: true }));
      markDirty();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to set default');
    }
  };

  const handleClone = async () => {
    setCloning(true);
    try {
      await cloneView(view.view_id, `${view.name} (Copy)`);
      showSuccess('View cloned');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to clone view');
    } finally {
      setCloning(false);
    }
  };

  const TABS: { id: ActiveTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'columns', label: 'Columns', icon: <Columns3 size={13} />, count: columns.length || undefined },
    { id: 'filter', label: 'Filters', icon: <Filter size={13} />, count: (filter?.conditions?.length ?? 0) + (filter?.groups?.length ?? 0) || undefined },
    { id: 'sort', label: 'Sort', icon: <ArrowUpDown size={13} />, count: sorts.length || undefined },
    { id: 'quickfind', label: 'Quick Find', icon: <Search size={13} />, count: quickFind.length || undefined },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50">
      <div className="h-12 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0 shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors shrink-0"
        >
          <ArrowLeft size={13} />
          Views
        </button>

        <div className="w-px h-5 bg-slate-200 shrink-0" />

        {/* Inline name editor */}
        {editingName ? (
          <div className="flex items-center gap-1">
            <input
              ref={nameInputRef}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') { setDraftName(view.name); setEditingName(false); }
              }}
              className="text-xs font-semibold text-slate-800 border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 w-48"
              autoFocus
            />
            <button onClick={commitName} className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors">
              <Check size={12} />
            </button>
            <button onClick={() => { setDraftName(view.name); setEditingName(false); }} className="p-1 text-slate-400 hover:bg-slate-100 rounded transition-colors">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={startEditingName}
            className="text-xs font-semibold text-slate-800 hover:text-blue-600 hover:underline transition-colors truncate max-w-[180px]"
            title="Click to rename"
          >
            {view.name}
          </button>
        )}

        <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full shrink-0">
          {VIEW_TYPE_ICONS[view.view_type]}
          <span className="capitalize ml-1">{view.view_type}</span>
        </div>

        {view.is_default && (
          <div className="flex items-center gap-1 text-[10px] text-amber-600 shrink-0">
            <Star size={11} className="fill-amber-400" />
            Default
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {dirty && <span className="text-[10px] text-amber-500">Unsaved changes</span>}
          <button
            onClick={handleClone}
            disabled={cloning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
            title="Clone this view"
          >
            <Copy size={12} />
            {cloning ? 'Cloning...' : 'Clone'}
          </button>
          {!view.is_default && (
            <button
              onClick={handleSetDefault}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <StarOff size={12} />
              Set Default
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={12} />
            {saving ? 'Saving...' : 'Save View'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="px-3 py-3 border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Designer
            </p>
          </div>
          <nav className="py-1.5 px-2 space-y-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-blue-600' : 'text-slate-400'}>
                  {tab.icon}
                </span>
                <span className="flex-1">{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.id ? 'bg-blue-200 text-blue-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="mt-auto px-3 py-3 border-t border-slate-100">
            <PreviewPanel columns={columns} filter={filter} sorts={sorts} quickFind={quickFind} />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {activeTab === 'columns' && (
              <ColumnSelector
                fields={fields}
                columns={columns}
                onChange={(cols) => { setColumns(cols); markDirty(); }}
              />
            )}
            {activeTab === 'filter' && (
              <FilterBuilder
                fields={fields}
                filter={filter}
                onChange={(f) => { setFilter(f); markDirty(); }}
              />
            )}
            {activeTab === 'sort' && (
              <SortBuilder
                fields={fields}
                sorts={sorts}
                onChange={(s) => { setSorts(s); markDirty(); }}
              />
            )}
            {activeTab === 'quickfind' && (
              <QuickFindEditor
                fields={fields}
                selected={quickFind}
                onChange={(qf) => { setQuickFind(qf); markDirty(); }}
              />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

function PreviewPanel({
  columns,
  filter,
  sorts,
  quickFind,
}: {
  columns: ViewColumn[];
  filter: FilterGroup | null;
  sorts: SortDefinition[];
  quickFind: string[];
}) {
  const hasFilter = (filter?.conditions?.length ?? 0) + (filter?.groups?.length ?? 0) > 0;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Summary</p>
      <div className="space-y-1.5">
        <SummaryRow label="Columns" value={columns.length > 0 ? `${columns.length} defined` : 'None'} good={columns.length > 0} />
        <SummaryRow label="Filters" value={hasFilter ? 'Applied' : 'None'} good={hasFilter} />
        <SummaryRow label="Sort" value={sorts.length > 0 ? `${sorts.length} field${sorts.length !== 1 ? 's' : ''}` : 'Default'} good={sorts.length > 0} />
        <SummaryRow label="Quick Find" value={quickFind.length > 0 ? `${quickFind.length} field${quickFind.length !== 1 ? 's' : ''}` : 'None'} good={quickFind.length > 0} />
      </div>
    </div>
  );
}

function SummaryRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-400">{label}</span>
      <span className={`text-[10px] font-medium ${good ? 'text-blue-600' : 'text-slate-400'}`}>{value}</span>
    </div>
  );
}
