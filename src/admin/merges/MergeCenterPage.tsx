import { useState } from 'react';
import { GitMerge, ClipboardList } from 'lucide-react';
import type { MergeCandidate } from '../../types/mergeCenter';
import MergeCandidatesListPage from './MergeCandidatesListPage';
import MergeEditorPage from './MergeEditorPage';
import MergeAuditLogPage from './MergeAuditLogPage';

type Tab = 'candidates' | 'audit';
type View = 'list' | 'editor';

export default function MergeCenterPage() {
  const [tab, setTab] = useState<Tab>('candidates');
  const [view, setView] = useState<View>('list');
  const [activeCandidate, setActiveCandidate] = useState<MergeCandidate | null>(null);

  const handleOpen = (candidate: MergeCandidate) => {
    if (candidate.merge_candidate_id === '__new__') return;
    setActiveCandidate(candidate);
    setView('editor');
  };

  const handleBack = () => {
    setView('list');
    setActiveCandidate(null);
  };

  const handleResolved = (updated: MergeCandidate) => {
    setActiveCandidate(updated);
  };

  if (view === 'editor' && activeCandidate) {
    return (
      <MergeEditorPage
        candidate={activeCandidate}
        onBack={handleBack}
        onResolved={handleResolved}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-5 pt-1">
        <TabButton
          label="Candidates"
          icon={<GitMerge size={13} />}
          active={tab === 'candidates'}
          onClick={() => setTab('candidates')}
        />
        <TabButton
          label="Merge Audit Log"
          icon={<ClipboardList size={13} />}
          active={tab === 'audit'}
          onClick={() => setTab('audit')}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'candidates' && <MergeCandidatesListPage onOpen={handleOpen} />}
        {tab === 'audit' && <MergeAuditLogPage />}
      </div>
    </div>
  );
}

function TabButton({ label, icon, active, onClick }: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-400 hover:text-gray-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
