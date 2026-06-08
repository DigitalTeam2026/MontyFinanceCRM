import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Loader2, Trash2, Star, StarOff, Search, X,
  Users, ChevronDown, AlertCircle, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast, toFriendlyError } from '../../context/ToastContext';

export const CONTACT_ROLES: { value: string; label: string; color: string }[] = [
  { value: 'primary',        label: 'Primary',         color: 'bg-blue-100 text-blue-700' },
  { value: 'business_owner', label: 'Business Owner',  color: 'bg-amber-100 text-amber-700' },
  { value: 'finance',        label: 'Finance',         color: 'bg-emerald-100 text-emerald-700' },
  { value: 'compliance',     label: 'Compliance',      color: 'bg-red-100 text-red-700' },
  { value: 'operations',     label: 'Operations',      color: 'bg-cyan-100 text-cyan-700' },
  { value: 'technical',      label: 'Technical',       color: 'bg-slate-100 text-slate-700' },
  { value: 'legal',          label: 'Legal',           color: 'bg-orange-100 text-orange-700' },
  { value: 'other',          label: 'Other',           color: 'bg-slate-100 text-slate-500' },
];

function roleMeta(value: string) {
  return CONTACT_ROLES.find((r) => r.value === value) ?? CONTACT_ROLES[CONTACT_ROLES.length - 1];
}

interface StakeholderRow {
  opportunity_contact_id: string;
  contact_id: string;
  role: string;
  is_primary: boolean;
  notes: string | null;
  added_at: string;
  contact: {
    first_name: string;
    last_name: string;
    job_title: string | null;
    email: string | null;
    business_phone: string | null;
  } | null;
}

interface ContactSearchResult {
  contact_id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  email: string | null;
  account_name: string | null;
}

