import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Zap, ToggleLeft, ToggleRight, AlertTriangle, Clock, CalendarClock,
  Mail, PencilLine, FileSpreadsheet, ListChecks, ArrowRight, MoreVertical,
  Sparkles, Loader2, CheckCircle2, ChevronDown, ChevronRight, FolderOpen, Tags, Trash2, Check,
} from 'lucide-react';
import type { AutomationRule, AutomationActionType, AutomationCategory } from '../../types/automationRule';
import type { EntityDefinition } from '../../types/entity';
import type { EditorTab } from './RuleEditorPage';
import { fetchEntities } from '../../services/entityService';
import {
  fetchAllRules, fetchActions, setRuleEnabled, deleteRule, cloneRule, createRule, getCurrentUserId, fetchLatestError,
  applyAiFlow, type AiFlowSpec,
} from '../../services/automationRuleService';
import { fetchFieldsForEntity } from '../../services/fieldService';
import type { FieldDefinition } from '../../types/field';
import { parseFlowPrompt, isFlowParseError } from './aiFlowParser';
import {
  fetchCategories, createCategory, updateCategory, deleteCategory, setRuleCategory,
} from '../../services/automationCategoryService';
import { triggerSummary, scheduleSummary, actionLabel, timeAgo, RUN_AFTER_META } from './ruleSummary';
import ConfirmDialog from '../components/ConfirmDialog';
import Combobox from '../components/Combobox';

type StatusFilter = 'any' | 'on' | 'off' | 'errors';

// Small kebab (⋮) menu — replaces the bare trash icon on each card.
function KebabMenu({
  categories, currentCategoryId, onMove, onViewRuns, onDuplicate, onDelete,
}: {
  categories: AutomationCategory[];
  currentCategoryId: string | null;
  onMove: (categoryId: string | null) => void;
  onViewRuns: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setMoveOpen(false); } };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const close = () => { setOpen(false); setMoveOpen(false); };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} title="More" className="p-1 text-slate-400 hover:text-slate-700"><MoreVertical size={16} /></button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button onClick={() => { close(); onViewRuns(); }} className="block w-full px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50">View runs</button>
          <button onClick={() => { close(); onDuplicate(); }} className="block w-full px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50">Duplicate</button>
          {/* Move to category — inline expandable list. */}
          <button onClick={() => setMoveOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50">
            Move to category <ChevronRight size={13} className={`text-slate-400 transition ${moveOpen ? 'rotate-90' : ''}`} />
          </button>
          {moveOpen && (
            <div className="max-h-52 overflow-y-auto border-y border-slate-100 bg-slate-50/60 py-1">
              <button onClick={() => { close(); onMove(null); }} className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-[12.5px] text-slate-600 hover:bg-white">
                {currentCategoryId == null && <Check size={12} className="text-blue-600" />}
                <span className={currentCategoryId == null ? '' : 'ml-[18px]'}>Uncategorized</span>
              </button>
              {categories.map((c) => (
                <button key={c.automation_category_id} onClick={() => { close(); onMove(c.automation_category_id); }} className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-white">
                  {currentCategoryId === c.automation_category_id && <Check size={12} className="text-blue-600" />}
                  <span className={`flex items-center gap-1.5 ${currentCategoryId === c.automation_category_id ? '' : 'ml-[18px]'}`}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                </button>
              ))}
              {categories.length === 0 && <p className="px-4 py-1 text-[11.5px] text-slate-400">No categories yet.</p>}
            </div>
          )}
          <button onClick={() => { close(); onDelete(); }} className="block w-full px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50">Delete</button>
        </div>
      )}
    </div>
  );
}

interface Props {
  onOpen: (rule: AutomationRule, tab?: EditorTab) => void;
}

// Icon + accent per action type, reused for the flow chips.
const ACTION_ICON: Record<AutomationActionType, { icon: typeof Mail; cls: string }> = {
  send_email: { icon: Mail, cls: 'text-blue-600' },
  update_field: { icon: PencilLine, cls: 'text-violet-600' },
  generate_document: { icon: FileSpreadsheet, cls: 'text-emerald-600' },
  list_rows: { icon: ListChecks, cls: 'text-sky-600' },
  export_view_email: { icon: FileSpreadsheet, cls: 'text-emerald-600' },
  related_export_email: { icon: FileSpreadsheet, cls: 'text-teal-600' },
  create_related_record: { icon: Plus, cls: 'text-indigo-600' },
  update_related_record: { icon: PencilLine, cls: 'text-indigo-600' },
};

