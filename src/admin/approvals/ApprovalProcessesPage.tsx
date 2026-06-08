import { useState } from 'react';
import type { ApprovalProcess } from '../../types/approvalProcess';
import ApprovalProcessListPage from './ApprovalProcessListPage';
import ApprovalProcessEditorPage from './ApprovalProcessEditorPage';

type View = 'list' | 'editor';

export default function ApprovalProcessesPage() {
  const [view, setView] = useState<View>('list');
  const [activeProc, setActiveProc] = useState<ApprovalProcess | null>(null);

  const handleOpen = (proc: ApprovalProcess) => {
    setActiveProc(proc);
    setView('editor');
  };

  const handleBack = () => {
    setView('list');
    setActiveProc(null);
  };

  const handleUpdated = (updated: ApprovalProcess) => {
    setActiveProc(updated);
  };

  if (view === 'editor' && activeProc) {
    return (
      <ApprovalProcessEditorPage
        proc={activeProc}
        onBack={handleBack}
        onUpdated={handleUpdated}
      />
    );
  }

  return <ApprovalProcessListPage onOpen={handleOpen} />;
}
