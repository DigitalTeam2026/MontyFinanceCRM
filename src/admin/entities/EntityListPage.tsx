import { useEffect, useState, useMemo } from 'react';
import {
  Plus, Search, Database, Trash2, RefreshCw, Lock,
  ChevronUp, ChevronDown, MoreHorizontal, Download, Upload,
  Filter, X, ArrowUpDown, Sparkles, Loader2, CheckCircle2, AlertCircle, Circle,
  Building2, Users, UserPlus, Target, Ticket, Package, Factory,
  DollarSign, Map, Globe, Megaphone, Award, ShoppingCart, FileText,
  Briefcase, Truck, Tag, Calendar, Mail, Phone, Box, Boxes, Wrench,
  BookOpen, Layers, Folder, Star, Component, Hash, Grid3x3,
  type LucideIcon,
} from 'lucide-react';
import type { EntityDefinition } from '../../types/entity';
import { fetchEntities, dropEntity } from '../../services/entityService';
import { applyAiTable, type AiTableSpec, type ApplyStep } from '../../services/aiTableService';
import { parseTablePrompt, isTableParseError } from './aiTableParser';
import ConfirmDialog from '../components/ConfirmDialog';
import AnchoredPopover from '../../app/components/overlay/AnchoredPopover';

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
  const [contextMenu, setContextMenu] = useState<{ entity: EntityDefinition; anchor: HTMLElement } | null>(null);
  const [showAi, setShowAi] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try { setEntities(await fetchEntities()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

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
        const av = String((a as unknown as Record<string, unknown>)[key] ?? '').toLowerCase();
        const bv = String((b as unknown as Record<string, unknown>)[key] ?? '').toLowerCase();
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
      await dropEntity(deleteTarget.entity_definition_id);
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
        <CmdButton onClick={() => setShowAi(true)} icon={<Sparkles size={13} className="text-violet-500" />}>Create with AI</CmdButton>
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
              className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
              style={chip === c.id
                ? { background: 'var(--primary)', color: 'var(--primary-text)' }
                : { background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}
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
            className="pl-8 pr-8 h-[32px] text-[12px] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/15 w-64 placeholder:text-[var(--muted)] transition"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
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
                        <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--warn-bg)', color: 'var(--warn-text)' }}>
                          Custom
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
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
                          const anchor = e.currentTarget;
                          setContextMenu((prev) =>
                            prev?.entity.entity_definition_id === entity.entity_definition_id
                              ? null
                              : { entity, anchor }
                          );
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

      {/* Context Menu — anchored to the clicked three-dot button, right-aligned
          (bottom-end) so it expands leftward and stays within the viewport. */}
      <AnchoredPopover
        anchorEl={contextMenu?.anchor ?? null}
        open={!!contextMenu}
        onClose={() => setContextMenu(null)}
        placement="bottom-end"
        minWidth={180}
        role="menu"
        className="bg-white rounded-lg shadow-xl border border-slate-200 py-1"
      >
        {contextMenu && (
          <>
            <CtxItem onClick={() => { onEdit(contextMenu.entity); setContextMenu(null); }}>
              Open table details
            </CtxItem>
            {contextMenu.entity.is_custom && (
              <CtxItem danger onClick={() => { setDeleteTarget(contextMenu.entity); setContextMenu(null); }}>
                Delete table
              </CtxItem>
            )}
          </>
        )}
      </AnchoredPopover>

      {showAi && (
        <AiTableModal
          existingNames={entities.map((e) => e.logical_name)}
          onClose={() => setShowAi(false)}
          onCreated={(entity) => { setShowAi(false); load(); onEdit(entity); }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Permanently Delete Custom Table"
          message={`Permanently delete "${deleteTarget.display_name}"? This DROPs the database table and ALL its data, columns, forms, and views. This is irreversible — it cannot be restored from the recycle bin.`}
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
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'var(--success)' : 'var(--muted)' }} />
      <span className="text-[11px]" style={{ color: active ? 'var(--success)' : 'var(--muted)' }}>
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
    ? `${base} bg-[var(--primary)] text-[var(--primary-text)] hover:opacity-90`
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

// ── AI table builder ───────────────────────────────────────────────────────────
// Describe a table in plain language; AI drafts its columns; we preview then
// provision the entity + columns + default form in one go.

const TYPE_LABEL: Record<string, string> = {
  text: 'Text', long_text: 'Multi-line', whole_number: 'Whole number',
  decimal: 'Decimal', currency: 'Currency', date: 'Date', datetime: 'Date & time',
  boolean: 'Yes / No', email: 'Email', phone: 'Phone', url: 'URL', choice: 'Choice',
};

const APPLY_STEP_LABEL: Record<ApplyStep, string> = {
  entity: 'Creating table',
  bootstrap: 'Provisioning system fields, views & forms',
  fields: 'Creating columns',
  form: 'Adding columns to the default form',
};
const APPLY_ORDER: ApplyStep[] = ['entity', 'bootstrap', 'fields', 'form'];

const AI_EXAMPLES = [
  'A loan application table with applicant name, amount, interest rate, term in months, application date, and a status choice (Draft, Submitted, Approved, Rejected).',
  'A property listing table: address, city, price, bedrooms, bathrooms, square footage, listing type (Sale, Rent), and available-from date.',
  'A vendor contract table with contract number, vendor name, start date, end date, annual value, and auto-renew yes/no.',
];

function AiTableModal({
  existingNames, onClose, onCreated,
}: { existingNames: string[]; onClose: () => void; onCreated: (entity: EntityDefinition) => void }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [spec, setSpec] = useState<AiTableSpec | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState<Record<ApplyStep, 'idle' | 'running' | 'done'>>({
    entity: 'idle', bootstrap: 'idle', fields: 'idle', form: 'idle',
  });
  const [progressDetail, setProgressDetail] = useState<string>('');

  // Parse locally — no external service, so run it inside a tiny timeout purely so
  // the spinner is visible for very short prompts (mirrors the rule creator).
  const generate = () => {
    if (!prompt.trim()) return;
    setLoading(true); setError(null); setSuggestions([]); setSpec(null); setWarnings([]);
    setTimeout(() => {
      const result = parseTablePrompt(prompt.trim(), existingNames);
      setLoading(false);
      if (isTableParseError(result)) {
        setError(result.message);
        setSuggestions(result.suggestions);
        return;
      }
      setSpec(result.spec);
      setWarnings(result.warnings ?? []);
    }, 300);
  };

  const apply = async () => {
    if (!spec) return;
    setApplying(true); setError(null);
    setProgress({ entity: 'idle', bootstrap: 'idle', fields: 'idle', form: 'idle' });
    try {
      const { entity, fieldErrors } = await applyAiTable(spec, (p) => {
        setProgress((prev) => ({ ...prev, [p.step]: p.status }));
        if (p.detail) setProgressDetail(p.detail);
      });
      if (fieldErrors.length > 0) {
        // Table + form were still created — surface partial-column failures but proceed.
        console.warn('[AI table] some columns failed:', fieldErrors);
      }
      onCreated(entity);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create table');
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={applying ? undefined : onClose} />
      <div className="relative flex max-h-[86vh] w-[580px] flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100 text-violet-600"><Sparkles size={16} /></span>
          <div>
            <h3 className="text-[15px] font-semibold text-slate-800">Create a table with AI</h3>
            <p className="text-[11.5px] text-slate-400">Describe the table and its columns — it drafts the columns and builds the default form. Runs entirely in-system.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label className="block text-[12px] font-medium text-slate-600 mb-1">Describe the table</label>
          <textarea
            rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={applying}
            className="w-full px-2.5 py-2 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none disabled:opacity-60"
            placeholder="e.g. A loan application table with applicant name, amount, status (Draft, Submitted, Approved), and application date…"
          />
          {!spec && !applying && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] font-medium text-slate-400">Try:</p>
              {AI_EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => setPrompt(ex)} className="block w-full rounded border border-slate-200 bg-slate-50/60 px-2 py-1 text-left text-[11.5px] text-slate-500 hover:border-slate-300">{ex}</button>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
              <p className="flex items-start gap-1.5"><AlertCircle size={13} className="shrink-0 mt-0.5" />{error}</p>
              {suggestions.length > 0 && (
                <ul className="mt-1.5 space-y-1 pl-5 text-[11px] text-red-500/80">
                  {suggestions.map((s) => <li key={s} className="list-disc">{s}</li>)}
                </ul>
              )}
            </div>
          )}

          {spec && !applying && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="flex items-center gap-2">
                <Database size={15} className="text-slate-500" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 truncate">{spec.display_name}</p>
                  <code className="text-[10.5px] text-slate-400">{spec.logical_name}</code>
                </div>
                <span className="ml-auto text-[10px] text-slate-400 capitalize">{spec.ownership_type}-owned</span>
              </div>
              {spec.description && <p className="mt-1.5 text-[11.5px] text-slate-500">{spec.description}</p>}

              <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <span>Columns ({spec.fields.length + 1})</span>
                </div>
                <ColumnRow name={spec.primary_field_label} logical="name" type="Primary" required system />
                {spec.fields.map((f) => (
                  <ColumnRow
                    key={f.logical_name}
                    name={f.display_name}
                    logical={f.logical_name}
                    type={TYPE_LABEL[f.type] ?? f.type}
                    required={f.required}
                    choices={f.choices}
                  />
                ))}
              </div>

              {warnings.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-[11px] text-amber-600">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              )}
              <p className="mt-2 text-[11px] text-slate-400">Creates the table, its columns, default views, and a main form with these columns. Standard columns (Owner, Status, audit) are added automatically.</p>
            </div>
          )}

          {applying && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="text-[12px] font-medium text-slate-700 mb-2.5">Creating “{spec?.display_name}”…</p>
              <ul className="space-y-2">
                {APPLY_ORDER.map((step) => {
                  const st = progress[step];
                  return (
                    <li key={step} className="flex items-center gap-2.5 text-[12px]">
                      {st === 'idle' && <Circle size={14} className="text-slate-300 shrink-0" />}
                      {st === 'running' && <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" />}
                      {st === 'done' && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                      <span className={st === 'done' ? 'text-emerald-700' : st === 'running' ? 'text-blue-700 font-medium' : 'text-slate-400'}>
                        {APPLY_STEP_LABEL[step]}
                        {step === 'fields' && progressDetail && st !== 'idle' ? ` (${progressDetail})` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} disabled={applying} className="rounded px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          {!spec ? (
            <button onClick={generate} disabled={loading || !prompt.trim()} className="inline-flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Generate
            </button>
          ) : !applying ? (
            <>
              <button onClick={generate} disabled={loading} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Regenerate
              </button>
              <button onClick={apply} className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-blue-700">
                <CheckCircle2 size={15} /> Create table
              </button>
            </>
          ) : (
            <button disabled className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-[13px] font-medium text-white opacity-60">
              <Loader2 size={15} className="animate-spin" /> Creating…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ColumnRow({
  name, logical, type, required, choices, system,
}: { name: string; logical: string; type: string; required?: boolean; choices?: string[]; system?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-50 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-slate-700 truncate">{name}</span>
          {required && <span className="text-[9px] font-semibold text-red-500 uppercase">Req</span>}
          {system && <span className="text-[9px] font-semibold text-slate-400 uppercase">Auto</span>}
        </div>
        <code className="text-[10px] text-slate-400">{logical}</code>
        {choices && choices.length > 0 && (
          <p className="text-[10px] text-slate-400 truncate">{choices.join(' · ')}</p>
        )}
      </div>
      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{type}</span>
    </div>
  );
}
