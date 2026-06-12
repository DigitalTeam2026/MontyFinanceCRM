import FilterSelect from '../FilterSelect';
import { X } from 'lucide-react';
import type { FieldDefinition } from '../../../types/field';

interface FieldControlProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  isReadonly?: boolean;
  isRequired?: boolean;
  isHidden?: boolean;
  error?: string;
  ruleMessage?: { text: string; level: 'info' | 'warning' | 'error' } | null;
  currencySymbol?: string;
}

const INPUT_BASE =
  'w-full text-[13px] text-slate-800 border border-slate-200 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition placeholder-slate-400 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed';

function parseMultiChoiceValue(value: unknown): string[] {
  if (Array.isArray(value)) return (value as unknown[]).map(String).filter(Boolean);
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try { return (JSON.parse(s) as unknown[]).map(String).filter(Boolean); } catch { /* fall through */ }
    }
    return s.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

export default function FieldControl({
  field,
  value,
  onChange,
  isReadonly = false,
  isRequired,
  isHidden = false,
  error,
  ruleMessage,
  currencySymbol,
}: FieldControlProps) {
  if (isHidden) return null;

  const typeName = field.field_type?.name ?? 'text';
  const required = isRequired ?? field.is_required;
  const strVal = value == null ? '' : String(value);

  const msgColors = {
    info: 'text-blue-600 bg-blue-50 border-blue-200',
    warning: 'text-amber-700 bg-amber-50 border-amber-200',
    error: 'text-red-600 bg-red-50 border-red-200',
  };

  const renderInput = () => {
    if (typeName === 'textarea') {
      return (
        <textarea
          rows={3}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={isReadonly}
          className={`${INPUT_BASE} resize-y min-h-[72px]`}
          placeholder={field.placeholder ?? ''}
        />
      );
    }

    if (typeName === 'boolean') {
      const boolStr = value === true || value === 'true' ? 'true'
        : value === false || value === 'false' ? 'false'
        : '';
      return (
        <FilterSelect
          value={boolStr}
          onChange={(e) => {
            if (e.target.value === '') onChange(null);
            else onChange(e.target.value === 'true');
          }}
          disabled={isReadonly}
          className={INPUT_BASE}
        >
          <option value="">-- Select --</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </FilterSelect>
      );
    }

    if (typeName === 'date') {
      return (
        <input
          type="date"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={isReadonly}
          className={INPUT_BASE}
        />
      );
    }

    if (typeName === 'datetime') {
      const dtVal = strVal ? strVal.slice(0, 16) : '';
      return (
        <input
          type="datetime-local"
          value={dtVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={isReadonly}
          className={INPUT_BASE}
        />
      );
    }

    if (typeName === 'number' || typeName === 'integer') {
      return (
        <input
          type="number"
          value={strVal}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          disabled={isReadonly}
          min={field.min_value ?? undefined}
          max={field.max_value ?? undefined}
          className={INPUT_BASE}
          placeholder={field.placeholder ?? ''}
        />
      );
    }

    if (typeName === 'whole_number') {
      return (
        <div className="relative">
          <input
            type="number"
            step="any"
            value={strVal}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            disabled={isReadonly}
            className={`${INPUT_BASE} pr-7`}
            placeholder={field.placeholder ?? '0'}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400 pointer-events-none select-none">%</span>
        </div>
      );
    }

    if (typeName === 'decimal' || typeName === 'currency') {
      const symbol = typeName === 'currency' ? (currencySymbol ?? '$') : null;
      const symbolWidth = symbol && symbol.length > 1 ? 'pl-8' : 'pl-6';
      return (
        <div className="relative">
          {symbol && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400 pointer-events-none select-none">{symbol}</span>
          )}
          <input
            type="number"
            step="0.01"
            value={strVal}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            disabled={isReadonly}
            className={`${INPUT_BASE} ${symbol ? symbolWidth : ''}`}
            placeholder={field.placeholder ?? '0.00'}
          />
        </div>
      );
    }

    if (typeName === 'email') {
      return (
        <input
          type="email"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={isReadonly}
          className={INPUT_BASE}
          placeholder={field.placeholder ?? ''}
        />
      );
    }

    if (typeName === 'phone') {
      if (isReadonly && strVal) {
        return (
          <a
            href={`tel:${strVal.replace(/\s/g, '')}`}
            className="inline-flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-800 hover:underline py-1"
          >
            {strVal}
          </a>
        );
      }
      return (
        <input
          type="tel"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={isReadonly}
          className={INPUT_BASE}
          placeholder={field.placeholder ?? '+1 (555) 000-0000'}
        />
      );
    }

    if (typeName === 'url') {
      return (
        <input
          type="url"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={isReadonly}
          className={INPUT_BASE}
          placeholder={field.placeholder ?? 'https://'}
        />
      );
    }

    if (typeName === 'choice') {
      const choices = (field.config_json as { choices?: { value: string; label: string }[] } | null)?.choices ?? [];
      return (
        <FilterSelect
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={isReadonly}
          className={INPUT_BASE}
        >
          <option value="">— Select —</option>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </FilterSelect>
      );
    }

    if (typeName === 'multi_choice') {
      const choices = (field.config_json as { choices?: { value: string; label: string }[] } | null)?.choices ?? [];
      const selected = parseMultiChoiceValue(value);

      const toggle = (val: string) => {
        if (isReadonly) return;
        const next = selected.includes(val)
          ? selected.filter((v) => v !== val)
          : [...selected, val];
        onChange(next.length > 0 ? next : null);
      };

      if (isReadonly) {
        if (selected.length === 0) return <span className="text-[13px] text-slate-400">—</span>;
        return (
          <div className="flex flex-wrap gap-1.5 py-1">
            {selected.map((v) => {
              const ch = choices.find((c) => c.value === v);
              return (
                <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  {ch?.label ?? v}
                </span>
              );
            })}
          </div>
        );
      }

      return (
        <div className={`min-h-[38px] w-full border rounded-md bg-white transition ${error ? 'border-red-400' : 'border-slate-200 focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500'}`}>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1 px-2 pt-2">
              {selected.map((v) => {
                const ch = choices.find((c) => c.value === v);
                return (
                  <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    {ch?.label ?? v}
                    <button
                      type="button"
                      onClick={() => toggle(v)}
                      className="text-blue-400 hover:text-blue-700 focus:outline-none"
                    >
                      <X size={10} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="px-2 pb-1.5 pt-1">
            <div className="flex flex-wrap gap-1">
              {choices.filter((c) => !selected.includes(c.value)).map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggle(c.value)}
                  className="px-2 py-0.5 rounded-full text-[11px] border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition"
                >
                  + {c.label}
                </button>
              ))}
              {choices.filter((c) => !selected.includes(c.value)).length === 0 && selected.length > 0 && (
                <span className="text-[11px] text-slate-400 py-0.5">All options selected</span>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (typeName === 'lookup') {
      return (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={strVal}
            readOnly
            placeholder="Search..."
            className={`${INPUT_BASE} flex-1 cursor-pointer`}
          />
        </div>
      );
    }

    return (
      <input
        type="text"
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        disabled={isReadonly}
        maxLength={field.max_length ?? undefined}
        className={INPUT_BASE}
        placeholder={field.placeholder ?? ''}
      />
    );
  };

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
        {field.display_name}
        {required && <span className="text-red-500">*</span>}
      </label>
      {renderInput()}
      {error && (
        <p className="text-[11px] text-red-500">{error}</p>
      )}
      {ruleMessage && (
        <div className={`text-[11px] px-2 py-1 rounded border ${msgColors[ruleMessage.level]}`}>
          {ruleMessage.text}
        </div>
      )}
    </div>
  );
}
