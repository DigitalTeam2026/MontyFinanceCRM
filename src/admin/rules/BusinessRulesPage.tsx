import { useState } from 'react';
import type { BusinessRule } from '../../types/businessRule';
import RuleListPage from './RuleListPage';
import RuleEditorPage from './RuleEditorPage';

type View = 'list' | 'editor';

interface BusinessRulesPageProps {
  preselectedEntityId?: string;
}

export default function BusinessRulesPage({ preselectedEntityId }: BusinessRulesPageProps) {
  const [view, setView] = useState<View>('list');
  const [activeRule, setActiveRule] = useState<BusinessRule | null>(null);
  const [activeEntityId, setActiveEntityId] = useState(preselectedEntityId ?? '');
  const [activeEntityName, setActiveEntityName] = useState('');

  const handleOpen = (rule: BusinessRule, entityId: string, entityName: string) => {
    setActiveRule(rule);
    setActiveEntityId(entityId);
    setActiveEntityName(entityName);
    setView('editor');
  };

  const handleBack = () => {
    setView('list');
    setActiveRule(null);
    setActiveEntityId('');
    setActiveEntityName('');
  };

  if (view === 'editor' && activeRule) {
    return (
      <RuleEditorPage
        rule={activeRule}
        entityId={activeEntityId}
        entityName={activeEntityName}
        onBack={handleBack}
        onRuleUpdate={(r) => setActiveRule(r)}
      />
    );
  }

  return <RuleListPage onOpen={handleOpen} preselectedEntityId={preselectedEntityId} />;
}
