import { useState } from 'react';
import {
  Save, Info, ArrowRight, Lock, Plus, X, ChevronDown, ChevronUp,
  GitBranch, Shuffle, Star, AlertCircle,
} from 'lucide-react';
import type { ProcessStage, ProcessFlowTransition, TransitionCondition } from '../../types/processFlow';
import { TRANSITION_OPERATORS } from '../../types/processFlow';
import { useToast } from '../../app/context/ToastContext';

interface TransitionMatrixPanelProps {
  stages: ProcessStage[];
  transitions: ProcessFlowTransition[];
  onSave: (transitions: ProcessFlowTransition[]) => Promise<void>;
  isSystem: boolean;
}

type EditableTransition = {
  transition_id: string;
  from_stage_id: string;
  to_stage_id: string;
  transition_name: string;
  requires_fields: string[];
  conditions: TransitionCondition[];
  priority: number;
  is_default: boolean;
};

function buildEditable(transitions: ProcessFlowTransition[]): EditableTransition[] {
  return transitions.map((t) => ({
    transition_id: t.transition_id,
    from_stage_id: t.from_stage_id,
    to_stage_id: t.to_stage_id,
    transition_name: t.transition_name,
    requires_fields: t.requires_fields ?? [],
    conditions: t.conditions ?? [],
    priority: t.priority ?? 100,
    is_default: t.is_default ?? false,
  }));
}

export default function TransitionMatrixPanel({
  stages, transitions, onSave, isSystem,
}: TransitionMatrixPanelProps) {
  const { showSuccess } = useToast();
  const [editable, setEditable] = useState<EditableTransition[]>(() => buildEditable(transitions));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expandedFrom, setExpandedFrom] = useState<string | null>(null);
  const [expandedTransition, setExpandedTransition] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list');

  const activeStages = stages.filter((s) => s.stage_type === 'active');
  const allStages = stages;

  const getTransitionsFrom = (fromId: string) =>
    editable.filter((t) => t.from_stage_id === fromId).sort((a, b) => a.priority - b.priority);

  const addTransition = (fromId: string, toId: string) => {
    const existing = editable.find((t) => t.from_stage_id === fromId && t.to_stage_id === toId);
    if (existing) return;
    const fromTransitions = getTransitionsFrom(fromId);
    const maxPriority = fromTransitions.length > 0
      ? Math.max(...fromTransitions.map((t) => t.priority))
      : 0;
    const newT: EditableTransition = {
      transition_id: crypto.randomUUID(),
      from_stage_id: fromId,
      to_stage_id: toId,
      transition_name: '',
      requires_fields: [],
      conditions: [],
      priority: maxPriority + 10,
      is_default: fromTransitions.length === 0,
    };
    setEditable((prev) => [...prev, newT]);
    setDirty(true);
    setExpandedTransition(newT.transition_id);
  };

  const removeTransition = (id: string) => {
    setEditable((prev) => prev.filter((t) => t.transition_id !== id));
    setDirty(true);
    if (expandedTransition === id) setExpandedTransition(null);
  };

  const updateTransition = (id: string, patch: Partial<EditableTransition>) => {
    setEditable((prev) => prev.map((t) => t.transition_id === id ? { ...t, ...patch } : t));
    setDirty(true);
  };

  const setDefaultTransition = (fromId: string, id: string) => {
    setEditable((prev) => prev.map((t) =>
      t.from_stage_id === fromId
        ? { ...t, is_default: t.transition_id === id }
        : t
    ));
    setDirty(true);
  };

  const reprioritize = (fromId: string, id: string, dir: 'up' | 'down') => {
    const fromTs = getTransitionsFrom(fromId);
    const idx = fromTs.findIndex((t) => t.transition_id === id);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === fromTs.length - 1) return;

    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    const newOrder = [...fromTs];
    const tmp = newOrder[idx].priority;
    newOrder[idx] = { ...newOrder[idx], priority: newOrder[swapIdx].priority };
    newOrder[swapIdx] = { ...newOrder[swapIdx], priority: tmp };

    setEditable((prev) =>
      prev.map((t) => {
        const updated = newOrder.find((n) => n.transition_id === t.transition_id);
        return updated ?? t;
      })
    );
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const out: ProcessFlowTransition[] = editable.map((t) => ({
        transition_id: t.transition_id,
        process_flow_id: stages[0]?.process_flow_id ?? '',
        from_stage_id: t.from_stage_id,
        to_stage_id: t.to_stage_id,
        transition_name: t.transition_name || buildDefaultName(t, stages),
        requires_fields: t.requires_fields,
        conditions: t.conditions,
        priority: t.priority,
        is_default: t.is_default,
        created_at: new Date().toISOString(),
      }));
      await onSave(out);
      setDirty(false);
      showSuccess('Transitions saved');
    } finally {
      setSaving(false);
    }
  };

  if (stages.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <ArrowRight size={32} className="mb-3 opacity-30" />
        <p className="text-sm font-medium">At least 2 stages required</p>
        <p className="text-xs mt-1">Add stages first, then configure transitions between them</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Transition Rules</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Define allowed movements and optional conditions that route to different stages.
            <span className="font-medium ml-1">{editable.length} transition{editable.length !== 1 ? 's' : ''} defined.</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'matrix' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Matrix
            </button>
          </div>
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {saving ? 'Saving...' : 'Save Transitions'}
            </button>
          )}
        </div>
      </div>

      {isSystem && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <Lock size={13} className="text-amber-600 flex-shrink-0" />
          This is a system flow. You can still modify transitions.
        </div>
      )}

      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        <Info size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <span>
          If no transitions are defined, all stage movements are allowed.
          When transitions exist, only enabled ones are permitted.
          Add <strong>conditions</strong> to a transition to enable conditional branching —
          the engine evaluates transitions in <strong>priority order</strong> and takes the first match.
          Mark one transition as <strong>default</strong> to use it when no conditions match.
        </span>
      </div>

      {viewMode === 'list' ? (
        <ListView
          stages={allStages}
          activeStages={activeStages}
          editable={editable}
          expandedFrom={expandedFrom}
          expandedTransition={expandedTransition}
          onToggleFrom={(id) => setExpandedFrom(expandedFrom === id ? null : id)}
          onToggleTransition={(id) => setExpandedTransition(expandedTransition === id ? null : id)}
          onAdd={addTransition}
          onRemove={removeTransition}
          onUpdate={updateTransition}
          onSetDefault={setDefaultTransition}
          onReprioritize={reprioritize}
        />
      ) : (
        <MatrixView
          stages={allStages}
          editable={editable}
          onAdd={addTransition}
          onRemove={removeTransition}
        />
      )}
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

