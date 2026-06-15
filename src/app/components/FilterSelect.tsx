import {
  useState, useRef, useEffect, useId, useCallback, useLayoutEffect,
  Children, isValidElement,
} from 'react';
import type { ReactNode, ChangeEventHandler, SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { OVERLAY_Z } from './overlay/overlayTokens';

/**
 * Drop-in, API-compatible replacement for the native <select> element that adds
 * a type-to-filter search box. It accepts the same <option>/<optgroup> children,
 * the same `value`/`onChange`/`className`/`disabled` props, and fires an onChange
 * event shaped like a native one (`e.target.value`) so existing handlers keep
 * working verbatim.
 *
 * The search box only appears once there are enough options to be worth filtering
 * (> SEARCH_THRESHOLD) so tiny Yes/No pickers stay clean. When `multiple`/`size`
 * is set it transparently falls back to a real <select> (searchable multi-select
 * is out of scope).
 */

const SEARCH_THRESHOLD = 6;

interface FlatOption {
  value: string;
  text: string;
  node: ReactNode;
  disabled?: boolean;
  group?: string;
}

// Extends the native <select> attribute set so every standard prop/handler
// (onFocus, onBlur, id, title, style, name, aria-*, …) is typed exactly as it
// was on the original element and can be forwarded to the trigger unchanged.
interface FilterSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  placeholder?: string;
}

/** Flatten an arbitrary ReactNode tree of <option>/<optgroup> into a flat list. */
function collectOptions(children: ReactNode, group: string | undefined, out: FlatOption[]) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as Record<string, unknown>;
    if (child.type === 'optgroup') {
      collectOptions(props.children as ReactNode, String(props.label ?? ''), out);
      return;
    }
    if (child.type === 'option') {
      const rawValue = props.value;
      const node = props.children as ReactNode;
      const text = nodeToText(node);
      out.push({
        value: rawValue != null ? String(rawValue) : text,
        text,
        node: node ?? text,
        disabled: Boolean(props.disabled),
        group,
      });
      return;
    }
    // Fragments / arrays / conditionals — recurse so {cond && <option/>} works.
    if (props && 'children' in props) {
      collectOptions(props.children as ReactNode, group, out);
    }
  });
}

/** Best-effort string label for filtering, from a ReactNode's text content. */
function nodeToText(node: ReactNode): string {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  if (isValidElement(node)) return nodeToText((node.props as { children?: ReactNode }).children);
  return '';
}

interface MenuRect { top: number; left: number; width: number; openUp: boolean }

export default function FilterSelect({
  value,
  onChange,
  className = '',
  disabled = false,
  children,
  placeholder = 'Select…',
  multiple,
  size,
  style,
  title,
  name,
  ...rest
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [rect, setRect] = useState<MenuRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const MENU_MAX = 320;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < MENU_MAX && r.top > spaceBelow;
    setRect({ top: openUp ? r.top : r.bottom, left: r.left, width: r.width, openUp });
  }, []);

  useLayoutEffect(() => { if (open) reposition(); }, [open, reposition]);

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

  // Native fallback for multi-select / list boxes — searchable multi is out of scope.
  if (multiple || (size && size > 1)) {
    return (
      <select
        value={value}
        onChange={onChange}
        className={className}
        disabled={disabled}
        multiple={multiple}
        size={size}
        style={style}
        title={title}
        name={name}
        {...rest}
      >
        {children}
      </select>
    );
  }

  const options: FlatOption[] = [];
  collectOptions(children, undefined, options);

  const current = value != null ? String(value) : '';
  const selected = options.find((o) => o.value === current) ?? null;

  const emit = (next: string) => {
    if (onChange) {
      const fake = {
        target: { value: next, name },
        currentTarget: { value: next, name },
      } as unknown as Parameters<ChangeEventHandler<HTMLSelectElement>>[0];
      onChange(fake);
    }
    setOpen(false);
  };

  const showSearch = options.length > SEARCH_THRESHOLD;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.text.toLowerCase().includes(q))
    : options;

  // Group the filtered options preserving first-seen group order.
  const groupOrder: string[] = [];
  const grouped = new Map<string, FlatOption[]>();
  for (const o of filtered) {
    const key = o.group ?? '';
    if (!grouped.has(key)) { grouped.set(key, []); groupOrder.push(key); }
    grouped.get(key)!.push(o);
  }

  return (
    <div ref={containerRef} className="relative" id={id}>
      <button
        {...(rest as Record<string, unknown>)}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={style}
        title={title}
        className={`flex items-center gap-2 text-left ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      >
        <span className={`flex-1 truncate ${selected ? '' : 'text-slate-400'}`}>
          {selected ? selected.node : placeholder}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 opacity-60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          data-overlay-portal=""
          style={{
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            zIndex: OVERLAY_Z.popover,
            ...(rect.openUp
              ? { bottom: window.innerHeight - rect.top + 4 }
              : { top: rect.top + 4 }),
          }}
          className="min-w-[180px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        >
          {showSearch && (
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
                    if (e.key === 'Enter' && filtered.length === 1 && !filtered[0].disabled) emit(filtered[0].value);
                  }}
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 transition">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12px] text-slate-400">No results found</div>
            ) : (
              groupOrder.map((groupKey) => (
                <div key={groupKey || '__'}>
                  {groupKey && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {groupKey}
                    </div>
                  )}
                  {grouped.get(groupKey)!.map((opt, i) => (
                    <button
                      key={`${opt.value}-${i}`}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => !opt.disabled && emit(opt.value)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] transition
                        ${opt.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50'}
                        ${opt.value === current ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
                    >
                      <span className="flex-1 truncate">{opt.node}</span>
                      {opt.value === current && <Check size={12} className="shrink-0 text-blue-600" />}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
