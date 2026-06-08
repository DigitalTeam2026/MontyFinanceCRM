import { useState } from 'react';
import type { DigitalRule } from '../../types/digitalRule';
import DigitalRuleListPage from './DigitalRuleListPage';
import DigitalRuleEditorPage from './DigitalRuleEditorPage';

type View = 'list' | 'new' | 'edit';

export default function DigitalRulesPage() {
  const [view, setView] = useState<View>('list');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  if (view === 'new') {
    return (
      <DigitalRuleEditorPage
        onSaved={() => setView('list')}
        onCancel={() => setView('list')}
      />
    );
  }

  if (view === 'edit' && editingRuleId) {
    return (
      <DigitalRuleEditorPage
        ruleId={editingRuleId}
        onSaved={() => setView('list')}
        onCancel={() => setView('list')}
      />
    );
  }

  return (
    <DigitalRuleListPage
      onNew={() => setView('new')}
      onEdit={(rule: DigitalRule) => { setEditingRuleId(rule.digital_rule_id); setView('edit'); }}
    />
  );
}
