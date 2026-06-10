import { useState, useEffect, useCallback } from 'react';
import {
  Zap, ZapOff, Plus, ExternalLink, RefreshCw, AlertCircle,
  ChevronDown, ChevronRight, FileText,
} from 'lucide-react';
import type { BusinessRule, RuleConditionGroup, RuleAction } from '../../types/businessRule';
import { getRuleConditionBlocks } from '../../types/businessRule';
import { fetchRulesForEntity } from '../../services/businessRuleService';

interface FieldBusinessRulesPanelProps {
  entityId: string;
  entityName: string;
  fieldLogicalName: string;
  fieldDisplayName: string;
  onOpenRule: (rule: BusinessRule) => void;
  onNewRule: (fieldLogicalName: string, fieldDisplayName: string) => void;
}

function fieldUsedInConditionGroup(group: RuleConditionGroup | null, fieldName: string): boolean {
  if (!group) return false;
  for (const cond of group.conditions) {
    if (cond.field_logical_name === fieldName) return true;
    if (cond.value === fieldName && cond.source !== 'process_flow') return true;
  }
  for (const sub of group.groups) {
    if (fieldUsedInConditionGroup(sub, fieldName)) return true;
  }
  return false;
}

function fieldUsedInAction(action: RuleAction, fieldName: string): boolean {
  if (action.target_field === fieldName) return true;
  if (action.value_field === fieldName) return true;
  if (action.value_fields?.includes(fieldName)) return true;
  if (action.formula_tokens?.some((t) => t.field === fieldName)) return true;
  return false;
}

function fieldUsedInActions(actions: RuleAction[], fieldName: string): boolean {
  return actions.some((a) => fieldUsedInAction(a, fieldName));
}

function isRuleRelatedToField(rule: BusinessRule, fieldName: string): boolean {
  const trigger = rule.trigger_json;
  if (trigger?.watch_fields?.includes(fieldName)) return true;

  // Scan every condition block — its conditions and its THEN/ELSE actions.
  for (const block of getRuleConditionBlocks(rule.trigger_json, rule.action_json)) {
    if (fieldUsedInConditionGroup(block.condition_group, fieldName)) return true;
    if (fieldUsedInActions(block.if_actions ?? [], fieldName)) return true;
    if (fieldUsedInActions(block.else_actions ?? [], fieldName)) return true;
  }

  return false;
}

export default function FieldBusinessRulesPanel({
  entityId,
  entityName,
  fieldLogicalName,
  fieldDisplayName,
  onOpenRule,
  onNewRule,
}: FieldBusinessRulesPanelProps) {
  const [allRules, setAllRules] = useState<BusinessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeExpanded, setActiveExpanded] = useState(true);
  const [inactiveExpanded, setInactiveExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rules = await fetchRulesForEntity(entityId);
      setAllRules(rules);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => { load(); }, [load]);

  const relatedRules = allRules.filter((r) => isRuleRelatedToField(r, fieldLogicalName));
  const activeRules = relatedRules.filter((r) => r.is_active);
  const inactiveRules = relatedRules.filter((r) => !r.is_active);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <RefreshCw size={16} className="animate-spin text-slate-300 mb-2" />
        <p className="text-[10px] text-slate-400">Loading business rules...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
          <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-medium text-red-700 mb-0.5">Failed to load rules</p>
            <p className="text-[10px] text-red-500">{error}</p>
            <button
              onClick={load}
              className="mt-2 text-[10px] font-medium text-red-600 hover:text-red-800 underline"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Field context badge */}
      <div className="px-2.5 py-2 bg-slate-50 rounded-lg">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Rules for field</p>
        <p className="text-xs font-semibold text-slate-700">{fieldDisplayName}</p>
        <p className="text-[10px] text-slate-400 font-mono">{fieldLogicalName}</p>
      </div>

      {/* Active rules */}
      <RuleGroup
        title="Active Business Rules"
        rules={activeRules}
        expanded={activeExpanded}
        onToggle={() => setActiveExpanded(!activeExpanded)}
        variant="active"
        onOpenRule={onOpenRule}
      />

      {/* Inactive rules */}
      <RuleGroup
        title="Inactive Business Rules"
        rules={inactiveRules}
        expanded={inactiveExpanded}
        onToggle={() => setInactiveExpanded(!inactiveExpanded)}
        variant="inactive"
        onOpenRule={onOpenRule}
      />

      {/* Empty state */}
      {relatedRules.length === 0 && (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <FileText size={16} className="text-slate-300" />
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed max-w-[200px]">
            No business rules are using this field.
          </p>
        </div>
      )}

      {/* New rule button */}
      <button
        onClick={() => onNewRule(fieldLogicalName, fieldDisplayName)}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium text-blue-600 border-2 border-dashed border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
      >
        <Plus size={12} />
        New Business Rule
      </button>

      {/* Refresh */}
      <button
        onClick={load}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
      >
        <RefreshCw size={10} />
        Refresh
      </button>
    </div>
  );
}

