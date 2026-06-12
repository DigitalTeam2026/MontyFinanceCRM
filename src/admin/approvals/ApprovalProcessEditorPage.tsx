import FilterSelect from '../../app/components/FilterSelect';
import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Save, AlertTriangle,
  ToggleLeft, ToggleRight, Layers, ArrowRight,
  CheckSquare, Info,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type {
  ApprovalProcess,
  ApprovalProcessFormData,
  ApprovalConditionDraft,
  ApprovalStepDraft,
  StepExecutionMode,
} from '../../types/approvalProcess';
import { KNOWN_ENTITIES, STEP_EXECUTION_MODE_META } from '../../types/approvalProcess';
import {
  updateApprovalProcess,
  fetchApprovalProcessWithDetails,
  replaceConditions,
  replaceSteps,
} from '../../services/approvalProcessService';
import ApprovalConditionsPanel from './ApprovalConditionsPanel';
import ApprovalStepsPanel from './ApprovalStepsPanel';

interface Props {
  proc: ApprovalProcess;
  onBack: () => void;
  onUpdated: (proc: ApprovalProcess) => void;
}

function toConditionDrafts(proc: ApprovalProcess): ApprovalConditionDraft[] {
  return (proc.conditions ?? []).map((c) => ({
    _tempId: c.approval_condition_id,
    condition_type: c.condition_type,
    field_name: c.field_name,
    operator: c.operator,
    value_text: c.value_text,
    value_number: c.value_number,
    ref_id: c.ref_id,
    display_order: c.display_order,
  }));
}

function toStepDrafts(proc: ApprovalProcess): ApprovalStepDraft[] {
  return (proc.steps ?? []).map((s) => ({
    _tempId: s.approval_step_id,
    step_name: s.step_name,
    description: s.description,
    display_order: s.display_order,
    approver_type: s.approver_type,
    approver_user_id: s.approver_user_id,
    approver_role_id: s.approver_role_id,
    approver_team_id: s.approver_team_id,
    allowed_actions: s.allowed_actions,
    requires_comment: s.requires_comment,
    escalation_after_hours: s.escalation_after_hours,
    escalation_to_user_id: s.escalation_to_user_id,
    is_active: s.is_active,
  }));
}

