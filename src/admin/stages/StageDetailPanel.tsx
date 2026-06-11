import { useEffect, useState } from 'react';
import {
  Save, X, Info,
  ToggleLeft, ToggleRight, ShieldCheck, ArrowLeftRight, CheckCircle2,
  ChevronDown, ChevronUp, Tag, GitMerge,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { ProcessStage, ProcessStageFormData, StageType, StageCategory } from '../../types/processFlow';
import { STAGE_TYPE_META, STAGE_CATEGORIES } from '../../types/processFlow';
import { updateProcessStage } from '../../services/processFlowService';

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6',
  '#0ea5e9', '#f97316', '#6b7280', '#ec4899', '#14b8a6',
];

interface StageDetailPanelProps {
  stage: ProcessStage & { flowName: string };
  flowName: string;
  onUpdated: (stage: ProcessStage) => void;
  onClose: () => void;
}

export default function StageDetailPanel({ stage, flowName, onUpdated, onClose }: StageDetailPanelProps) {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState<ProcessStageFormData>(toForm(stage));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    setForm(toForm(stage));
    setDirty(false);
  }, [stage.process_stage_id]);

  function toForm(s: ProcessStage): ProcessStageFormData {
    return {
      name: s.name,
      description: s.description,
      stage_key: s.stage_key,
      display_order: s.display_order,
      stage_color: s.stage_color,
      stage_type: s.stage_type,
      stage_category: s.stage_category ?? 'general',
      is_default: s.is_default,
      probability: s.probability,
      allow_backward_movement: s.allow_backward_movement ?? true,
      requires_entry_approval: s.requires_entry_approval ?? false,
      requires_exit_approval: s.requires_exit_approval ?? false,
      entry_rules: s.entry_rules ?? [],
      exit_rules: s.exit_rules ?? [],
    };
  }

  const set = <K extends keyof ProcessStageFormData>(key: K, value: ProcessStageFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showError('Stage name is required.'); return; }
    setSaving(true);
    try {
      const updated = await updateProcessStage(stage.process_stage_id, form);
      onUpdated(updated);
      setDirty(false);
      showSuccess('Stage saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const isTerminal = form.stage_type !== 'active';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: form.stage_color || STAGE_TYPE_META[form.stage_type].color }}
            />
            <span className="text-sm font-semibold text-gray-900">{form.name || 'Edit Stage'}</span>
            {stage.is_default && (
              <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0">default</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <GitMerge size={10} />
            <span>{flowName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={12} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-6">

        {/* ── Identity ──────────────────────────────────────── */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Identity</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Stage Name <span className="text-red-500">*</span></label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Stage Key</label>
                <input
                  value={form.stage_key}
                  onChange={(e) => set('stage_key', e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                  className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Display Order</label>
                <input
                  type="number"
                  value={form.display_order}
                  onChange={(e) => set('display_order', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
          </div>
        </section>

        {/* ── Classification ───────────────────────────────── */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Classification</h4>
          <div className="space-y-3">
            {/* Stage Type */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Stage Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(STAGE_TYPE_META) as StageType[]).map((type) => {
                  const meta = STAGE_TYPE_META[type];
                  return (
                    <button
                      key={type}
                      onClick={() => set('stage_type', type)}
                      className={`text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                        form.stage_type === type
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                        <span className="text-xs font-semibold text-gray-800">{meta.label}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 leading-snug">{meta.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stage Category */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                <Tag size={11} className="inline mr-1" />
                Stage Category
              </label>
              <div className="flex flex-wrap gap-1.5">
                {STAGE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => set('stage_category', cat.id as StageCategory)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      form.stage_category === cat.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Colour */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Stage Colour</label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => set('stage_color', c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      form.stage_color === c ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={form.stage_color}
                  onChange={(e) => set('stage_color', e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border border-gray-200"
                  title="Custom colour"
                />
                <span className="text-xs text-gray-400 font-mono">{form.stage_color}</span>
              </div>
            </div>

            {/* Probability (active only) */}
            {!isTerminal && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Win Probability
                  <span className="ml-1 text-gray-400 font-normal">(optional, 0–100%)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={form.probability ?? 0}
                    onChange={(e) => set('probability', parseInt(e.target.value))}
                    className="flex-1 accent-blue-600"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.probability ?? ''}
                      onChange={(e) => set('probability', e.target.value === '' ? null : parseInt(e.target.value))}
                      placeholder="—"
                      className="w-14 px-2 py-1 text-xs border border-gray-200 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Movement & Approval Gates ────────────────────── */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <ShieldCheck size={13} />
            Movement & Approval Gates
          </h4>
          <div className="space-y-2.5">
            <GateToggle
              label="Allow Backward Movement"
              description="When off, records cannot re-enter this stage once they have passed it"
              icon={<ArrowLeftRight size={14} className="text-blue-500" />}
              checked={form.allow_backward_movement}
              onChange={(v) => set('allow_backward_movement', v)}
            />
            <GateToggle
              label="Requires Entry Approval"
              description="A manager or approver must approve before a record can enter this stage"
              icon={<CheckCircle2 size={14} className="text-emerald-500" />}
              checked={form.requires_entry_approval}
              onChange={(v) => set('requires_entry_approval', v)}
            />
            <GateToggle
              label="Requires Exit Approval"
              description="A manager or approver must approve before a record can leave this stage"
              icon={<ShieldCheck size={14} className="text-amber-500" />}
              checked={form.requires_exit_approval}
              onChange={(v) => set('requires_exit_approval', v)}
            />
          </div>
        </section>

        {/* ── Entry/Exit Rules (collapsed) ──────────────────── */}
        <section>
          <button
            onClick={() => setShowRules((v) => !v)}
            className="w-full flex items-center justify-between py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 mb-3"
          >
            <span>Entry &amp; Exit Conditions</span>
            {showRules ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {showRules && (
            <div className="space-y-4">
              <ConditionList
                label="Entry Conditions"
                conditions={form.entry_rules}
                onChange={(rules) => set('entry_rules', rules)}
              />
              <ConditionList
                label="Exit Conditions"
                conditions={form.exit_rules}
                onChange={(rules) => set('exit_rules', rules)}
              />
            </div>
          )}
        </section>

        {stage.is_default && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <Info size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">This is the default entry stage for its flow. New records begin here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Gate Toggle ──────────────────────────────────────────────────────────────

interface GateToggleProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function GateToggle({ label, description, icon, checked, onChange }: GateToggleProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl">
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 leading-snug mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="flex-shrink-0 text-gray-300 hover:text-blue-600 transition-colors"
      >
        {checked ? <ToggleRight size={24} className="text-blue-600" /> : <ToggleLeft size={24} />}
      </button>
    </div>
  );
}

// ─── Condition List ───────────────────────────────────────────────────────────

import type { RuleCondition } from '../../types/processFlow';
import { Plus } from 'lucide-react';

const OPERATORS = [
  { value: 'equals',       label: 'Equals' },
  { value: 'not_equals',   label: 'Not equals' },
  { value: 'is_set',       label: 'Is set' },
  { value: 'is_not_set',   label: 'Is not set' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than',    label: 'Less than' },
  { value: 'contains',     label: 'Contains' },
];

interface ConditionListProps {
  label: string;
  conditions: RuleCondition[];
  onChange: (rules: RuleCondition[]) => void;
}

function ConditionList({ label, conditions, onChange }: ConditionListProps) {
  const add = () => onChange([...conditions, { field: '', operator: 'equals', value: '' }]);
  const remove = (i: number) => onChange(conditions.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<RuleCondition>) =>
    onChange(conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const noValue = (op: string) => op === 'is_set' || op === 'is_not_set';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <button onClick={add} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors">
          <Plus size={11} />Add
        </button>
      </div>
      {conditions.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No conditions defined</p>
      ) : (
        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={c.field}
                onChange={(e) => update(i, { field: e.target.value })}
                placeholder="field_name"
                className="flex-1 px-2 py-1.5 text-xs font-mono border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <select
                value={c.operator}
                onChange={(e) => update(i, { operator: e.target.value })}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {!noValue(c.operator) && (
                <input
                  value={String(c.value ?? '')}
                  onChange={(e) => update(i, { value: e.target.value })}
                  placeholder="value"
                  className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              )}
              <button onClick={() => remove(i)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
