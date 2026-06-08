import { useState, useEffect } from 'react';
import {
  X, Sparkles, Loader2, AlertCircle, ChevronDown,
  Eye, EyeOff, Lock, Unlock, ShieldCheck,
  Zap, ArrowRight, Pencil, CheckCircle2, Lightbulb,
  Play, XCircle, MessageSquare, Eraser, Settings2,
} from 'lucide-react';
import type { EntityDefinition } from '../../types/entity';
import type { FieldDefinition } from '../../types/field';
import type { BusinessRule } from '../../types/businessRule';
import { ACTION_META, COND_OPERATOR_LABELS } from '../../types/businessRule';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { createRule, saveRule } from '../../services/businessRuleService';
import { parseRulePrompt, isParseError } from './aiRuleParser';
import type { ParsedRule } from './aiRuleParser';

interface AiRuleCreatorModalProps {
  entities: EntityDefinition[];
  defaultEntityId: string;
  lockEntity?: boolean;
  onCreated: (rule: BusinessRule) => void;
  onEditBeforeCreate: (rule: BusinessRule) => void;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  'If Lead Source equals Event, show Event column and make it mandatory, else hide it and make it not mandatory.',
  'If Account is empty, show notification "Account is required".',
  'If Opportunity Status equals Won, lock Estimated Revenue.',
  'If Product equals MontyPay, show Payment Gateway section.',
];

function ActionIcon({ type, value }: { type: string; value?: string | boolean }) {
  switch (type) {
    case 'set_visibility':
      return value === true || value === 'true' ? <Eye size={12} className="text-emerald-600" /> : <EyeOff size={12} className="text-slate-400" />;
    case 'lock_unlock':
      return value === true || value === 'true' ? <Lock size={12} className="text-amber-600" /> : <Unlock size={12} className="text-emerald-600" />;
    case 'set_business_required':
      return <ShieldCheck size={12} className="text-rose-600" />;
    case 'set_field_value':
      return <Settings2 size={12} className="text-blue-600" />;
    case 'clear_field_value':
      return <Eraser size={12} className="text-slate-500" />;
    case 'show_error_message':
      return <MessageSquare size={12} className="text-red-600" />;
    default:
      return <Zap size={12} className="text-slate-500" />;
  }
}

function describeAction(a: { action_type: string; target_field_display_name?: string; target_field?: string; value?: string | boolean; required_level?: string; message?: string }): string {
  const field = a.target_field_display_name ?? a.target_field ?? '';
  switch (a.action_type) {
    case 'set_visibility':
      return a.value === true || a.value === 'true' ? `Show "${field}"` : `Hide "${field}"`;
    case 'lock_unlock':
      return a.value === true || a.value === 'true' ? `Lock "${field}"` : `Unlock "${field}"`;
    case 'set_business_required':
      if (a.required_level === 'required') return `Make "${field}" mandatory`;
      if (a.required_level === 'recommended') return `Make "${field}" recommended`;
      return `Make "${field}" optional`;
    case 'set_field_value':
      return `Set "${field}" to "${a.value}"`;
    case 'clear_field_value':
      return `Clear "${field}"`;
    case 'show_error_message':
      return `Show notification: "${a.message}"`;
    default: {
      const meta = ACTION_META[a.action_type as keyof typeof ACTION_META];
      return meta ? `${meta.label}: ${field}` : `${a.action_type}: ${field}`;
    }
  }
}

