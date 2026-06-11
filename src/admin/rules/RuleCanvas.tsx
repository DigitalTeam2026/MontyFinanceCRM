import { useState } from 'react';
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronRight,
  Filter, ArrowRight, CornerDownRight, Layers, Braces, EyeOff,
} from 'lucide-react';
import type { FieldDefinition } from '../../types/field';
import type { ProcessFlow, ProcessStage } from '../../types/processFlow';
import type {
  RuleConditionBlock,
  RuleConditionGroup,
  RuleCondition,
  RuleAction,
} from '../../types/businessRule';
import {
  ACTION_META,
  COND_OPERATOR_LABELS,
  PROCESS_FLOW_FIELD_OPTIONS,
  STAGE_CATEGORY_OPTIONS,
} from '../../types/businessRule';
import ConditionBuilder from './ConditionBuilder';
import ActionBuilder from './ActionBuilder';

interface RuleCanvasProps {
  blocks: RuleConditionBlock[];
  fields: FieldDefinition[];
  processFlows: ProcessFlow[];
  loadFlowStages: (flowId: string) => Promise<ProcessStage[]>;
  expandedBlockId: string | null;
  onExpandBlock: (id: string | null) => void;
  onUpdateBlock: (id: string, patch: Partial<RuleConditionBlock>) => void;
  onAddBlock: () => void;
  onRemoveBlock: (id: string) => void;
  onReorderBlocks: (from: number, to: number) => void;
}

// ─── Readable summaries (collapsed view) ──────────────────────────────────────

function valueLabel(
  cond: RuleCondition,
  fields: FieldDefinition[],
  processFlows: ProcessFlow[],
): string {
  const v = cond.value;
  if (v == null || v === '') return '';
  const raw = Array.isArray(v) ? v.join(', ') : String(v);

  if (cond.source === 'process_flow') {
    if (cond.process_flow_field === 'process_flow') {
      return processFlows.find((p) => p.process_flow_id === raw)?.name ?? raw;
    }
    if (cond.process_flow_field === 'stage_category') {
      return STAGE_CATEGORY_OPTIONS.find((o) => o.value === raw)?.label ?? raw;
    }
    return raw; // current_stage — stage name not loaded in summary
  }

  // entity choice: try to resolve the option label
  const f = fields.find((x) => x.logical_name === cond.field_logical_name);
  const cfg = f?.config_json as Record<string, unknown> | null;
  const choices = Array.isArray(cfg?.choices) ? (cfg!.choices as { value: string; label: string }[]) : [];
  if (choices.length > 0) {
    const labels = (Array.isArray(v) ? v : [raw]).map(
      (val) => choices.find((c) => c.value === String(val))?.label ?? String(val),
    );
    return labels.join(', ');
  }
  return raw;
}

function condFieldLabel(cond: RuleCondition, fields: FieldDefinition[]): string {
  if (cond.source === 'process_flow') {
    return PROCESS_FLOW_FIELD_OPTIONS.find((o) => o.value === cond.process_flow_field)?.label
      ?? cond.field_display_name ?? 'Process';
  }
  return fields.find((f) => f.logical_name === cond.field_logical_name)?.display_name
    ?? cond.field_display_name
    ?? cond.field_logical_name;
}

function CondPill({ cond, fields, processFlows }: { cond: RuleCondition; fields: FieldDefinition[]; processFlows: ProcessFlow[] }) {
  const val = valueLabel(cond, fields, processFlows);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 border border-purple-200 text-[11px] text-purple-800">
      <span className="font-semibold">{condFieldLabel(cond, fields)}</span>
      <span className="text-purple-400">{COND_OPERATOR_LABELS[cond.operator]}</span>
      {val && <span className="font-medium">{val}</span>}
    </span>
  );
}

function GroupSummary({
  group, fields, processFlows, depth,
}: { group: RuleConditionGroup; fields: FieldDefinition[]; processFlows: ProcessFlow[]; depth: number }) {
  const items: React.ReactNode[] = [];
  group.conditions.forEach((c) => items.push(<CondPill key={c.id} cond={c} fields={fields} processFlows={processFlows} />));
  group.groups.forEach((g) => items.push(
    <span key={g.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-100/50 border border-purple-200 flex-wrap">
      <span className="text-purple-400 text-[10px]">(</span>
      <GroupSummary group={g} fields={fields} processFlows={processFlows} depth={depth + 1} />
      <span className="text-purple-400 text-[10px]">)</span>
    </span>,
  ));

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {items.map((node, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span className="text-[9px] font-bold tracking-wide text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">
              {group.operator}
            </span>
          )}
          {node}
        </span>
      ))}
    </span>
  );
}

