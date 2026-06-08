import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, Shield, Wrench, Copy, Trash2, Lock, Search,
  Plus, Star, ToggleLeft, ToggleRight, Eye, TrendingUp,
  PieChart, Table2, Activity,
} from 'lucide-react';
import {
  fetchDashboards, deleteDashboard, cloneDashboard, updateDashboard, createDashboard,
} from '../../services/dashboardService';
import type { Dashboard, DashboardModule } from '../../types/dashboard';

type CategoryTab = 'all' | 'system' | 'custom';

const MODULE_COLORS: Record<string, string> = {
  sales:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  marketing: 'bg-amber-50 text-amber-700 border-amber-200',
  support:   'bg-sky-50 text-sky-700 border-sky-200',
  all:       'bg-slate-100 text-slate-600 border-slate-200',
};

const MODULE_LABELS: Record<string, string> = {
  sales: 'Sales', marketing: 'Marketing', support: 'Support', all: 'All',
};

interface DashboardCardProps {
  dashboard: Dashboard;
  onEdit: (d: Dashboard) => void;
  onClone: (d: Dashboard) => void;
  onToggle: (d: Dashboard) => void;
  onDelete: (d: Dashboard) => void;
}

function DashboardCard({ dashboard: d, onEdit, onClone, onToggle, onDelete }: DashboardCardProps) {
  const isSystem = d.is_system;
  const canDelete = d.is_deletable && !isSystem;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl hover:border-slate-300 hover:shadow-sm transition-all group">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
              <BarChart2 size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-slate-800 truncate">{d.name}</span>
                {d.is_default && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold rounded-full">
                    <Star size={8} /> Default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {isSystem ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-semibold rounded-full">
                    <Shield size={8} /> System
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold rounded-full">
                    <Wrench size={8} /> Custom
                  </span>
                )}
                <span className={`inline-flex items-center px-1.5 py-0.5 border text-[10px] font-semibold rounded-full ${MODULE_COLORS[d.module]}`}>
                  {MODULE_LABELS[d.module]}
                </span>
                <span className={`inline-flex items-center px-1.5 py-0.5 border text-[10px] font-semibold rounded-full ${
                  d.is_active
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-slate-100 border-slate-200 text-slate-500'
                }`}>
                  {d.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {d.description && (
          <p className="text-xs text-slate-500 leading-relaxed mb-4 line-clamp-2">{d.description}</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
          <button
            onClick={() => onEdit(d)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Eye size={11} />
            {isSystem ? 'View / Edit' : 'Design'}
          </button>

          <div className="flex items-center gap-1">
            {!isSystem && (
              <button
                onClick={() => onToggle(d)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                title={d.is_active ? 'Deactivate' : 'Activate'}
              >
                {d.is_active
                  ? <ToggleRight size={14} className="text-emerald-500" />
                  : <ToggleLeft size={14} className="text-slate-400" />
                }
              </button>
            )}
            <button
              onClick={() => onClone(d)}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              title="Clone dashboard"
            >
              <Copy size={13} className="text-slate-400" />
            </button>
            {canDelete ? (
              <button
                onClick={() => onDelete(d)}
                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors group/del"
                title="Delete dashboard"
              >
                <Trash2 size={13} className="text-slate-400 group-hover/del:text-red-500 transition-colors" />
              </button>
            ) : (
              <div className="p-1.5" title="System dashboards cannot be deleted">
                <Lock size={13} className="text-slate-300" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CloneModalProps {
  dashboard: Dashboard;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  loading: boolean;
}

function CloneModal({ dashboard, onConfirm, onCancel, loading }: CloneModalProps) {
  const [name, setName] = useState(`${dashboard.name} (Copy)`);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Copy size={18} className="text-blue-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Clone Dashboard</h3>
            <p className="text-xs text-slate-500">Creates an editable copy</p>
          </div>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 mb-4"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(name.trim())}
            disabled={!name.trim() || loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Cloning…' : 'Clone & Open'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteModalProps {
  dashboard: Dashboard;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function DeleteModal({ dashboard, onConfirm, onCancel, loading }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Delete Dashboard</h3>
            <p className="text-xs text-slate-500">This cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Delete <strong>{dashboard.name}</strong>? All widgets will be permanently removed.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

const WIDGET_PALETTE = [
  { icon: <BarChart2 size={18} />, label: 'Bar Chart', type: 'chart', color: 'text-blue-500 bg-blue-50 border-blue-200' },
  { icon: <TrendingUp size={18} />, label: 'Line Chart', type: 'chart', color: 'text-emerald-500 bg-emerald-50 border-emerald-200' },
  { icon: <PieChart size={18} />, label: 'Pie / Donut', type: 'chart', color: 'text-amber-500 bg-amber-50 border-amber-200' },
  { icon: <Activity size={18} />, label: 'KPI Card', type: 'kpi', color: 'text-rose-500 bg-rose-50 border-rose-200' },
  { icon: <Table2 size={18} />, label: 'Data Table', type: 'table', color: 'text-slate-600 bg-slate-100 border-slate-200' },
];

interface NewDashboardModalProps {
  onConfirm: (data: { name: string; description: string; module: DashboardModule }) => void;
  onCancel: () => void;
  loading: boolean;
}

function NewDashboardModal({ onConfirm, onCancel, loading }: NewDashboardModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [module, setModule] = useState<DashboardModule>('sales');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Plus size={18} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">New Dashboard</h3>
            <p className="text-xs text-slate-500">Start with a blank canvas</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Dashboard Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. eSIM Business Dashboard"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Module</label>
            <select
              value={module}
              onChange={(e) => setModule(e.target.value as DashboardModule)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white"
            >
              <option value="sales">Sales</option>
              <option value="marketing">Marketing</option>
              <option value="support">Support</option>
              <option value="all">All Modules</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ name: name.trim(), description, module })}
            disabled={!name.trim() || loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DashboardListPageProps {
  onEdit: (dashboard: Dashboard) => void;
}

export default function DashboardListPage({ onEdit }: DashboardListPageProps) {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cloning, setCloning] = useState<Dashboard | null>(null);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [deleting, setDeleting] = useState<Dashboard | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newLoading, setNewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDashboards();
      setDashboards(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = dashboards.filter((d) => {
    if (categoryTab === 'system' && !d.is_system) return false;
    if (categoryTab === 'custom' && d.is_system) return false;
    if (moduleFilter !== 'all' && d.module !== moduleFilter) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: dashboards.length,
    system: dashboards.filter((d) => d.is_system).length,
    custom: dashboards.filter((d) => !d.is_system).length,
  };

  const handleToggle = async (d: Dashboard) => {
    const updated = await updateDashboard(d.dashboard_id, { is_active: !d.is_active });
    setDashboards((prev) => prev.map((x) => x.dashboard_id === d.dashboard_id ? updated : x));
  };

  const handleCloneConfirm = async (name: string) => {
    if (!cloning) return;
    setCloneLoading(true);
    try {
      const cloned = await cloneDashboard(cloning.dashboard_id, name);
      setDashboards((prev) => [...prev, cloned]);
      setCloning(null);
      onEdit(cloned);
    } finally {
      setCloneLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await deleteDashboard(deleting.dashboard_id);
      setDashboards((prev) => prev.filter((d) => d.dashboard_id !== deleting.dashboard_id));
      setDeleting(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleNew = async (data: { name: string; description: string; module: DashboardModule }) => {
    setNewLoading(true);
    try {
      const created = await createDashboard({
        name: data.name,
        description: data.description || null,
        module: data.module,
        is_system: false,
        is_deletable: true,
        is_default: false,
        is_active: true,
        layout_json: { columns: 12, row_height: 80 },
      });
      setDashboards((prev) => [...prev, created]);
      setShowNew(false);
      onEdit(created);
    } finally {
      setNewLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f3f4f6]">
      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {(['all', 'system', 'custom'] as CategoryTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setCategoryTab(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize ${
                categoryTab === tab
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'system' ? 'System' : 'Custom'} ({counts[tab]})
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dashboards…"
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 bg-white"
            />
          </div>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 bg-white"
          >
            <option value="all">All Modules</option>
            <option value="sales">Sales</option>
            <option value="marketing">Marketing</option>
            <option value="support">Support</option>
          </select>
        </div>

        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <Plus size={13} /> New Dashboard
        </button>
      </div>

      {/* Widget palette hint */}
      <div className="bg-white border-b border-slate-100 px-6 py-2.5 flex items-center gap-3 shrink-0">
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Widget Types</span>
        <div className="flex items-center gap-2">
          {WIDGET_PALETTE.map((w) => (
            <div key={w.label} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium ${w.color}`}>
              {w.icon} {w.label}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <BarChart2 size={32} className="text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">No dashboards found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting the filters or create a new dashboard</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((d) => (
              <DashboardCard
                key={d.dashboard_id}
                dashboard={d}
                onEdit={onEdit}
                onClone={setCloning}
                onToggle={handleToggle}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}
      </div>

      {cloning && (
        <CloneModal
          dashboard={cloning}
          onConfirm={handleCloneConfirm}
          onCancel={() => setCloning(null)}
          loading={cloneLoading}
        />
      )}
      {deleting && (
        <DeleteModal
          dashboard={deleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleting(null)}
          loading={deleteLoading}
        />
      )}
      {showNew && (
        <NewDashboardModal
          onConfirm={handleNew}
          onCancel={() => setShowNew(false)}
          loading={newLoading}
        />
      )}
    </div>
  );
}
