import { useState } from 'react';
import type { DigitalRule } from '../../types/digitalRule';
import DigitalRuleListPage from './DigitalRuleListPage';
import DigitalRuleEditorPage from './DigitalRuleEditorPage';
import LeadQualificationPage from '../qualification/LeadQualificationPage';

type Tab = 'rules' | 'qualification';
type View = 'list' | 'new' | 'edit';

export default function DigitalRulesPage() {
  const [tab, setTab] = useState<Tab>('rules');
  const [view, setView] = useState<View>('list');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const handleTabChange = (t: Tab) => {
    setTab(t);
    setView('list');
    setEditingRuleId(null);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'rules', label: 'Digital Rules' },
    { id: 'qualification', label: 'Lead Qualification' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-slate-200 bg-white px-4 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={`px-4 py-2.5 text-[12px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'qualification' ? (
          <LeadQualificationPage />
        ) : view === 'new' ? (
          <DigitalRuleEditorPage
            onSaved={() => setView('list')}
            onCancel={() => setView('list')}
          />
        ) : view === 'edit' && editingRuleId ? (
          <DigitalRuleEditorPage
            ruleId={editingRuleId}
            onSaved={() => setView('list')}
            onCancel={() => setView('list')}
          />
        ) : (
          <DigitalRuleListPage
            onNew={() => setView('new')}
            onEdit={(rule: DigitalRule) => { setEditingRuleId(rule.digital_rule_id); setView('edit'); }}
          />
        )}
      </div>
    </div>
  );
}
