import { useState } from 'react';
import type { WorkflowDefinition } from '../../types/workflow';
import WorkflowListPage from './WorkflowListPage';
import WorkflowEditorPage from './WorkflowEditorPage';

type View = 'list' | 'editor';

export default function WorkflowsPage() {
  const [view, setView] = useState<View>('list');
  const [activeWf, setActiveWf] = useState<WorkflowDefinition | null>(null);

  const handleOpen = (wf: WorkflowDefinition) => {
    setActiveWf(wf);
    setView('editor');
  };

  const handleBack = () => {
    setView('list');
    setActiveWf(null);
  };

  if (view === 'editor' && activeWf) {
    return (
      <WorkflowEditorPage
        workflow={activeWf}
        onBack={handleBack}
        onWorkflowUpdate={(w) => setActiveWf(w)}
      />
    );
  }

  return <WorkflowListPage onOpen={handleOpen} />;
}
