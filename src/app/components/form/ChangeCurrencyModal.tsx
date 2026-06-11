import { useState } from 'react';
import { AlertTriangle, X, Loader2, ShieldAlert, CheckCircle2 } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import type { AppEntity } from '../../types';
import type { CurrencyRecord } from '../../services/currencyService';
import { MONETARY_FIELDS, executeControlledCurrencyChange } from '../../services/currencyService';

interface ChangeCurrencyModalProps {
  entity: AppEntity;
  recordId: string;
  userId: string;
  currencies: CurrencyRecord[];
  currentCurrency: CurrencyRecord | undefined;
  currentValues: Record<string, unknown>;
  lockReason?: string | null;
  onClose: () => void;
  onComplete: (newCurrencyId: string, clearedFields: string[]) => void;
}

export default function ChangeCurrencyModal({
  entity,
  recordId,
  userId,
  currencies,
  currentCurrency,
  currentValues,
  lockReason,
  onClose,
  onComplete,
}: ChangeCurrencyModalProps) {
  const [selectedCurrencyId, setSelectedCurrencyId] = useState(currentCurrency?.currency_id ?? '');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monetaryFields = MONETARY_FIELDS[entity] ?? [];
  const affectedFields = monetaryFields.filter((f) => {
    const v = currentValues[f];
    return v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
  });

  const selectedCurrency = currencies.find((c) => c.currency_id === selectedCurrencyId);
  const isSameCurrency = selectedCurrencyId === currentCurrency?.currency_id;

  const FIELD_LABELS: Record<string, string> = {
    annual_revenue: 'Annual Revenue',
    estimated_value: 'Estimated Value',
    actual_value: 'Actual Value',
  };

  const handleSubmit = async () => {
    if (!selectedCurrencyId || isSameCurrency || !reason.trim() || !confirmed) return;
    setSaving(true);
    setError(null);
    try {
      await executeControlledCurrencyChange({
        entity,
        recordId,
        newCurrencyId: selectedCurrencyId,
        changedBy: userId,
        reason: reason.trim(),
        clearedFields: affectedFields,
        previousCurrencyId: currentCurrency?.currency_id ?? null,
        currencies,
      });
      onComplete(selectedCurrencyId, affectedFields);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to change currency. Please try again.');
      setSaving(false);
    }
  };

  const canSubmit = selectedCurrencyId && !isSameCurrency && reason.trim().length >= 5 && confirmed && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
              <ShieldAlert size={16} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-slate-800">Change Record Currency</h2>
              <p className="text-[11px] text-amber-700 font-medium">Privileged operation — requires reason and confirmation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {lockReason === 'status_threshold' && (
            <div className="flex items-start gap-3 p-3.5 bg-orange-50 border border-orange-200 rounded-lg">
              <AlertTriangle size={14} className="text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold text-orange-700 mb-1">Locked by status threshold</p>
                <p className="text-[11px] text-orange-600 leading-relaxed">
                  This record's currency was locked because its status advanced past a business process threshold
                  (e.g. Qualified, Won, Active). Override requires a valid business reason and will be fully audited.
                </p>
              </div>
            </div>
          )}
          {affectedFields.length > 0 && (
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold text-red-700 mb-1">Monetary fields will be cleared</p>
                <p className="text-[11px] text-red-600 leading-relaxed">
                  The following fields contain values that cannot be automatically converted.
                  They will be set to blank and must be re-entered in the new currency:
                </p>
                <ul className="mt-2 space-y-0.5">
                  {affectedFields.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-[11px] text-red-700 font-medium">
                      <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                      {FIELD_LABELS[f] ?? f}
                      <span className="text-red-400 font-normal">
                        ({currentCurrency?.symbol ?? ''}{String(currentValues[f])})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              New Currency
            </label>
            <SearchableSelect
              options={currencies.map((c) => ({
                value: c.currency_id,
                label: `${c.code} — ${c.name} (${c.symbol})${c.currency_id === currentCurrency?.currency_id ? ' · current' : ''}`,
              }))}
              value={selectedCurrencyId}
              onChange={setSelectedCurrencyId}
              placeholder="Select currency…"
            />
            {selectedCurrency && !isSameCurrency && (
              <p className="mt-1 text-[11px] text-slate-500">
                Changing from <span className="font-semibold text-slate-700">{currentCurrency?.code ?? '—'}</span> to{' '}
                <span className="font-semibold text-blue-600">{selectedCurrency.code}</span> ({selectedCurrency.name})
              </p>
            )}
            {isSameCurrency && selectedCurrencyId && (
              <p className="mt-1 text-[11px] text-amber-600">This is the current currency. Select a different one.</p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              Reason for change <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this currency change is needed…"
              rows={3}
              className="w-full px-3 py-2 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-slate-700 placeholder:text-slate-300"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Minimum 5 characters. This will be recorded in the audit log.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition ${
                  confirmed ? 'bg-blue-600 border-blue-600' : 'border-slate-300 group-hover:border-blue-400'
                }`}
              >
                {confirmed && <CheckCircle2 size={10} className="text-white" />}
              </div>
            </div>
            <span className="text-[12px] text-slate-600 leading-relaxed">
              I understand that{' '}
              {affectedFields.length > 0
                ? `${affectedFields.length} monetary field${affectedFields.length > 1 ? 's' : ''} will be cleared`
                : 'the currency on this record will be changed'}
              , this action will be recorded in the audit log, and the currency will remain unlocked until new monetary values are saved.
            </span>
          </label>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
              <AlertTriangle size={12} className="shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-[12px] font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Applying…
              </>
            ) : (
              <>
                <ShieldAlert size={12} />
                Apply Currency Change
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
