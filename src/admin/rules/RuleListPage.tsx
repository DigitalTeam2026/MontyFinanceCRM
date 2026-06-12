import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState } from 'react';
import {
  Plus, RefreshCw, Zap, Pencil, Trash2, ToggleLeft, ToggleRight, AlertCircle, Filter, Play, Globe, FileText, Shield, Wrench, Copy, Lock, Search, LayoutGrid, User, X, Download, Sparkles } from 'lucide-react';
import type { EntityDefinition } from '../../types/entity';
import type { BusinessRule, RuleScope } from '../../types/businessRule';
import { fetchEntities } from '../../services/entityService';
import {
  fetchRulesForEntity,
  createRule,
  softDeleteRule,
  toggleRuleActive,
  cloneRule,
} from '../../services/businessRuleService';
import ConfirmDialog from '../components/ConfirmDialog';
import AiRuleCreatorModal from './AiRuleCreatorModal';

const SCOPE_ICONS: Record<RuleScope, React.ReactNode> = {
  all_forms:         <Globe size={10} />,
  specific_form:     <FileText size={10} />,
  specific_bpf:      <Play size={10} />,
  specific_bpf_stage: <Filter size={10} />,
};

const SCOPE_LABELS: Record<RuleScope, string> = {
  all_forms:         'All Forms',
  specific_form:     'Specific Form',
  specific_bpf:      'Specific BPF',
  specific_bpf_stage: 'BPF Stage',
};

type CategoryTab = 'all' | 'system' | 'custom';

interface RuleListPageProps {
  onOpen: (rule: BusinessRule, entityId: string, entityName: string) => void;
  preselectedEntityId?: string;
}

