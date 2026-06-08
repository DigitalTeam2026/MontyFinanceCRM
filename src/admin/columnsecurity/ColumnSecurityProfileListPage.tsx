import { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, Users, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import type { ColumnSecurityProfile } from '../../services/columnSecurityService';
import { updateColumnSecurityProfile, deleteColumnSecurityProfile } from '../../services/columnSecurityService';
import ConfirmDialog from '../components/ConfirmDialog';

interface Props {
  profiles: ColumnSecurityProfile[];
  onNew: () => void;
  onEdit: (profile: ColumnSecurityProfile) => void;
  onRefresh: () => void;
  loading: boolean;
}

export default function ColumnSecurityProfileListPage({ profiles, onNew, onEdit, onRefresh, loading }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<ColumnSecurityProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteColumnSecurityProfile(deleteTarget.profile_id);
      onRefresh();
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (profile: ColumnSecurityProfile) => {
    setTogglingId(profile.profile_id);
    try {
      await updateColumnSecurityProfile(profile.profile_id, { is_active: !profile.is_active });
      onRefresh();
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 shrink-0">
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium rounded transition-colors"
        >
          <Plus size={13} /> New Profile
        </button>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-[12px] text-slate-700 rounded transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <div className="flex-1" />
        <span className="text-[11px] text-slate-400">{profiles.length} profile{profiles.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw size={16} className="animate-spin text-slate-400" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-center">
            <ShieldCheck size={28} className="text-slate-300 mb-3" />
            <p className="text-[13px] font-medium text-slate-500">No column security profiles yet</p>
            <p className="text-[12px] text-slate-400 mt-1 max-w-xs">
              Create named profiles to control which users and teams can read or update secured fields.
            </p>
            <button
              onClick={onNew}
              className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium rounded transition-colors"
            >
              <Plus size={12} /> Create First Profile
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Profile Name', 'Description', 'Status', 'Created', ''].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profiles.map((profile) => (
                  <tr key={profile.profile_id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${profile.is_active ? 'bg-blue-100' : 'bg-slate-100'}`}>
                          <ShieldCheck size={11} className={profile.is_active ? 'text-blue-600' : 'text-slate-400'} />
                        </div>
                        <button
                          onClick={() => onEdit(profile)}
                          className="font-semibold text-blue-600 hover:text-blue-800 hover:underline text-left"
                        >
                          {profile.name}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 max-w-xs">
                      <span className="truncate block">{profile.description || <span className="text-slate-300 italic">No description</span>}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => handleToggleActive(profile)}
                        disabled={togglingId === profile.profile_id}
                        title={profile.is_active ? 'Click to deactivate' : 'Click to activate'}
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                          profile.is_active
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
                        } ${togglingId === profile.profile_id ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {profile.is_active
                          ? <ToggleRight size={10} />
                          : <ToggleLeft size={10} />
                        }
                        {profile.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                      {new Date(profile.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5 w-20">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onEdit(profile)}
                          title="Edit Profile"
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => onEdit(profile)}
                          title="Manage Assignments"
                          className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        >
                          <Users size={12} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(profile)}
                          title="Delete"
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Column Security Profile"
          message={`Delete profile "${deleteTarget.name}"? All field rules and user/team assignments will be removed. This cannot be undone.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete'}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}
    </div>
  );
}