export default function AiRuleCreatorModal({
  entities,
  defaultEntityId,
  lockEntity,
  onCreated,
  onEditBeforeCreate,
  onClose,
}: AiRuleCreatorModalProps) {
  const [entityId, setEntityId] = useState(defaultEntityId);
  const [prompt, setPrompt] = useState('');
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [parsed, setParsed] = useState<ParsedRule | null>(null);
  const [step, setStep] = useState<'input' | 'preview'>('input');

  useEffect(() => {
    if (!entityId) return;
    setFieldsLoading(true);
    fetchFieldsForEntity(entityId)
      .then(setFields)
      .catch(() => setFields([]))
      .finally(() => setFieldsLoading(false));
  }, [entityId]);

  const selectedEntity = entities.find((e) => e.entity_definition_id === entityId);

  const handleGenerate = () => {
    if (!prompt.trim() || fields.length === 0) return;
    setGenerating(true);
    setError(null);
    setSuggestions([]);

    setTimeout(() => {
      const result = parseRulePrompt(prompt.trim(), fields);
      setGenerating(false);

      if (isParseError(result)) {
        setError(result.message);
        setSuggestions(result.suggestions);
        return;
      }

      setParsed(result);
      setStep('preview');
    }, 400);
  };

  const handleCreate = async () => {
    if (!parsed || !entityId) return;
    setSaving(true);
    setError(null);
    try {
      const rule = await createRule({
        entity_definition_id: entityId,
        name: parsed.name,
        description: parsed.description,
      });
      const saved = await saveRule(rule.business_rule_id, {
        trigger_json: parsed.trigger,
        action_json: parsed.actions,
        scope: parsed.scope,
        is_active: true,
      });
      onCreated(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create rule');
    } finally {
      setSaving(false);
    }
  };

  const handleEditBeforeCreate = async () => {
    if (!parsed || !entityId) return;
    setSaving(true);
    setError(null);
    try {
      const rule = await createRule({
        entity_definition_id: entityId,
        name: parsed.name,
        description: parsed.description,
      });
      const saved = await saveRule(rule.business_rule_id, {
        trigger_json: parsed.trigger,
        action_json: parsed.actions,
        scope: parsed.scope,
        is_active: false,
      });
      onEditBeforeCreate(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create rule');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setStep('input');
    setParsed(null);
    setError(null);
  };

  const conditions = parsed?.trigger.condition_group?.conditions ?? [];
  const ifActions = parsed?.actions.if_actions ?? [];
  const elseActions = parsed?.actions.else_actions ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-sm">
              <Sparkles size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-slate-800">
                {step === 'input' ? 'Create Rule with AI' : 'Rule Preview'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {step === 'input' ? 'Describe your business rule in plain English' : 'Review the generated rule before saving'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'input' ? (
            <div className="space-y-4">
              {/* Entity selector */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">Entity</label>
                {lockEntity ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-[13px] border border-slate-200 rounded-lg bg-slate-50 text-slate-700">
                    <Lock size={11} className="text-slate-400" />
                    {selectedEntity?.display_name ?? ''}
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={entityId}
                      onChange={(e) => setEntityId(e.target.value)}
                      className="w-full appearance-none pl-3 pr-8 py-2 text-[13px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700"
                    >
                      {entities.map((e) => (
                        <option key={e.entity_definition_id} value={e.entity_definition_id}>{e.display_name}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Prompt input */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">Describe Your Rule</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. If Lead Source equals Event, show the Event column and make it mandatory. Else hide the Event column and make it not mandatory."
                  rows={4}
                  className="w-full px-3 py-2.5 text-[13px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400 resize-none leading-relaxed"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate();
                  }}
                />
                <p className="text-[10px] text-slate-400 mt-1">Press Ctrl+Enter to generate</p>
              </div>

              {/* Example prompts */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb size={11} className="text-amber-500" />
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Example Prompts</span>
                </div>
                <div className="space-y-1.5">
                  {EXAMPLE_PROMPTS.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(ex)}
                      className="w-full text-left px-3 py-2 text-[11px] text-slate-600 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-100 hover:border-blue-200 rounded-lg transition-all leading-relaxed"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[12px] text-red-700">{error}</p>
                      {suggestions.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {suggestions.map((s, i) => (
                            <p key={i} className="text-[11px] text-red-600/70">{s}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {fieldsLoading && (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Loader2 size={12} className="animate-spin" />
                  Loading entity fields...
                </div>
              )}
            </div>
          ) : parsed ? (
            <div className="space-y-4">
              {/* Rule name */}
              <div className="bg-gradient-to-r from-slate-50 to-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={12} className="text-blue-600" />
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Rule Name</span>
                </div>
                <p className="text-[14px] font-semibold text-slate-800">{parsed.name}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                    {selectedEntity?.display_name}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                    All Forms
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium">
                    On Change
                  </span>
                </div>
              </div>

              {/* Watch Fields */}
              {parsed.trigger.watch_fields.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Play size={10} className="text-slate-400" />
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Trigger Fields</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.trigger.watch_fields.map((wf) => {
                      const fd = fields.find((f) => f.logical_name === wf);
                      return (
                        <span key={wf} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 bg-slate-100 text-slate-700 rounded-md border border-slate-200 font-medium">
                          {fd?.display_name ?? wf}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Conditions */}
              {conditions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 uppercase tracking-wider">IF</span>
                  </div>
                  <div className="space-y-1.5">
                    {conditions.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 px-3 py-2 bg-blue-50/50 border border-blue-100 rounded-lg text-[12px]">
                        <span className="font-medium text-slate-800">{c.field_display_name}</span>
                        <span className="text-blue-600 font-medium">{COND_OPERATOR_LABELS[c.operator] ?? c.operator}</span>
                        {c.value != null && c.value !== '' && (
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700 font-medium">{String(c.value)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* IF Actions */}
              {ifActions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <ArrowRight size={10} className="text-emerald-500" />
                    <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Then (If True)</span>
                  </div>
                  <div className="space-y-1.5">
                    {ifActions.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-emerald-50/50 border border-emerald-100 rounded-lg text-[12px]">
                        <ActionIcon type={a.action_type} value={a.value} />
                        <span className="text-slate-700">{describeAction(a)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ELSE Actions */}
              {elseActions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <XCircle size={10} className="text-slate-400" />
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Else (If False)</span>
                  </div>
                  <div className="space-y-1.5">
                    {elseActions.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[12px]">
                        <ActionIcon type={a.action_type} value={a.value} />
                        <span className="text-slate-600">{describeAction(a)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {parsed.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-1">Warnings</p>
                  {parsed.warnings.map((w, i) => (
                    <p key={i} className="text-[11px] text-amber-700 leading-relaxed">{w}</p>
                  ))}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-[12px] text-red-700">{error}</p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          {step === 'input' ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-[12px] text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || fieldsLoading || generating || !entityId}
                className="flex items-center gap-2 px-5 py-2 text-[12px] font-semibold bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} />
                )}
                {generating ? 'Generating...' : 'Generate Rule'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleBack}
                disabled={saving}
                className="px-4 py-2 text-[12px] text-slate-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
              >
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleEditBeforeCreate}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
                >
                  <Pencil size={11} />
                  Edit Before Create
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2 text-[12px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  {saving ? 'Creating...' : 'Create Rule'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
