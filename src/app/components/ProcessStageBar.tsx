import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, Trophy, XCircle, AlertTriangle, X, Clock, ChevronDown, ChevronRight, ChevronLeft, ArrowLeftRight, AlertCircle, Link2, GitBranch, Lock, Maximize2, Minimize2 } from 'lucide-react';
import type { RecordData } from '../services/recordService';
import type { FormRuleState } from '../services/businessRulesEngine';
import type { DesignerLayout } from '../../types/form';
import type { LoadedProcessFlow } from '../services/processFlowEngine';
import { validateStageAdvance, isTransitionAllowed, getCrossEntityInfo, filterLoadedFlowForEntity, evaluateConditionBranch, resolveNextNonConditionStage, resolveRuntimePath } from '../services/processFlowEngine';
import type { StageGateViolation } from '../services/stageValidationService';
import type { ProcessFlow } from '../../types/processFlow';
import { supabase } from '../../lib/supabase';

interface ProcessStageField {
  psf_id: string;
  field_logical_name: string;
  display_label: string | null;
  display_order: number;
  is_required: boolean;
  is_readonly: boolean;
}

export interface MissingFormField {
  field: string;
  label: string;
}

export interface StageViolationEvent {
  stageKey: string;
  stageLabel: string;
  violations: StageGateViolation[];
  missingFromForm: MissingFormField[];
}

export interface DisqualifyReasonResult {
  reason: string;
  statusReasonValue: string;
}

interface StageFieldDef extends ProcessStageField {
  field_type_name: string;
  display_name: string;
  config_json: Record<string, unknown> | null;
  lookup_entity_id: string | null;
  option_set_name: string | null;
}

// ─── Stage Popup (Dynamics 365 style flyout) ────────────────────────────────

interface StagePopupProps {
  stage: import('../../types/processFlow').ProcessStage;
  stageFields: StageFieldDef[];
  values: RecordData;
  onChange: (field: string, value: string) => void;
  onNextStage: () => void;
  onPrevStage: () => void;
  onFinish?: () => void;
  isQualifyFlow?: boolean;
  onClose: () => void;
  isCurrentStage: boolean;
  isPast: boolean;
  isFinished: boolean;
  isReadonly: boolean;
  canGoNext: boolean;
  canGoPrev: boolean;
  isFinalActiveStage: boolean;
  lookupLabels?: Record<string, string>;
  onFieldNavigate?: (field: string) => void;
  anchorRect: DOMRect | null;
}

