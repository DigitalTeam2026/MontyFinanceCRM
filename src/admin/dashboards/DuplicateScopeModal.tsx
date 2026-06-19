import { useState } from 'react';
import { Copy, User, Building2, Network, ArrowUp, Globe } from 'lucide-react';
import type { DuplicateScope } from './services/dashboardService';

interface Props {
  dashboardName: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (scope: DuplicateScope) => void;
}

const OPTIONS: { scope: DuplicateScope; label: string; desc: string; icon: React.ReactNode }[] = [
  { scope: 'user', label: 'Just me', desc: 'Personal — only you can see this copy.', icon: <User size={15} /> },
  { scope: 'business_unit', label: 'My Business Unit', desc: 'Everyone in your business unit.', icon: <Building2 size={15} /> },
  { scope: 'child', label: 'My BU + child units', desc: 'Your business unit and all units beneath it.', icon: <Network size={15} /> },
  { scope: 'parent', label: 'My BU + parent units', desc: 'Your business unit and its parent units.', icon: <ArrowUp size={15} /> },
  { scope: 'organization', label: 'Entire Organization', desc: 'Every user in the organization.', icon: <Globe size={15} /> },
];

export default function DuplicateScopeModal({ dashboardName, loading, onCancel, onConfirm }: Props) {
  const [scope, setScope] = useState<DuplicateScope>('user');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={loading ? undefined : onCancel} />
      <div className="relative bg-white rounded-lg border border-slate-200 shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-7 h-7 rounded bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <Copy size={14} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-slate-800">Duplicate dashboard</h3>
            <p className="mt-0.5 text-[12px] text-slate-500">Choose who the copy of “{dashboardName}” is for.</p>
          </div>
        </div>

        <div className="px-5 py-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
          {OPTIONS.map((o) => (
            <button key={o.scope} onClick={() => setScope(o.scope)}
              className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                scope === o.scope ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <span className={`mt-0.5 ${scope === o.scope ? 'text-blue-600' : 'text-slate-400'}`}>{o.icon}</span>
              <span className="flex-1">
                <span className="block text-[12px] font-medium text-slate-800">{o.label}</span>
                <span className="block text-[11px] text-slate-500">{o.desc}</span>
              </span>
              <span className={`mt-1 w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                scope === o.scope ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`} />
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 bg-slate-50 rounded-b-lg">
          <button onClick={onCancel} disabled={loading}
            className="px-3 py-1.5 text-[12px] text-slate-600 border border-slate-300 rounded hover:bg-white disabled:opacity-50">
            Cancel
          </button>
          <button onClick={() => onConfirm(scope)} disabled={loading}
            className="px-3 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-60">
            {loading ? 'Duplicating…' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>
  );
}
