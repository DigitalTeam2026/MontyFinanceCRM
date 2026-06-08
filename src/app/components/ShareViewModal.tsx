import { useState, useEffect } from 'react';
import { X, Share2, Loader2, Trash2, Globe, Lock, Users, User } from 'lucide-react';
import type { ViewDefinition } from '../../types/view';
import type { ViewShare } from '../../services/viewService';
import {
  fetchViewShares,
  shareView,
  removeViewShare,
} from '../../services/viewService';
import { supabase } from '../../lib/supabase';
import { useToast, toFriendlyError } from '../context/ToastContext';
import SearchableSelect from './SearchableSelect';

interface ShareViewModalProps {
  view: ViewDefinition;
  onClose: () => void;
}

interface CrmUser { id: string; email: string; }
interface Team { id: string; name: string; }

export default function ShareViewModal({ view, onClose }: ShareViewModalProps) {
  const { showError, showSuccess } = useToast();
  const [shares, setShares] = useState<ViewShare[]>([]);
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareType, setShareType] = useState<'user' | 'team'>('user');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [sharesData, usersData, teamsData] = await Promise.all([
          fetchViewShares(view.view_id),
          supabase.rpc('fn_list_active_crm_users')
            .then(({ data }) => ((data ?? []) as { user_id: string; email: string }[]).map((u) => ({ id: u.user_id, email: u.email }))),
          supabase.from('team').select('team_id, name').eq('is_active', true).order('name')
            .then(({ data }) => (data ?? []).map((t: { team_id: string; name: string }) => ({ id: t.team_id, name: t.name }))),
        ]);
        setShares(sharesData);
        setUsers(usersData);
        setTeams(teamsData);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [view.view_id]);

  const handleAdd = async () => {
    const userId = shareType === 'user' ? (selectedUserId || null) : null;
    const teamId = shareType === 'team' ? (selectedTeamId || null) : null;
    if (!userId && !teamId) return;

    setAdding(true);
    try {
      await shareView(view.view_id, userId, teamId, permission);
      const updated = await fetchViewShares(view.view_id);
      setShares(updated);
      setSelectedUserId('');
      setSelectedTeamId('');
      showSuccess('View shared successfully.');
    } catch (err) {
      showError(toFriendlyError(err, 'Unable to share view.'));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (shareId: string) => {
    setRemovingId(shareId);
    try {
      await removeViewShare(shareId);
      setShares((prev) => prev.filter((s) => s.view_sharing_id !== shareId));
    } catch (err) {
      showError(toFriendlyError(err, 'Unable to remove share.'));
    } finally {
      setRemovingId(null);
    }
  };

  const alreadySharedUserIds = new Set(shares.filter((s) => s.shared_with_user_id).map((s) => s.shared_with_user_id!));
  const alreadySharedTeamIds = new Set(shares.filter((s) => s.shared_with_team_id).map((s) => s.shared_with_team_id!));
  const availableUsers = users.filter((u) => !alreadySharedUserIds.has(u.id));
  const availableTeams = teams.filter((t) => !alreadySharedTeamIds.has(t.id));
  const canAdd = shareType === 'user' ? !!selectedUserId : !!selectedTeamId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        style={{ width: '100%', maxWidth: '560px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Share2 size={15} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-slate-800">Share View</h2>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[360px]">"{view.name}"</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg hover:bg-slate-100 transition shrink-0"
          >
            <X size={14} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 space-y-5">
          {/* Visibility badge */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 shrink-0">Current visibility:</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${
              view.view_type === 'public' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {view.view_type === 'public' ? <Globe size={10} /> : <Lock size={10} />}
              {view.view_type === 'public' ? 'Public' : 'Personal'}
            </span>
          </div>

          {/* Add share panel */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-[12px] font-semibold text-slate-600">Share with</p>

            {/* User / Team toggle */}
            <div className="flex gap-1.5">
              {(['user', 'team'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setShareType(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition ${
                    shareType === t
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t === 'user' ? <User size={11} /> : <Users size={11} />}
                  {t === 'user' ? 'User' : 'Team'}
                </button>
              ))}
            </div>

            {/* Share row — responsive flex, never overflows */}
            <div className="flex flex-wrap gap-2">
              <div className="flex-1" style={{ minWidth: '120px' }}>
                {shareType === 'user' ? (
                  <SearchableSelect
                    options={availableUsers.map((u) => ({ value: u.id, label: u.email }))}
                    value={selectedUserId}
                    onChange={setSelectedUserId}
                    placeholder="Select user…"
                  />
                ) : (
                  <SearchableSelect
                    options={availableTeams.map((t) => ({ value: t.id, label: t.name }))}
                    value={selectedTeamId}
                    onChange={setSelectedTeamId}
                    placeholder="Select team…"
                  />
                )}
              </div>

              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as 'read' | 'write')}
                className="h-10 px-2.5 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shrink-0"
                style={{ width: '110px' }}
              >
                <option value="read">Can view</option>
                <option value="write">Can edit</option>
              </select>

              <button
                onClick={handleAdd}
                disabled={!canAdd || adding}
                className="h-10 flex items-center justify-center gap-1.5 px-4 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                style={{ width: '84px' }}
              >
                {adding ? <Loader2 size={11} className="animate-spin" /> : 'Share'}
              </button>
            </div>
          </div>

          {/* Existing shares */}
          <div>
            <p className="text-[12px] font-semibold text-slate-600 mb-2.5">
              Current shares
              {shares.length > 0 && (
                <span className="ml-1 text-slate-400 font-normal">({shares.length})</span>
              )}
            </p>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={18} className="animate-spin text-slate-400" />
              </div>
            ) : shares.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <Share2 size={16} className="text-slate-300" />
                </div>
                <p className="text-[12px] text-slate-400">No shares yet</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {shares.map((share) => (
                  <div
                    key={share.view_sharing_id}
                    className="flex items-center gap-3 px-3 py-2.5 bg-white border border-slate-100 rounded-lg"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      {share.shared_with_user_id ? (
                        <span className="text-blue-700 text-[10px] font-bold uppercase">
                          {(share.user_email ?? '?').slice(0, 2)}
                        </span>
                      ) : (
                        <Users size={13} className="text-blue-600" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-slate-700 truncate">
                        {share.user_email ?? share.team_name ?? '—'}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {share.shared_with_user_id ? 'User' : 'Team'}
                      </p>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                      share.permission_level === 'write'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {share.permission_level === 'write' ? 'Can edit' : 'Can view'}
                    </span>

                    <button
                      onClick={() => handleRemove(share.view_sharing_id)}
                      disabled={removingId === share.view_sharing_id}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40 shrink-0"
                      title="Remove share"
                    >
                      {removingId === share.view_sharing_id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Trash2 size={12} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