function ActionChips({ types }: { types: AutomationActionType[] }) {
  if (types.length === 0) {
    return <span className="text-[12px] text-slate-400">No actions yet</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {types.map((t, i) => {
        const meta = ACTION_ICON[t];
        const Icon = meta?.icon ?? Mail;
        return (
          <span key={i} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
            <Icon size={11} className={meta?.cls ?? 'text-slate-500'} />
            {actionLabel(t)}
          </span>
        );
      })}
    </div>
  );
}

const btnPrimary = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded';
const input = 'w-full px-2.5 py-1.5 text-[13px] border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

// Accent palette for new categories — cycled by index so fresh categories get
// distinct colors without a color picker.
const CATEGORY_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#0d9488', '#4f46e5'];

export default function RuleListPage({ onOpen }: Props) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [categories, setCategories] = useState<AutomationCategory[]>([]);
  const [actionTypesByRule, setActionTypesByRule] = useState<Record<string, AutomationActionType[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('any');
  const [categoryFilter, setCategoryFilter] = useState('');   // '' = all, 'none' = uncategorized, else category id
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());   // collapsed section keys
  const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showManageCats, setShowManageCats] = useState(false);
  const [errByRule, setErrByRule] = useState<Record<string, string | null>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [rs, es, cats] = await Promise.all([fetchAllRules(), fetchEntities(), fetchCategories()]);
      setRules(rs);
      setEntities(es);
      setCategories(cats);
      // One query per rule is fine at admin scale; group action types for the cards.
      const pairs = await Promise.all(
        rs.map(async (r) => [r.automation_rule_id, (await fetchActions(r.automation_rule_id)).map((a) => a.action_type)] as const),
      );
      setActionTypesByRule(Object.fromEntries(pairs));
      // Latest failure message for rules that have errors (for the inline banner).
      const errPairs = await Promise.all(
        rs.filter((r) => r.error_count > 0)
          .map(async (r) => [r.automation_rule_id, await fetchLatestError(r.automation_rule_id).catch(() => null)] as const),
      );
      setErrByRule(Object.fromEntries(errPairs));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const entityLabel = useMemo(() => {
    const m = new Map(entities.map((e) => [e.logical_name, e.display_name]));
    return (logical: string) => m.get(logical) ?? logical;
  }, [entities]);

  // Set of live category ids — a rule whose category was deleted (or never in the
  // list) is treated as Uncategorized.
  const catIds = useMemo(() => new Set(categories.map((c) => c.automation_category_id)), [categories]);
  const ruleCatKey = (r: AutomationRule) => (r.category_id && catIds.has(r.category_id) ? r.category_id : 'none');

  const filtered = rules.filter((r) => {
    if (tableFilter && r.table_logical_name !== tableFilter) return false;
    if (categoryFilter && ruleCatKey(r) !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.name} ${entityLabel(r.table_logical_name)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (statusFilter === 'on' && !r.enabled) return false;
    if (statusFilter === 'off' && r.enabled) return false;
    if (statusFilter === 'errors' && r.error_count === 0) return false;
    return true;
  });

  const activeCount = rules.filter((r) => r.enabled).length;
  const errorCount = rules.filter((r) => r.error_count > 0).length;
  const filtersActive = !!(search || tableFilter || statusFilter !== 'any' || categoryFilter);

  // Group the filtered flows into collapsible sections: one per category (in
  // sort order) then Uncategorized last. Named categories with no matching flows
  // are shown only when no filter is active (so an empty new category is visible).
  const sections = useMemo(() => {
    const byKey = new Map<string, AutomationRule[]>();
    for (const r of filtered) {
      const k = ruleCatKey(r);
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(r);
    }
    const out: { key: string; label: string; color: string | null; rules: AutomationRule[] }[] = [];
    for (const c of categories) {
      const rs = byKey.get(c.automation_category_id) ?? [];
      if (rs.length === 0 && filtersActive) continue;
      out.push({ key: c.automation_category_id, label: c.name, color: c.color, rules: rs });
    }
    const none = byKey.get('none') ?? [];
    if (none.length > 0) out.push({ key: 'none', label: 'Uncategorized', color: null, rules: none });
    return out;
  }, [filtered, categories, filtersActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const moveRule = async (r: AutomationRule, categoryId: string | null) => {
    setRules((prev) => prev.map((x) => (x.automation_rule_id === r.automation_rule_id ? { ...x, category_id: categoryId } : x)));
    try {
      await setRuleCategory(r.automation_rule_id, categoryId);
    } catch (e) {
      console.error('setRuleCategory failed:', e);
      void load();
    }
  };

  const renderCard = (r: AutomationRule) => {
    const types = actionTypesByRule[r.automation_rule_id] ?? [];
    const hasError = r.error_count > 0;
    return (
      <div
        key={r.automation_rule_id}
        className={`group relative bg-white border rounded-xl transition-all hover:shadow-sm ${hasError ? 'border-red-200' : 'border-slate-200 hover:border-slate-300'}`}
      >
        {/* colored status rail */}
        <span className={`absolute inset-y-0 left-0 w-1 rounded-l-xl ${!r.enabled ? 'bg-slate-200' : hasError ? 'bg-red-400' : 'bg-emerald-400'}`} />
        <div className="flex items-start gap-3.5 p-4 pl-5">
          {/* icon tile */}
          <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${hasError ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'}`}>
            {r.trigger_type === 'schedule' ? <CalendarClock size={17} /> : <Zap size={17} />}
          </div>

          <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(r, 'actions')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-slate-800 group-hover:text-blue-700">{r.name}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{entityLabel(r.table_logical_name)}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${r.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${r.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {r.enabled ? 'On' : 'Off'}
              </span>
            </div>
            <p className="mt-1.5 text-[12.5px] text-slate-500">{r.trigger_type === 'schedule' ? scheduleSummary(r.schedule_config) : triggerSummary(r)}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <ActionChips types={types} />
              {r.last_run_at && (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-400">
                  <Clock size={11} /> ran {timeAgo(r.last_run_at)}
                </span>
              )}
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => toggle(r)} title={r.enabled ? 'Disable' : 'Enable'} className={r.enabled ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'}>
              {r.enabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
            </button>
            <KebabMenu
              categories={categories}
              currentCategoryId={r.category_id && catIds.has(r.category_id) ? r.category_id : null}
              onMove={(cid) => void moveRule(r, cid)}
              onViewRuns={() => onOpen(r, 'history')}
              onDuplicate={() => void doClone(r)}
              onDelete={() => setDeleteTarget(r)}
            />
          </div>
        </div>

        {/* inline error banner with the actual failure message */}
        {hasError && (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-500" />
            <p className="flex-1 text-[12px] text-red-700">
              Last run failed{errByRule[r.automation_rule_id] ? ` — ${errByRule[r.automation_rule_id]}` : ` (${r.error_count} error${r.error_count > 1 ? 's' : ''})`}
            </p>
            <button onClick={() => onOpen(r, 'history')} className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-red-600 hover:underline">
              View run <ArrowRight size={12} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const toggle = async (r: AutomationRule) => {
    await setRuleEnabled(r.automation_rule_id, !r.enabled);
    setRules((prev) => prev.map((x) => (x.automation_rule_id === r.automation_rule_id ? { ...x, enabled: !r.enabled } : x)));
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    await deleteRule(deleteTarget.automation_rule_id);
    setDeleteTarget(null);
    void load();
  };

  const [cloningId, setCloningId] = useState<string | null>(null);
  const doClone = async (r: AutomationRule) => {
    if (cloningId) return;
    setCloningId(r.automation_rule_id);
    try {
      const uid = await getCurrentUserId().catch(() => null);
      await cloneRule(r.automation_rule_id, uid);
      await load();
    } catch (e) {
      console.error('cloneRule failed:', e);
      alert('Could not duplicate this rule.');
    } finally {
      setCloningId(null);
    }
  };

  const tablesInUse = useMemo(
    () => [...new Set(rules.map((r) => r.table_logical_name))],
    [rules],
  );

  return (
    <div className="flex h-full flex-col bg-slate-50/40">
      {/* header + toolbar — full-width sticky top bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-800">Automation rules</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-400">
              {rules.length} rule{rules.length === 1 ? '' : 's'} · {activeCount} active
              {errorCount > 0 && <span className="text-red-500"> · {errorCount} need{errorCount === 1 ? 's' : ''} attention</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowManageCats(true)}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:border-slate-400"
            >
              <Tags size={15} /> Categories
            </button>
            <button
              onClick={() => setShowAi(true)}
              className="inline-flex items-center gap-1.5 rounded border border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50 px-3 py-1.5 text-[13px] font-medium text-violet-700 hover:border-violet-300"
            >
              <Sparkles size={15} /> Build with AI
            </button>
            <button className={btnPrimary} onClick={() => setShowCreate(true)}><Plus size={15} /> New rule</button>
          </div>
        </div>

        {/* toolbar — responsive grid spanning the full width */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem_11rem]">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rules…" className={`${input} pl-8`} />
          </div>
          <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className={input}>
            <option value="">All tables</option>
            {tablesInUse.map((t) => <option key={t} value={t}>{entityLabel(t)}</option>)}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={input}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.automation_category_id} value={c.automation_category_id}>{c.name}</option>)}
            <option value="none">Uncategorized</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={input}>
            <option value="any">Any status</option>
            <option value="on">On</option>
            <option value="off">Off</option>
            <option value="errors">Has errors</option>
          </select>
        </div>
      </div>

      {/* scroll region — flows grouped into collapsible category sections */}
      <div className="flex-1 overflow-auto px-6 py-6 lg:px-8">
        {loading ? (
          <p className="text-[13px] text-slate-500">Loading…</p>
        ) : rules.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Zap size={30} className="mx-auto mb-3 text-slate-300" />
            <p className="text-[13px]">No automation rules yet.</p>
            <button className={`${btnPrimary} mt-4`} onClick={() => setShowCreate(true)}><Plus size={15} /> Create your first rule</button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-slate-500">No rules match your filters.</p>
        ) : (
          <div className="space-y-5">
            {sections.map((sec) => {
              const isCollapsed = collapsed.has(sec.key);
              return (
                <section key={sec.key}>
                  <button onClick={() => toggleCollapse(sec.key)} className="mb-3 flex w-full items-center gap-2 text-left">
                    {isCollapsed ? <ChevronRight size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                      {sec.color
                        ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sec.color }} />
                        : <FolderOpen size={14} className="text-slate-400" />}
                      {sec.label}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{sec.rules.length}</span>
                    <span className="ml-2 h-px flex-1 bg-slate-200" />
                  </button>
                  {!isCollapsed && (
                    sec.rules.length === 0 ? (
                      <p className="pb-2 pl-6 text-[12px] text-slate-400">No flows in this category yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                        {sec.rules.map((r) => renderCard(r))}
                      </div>
                    )
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateRuleModal
          entities={entities}
          categories={categories}
          onCategoriesChanged={setCategories}
          onClose={() => setShowCreate(false)}
          onCreated={(rule) => { setShowCreate(false); onOpen(rule); }}
        />
      )}

      {showAi && (
        <AiBuildModal
          entities={entities}
          onClose={() => setShowAi(false)}
          onCreated={(rule) => { setShowAi(false); onOpen(rule); }}
        />
      )}

      {showManageCats && (
        <ManageCategoriesModal
          categories={categories}
          rules={rules}
          catIds={catIds}
          onChanged={setCategories}
          onClose={() => setShowManageCats(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete automation rule"
          message={`Permanently delete "${deleteTarget.name}" and its actions? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={doDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function CreateRuleModal({
  entities, categories, onCategoriesChanged, onClose, onCreated,
}: {
  entities: EntityDefinition[];
  categories: AutomationCategory[];
  onCategoriesChanged: (cats: AutomationCategory[]) => void;
  onClose: () => void;
  onCreated: (r: AutomationRule) => void;
}) {
  const [name, setName] = useState('');
  const [table, setTable] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [flowType, setFlowType] = useState<AutomationRule['trigger_type']>('event');
  const [trigger, setTrigger] = useState<AutomationRule['trigger_event']>('update');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addCategory = async () => {
    const nm = newCatName.trim();
    if (!nm) return;
    try {
      const created_by = await getCurrentUserId().catch(() => null);
      const cat = await createCategory({ name: nm, color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length], sort_order: categories.length, created_by });
      onCategoriesChanged([...categories, cat]);
      setCategoryId(cat.automation_category_id);
      setNewCatName('');
      setAddingCat(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create category');
    }
  };

  const create = async () => {
    if (!name.trim() || !table) { setErr('Name and table are required.'); return; }
    setSaving(true);
    setErr(null);
    try {
      const created_by = await getCurrentUserId();
      const category_id = categoryId || null;
      const rule = flowType === 'schedule'
        ? await createRule({
            name: name.trim(), table_logical_name: table, trigger_type: 'schedule',
            schedule_config: { frequency: 'daily', hour: 8, minute: 0 }, category_id, created_by,
          })
        : await createRule({ name: name.trim(), table_logical_name: table, trigger_event: trigger, category_id, created_by });
      onCreated(rule);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create rule');
      setSaving(false);
    }
  };

  // Sorted entity list for the picker.
  const opts = [...entities].sort((a, b) => a.display_name.localeCompare(b.display_name));

  const flowCard = (v: AutomationRule['trigger_type'], title: string, desc: string) => (
    <button
      type="button"
      onClick={() => setFlowType(v)}
      className={`flex-1 rounded-lg border p-2.5 text-left transition ${flowType === v ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500/30' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <p className={`text-[12.5px] font-semibold ${flowType === v ? 'text-blue-700' : 'text-slate-700'}`}>{title}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{desc}</p>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[440px] p-5">
        <h3 className="text-[15px] font-semibold text-slate-800 mb-4">New automation rule</h3>

        <label className="block text-[12px] font-medium text-slate-600 mb-1">Flow type</label>
        <div className="flex gap-2 mb-1">
          {flowCard('event', 'Automated', 'Runs when a record is created or changes.')}
          {flowCard('schedule', 'Scheduled', 'Runs on a recurring schedule (e.g. every day).')}
        </div>

        <label className="block text-[12px] font-medium text-slate-600 mb-1 mt-3">Rule name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="e.g. Daily open-leads report" />
        <label className="block text-[12px] font-medium text-slate-600 mb-1 mt-3">
          {flowType === 'schedule' ? 'Table (whose view you will export)' : 'Table'}
        </label>
        <Combobox
          options={opts.map((e) => ({ value: e.logical_name, label: e.display_name }))}
          value={table}
          onChange={setTable}
          placeholder="Select a table…"
          searchPlaceholder="Search tables…"
        />
        {flowType === 'event' && (
          <>
            <label className="block text-[12px] font-medium text-slate-600 mb-1 mt-3">Trigger type</label>
            <select value={trigger} onChange={(e) => setTrigger(e.target.value as AutomationRule['trigger_event'])} className={input}>
              <option value="create">Row created</option>
              <option value="update">Row updated / field changes</option>
              <option value="both">Row created or updated</option>
            </select>
          </>
        )}
        {flowType === 'schedule' && (
          <p className="mt-2 text-[11.5px] text-slate-500">You'll pick the schedule (daily/weekly/…), the view to export, and the recipients in the next step.</p>
        )}

        <label className="block text-[12px] font-medium text-slate-600 mb-1 mt-3">Category <span className="font-normal text-slate-400">(optional)</span></label>
        {addingCat ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addCategory(); } }}
              className={input} placeholder="New category name…"
            />
            <button type="button" onClick={() => void addCategory()} disabled={!newCatName.trim()} className={`${btnPrimary} shrink-0 disabled:opacity-50`}>Add</button>
            <button type="button" onClick={() => { setAddingCat(false); setNewCatName(''); }} className="shrink-0 px-2 py-1.5 text-[13px] text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={input}>
              <option value="">Uncategorized</option>
              {categories.map((c) => <option key={c.automation_category_id} value={c.automation_category_id}>{c.name}</option>)}
            </select>
            <button type="button" onClick={() => setAddingCat(true)} className="inline-flex shrink-0 items-center gap-1 rounded border border-dashed border-slate-300 px-2.5 py-1.5 text-[12px] text-slate-600 hover:border-slate-400">
              <Plus size={13} /> New
            </button>
          </div>
        )}

        {err && <p className="text-[12px] text-red-600 mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
          <button onClick={create} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>{saving ? 'Creating…' : 'Continue'}</button>
        </div>
      </div>
    </div>
  );
}

// Create / rename / recolor / delete flow categories. Deleting a category never
// deletes its flows — the FK sets their category_id null so they fall back into
// "Uncategorized". Shows a live per-category flow count.
function ManageCategoriesModal({
  categories, rules, catIds, onChanged, onClose,
}: {
  categories: AutomationCategory[];
  rules: AutomationRule[];
  catIds: Set<string>;
  onChanged: (cats: AutomationCategory[]) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<AutomationCategory[]>(categories);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AutomationCategory | null>(null);

  const countFor = (id: string) => rules.filter((r) => r.category_id === id && catIds.has(id)).length;

  const add = async () => {
    const nm = newName.trim();
    if (!nm || busy) return;
    setBusy(true);
    try {
      const created_by = await getCurrentUserId().catch(() => null);
      const cat = await createCategory({ name: nm, color: CATEGORY_COLORS[items.length % CATEGORY_COLORS.length], sort_order: items.length, created_by });
      const next = [...items, cat];
      setItems(next); onChanged(next); setNewName('');
    } finally { setBusy(false); }
  };

  const rename = async (c: AutomationCategory, name: string) => {
    const next = items.map((x) => (x.automation_category_id === c.automation_category_id ? { ...x, name } : x));
    setItems(next); onChanged(next);
    await updateCategory(c.automation_category_id, { name }).catch(() => {});
  };

  const recolor = async (c: AutomationCategory, color: string) => {
    const next = items.map((x) => (x.automation_category_id === c.automation_category_id ? { ...x, color } : x));
    setItems(next); onChanged(next);
    await updateCategory(c.automation_category_id, { color }).catch(() => {});
  };

  const doDelete = async (c: AutomationCategory) => {
    const next = items.filter((x) => x.automation_category_id !== c.automation_category_id);
    setItems(next); onChanged(next); setConfirmDel(null);
    await deleteCategory(c.automation_category_id).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-[520px] flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600"><Tags size={16} /></span>
          <div>
            <h3 className="text-[15px] font-semibold text-slate-800">Flow categories</h3>
            <p className="text-[11.5px] text-slate-400">Group your flows into sections. Deleting a category keeps its flows.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* add row */}
          <div className="mb-4 flex items-center gap-2">
            <input
              value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
              className={input} placeholder="New category name…"
            />
            <button onClick={() => void add()} disabled={!newName.trim() || busy} className={`${btnPrimary} shrink-0 disabled:opacity-50`}><Plus size={15} /> Add</button>
          </div>

          {items.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-slate-400">No categories yet. Add one above.</p>
          ) : (
            <div className="space-y-2">
              {items.map((c) => (
                <div key={c.automation_category_id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                  {/* color swatch (native color input) */}
                  <label className="relative shrink-0" title="Change color">
                    <span className="block h-6 w-6 cursor-pointer rounded-full ring-1 ring-slate-300" style={{ backgroundColor: c.color }} />
                    <input type="color" value={c.color} onChange={(e) => void recolor(c, e.target.value)} className="absolute inset-0 h-6 w-6 cursor-pointer opacity-0" />
                  </label>
                  <input
                    defaultValue={c.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) void rename(c, v); }}
                    className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-medium text-slate-700 hover:border-slate-200 focus:border-blue-400 focus:bg-white outline-none"
                  />
                  <span className="shrink-0 rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium text-slate-500">{countFor(c.automation_category_id)} flow{countFor(c.automation_category_id) === 1 ? '' : 's'}</span>
                  <button onClick={() => setConfirmDel(c)} title="Delete category" className="shrink-0 p-1 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className={btnPrimary}>Done</button>
        </div>
      </div>

      {confirmDel && (
        <ConfirmDialog
          title="Delete category"
          message={`Delete "${confirmDel.name}"? Its ${countFor(confirmDel.automation_category_id)} flow(s) won't be deleted — they'll move to Uncategorized.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => void doDelete(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

// Build a whole rule from a plain-language prompt: pick a table, let AI draft the
// trigger + steps, then create the rule and apply the flow in one go. This is the
// list-level entry point (the editor's Actions tab no longer hosts its own copy).
function AiBuildModal({
  entities, onClose, onCreated,
}: { entities: EntityDefinition[]; onClose: () => void; onCreated: (r: AutomationRule) => void }) {
  const [table, setTable] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [spec, setSpec] = useState<AiFlowSpec | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);

  const opts = [...entities].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const selectedEntity = entities.find((e) => e.logical_name === table);

  // Load the selected table's fields so the parser can resolve field + choice names.
  useEffect(() => {
    if (!selectedEntity) { setFields([]); return; }
    fetchFieldsForEntity(selectedEntity.entity_definition_id).then(setFields).catch(() => setFields([]));
  }, [selectedEntity]);

  // Parse locally — no external service. The tiny timeout just lets the spinner show.
  const generate = () => {
    if (!prompt.trim() || !table) return;
    setLoading(true); setError(null); setSuggestions([]); setSpec(null); setWarnings([]);
    setTimeout(() => {
      const result = parseFlowPrompt(prompt.trim(), table, selectedEntity?.display_name ?? table, fields);
      setLoading(false);
      if (isFlowParseError(result)) {
        setError(result.message);
        setSuggestions(result.suggestions);
        return;
      }
      setSpec(result.spec);
      setWarnings(result.warnings ?? []);
    }, 300);
  };

  const apply = async () => {
    if (!spec || !table) return;
    setApplying(true); setError(null);
    try {
      const created_by = await getCurrentUserId();
      const rule = await createRule({ name: spec.name || 'AI rule', table_logical_name: table, created_by });
      await applyAiFlow(rule, spec);
      onCreated(rule);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply');
      setApplying(false);
    }
  };

  const examples = [
    'When Status changes to Won, email sales@montyholding.com; if that fails, alert admin@montyholding.com.',
    'When a record is created, generate an Excel export and email it to the owner.',
    'When Priority changes to High, notify the owner and set Escalated to Yes.',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-[560px] flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100 text-violet-600"><Sparkles size={16} /></span>
          <div>
            <h3 className="text-[15px] font-semibold text-slate-800">Build a rule with AI</h3>
            <p className="text-[11.5px] text-slate-400">Pick a table and describe what should happen — it drafts the trigger + steps. Runs entirely in-system.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label className="block text-[12px] font-medium text-slate-600 mb-1">Table</label>
          <Combobox
            options={opts.map((e) => ({ value: e.logical_name, label: e.display_name }))}
            value={table}
            onChange={(v) => { setTable(v); setSpec(null); }}
            placeholder="Choose the table this flow runs on…"
            searchPlaceholder="Search tables…"
          />

          <label className="block text-[12px] font-medium text-slate-600 mb-1 mt-3">Describe the flow</label>
          <textarea
            rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            className={input} placeholder="e.g. When a note is created on this opportunity, email the team the note with a link to open the opportunity…"
          />
          {!spec && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] font-medium text-slate-400">Try:</p>
              {examples.map((ex) => (
                <button key={ex} onClick={() => setPrompt(ex)} className="block w-full rounded border border-slate-200 bg-slate-50/60 px-2 py-1 text-left text-[11.5px] text-slate-500 hover:border-slate-300">{ex}</button>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
              <p>{error}</p>
              {suggestions.length > 0 && (
                <ul className="mt-1.5 space-y-1 pl-4 text-[11px] text-red-500/80">
                  {suggestions.map((s) => <li key={s} className="list-disc">{s}</li>)}
                </ul>
              )}
            </div>
          )}

          {spec && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-[12.5px] font-medium text-slate-700">{spec.summary || spec.name}</p>
              <div className="mt-2 flex items-center gap-2 text-[12px] text-slate-600">
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-700">Trigger</span>
                {triggerSummary(spec.trigger)}
              </div>
              <div className="mt-2 space-y-1">
                {spec.actions.map((a, i) => {
                  const meta = RUN_AFTER_META[a.run_after] ?? RUN_AFTER_META.success;
                  return (
                    <div key={i} className="flex items-center gap-2 text-[12px] text-slate-600">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-700 text-[10px] font-bold text-white">{i + 1}</span>
                      {actionLabel(a.action_type)}
                      {i > 0 && <span className={`rounded-full border px-1.5 py-0 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>}
                    </div>
                  );
                })}
              </div>
              {warnings.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-[11px] text-amber-600">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              )}
              <p className="mt-2 text-[11px] text-slate-400">Creates a new rule with this trigger and these steps. Review each step afterwards.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-100">Cancel</button>
          {!spec ? (
            <button onClick={generate} disabled={loading || !table || !prompt.trim()} className={`${btnPrimary} disabled:opacity-50`}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Generate
            </button>
          ) : (
            <>
              <button onClick={generate} disabled={loading} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-50">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Regenerate
              </button>
              <button onClick={apply} disabled={applying} className={`${btnPrimary} disabled:opacity-50`}>
                {applying ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Create rule
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
