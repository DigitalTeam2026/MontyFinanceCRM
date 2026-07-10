import { useEffect, useState } from 'react';
import { Plus, Mail, Trash2, Star, ToggleLeft, ToggleRight, Save, X } from 'lucide-react';
import type { AutomationEmailAccount } from '../../types/automationRule';
import {
  fetchEmailAccounts, createEmailAccount, updateEmailAccount, deleteEmailAccount,
  type EmailAccountInput,
} from '../../services/automationEmailAccountService';
import ConfirmDialog from '../components/ConfirmDialog';

const btnPrimary = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded';
const input = 'w-full px-2.5 py-1.5 text-[13px] border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';
const lbl = 'block text-[12px] font-medium text-slate-600 mb-1';

const EMPTY: EmailAccountInput = {
  name: '', from_address: '', tenant_id: '', client_id: '', client_secret: '',
  is_default: false, enabled: true,
};

export default function EmailAccountsPage() {
  const [accounts, setAccounts] = useState<AutomationEmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AutomationEmailAccount | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationEmailAccount | null>(null);

  const load = async () => {
    setLoading(true);
    try { setAccounts(await fetchEmailAccounts()); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const doDelete = async () => {
    if (!deleteTarget) return;
    await deleteEmailAccount(deleteTarget.account_id);
    setDeleteTarget(null);
    void load();
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <p className="text-[12px] text-slate-400 flex-1">
          The Azure app registration needs the <b>Application</b> permission <code>Mail.Send</code> (admin-consented).
          With those credentials it sends as the <b>From address</b> mailbox.
        </p>
        <button className={btnPrimary} onClick={() => setEditing('new')}><Plus size={15} /> Add account</button>
      </div>

      {editing && (
        <AccountForm
          account={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}

      {loading ? (
        <p className="text-[13px] text-slate-500">Loading…</p>
      ) : accounts.length === 0 && !editing ? (
        <div className="text-center py-16 text-slate-500">
          <Mail size={30} className="mx-auto mb-3 text-slate-300" />
          <p className="text-[13px]">No sender mailboxes yet.</p>
          <button className={`${btnPrimary} mt-4`} onClick={() => setEditing('new')}><Plus size={15} /> Add your first account</button>
        </div>
      ) : (
        <div className="space-y-2.5 mt-4">
          {accounts.map((a) => (
            <div key={a.account_id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
              <Mail size={16} className="text-blue-600 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-slate-800">{a.name}</span>
                  {a.is_default && (
                    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                      <Star size={11} /> Default
                    </span>
                  )}
                  {!a.enabled && <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Disabled</span>}
                </div>
                <p className="text-[12px] text-slate-500 mt-1">{a.from_address}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {a.client_id ? `Client ${a.client_id.slice(0, 8)}… · secret ${a.client_secret ? 'set' : 'missing'}` : 'Using GRAPH_* env credentials'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setEditing(a)} className="text-[12px] text-blue-600 hover:underline">Edit</button>
                <button onClick={() => setDeleteTarget(a)} title="Delete" className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete sender mailbox"
          message={`Delete "${deleteTarget.name}"? Flows using it will fall back to the default account.`}
          confirmLabel="Delete"
          danger
          onConfirm={doDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function AccountForm({
  account, onCancel, onSaved,
}: { account: AutomationEmailAccount | null; onCancel: () => void; onSaved: () => void }) {
  const [f, setF] = useState<EmailAccountInput>(
    account
      ? {
          name: account.name, from_address: account.from_address,
          tenant_id: account.tenant_id ?? '', client_id: account.client_id ?? '',
          client_secret: account.client_secret ?? '',
          is_default: account.is_default, enabled: account.enabled,
        }
      : { ...EMPTY },
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<EmailAccountInput>) => setF((x) => ({ ...x, ...p }));

  const save = async () => {
    if (!f.name.trim() || !f.from_address.trim()) { setErr('Name and From address are required.'); return; }
    setSaving(true); setErr(null);
    try {
      if (account) await updateEmailAccount(account.account_id, f);
      else await createEmailAccount(f);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-semibold text-slate-700">{account ? 'Edit account' : 'New account'}</span>
        <div className="flex-1" />
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 p-1"><X size={16} /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Name</label>
          <input className={input} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. No-Reply" />
        </div>
        <div>
          <label className={lbl}>From address (sends as)</label>
          <input className={input} value={f.from_address} onChange={(e) => set({ from_address: e.target.value })} placeholder="no-reply@montyholding.com" />
        </div>
        <div>
          <label className={lbl}>Azure tenant ID</label>
          <input className={input} value={f.tenant_id ?? ''} onChange={(e) => set({ tenant_id: e.target.value })} placeholder="tenant id or domain" />
        </div>
        <div>
          <label className={lbl}>Client ID</label>
          <input className={input} value={f.client_id ?? ''} onChange={(e) => set({ client_id: e.target.value })} placeholder="app registration client id" />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Client secret</label>
          <input className={input} type="password" autoComplete="new-password" value={f.client_secret ?? ''} onChange={(e) => set({ client_secret: e.target.value })} placeholder={account ? '•••••••• (leave to keep)' : 'client secret value'} />
        </div>
      </div>

      <div className="flex items-center gap-5 mt-3">
        <button onClick={() => set({ is_default: !f.is_default })} className="flex items-center gap-1.5 text-[12px] text-slate-600">
          {f.is_default ? <ToggleRight size={22} className="text-amber-500" /> : <ToggleLeft size={22} className="text-slate-400" />}
          Default account
        </button>
        <button onClick={() => set({ enabled: !f.enabled })} className="flex items-center gap-1.5 text-[12px] text-slate-600">
          {f.enabled ? <ToggleRight size={22} className="text-emerald-600" /> : <ToggleLeft size={22} className="text-slate-400" />}
          Enabled
        </button>
      </div>

      <p className="text-[11px] text-slate-400 mt-3">
        Leave the Azure fields blank to use the server's <code>GRAPH_*</code> environment credentials for this mailbox.
      </p>
      {err && <p className="text-[12px] text-red-600 mt-2">{err}</p>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
        <button onClick={save} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}><Save size={14} /> {saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