function RuleGroup({
  title,
  rules,
  expanded,
  onToggle,
  variant,
  onOpenRule,
}: {
  title: string;
  rules: BusinessRule[];
  expanded: boolean;
  onToggle: () => void;
  variant: 'active' | 'inactive';
  onOpenRule: (rule: BusinessRule) => void;
}) {
  const isActive = variant === 'active';
  const Icon = isActive ? Zap : ZapOff;
  const iconColor = isActive ? 'text-emerald-500' : 'text-slate-400';
  const countBg = isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500';

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 py-1.5 text-left group"
      >
        {expanded ? (
          <ChevronDown size={11} className="text-slate-400" />
        ) : (
          <ChevronRight size={11} className="text-slate-400" />
        )}
        <Icon size={11} className={iconColor} />
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex-1">
          {title}
        </span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${countBg}`}>
          {rules.length}
        </span>
      </button>

      {expanded && rules.length > 0 && (
        <div className="mt-1 space-y-1">
          {rules.map((rule) => (
            <RuleCard key={rule.business_rule_id} rule={rule} onOpen={onOpenRule} variant={variant} />
          ))}
        </div>
      )}

      {expanded && rules.length === 0 && (
        <p className="text-[10px] text-slate-300 pl-5 py-1">None</p>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  onOpen,
  variant,
}: {
  rule: BusinessRule;
  onOpen: (rule: BusinessRule) => void;
  variant: 'active' | 'inactive';
}) {
  const borderColor = variant === 'active' ? 'border-emerald-100 hover:border-emerald-200' : 'border-slate-100 hover:border-slate-200';
  const dotColor = variant === 'active' ? 'bg-emerald-400' : 'bg-slate-300';

  const actionCount = getRuleConditionBlocks(rule.trigger_json, rule.action_json)
    .reduce((n, b) => n + (b.if_actions?.length ?? 0) + (b.else_actions?.length ?? 0), 0);
  const triggerLabel = rule.trigger_json?.trigger_on === 'onLoad' ? 'On Load' :
    rule.trigger_json?.trigger_on === 'onChange' ? 'On Change' : 'Always';

  return (
    <button
      onClick={() => onOpen(rule)}
      className={`w-full text-left px-2.5 py-2 rounded-lg border ${borderColor} bg-white hover:bg-slate-50 transition-colors group`}
    >
      <div className="flex items-start gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-1.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-[11px] font-medium text-slate-700 truncate flex-1 group-hover:text-blue-600 transition-colors">
              {rule.name}
            </p>
            <ExternalLink size={9} className="text-slate-300 group-hover:text-blue-400 shrink-0 transition-colors" />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-slate-400">{triggerLabel}</span>
            <span className="text-[9px] text-slate-300">|</span>
            <span className="text-[9px] text-slate-400">
              {actionCount} action{actionCount !== 1 ? 's' : ''}
            </span>
          </div>
          {rule.description && (
            <p className="text-[9px] text-slate-400 mt-0.5 truncate">{rule.description}</p>
          )}
        </div>
      </div>
    </button>
  );
}
