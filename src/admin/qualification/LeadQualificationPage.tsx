import { useState } from 'react';
import type { LeadQualificationRule } from '../../types/leadQualification';
import QualificationRuleListPage from './QualificationRuleListPage';
import QualificationRuleEditorPage from './QualificationRuleEditorPage';

type View = 'list' | 'editor';

export default function LeadQualificationPage() {
  const [view, setView] = useState<View>('list');
  const [activeRule, setActiveRule] = useState<LeadQualificationRule | null>(null);

  const handleOpen = (rule: LeadQualificationRule) => {
    setActiveRule(rule);
    setView('editor');
  };

  const handleBack = () => {
    setView('list');
    setActiveRule(null);
  };

  const handleUpdated = (updated: LeadQualificationRule) => {
    setActiveRule(updated);
  };

  if (view === 'editor' && activeRule) {
    return (
      <QualificationRuleEditorPage
        rule={activeRule}
        onBack={handleBack}
        onUpdated={handleUpdated}
      />
    );
  }

  return <QualificationRuleListPage onOpen={handleOpen} />;
}
