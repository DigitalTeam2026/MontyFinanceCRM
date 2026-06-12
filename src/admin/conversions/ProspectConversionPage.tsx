import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle, LogIn, ArrowRight, Star } from 'lucide-react';
import type { EntityConversionRule } from '../../types/entityConversion';
import { fetchConversionRules } from '../../services/entityConversionService';
import ConversionRuleEditorPage from './ConversionRuleEditorPage';

const SOURCE = 'prospect';
const TARGET = 'lead';

export default function ProspectConversionPage() {
  const [rules, setRules] = useState<EntityConversionRule[]>([]);
  const [activeRule, setActiveRule] = useState<EntityConversionRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConversionRules(SOURCE, TARGET);
      setRules(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversion rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpdated = (updated: EntityConversionRule) => {
    setActiveRule(updated);
    setRules((prev) =>
      prev.map((r) => (r.entity_conversion_rule_id === updated.entity_conversion_rule_id ? { ...r, ...updated } : r)),
    );
  };

  if (activeRule) {
    return (
      <ConversionRuleEditorPage
        rule={activeRule}
        onBack={() => { setActiveRule(null); load(); }}
        onUpdated={handleUpdated}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading conversion rules…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-10 p-4 rounded-xl border border-red-200 bg-red-50 flex gap-3">
        <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700">Could not load conversion rules</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-5 py-6">
        <div className="mb-5">
          <h2 className="text-sm font-bold text-gray-900">Prospect → Lead Conversion</h2>
          <p className="text-xs text-gray-500 mt-1">
            Configure how a Prospect is converted into a Lead. The mapped fields are copied to the new Lead,
            and the created Lead is linked back onto the Prospect.
          </p>
        </div>

        {rules.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-gray-500">No Prospect→Lead conversion rule found.</p>
            <p className="text-xs text-gray-400 mt-1">
              Run the conversion migration to seed the default rule, then refresh.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <button
                key={rule.entity_conversion_rule_id}
                onClick={() => setActiveRule(rule)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <LogIn size={16} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{rule.name}</span>
                    {rule.is_default && <Star size={11} className="text-amber-400 fill-amber-400" />}
                    {rule.is_system && <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0">system</span>}
                    {!rule.is_active && <span className="text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0">inactive</span>}
                  </div>
                  {rule.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{rule.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-gray-400">
                    <span className="font-mono">prospect</span>
                    <ArrowRight size={10} />
                    <span className="font-mono">lead</span>
                  </div>
                </div>
                <ArrowRight size={16} className="text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