function ConditionSummary({ group, fields, processFlows }: { group: RuleConditionGroup | null; fields: FieldDefinition[]; processFlows: ProcessFlow[] }) {
  if (!group || (group.conditions.length === 0 && group.groups.length === 0)) {
    return <span className="text-[11px] italic text-slate-400">Always — no conditions</span>;
  }
  return <GroupSummary group={group} fields={fields} processFlows={processFlows} depth={0} />;
}

function describeAction(a: RuleAction, fields: FieldDefinition[]): string {
  const fname = fields.find((f) => f.logical_name === a.target_field)?.display_name ?? a.target_field ?? '—';
  switch (a.action_type) {
    case 'set_visibility':       return `${a.value === false || a.value === 'false' ? 'Hide' : 'Show'} ${fname}`;
    case 'lock_unlock':          return `${a.value === true || a.value === 'true' ? 'Lock' : 'Unlock'} ${fname}`;
    case 'set_business_required':return `${fname} → ${a.required_level ?? 'required'}`;
    case 'set_field_value':      return `Set ${fname}`;
    case 'set_default_value':    return `Default ${fname}`;
    case 'clear_field_value':    return `Clear ${fname}`;
    case 'advanced_formula_value': return `Formula → ${fname}`;
    case 'show_error_message':   return a.message ? `"${a.message.slice(0, 28)}${a.message.length > 28 ? '…' : ''}"` : 'Error message';
    case 'add_recommendation':   return a.recommendation_title || 'Recommendation';
    default:                     return ACTION_META[a.action_type]?.label ?? fname;
  }
}

