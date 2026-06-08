import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, Star, StarOff, Plus, Check, X, CreditCard as Edit2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { CurrencyRecord } from '../../app/services/currencyService';
import { useToast } from '../../app/context/ToastContext';

interface EditRow {
  currency_id: string | null;
  code: string;
  name: string;
  symbol: string;
  exchange_rate: string;
}

const EMPTY_EDIT: EditRow = { currency_id: null, code: '', name: '', symbol: '', exchange_rate: '1' };

export default function CurrenciesPage() {
  const { showSuccess, showError } = useToast();
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editRow, setEditRow] = useState<EditRow | null>(null);
  const [confirmBase, setConfirmBase] = useState<CurrencyRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('currency')
        .select('*')
        .order('is_base', { ascending: false })
        .order('code');
      if (err) throw err;
      setCurrencies((data ?? []) as CurrencyRecord[]);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editRow) return;
    const rate = parseFloat(editRow.exchange_rate);
    if (!editRow.code.trim() || !editRow.name.trim() || !editRow.symbol.trim()) {
      showError('Code, name, and symbol are required.');
      return;
    }
    if (isNaN(rate) || rate <= 0) {
      showError('Exchange rate must be a positive number.');
      return;
    }
    setSaving(true);
    try {
      if (editRow.currency_id) {
        const { error: err } = await supabase
          .from('currency')
          .update({ code: editRow.code.trim().toUpperCase(), name: editRow.name.trim(), symbol: editRow.symbol.trim(), exchange_rate: rate })
          .eq('currency_id', editRow.currency_id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('currency')
          .insert({ code: editRow.code.trim().toUpperCase(), name: editRow.name.trim(), symbol: editRow.symbol.trim(), exchange_rate: rate, is_base: false, is_active: true });
        if (err) throw err;
      }
      setEditRow(null);
      await load();
      showSuccess('Currency saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSetBase = async (c: CurrencyRecord) => {
    setSaving(true);
    try {
      await supabase.from('currency').update({ is_base: false }).neq('currency_id', c.currency_id);
      await supabase.from('currency').update({ is_base: true, exchange_rate: 1, is_active: true }).eq('currency_id', c.currency_id);
      setConfirmBase(null);
      await load();
      showSuccess('Base currency updated');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (c: CurrencyRecord) => {
    if (c.is_base) return;
    setSaving(true);
    try {
      await supabase.from('currency').update({ is_active: !c.is_active }).eq('currency_id', c.currency_id);
      await load();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c: CurrencyRecord) => {
    setEditRow({ currency_id: c.currency_id, code: c.code, name: c.name, symbol: c.symbol, exchange_rate: String(c.exchange_rate) });
  };

  const baseCurrency = currencies.find((c) => c.is_base);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {baseCurrency && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <Star size={18} className="text-amber-500 fill-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-0.5">Base Currency</p>
              <p className="text-base font-semibold text-gray-900">{baseCurrency.name}</p>
              <p className="text-sm text-gray-500">{baseCurrency.code} &middot; {baseCurrency.symbol} &middot; Exchange rate locked at 1.000000</p>
            </div>
            <div className="text-xs text-gray-400 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-center leading-tight">
              All monetary values<br />are stored in this currency
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <DollarSign size={15} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-800">Currencies</span>
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{currencies.length}</span>
            </div>
            {!editRow && (
              <button
                onClick={() => setEditRow(EMPTY_EDIT)}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-1.5 transition-colors"
              >
                <Plus size={13} />
                Add Currency
              </button>
            )}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 w-8"></th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Code</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Symbol</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Exchange Rate</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Status</th>
                <th className="px-5 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {editRow && editRow.currency_id === null && (
                <NewRow
                  row={editRow}
                  onChange={setEditRow}
                  onSave={handleSave}
                  onCancel={() => setEditRow(null)}
                  saving={saving}
                />
              )}
              {currencies.map((c) =>
                editRow?.currency_id === c.currency_id ? (
                  <EditRowComponent
                    key={c.currency_id}
                    row={editRow}
                    isBase={c.is_base}
                    onChange={setEditRow}
                    onSave={handleSave}
                    onCancel={() => setEditRow(null)}
                    saving={saving}
                  />
                ) : (
                  <CurrencyRow
                    key={c.currency_id}
                    currency={c}
                    disabled={saving || !!editRow}
                    onEdit={() => startEdit(c)}
                    onSetBase={() => setConfirmBase(c)}
                    onToggleActive={() => handleToggleActive(c)}
                  />
                )
              )}
            </tbody>
          </table>

          {currencies.length === 0 && !editRow && (
            <div className="py-12 text-center text-sm text-gray-400">No currencies found.</div>
          )}
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          The base currency exchange rate is always 1. All other currencies use their exchange rate relative to the base. Deactivating a currency hides it from new record creation but does not affect existing records.
        </p>
      </div>

      {confirmBase && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Star size={16} className="text-amber-500 fill-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Set Base Currency</p>
                <p className="text-xs text-gray-500">This will change the system base currency</p>
              </div>
            </div>
            <p className="text-sm text-gray-700">
              Setting <span className="font-semibold">{confirmBase.name} ({confirmBase.code})</span> as the base currency will reset its exchange rate to 1.000000. Existing monetary values on records are <span className="font-semibold">not automatically converted</span>.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmBase(null)} className="text-xs font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg px-4 py-2 transition-colors">Cancel</button>
              <button
                onClick={() => handleSetBase(confirmBase)}
                disabled={saving}
                className="text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CurrencyRowProps {
  currency: CurrencyRecord;
  disabled: boolean;
  onEdit: () => void;
  onSetBase: () => void;
  onToggleActive: () => void;
}

function CurrencyRow({ currency: c, disabled, onEdit, onSetBase, onToggleActive }: CurrencyRowProps) {
  return (
    <tr className={`group transition-colors ${c.is_active ? 'hover:bg-gray-50' : 'bg-gray-50/60 opacity-60'}`}>
      <td className="px-5 py-3 text-center">
        {c.is_base ? (
          <Star size={14} className="text-amber-400 fill-amber-400 mx-auto" />
        ) : (
          <StarOff size={13} className="text-gray-300 mx-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </td>
      <td className="px-3 py-3">
        <span className="font-mono text-xs font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{c.code}</span>
      </td>
      <td className="px-3 py-3 text-gray-800 font-medium">{c.name}</td>
      <td className="px-3 py-3 text-gray-500 font-medium">{c.symbol}</td>
      <td className="px-3 py-3 text-right font-mono text-gray-700 text-xs">
        {c.is_base ? (
          <span className="text-amber-600 font-semibold">1.000000</span>
        ) : (
          c.exchange_rate.toFixed(6)
        )}
      </td>
      <td className="px-3 py-3">
        {c.is_base ? (
          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Base</span>
        ) : c.is_active ? (
          <span className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Active</span>
        ) : (
          <span className="text-[11px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">Inactive</span>
        )}
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!c.is_base && (
            <button
              onClick={onSetBase}
              disabled={disabled}
              title="Set as base currency"
              className="p-1.5 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-500 transition-colors disabled:opacity-40"
            >
              <Star size={13} />
            </button>
          )}
          <button
            onClick={onEdit}
            disabled={disabled}
            title="Edit"
            className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40"
          >
            <Edit2 size={13} />
          </button>
          {!c.is_base && (
            <button
              onClick={onToggleActive}
              disabled={disabled}
              title={c.is_active ? 'Deactivate' : 'Activate'}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
            >
              {c.is_active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

interface EditRowComponentProps {
  row: EditRow;
  isBase: boolean;
  onChange: (r: EditRow) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

function EditRowComponent({ row, isBase, onChange, onSave, onCancel, saving }: EditRowComponentProps) {
  return (
    <tr className="bg-blue-50/40">
      <td className="px-5 py-2" />
      <td className="px-3 py-2">
        <input
          value={row.code}
          onChange={(e) => onChange({ ...row, code: e.target.value })}
          maxLength={10}
          placeholder="USD"
          className="w-20 font-mono text-xs uppercase border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={row.name}
          onChange={(e) => onChange({ ...row, name: e.target.value })}
          placeholder="US Dollar"
          className="w-40 text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={row.symbol}
          onChange={(e) => onChange({ ...row, symbol: e.target.value })}
          maxLength={5}
          placeholder="$"
          className="w-16 text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          value={row.exchange_rate}
          onChange={(e) => onChange({ ...row, exchange_rate: e.target.value })}
          disabled={isBase}
          type="number"
          step="0.000001"
          min="0.000001"
          className="w-28 text-sm text-right font-mono border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-400"
        />
      </td>
      <td className="px-3 py-2" />
      <td className="px-5 py-2">
        <div className="flex items-center justify-end gap-1">
          <button onClick={onSave} disabled={saving} className="p-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
            <Check size={13} />
          </button>
          <button onClick={onCancel} disabled={saving} className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors disabled:opacity-50">
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

interface NewRowProps {
  row: EditRow;
  onChange: (r: EditRow) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

function NewRow({ row, onChange, onSave, onCancel, saving }: NewRowProps) {
  return (
    <tr className="bg-green-50/40 border-b border-green-100">
      <td className="px-5 py-2">
        <Plus size={13} className="text-green-500 mx-auto" />
      </td>
      <td className="px-3 py-2">
        <input
          value={row.code}
          onChange={(e) => onChange({ ...row, code: e.target.value })}
          maxLength={10}
          placeholder="EUR"
          autoFocus
          className="w-20 font-mono text-xs uppercase border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={row.name}
          onChange={(e) => onChange({ ...row, name: e.target.value })}
          placeholder="Euro"
          className="w-40 text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={row.symbol}
          onChange={(e) => onChange({ ...row, symbol: e.target.value })}
          maxLength={5}
          placeholder="€"
          className="w-16 text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          value={row.exchange_rate}
          onChange={(e) => onChange({ ...row, exchange_rate: e.target.value })}
          type="number"
          step="0.000001"
          min="0.000001"
          className="w-28 text-sm text-right font-mono border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </td>
      <td className="px-3 py-2">
        <span className="text-[11px] text-gray-400 italic">new</span>
      </td>
      <td className="px-5 py-2">
        <div className="flex items-center justify-end gap-1">
          <button onClick={onSave} disabled={saving} className="p-1.5 rounded bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50">
            <Check size={13} />
          </button>
          <button onClick={onCancel} disabled={saving} className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors disabled:opacity-50">
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}
