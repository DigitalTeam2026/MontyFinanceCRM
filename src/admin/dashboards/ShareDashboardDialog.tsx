import { useEffect, useMemo, useState } from 'react';
import { Share2, Trash2, User, Users, Shield, Building2, Globe, Loader2, Plus } from 'lucide-react';
import Modal from '../../app/components/Modal';
import FilterSelect from '../../app/components/FilterSelect';
import { useToast, toFriendlyError } from '../../app/context/ToastContext';
import {
  fetchPermissions, savePermission, deletePermission, fetchPrincipalOptions,
} from './services/dashboardService';
import type { PrincipalKind, PrincipalOption } from './services/dashboardService';
import type { DashboardPermission } from './types/dashboard';

interface Props {
  dashboardId: string;
  dashboardName: string;
  onClose: () => void;
}

const ORG_PRINCIPAL = '00000000-0000-0000-0000-000000000000';

type AccessLevel = 'view' | 'edit';
const accessFlags = (level: AccessLevel) => ({
  can_read: true,
  can_export: true,
  can_write: level === 'edit',
  can_delete: false,
  can_publish: false,
  can_share: false,
});
const levelOf = (p: DashboardPermission): AccessLevel => (p.can_write ? 'edit' : 'view');

const KIND_META: Record<PrincipalKind, { label: string; icon: React.ReactNode }> = {
  user: { label: 'User', icon: <User size={13} /> },
  team: { label: 'Team', icon: <Users size={13} /> },
  role: { label: 'Role', icon: <Shield size={13} /> },
  business_unit: { label: 'Business Unit', icon: <Building2 size={13} /> },
};

const inputCls =
  'w-full px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white';

