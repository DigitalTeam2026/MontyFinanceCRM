import { useEffect, useState, useMemo } from 'react';
import {
  Plus, Search, Database, Trash2, RefreshCw, Lock,
  ChevronUp, ChevronDown, MoreHorizontal, Download, Upload,
  Filter, X, ArrowUpDown,
  Building2, Users, UserPlus, Target, Ticket, Package, Factory,
  DollarSign, Map, Globe, Megaphone, Award, ShoppingCart, FileText,
  Briefcase, Truck, Tag, Calendar, Mail, Phone, Box, Boxes, Wrench,
  BookOpen, Layers, Folder, Star, Component, Hash, Grid3x3,
  type LucideIcon,
} from 'lucide-react';
import type { EntityDefinition } from '../../types/entity';
import { fetchEntities, softDeleteEntity } from '../../services/entityService';
import ConfirmDialog from '../components/ConfirmDialog';

// Per-entity icon resolution — each entity gets its own icon by logical name,
// with a deterministic fallback so unrecognized entities still differ visually.
const ENTITY_ICON_MAP: Record<string, LucideIcon> = {
  account: Building2, contact: Users, lead: UserPlus,
  opportunity: Target, ticket: Ticket, case: Ticket,
  product: Package, industry: Factory, currency: DollarSign,
  territory: Map, region: Globe, campaign: Megaphone,
  competitor: Award, order: ShoppingCart, invoice: FileText,
  quote: FileText, contract: Briefcase, vendor: Truck,
  supplier: Truck, category: Tag, activity: Calendar,
  task: Calendar, email: Mail, call: Phone, note: FileText,
  document: FileText, user: Users, team: Users, role: Lock,
  price: DollarSign, unit: Box, warehouse: Boxes, asset: Package,
  service: Wrench, knowledge: BookOpen, article: BookOpen,
  segment: Layers,
};
const FALLBACK_ICONS: LucideIcon[] = [
  Box, Layers, Tag, Folder, FileText, Briefcase, Star,
  ShoppingCart, Globe, Boxes, Component, Hash, Grid3x3, Calendar,
];

function resolveEntityIcon(entity: EntityDefinition): LucideIcon {
  const name = (entity.logical_name || entity.display_name || '').toLowerCase();
  for (const key of Object.keys(ENTITY_ICON_MAP)) {
    if (name === key || name.includes(key)) return ENTITY_ICON_MAP[key];
  }
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_ICONS[h % FALLBACK_ICONS.length] ?? Database;
}

interface EntityListPageProps {
  onNew: () => void;
  onEdit: (entity: EntityDefinition) => void;
}

type FilterChip = 'all' | 'default' | 'custom' | 'managed';
type SortDir = 'asc' | 'desc' | null;

interface SortState {
  key: string;
  dir: SortDir;
}

const CHIPS: { id: FilterChip; label: string }[] = [
  { id: 'default', label: 'Recommended' },
  { id: 'custom',  label: 'Custom' },
  { id: 'all',     label: 'All' },
];

const RECOMMENDED = new Set([
  'account', 'contact', 'lead', 'opportunity', 'ticket',
  'campaign', 'product', 'product_family', 'industry',
]);