export default function RuleListPage({ onOpen, preselectedEntityId }: RuleListPageProps) {
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState(preselectedEntityId ?? '');
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BusinessRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
  const [search, setSearch] = useState('');
  const [cloneTarget, setCloneTarget] = useState<BusinessRule | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  useEffect(() => {
    fetchEntities()
      .then((ents) => {
        setEntities(ents);
        if (!preselectedEntityId && ents.length > 0) setSelectedEntityId(ents[0].entity_definition_id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedEntityId) return;
    setRulesLoading(true);
    setError(null);
    fetchRulesForEntity(selectedEntityId)
      .then(setRules)
      .catch((e) => setError(e.message))
      .finally(() => setRulesLoading(false));
  }, [selectedEntityId]);

  const systemCount = rules.filter((r) => r.is_system).length;
  const customCount = rules.filter((r) => !r.is_system).length;

  const filtered = rules.filter((r) => {
    const matchSearch =
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat =
      categoryTab === 'all' ||
      (categoryTab === 'system' && r.is_system) ||
      (categoryTab === 'custom' && !r.is_system);
    return matchSearch && matchCat;
  });

  const activeFiltered = filtered.filter((r) => r.is_active);
  const inactiveFiltered = filtered.filter((r) => !r.is_active);

  const handleCreate = async () => {
    if (!newName.trim() || !selectedEntityId) return;
    try {
      const r = await createRule({ entity_definition_id: selectedEntityId, name: newName.trim() });
      setRules((prev) => [...prev, r]);
      setCreating(false);
      setNewName('');
      onOpen(r, selectedEntityId, selectedEntity?.display_name ?? '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteRule(deleteTarget.business_rule_id);
      setRules((prev) => prev.filter((r) => r.business_rule_id !== deleteTarget.business_rule_id));
      setDeleteTarget(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (rule: BusinessRule) => {
    if (rule.is_system) return;
    try {
      await toggleRuleActive(rule.business_rule_id, !rule.is_active);
      setRules((prev) => prev.map((r) =>
        r.business_rule_id === rule.business_rule_id ? { ...r, is_active: !r.is_active } : r
      ));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  const openCloneModal = (rule: BusinessRule) => {
    setCloneTarget(rule);
    setCloneName(`${rule.name} (Copy)`);
  };

  const handleClone = async () => {
    if (!cloneTarget || !cloneName.trim()) return;
    setCloning(true);
    try {
      const cloned = await cloneRule(cloneTarget.business_rule_id, cloneName.trim());
      setRules((prev) => [...prev, cloned]);
      setCloneTarget(null);
      setCloneName('');
      onOpen(cloned, selectedEntityId, selectedEntity?.display_name ?? '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Clone failed');
    } finally {
      setCloning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={16} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const selectedEntity = entities.find((e) => e.entity_definition_id === selectedEntityId);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafbfc]">
      {/* Command Bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-2 flex items-center gap-1.5 shrink-0">
        <CmdBtn primary onClick={() => setCreating(true)} icon={<Plus size={13} />} disabled={!selectedEntityId}>
          New rule
        </CmdBtn>
        <button
          onClick={() => setShowAiModal(true)}
          disabled={!selectedEntityId}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded shadow-sm transition-all disabled:opacity-50"
        >
          <Sparkles size={13} /> Create with AI
        </button>
        <CmdSep />
        <CmdBtn icon={<RefreshCw size={12} className={rulesLoading ? 'animate-spin' : ''} />} onClick={() => setSelectedEntityId(selectedEntityId)}>
          Refresh
        </CmdBtn>
        <CmdBtn icon={<Download size={12} />}>Export</CmdBtn>
        <div className="flex-1" />
        <span className="text-[11px] text-slate-400 mr-2">{filtered.length} rule{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filter Chips + Entity Selector + Search */}
      <div className="bg-white border-b border-slate-100 px-5 py-2 flex items-center gap-3 shrink-0">
        <div className="relative">
          {preselectedEntityId ? (
            <div className="flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 text-[12px] font-medium border border-slate-200 rounded-md bg-slate-50 text-slate-700">
              <Lock size={10} className="text-slate-400" />
              {selectedEntity?.display_name ?? ''}
            </div>
          ) : (
            <>
              <FilterSelect
                value={selectedEntityId}
                onChange={(e) => { setSelectedEntityId(e.target.value); setCategoryTab('all'); setSearch(''); }}
                className="appearance-none pl-2.5 pr-7 py-1.5 text-[12px] font-medium border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700"
              >
                {entities.map((e) => (
                  <option key={e.entity_definition_id} value={e.entity_definition_id}>{e.display_name}</option>
                ))}
              </FilterSelect>
              </>
          )}
        </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="flex items-center gap-1">
          <Filter size={12} className="text-slate-400 mr-1" />
          {([
            { id: 'all' as const, label: 'All', count: rules.length },
            { id: 'system' as const, label: 'System', count: systemCount, icon: <Shield size={10} /> },
            { id: 'custom' as const, label: 'Custom', count: customCount, icon: <Wrench size={10} /> },
          ]).map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryTab(c.id)}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                categoryTab === c.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.icon}
              {c.label}
              <span className={`text-[10px] ${categoryTab === c.id ? 'text-blue-200' : 'text-slate-400'}`}>
                {c.count}
              </span>
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
        {error && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-300 text-red-700 text-[12px] rounded">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        {rulesLoading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw size={16} className="animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <LayoutGrid size={24} className="text-slate-300 mb-2" />
            <p className="text-[12px] text-slate-500">
              {search
                ? 'No rules match your search'
                : categoryTab === 'custom'
                  ? selectedEntity ? `No custom rules for ${selectedEntity.display_name} yet` : 'Select an entity'
                  : 'No rules found'}
            </p>
            {!search && selectedEntityId && categoryTab !== 'system' && (
              <button onClick={() => setCreating(true)} className="mt-3 text-[12px] text-blue-600 hover:underline">
                Create a custom rule
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {activeFiltered.length > 0 && (
              <RuleSection
                title="Active"
                rules={activeFiltered}
                onOpen={onOpen}
                selectedEntityId={selectedEntityId}
                selectedEntityName={selectedEntity?.display_name ?? ''}
                onDelete={setDeleteTarget}
                onToggle={handleToggle}
                onClone={openCloneModal}
              />
            )}
            {inactiveFiltered.length > 0 && (
              <RuleSection
                title="Inactive"
                rules={inactiveFiltered}
                onOpen={onOpen}
                selectedEntityId={selectedEntityId}
                selectedEntityName={selectedEntity?.display_name ?? ''}
                onDelete={setDeleteTarget}
                onToggle={handleToggle}
                onClone={openCloneModal}
                muted
              />
            )}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setCreating(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-[13px] font-semibold text-slate-800 mb-4">Create Custom Rule</h3>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Rule Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`e.g. Require Phone for ${selectedEntity?.display_name ?? 'Lebanon'}`}
              className="w-full px-3 py-2 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setNewName(''); }} className="flex-1 py-2 text-[12px] border border-slate-300 rounded text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={!newName.trim()} className="flex-1 py-2 text-[12px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded transition-colors">Create & Design</button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Modal */}
      {cloneTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { setCloneTarget(null); setCloneName(''); }} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-[13px] font-semibold text-slate-800 mb-1">Clone Rule</h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Creates an editable copy of <strong className="text-slate-600">{cloneTarget.name}</strong>
            </p>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">New Rule Name</label>
            <input
              type="text"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              className="w-full px-3 py-2 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleClone()}
            />
            <div className="flex gap-2">
              <button onClick={() => { setCloneTarget(null); setCloneName(''); }} className="flex-1 py-2 text-[12px] border border-slate-300 rounded text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleClone} disabled={!cloneName.trim() || cloning} className="flex-1 py-2 text-[12px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded transition-colors">
                {cloning ? 'Cloning...' : 'Clone & Open'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Custom Rule"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete Rule'}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}

      {showAiModal && (
        <AiRuleCreatorModal
          entities={entities}
          defaultEntityId={selectedEntityId}
          lockEntity={!!preselectedEntityId}
          onCreated={(rule) => {
            setShowAiModal(false);
            setRules((prev) => [...prev, rule]);
          }}
          onEditBeforeCreate={(rule) => {
            setShowAiModal(false);
            setRules((prev) => [...prev, rule]);
            onOpen(rule, selectedEntityId, selectedEntity?.display_name ?? '');
          }}
          onClose={() => setShowAiModal(false)}
        />
      )}
    </div>
  );
}

function RuleSection({
  title,
  rules,
  onOpen,
  selectedEntityId,
  selectedEntityName,
  onDelete,
  onToggle,
  onClone,
  muted,
}: {
  title: string;
  rules: BusinessRule[];
  onOpen: (r: BusinessRule, entityId: string, entityName: string) => void;
  selectedEntityId: string;
  selectedEntityName: string;
  onDelete: (r: BusinessRule) => void;
  onToggle: (r: BusinessRule) => void;
  onClone: (r: BusinessRule) => void;
  muted?: boolean;
}) {
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${muted ? 'text-slate-400' : 'text-slate-500'}`}>
        {title}
      </p>
      <div className="space-y-2">
        {rules.map((rule) => (
          <RuleCard
            key={rule.business_rule_id}
            rule={rule}
            onOpen={() => onOpen(rule, selectedEntityId, selectedEntityName)}
            onDelete={() => onDelete(rule)}
            onToggle={() => onToggle(rule)}
            onClone={() => onClone(rule)}
            muted={muted}
          />
        ))}
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  onOpen,
  onDelete,
  onToggle,
  onClone,
  muted,
}: {
  rule: BusinessRule;
  onOpen: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onClone: () => void;
  muted?: boolean;
}) {
  const isSystem = rule.is_system;
  const canDelete = rule.is_deletable !== false && !isSystem;

  const condCount =
    (rule.trigger_json?.condition_group?.conditions.length ?? 0) +
    (rule.trigger_json?.condition_group?.groups.length ?? 0);
  const ifCount = rule.action_json?.if_actions.length ?? 0;
  const elseCount = rule.action_json?.else_actions.length ?? 0;

  return (
    <div className={`bg-white border rounded-xl overflow-hidden hover:shadow-sm transition-all ${muted ? 'border-slate-200 opacity-60' : 'border-slate-200 hover:border-slate-300'}`}>
      {/* Card header */}
      <div className={`px-3 py-2 flex items-center gap-2 border-b border-slate-100 ${isSystem ? 'bg-slate-50/80' : 'bg-white'}`}>
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${
          rule.is_active ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-100 border-slate-300 text-slate-400'
        }`}>
          <Zap size={9} />
          {rule.is_active ? 'Active' : 'Inactive'}
        </span>

        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-50 border-slate-200 text-slate-500">
          {SCOPE_ICONS[rule.scope]}
          <span className="ml-0.5">{SCOPE_LABELS[rule.scope]}</span>
        </span>

        {isSystem ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-100 border-slate-300 text-slate-500">
            <Shield size={9} />
            System
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium bg-amber-50 border-amber-200 text-amber-600">
            <Wrench size={9} />
            Custom
          </span>
        )}
        <span className={`ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${
          isSystem
            ? 'bg-slate-100 border-slate-300 text-slate-600'
            : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          {isSystem ? <Lock size={9} /> : <User size={9} />}
          {isSystem ? 'System' : 'User'}
        </span>
      </div>

      {/* Card body */}
      <div className="px-3 py-2.5">
        <p className="text-[13px] font-semibold text-slate-800 leading-tight truncate mb-0.5">{rule.name}</p>
        {rule.description && (
          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{rule.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {condCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              <Filter size={9} /> {condCount} condition{condCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-[10px] text-amber-500 font-medium">Always runs</span>
          )}
          {ifCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              <Play size={9} /> {ifCount} IF action{ifCount !== 1 ? 's' : ''}
            </span>
          )}
          {elseCount > 0 && (
            <span className="text-[10px] text-slate-400">{elseCount} ELSE</span>
          )}
          <span className="text-[10px] text-slate-300">Order: {rule.run_order}</span>
        </div>
      </div>

      {/* Card actions */}
      <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-1.5">
        <button
          onClick={onOpen}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
        >
          <Pencil size={10} />
          {isSystem ? 'Open' : 'Design'}
        </button>
        {!isSystem && (
          <button
            onClick={onToggle}
            title={rule.is_active ? 'Deactivate' : 'Activate'}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
          >
            {rule.is_active
              ? <ToggleRight size={15} className="text-emerald-500" />
              : <ToggleLeft size={15} />}
          </button>
        )}
        <button
          onClick={onClone}
          title="Clone this rule"
          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Copy size={12} />
        </button>
        {canDelete ? (
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          >
            <Trash2 size={12} />
          </button>
        ) : (
          <div
            className="p-1.5 text-slate-200 cursor-not-allowed"
            title={isSystem ? 'System rules cannot be deleted' : 'This rule cannot be deleted'}
          >
            <Lock size={12} />
          </div>
        )}
      </div>
    </div>
  );
}

function CmdBtn({ children, onClick, icon, primary, disabled }: {
  children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; primary?: boolean; disabled?: boolean;
}) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded transition-all disabled:opacity-50';
  const style = primary
    ? `${base} bg-blue-600 hover:bg-blue-700 text-white shadow-sm`
    : `${base} text-slate-600 hover:bg-slate-100`;
  return <button className={style} onClick={onClick} disabled={disabled}>{icon}{children}</button>;
}

function CmdSep() {
  return <div className="w-px h-5 bg-slate-200 mx-1" />;
}
