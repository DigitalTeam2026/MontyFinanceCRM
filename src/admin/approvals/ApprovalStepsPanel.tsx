import { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, User, Shield, Users, ArrowUp, CircleUser as UserCircle, Clock, CheckCircle, XCircle, CornerDownRight, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import type { ApprovalStepDraft, ApproverType, ApprovalAction, StepExecutionMode } from '../../types/approvalProcess';
import { APPROVER_TYPE_META, APPROVAL_ACTION_META } from '../../types/approvalProcess';

interface ApprovalStepsPanelProps {
  steps: ApprovalStepDraft[];
  executionMode: StepExecutionMode;
  onChange: (steps: ApprovalStepDraft[]) => void;
  disabled?: boolean;
}

const APPROVER_ICONS: Record<ApproverType, React.ReactNode> = {
  user:         <User size={12} />,
  role:         <Shield size={12} />,
  team:         <Users size={12} />,
  manager:      <ArrowUp size={12} />,
  record_owner: <UserCircle size={12} />,
};

const ALL_ACTIONS: ApprovalAction[] = ['approve', 'reject', 'delegate', 'reassign'];

function makeStep(order: number): ApprovalStepDraft {
  return {
    _tempId: `step-${Date.now()}-${Math.random()}`,
    step_name: '',
    description: '',
    display_order: order,
    approver_type: 'role',
    approver_user_id: null,
    approver_role_id: null,
    approver_team_id: null,
    allowed_actions: ['approve', 'reject'],
    requires_comment: false,
    escalation_after_hours: null,
    escalation_to_user_id: null,
    is_active: true,
  };
}

export default function ApprovalStepsPanel({ steps, executionMode, onChange, disabled }: ApprovalStepsPanelProps) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const add = () => {
    const newStep = makeStep(steps.length);
    const updated = [...steps, newStep];
    onChange(updated);
    setExpandedStep(newStep._tempId);
  };

  const remove = (id: string) => {
    onChange(steps.filter((s) => s._tempId !== id).map((s, i) => ({ ...s, display_order: i })));
    if (expandedStep === id) setExpandedStep(null);
  };

  const update = (id: string, patch: Partial<ApprovalStepDraft>) =>
    onChange(steps.map((s) => s._tempId === id ? { ...s, ...patch } : s));

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...steps];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next.map((s, i) => ({ ...s, display_order: i })));
  };

  const moveDown = (idx: number) => {
    if (idx === steps.length - 1) return;
    const next = [...steps];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next.map((s, i) => ({ ...s, display_order: i })));
  };

  const toggleAction = (step: ApprovalStepDraft, action: ApprovalAction) => {
    const has = step.allowed_actions.includes(action);
    const next = has
      ? step.allowed_actions.filter((a) => a !== action)
      : [...step.allowed_actions, action];
    update(step._tempId, { allowed_actions: next.length > 0 ? next : ['approve'] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">Approval Steps</span>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5">{steps.length}</span>
          <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${
            executionMode === 'sequential'
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {executionMode === 'sequential' ? 'Run in order' : 'Run simultaneously'}
          </span>
        </div>
        {!disabled && (
          <button onClick={add} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
            <Plus size={11} />Add step
          </button>
        )}
      </div>

      {steps.length === 0 ? (
        <div className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
          No steps configured — add at least one approver step.
          {!disabled && <button onClick={add} className="block mx-auto mt-1.5 text-blue-600 hover:underline">Add first step</button>}
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((step, idx) => {
            const isExpanded = expandedStep === step._tempId;
            const approverMeta = APPROVER_TYPE_META[step.approver_type];
            const hasName = step.step_name.trim().length > 0;

            return (
              <div key={step._tempId} className={`border rounded-xl transition-all ${
                isExpanded ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-white'
              } ${!step.is_active ? 'opacity-60' : ''}`}>
                {/* Header row */}
                <div
                  className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
                  onClick={() => setExpandedStep(isExpanded ? null : step._tempId)}
                >
                  {/* Order badge */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    executionMode === 'sequential'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {executionMode === 'sequential' ? idx + 1 : '∥'}
                  </div>

                  <div className="flex-1 min-w-0">
                    {hasName ? (
                      <span className="text-xs font-semibold text-gray-800">{step.step_name}</span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Untitled step</span>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-gray-500 flex items-center gap-1">
                        {APPROVER_ICONS[step.approver_type]}
                        {approverMeta.label}
                      </span>
                      {step.escalation_after_hours && (
                        <span className="text-[10px] text-amber-600 flex items-center gap-1">
                          <Clock size={9} />Escalates after {step.escalation_after_hours}h
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions preview */}
                  <div className="flex items-center gap-1">
                    {step.allowed_actions.map((a) => (
                      <span
                        key={a}
                        className="text-[9px] font-medium rounded px-1.5 py-0.5"
                        style={{ backgroundColor: APPROVAL_ACTION_META[a].color + '15', color: APPROVAL_ACTION_META[a].color }}
                      >
                        {APPROVAL_ACTION_META[a].label}
                      </span>
                    ))}
                  </div>

                  {!disabled && (
                    <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {executionMode === 'sequential' && (
                        <>
                          <button onClick={() => moveUp(idx)} disabled={idx === 0} className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors">
                            <ChevronUp size={12} />
                          </button>
                          <button onClick={() => moveDown(idx)} disabled={idx === steps.length - 1} className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors">
                            <ChevronDown size={12} />
                          </button>
                        </>
                      )}
                      <button onClick={() => remove(step._tempId)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded config */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-blue-100 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-[10px] font-semibold text-gray-600 mb-1">Step Name <span className="text-red-500">*</span></label>
                        <input
                          value={step.step_name}
                          onChange={(e) => update(step._tempId, { step_name: e.target.value })}
                          disabled={disabled}
                          placeholder="e.g. Compliance Review"
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-semibold text-gray-600 mb-1">Description</label>
                        <input
                          value={step.description}
                          onChange={(e) => update(step._tempId, { description: e.target.value })}
                          disabled={disabled}
                          placeholder="What this step reviews or verifies"
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                        />
                      </div>
                    </div>

                    {/* Approver type */}
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-600 mb-2">Assigned Approver</label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {(Object.entries(APPROVER_TYPE_META) as [ApproverType, typeof APPROVER_TYPE_META[ApproverType]][]).map(([type, meta]) => (
                          <button
                            key={type}
                            onClick={() => !disabled && update(step._tempId, { approver_type: type })}
                            className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-center transition-all ${
                              step.approver_type === type
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            } ${disabled ? 'pointer-events-none' : 'cursor-pointer'}`}
                          >
                            <span>{APPROVER_ICONS[type]}</span>
                            <span className="text-[9px] font-semibold leading-tight">{meta.label.split("'")[0]}</span>
                          </button>
                        ))}
                      </div>
                      {(step.approver_type === 'user' || step.approver_type === 'role' || step.approver_type === 'team') && (
                        <div className="mt-2">
                          <label className="block text-[10px] font-semibold text-gray-600 mb-1">
                            {step.approver_type === 'user' ? 'User ID' : step.approver_type === 'role' ? 'Role ID' : 'Team ID'}
                          </label>
                          <input
                            value={(step.approver_type === 'user' ? step.approver_user_id : step.approver_type === 'role' ? step.approver_role_id : step.approver_team_id) ?? ''}
                            onChange={(e) => {
                              const val = e.target.value || null;
                              if (step.approver_type === 'user') update(step._tempId, { approver_user_id: val });
                              else if (step.approver_type === 'role') update(step._tempId, { approver_role_id: val });
                              else update(step._tempId, { approver_team_id: val });
                            }}
                            disabled={disabled}
                            placeholder="Paste UUID of the user / role / team"
                            className="w-full px-2.5 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                          />
                        </div>
                      )}
                    </div>

                    {/* Allowed actions */}
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-600 mb-2">Allowed Actions</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {ALL_ACTIONS.map((action) => {
                          const meta = APPROVAL_ACTION_META[action];
                          const has = step.allowed_actions.includes(action);
                          return (
                            <button
                              key={action}
                              onClick={() => !disabled && toggleAction(step, action)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                                has
                                  ? 'border-transparent text-white'
                                  : 'border-gray-200 text-gray-400 hover:border-gray-300'
                              } ${disabled ? 'pointer-events-none' : 'cursor-pointer'}`}
                              style={has ? { backgroundColor: meta.color } : {}}
                            >
                              {action === 'approve' && <CheckCircle size={11} />}
                              {action === 'reject' && <XCircle size={11} />}
                              {action === 'delegate' && <CornerDownRight size={11} />}
                              {action === 'reassign' && <RefreshCw size={11} />}
                              {meta.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Comment and escalation */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => !disabled && update(step._tempId, { requires_comment: !step.requires_comment })}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                          step.requires_comment ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                        } ${disabled ? 'pointer-events-none' : 'cursor-pointer'}`}
                      >
                        {step.requires_comment
                          ? <ToggleRight size={16} className="text-blue-600 flex-shrink-0" />
                          : <ToggleLeft size={16} className="text-gray-400 flex-shrink-0" />}
                        <div>
                          <p className="text-[11px] font-semibold text-gray-800">Require Comment</p>
                          <p className="text-[10px] text-gray-400">Approver must leave a note</p>
                        </div>
                      </button>

                      <div>
                        <label className="block text-[10px] font-semibold text-gray-600 mb-1">Escalate After (hours)</label>
                        <input
                          type="number"
                          value={step.escalation_after_hours ?? ''}
                          onChange={(e) => update(step._tempId, { escalation_after_hours: e.target.value ? Number(e.target.value) : null })}
                          disabled={disabled}
                          placeholder="Leave blank to disable"
                          min={1}
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                        />
                        {step.escalation_after_hours && (
                          <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                            <Clock size={9} />Auto-escalates after {step.escalation_after_hours}h
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Active toggle */}
                    <button
                      onClick={() => !disabled && update(step._tempId, { is_active: !step.is_active })}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border w-full text-left transition-all ${
                        step.is_active ? 'border-gray-200 bg-gray-50' : 'border-red-200 bg-red-50'
                      } ${disabled ? 'pointer-events-none' : 'cursor-pointer'}`}
                    >
                      {step.is_active
                        ? <ToggleRight size={16} className="text-emerald-600" />
                        : <ToggleLeft size={16} className="text-gray-400" />}
                      <span className="text-[11px] font-medium text-gray-700">
                        {step.is_active ? 'Step is active' : 'Step is disabled'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
