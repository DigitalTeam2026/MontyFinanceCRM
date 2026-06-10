import { useState } from 'react';
import { Zap, History } from 'lucide-react';
import type { ApiIntegration } from '../../types/apiIntegration';
import ApiIntegrationList from './ApiIntegrationList';
import ApiIntegrationEditor from './ApiIntegrationEditor';
import ApiIntegrationLogs from './ApiIntegrationLogs';

type Tab = 'integrations' | 'logs';
type View = 'list' | 'editor';

export default function ApiIntegrationsPage() {
  const [tab, setTab] = useState<Tab>('integrations');
  const [view, setView] = useState<View>('list');
  const [activeIntegration, setActiveIntegration] = useState<ApiIntegration | null>(null);

  function openEditor(integration?: ApiIntegration) {
    setActiveIntegration(integration ?? null);
    setView('editor');
  }

  function closeEditor() {
    setView('list');
    setActiveIntegration(null);
  }

  // Editor takes over full content area (no tabs shown)
  if (tab === 'integrations' && view === 'editor') {
    return (
      <ApiIntegrationEditor
        integration={activeIntegration ?? undefined}
        onBack={closeEditor}
        onSaved={(saved) => {
          setActiveIntegration(saved);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-5 pt-1 shrink-0">
        <TabButton
          label="Integrations"
          icon={<Zap size={13} />}
          active={tab === 'integrations'}
          onClick={() => { setTab('integrations'); setView('list'); }}
        />
        <TabButton
          label="Execution Logs"
          icon={<History size={13} />}
          active={tab === 'logs'}
          onClick={() => setTab('logs')}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'integrations' && (
          <ApiIntegrationList
            onNew={() => openEditor()}
            onEdit={(integration) => openEditor(integration)}
          />
        )}
        {tab === 'logs' && (
          <ApiIntegrationLogs />
        )}
      </div>
    </div>
  );
}

function TabButton({
  label, icon, active, onClick,
}: {
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
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
