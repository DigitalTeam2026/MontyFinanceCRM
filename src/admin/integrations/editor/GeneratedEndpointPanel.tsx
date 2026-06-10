import { useState } from 'react';
import { Copy, Check, RefreshCw, CircleDot, Clock, Loader2 } from 'lucide-react';
import type { HttpMethod } from '../../../types/apiIntegration';
import ConfirmDialog from '../../components/ConfirmDialog';

interface Props {
  url: string;
  method: HttpMethod;
  isActive: boolean;
  lastRequestAt: string | null;
  /** Undefined until the integration has been saved (no key yet). */
  saved: boolean;
  onRegenerate: () => Promise<void>;
}

export default function GeneratedEndpointPanel({
  url, method, isActive, lastRequestAt, saved, onRegenerate,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  async function doRegenerate() {
    setConfirm(false);
    setRegenerating(true);
    try {
      await onRegenerate();
    } finally {
      setRegenerating(false);
    }
  }

  if (!saved) {
    return (
      <div className="text-sm text-slate-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-4 py-4 text-center">
        A unique, secure endpoint URL is generated automatically when you save this integration.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status row */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
          {method}
        </span>
        <span className={`inline-flex items-center gap-1.5 font-medium ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
          <CircleDot size={12} /> {isActive ? 'Active' : 'Inactive'}
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-400">
          <Clock size={12} />
          Last request: {lastRequestAt ? new Date(lastRequestAt).toLocaleString() : 'never'}
        </span>
      </div>

      {/* URL row */}
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-gray-200 rounded-lg px-3 hover:bg-gray-50 transition-colors"
        >
          {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={() => setConfirm(true)}
          disabled={regenerating}
          className="flex items-center gap-1.5 text-xs font-medium text-amber-700 border border-amber-200 bg-amber-50 rounded-lg px-3 hover:bg-amber-100 transition-colors disabled:opacity-60"
        >
          {regenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Regenerate
        </button>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        External systems send requests here to create or update records. Authentication is enforced
        by the configured Authentication and Custom Headers below. Regenerating the URL immediately
        stops the previous one from working.
      </p>

      {confirm && (
        <ConfirmDialog
          title="Regenerate endpoint URL?"
          message="The current URL will stop working immediately. Any external system using it must be updated with the new URL."
          confirmLabel="Regenerate"
          danger
          onConfirm={doRegenerate}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
