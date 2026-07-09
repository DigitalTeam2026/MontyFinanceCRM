import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Package, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface ProductOption {
  product_id: string;
  name: string;
  code: string;
  product_type: string;
  access_mode: string;
  lob_name: string | null;
  family_name: string | null;
}

interface Props {
  value: string;
  onChange: (value: string | null) => void;
  isReadonly?: boolean;
  placeholder?: string;
}

export default function ProductPickerSelect({ value, onChange, isReadonly = false, placeholder = 'Select a product...' }: Props) {
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('product')
      .select(`
        product_id, name, code, product_type, access_mode,
        line_of_business(name),
        product_family(name)
      `)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name')
      .then(({ data, error }) => {
        if (error) {
          console.error('ProductPickerSelect error:', error);
          setLoading(false);
          return;
        }
        setOptions(
          ((data ?? []) as unknown as {
            product_id: string;
            name: string;
            code: string;
            product_type: string;
            access_mode: string;
            line_of_business: { name: string } | null;
            product_family: { name: string } | null;
          }[]).map((p: {
            product_id: string;
            name: string;
            code: string;
            product_type: string;
            access_mode: string;
            line_of_business: { name: string } | null;
            product_family: { name: string } | null;
          }) => ({
            product_id: p.product_id,
            name: p.name,
            code: p.code,
            product_type: p.product_type,
            access_mode: p.access_mode,
            lob_name: p.line_of_business?.name ?? null,
            family_name: p.product_family?.name ?? null,
          }))
        );
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideContainer = containerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideContainer && !insideDropdown) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const recalcPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropHeight = Math.min(288, spaceBelow - 8);
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      maxHeight: dropHeight,
      zIndex: 9999,
    });
  };

  const selected = options.find((o) => o.product_id === value) ?? null;

  const filtered = options.filter((o) => {
    const q = search.toLowerCase();
    return (
      o.name.toLowerCase().includes(q) ||
      o.code.toLowerCase().includes(q) ||
      (o.lob_name ?? '').toLowerCase().includes(q) ||
      (o.family_name ?? '').toLowerCase().includes(q)
    );
  });

  const inputCls =
    'w-full text-[13px] text-slate-800 border border-slate-200 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition placeholder-slate-400 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed';

  if (isReadonly) {
    return (
      <div className={`${inputCls} flex items-center gap-2`}>
        {selected ? (
          <>
            <Package size={12} className="text-slate-400 flex-shrink-0" />
            <span className="truncate">{selected.name}</span>
            {selected.code && (
              <span className="text-[11px] text-slate-400 font-mono ml-auto flex-shrink-0">{selected.code}</span>
            )}
          </>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!open) recalcPosition();
          setOpen((v) => !v);
          setSearch('');
        }}
        className={`${inputCls} flex items-center gap-2 text-left cursor-pointer`}
      >
        {selected ? (
          <>
            <Package size={12} className="text-slate-400 flex-shrink-0" />
            <span className="flex-1 truncate">{selected.name}</span>
            {selected.code && (
              <span className="text-[11px] text-slate-400 font-mono flex-shrink-0">{selected.code}</span>
            )}
          </>
        ) : (
          <span className="flex-1 text-slate-400">{placeholder}</span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), onChange(null))}
              className="text-slate-300 hover:text-slate-500 transition cursor-pointer"
              title="Clear"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={12} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          data-overlay-portal=""
          style={dropdownStyle}
          className="bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Search size={12} className="text-slate-400 flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                autoFocus
                className="flex-1 text-[12px] text-slate-700 outline-none placeholder-slate-400"
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="px-3 py-4 text-[12px] text-slate-400 text-center">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-[12px] text-slate-400 text-center">No products found</div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
                  className="w-full text-left px-3 py-2 text-[12px] text-slate-400 hover:bg-slate-50 transition border-b border-slate-100"
                >
                  — None —
                </button>
                {filtered.map((opt) => (
                  <button
                    key={opt.product_id}
                    type="button"
                    onClick={() => { onChange(opt.product_id); setOpen(false); setSearch(''); }}
                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition flex items-start gap-2 ${
                      opt.product_id === value ? 'bg-blue-50' : ''
                    }`}
                  >
                    <Package size={12} className="text-slate-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-medium text-slate-800 truncate block">{opt.name}</span>
                      {(opt.lob_name || opt.family_name || opt.code) && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {[opt.lob_name, opt.family_name, opt.code].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    {opt.product_id === value && (
                      <span className="text-blue-500 flex-shrink-0 text-[10px] font-bold mt-0.5">✓</span>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