export default function ShareDashboardDialog({ dashboardId, dashboardName, onClose }: Props) {
  const { showSuccess, showError } = useToast();
  const [perms, setPerms] = useState<DashboardPermission[]>([]);
  const [optionsByKind, setOptionsByKind] = useState<Record<PrincipalKind, PrincipalOption[]>>({
    user: [], team: [], role: [], business_unit: [],
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Add-grant form
  const [kind, setKind] = useState<PrincipalKind>('user');
  const [principalId, setPrincipalId] = useState('');
  const [level, setLevel] = useState<AccessLevel>('view');

  const load = async () => {
    setLoading(true);
    try {
      const [p, users, teams, roles, bus] = await Promise.all([
        fetchPermissions(dashboardId),
        fetchPrincipalOptions('user'),
        fetchPrincipalOptions('team'),
        fetchPrincipalOptions('role'),
        fetchPrincipalOptions('business_unit'),
      ]);
      setPerms(p);
      setOptionsByKind({ user: users, team: teams, role: roles, business_unit: bus });
    } catch (e) {
      showError(toFriendlyError(e));
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dashboardId]);

  // Resolve a principal's display label from the loaded option lists.
  const labelMap = useMemo(() => {
    const m = new Map<string, string>();
    (Object.keys(optionsByKind) as PrincipalKind[]).forEach((k) =>
      optionsByKind[k].forEach((o) => m.set(`${k}:${o.id}`, o.label)));
    return m;
  }, [optionsByKind]);

  const everyone = perms.find((p) => p.principal_type === 'organization');
  // Targeted grants only (org-wide is shown separately as a toggle).
  const targeted = perms.filter((p) => p.principal_type !== 'organization');

  // Principals of the chosen kind not already granted access.
  const available = useMemo(() => {
    const taken = new Set(perms.filter((p) => p.principal_type === kind).map((p) => p.principal_id));
    return optionsByKind[kind].filter((o) => !taken.has(o.id));
  }, [optionsByKind, kind, perms]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); showSuccess(ok); await load(); }
    catch (e) { showError(toFriendlyError(e)); }
    setBusy(false);
  };

  const addGrant = () => {
    if (!principalId) return;
    act(
      () => savePermission({
        dashboard_id: dashboardId, principal_type: kind, principal_id: principalId, ...accessFlags(level),
      }),
      'Access granted.',
    ).then(() => setPrincipalId(''));
  };

  const changeLevel = (p: DashboardPermission, next: AccessLevel) =>
    act(
      () => savePermission({
        dashboard_id: dashboardId, principal_type: p.principal_type, principal_id: p.principal_id, ...accessFlags(next),
      }),
      'Access updated.',
    );

  const remove = (p: DashboardPermission) =>
    act(() => deletePermission(p.dashboard_permission_id), 'Access removed.');

  const toggleEveryone = () => {
    if (everyone) {
      act(() => deletePermission(everyone.dashboard_permission_id), 'Removed organization access.');
    } else {
      act(
        () => savePermission({
          dashboard_id: dashboardId, principal_type: 'organization', principal_id: ORG_PRINCIPAL,
          can_read: true, can_export: true, can_write: false, can_delete: false, can_publish: false, can_share: false,
        }),
        'Shared with the whole organization.',
      );
    }
  };

  return (
    <Modal
      title="Share dashboard"
      description={`Choose who can see "${dashboardName}". People you add will be able to open it from the dashboard switcher.`}
      icon={<Share2 size={16} />}
      width={560}
      onClose={onClose}
      closeDisabled={busy}
      footer={
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-60"
        >
          Done
        </button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="animate-spin text-slate-400" size={20} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Everyone toggle */}
          <button
            onClick={toggleEveryone}
            disabled={busy}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors disabled:opacity-60 ${
              everyone ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span className={everyone ? 'text-blue-600' : 'text-slate-400'}><Globe size={16} /></span>
            <span className="flex-1">
              <span className="block text-[12px] font-medium text-slate-800">Everyone in the organization</span>
              <span className="block text-[11px] text-slate-500">Every signed-in user can view this dashboard.</span>
            </span>
            <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${everyone ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${everyone ? 'translate-x-4' : ''}`} />
            </span>
          </button>

          {/* Add a specific principal */}
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">Add people, teams, roles or units</p>
            <div className="flex items-end gap-2">
              <div className="w-32 shrink-0">
                <label className="block text-[11px] text-slate-500 mb-1">Type</label>
                <FilterSelect
                  value={kind}
                  onChange={(e) => { setKind(e.target.value as PrincipalKind); setPrincipalId(''); }}
                  className={inputCls}
                >
                  {(Object.keys(KIND_META) as PrincipalKind[]).map((k) => (
                    <option key={k} value={k}>{KIND_META[k].label}</option>
                  ))}
                </FilterSelect>
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-[11px] text-slate-500 mb-1">{KIND_META[kind].label}</label>
                <FilterSelect
                  value={principalId}
                  onChange={(e) => setPrincipalId(e.target.value)}
                  placeholder={`Select ${KIND_META[kind].label.toLowerCase()}…`}
                  forceSearch
                  className={inputCls}
                >
                  <option value="">{`Select ${KIND_META[kind].label.toLowerCase()}…`}</option>
                  {available.map((o) => (
                    <option key={o.id} value={o.id}>{o.sublabel ? `${o.label} — ${o.sublabel}` : o.label}</option>
                  ))}
                </FilterSelect>
              </div>
              <div className="w-28 shrink-0">
                <label className="block text-[11px] text-slate-500 mb-1">Access</label>
                <FilterSelect value={level} onChange={(e) => setLevel(e.target.value as AccessLevel)} className={inputCls}>
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </FilterSelect>
              </div>
              <button
                onClick={addGrant}
                disabled={busy || !principalId}
                className="shrink-0 h-[32px] px-3 inline-flex items-center gap-1 text-[12px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus size={13} /> Add
              </button>
            </div>
          </div>

          {/* Existing grants */}
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">
              People with access {targeted.length ? `(${targeted.length})` : ''}
            </p>
            {targeted.length === 0 ? (
              <p className="text-[12px] text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-lg">
                No one has been added yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {targeted.map((p) => {
                  const kindKey = p.principal_type as PrincipalKind;
                  const meta = KIND_META[kindKey];
                  const name = labelMap.get(`${p.principal_type}:${p.principal_id}`) ?? '(unknown)';
                  return (
                    <li key={p.dashboard_permission_id} className="flex items-center gap-2.5 px-3 py-2">
                      <span className="text-slate-400 shrink-0">{meta?.icon ?? <User size={13} />}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] text-slate-800 truncate">{name}</span>
                        <span className="block text-[10px] text-slate-400 uppercase tracking-wide">{meta?.label ?? p.principal_type}</span>
                      </span>
                      <FilterSelect
                        value={levelOf(p)}
                        onChange={(e) => changeLevel(p, e.target.value as AccessLevel)}
                        disabled={busy}
                        matchTriggerWidth
                        className="w-24 px-2 py-1 text-[11px] border border-slate-200 rounded bg-white"
                      >
                        <option value="view">Can view</option>
                        <option value="edit">Can edit</option>
                      </FilterSelect>
                      <button
                        onClick={() => remove(p)}
                        disabled={busy}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                        aria-label="Remove access"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
