import { useState } from 'react';
import type { DuplicateDetectionRule } from '../../types/duplicateDetection';
import DuplicateRulesListPage from './DuplicateRulesListPage';
import DuplicateRuleEditorPage from './DuplicateRuleEditorPage';
import DuplicateJobsPage from './DuplicateJobsPage';
import { ShieldAlert, ClipboardList } from 'lucide-react';

type Tab = 'rules' | 'jobs';
type View = 'list' | 'editor';

export default function DuplicateDetectionPage() {
  const [activeTab, setActiveTab] = useState<Tab>('rules');
  const [view, setView] = useState<View>('list');
  const [activeRule, setActiveRule] = useState<DuplicateDetectionRule | null>(null);

  const handleOpen = (rule: DuplicateDetectionRule) => {
    setActiveRule(rule);
    setView('editor');
  };

  const handleBack = () => {
    setView('list');
    setActiveRule(null);
  };

  const handleUpdated = (updated: DuplicateDetectionRule) => {
    setActiveRule(updated);
  };

  if (view === 'editor' && activeRule) {
    return (
      <DuplicateRuleEditorPage
        rule={activeRule}
        onBack={handleBack}
        onUpdated={handleUpdated}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-5 pt-1">
        <TabButton
          label="Detection Rules"
          icon={<ShieldAlert size={13} />}
          active={activeTab === 'rules'}
          onClick={() => setActiveTab('rules')}
        />
        <TabButton
          label="Scan Jobs"
          icon={<ClipboardList size={13} />}
          active={activeTab === 'jobs'}
          onClick={() => setActiveTab('jobs')}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'rules' && (
          <DuplicateRulesListPage onOpen={handleOpen} />
        )}
        {activeTab === 'jobs' && (
          <DuplicateJobsPage />
        )}
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
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
