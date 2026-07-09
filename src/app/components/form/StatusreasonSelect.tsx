import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface ReasonOption {
  value: string;   // reason_value as string
  label: string;
  color: string;
  statecodeValue: string; // parent state_value as string
}

interface StatuscodeSelectProps {
  entityDefinitionId: string;
  /** Current value of the parent statecode field (e.g. "1" or "2") */
  statecodeValue: string;
  value: string;
  onChange: (value: string) => void;
  isReadonly?: boolean;
  placeholder?: string;
}

const cache: Record<string, ReasonOption[]> = {};

interface DropPos { top: number; left: number; width: number; openUp: boolean }

const INPUT_BASE =
  'w-full text-[13px] text-slate-800 border border-slate-200 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition placeholder-slate-400 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed';

export default function StatusreasonSelect({
  entityDefinitionId,
  statecodeValue,
  value,
  onChange,
  isReadonly = false,
  placeholder = '— Select —',
}: StatuscodeSelectProps) {
  const [allReasons, setAllReasons] = useState<ReasonOption[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropPos, setDropPos] = useState<DropPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = `statuscode:${entityDefinitionId}`;
    if (cache[key]) { setAllReasons(cache[key]); return; }
    supabase
      .from('status_reason_definition')
      .select('reason_value, display_label, color, statecode_definition!inner(state_value)')
      .eq('entity_definition_id', entityDefinitionId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        const items: ReasonOption[] = (data ?? []).map((r) => ({
          value: String(r.reason_value),
          label: r.display_label,
          color: r.color ?? '#6B7280',
          statecodeValue: String((r.statecode_definition as unknown as { state_value: number }).state_value),
        }));
        cache[key] = items;
        setAllReasons(items);
      });
  }, [entityDefinitionId]);

  // Only show reasons for the currently selected statecode
  const options = statecodeValue
    ? allReasons.filter((r) => r.statecodeValue === statecodeValue)
    : allReasons;

  // Clear selection when statecode changes and current reason no longer belongs to it.
  // Guard: skip when allReasons is empty (still loading) to avoid a race condition on
  // initial form load where the effect fires before the async fetch completes.
  useEffect(() => {
    if (!value || !statecodeValue || allReasons.length === 0) return;
    const stillValid = allReasons
      .filter((r) => r.statecodeValue === statecodeValue)
      .some((r) => r.value === value);
    if (!stillValid) onChange('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statecodeValue]);

  const computePos = useCallback((): DropPos | null => {
    if (!buttonRef.current) return null;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropH = 260;
    const openUp = spaceBelow < dropH && rect.top > dropH;
    return {
      top: openUp ? rect.top + window.scrollY - dropH - 4 : rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
      openUp,
    };
  }, []);

  const openDropdown = () => { setDropPos(computePos()); setOpen(true); };

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
    else setSearch('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const selected = options.find((o) => o.value === value)
    ?? allReasons.find((o) => o.value === value); // show even if statecode not set yet

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const noStatecode = !statecodeValue;

  if (isReadonly) {
    return (
      <div className={`${INPUT_BASE} flex items-center gap-2`}>
        {selected ? (
          <>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />
            <span>{selected.label}</span>
          </>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={noStatecode}
        onClick={() => !noStatecode && (open ? setOpen(false) : openDropdown())}
        title={noStatecode ? 'Select a Status first' : undefined}
        className={`${INPUT_BASE} flex items-center justify-between text-left pr-8 ${open ? 'ring-1 ring-blue-500 border-blue-500' : ''} ${noStatecode ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />
            {selected.label}
          </span>
        ) : (
          <span className="text-slate-400">{noStatecode ? 'Select a Status first' : placeholder}</span>
        )}
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-400">
          {value && !noStatecode && (
            <span
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
              className="hover:text-slate-600 cursor-pointer p-0.5"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && dropPos && createPortal(
        <div
          ref={dropdownRef}
          data-overlay-portal=""
          style={{ position: 'absolute', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
        >
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full text-[12px] border border-slate-200 rounded-md pl-7 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-[12px] text-slate-400 hover:bg-slate-50"
            >
              {placeholder}
            </button>
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-[12px] text-slate-400 text-center">No status reasons</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-[12px] hover:bg-blue-50 transition-colors flex items-center gap-2 ${
                  o.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: o.color }} />
                {o.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