interface ListViewProps {
  stages: ProcessStage[];
  activeStages: ProcessStage[];
  editable: EditableTransition[];
  expandedFrom: string | null;
  expandedTransition: string | null;
  onToggleFrom: (id: string) => void;
  onToggleTransition: (id: string) => void;
  onAdd: (fromId: string, toId: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<EditableTransition>) => void;
  onSetDefault: (fromId: string, id: string) => void;
  onReprioritize: (fromId: string, id: string, dir: 'up' | 'down') => void;
}

function ListViewFromGroup({
  fromStage, stages, editable, expandedFrom, expandedTransition,
  onToggleFrom, onToggleTransition, onAdd, onRemove, onUpdate, onSetDefault, onReprioritize,
}: {
  fromStage: ProcessStage;
} & ListViewProps) {
  const fromTs = editable
    .filter((t) => t.from_stage_id === fromStage.process_stage_id)
    .sort((a, b) => a.priority - b.priority);

  const isExpanded = expandedFrom === fromStage.process_stage_id;
  const isTerminal = fromStage.stage_type !== 'active';
  const toBranch = fromTs.some((t) => t.conditions.length > 0);

  return (
    <div className={`border rounded-xl overflow-hidden ${isTerminal ? 'opacity-60' : ''}`}>
      <button
        onClick={() => !isTerminal && onToggleFrom(fromStage.process_stage_id)}
        disabled={isTerminal}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          isExpanded ? 'bg-gray-50 border-b border-gray-200' : 'bg-white hover:bg-gray-50'
        } ${isTerminal ? 'cursor-not-allowed' : ''}`}
      >
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: fromStage.stage_color }} />
        <span className="text-sm font-semibold text-gray-800 flex-1">{fromStage.name}</span>
        {isTerminal && <span className="text-xs text-gray-400">terminal — no outgoing transitions</span>}
        {!isTerminal && (
          <div className="flex items-center gap-2">
            {fromTs.length > 0 && (
              <span className="text-xs text-gray-500 font-medium">{fromTs.length} transition{fromTs.length !== 1 ? 's' : ''}</span>
            )}
            {toBranch && (
              <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded font-medium">
                <GitBranch size={10} />
                Branching
              </span>
            )}
            {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
        )}
      </button>

      {isExpanded && !isTerminal && (
        <div className="bg-white p-3 space-y-2">
          {fromTs.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-3">No transitions defined — all outgoing movements allowed</p>
          )}

          {fromTs.map((t, idx) => {
            const toStage = stages.find((s) => s.process_stage_id === t.to_stage_id);
            const isExpT = expandedTransition === t.transition_id;
            const hasConditions = t.conditions.length > 0;

            return (
              <div key={t.transition_id} className={`border rounded-lg overflow-hidden ${hasConditions ? 'border-orange-200' : 'border-gray-200'}`}>
                <div
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                    isExpT ? 'bg-gray-50 border-b border-gray-200' : hasConditions ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => onToggleTransition(t.transition_id)}
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); onReprioritize(fromStage.process_stage_id, t.transition_id, 'up'); }}
                      disabled={idx === 0}
                      className="text-gray-300 hover:text-gray-500 disabled:opacity-20 transition-colors p-0.5"
                    >
                      <ChevronUp size={10} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onReprioritize(fromStage.process_stage_id, t.transition_id, 'down'); }}
                      disabled={idx === fromTs.length - 1}
                      className="text-gray-300 hover:text-gray-500 disabled:opacity-20 transition-colors p-0.5"
                    >
                      <ChevronDown size={10} />
                    </button>
                  </div>

                  <span className="text-xs text-gray-400 font-mono w-5 text-center">{idx + 1}</span>

                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <ArrowRight size={12} className="text-gray-400 flex-shrink-0" />
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: toStage?.stage_color ?? '#ccc' }} />
                    <span className="text-xs font-semibold text-gray-700 truncate">{toStage?.name ?? '?'}</span>
                    {t.transition_name && (
                      <span className="text-xs text-gray-400 truncate">"{t.transition_name}"</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasConditions && (
                      <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded font-medium">
                        <GitBranch size={9} />
                        {t.conditions.length} condition{t.conditions.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {t.is_default && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                        <Star size={9} />
                        default
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemove(t.transition_id); }}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1"
                    >
                      <X size={12} />
                    </button>
                    {isExpT ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
                  </div>
                </div>

                {isExpT && (
                  <TransitionEditor
                    transition={t}
                    fromId={fromStage.process_stage_id}
                    onUpdate={onUpdate}
                    onSetDefault={onSetDefault}
                  />
                )}
              </div>
            );
          })}

          <AddTransitionRow
            fromId={fromStage.process_stage_id}
            existingToIds={fromTs.map((t) => t.to_stage_id)}
            stages={stages.filter((s) => s.process_stage_id !== fromStage.process_stage_id)}
            onAdd={onAdd}
          />
        </div>
      )}
    </div>
  );
}

function ListView(props: ListViewProps) {
  const { stages } = props;
  return (
    <div className="space-y-3">
      {stages.map((fromStage) => (
        <ListViewFromGroup key={fromStage.process_stage_id} fromStage={fromStage} {...props} />
      ))}
    </div>
  );
}

// ─── Add Transition Row ───────────────────────────────────────────────────────

function AddTransitionRow({
  fromId, existingToIds, stages, onAdd,
}: {
  fromId: string;
  existingToIds: string[];
  stages: ProcessStage[];
  onAdd: (fromId: string, toId: string) => void;
}) {
  const available = stages.filter((s) => !existingToIds.includes(s.process_stage_id));
  const [showSelect, setShowSelect] = useState(false);

  if (available.length === 0) return null;

  return showSelect ? (
    <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
      <ArrowRight size={12} className="text-blue-500 flex-shrink-0" />
      <select
        autoFocus
        defaultValue=""
        onChange={(e) => { if (e.target.value) { onAdd(fromId, e.target.value); setShowSelect(false); } }}
        onBlur={() => setShowSelect(false)}
        className="flex-1 px-2 py-1 text-xs border border-blue-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        <option value="">Select destination stage...</option>
        {available.map((s) => (
          <option key={s.process_stage_id} value={s.process_stage_id}>{s.name}</option>
        ))}
      </select>
      <button onClick={() => setShowSelect(false)} className="text-gray-400 hover:text-gray-600">
        <X size={12} />
      </button>
    </div>
  ) : (
    <button
      onClick={() => setShowSelect(true)}
      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors py-1"
    >
      <Plus size={12} />
      Add transition
    </button>
  );
}

// ─── Transition Editor ────────────────────────────────────────────────────────

function TransitionEditor({
  transition, fromId, onUpdate, onSetDefault,
}: {
  transition: EditableTransition;
  fromId: string;
  onUpdate: (id: string, patch: Partial<EditableTransition>) => void;
  onSetDefault: (fromId: string, id: string) => void;
}) {
  const addCondition = () => {
    onUpdate(transition.transition_id, {
      conditions: [
        ...transition.conditions,
        { field: '', operator: 'not_empty', value: null },
      ],
    });
  };

  const removeCondition = (i: number) => {
    onUpdate(transition.transition_id, {
      conditions: transition.conditions.filter((_, idx) => idx !== i),
    });
  };

  const updateCondition = (i: number, patch: Partial<TransitionCondition>) => {
    onUpdate(transition.transition_id, {
      conditions: transition.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c),
    });
  };

  const needsValue = (op: TransitionCondition['operator']) =>
    op !== 'not_empty' && op !== 'empty';

  return (
    <div className="p-4 space-y-4 bg-white">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
        <input
          value={transition.transition_name}
          onChange={(e) => onUpdate(transition.transition_id, { transition_name: e.target.value })}
          placeholder="e.g. Convert Lead, Escalate, Fast-Track"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
          <input
            type="number"
            value={transition.priority}
            onChange={(e) => onUpdate(transition.transition_id, { priority: parseInt(e.target.value) || 100 })}
            min={1}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <p className="text-xs text-gray-400 mt-1">Lower = evaluated first</p>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Default fallback</label>
          <button
            onClick={() => onSetDefault(fromId, transition.transition_id)}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
              transition.is_default
                ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium'
                : 'border-gray-200 text-gray-500 hover:border-amber-200 hover:text-amber-600'
            }`}
          >
            <Star size={13} />
            {transition.is_default ? 'Default' : 'Set as default'}
          </button>
          <p className="text-xs text-gray-400 mt-1">Used when no conditions match</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <GitBranch size={12} className="text-orange-500" />
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Conditions
              {transition.conditions.length > 0 && (
                <span className="ml-1 text-orange-600 normal-case font-normal">
                  ({transition.conditions.length}) — all must match to use this transition
                </span>
              )}
            </label>
          </div>
          <button
            onClick={addCondition}
            className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium transition-colors"
          >
            <Plus size={11} />
            Add
          </button>
        </div>

        {transition.conditions.length === 0 ? (
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <Shuffle size={12} className="text-gray-400" />
            <span className="text-xs text-gray-400">
              No conditions — this transition is always eligible (use priority to order)
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {transition.conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                <input
                  value={cond.field}
                  onChange={(e) => updateCondition(i, { field: e.target.value })}
                  placeholder="field name"
                  className="w-28 px-2 py-1.5 text-xs font-mono border border-orange-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                />
                <select
                  value={cond.operator}
                  onChange={(e) => updateCondition(i, { operator: e.target.value as TransitionCondition['operator'] })}
                  className="px-2 py-1.5 text-xs border border-orange-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                >
                  {TRANSITION_OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
                {needsValue(cond.operator) && (
                  <input
                    value={cond.value as string ?? ''}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    placeholder="value"
                    className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-orange-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                )}
                {!needsValue(cond.operator) && <div className="flex-1" />}
                <button onClick={() => removeCondition(i)} className="text-orange-300 hover:text-red-500 transition-colors">
                  <X size={13} />
                </button>
              </div>
            ))}

            <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertCircle size={11} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                All conditions must match (AND logic). The engine tries transitions in priority order
                and takes the first fully matching one.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Matrix View ──────────────────────────────────────────────────────────────

function MatrixView({
  stages, editable, onAdd, onRemove,
}: {
  stages: ProcessStage[];
  editable: EditableTransition[];
  onAdd: (fromId: string, toId: string) => void;
  onRemove: (id: string) => void;
}) {
  const isEnabled = (fromId: string, toId: string) =>
    editable.some((t) => t.from_stage_id === fromId && t.to_stage_id === toId);

  const getT = (fromId: string, toId: string) =>
    editable.find((t) => t.from_stage_id === fromId && t.to_stage_id === toId);

  const toggle = (fromId: string, toId: string) => {
    const t = getT(fromId, toId);
    if (t) onRemove(t.transition_id);
    else onAdd(fromId, toId);
  };

  return (
    <div className="overflow-auto">
      <table className="text-xs border-collapse min-w-max">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 bg-gray-50 border border-gray-200 text-gray-500 font-semibold min-w-36">
              From \ To
            </th>
            {stages.map((toStage) => (
              <th key={toStage.process_stage_id} className="px-3 py-2 bg-gray-50 border border-gray-200 text-center min-w-28">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: toStage.stage_color }} />
                  <span className="text-gray-700 font-medium leading-tight">{toStage.name}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stages.map((fromStage) => {
            const isTerminalFrom = fromStage.stage_type !== 'active';
            return (
              <tr key={fromStage.process_stage_id} className={isTerminalFrom ? 'opacity-50' : ''}>
                <td className="px-3 py-2 border border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: fromStage.stage_color }} />
                    <span className="font-medium text-gray-700">{fromStage.name}</span>
                  </div>
                  {isTerminalFrom && <div className="text-gray-400 text-xs mt-0.5">terminal</div>}
                </td>
                {stages.map((toStage) => {
                  if (fromStage.process_stage_id === toStage.process_stage_id) {
                    return (
                      <td key={toStage.process_stage_id} className="border border-gray-200 bg-gray-100">
                        <div className="flex items-center justify-center h-10 text-gray-300">—</div>
                      </td>
                    );
                  }
                  const enabled = isEnabled(fromStage.process_stage_id, toStage.process_stage_id);
                  const t = getT(fromStage.process_stage_id, toStage.process_stage_id);
                  const hasConds = (t?.conditions?.length ?? 0) > 0;
                  const canTransition = !isTerminalFrom;

                  return (
                    <td key={toStage.process_stage_id} className="border border-gray-200 p-0">
                      <div
                        className={`flex flex-col items-center justify-center p-2 min-h-[2.5rem] transition-colors ${
                          !canTransition
                            ? 'bg-gray-50 cursor-not-allowed'
                            : enabled
                            ? hasConds ? 'bg-orange-50 cursor-pointer hover:bg-orange-100' : 'bg-emerald-50 cursor-pointer hover:bg-emerald-100'
                            : 'cursor-pointer hover:bg-gray-50'
                        }`}
                        onClick={() => canTransition && toggle(fromStage.process_stage_id, toStage.process_stage_id)}
                        title={enabled ? (hasConds ? `Conditional (${t?.conditions.length} conditions)` : 'Always allowed') : 'Not allowed'}
                      >
                        {canTransition && enabled && (
                          <div className={`w-4 h-4 rounded flex items-center justify-center ${hasConds ? 'bg-orange-500' : 'bg-emerald-500'}`}>
                            {hasConds ? <GitBranch size={9} className="text-white" /> : <ArrowRight size={9} className="text-white" />}
                          </div>
                        )}
                        {canTransition && !enabled && (
                          <div className="w-4 h-4 rounded border-2 border-gray-200" />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex items-center gap-6 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-emerald-500 flex items-center justify-center">
            <ArrowRight size={9} className="text-white" />
          </div>
          <span>Always allowed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-orange-500 flex items-center justify-center">
            <GitBranch size={9} className="text-white" />
          </div>
          <span>Conditional</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded border-2 border-gray-200" />
          <span>Not allowed</span>
        </div>
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildDefaultName(t: EditableTransition, stages: ProcessStage[]): string {
  const from = stages.find((s) => s.process_stage_id === t.from_stage_id)?.name ?? '';
  const to = stages.find((s) => s.process_stage_id === t.to_stage_id)?.name ?? '';
  return `${from} → ${to}`;
}
