import { useState } from 'react';
import { Database, GitMerge } from 'lucide-react';
import RecordsImportPanel from './RecordsImportPanel';
import JunctionImportPanel from './JunctionImportPanel';

type Mode = 'records' | 'links';

const MODES: { id: Mode; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'records', label: 'Records', icon: <Database size={14} />, hint: 'Import any table (incl. 1:N relations)' },
  { id: 'links', label: 'Link tables (N:N)', icon: <GitMerge size={14} />, hint: 'Import many-to-many link tables' },
];

export default function ImportRelationsPage() {
  const [mode, setMode] = useState<Mode>('records');

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--app-bg)' }}>
      <div className="shrink-0 px-6 pt-4">
        <div className="flex gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              title={m.hint}
              className={`flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium rounded border transition-colors ${
                mode === m.id
                  ? 'bg-[var(--navy-accent)] text-white border-[var(--navy-accent)]'
                  : 'bg-white text-[var(--ink-600)] hover:bg-[var(--ink-50)]'
              }`}
              style={mode !== m.id ? { borderColor: 'var(--border)' } : undefined}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {mode === 'records' ? <RecordsImportPanel /> : <JunctionImportPanel />}
      </div>
    </div>
  );
}
