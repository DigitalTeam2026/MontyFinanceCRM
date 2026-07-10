import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';

export interface ComboOption {
  value: string;
  label: string;
  group?: string;   // optional section header (e.g. "Related › Account")
  hint?: string;    // optional right-aligned muted hint (e.g. field type)
}

interface Props {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchPlaceholder?: string;
}

/**
 * Searchable single-select combobox. The option list renders in a portal anchored
 * below the trigger, so it floats ABOVE surrounding content and never pushes or
 * hides the layout beneath it (the reason a native <select> was covering the
 * Sort by / Row limit controls). Closes on outside-click, Escape, or scroll.
 */
export default function Combobox({
  options, value, onChange, placeholder = 'Select…', disabled, className = '', searchPlaceholder = 'Search…',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q));
  }, [options, query]);

  // Position the popover under the trigger.
  const place = () => { if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect()); };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    // Scrolling INSIDE the option list must not close the popover. Scrolling the
    // page (any ancestor) just re-aligns it to the trigger so it stays open.
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      place();
    };
    const onResize = () => place();
    const onDown = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const trigger = `flex h-9 w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-left outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:opacity-50 ${className}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { setQuery(''); setOpen((v) => !v); }}
        className={trigger}
      >
        <span className={`flex-1 truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="shrink-0 text-slate-400" />
      </button>

      {open && rect && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }}
          className="rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5">
            <Search size={13} className="text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-[12px] text-slate-400">No matches</p>}
            {filtered.map((o, i) => {
              const showGroup = o.group && o.group !== filtered[i - 1]?.group;
              return (
                <div key={`${o.group ?? ''}:${o.value}`}>
                  {showGroup && (
                    <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{o.group}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => { onChange(o.value); setOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-blue-50 ${o.value === value ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}`}
                  >
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="shrink-0 text-[11px] text-slate-400">{o.hint}</span>}
                    {o.value === value && <Check size={13} className="shrink-0 text-blue-600" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