function ActionPill({ action, fields, tone }: { action: RuleAction; fields: FieldDefinition[]; tone: 'then' | 'else' }) {
  const meta = ACTION_META[action.action_type];
  const base = tone === 'then'
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : 'bg-slate-100 border-slate-200 text-slate-600';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] ${base}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta?.dotColor ?? 'bg-slate-400'}`} />
      <span className="font-medium">{describeAction(action, fields)}</span>
    </span>
  );
}

function ActionStrip({ actions, fields, tone, emptyLabel }: { actions: RuleAction[]; fields: FieldDefinition[]; tone: 'then' | 'else'; emptyLabel: string }) {
  if (actions.length === 0) return <span className="text-[11px] italic text-slate-400">{emptyLabel}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((a) => <ActionPill key={a.id} action={a} fields={fields} tone={tone} />)}
    </div>
  );
}

// ─── A single block card ──────────────────────────────────────────────────────

function BlockCard({
  block, index, total, fields, processFlows, loadFlowStages,
  expanded, onToggleExpand, onUpdate, onRemove,
  onDragStart, onDragOver, onDrop, isDragTarget,
}: {
  block: RuleConditionBlock;
  index: number;
  total: number;
  fields: FieldDefinition[];
  processFlows: ProcessFlow[];
  loadFlowStages: (flowId: string) => Promise<ProcessStage[]>;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<RuleConditionBlock>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragTarget: boolean;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative rounded-2xl border-2 bg-white transition-all ${
        isDragTarget ? 'border-blue-400 ring-2 ring-blue-100' : expanded ? 'border-blue-300 shadow-md' : 'border-slate-200 hover:border-slate-300 shadow-sm'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
        <div
          draggable
          onDragStart={onDragStart}
          title="Drag to reorder"
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0"
        >
          <GripVertical size={15} />
        </div>
        <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 text-blue-600 shrink-0">
          <Layers size={13} />
        </div>
        <input
          value={block.name ?? `Condition ${index + 1}`}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="text-sm font-semibold text-slate-800 bg-transparent border-0 focus:outline-none focus:ring-0 min-w-0 flex-1"
        />
        <span className="text-[10px] font-medium text-slate-400 shrink-0">
          {index + 1} / {total}
        </span>
        <button
          onClick={onToggleExpand}
          className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            expanded ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? 'Editing' : 'Edit'}
        </button>
        {total > 1 && (
          <button
            onClick={onRemove}
            title="Remove this block"
            className="shrink-0 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Collapsed: inline IF → THEN / ELSE summary */}
      {!expanded && (
        <div className="grid grid-cols-[1.2fr_auto_1fr] gap-3 p-3 items-stretch">
          {/* IF (purple) */}
          <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Filter size={11} className="text-purple-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">If</span>
            </div>
            <ConditionSummary group={block.condition_group} fields={fields} processFlows={processFlows} />
          </div>

          {/* arrow */}
          <div className="flex items-center justify-center text-slate-300">
            <ArrowRight size={16} />
          </div>

          {/* THEN + ELSE stacked (green / gray) */}
          <div className="flex flex-col gap-2 min-w-0">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <ArrowRight size={11} className="text-emerald-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Then</span>
              </div>
              <ActionStrip actions={block.if_actions} fields={fields} tone="then" emptyLabel="No actions" />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <CornerDownRight size={11} className="text-slate-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Else</span>
              </div>
              <ActionStrip actions={block.else_actions} fields={fields} tone="else" emptyLabel="No actions (optional)" />
            </div>
          </div>
        </div>
      )}

      {/* Expanded: full inline editors reusing existing builders */}
      {expanded && (
        <div className="p-4 space-y-5 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Filter size={12} className="text-purple-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600">If — Conditions</span>
            </div>
            <ConditionBuilder
              key={`cond-${block.id}`}
              fields={fields}
              group={block.condition_group}
              onChange={(g) => onUpdate({ condition_group: g })}
              processFlows={processFlows}
              loadFlowStages={loadFlowStages}
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowRight size={12} className="text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Then / Else — Actions</span>
            </div>
            <div className="h-[520px]">
              <ActionBuilder
                key={`act-${block.id}`}
                fields={fields}
                actionSet={{ if_actions: block.if_actions, else_actions: block.else_actions }}
                onChange={(set) => onUpdate({ if_actions: set.if_actions, else_actions: set.else_actions })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

export default function RuleCanvas({
  blocks, fields, processFlows, loadFlowStages,
  expandedBlockId, onExpandBlock, onUpdateBlock, onAddBlock, onRemoveBlock, onReorderBlocks,
}: RuleCanvasProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [showJson, setShowJson] = useState(false);

  const handleDrop = (to: number) => {
    if (dragIndex !== null && dragIndex !== to) onReorderBlocks(dragIndex, to);
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div>
      <div className="flex items-start gap-3 mb-5">
        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0"><Layers size={14} /></div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-slate-800">Rule Canvas</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Each block runs independently: <span className="text-purple-600 font-medium">If</span> conditions decide whether the{' '}
            <span className="text-emerald-600 font-medium">Then</span> or{' '}
            <span className="text-slate-500 font-medium">Else</span> actions apply. Drag the handle to reorder.
          </p>
        </div>
        <button
          onClick={() => setShowJson((s) => !s)}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors shrink-0"
        >
          {showJson ? <EyeOff size={12} /> : <Braces size={12} />}
          {showJson ? 'Hide JSON' : 'View JSON'}
        </button>
      </div>

      {showJson && (
        <pre className="mb-5 max-h-72 overflow-auto rounded-xl bg-slate-900 text-slate-100 text-[11px] leading-relaxed p-4 font-mono">
          {JSON.stringify({ condition_blocks: blocks }, null, 2)}
        </pre>
      )}

      <div className="space-y-4">
        {blocks.map((block, i) => (
          <div key={block.id}>
            {i > 0 && (
              <div className="flex items-center justify-center py-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-300">then evaluate</span>
              </div>
            )}
            <BlockCard
              block={block}
              index={i}
              total={blocks.length}
              fields={fields}
              processFlows={processFlows}
              loadFlowStages={loadFlowStages}
              expanded={expandedBlockId === block.id}
              onToggleExpand={() => onExpandBlock(expandedBlockId === block.id ? null : block.id)}
              onUpdate={(patch) => onUpdateBlock(block.id, patch)}
              onRemove={() => onRemoveBlock(block.id)}
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
              onDrop={() => handleDrop(i)}
              isDragTarget={overIndex === i && dragIndex !== null && dragIndex !== i}
            />
          </div>
        ))}
      </div>

      <button
        onClick={onAddBlock}
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all text-sm font-semibold"
      >
        <Plus size={16} />
        Add Condition Block
      </button>
    </div>
  );
}
