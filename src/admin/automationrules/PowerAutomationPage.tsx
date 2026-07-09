import { useState } from 'react';
import type { AutomationRule } from '../../types/automationRule';
import RuleListPage from './RuleListPage';
import RuleEditorPage from './RuleEditorPage';

// Power Automation module shell. Owns its own list <-> editor view state, the
// same self-contained pattern the other Admin Studio modules use.
export default function PowerAutomationPage() {
  const [openRuleId, setOpenRuleId] = useState<string | null>(null);

  if (openRuleId) {
    return <RuleEditorPage ruleId={openRuleId} onBack={() => setOpenRuleId(null)} />;
  }
  return <RuleListPage onOpen={(r: AutomationRule) => setOpenRuleId(r.automation_rule_id)} />;
}