function RoleBadge({ role }: { role: string }) {
  const m = roleMeta(role);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${m.color}`}>
      {m.label}
    </span>
  );
}

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="appearance-none h-6 pl-2 pr-6 text-[11px] border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
      >
        {CONTACT_ROLES.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <ChevronDown size={9} className="absolute right-1.5 text-slate-400 pointer-events-none" />
    </div>
  );
}

function ContactSearchDropdown({
  opportunityId,
  existingContactIds,
  onSelect,
  onClose,
}: {
  opportunityId: string;
  existingContactIds: Set<string>;
  onSelect: (c: ContactSearchResult) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      let qb = supabase
        .from('contact')
        .select('contact_id, first_name, last_name, job_title, email, account:account_id(account_name)')
        .eq('is_deleted', false)
        .order('last_name', { ascending: true })
        .limit(12);

      if (q.trim()) {
        qb = qb.or(`first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%`);
      }

      const { data } = await qb;
      const rows = (data ?? []).map((r: Record<string, unknown>) => ({
        contact_id: r.contact_id as string,
        first_name: r.first_name as string,
        last_name: r.last_name as string,
        job_title: r.job_title as string | null,
        email: r.email as string | null,
        account_name: (r.account as { account_name?: string } | null)?.account_name ?? null,
      }));
      setResults(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 200);
    return () => clearTimeout(t);
  }, [query, search]);

  return (
    <div
      ref={containerRef}
      className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-xl w-80"
    >
      <div className="p-2 border-b border-slate-100">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts by name or email..."
            className="w-full h-7 pl-7 pr-2 text-[12px] border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          {loading && <Loader2 size={10} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {results.length === 0 && !loading ? (
          <p className="px-3 py-4 text-center text-[12px] text-slate-400">
            {query ? 'No contacts found' : 'Start typing to search'}
          </p>
        ) : (
          results.map((c) => {
            const alreadyAdded = existingContactIds.has(c.contact_id);
            return (
              <button
                key={c.contact_id}
                onClick={() => !alreadyAdded && onSelect(c)}
                disabled={alreadyAdded}
                className={`w-full flex items-start gap-2 px-3 py-2 text-left transition ${
                  alreadyAdded
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-[#ebf1fa] cursor-pointer'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-semibold text-slate-500">
                    {(c.first_name?.[0] ?? '') + (c.last_name?.[0] ?? '')}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-slate-800 truncate">
                    {c.first_name} {c.last_name}
                    {alreadyAdded && <span className="ml-1.5 text-[10px] text-slate-400 font-normal">Added</span>}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {[c.job_title, c.account_name].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

interface Props {
  opportunityId: string;
  userId?: string;
  readonly?: boolean;
  onOpenContact?: (contactId: string) => void;
}

export default function OpportunityContactsPanel({ opportunityId, userId, readonly = false, onOpenContact }: Props) {
  const { showError } = useToast();
  const [rows, setRows] = useState<StakeholderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [addingRole, setAddingRole] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('opportunity_contact')
        .select(`
          opportunity_contact_id,
          contact_id,
          role,
          is_primary,
          notes,
          added_at,
          contact:contact_id (
            first_name,
            last_name,
            job_title,
            email,
            business_phone
          )
        `)
        .eq('opportunity_id', opportunityId)
        .order('is_primary', { ascending: false })
        .order('added_at', { ascending: true });

      if (err) throw err;
      setRows((data ?? []) as StakeholderRow[]);
    } catch {
      setError('Unable to load stakeholders.');
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => { load(); }, [load]);

  const existingContactIds = new Set(rows.map((r) => r.contact_id));

  const handleAddContact = async (c: ContactSearchResult) => {
    setShowSearch(false);
    if (!userId) return;
    const selectedRole = addingRole[c.contact_id] ?? 'other';
    try {
      const isPrimary = rows.length === 0;
      const { error: err } = await supabase.from('opportunity_contact').insert({
        opportunity_id: opportunityId,
        contact_id: c.contact_id,
        role: selectedRole,
        is_primary: isPrimary,
        added_by: userId,
      });
      if (err) throw err;
      await load();
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to add contact.'));
    }
  };

  const handleRoleChange = async (rowId: string, newRole: string) => {
    setUpdatingId(rowId);
    try {
      const { error: err } = await supabase
        .from('opportunity_contact')
        .update({ role: newRole })
        .eq('opportunity_contact_id', rowId);
      if (err) throw err;
      setRows((prev) => prev.map((r) => r.opportunity_contact_id === rowId ? { ...r, role: newRole } : r));
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to update role.'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSetPrimary = async (rowId: string, contactId: string) => {
    setUpdatingId(rowId);
    try {
      const { error: clearErr } = await supabase
        .from('opportunity_contact')
        .update({ is_primary: false })
        .eq('opportunity_id', opportunityId)
        .eq('is_primary', true);
      if (clearErr) throw clearErr;

      const { error: setErr } = await supabase
        .from('opportunity_contact')
        .update({ is_primary: true })
        .eq('opportunity_contact_id', rowId);
      if (setErr) throw setErr;

      await supabase.from('opportunity').update({ primary_contact_id: contactId }).eq('opportunity_id', opportunityId);

      await load();
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to set primary contact.'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (rowId: string) => {
    setDeletingId(rowId);
    try {
      const { error: err } = await supabase
        .from('opportunity_contact')
        .delete()
        .eq('opportunity_contact_id', rowId);
      if (err) throw err;
      setRows((prev) => prev.filter((r) => r.opportunity_contact_id !== rowId));
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to remove contact.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div ref={headerRef} className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Users size={12} className="text-slate-400" />
          <span className="text-[12px] font-semibold text-slate-700">Stakeholders</span>
          {!loading && (
            <span className="text-[10px] text-slate-400 font-medium bg-slate-200 px-1.5 py-0.5 rounded-full">
              {rows.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 relative">
          <button
            onClick={load}
            disabled={loading}
            className="p-1 text-slate-400 hover:text-slate-600 transition rounded border border-transparent hover:border-slate-200 hover:bg-slate-100"
            title="Refresh"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          </button>
          {userId && !readonly && (
            <div className="relative">
              <button
                onClick={() => setShowSearch((v) => !v)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-blue-600 rounded transition"
              >
                <Plus size={10} />
                Add
              </button>
              {showSearch && (
                <ContactSearchDropdown
                  opportunityId={opportunityId}
                  existingContactIds={existingContactIds}
                  onSelect={handleAddContact}
                  onClose={() => setShowSearch(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={14} className="animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 px-4 py-4 text-[12px] text-red-500">
          <AlertCircle size={13} />
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Users size={16} className="text-slate-300" />
          <p className="text-[11px] text-slate-400">No stakeholders added yet</p>
          {userId && !readonly && (
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium transition mt-0.5"
            >
              <Plus size={10} />
              Add a contact
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {rows.map((row) => {
            const c = row.contact;
            const fullName = c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : 'Unknown';
            const initials = c
              ? ((c.first_name?.[0] ?? '') + (c.last_name?.[0] ?? '')).toUpperCase()
              : '?';
            const isBusy = updatingId === row.opportunity_contact_id || deletingId === row.opportunity_contact_id;

            return (
              <div
                key={row.opportunity_contact_id}
                className={`flex items-center gap-3 px-3 py-2.5 group hover:bg-[#ebf1fa] transition-colors duration-100 ${isBusy ? 'opacity-60' : ''}`}
              >
                <div className="relative flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                    row.is_primary ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300 ring-offset-1' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {initials}
                  </div>
                  {row.is_primary && (
                    <Star size={8} className="absolute -top-0.5 -right-0.5 text-amber-500 fill-amber-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {onOpenContact ? (
                      <button
                        onClick={() => onOpenContact(row.contact_id)}
                        className="text-[12px] font-medium text-blue-600 hover:text-blue-800 hover:underline truncate"
                      >
                        {fullName}
                      </button>
                    ) : (
                      <span className="text-[12px] font-medium text-slate-800 truncate">{fullName}</span>
                    )}
                    {row.is_primary && (
                      <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wide bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {c?.job_title && (
                      <span className="text-[11px] text-slate-400 truncate">{c.job_title}</span>
                    )}
                    {c?.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="text-[11px] text-slate-400 hover:text-blue-500 truncate transition"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.email}
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <RoleSelect
                    value={row.role}
                    onChange={(v) => handleRoleChange(row.opportunity_contact_id, v)}
                    disabled={isBusy || !userId || readonly}
                  />

                  {!readonly && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!row.is_primary && userId && (
                        <button
                          onClick={() => handleSetPrimary(row.opportunity_contact_id, row.contact_id)}
                          disabled={isBusy}
                          title="Set as primary contact"
                          className="p-1 rounded text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition disabled:cursor-not-allowed"
                        >
                          {isBusy && updatingId === row.opportunity_contact_id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <StarOff size={11} />}
                        </button>
                      )}
                      {userId && (
                        <button
                          onClick={() => handleRemove(row.opportunity_contact_id)}
                          disabled={isBusy}
                          title="Remove from deal"
                          className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition disabled:cursor-not-allowed"
                        >
                          {isBusy && deletingId === row.opportunity_contact_id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Trash2 size={11} />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
