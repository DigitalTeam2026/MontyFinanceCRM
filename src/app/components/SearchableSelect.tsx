import { useState, useRef, useEffect, useId, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Height class, defaults to h-10 */
  heightClass?: string;
}

interface MenuRect {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  heightClass = 'h-10',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [rect, setRect] = useState<MenuRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = search.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        (o.sublabel ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : options;

  // Position the portal menu relative to the trigger, flipping up if there
  // isn't enough room below in the viewport.
  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const MENU_MAX = 300; // approx max menu height (search + options)
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < MENU_MAX && r.top > spaceBelow;
    setRect({
      top: openUp ? r.top : r.bottom,
      left: r.left,
      width: r.width,
      openUp,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) { setSearch(''); return; }
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, reposition]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      id={id}
    >
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full ${heightClass} flex items-center gap-2 px-3 text-[12px] border rounded-lg bg-white transition
          ${open ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer'}
        `}
      >
        <span className={`flex-1 text-left truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleClear(e as unknown as React.MouseEvent)}
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <X size={11} />
            </span>
          )}
          <ChevronDown
            size={13}
            className={`text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {/* Dropdown — rendered in a portal so no overflow:hidden ancestor can clip it */}
      {open && rect && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            ...(rect.openUp
              ? { bottom: window.innerHeight - rect.top + 4 }
              : { top: rect.top + 4 }),
          }}
          className="z-[1000] min-w-[200px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        >
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
              <Search size={12} className="text-slate-400 shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="flex-1 min-w-0 bg-transparent text-[12px] text-slate-700 placeholder-slate-400 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false);
                  if (e.key === 'Enter' && filtered.length === 1) handleSelect(filtered[0].value);
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-slate-400 hover:text-slate-600 transition"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12px] text-slate-400">
                No results found
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full flex flex-col items-start gap-0.5 px-3 py-2 text-left transition hover:bg-slate-50
                    ${opt.value === value ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}
                  `}
                >
                  <span className="text-[12px] font-medium truncate w-full">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="text-[10px] text-slate-400 truncate w-full">{opt.sublabel}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
