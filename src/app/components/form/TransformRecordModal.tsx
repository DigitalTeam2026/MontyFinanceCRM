import { useState, useEffect } from 'react';
import { X, Loader2, Zap, CheckCircle2, AlertCircle, ChevronRight, Ban, Lock } from 'lucide-react';
import type {
  RecordTransformationRule,
  RecordTransformationTarget,
  RecordTransformationFieldMapping,
  TransformationTargetEntity,
} from '../../../types/recordTransformation';
import { TARGET_ENTITY_META, CREATION_MODE_META } from '../../../types/recordTransformation';
import {
  fetchTransformationRuleWithDetails,
  fetchInstancesForSourceRecord,
} from '../../../services/recordTransformationService';
import {
  buildTransformationPreview,
  executeTransformation,
} from '../../services/recordTransformationEngine';
import type { TransformationPreview, TransformationPreviewTarget } from '../../services/recordTransformationEngine';
import type { RecordData } from '../../services/recordService';
import type { RecordTransformationInstance } from '../../../types/recordTransformation';

interface Props {
  rule: RecordTransformationRule;
  sourceRecordId: string;
  sourceEntity: string;
  sourceValues: RecordData;
  userId: string;
  onSuccess: (result: { createdIds: Partial<Record<TransformationTargetEntity, string>> }) => void;
  onCancel: () => void;
}

type Step = 'loading' | 'preview' | 'executing' | 'done' | 'error';

function isTargetBlocked(
  t: TransformationPreviewTarget,
  existingInstances: RecordTransformationInstance[]
): { blocked: boolean; message: string | null } {
  if (t.creation_mode === 'never') return { blocked: false, message: null };

  const completedForTarget = existingInstances.filter(
    i => i.target_entity === t.target_entity && i.status === 'completed'
  );
  const count = completedForTarget.length;
  const max = t.max_instances_per_source;

  if (max > 0 && count >= max) {
    return {
      blocked: true,
      message: t.blocked_message || `Maximum of ${max} instance${max !== 1 ? 's' : ''} already created`,
    };
  }

  return { blocked: false, message: null };
}

function isTargetVisible(
  t: TransformationPreviewTarget,
  existingInstances: RecordTransformationInstance[]
): boolean {
  const visibility = t.action_visibility;
  if (visibility === 'never') return false;
  if (visibility === 'always') return true;

  const hasCompleted = existingInstances.some(
    i => i.target_entity === t.target_entity && i.status === 'completed'
  );

  if (visibility === 'when_not_created') return !hasCompleted;
  if (visibility === 'when_created') return hasCompleted;
  return true;
}

function isPrerequisiteMissing(
  t: TransformationPreviewTarget,
  selections: Record<TransformationTargetEntity, boolean>
): boolean {
  if (!t.requires_target_entity) return false;
  return selections[t.requires_target_entity as TransformationTargetEntity] === false;
}

