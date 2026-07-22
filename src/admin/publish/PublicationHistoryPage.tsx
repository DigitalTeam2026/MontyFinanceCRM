import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { getHistory, rollbackTo, type PublicationRecord } from './publicationService';
import { moduleLabel } from './customizationRegistry';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast, toFriendlyError } from '../../app/context/ToastContext';

export default function PublicationHistoryPage() {
  const { showSuccess, showError } = useToast();
  const [rows, setRows] = useState<PublicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getHistory());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRollback = async (version: number) => {
    setRollbackTarget(null);
    setBusy(version);
    try {
      await rollbackTo(version);
      await load();
      showSuccess(`Rolled back to version ${version}.`);
    } catch (e) {
      const msg = toFriendlyError(e, `Unable to roll back to version ${version}.`);
      setError(msg);
      showError(msg);
    } finally {
      setBusy(null);
    }
  };

  const latest = rows.length > 0 ? rows[0].customization_version : 0;

  return (
    <div className="flex-1 overflow-auto p-5">
      {error && <div className="mb-3 text-[12px] text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-[12px]"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-400 text-[12px]">No publications yet.</div>
      ) : (
        <div className="border border-slate-200 rounded overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Published</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Changes</th>
                <th className="px-3 py-2 font-medium">Components</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const components = Object.entries(r.component_summary ?? {});
                const failed = r.publication_status === 'failed';
                return (
                  <tr key={r.publication_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      v{r.customization_version}
                      {r.customization_version === latest && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">Current</span>}
                      {r.rolled_back_from != null && <span className="ml-1.5 text-[10px] text-slate-400">↩ from v{r.rolled_back_from}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{new Date(r.published_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {failed ? (
                        <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={12} /> {r.publication_status}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={12} /> {r.publication_status}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{r.change_count}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {components.length === 0 ? '—' : components.map(([k, c]) => `${moduleLabel(k)} (${c})`).join(', ')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.customization_version !== latest && !failed && (
                        <button
                          onClick={() => setRollbackTarget(r.customization_version)}
                          disabled={busy != null}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                        >
                          {busy === r.customization_version ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                          Roll back
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rollbackTarget != null && (
        <ConfirmDialog
          title={`Roll back to version ${rollbackTarget}?`}
          message="This creates a NEW published version with that configuration. History is preserved."
          confirmLabel="Roll back"
          onCancel={() => setRollbackTarget(null)}
          onConfirm={() => void handleRollback(rollbackTarget)}
        />
      )}
    </div>
  );
}
