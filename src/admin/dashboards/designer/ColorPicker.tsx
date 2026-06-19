import { useRef, useState, useEffect } from 'react';
import { RotateCcw, Check, Ban } from 'lucide-react';
import type { ThemeConfig } from '../types/dashboard';
import AnchoredPopover from '../../../app/components/overlay/AnchoredPopover';
import { themeSwatches } from '../visuals/colorConfig';

interface Props {
  value?: string;
  onChange: (v: string | undefined) => void;
  theme: ThemeConfig;
  /** Offer a "Transparent" choice (default true). */
  allowTransparent?: boolean;
  /** Caption shown on the trigger when no colour is set. */
  placeholder?: string;
}

const RECENT_KEY = 'dashboard:recentColors';
const MAX_RECENT = 12;

function readRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function pushRecent(c: string): string[] {
  const next = [c, ...readRecent().filter((x) => x !== c)].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore quota */ }
  return next;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function toHex6(v?: string): string {
  if (!v || !HEX_RE.test(v)) return '#4f8cff';
  if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v;
}
function hexToRgb(v: string): { r: number; g: number; b: number } {
  const h = toHex6(v);
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n || 0))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const SWATCH_TRANSPARENT =
  'repeating-conic-gradient(#94a3b8 0% 25%, #e2e8f0 0% 50%) 50% / 8px 8px';

export default function ColorPicker({ value, onChange, theme, allowTransparent = true, placeholder = 'Theme default' }: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [hexText, setHexText] = useState(value ?? '');
  const lastCommitted = useRef<string | undefined>(value);

  useEffect(() => { setHexText(value ?? ''); }, [value]);

  const isTransparent = value === 'transparent';
  const rgb = hexToRgb(value && HEX_RE.test(value) ? value : '#4f8cff');

  const commit = (c: string | undefined) => {
    onChange(c);
    if (c && c !== 'transparent' && c !== lastCommitted.current) {
      setRecent(pushRecent(c));
    }
    lastCommitted.current = c;
  };

  const swatchBg = !value ? 'transparent' : isTransparent ? undefined : value;

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-1.5 py-1 rounded border border-slate-700 bg-slate-900 hover:border-slate-500 text-left"
      >
        <span
          className="w-5 h-5 rounded border border-slate-600 shrink-0"
          style={isTransparent || !value ? { background: SWATCH_TRANSPARENT } : { background: swatchBg }}
        />
        <span className="text-[11px] text-slate-300 truncate flex-1">
          {value ? (isTransparent ? 'Transparent' : value) : placeholder}
        </span>
      </button>

      <AnchoredPopover anchorEl={anchor} open={open} onClose={() => setOpen(false)} width={236}
        className="rounded-lg border border-slate-600 bg-slate-800 shadow-xl p-3 text-slate-200">
        {/* native picker + hex */}
        <div className="flex items-center gap-2 mb-2.5">
          <input
            type="color"
            value={toHex6(value)}
            onChange={(e) => { setHexText(e.target.value); commit(e.target.value); }}
            className="w-9 h-9 rounded cursor-pointer bg-transparent border border-slate-600 p-0.5"
          />
          <div className="flex-1">
            <label className="block text-[9px] uppercase tracking-wide text-slate-500 mb-0.5">Hex</label>
            <input
              value={hexText}
              onChange={(e) => setHexText(e.target.value)}
              onBlur={() => { if (HEX_RE.test(hexText)) commit(hexText); else setHexText(value ?? ''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && HEX_RE.test(hexText)) commit(hexText); }}
              placeholder="#4f8cff"
              className="w-full px-1.5 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200"
            />
          </div>
        </div>

        {/* RGB */}
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          {(['r', 'g', 'b'] as const).map((ch) => (
            <div key={ch}>
              <label className="block text-[9px] uppercase tracking-wide text-slate-500 mb-0.5">{ch}</label>
              <input
                type="number" min={0} max={255} value={rgb[ch]}
                onChange={(e) => { const next = { ...rgb, [ch]: Number(e.target.value) }; commit(rgbToHex(next.r, next.g, next.b)); }}
                className="w-full px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200"
              />
            </div>
          ))}
        </div>

        {/* theme colours */}
        <p className="text-[9px] uppercase tracking-wide text-slate-500 mb-1">Theme colours</p>
        <div className="grid grid-cols-9 gap-1 mb-2.5">
          {themeSwatches(theme).map((s, i) => (
            <button key={`${s.value}-${i}`} type="button" title={s.label} onClick={() => commit(s.value)}
              className="w-full aspect-square rounded border border-slate-600 hover:scale-110 transition-transform relative"
              style={{ background: s.value }}>
              {value?.toLowerCase() === s.value.toLowerCase() && <Check size={10} className="absolute inset-0 m-auto text-white drop-shadow" />}
            </button>
          ))}
        </div>

        {/* recent */}
        {recent.length > 0 && (
          <>
            <p className="text-[9px] uppercase tracking-wide text-slate-500 mb-1">Recent</p>
            <div className="grid grid-cols-9 gap-1 mb-2.5">
              {recent.map((c) => (
                <button key={c} type="button" title={c} onClick={() => commit(c)}
                  className="w-full aspect-square rounded border border-slate-600 hover:scale-110 transition-transform"
                  style={{ background: c }} />
              ))}
            </div>
          </>
        )}

        {/* actions */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-700">
          {allowTransparent && (
            <button type="button" onClick={() => commit('transparent')}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-slate-700 hover:bg-slate-700 text-slate-300">
              <Ban size={11} /> Transparent
            </button>
          )}
          <button type="button" onClick={() => { commit(undefined); setOpen(false); }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-slate-700 hover:bg-slate-700 text-slate-300 ml-auto">
            <RotateCcw size={11} /> Theme default
          </button>
        </div>
      </AnchoredPopover>
    </>
  );
}