export default function TransformRecordModal({
  rule,
  sourceRecordId,
  sourceEntity,
  sourceValues,
  userId,
  onSuccess,
  onCancel,
}: Props) {
  const [step, setStep] = useState<Step>('loading');
  const [preview, setPreview] = useState<TransformationPreview | null>(null);
  const [ruleWithDetails, setRuleWithDetails] = useState<RecordTransformationRule & {
    targets: RecordTransformationTarget[];
    mappings: RecordTransformationFieldMapping[];
  } | null>(null);
  const [existingInstances, setExistingInstances] = useState<RecordTransformationInstance[]>([]);
  const [selections, setSelections] = useState<Record<TransformationTargetEntity, boolean>>({} as Record<TransformationTargetEntity, boolean>);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ createdIds: Partial<Record<TransformationTargetEntity, string>> } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [details, instances] = await Promise.all([
          fetchTransformationRuleWithDetails(rule.record_transformation_rule_id) as Promise<RecordTransformationRule & {
            targets: RecordTransformationTarget[];
            mappings: RecordTransformationFieldMapping[];
          }>,
          fetchInstancesForSourceRecord(sourceRecordId, rule.record_transformation_rule_id),
        ]);

        setRuleWithDetails(details);
        setExistingInstances(instances);

        const prev = await buildTransformationPreview(details, sourceValues);
        setPreview(prev);

        const defaultSelections: Record<TransformationTargetEntity, boolean> = {} as Record<TransformationTargetEntity, boolean>;
        for (const t of details.targets ?? []) {
          defaultSelections[t.target_entity] = t.creation_mode !== 'never';
        }
        setSelections(defaultSelections);
        setStep('preview');
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Failed to load preview');
        setStep('error');
      }
    })();
  }, [rule.record_transformation_rule_id, sourceRecordId, sourceValues]);

  const toggleSelection = (entity: TransformationTargetEntity) => {
    setSelections(prev => {
      const next = { ...prev, [entity]: !prev[entity] };
      if (!next[entity] && preview) {
        for (const t of preview.targets) {
          if (t.requires_target_entity === entity) {
            next[t.target_entity] = false;
          }
        }
      }
      return next;
    });
  };

  const handleExecute = async () => {
    if (!preview || !ruleWithDetails) return;
    setStep('executing');
    try {
      const execResult = await executeTransformation(
        {
          ruleId: rule.record_transformation_rule_id,
          sourceRecordId,
          sourceEntity,
          sourceValues,
          userId,
          targetSelections: selections,
        },
        ruleWithDetails
      );
      setResult(execResult);
      setStep('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Execution failed');
      setStep('error');
    }
  };

  const handleDone = () => {
    if (result) onSuccess(result);
    else onCancel();
  };

  const visibleTargets = preview?.targets.filter(t => isTargetVisible(t, existingInstances)) ?? [];
  const allBlocked = visibleTargets.length > 0 && visibleTargets.every(t => {
    const { blocked } = isTargetBlocked(t, existingInstances);
    const prereqMissing = isPrerequisiteMissing(t, selections);
    return blocked || t.creation_mode === 'never' || prereqMissing;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <Zap size={16} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-800">{rule.button_label || rule.name}</h2>
            <p className="text-xs text-slate-500">{rule.description || 'Review and confirm what will be created'}</p>
          </div>
          <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6">
          {step === 'loading' && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="text-blue-500 animate-spin" />
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle size={32} className="text-red-400" />
              <div>
                <p className="text-sm font-medium text-slate-800">Something went wrong</p>
                <p className="text-xs text-slate-500 mt-1">{errorMsg}</p>
              </div>
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-3">
              {allBlocked && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-2">
                  <Ban size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">All available targets have reached their maximum instance limit for this record.</p>
                </div>
              )}

              {!allBlocked && (
                <p className="text-xs text-slate-500 mb-4">
                  The following records will be created. Deselect optional targets to skip them.
                </p>
              )}

              {visibleTargets.map(t => {
                const meta = TARGET_ENTITY_META[t.target_entity];
                const modeMeta = CREATION_MODE_META[t.creation_mode];
                const isOptional = t.creation_mode === 'optional';
                const isAlways = t.creation_mode === 'always';
                const isNever = t.creation_mode === 'never';
                const selected = selections[t.target_entity] !== false;
                const hasMissing = t.missingRequired.length > 0;
                const { blocked, message: blockedMsg } = isTargetBlocked(t, existingInstances);
                const prereqMissing = isPrerequisiteMissing(t, selections);
                const prereqName = t.requires_target_entity
                  ? TARGET_ENTITY_META[t.requires_target_entity as TransformationTargetEntity]?.singularLabel ?? t.requires_target_entity
                  : null;

                const isDisabled = blocked || prereqMissing;

                return (
                  <div
                    key={t.target_entity}
                    className={`border rounded-xl p-4 transition-all ${
                      isNever || isDisabled
                        ? 'border-slate-100 bg-slate-50 opacity-60'
                        : selected
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-slate-200 bg-white opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isDisabled ? (
                        <div className="w-4 h-4 rounded flex items-center justify-center bg-slate-200">
                          {blocked ? <Ban size={10} className="text-slate-400" /> : <Lock size={10} className="text-slate-400" />}
                        </div>
                      ) : isOptional ? (
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelection(t.target_entity)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      ) : (
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center"
                          style={{ background: isNever ? '#e5e7eb' : modeMeta.bg }}
                        >
                          {isAlways && <CheckCircle2 size={10} style={{ color: modeMeta.color }} />}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{meta.singularLabel}</span>
                          {!isDisabled && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                              style={{ color: modeMeta.color, background: modeMeta.bg }}
                            >
                              {modeMeta.label}
                            </span>
                          )}
                          {blocked && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500">
                              Limit reached
                            </span>
                          )}
                          {prereqMissing && !blocked && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-600">
                              Requires {prereqName}
                            </span>
                          )}
                        </div>

                        {blocked && blockedMsg && (
                          <p className="text-xs text-slate-500 mt-1">{blockedMsg}</p>
                        )}

                        {prereqMissing && !blocked && prereqName && (
                          <p className="text-xs text-slate-500 mt-1">
                            {prereqName} must be selected and created first
                          </p>
                        )}

                        {!isNever && !isDisabled && selected && Object.keys(t.previewValues).length > 0 && (
                          <div className="mt-2 space-y-0.5">
                            {Object.entries(t.previewValues).slice(0, 4).map(([k, v]) => (
                              v != null && String(v).trim() !== '' ? (
                                <div key={k} className="flex items-center gap-2 text-xs">
                                  <span className="text-slate-400 font-mono min-w-[80px]">{k}</span>
                                  <ChevronRight size={10} className="text-slate-300 shrink-0" />
                                  <span className="text-slate-600 truncate">{String(v)}</span>
                                </div>
                              ) : null
                            ))}
                          </div>
                        )}

                        {hasMissing && selected && !isDisabled && (
                          <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-600">
                            <AlertCircle size={11} className="mt-0.5 shrink-0" />
                            <span>Missing required: {t.missingRequired.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {visibleTargets.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-500">No actions available for this record.</p>
                </div>
              )}
            </div>
          )}

          {step === 'executing' && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 size={28} className="text-blue-500 animate-spin" />
              <p className="text-sm text-slate-600">Creating records...</p>
            </div>
          )}

          {step === 'done' && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <CheckCircle2 size={16} />
                <span className="text-sm font-medium">Records created successfully</span>
              </div>
              {Object.entries(result.createdIds).map(([entity, id]) => (
                id ? (
                  <div key={entity} className="flex items-center gap-2 text-xs text-slate-600 px-2">
                    <CheckCircle2 size={12} className="text-emerald-500" />
                    <span className="capitalize font-medium">{TARGET_ENTITY_META[entity as TransformationTargetEntity]?.singularLabel ?? entity}</span>
                    <span className="text-slate-400 font-mono">{id.slice(0, 8)}…</span>
                  </div>
                ) : null
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
          {(step === 'preview' || step === 'error') && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
          )}

          {step === 'preview' && preview && !allBlocked && visibleTargets.length > 0 && (
            <button
              onClick={handleExecute}
              disabled={visibleTargets.every(t => {
                const { blocked } = isTargetBlocked(t, existingInstances);
                return blocked || t.creation_mode === 'never' || isPrerequisiteMissing(t, selections) || selections[t.target_entity] === false;
              })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Zap size={13} />
              {rule.button_label || 'Execute'}
            </button>
          )}

          {step === 'done' && (
            <button
              onClick={handleDone}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
