import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface OptionItem {
  value: string;
  label: string;
}

interface OptionSetSelectProps {
  optionSetName: string;
  value: string;
  onChange: (value: string) => void;
  isReadonly?: boolean;
  placeholder?: string;
}

const cache: Record<string, OptionItem[]> = {};

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

export default function OptionSetSelect({
  optionSetName,
  value,
  onChange,
  isReadonly = false,
  placeholder = '— Select —',
}: OptionSetSelectProps) {
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropPos, setDropPos] = useState<DropdownPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cache[optionSetName]) {
      setOptions(cache[optionSetName]);
      return;
    }
    supabase
      .from('option_set')
      .select('option_set_id')
      .eq('name', optionSetName)
      .maybeSingle()
      .then(({ data: os }) => {
        if (!os) return;
        return supabase
          .from('option_set_value')
          .select('value, display_label')
          .eq('option_set_id', os.option_set_id)
          .eq('is_active', true)
          .order('sort_order');
      })
      .then((res) => {
        if (!res) return;
        const { data } = res;
        const items: OptionItem[] = (data ?? []).map((r) => ({
          value: r.value,
          label: r.display_label,
        }));
        cache[optionSetName] = items;
        setOptions(items);
      });
  }, [optionSetName]);

  const computePos = useCallback((): DropdownPos | null => {
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

  const openDropdown = () => {
    const pos = computePos();
    setDropPos(pos);
    setOpen(true);
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setSearch('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    const handleScroll = () => {
      if (open) setDropPos(computePos());
    };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, computePos]);

  const selected = options.find((o) => o.value === value);
  const filtered = search
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.value.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const INPUT_BASE =
    'w-full text-[13px] text-slate-800 border border-slate-200 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition placeholder-slate-400 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed';

  if (isReadonly) {
    return (
      <div className={`${INPUT_BASE} flex items-center`}>
        {selected ? (
          <span>{selected.label}</span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
      </div>
    );
  }

  const dropdown = open && dropPos
    ? createPortal(
        <div
          ref={dropdownRef}
          data-overlay-portal=""
          style={{
            position: 'absolute',
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            zIndex: 9999,
          }}
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
                placeholder="Search..."
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
              <div className="px-3 py-4 text-[12px] text-slate-400 text-center">No results</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-[12px] hover:bg-blue-50 transition-colors ${
                  o.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`${INPUT_BASE} flex items-center justify-between text-left pr-8 ${open ? 'ring-1 ring-blue-500 border-blue-500' : ''}`}
      >
        {selected ? (
          <span>{selected.label}</span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-400">
          {value && (
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
      {dropdown}
    </div>
  );
}
