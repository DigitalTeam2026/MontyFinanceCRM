import { useState } from 'react';
import type { AutomationRule } from '../../types/automationRule';
import RuleListPage from './RuleListPage';
import RuleEditorPage, { type EditorTab } from './RuleEditorPage';

// Power Automation module shell. Owns its own list <-> editor view state, the
// same self-contained pattern the other Admin Studio modules use. (Sender
// mailboxes live in their own "Email Accounts" sidebar module.)
export default function PowerAutomationPage() {
  const [open, setOpen] = useState<{ id: string; tab: EditorTab } | null>(null);

  if (open) {
    return <RuleEditorPage ruleId={open.id} initialTab={open.tab} onBack={() => setOpen(null)} />;
  }
  return (
    <RuleListPage
      onOpen={(r: AutomationRule, tab: EditorTab = 'actions') => setOpen({ id: r.automation_rule_id, tab })}
    />
  );
}
