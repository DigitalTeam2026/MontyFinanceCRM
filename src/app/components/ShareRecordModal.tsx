import { useState, useEffect } from 'react';
import { X, Share2, Loader2, Trash2, Users, User, Check } from 'lucide-react';
import type { AppEntity } from '../types';
import { ENTITY_LOGICAL_NAME } from '../types';
import SearchableSelect from './SearchableSelect';
import type { RecordShare, SharePermissions } from '../services/recordShareService';
import {
  fetchRecordShares,
  addRecordShare,
  updateRecordShare,
  removeRecordShare,
} from '../services/recordShareService';
import { supabase } from '../../lib/supabase';
import { useToast, toFriendlyError } from '../context/ToastContext';

interface ShareRecordModalProps {
  entity: AppEntity;
  /** Single record ID — shows existing shares list */
  recordId?: string;
  /** Multiple record IDs — bulk share mode, no existing shares list */
  recordIds?: string[];
  recordLabel?: string;
  onClose: () => void;
}

type PrincipalType = 'user' | 'team';

interface CrmUser { id: string; email: string }
interface Team { id: string; name: string }

const PERM_LABELS: { key: keyof SharePermissions; label: string; hint: string }[] = [
  { key: 'can_read',   label: 'Read',   hint: 'View this record' },
  { key: 'can_write',  label: 'Write',  hint: 'Edit this record' },
  { key: 'can_delete', label: 'Delete', hint: 'Delete this record' },
  { key: 'can_assign', label: 'Assign', hint: 'Reassign ownership' },
  { key: 'can_share',  label: 'Share',  hint: 'Share with others' },
];

const DEFAULT_PERMS: SharePermissions = {
  can_read: true,
  can_write: false,
  can_delete: false,
  can_assign: false,
  can_share: false,
};

