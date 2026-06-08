import { useState } from 'react';
import type { DataPolicy } from '../../types/dataPolicy';
import DataPolicyListPage from './DataPolicyListPage';
import DataPolicyEditorPage from './DataPolicyEditorPage';

type View = 'list' | 'editor';

export default function DataPoliciesPage() {
  const [view, setView] = useState<View>('list');
  const [activePolicy, setActivePolicy] = useState<DataPolicy | null>(null);

  const handleOpen = (policy: DataPolicy) => {
    setActivePolicy(policy);
    setView('editor');
  };

  const handleBack = () => {
    setView('list');
    setActivePolicy(null);
  };

  const handleUpdated = (updated: DataPolicy) => {
    setActivePolicy(updated);
  };

  if (view === 'editor' && activePolicy) {
    return (
      <DataPolicyEditorPage
        policy={activePolicy}
        onBack={handleBack}
        onUpdated={handleUpdated}
      />
    );
  }

  return <DataPolicyListPage onOpen={handleOpen} />;
}
