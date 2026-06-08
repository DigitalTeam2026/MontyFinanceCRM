import { useState } from 'react';
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Search, X, Filter, Zap, Copy, ChevronDown,
} from 'lucide-react';
import type { GenericRule, GenericFieldSchema } from '../../app/services/genericRulesEngine';
import { genId } from '../../app/services/genericRulesEngine';
import GenericRuleEditorPage from './GenericRuleEditorPage';
import ConfirmDialog from '../components/ConfirmDialog';

interface GenericRulesListPageProps {
  /** All available entity names (keys for rulesStore) */
  entities: string[];
  /** Field schemas per entity name */
  schemaByEntity: Record<string, GenericFieldSchema[]>;
  /** Rules store keyed by entity name */
  rulesStore: Record<string, GenericRule[]>;
  /** Called when rules change for an entity */
  onStoreChange: (entityName: string, rules: GenericRule[]) => void;
}

export default function GenericRulesListPage({
  entities,
  schemaByEntity,
  rulesStore,
  onStoreChange,
}: GenericRulesListPageProps) {
  const [selectedEntity, setSelectedEntity] = useState(entities[0] ?? '');
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [editingRule, setEditingRule] = useState<GenericRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GenericRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const entityRules = rulesStore[selectedEntity] ?? [];
  const schema = schemaByEntity[selectedEntity] ?? [];

  const filtered = entityRules.filter((r) => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || (r.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filterActive === 'all' || (filterActive === 'active' && r.isActive) || (filterActive === 'inactive' && !r.isActive);
    return matchSearch && matchFilter;
  });

  const activeCount   = entityRules.filter((r) => r.isActive).length;
  const inactiveCount = entityRules.filter((r) => !r.isActive).length;

  const updateRules = (next: GenericRule[]) => onStoreChange(selectedEntity, next);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const rule: GenericRule = {
      id: genId(),
      name: newName.trim(),
      description: '',
      scope: 'all_forms',
      isActive: true,
      runOrder: entityRules.length + 1,
      conditions: { logicalOperator: 'AND', conditions: [] },
      actions: [],
      elseActions: [],
    };
    updateRules([...entityRules, rule]);
    setCreating(false);
    setNewName('');
    setEditingRule(rule);
  };

  const handleSave = (rule: GenericRule) => {
    updateRules(entityRules.map((r) => (r.id === rule.id ? rule : r)));
    setEditingRule(rule);
  };

  const handleToggle = (rule: GenericRule) => {
    updateRules(entityRules.map((r) => r.id === rule.id ? { ...r, isActive: !r.isActive } : r));
  };

  const handleClone = (rule: GenericRule) => {
    const cloned: GenericRule = {
      ...rule,
      id: genId(),
      name: `${rule.name} (Copy)`,
      runOrder: entityRules.length + 1,
    };
    updateRules([...entityRules, cloned]);
    setEditingRule(cloned);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    updateRules(entityRules.filter((r) => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  if (editingRule) {
    return (
      <GenericRuleEditorPage
        rule={editingRule}
        entitySchema={schema}
        onSave={handleSave}
        onBack={() => setEditingRule(null)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafbfc]">
      {/* Command Bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-2 flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => setCreating(true)}
          disabled={!selectedEntity}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded shadow-sm transition-all"
        >
          <Plus size={13} /> New Rule
        </button>
        <div className="flex-1" />
        <span className="text-[11px] text-slate-400 mr-2">{filtered.length} rule{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-100 px-5 py-2 flex items-center gap-3 shrink-0">
        {/* Entity selector */}
        <div className="relative">
          <select
            value={selectedEntity}
            onChange={(e) => { setSelectedEntity(e.target.value); setSearch(''); setFilterActive('all'); }}
            className="appearance-none pl-2.5 pr-7 py-1.5 text-[12px] font-medium border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700"
          >
            {entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="flex items-center gap-1">
          <Filter size={12} className="text-slate-400 mr-1" />
          {([
            { id: 'all' as const,      label: 'All',      count: entityRules.length },
            { id: 'active' as const,   label: 'Active',   count: activeCount },
            { id: 'inactive' as const, label: 'Inactive', count: inactiveCount },
          ]).map((c) => (
            <button
              key={c.id}
              onClick={() => setFilterActive(c.id)}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                filterActive === c.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.label}
              <span className={`text-[10px] ${filterActive === c.id ? 'text-blue-200' : 'text-slate-400'}`}>{c.count}</span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 py-1.5 text-[12px] border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 w-52 placeholder:text-slate-400 transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Zap size={24} className="text-slate-200 mb-3" />
            <p className="text-[13px] text-slate-500 mb-1">
              {search ? 'No rules match your search' : `No rules for ${selectedEntity} yet`}
            </p>
            {!search && (
              <button
                onClick={() => setCreating(true)}
                className="mt-2 text-[12px] text-blue-600 hover:underline"
              >
                Create the first rule
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {filtered.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onOpen={() => setEditingRule(rule)}
                onToggle={() => handleToggle(rule)}
                onClone={() => handleClone(rule)}
                onDelete={() => setDeleteTarget(rule)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { setCreating(false); setNewName(''); }} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-[13px] font-semibold text-slate-800 mb-4">Create Rule — {selectedEntity}</h3>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Rule Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`e.g. Require Email for ${selectedEntity}`}
              className="w-full px-3 py-2 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setCreating(false); setNewName(''); }}
                className="flex-1 py-2 text-[12px] border border-slate-300 rounded text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="flex-1 py-2 text-[12px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded transition-colors"
              >
                Create &amp; Design
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Rule"
          message={`Delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete Rule"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}
    </div>
  );
}

function RuleCard({
  rule,
  onOpen,
  onToggle,
  onClone,
  onDelete,
}: {
  rule: GenericRule;
  onOpen: () => void;
  onToggle: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  const condCount = rule.conditions.conditions.length;
  const actCount = rule.actions.length;
  const elseCount = rule.elseActions?.length ?? 0;

  return (
    <div className={`bg-white border rounded-xl overflow-hidden hover:shadow-sm transition-all ${rule.isActive ? 'border-slate-200 hover:border-slate-300' : 'border-slate-200 opacity-60'}`}>
      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2 bg-white">
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${
          rule.isActive ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-100 border-slate-300 text-slate-400'
        }`}>
          <Zap size={9} />
          {rule.isActive ? 'Active' : 'Inactive'}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-50 border-slate-200 text-slate-500">
          {rule.scope === 'all_forms' ? 'All Forms' : 'Specific Form'}
        </span>
      </div>

      <div className="px-3 py-2.5">
        <p className="text-[13px] font-semibold text-slate-800 leading-tight truncate mb-0.5">{rule.name}</p>
        {rule.description && (
          <p className="text-[11px] text-slate-400 line-clamp-1 leading-relaxed">{rule.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {condCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              <Filter size={9} /> {condCount} condition{condCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-[10px] text-amber-500 font-medium">Always runs</span>
          )}
          {actCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              <Zap size={9} /> {actCount} action{actCount !== 1 ? 's' : ''}
            </span>
          )}
          {elseCount > 0 && (
            <span className="text-[10px] text-slate-400">{elseCount} else</span>
          )}
          <span className="text-[10px] text-slate-300 ml-auto">Order: {rule.runOrder}</span>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-1.5">
        <button
          onClick={onOpen}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
        >
          <Pencil size={10} /> Design
        </button>
        <button
          onClick={onToggle}
          title={rule.isActive ? 'Deactivate' : 'Activate'}
          className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
        >
          {rule.isActive
            ? <ToggleRight size={15} className="text-emerald-500" />
            : <ToggleLeft size={15} />}
        </button>
        <button
          onClick={onClone}
          title="Clone"
          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Copy size={12} />
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