function PermissionMatrix({
  perms,
  onChange,
  disabled,
  compact,
}: {
  perms: SharePermissions;
  onChange: (p: SharePermissions) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const toggle = (key: keyof SharePermissions) => {
    if (disabled) return;
    const next = { ...perms, [key]: !perms[key] };
    // Read is required when any other permission is on
    if (key !== 'can_read' && !next.can_read && next[key]) {
      next.can_read = true;
    }
    // If read is turned off, turn everything off
    if (key === 'can_read' && !next.can_read) {
      next.can_write = false;
      next.can_delete = false;
      next.can_assign = false;
      next.can_share = false;
    }
    onChange(next);
  };

  return (
    <div className={`flex items-center gap-1 ${compact ? '' : 'flex-wrap'}`}>
      {PERM_LABELS.map(({ key, label, hint }) => {
        const active = !!perms[key];
        return (
          <button
            key={key}
            type="button"
            title={hint}
            disabled={disabled}
            onClick={() => toggle(key)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border transition select-none
              ${active
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            {active && <Check size={8} strokeWidth={3} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function ShareRecordModal({
  entity,
  recordId,
  recordIds,
  recordLabel,
  onClose,
}: ShareRecordModalProps) {
  const { showError, showSuccess } = useToast();
  const entityName = ENTITY_LOGICAL_NAME[entity] ?? entity;

  // Bulk mode: recordIds with multiple items; single mode: just recordId
  const bulkIds = recordIds && recordIds.length > 1 ? recordIds : null;
  const singleId = bulkIds ? null : (recordId ?? recordIds?.[0] ?? null);

  const [shares, setShares] = useState<RecordShare[]>([]);
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [principalType, setPrincipalType] = useState<PrincipalType>('user');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [newPerms, setNewPerms] = useState<SharePermissions>(DEFAULT_PERMS);
  const [adding, setAdding] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      try {
        const [sharesData, usersData, teamsData] = await Promise.all([
          singleId ? fetchRecordShares(entityName, singleId) : Promise.resolve([]),
          supabase.rpc('fn_list_active_crm_users')
            .then(({ data }) =>
              ((data ?? []) as { user_id: string; email: string }[])
                .map((u) => ({ id: u.user_id, email: u.email }))
            ),
          supabase.from('team').select('team_id, name').eq('is_active', true).order('name')
            .then(({ data }) =>
              (data ?? []).map((t: { team_id: string; name: string }) => ({ id: t.team_id, name: t.name }))
            ),
        ]);
        if (!cancelled) {
          setShares(sharesData);
          setUsers(usersData);
          setTeams(teamsData);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [entityName, singleId]);

  const sharedUserIds = new Set(shares.filter((s) => s.principal_type === 'user').map((s) => s.principal_id));
  const sharedTeamIds = new Set(shares.filter((s) => s.principal_type === 'team').map((s) => s.principal_id));
  // In bulk mode show all users/teams; in single mode filter out already-shared ones
  const availableUsers = bulkIds ? users : users.filter((u) => !sharedUserIds.has(u.id));
  const availableTeams = bulkIds ? teams : teams.filter((t) => !sharedTeamIds.has(t.id));
  const canAdd = (principalType === 'user' ? !!selectedUserId : !!selectedTeamId) && newPerms.can_read;

  const handleAdd = async () => {
    const principalId = principalType === 'user' ? selectedUserId : selectedTeamId;
    if (!principalId) return;
    const targetIds = bulkIds ?? (singleId ? [singleId] : []);
    if (targetIds.length === 0) return;
    setAdding(true);
    try {
      await Promise.all(targetIds.map((rid) => addRecordShare({
        entity_name: entityName,
        record_id: rid,
        principal_type: principalType,
        principal_id: principalId,
        ...newPerms,
      })));
      if (singleId) {
        const updated = await fetchRecordShares(entityName, singleId);
        setShares(updated);
      }
      setSelectedUserId('');
      setSelectedTeamId('');
      setNewPerms(DEFAULT_PERMS);
      showSuccess('Record shared successfully.');
    } catch (err) {
      showError(toFriendlyError(err, 'Unable to share record.'));
    } finally {
      setAdding(false);
    }
  };

  const handlePermissionsChange = async (share: RecordShare, updated: SharePermissions) => {
    setUpdatingId(share.share_id);
    try {
      await updateRecordShare(share.share_id, updated);
      setShares((prev) =>
        prev.map((s) => s.share_id === share.share_id ? { ...s, ...updated } : s),
      );
    } catch (err) {
      showError(toFriendlyError(err, 'Unable to update permissions.'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (shareId: string) => {
    setRemovingId(shareId);
    try {
      await removeRecordShare(shareId);
      setShares((prev) => prev.filter((s) => s.share_id !== shareId));
    } catch (err) {
      showError(toFriendlyError(err, 'Unable to remove share.'));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Share2 size={15} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-slate-800">
                {bulkIds ? `Share ${bulkIds.length} Records` : 'Share Record'}
              </h2>
              {!bulkIds && recordLabel && (
                <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[300px]">{recordLabel}</p>
              )}
              {bulkIds && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Share settings will apply to all {bulkIds.length} selected records
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X size={14} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Add share form */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
            <p className="text-[12px] font-semibold text-slate-600">Share with</p>

            {/* User / Team toggle */}
            <div className="flex gap-1.5">
              {(['user', 'team'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPrincipalType(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition ${
                    principalType === t
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t === 'user' ? <User size={11} /> : <Users size={11} />}
                  {t === 'user' ? 'User' : 'Team'}
                </button>
              ))}
            </div>

            {/* Principal selector */}
            <div>
              {principalType === 'user' ? (
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

            {/* Permission matrix */}
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Access rights
              </p>
              <PermissionMatrix perms={newPerms} onChange={setNewPerms} />
            </div>

            <button
              onClick={handleAdd}
              disabled={!canAdd || adding}
              className="w-full h-9 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? <Loader2 size={12} className="animate-spin" /> : <><Share2 size={12} /> Share</>}
            </button>
          </div>

          {/* Existing shares — hidden in bulk mode */}
          {!bulkIds && <div>
            <p className="text-[12px] font-semibold text-slate-600 mb-2">
              Shared with
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
                <p className="text-[12px] text-slate-400">Not shared with anyone yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {shares.map((share) => {
                  const isUser = share.principal_type === 'user';
                  const isUpdating = updatingId === share.share_id;
                  const isRemoving = removingId === share.share_id;
                  const currentPerms: SharePermissions = {
                    can_read: share.can_read,
                    can_write: share.can_write,
                    can_delete: share.can_delete,
                    can_assign: share.can_assign,
                    can_share: share.can_share,
                  };

                  return (
                    <div
                      key={share.share_id}
                      className="flex items-start gap-3 px-3 py-3 bg-white border border-slate-100 rounded-xl"
                    >
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                        {isUser ? (
                          <span className="text-blue-700 text-[10px] font-bold uppercase">
                            {(share.principal_label ?? '?').slice(0, 2)}
                          </span>
                        ) : (
                          <Users size={13} className="text-blue-600" />
                        )}
                      </div>

                      {/* Label + permissions */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <p className="text-[12px] font-medium text-slate-700 truncate">
                            {share.principal_label ?? '—'}
                          </p>
                          <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full">
                            {isUser ? 'User' : 'Team'}
                          </span>
                        </div>
                        {isUpdating ? (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Loader2 size={10} className="animate-spin" /> Saving…
                          </div>
                        ) : (
                          <PermissionMatrix
                            perms={currentPerms}
                            onChange={(p) => handlePermissionsChange(share, p)}
                            compact
                          />
                        )}
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => handleRemove(share.share_id)}
                        disabled={isRemoving}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40 shrink-0"
                        title="Remove share"
                      >
                        {isRemoving
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Trash2 size={12} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {bulkIds
              ? `Share settings will be applied to all ${bulkIds.length} selected records. Shared users or teams will access them according to the rights granted above.`
              : 'Shared users or teams can access this record according to the rights granted above, regardless of their Business Unit scope.'
            }
          </p>
        </div>

        <div className="flex justify-end px-5 py-3.5 border-t border-slate-100 bg-slate-50 shrink-0">
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
