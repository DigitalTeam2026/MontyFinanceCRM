import { useState, useMemo } from 'react';
import {
  Play, AlertCircle, AlertTriangle, Info, CheckCircle2, Eye, EyeOff,
  Lock, RefreshCw, Lightbulb, GitBranch, ChevronDown, ChevronRight,
} from 'lucide-react';
import type { BusinessRule } from '../../types/businessRule';
import type { FieldDefinition } from '../../types/field';
import type { ProcessFlow, ProcessStage } from '../../types/processFlow';
import { STAGE_CATEGORY_OPTIONS } from '../../types/businessRule';
import { evaluateRules, applyRuleStateToValues, getRuleMessages } from '../../app/services/businessRulesEngine';
import type { ProcessRuleContext } from '../../app/services/businessRulesEngine';
import type { RecordData } from '../../app/services/businessRulesEngine';

interface RulePreviewPanelProps {
  rule: BusinessRule;
  fields: FieldDefinition[];
  processFlows?: ProcessFlow[];
  loadFlowStages?: (flowId: string) => Promise<ProcessStage[]>;
}

const INITIAL_VALUES: RecordData = {};

export default function RulePreviewPanel({
  rule,
  fields,
  processFlows = [],
  loadFlowStages,
}: RulePreviewPanelProps) {
  const [testValues, setTestValues] = useState<RecordData>(INITIAL_VALUES);
  const [processContextOpen, setProcessContextOpen] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [flowStages, setFlowStages] = useState<ProcessStage[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);

  const processContext: ProcessRuleContext | undefined = useMemo(() => {
    if (!selectedFlowId) return undefined;
    const flow = processFlows.find((f) => f.process_flow_id === selectedFlowId) ?? null;
    const stage = flowStages.find((s) => s.process_stage_id === selectedStageId) ?? null;
    return {
      processFlowId:    flow?.process_flow_id ?? null,
      processFlowName:  flow?.name ?? null,
      currentStageId:   stage?.process_stage_id ?? null,
      currentStageName: stage?.name ?? null,
      stageCategory:    stage?.stage_category ?? null,
    };
  }, [selectedFlowId, selectedStageId, processFlows, flowStages]);

  const ruleState = useMemo(
    () => evaluateRules([rule], testValues, undefined, processContext),
    [rule, testValues, processContext],
  );

  const patchedValues = useMemo(() => {
    const patch = applyRuleStateToValues(ruleState, testValues);
    return patch ?? testValues;
  }, [ruleState, testValues]);

  const messages = getRuleMessages(ruleState);
  const activeFields = fields.filter((f) => f.is_active);

  const handleValueChange = (logicalName: string, val: string) => {
    setTestValues((prev) => ({ ...prev, [logicalName]: val || null }));
  };

  const handleFlowChange = async (flowId: string) => {
    setSelectedFlowId(flowId);
    setSelectedStageId('');
    setFlowStages([]);
    if (flowId && loadFlowStages) {
      setLoadingStages(true);
      const stages = await loadFlowStages(flowId).catch(() => [] as ProcessStage[]);
      setFlowStages(stages);
      setLoadingStages(false);
    }
  };

  const reset = () => {
    setTestValues(INITIAL_VALUES);
    setSelectedFlowId('');
    setSelectedStageId('');
    setFlowStages([]);
  };

  const hasConditions = !!(
    rule.trigger_json?.condition_group?.conditions?.length ||
    rule.trigger_json?.condition_group?.groups?.length
  );

  const conditionMet = hasConditions
    ? (() => {
        const state = evaluateRules([rule], testValues, undefined, processContext);
        return (
          state.blockSave ||
          state.recommendations.length > 0 ||
          Object.values(state.fields).some(
            (fs) =>
              fs.isHidden || fs.isReadonly || fs.isRequired ||
              fs.forcedValue !== undefined || fs.clearValue ||
              fs.message !== null || fs.filteredOptions !== null,
          )
        );
      })()
    : true;

  const selectedStage = flowStages.find((s) => s.process_stage_id === selectedStageId);
  const stageCategoryLabel = selectedStage
    ? (STAGE_CATEGORY_OPTIONS.find((c) => c.value === selectedStage.stage_category)?.label ?? selectedStage.stage_category)
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Rule Preview</h2>
          <p className="text-xs text-slate-400 mt-0.5">Set test values below to see how this rule behaves at runtime.</p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:border-slate-300 hover:text-slate-700 transition-colors bg-white"
        >
          <RefreshCw size={11} />
          Reset
        </button>
      </div>

      {processFlows.length > 0 && (
        <div className="border border-teal-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setProcessContextOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-teal-50/40 hover:bg-teal-50/60 transition-colors text-left"
          >
            <GitBranch size={12} className="text-teal-500 shrink-0" />
            <span className="text-xs font-semibold text-teal-700 flex-1">Process Context</span>
            <span className="text-[10px] text-teal-500 mr-2">
              {selectedFlowId ? (processFlows.find((f) => f.process_flow_id === selectedFlowId)?.name ?? 'Selected') : 'None active'}
            </span>
            {processContextOpen
              ? <ChevronDown size={12} className="text-teal-400" />
              : <ChevronRight size={12} className="text-teal-400" />}
          </button>

          {processContextOpen && (
            <div className="px-4 py-3 bg-white space-y-3">
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Process Flow conditions evaluate to <span className="font-semibold text-slate-600">false</span> when no process context is active.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Active Process Flow
                  </label>
                  <div className="relative">
                    <select
                      value={selectedFlowId}
                      onChange={(e) => handleFlowChange(e.target.value)}
                      className="w-full appearance-none text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400 pr-7"
                    >
                      <option value="">— None —</option>
                      {processFlows.map((f) => (
                        <option key={f.process_flow_id} value={f.process_flow_id}>{f.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Current Stage
                  </label>
                  <div className="relative">
                    {loadingStages ? (
                      <div className="text-[10px] text-slate-400 italic px-3 py-2">Loading stages...</div>
                    ) : (
                      <select
                        value={selectedStageId}
                        onChange={(e) => setSelectedStageId(e.target.value)}
                        disabled={!selectedFlowId || flowStages.length === 0}
                        className="w-full appearance-none text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400 pr-7 disabled:text-slate-300 disabled:bg-slate-50"
                      >
                        <option value="">— None —</option>
                        {flowStages.map((s) => (
                          <option key={s.process_stage_id} value={s.process_stage_id}>{s.name}</option>
                        ))}
                      </select>
                    )}
                    <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {selectedStage && (
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="font-semibold">Stage Category:</span>
                  <span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-medium">{stageCategoryLabel}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {activeFields.map((field) => {
          const fs = ruleState.fields[field.logical_name];
          const patchedVal = patchedValues[field.logical_name];
          const displayVal = patchedVal != null ? String(patchedVal) : '';

          return (
            <div key={field.field_definition_id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-600 flex-1 truncate">{field.display_name}</span>
                <div className="flex items-center gap-1">
                  {fs?.isHidden && (
                    <span className="flex items-center gap-0.5 text-[9px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                      <EyeOff size={8} /> Hidden
                    </span>
                  )}
                  {fs?.isReadonly && !fs?.isHidden && (
                    <span className="flex items-center gap-0.5 text-[9px] font-semibold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">
                      <Lock size={8} /> Locked
                    </span>
                  )}
                  {fs?.isRequired && (
                    <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Required</span>
                  )}
                  {fs?.filteredOptions && (
                    <span className="text-[9px] font-semibold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full">Filtered</span>
                  )}
                </div>
              </div>

              <input
                type="text"
                value={String(testValues[field.logical_name] ?? '')}
                onChange={(e) => handleValueChange(field.logical_name, e.target.value)}
                placeholder="Test value..."
                className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300"
              />

              {(fs?.forcedValue !== undefined || fs?.clearValue || displayVal !== String(testValues[field.logical_name] ?? '')) && (
                <div className="flex items-center gap-1 text-[10px]">
                  <Play size={9} className="text-blue-500 shrink-0" />
                  <span className="text-slate-400">Result:</span>
                  <span className={`font-semibold ${fs?.clearValue ? 'text-slate-400 italic' : 'text-blue-600'}`}>
                    {fs?.clearValue ? '(cleared)' : displayVal || '(empty)'}
                  </span>
                </div>
              )}

              {fs?.message && (
                <div className={`flex items-center gap-1 text-[10px] ${
                  fs.message.level === 'error' ? 'text-red-500' : fs.message.level === 'warning' ? 'text-amber-600' : 'text-blue-500'
                }`}>
                  {fs.message.level === 'error'
                    ? <AlertCircle size={9} />
                    : fs.message.level === 'warning'
                    ? <AlertTriangle size={9} />
                    : <Info size={9} />}
                  <span className="truncate">{fs.message.text}</span>
                </div>
              )}

              {fs?.filteredOptions && (
                <div className="text-[10px] text-teal-600">
                  Allowed: {fs.filteredOptions.join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-200 pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rule Result</span>
          {hasConditions ? (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              conditionMet ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
            }`}>
              {conditionMet ? 'IF branch firing' : 'ELSE branch (conditions not met)'}
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              No conditions — always fires
            </span>
          )}
        </div>

        {messages.length > 0 && (
          <div className="space-y-1.5">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-3 py-2 rounded-lg text-[11px] border ${
                  msg.level === 'error'
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : msg.level === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}
              >
                {msg.level === 'error' ? <AlertCircle size={12} className="mt-px shrink-0" /> : msg.level === 'warning' ? <AlertTriangle size={12} className="mt-px shrink-0" /> : <Info size={12} className="mt-px shrink-0" />}
                <span>{msg.text}</span>
                {msg.blocksSave && (
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-wide opacity-70 shrink-0">Blocks Save</span>
                )}
              </div>
            ))}
          </div>
        )}

        {ruleState.recommendations.length > 0 && (
          <div className="space-y-1.5">
            {ruleState.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg border border-cyan-200 bg-cyan-50">
                <Lightbulb size={12} className="mt-px shrink-0 text-cyan-600" />
                <div>
                  <p className="text-[11px] font-semibold text-cyan-800">{rec.title}</p>
                  {rec.description && <p className="text-[10px] text-cyan-700 mt-0.5">{rec.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {messages.length === 0 && ruleState.recommendations.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 size={13} className="text-slate-300" />
            No messages or recommendations generated with these values.
          </div>
        )}

        {ruleState.blockSave && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
            <AlertCircle size={13} />
            Save would be blocked with these values.
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Eye size={10} /> Active Field States
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {activeFields.map((field) => {
            const fs = ruleState.fields[field.logical_name];
            const hasState = fs && (fs.isHidden || fs.isReadonly || fs.isRequired || fs.forcedValue !== undefined || fs.clearValue || fs.message !== null || fs.filteredOptions !== null);
            if (!hasState) return null;
            return (
              <div key={field.field_definition_id} className="text-[10px] text-slate-600 bg-white rounded-lg border border-slate-100 px-2 py-1.5">
                <p className="font-semibold truncate">{field.display_name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {fs.isHidden && <span className="bg-slate-100 text-slate-500 px-1 rounded text-[9px]">hidden</span>}
                  {fs.isReadonly && <span className="bg-amber-50 text-amber-600 px-1 rounded text-[9px]">locked</span>}
                  {fs.isRequired && <span className="bg-red-50 text-red-500 px-1 rounded text-[9px]">required</span>}
                  {fs.clearValue && <span className="bg-blue-50 text-blue-500 px-1 rounded text-[9px]">cleared</span>}
                  {fs.forcedValue !== undefined && <span className="bg-blue-50 text-blue-600 px-1 rounded text-[9px]">forced</span>}
                  {fs.filteredOptions && <span className="bg-teal-50 text-teal-600 px-1 rounded text-[9px]">filtered</span>}
                  {fs.message && <span className={`px-1 rounded text-[9px] ${fs.message.level === 'error' ? 'bg-red-50 text-red-500' : fs.message.level === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-500'}`}>{fs.message.level}</span>}
                </div>
              </div>
            );
          })}
        </div>
        {!activeFields.some((f) => {
          const fs = ruleState.fields[f.logical_name];
          return fs && (fs.isHidden || fs.isReadonly || fs.isRequired || fs.forcedValue !== undefined || fs.clearValue || fs.message !== null || fs.filteredOptions !== null);
        }) && (
          <p className="text-[10px] text-slate-400 italic">No field states active with current test values.</p>
        )}
      </div>
    </div>
  );
}