export default function ApprovalProcessEditorPage({ proc, onBack, onUpdated }: Props) {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState<ApprovalProcessFormData>(toForm(proc));
  const [conditions, setConditions] = useState<ApprovalConditionDraft[]>([]);
  const [steps, setSteps] = useState<ApprovalStepDraft[]>([]);
  const [activeTab, setActiveTab] = useState<'settings' | 'conditions' | 'steps'>('settings');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  function toForm(p: ApprovalProcess): ApprovalProcessFormData {
    return {
      name: p.name,
      description: p.description,
      entity_logical_name: p.entity_logical_name,
      step_execution_mode: p.step_execution_mode,
      is_active: p.is_active,
    };
  }

  const loadDetails = useCallback(async () => {
    setLoading(true);
    try {
      const full = await fetchApprovalProcessWithDetails(proc.approval_process_id);
      setConditions(toConditionDrafts(full));
      setSteps(toStepDrafts(full));
    } finally {
      setLoading(false);
    }
  }, [proc.approval_process_id]);

  useEffect(() => {
    setForm(toForm(proc));
    setDirty(false);
    loadDetails();
  }, [proc.approval_process_id]);

  const set = <K extends keyof ApprovalProcessFormData>(key: K, value: ApprovalProcessFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleConditionsChange = (c: ApprovalConditionDraft[]) => { setConditions(c); setDirty(true); };
  const handleStepsChange = (s: ApprovalStepDraft[]) => { setSteps(s); setDirty(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { showError('Name is required.'); return; }
    setSaving(true);
    try {
      const updated = await updateApprovalProcess(proc.approval_process_id, form);
      const condDrafts = conditions.map(({ _tempId, ...c }) => ({ ...c, display_order: conditions.indexOf(conditions.find((x) => x._tempId === _tempId)!) }));
      const stepDrafts = steps.map(({ _tempId, ...s }) => s);
      await Promise.all([
        replaceConditions(proc.approval_process_id, condDrafts),
        replaceSteps(proc.approval_process_id, stepDrafts),
      ]);
      onUpdated(updated);
      setDirty(false);
      showSuccess('Approval process saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const entityLabel = KNOWN_ENTITIES.find((e) => e.logical_name === form.entity_logical_name)?.display_name ?? form.entity_logical_name;
  const modeMeta = STEP_EXECUTION_MODE_META[form.step_execution_mode];

  const tabs = [
    { key: 'settings' as const, label: 'Settings' },
    { key: 'conditions' as const, label: `Conditions (${conditions.length})` },
    { key: 'steps' as const, label: `Approval Steps (${steps.length})` },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft size={14} />Processes
          </button>
          <span className="text-gray-200">·</span>
          <div>
            <div className="flex items-center gap-2">
              <CheckSquare size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-gray-900">{form.name || 'Untitled'}</span>
              {proc.is_system && <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5">system</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-400">{entityLabel}</span>
              <span className={`text-[10px] font-medium rounded px-1.5 ${
                form.step_execution_mode === 'sequential'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-emerald-50 text-emerald-700'
              }`}>{modeMeta.label}</span>
            </div>
          </div>
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save size={12} />{saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-5 py-6">

          {/* ── Settings Tab ──────────────────── */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Process Name <span className="text-red-500">*</span></label>
                  <input
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    rows={2}
                    placeholder="Describe when and why this approval process is used..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Entity</label>
                  <FilterSelect
                    value={form.entity_logical_name}
                    onChange={(e) => set('entity_logical_name', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  >
                    {KNOWN_ENTITIES.map((e) => <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>)}
                  </FilterSelect>
                </div>
              </div>

              {/* Execution mode */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-3">Step Execution Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['sequential', 'parallel'] as StepExecutionMode[]).map((mode) => {
                    const meta = STEP_EXECUTION_MODE_META[mode];
                    const selected = form.step_execution_mode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => set('step_execution_mode', mode)}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                          selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                          selected ? 'bg-blue-100' : 'bg-gray-100'
                        }`}>
                          {mode === 'sequential'
                            ? <ArrowRight size={16} className={selected ? 'text-blue-600' : 'text-gray-400'} />
                            : <Layers size={16} className={selected ? 'text-blue-600' : 'text-gray-400'} />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-800 mb-1">{meta.label}</p>
                          <p className="text-[10px] text-gray-500 leading-relaxed">{meta.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active toggle */}
              <button
                onClick={() => set('is_active', !form.is_active)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all w-full ${
                  form.is_active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                {form.is_active
                  ? <ToggleRight size={18} className="text-blue-600 flex-shrink-0" />
                  : <ToggleLeft size={18} className="text-gray-400 flex-shrink-0" />}
                <div>
                  <p className="text-xs font-semibold text-gray-800">Active</p>
                  <p className="text-[10px] text-gray-400">Inactive processes are not evaluated at runtime</p>
                </div>
              </button>

              {proc.is_system && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">System Process</p>
                    <p className="text-xs text-amber-700 mt-0.5">This system process cannot be deleted, but all settings, conditions, and steps can be customised.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Conditions Tab ────────────────── */}
          {activeTab === 'conditions' && (
            <div>
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-5">
                <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  Conditions determine when this process applies. At runtime, all conditions must match (AND logic).
                  Add separate processes for OR scenarios (different products, different amounts, etc.).
                </p>
              </div>
              {loading ? (
                <div className="text-xs text-gray-400 py-4">Loading conditions...</div>
              ) : (
                <ApprovalConditionsPanel
                  conditions={conditions}
                  onChange={handleConditionsChange}
                />
              )}
            </div>
          )}

          {/* ── Steps Tab ─────────────────────── */}
          {activeTab === 'steps' && (
            <div>
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-5">
                <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  {form.step_execution_mode === 'sequential'
                    ? 'Steps run in order — each must be approved before the next begins. Drag to reorder.'
                    : 'All steps run simultaneously — every step must be approved for the process to complete.'}
                </p>
              </div>
              {loading ? (
                <div className="text-xs text-gray-400 py-4">Loading steps...</div>
              ) : (
                <ApprovalStepsPanel
                  steps={steps}
                  executionMode={form.step_execution_mode}
                  onChange={handleStepsChange}
                />
              )}
            </div>
          )}

          <div className="flex justify-end pt-6 pb-8">
            {dirty && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Save size={14} />{saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