function StagePopup({
  stage,
  stageFields,
  values,
  onChange,
  onNextStage,
  onPrevStage,
  onFinish,
  isQualifyFlow = false,
  onClose,
  isCurrentStage,
  isPast,
  isFinished,
  isReadonly,
  canGoNext,
  canGoPrev,
  isFinalActiveStage,
  lookupLabels = {},
  onFieldNavigate,
  anchorRect,
}: StagePopupProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const status = isFinished ? 'Completed' : isPast ? 'Completed' : isCurrentStage ? 'Active' : 'Inactive';
  const statusDot = (isFinished || isPast) ? 'bg-emerald-400' : isCurrentStage ? 'bg-blue-500' : 'bg-slate-300';

  const handleNextStage = () => {
    const missing = new Set<string>();
    for (const sf of stageFields) {
      if (sf.is_required) {
        const val = values[sf.field_logical_name];
        if (val == null || String(val).trim() === '') {
          missing.add(sf.field_logical_name);
        }
      }
    }
    if (missing.size > 0) {
      setValidationErrors(missing);
      return;
    }
    setValidationErrors(new Set());
    onNextStage();
  };

  const renderFieldControl = (sf: StageFieldDef) => {
    const val = values[sf.field_logical_name];
    const strVal = val == null ? '' : String(val);
    const hasError = validationErrors.has(sf.field_logical_name);
    const fieldReadonly = isReadonly || sf.is_readonly || isPast;
    const typeName = sf.field_type_name;

    const inputBase = `w-full text-[13px] text-slate-800 border rounded-md px-3 py-[7px] transition focus:outline-none focus:ring-2 focus:ring-offset-0 ${
      hasError
        ? 'border-red-300 bg-red-50/50 focus:ring-red-200 focus:border-red-400'
        : 'border-slate-200 bg-white focus:ring-blue-100 focus:border-blue-400 hover:border-slate-300'
    } disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed disabled:hover:border-slate-200`;

    if (typeName === 'boolean') {
      const boolStr = (val === true || strVal === 'true') ? 'true'
        : (val === false || strVal === 'false') ? 'false'
        : '';
      return (
        <select
          value={boolStr}
          disabled={fieldReadonly}
          onChange={(e) => {
            onChange(sf.field_logical_name, e.target.value);
            setValidationErrors((prev) => { const s = new Set(prev); s.delete(sf.field_logical_name); return s; });
          }}
          className={inputBase}
        >
          <option value="">-- Select --</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }

    if (typeName === 'date') {
      return (
        <input type="date" value={strVal} disabled={fieldReadonly} className={inputBase}
          onChange={(e) => { onChange(sf.field_logical_name, e.target.value); setValidationErrors((prev) => { const s = new Set(prev); s.delete(sf.field_logical_name); return s; }); }}
        />
      );
    }

    if (typeName === 'datetime') {
      return (
        <input type="datetime-local" value={strVal ? strVal.slice(0, 16) : ''} disabled={fieldReadonly} className={inputBase}
          onChange={(e) => { onChange(sf.field_logical_name, e.target.value); setValidationErrors((prev) => { const s = new Set(prev); s.delete(sf.field_logical_name); return s; }); }}
        />
      );
    }

    if (typeName === 'number' || typeName === 'integer' || typeName === 'decimal' || typeName === 'currency') {
      return (
        <input type="number" step={typeName === 'decimal' || typeName === 'currency' ? '0.01' : '1'} value={strVal} disabled={fieldReadonly} className={inputBase}
          onChange={(e) => { onChange(sf.field_logical_name, e.target.value); setValidationErrors((prev) => { const s = new Set(prev); s.delete(sf.field_logical_name); return s; }); }}
        />
      );
    }

    if (typeName === 'choice' || typeName === 'optionset') {
      const choices = (sf.config_json as { choices?: { value: string; label: string }[] } | null)?.choices ?? [];
      return (
        <select value={strVal} disabled={fieldReadonly} className={`${inputBase} appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8`}
          onChange={(e) => { onChange(sf.field_logical_name, e.target.value); setValidationErrors((prev) => { const s = new Set(prev); s.delete(sf.field_logical_name); return s; }); }}
        >
          <option value="">-- Select --</option>
          {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      );
    }

    if (typeName === 'lookup' || typeName === 'owner') {
      const displayLabel = lookupLabels[sf.field_logical_name] ?? (strVal || '');
      return (
        <button type="button" disabled={fieldReadonly}
          onClick={() => !fieldReadonly && onFieldNavigate?.(sf.field_logical_name)}
          className={`${inputBase} text-left truncate ${strVal ? '' : 'text-slate-400'}`}
        >
          {displayLabel || 'Click to select...'}
        </button>
      );
    }

    return (
      <input type="text" value={strVal} disabled={fieldReadonly} className={inputBase} placeholder="Enter value..."
        onChange={(e) => { onChange(sf.field_logical_name, e.target.value); setValidationErrors((prev) => { const s = new Set(prev); s.delete(sf.field_logical_name); return s; }); }}
      />
    );
  };

  const popupWidth = expanded ? 480 : 350;
  const popupStyle: React.CSSProperties = anchorRect
    ? {
        position: 'fixed',
        top: anchorRect.bottom + 8,
        left: Math.max(8, Math.min(anchorRect.left + anchorRect.width / 2 - popupWidth / 2, window.innerWidth - popupWidth - 8)),
        width: popupWidth,
        zIndex: 9999,
      }
    : { position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', width: popupWidth, zIndex: 9999 };

  return createPortal(
    <div ref={popoverRef} style={popupStyle}>
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden transition-all duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
            <h3 className="text-[13px] font-semibold text-slate-800 truncate">{stage.name}</h3>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
              isPast ? 'text-emerald-700 bg-emerald-100' : isCurrentStage ? 'text-blue-700 bg-blue-100' : 'text-slate-500 bg-slate-100'
            }`}>{status}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setExpanded((v) => !v)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition" title={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Fields grid */}
        <div className={`px-4 py-3 max-h-[280px] overflow-y-auto ${expanded ? 'grid grid-cols-2 gap-x-4 gap-y-3' : 'space-y-3'}`}>
          {stageFields.length === 0 ? (
            <p className="text-[12px] text-slate-400 text-center py-3 col-span-2">No fields configured for this stage.</p>
          ) : (
            stageFields.map((sf) => {
              const label = sf.display_label || sf.display_name || sf.field_logical_name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              const hasError = validationErrors.has(sf.field_logical_name);
              return (
                <div key={sf.psf_id}>
                  <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                    {label}
                    {sf.is_required && <span className="text-red-500 text-[10px] leading-none">*</span>}
                    {sf.is_readonly && <Lock size={8} className="text-slate-400 ml-auto" />}
                  </label>
                  {renderFieldControl(sf)}
                  {hasError && (
                    <p className="text-[10px] text-red-600 mt-0.5 flex items-center gap-1">
                      <AlertCircle size={9} className="shrink-0" />
                      Required
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer with navigation buttons */}
        {!isReadonly && isCurrentStage && (canGoPrev || canGoNext || isFinalActiveStage || isFinished) && (
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center gap-2">
            {canGoPrev && (
              <button
                type="button"
                onClick={onPrevStage}
                className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 cursor-pointer transition"
              >
                <ChevronLeft size={13} strokeWidth={2} />
                Previous Stage
              </button>
            )}
            {isFinished && (
              <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-[12px] font-semibold rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                <Check size={13} strokeWidth={2.5} />
                Completed
              </div>
            )}
            {!isFinished && canGoNext && (
              <button
                type="button"
                onClick={handleNextStage}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-[12px] font-semibold rounded-lg transition shadow-sm text-white cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #1a64b6, #2d8cf0)' }}
              >
                Next Stage
                <ChevronRight size={13} strokeWidth={2.5} />
              </button>
            )}
            {!isFinished && isFinalActiveStage && !canGoNext && onFinish && (
              <button
                type="button"
                onClick={onFinish}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-[12px] font-semibold rounded-lg transition shadow-sm text-white cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #0d7c4a, #16a362)' }}
              >
                <Check size={13} strokeWidth={2.5} />
                Finish
              </button>
            )}
            {!isFinished && isFinalActiveStage && !canGoNext && !onFinish && (
              <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-[12px] font-semibold rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                <Check size={13} strokeWidth={2.5} />
                Final Stage
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Disqualify Lead Modal ──────────────────────────────────────────────────

interface StatusReasonOption {
  reason_value: string;
  display_label: string;
}

interface DisqualifyReasonModalProps {
  entityDefinitionId: string;
  onConfirm: (result: DisqualifyReasonResult) => void;
  onCancel: () => void;
}

export function DisqualifyReasonModal({ entityDefinitionId, onConfirm, onCancel }: DisqualifyReasonModalProps) {
  const [statusReasons, setStatusReasons] = useState<StatusReasonOption[]>([]);
  const [selectedReasonValue, setSelectedReasonValue] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: scData } = await supabase
        .from('statecode_definition')
        .select('statecode_id')
        .eq('entity_definition_id', entityDefinitionId)
        .eq('state_value', 3)
        .maybeSingle();
      if (!scData) { if (!cancelled) setLoading(false); return; }
      const { data } = await supabase
        .from('status_reason_definition')
        .select('reason_value, display_label, is_default')
        .eq('entity_definition_id', entityDefinitionId)
        .eq('statecode_id', scData.statecode_id)
        .eq('is_active', true)
        .order('reason_value');
      if (!cancelled && data) {
        setStatusReasons(data.map((r) => ({ reason_value: String(r.reason_value), display_label: r.display_label })));
        const def = data.find((r) => r.is_default);
        if (def) setSelectedReasonValue(String(def.reason_value));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [entityDefinitionId]);

  const selectedLabel = statusReasons.find((r) => r.reason_value === selectedReasonValue)?.display_label ?? '';
  const canConfirm = selectedReasonValue.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[400px] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
              <XCircle size={20} className="text-red-500" />
            </div>
            <div className="pt-0.5">
              <h3 className="text-[15px] font-semibold text-slate-900 leading-tight">Disqualify Lead</h3>
              <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">This lead will become read-only. You can reopen it later.</p>
            </div>
          </div>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0 -mr-1 -mt-0.5">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                Reason for disqualification
              </label>
              <div className="space-y-1.5">
                {statusReasons.map((r) => {
                  const isSelected = selectedReasonValue === r.reason_value;
                  return (
                    <button
                      key={r.reason_value}
                      type="button"
                      onClick={() => setSelectedReasonValue(r.reason_value)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left transition-all duration-100 ${
                        isSelected
                          ? 'bg-red-50 border-[1.5px] border-red-200 ring-1 ring-red-100'
                          : 'bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'border-red-500 bg-red-500' : 'border-slate-300'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className={`text-[13px] leading-tight ${isSelected ? 'font-medium text-red-800' : 'text-slate-700'}`}>
                        {r.display_label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm({ reason: selectedLabel, statusReasonValue: selectedReasonValue })}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-[13px] font-semibold rounded-lg hover:bg-red-700 shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XCircle size={13} />
            Disqualify
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Switch Process Modal ───────────────────────────────────────────────────

interface SwitchProcessModalProps {
  availableFlows: ProcessFlow[];
  currentFlowId: string;
  onConfirm: (flowId: string) => void;
  onCancel: () => void;
}

function SwitchProcessModal({ availableFlows, currentFlowId, onConfirm, onCancel }: SwitchProcessModalProps) {
  const [selected, setSelected] = useState('');
  const others = availableFlows.filter((f) => f.process_flow_id !== currentFlowId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
              <ArrowLeftRight size={15} className="text-blue-500" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">Switch Process</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Select a different process flow for this record.</p>
            </div>
          </div>
          <button onClick={onCancel} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
            <X size={13} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-2">
          {others.length === 0 ? (
            <p className="text-[13px] text-slate-500 text-center py-4">No other active flows available for this entity.</p>
          ) : (
            others.map((flow) => (
              <button key={flow.process_flow_id} type="button" onClick={() => setSelected(flow.process_flow_id)}
                className={`w-full text-left flex items-center gap-3 px-3.5 py-3 rounded-xl border transition ${
                  selected === flow.process_flow_id ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition ${selected === flow.process_flow_id ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                  {selected === flow.process_flow_id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">{flow.name}</p>
                  {flow.description && <p className="text-[11px] text-slate-500 mt-0.5">{flow.description}</p>}
                </div>
              </button>
            ))
          )}
        </div>
        {others.length > 0 && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition">Cancel</button>
            <button type="button" disabled={!selected} onClick={() => selected && onConfirm(selected)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeftRight size={13} />
              Switch Process
            </button>
          </div>
        )}
        {others.length === 0 && (
          <div className="flex justify-end px-5 py-4 border-t border-slate-100">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cross Entity Advance Modal ─────────────────────────────────────────────

interface CrossEntitySwitchInfo {
  fromStageKey: string;
  toStageKey: string;
  toStageName: string;
  targetEntityId: string;
  targetEntityName?: string;
  createLinkedRecord: boolean;
  relationshipColumn: string;
}

function CrossEntityAdvanceModal({ info, onConfirm, onCancel }: { info: CrossEntitySwitchInfo; onConfirm: () => void; onCancel: () => void }) {
  const entityLabel = info.targetEntityName || info.targetEntityId;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0 mt-0.5">
              <Link2 size={15} className="text-teal-500" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">Continue on linked record</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Stage <span className="font-semibold text-slate-700">{info.toStageName}</span> belongs to <span className="font-semibold text-slate-700">{entityLabel}</span>.
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"><X size={13} /></button>
        </div>
        <div className="px-5 py-4">
          {info.createLinkedRecord ? (
            <div className="flex items-start gap-2 bg-teal-50 border border-teal-100 rounded-xl px-3.5 py-3">
              <Check size={13} className="text-teal-600 shrink-0 mt-0.5" />
              <p className="text-[12px] text-teal-800">A new <span className="font-semibold">{entityLabel}</span> record will be created and linked automatically.</p>
            </div>
          ) : (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-3">
              <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[12px] text-amber-800">You will be redirected to the linked <span className="font-semibold">{entityLabel}</span> record.</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition">Cancel</button>
          <button type="button" onClick={onConfirm} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-[13px] font-semibold rounded-lg hover:bg-teal-700 transition">
            <Link2 size={13} />
            {info.createLinkedRecord ? 'Create & Continue' : 'Go to linked record'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function formatTimeInStage(since: string | null | undefined): string | null {
  if (!since) return null;
  const diff = Date.now() - new Date(since).getTime();
  if (isNaN(diff) || diff < 0) return null;
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  if (weeks >= 2) return `${weeks}w`;
  if (days >= 1) return `${days}d`;
  if (hours >= 1) return `${hours}h`;
  return '<1h';
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface ProcessStageBarProps {
  processFlow: LoadedProcessFlow;
  entityDefId?: string | null;
  values: RecordData;
  onChange: (field: string, value: string) => void;
  onStageChangeAsync?: (fromStage: string, toStage: string, finished?: boolean) => Promise<void>;
  onQualifyLead?: () => void;
  onDisqualifyLead?: (reason: string, statusReasonValue?: string) => void;
  isReadonly?: boolean;
  layout?: DesignerLayout | null;
  ruleState?: FormRuleState;
  stageEnteredAt?: string | null;
  availableFlows?: ProcessFlow[];
  allowFlowSwitch?: boolean;
  onSwitchFlow?: (flowId: string) => void;
  onStageViolation?: (event: StageViolationEvent) => void;
  onFieldNavigate?: (field: string) => void;
  fieldTypeMap?: Record<string, string>;
  lookupLabels?: Record<string, string>;
  onCrossEntityAdvance?: (info: CrossEntitySwitchInfo) => void;
  entityNameMap?: Record<string, string>;
}

export type { CrossEntitySwitchInfo };

export default function ProcessStageBar({
  processFlow: processFlowRaw,
  entityDefId,
  values,
  onChange,
  onStageChangeAsync,
  onQualifyLead,
  onDisqualifyLead,
  isReadonly = false,
  layout = null,
  ruleState = { fields: {}, recommendations: [], blockSave: false },
  stageEnteredAt,
  availableFlows = [],
  allowFlowSwitch = true,
  onSwitchFlow,
  onStageViolation,
  onFieldNavigate,
  fieldTypeMap = {},
  lookupLabels = {},
  onCrossEntityAdvance,
  entityNameMap = {},
}: ProcessStageBarProps) {
  const processFlow = useMemo(
    () => filterLoadedFlowForEntity(processFlowRaw, entityDefId ?? null),
    [processFlowRaw, entityDefId],
  );

  const [showDisqualifyModal, setShowDisqualifyModal] = useState(false);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [crossEntityPrompt, setCrossEntityPrompt] = useState<CrossEntitySwitchInfo | null>(null);
  const [openPopupStageKey, setOpenPopupStageKey] = useState<string | null>(null);
  const [popupAnchorRect, setPopupAnchorRect] = useState<DOMRect | null>(null);
  const [popupFieldDefs, setPopupFieldDefs] = useState<StageFieldDef[]>([]);
  const [stageFields, setStageFields] = useState<ProcessStageField[]>([]);

  const { flow, terminalStages } = processFlow;
  const stageField = flow.stage_field;

  const rawValue = String(values[stageField] ?? '');
  // The stage field may store either a stage_key (string key) or a UUID (process_stage_id).
  // Try stageByKey first; if it misses, try stageById so UUID-based tracking columns work too.
  const rawStageFromValue = processFlowRaw.stageByKey.get(rawValue)
    ?? processFlowRaw.stageById.get(rawValue);
  const rawStageKey = rawStageFromValue?.stage_key ?? '';

  // Fallback: check active_process_stage_id (UUID) when the stage_field yields nothing
  const fallbackStage = !rawStageKey && values['active_process_stage_id']
    ? processFlowRaw.stageById.get(String(values['active_process_stage_id']))
    : undefined;
  // If no stage is set yet, default to the first active stage (Dynamics 365 behavior)
  const firstActiveStageKey = processFlow.activeStages.find((s) => s.component_type !== 'condition')?.stage_key ?? '';
  const resolvedStageKey = rawStageKey || (fallbackStage?.stage_key ?? '') || firstActiveStageKey;
  // If the resolved stage is not in this entity's filtered view (e.g. it belongs to another entity),
  // default to the first stage so the bar is always usable on the current entity.
  const stageInView = processFlow.stageByKey.has(resolvedStageKey) || !resolvedStageKey;
  const currentStageKey = (stageInView ? resolvedStageKey : firstActiveStageKey) || firstActiveStageKey;

  // Auto-initialize: write first stage if nothing is set, or if current stage is from another entity
  useEffect(() => {
    if (firstActiveStageKey && !isReadonly && (!rawStageKey || !stageInView)) {
      onChange(stageField, firstActiveStageKey);
      onStageChangeAsync?.(currentStageKey, firstActiveStageKey);
    }
  }, [firstActiveStageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // resolvedPath: condition nodes are evaluated and only the winning branch is shown.
  // This is the single source of truth for both display AND navigation — exactly like Dynamics 365:
  // the bar always shows the full resolved path (current branch) with no condition nodes visible.
  const resolvedPath = useMemo(
    () => resolveRuntimePath(processFlow, values),
    [processFlow, values],
  );

  // displayStages and activeStages are the same resolved path
  const displayStages = resolvedPath;
  const activeStages = resolvedPath;

  // Auto-resolve records stuck on condition nodes
  const currentStageObj_raw = processFlow.stageByKey.get(currentStageKey);
  useEffect(() => {
    if (currentStageObj_raw?.component_type === 'condition' && !isReadonly) {
      const resolved = resolveNextNonConditionStage(processFlowRaw, currentStageKey, values);
      if (resolved) {
        onChange(stageField, resolved.stage_key);
        onStageChangeAsync?.(currentStageKey, resolved.stage_key);
      }
    }
  }, [currentStageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const bpfRaw = values['bpf_is_finished'];
  const isFinished = bpfRaw === true || bpfRaw === 'true' || bpfRaw === 1;

  const currentIdx = displayStages.findIndex((s) => s.stage_key === currentStageKey);
  // runtimeIdx is the same as currentIdx since we use a single resolved path
  const runtimeIdx = currentIdx;
  const terminalStage = terminalStages.find((s) => s.stage_key === currentStageKey) ?? null;
  const isTerminal = Boolean(terminalStage);

  const activeStageObj = processFlow.stageByKey.get(currentStageKey) ?? null;
  useEffect(() => {
    if (!activeStageObj) { setStageFields([]); return; }
    supabase
      .from('process_stage_fields')
      .select('psf_id, field_logical_name, display_label, display_order, is_required, is_readonly')
      .eq('process_stage_id', activeStageObj.process_stage_id)
      .order('display_order')
      .then(({ data }) => setStageFields((data ?? []) as ProcessStageField[]));
  }, [activeStageObj?.process_stage_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load field definitions when popup opens
  useEffect(() => {
    if (!openPopupStageKey) { setPopupFieldDefs([]); return; }
    const popupStage = processFlow.stageByKey.get(openPopupStageKey);
    if (!popupStage) { setPopupFieldDefs([]); return; }

    (async () => {
      const { data: psFields } = await supabase
        .from('process_stage_fields')
        .select('psf_id, field_logical_name, display_label, display_order, is_required, is_readonly')
        .eq('process_stage_id', popupStage.process_stage_id)
        .order('display_order');

      if (!psFields || psFields.length === 0) { setPopupFieldDefs([]); return; }

      const fieldNames = psFields.map((f) => f.field_logical_name);
      const entityDefId_flow = processFlow.flow.entity_definition_id;

      const { data: fieldDefs } = await supabase
        .from('field_definition')
        .select('logical_name, display_name, config_json, lookup_entity_id, field_type:field_type_id(name)')
        .eq('entity_definition_id', entityDefId_flow)
        .in('logical_name', fieldNames)
        .eq('is_active', true);

      const fdMap = new Map<string, { display_name: string; field_type_name: string; config_json: Record<string, unknown> | null; lookup_entity_id: string | null }>();
      for (const fd of (fieldDefs ?? []) as Array<{ logical_name: string; display_name: string; config_json: Record<string, unknown> | null; lookup_entity_id: string | null; field_type: { name: string } | null }>) {
        fdMap.set(fd.logical_name, {
          display_name: fd.display_name,
          field_type_name: fd.field_type?.name ?? 'text',
          config_json: fd.config_json,
          lookup_entity_id: fd.lookup_entity_id,
        });
      }

      const merged: StageFieldDef[] = psFields.map((psf) => {
        const fd = fdMap.get(psf.field_logical_name);
        return {
          ...psf,
          field_type_name: fd?.field_type_name ?? (fieldTypeMap[psf.field_logical_name] || 'text'),
          display_name: fd?.display_name ?? psf.field_logical_name,
          config_json: fd?.config_json ?? null,
          lookup_entity_id: fd?.lookup_entity_id ?? null,
          option_set_name: null,
        } as StageFieldDef;
      });
      setPopupFieldDefs(merged);
    })();
  }, [openPopupStageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pipeline = all display stages + terminal stages
  const visibleTerminalStages = isTerminal
    ? terminalStages.filter((s) => s.stage_key === currentStageKey)
    : terminalStages;

  const pipelineStages = useMemo(
    () => [...displayStages, ...visibleTerminalStages],
    [displayStages, visibleTerminalStages],
  );

  const isSuccessTerminal = terminalStage?.stage_type === 'terminal_success';
  const isFailureTerminal = terminalStage?.stage_type === 'terminal_failure';

  // ─── Validation helpers ───────────────────────────────────────────────────

  const dedupeViolations = (violations: StageGateViolation[]): StageGateViolation[] => {
    const seen = new Set<string>();
    return violations.filter((v) => { if (seen.has(v.field)) return false; seen.add(v.field); return true; });
  };

  const buildMissingFromForm = (violations: StageGateViolation[]): MissingFormField[] => {
    if (!layout) return [];
    const allFormFields = new Set<string>();
    for (const tab of layout.tabs) for (const section of tab.sections) for (const control of section.controls) {
      if (control.control_type === 'field' && control.field_logical_name) allFormFields.add(control.field_logical_name);
    }
    return violations.filter((v) => v.reason === 'required' && !allFormFields.has(v.field)).map((v) => ({ field: v.field, label: v.label }));
  };

  const buildStageFieldViolations = (): StageGateViolation[] => {
    return stageFields
      .filter((sf) => sf.is_required)
      .filter((sf) => { const val = values[sf.field_logical_name]; return val == null || String(val).trim() === ''; })
      .map((sf) => {
        const label = sf.display_label || sf.field_logical_name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return { field: sf.field_logical_name, label, reason: 'required' as const, message: `${label} is required to advance` };
      });
  };

  const commitStageChange = (fromKey: string, toKey: string, finished = false) => {
    onChange(stageField, toKey);
    onStageChangeAsync?.(fromKey, toKey, finished);
  };

  const resolveAndAdvance = (fromKey: string, targetKey: string, targetLabel: string) => {
    const resolvedViaCondition = resolveNextNonConditionStage(processFlowRaw, targetKey, values);
    const finalKey = resolvedViaCondition ? resolvedViaCondition.stage_key : targetKey;
    const finalStage = processFlowRaw.stageByKey.get(finalKey);
    const finalLabel = finalStage?.name ?? targetLabel;

    const crossInfo = getCrossEntityInfo(processFlowRaw, finalKey);
    if (crossInfo.isEntityBoundary && onCrossEntityAdvance) {
      const entityName = entityNameMap[crossInfo.targetEntityId ?? ''] ?? crossInfo.targetRelationshipName;
      setCrossEntityPrompt({ fromStageKey: fromKey, toStageKey: finalKey, toStageName: finalLabel, targetEntityId: crossInfo.targetEntityId ?? '', targetEntityName: entityName, createLinkedRecord: crossInfo.createLinkedRecord, relationshipColumn: crossInfo.targetRelationshipName });
      return;
    }
    commitStageChange(fromKey, finalKey);
  };

  // ─── Click handlers ───────────────────────────────────────────────────────

  const handleStageClick = useCallback((stageKey: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (isTerminal) return;
    if (openPopupStageKey === stageKey) {
      setOpenPopupStageKey(null);
      setPopupAnchorRect(null);
    } else {
      setOpenPopupStageKey(stageKey);
      setPopupAnchorRect((e.currentTarget as HTMLButtonElement).getBoundingClientRect());
    }
  }, [isTerminal, openPopupStageKey]);

  const handleNextStageFromPopup = () => {
    if (isReadonly || isTerminal) return;
    // Use runtimeIdx for navigation — respects conditional branches
    const navIdx = runtimeIdx >= 0 ? runtimeIdx : currentIdx;
    const nextIdx = navIdx + 1;

    // Handle cross-entity next stage: look up in the raw (unfiltered) flow
    if (nextIdx >= activeStages.length) {
      if (!hasCrossEntityNextStage) return;
      const rawActiveStages = processFlowRaw.activeStages;
      const rawIdx = rawActiveStages.findIndex((s) => s.stage_key === currentStageKey);
      if (rawIdx < 0 || rawIdx >= rawActiveStages.length - 1) return;
      const crossNextStage = rawActiveStages[rawIdx + 1];
      const bpfViolations = buildStageFieldViolations();
      const result = validateStageAdvance(processFlow, currentStageKey, crossNextStage.stage_key, values, layout, ruleState);
      const allViolations = dedupeViolations([...bpfViolations, ...result.violations]);
      if (allViolations.length > 0) {
        onStageViolation?.({ stageKey: crossNextStage.stage_key, stageLabel: crossNextStage.name, violations: allViolations, missingFromForm: buildMissingFromForm(allViolations) });
        return;
      }
      resolveAndAdvance(currentStageKey, crossNextStage.stage_key, crossNextStage.name);
      setOpenPopupStageKey(null);
      return;
    }

    const nextStage = activeStages[nextIdx];

    const bpfViolations = buildStageFieldViolations();

    if (nextStage.component_type === 'condition') {
      const bpfCheck = dedupeViolations(bpfViolations);
      if (bpfCheck.length > 0) {
        onStageViolation?.({ stageKey: nextStage.stage_key, stageLabel: nextStage.name, violations: bpfCheck, missingFromForm: buildMissingFromForm(bpfCheck) });
        return;
      }
      const branch = evaluateConditionBranch(processFlow, nextStage.stage_key, values);
      if (branch) {
        resolveAndAdvance(currentStageKey, branch.stage_key, branch.name);
        setOpenPopupStageKey(branch.stage_key);
      } else {
        setOpenPopupStageKey(null);
      }
      return;
    }

    const targetStage = processFlow.stageByKey.get(nextStage.stage_key);
    const isLeadQualify = onQualifyLead && targetStage?.stage_category === 'qualification';

    if (isLeadQualify) {
      const result = validateStageAdvance(processFlow, currentStageKey, nextStage.stage_key, values, layout, ruleState);
      const allViolations = dedupeViolations([...bpfViolations, ...result.violations]);
      if (allViolations.length > 0) {
        onStageViolation?.({ stageKey: nextStage.stage_key, stageLabel: nextStage.name, violations: allViolations, missingFromForm: buildMissingFromForm(allViolations) });
        return;
      }
      setOpenPopupStageKey(null);
      onQualifyLead();
      return;
    }

    if (!isTransitionAllowed(processFlow, currentStageKey, nextStage.stage_key) && processFlow.transitions.length > 0) {
      onStageViolation?.({ stageKey: nextStage.stage_key, stageLabel: nextStage.name, violations: [{ field: stageField, label: 'Stage', reason: 'condition', message: `Transition to "${nextStage.name}" is not allowed.` }], missingFromForm: [] });
      return;
    }

    const result = validateStageAdvance(processFlow, currentStageKey, nextStage.stage_key, values, layout, ruleState);
    const allViolations = dedupeViolations([...bpfViolations, ...result.violations]);
    if (allViolations.length > 0) {
      onStageViolation?.({ stageKey: nextStage.stage_key, stageLabel: nextStage.name, violations: allViolations, missingFromForm: buildMissingFromForm(allViolations) });
      return;
    }

    resolveAndAdvance(currentStageKey, nextStage.stage_key, nextStage.name);
    setOpenPopupStageKey(nextStage.stage_key);
  };

  const handlePrevStage = () => {
    console.group('[BPF] handlePrevStage');
    console.log('isReadonly:', isReadonly);
    console.log('isTerminal:', isTerminal);
    console.log('isFinished:', isFinished, '(raw bpf_is_finished:', values['bpf_is_finished'], ')');
    console.log('currentStageKey:', currentStageKey);
    console.log('currentIdx:', currentIdx);
    console.log('displayStages:', displayStages.map(s => s.stage_key));
    console.log('openPopupStageKey:', openPopupStageKey);

    if (isReadonly || isTerminal) {
      console.warn('BLOCKED: isReadonly=' + isReadonly + ' isTerminal=' + isTerminal);
      console.groupEnd();
      return;
    }
    // When finished, the popup may be on the LAST stage while currentStageKey points to
    // the first stage (the record's stored value). Navigate relative to the popup's stage.
    const sourceKey = (isFinished && openPopupStageKey) ? openPopupStageKey : currentStageKey;
    const sourceIdx = displayStages.findIndex(s => s.stage_key === sourceKey);
    const navIdx = sourceIdx >= 0 ? sourceIdx : displayStages.length;
    console.log('sourceKey:', sourceKey, '| sourceIdx:', sourceIdx, '| navIdx:', navIdx);
    if (navIdx <= 0) {
      console.warn('BLOCKED: navIdx <= 0, already at first stage');
      console.groupEnd();
      return;
    }
    const prevStage = displayStages[navIdx - 1];
    if (!prevStage) {
      console.warn('BLOCKED: prevStage not found at index', navIdx - 1);
      console.groupEnd();
      return;
    }
    console.log('Navigating to prevStage:', prevStage.stage_key, prevStage.name);
    console.groupEnd();
    commitStageChange(sourceKey, prevStage.stage_key, false);
    setOpenPopupStageKey(prevStage.stage_key);
  };

  // Called when user clicks "Finish" on the final active stage
  const handleFinish = useCallback(() => {
    if (isReadonly) return;
    // Check stage popup required fields (same check as "Next Stage")
    const bpfViolations = buildStageFieldViolations();
    const result = validateStageAdvance(processFlow, currentStageKey, currentStageKey, values, layout, ruleState);
    const allViolations = dedupeViolations([...bpfViolations, ...result.violations]);
    if (allViolations.length > 0) {
      onStageViolation?.({ stageKey: currentStageKey, stageLabel: displayStages[currentIdx]?.name ?? 'Finish', violations: allViolations, missingFromForm: buildMissingFromForm(allViolations) });
      return;
    }
    setOpenPopupStageKey(null);
    setPopupAnchorRect(null);
    // commitStageChange with finished=true → onStageChangeAsync sets bpf_is_finished via DB
    commitStageChange(currentStageKey, currentStageKey, true);
  }, [isReadonly, processFlow, currentStageKey, values, layout, ruleState, onStageViolation, currentIdx, stageFields]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTerminalClick = (stageKey: string, stageType: string) => {
    if (isReadonly || isTerminal) return;
    if (stageKey === 'disqualified' && !!onDisqualifyLead) { setShowDisqualifyModal(true); return; }
    if (stageType === 'terminal_success' && onQualifyLead) {
      const qualifyStage = activeStages.find((s) => s.stage_category === 'qualification');
      const gateKey = qualifyStage?.stage_key ?? currentStageKey;
      const result = validateStageAdvance(processFlow, currentStageKey, gateKey || stageKey, values, layout, ruleState);
      if (!result.valid) {
        onStageViolation?.({ stageKey: gateKey || stageKey, stageLabel: qualifyStage?.name ?? 'Qualify', violations: result.violations, missingFromForm: buildMissingFromForm(result.violations) });
        return;
      }
      onQualifyLead();
      return;
    }
    const prev = currentStageKey;
    onChange(stageField, stageKey);
    onStageChangeAsync?.(prev, stageKey);
    const terminalStateCode = stageType === 'terminal_success' ? '2' : stageType === 'terminal_failure' ? '3' : null;
    if (terminalStateCode) { onChange('statecode', terminalStateCode); onChange('state_code', terminalStateCode); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  const timeLabel = formatTimeInStage(stageEnteredAt);

  // Cross-entity: check full (unfiltered) flow for a next stage on another entity
  const hasCrossEntityNextStage = useMemo(() => {
    if (isTerminal || !currentStageKey) return false;
    const rawActiveStages = processFlowRaw.activeStages;
    const rawIdx = rawActiveStages.findIndex((s) => s.stage_key === currentStageKey);
    if (rawIdx < 0 || rawIdx >= rawActiveStages.length - 1) return false;
    const nextRawStage = rawActiveStages[rawIdx + 1];
    const crossInfo = getCrossEntityInfo(processFlowRaw, nextRawStage.stage_key);
    return crossInfo.isCrossEntity;
  }, [processFlowRaw, currentStageKey, isTerminal]);

  // hasNextStage: only true when the next stage is on the SAME entity.
  // Cross-entity next stages do not count — the current entity's flow ends here (Finish/Qualify).
  const effectiveIdx = runtimeIdx >= 0 ? runtimeIdx : currentIdx;
  const effectiveLength = runtimeIdx >= 0 ? activeStages.length : displayStages.length;
  const hasSameEntityNextStage = !isTerminal && !isFinished && currentIdx >= 0 && effectiveIdx < effectiveLength - 1;
  const hasNextStage = hasSameEntityNextStage;
  const isFinalActiveStage = !isTerminal && !isFinished && !hasNextStage && currentIdx >= 0;
  const canGoNext = !isReadonly && hasNextStage;
  // Allow going back even when finished — stages are never permanently locked
  const canGoPrev = !isReadonly && !isTerminal && (isFinished ? currentIdx >= 0 : currentIdx > 0);

  // Separate active (track) stages from terminal stages
  const trackStages = pipelineStages.filter((s) => s.stage_type === 'active');
  const terminalStagesList = pipelineStages.filter((s) => s.stage_type !== 'active');

  return (
    <div className="shrink-0 relative">
      {/* Main BPF bar */}
      <div className={`flex items-stretch h-[58px] border-b transition-colors duration-500 ${isFinished ? 'bg-emerald-50 border-emerald-200' : 'bg-[#f7f9fc] border-[#e2e5ea]'}`}>

        {/* Left: Dark gradient label panel */}
        <div
          className="shrink-0 flex items-center gap-3 px-5 min-w-[200px] relative"
          style={{
            background: isFinished
              ? 'linear-gradient(135deg, #064e3b, #059669)'
              : 'linear-gradient(135deg, #0b2f5e, #1a4d8c)',
            clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)',
            paddingRight: '2rem',
            transition: 'background 0.5s ease',
          }}
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white truncate leading-tight">{processFlow.flow.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {isFinished && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-200 font-medium">
                  <Check size={9} className="text-emerald-300" />
                  Completed
                </span>
              )}
              {!isFinished && timeLabel && !isTerminal && (
                <span className="flex items-center gap-1 text-[10px] text-blue-200">
                  <Clock size={9} className="text-blue-300" />
                  {timeLabel} in stage
                </span>
              )}
              {!isFinished && isTerminal && (
                <span className="text-[10px] text-blue-200 font-medium">
                  {isSuccessTerminal ? 'Completed' : isFailureTerminal ? 'Disqualified' : 'Closed'}
                </span>
              )}
              {!isFinished && !timeLabel && !isTerminal && (
                <span className="text-[10px] text-blue-200">Active</span>
              )}
            </div>
          </div>
          {!isReadonly && !isTerminal && allowFlowSwitch && onSwitchFlow && availableFlows.length > 1 && (
            <button onClick={() => setShowSwitchModal(true)} title="Switch process flow"
              className="ml-auto shrink-0 w-6 h-6 flex items-center justify-center rounded text-blue-200 hover:text-white hover:bg-white/10 transition"
            >
              <ArrowLeftRight size={11} />
            </button>
          )}
        </div>

        {/* Center: Stages track */}
        <div className="flex-1 flex items-center px-6 gap-0 min-w-0 relative">
          {/* Previous stage arrow — hidden on first stage and terminal stages */}
          {!isTerminal && !isReadonly && (currentIdx >= 0 ? currentIdx > 0 : displayStages.length > 0) && (
            <button
              type="button"
              onClick={handlePrevStage}
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center border transition mr-3 border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
            >
              <ChevronLeft size={14} strokeWidth={2} />
            </button>
          )}
          {(isTerminal || isReadonly || (currentIdx >= 0 ? currentIdx === 0 : displayStages.length === 0)) && (
            <div className="shrink-0 w-7 h-7 mr-3" />
          )}

          {/* Track container */}
          <div className="flex-1 relative flex items-center min-w-0">
            {/* Background track line */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-[#e2e5ea] rounded-full" />
            {/* Progress fill line */}
            {trackStages.length > 1 && (
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] rounded-full transition-all duration-500"
                style={{
                  background: isFinished
                    ? 'linear-gradient(90deg, #059669, #34d399)'
                    : 'linear-gradient(90deg, #1a64b6, #2d8cf0)',
                  width: isFinished ? '100%' : `${Math.max(0, Math.min(100, (currentIdx / (trackStages.length - 1)) * 100))}%`,
                }}
              />
            )}

            {/* Stage badges */}
            <div className="relative flex items-center justify-between w-full z-10">
              {trackStages.map((stage, idx) => {
                const trackIdx = displayStages.findIndex((s) => s.stage_key === stage.stage_key);
                // When finished, every stage is shown as completed/past
                const isPast = isFinished
                  ? true
                  : (currentIdx > 0 && trackIdx >= 0 && trackIdx < currentIdx);
                const isCurrent = !isFinished && stage.stage_key === currentStageKey;
                const isPopupOpen = openPopupStageKey === stage.stage_key;

                const badgeColor = isFinished
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : isPast
                  ? 'bg-[#1a64b6] text-white shadow-sm'
                  : isCurrent
                  ? 'bg-[#1a64b6] text-white shadow-md ring-4 ring-blue-100'
                  : 'bg-[#f3f5f8] text-slate-400 border border-[#d0d5de]';

                const labelColor = isFinished
                  ? 'text-emerald-700 font-semibold'
                  : isPast
                  ? 'text-[#1a64b6]'
                  : isCurrent
                  ? 'text-[#1a64b6] font-semibold'
                  : 'text-slate-400';

                return (
                  <div key={stage.stage_key} className="flex flex-col items-center relative group" style={{ flex: '1 1 0%' }}>
                    <button
                      type="button"
                      onClick={(e) => handleStageClick(stage.stage_key, e)}
                      className={`relative w-[26px] h-[26px] rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300 ${badgeColor} ${isPopupOpen ? 'scale-110' : 'hover:scale-105'}`}
                    >
                      {(isPast || isFinished) ? (
                        <Check size={12} strokeWidth={3} />
                      ) : isCurrent ? (
                        <>
                          <span>{idx + 1}</span>
                          <span className="absolute inset-0 rounded-full animate-bpf-pulse" />
                        </>
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </button>
                    <span className={`mt-1 text-[10px] font-medium leading-tight text-center max-w-[80px] truncate ${labelColor}`}>
                      {stage.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Next stage arrow — always visible, disabled on final/terminal/readonly */}
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => { if (canGoNext) handleNextStageFromPopup(); }}
            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center border transition ml-3 ${
              canGoNext
                ? 'border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer'
                : 'border-slate-200 text-slate-300 cursor-not-allowed opacity-40'
            }`}
          >
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Right: Terminal stages + badges */}
        {terminalStagesList.length > 0 && (
          <div className="shrink-0 flex items-center gap-2 px-4 border-l border-[#e2e5ea]">
            {terminalStagesList.map((stage) => {
              const isSuccess = stage.stage_type === 'terminal_success';
              const isActive = stage.stage_key === currentStageKey;
              return (
                <button
                  key={stage.stage_key}
                  type="button"
                  onClick={() => handleTerminalClick(stage.stage_key, stage.stage_type)}
                  disabled={isTerminal && stage.stage_key !== currentStageKey}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition border ${
                    isActive
                      ? isSuccess
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-red-50 border-red-300 text-red-700'
                      : isSuccess
                      ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300'
                      : 'border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300'
                  } ${(isTerminal && stage.stage_key !== currentStageKey) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {isSuccess ? <Trophy size={11} /> : <XCircle size={11} />}
                  {stage.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Cross-entity / branching indicators */}
        {(displayStages.some((s) => getCrossEntityInfo(processFlow, s.stage_key).isCrossEntity) || processFlow.transitions.some((t) => (t.conditions ?? []).length > 0)) && (
          <div className="shrink-0 flex items-center gap-2 px-3 border-l border-[#e2e5ea]">
            {displayStages.some((s) => getCrossEntityInfo(processFlow, s.stage_key).isCrossEntity) && (
              <span className="flex items-center gap-1 text-[9px] text-teal-600 font-medium"><Link2 size={9} /></span>
            )}
            {processFlow.transitions.some((t) => (t.conditions ?? []).length > 0) && (
              <span className="flex items-center gap-1 text-[9px] text-orange-500 font-medium"><GitBranch size={9} /></span>
            )}
          </div>
        )}
      </div>

      {/* Stage popup flyout */}
      {openPopupStageKey && (() => {
        const popupStage = processFlow.stageByKey.get(openPopupStageKey);
        if (!popupStage || popupStage.stage_type !== 'active') return null;
        // Use displayStages index for correct past/current detection
        const popupIdx = displayStages.findIndex((s) => s.stage_key === openPopupStageKey);
        const popupIsCurrent = isFinished ? true : (openPopupStageKey === currentStageKey);
        const popupIsPast = !isFinished && !popupIsCurrent && popupIdx >= 0 && popupIdx < currentIdx;
        const popupIsFirst = popupIdx === 0;
        const popupIsLast = popupIdx === displayStages.length - 1;
        // "Completed" badge: only on the last stage when flow is finished
        const popupShowCompleted = isFinished && popupIsLast;
        // "Finish" button: only on last active stage, not finished
        const popupIsFinalActive = !isTerminal && !isFinished && popupIsLast && popupIsCurrent;
        return (
          <StagePopup
            stage={popupStage}
            stageFields={popupFieldDefs}
            values={values}
            onChange={onChange}
            onNextStage={handleNextStageFromPopup}
            onPrevStage={handlePrevStage}
            onFinish={popupIsFinalActive ? handleFinish : undefined}
            isQualifyFlow={!!onQualifyLead}
            onClose={() => { setOpenPopupStageKey(null); setPopupAnchorRect(null); }}
            isCurrentStage={popupIsCurrent}
            isPast={popupIsPast}
            isFinished={popupShowCompleted}
            isReadonly={isReadonly}
            canGoNext={canGoNext}
            canGoPrev={!popupIsFirst}
            isFinalActiveStage={popupIsFinalActive}
            lookupLabels={lookupLabels}
            onFieldNavigate={onFieldNavigate}
            anchorRect={popupAnchorRect}
          />
        );
      })()}

      {/* Modals */}
      {showDisqualifyModal && entityDefId && (
        <DisqualifyReasonModal
          entityDefinitionId={entityDefId}
          onConfirm={({ reason, statusReasonValue }) => { setShowDisqualifyModal(false); onDisqualifyLead?.(reason, statusReasonValue); }}
          onCancel={() => setShowDisqualifyModal(false)}
        />
      )}
      {showSwitchModal && (
        <SwitchProcessModal
          availableFlows={availableFlows}
          currentFlowId={processFlow.flow.process_flow_id}
          onConfirm={(flowId) => { setShowSwitchModal(false); onSwitchFlow?.(flowId); }}
          onCancel={() => setShowSwitchModal(false)}
        />
      )}
      {crossEntityPrompt && (
        <CrossEntityAdvanceModal
          info={crossEntityPrompt}
          onConfirm={() => { const { fromStageKey, toStageKey } = crossEntityPrompt; setCrossEntityPrompt(null); commitStageChange(fromStageKey, toStageKey); onCrossEntityAdvance?.(crossEntityPrompt); }}
          onCancel={() => setCrossEntityPrompt(null)}
        />
      )}
    </div>
  );
}