export default function EntityListPage({ onNew, onEdit }: EntityListPageProps) {
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<FilterChip>('all');
  const [sort, setSort] = useState<SortState>({ key: 'display_name', dir: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<EntityDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ entity: EntityDefinition; x: number; y: number } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try { setEntities(await fetchEntities()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  const filtered = useMemo(() => {
    let list = entities.filter((e) => {
      if (search) {
        const q = search.toLowerCase();
        if (!e.display_name.toLowerCase().includes(q) && !e.logical_name.toLowerCase().includes(q)) return false;
      }
      if (chip === 'custom') return e.is_custom;
      if (chip === 'managed') return !e.is_custom;
      if (chip === 'default') return RECOMMENDED.has(e.logical_name);
      return true;
    });

    if (sort.dir) {
      const key = sort.key;
      list = [...list].sort((a, b) => {
        const av = String((a as Record<string, unknown>)[key] ?? '').toLowerCase();
        const bv = String((b as Record<string, unknown>)[key] ?? '').toLowerCase();
        const cmp = av.localeCompare(bv);
        return sort.dir === 'desc' ? -cmp : cmp;
      });
    }
    return list;
  }, [entities, search, chip, sort]);

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key === key) {
        if (prev.dir === 'asc') return { key, dir: 'desc' };
        if (prev.dir === 'desc') return { key: 'display_name', dir: 'asc' };
      }
      return { key, dir: 'asc' };
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e.entity_definition_id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteEntity(deleteTarget.entity_definition_id);
      setEntities((prev) => prev.filter((e) => e.entity_definition_id !== deleteTarget.entity_definition_id));
      setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget.entity_definition_id); return n; });
      setDeleteTarget(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Delete failed'); }
    finally { setDeleting(false); }
  };

  const selectedCustom = [...selected].filter((id) => entities.find((e) => e.entity_definition_id === id)?.is_custom);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* Command Bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-2 flex items-center gap-1.5 shrink-0">
        <CmdButton primary onClick={onNew} icon={<Plus size={13} />}>New table</CmdButton>
        <CmdSep />
        <CmdButton onClick={load} icon={<RefreshCw size={12} className={loading ? 'animate-spin' : ''} />}>Refresh</CmdButton>
        <CmdButton icon={<Download size={12} />}>Export</CmdButton>
        <CmdButton icon={<Upload size={12} />}>Import</CmdButton>
        <CmdSep />
        {selectedCustom.length > 0 && (
          <CmdButton danger onClick={() => {
            const ent = entities.find((e) => e.entity_definition_id === selectedCustom[0]);
            if (ent) setDeleteTarget(ent);
          }} icon={<Trash2 size={12} />}>
            Delete
          </CmdButton>
        )}
        <div className="flex-1" />
        <span className="text-[11px] text-slate-400 mr-2">{filtered.length} table{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filter Chips + Search */}
      <div className="bg-white border-b border-slate-100 px-5 py-2 flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1">
          <Filter size={12} className="text-slate-400 mr-1" />
          {CHIPS.map((c) => (
            <button
              key={c.id}
              onClick={() => setChip(c.id)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                chip === c.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search tables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 h-[32px] text-[12px] border border-[#e7eaf1] rounded-lg bg-[#f4f6fb] focus:outline-none focus:bg-white focus:border-[#d1d5db] focus:ring-2 focus:ring-blue-500/15 w-64 placeholder:text-[#9ca3af] transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mt-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-[12px] rounded-md flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw size={20} className="animate-spin text-slate-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Database size={28} className="text-slate-200 mb-3" />
            <p className="text-[13px] text-slate-500 font-medium mb-1">
              {search ? 'No tables match your search' : chip === 'custom' ? 'No custom tables yet' : 'No tables found'}
            </p>
            <p className="text-[11px] text-slate-400 mb-3">Tables define the data structure for your CRM records.</p>
            {!search && (
              <button onClick={onNew} className="text-[12px] text-blue-600 hover:text-blue-800 font-medium hover:underline">
                + Create a new table
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#f3f4f6] border-b border-[#e5e7eb]">
                <th className="w-9 px-3 py-0">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <SortableHeader label="Display name" sortKey="display_name" sort={sort} onSort={handleSort} />
                <SortableHeader label="Schema name" sortKey="logical_name" sort={sort} onSort={handleSort} />
                <SortableHeader label="Type" sortKey="is_custom" sort={sort} onSort={handleSort} />
                <SortableHeader label="Ownership" sortKey="ownership_type" sort={sort} onSort={handleSort} />
                <SortableHeader label="Managed" sortKey="is_custom" sort={sort} onSort={handleSort} />
                <SortableHeader label="Status" sortKey="is_active" sort={sort} onSort={handleSort} />
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entity) => {
                const isSelected = selected.has(entity.entity_definition_id);
                const EntityIcon = resolveEntityIcon(entity);
                return (
                  <tr
                    key={entity.entity_definition_id}
                    className={`border-b border-slate-100 transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50/80'
                    }`}
                    onClick={() => onEdit(entity)}
                  >
                    <td className="px-3 py-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(entity.entity_definition_id)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                          entity.is_custom ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-slate-50 ring-1 ring-slate-200'
                        }`}>
                          <EntityIcon size={13} className={entity.is_custom ? 'text-amber-500' : 'text-slate-400'} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate leading-tight">{entity.display_name}</p>
                          <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">{entity.display_name_plural}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <code className="text-[11px] text-slate-500 font-mono">{entity.logical_name}</code>
                    </td>
                    <td className="px-3 py-2.5">
                      {entity.is_custom ? (
                        <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
                          Custom
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
                          <Lock size={8} /> Standard
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 capitalize">
                      {entity.ownership_type}
                    </td>
                    <td className="px-3 py-2.5">
                      {!entity.is_custom ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                          <Lock size={9} className="text-slate-400" /> Managed
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Unmanaged</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusDot active={entity.is_active} />
                    </td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenu({ entity, x: e.clientX, y: e.clientY });
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 py-1 min-w-[180px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <CtxItem onClick={() => { onEdit(contextMenu.entity); setContextMenu(null); }}>
            Open table details
          </CtxItem>
          {contextMenu.entity.is_custom && (
            <CtxItem danger onClick={() => { setDeleteTarget(contextMenu.entity); setContextMenu(null); }}>
              Delete table
            </CtxItem>
          )}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Custom Table"
          message={`Delete "${deleteTarget.display_name}"? All associated columns, forms, and views will also be removed. This cannot be undone.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete'}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}
    </div>
  );
}

function SortableHeader({ label, sortKey, sort, onSort }: { label: string; sortKey: string; sort: SortState; onSort: (key: string) => void }) {
  const active = sort.key === sortKey;
  return (
    <th
      className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 transition-colors group"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {active && sort.dir ? (
          sort.dir === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
        ) : (
          <ArrowUpDown size={10} className="text-slate-300 group-hover:text-slate-400" />
        )}
      </div>
    </th>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <span className={`text-[11px] ${active ? 'text-emerald-700' : 'text-slate-400'}`}>
        {active ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
}

function CmdButton({ children, onClick, icon, primary, danger }: {
  children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; primary?: boolean; danger?: boolean;
}) {
  const base = 'flex items-center gap-1.5 h-[32px] px-3 text-[12px] font-medium rounded-md transition-all';
  const style = primary
    ? `${base} bg-[#2563eb] hover:bg-[#1d4ed8] text-white`
    : danger
      ? `${base} text-red-600 bg-white border border-red-200 hover:bg-red-50`
      : `${base} text-[#5b6472] bg-white border border-[#e2e6ee] hover:bg-[#f4f6fb] hover:text-[#161a22]`;
  return <button className={style} onClick={onClick}>{icon}{children}</button>;
}

function CmdSep() {
  return <div className="w-px h-5 bg-slate-200 mx-1" />;
}

function CtxItem({ children, onClick, danger }: { children: React.ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 text-[12px] transition-colors ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}
