import { useState } from 'react';
import type { ProcessFlow } from '../../types/processFlow';
import ProcessFlowListPage from './ProcessFlowListPage';
import ProcessFlowEditorPage from './ProcessFlowEditorPage';

type View = 'list' | 'editor';

export default function ProcessFlowsPage() {
  const [view, setView] = useState<View>('list');
  const [activeFlow, setActiveFlow] = useState<ProcessFlow | null>(null);

  const handleOpen = (flow: ProcessFlow) => {
    setActiveFlow(flow);
    setView('editor');
  };

  const handleBack = () => {
    setView('list');
    setActiveFlow(null);
  };

  if (view === 'editor' && activeFlow) {
    return (
      <ProcessFlowEditorPage
        flow={activeFlow}
        onBack={handleBack}
        onFlowUpdate={(f) => setActiveFlow(f)}
      />
    );
  }

  return <ProcessFlowListPage onOpen={handleOpen} />;
}
