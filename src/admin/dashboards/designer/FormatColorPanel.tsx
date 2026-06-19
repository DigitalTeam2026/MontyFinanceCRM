import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, RefreshCw, Wand2, Loader2 } from 'lucide-react';
import type { DashboardVisual, FormatConfig, ThemeConfig } from '../types/dashboard';
import { VISUAL_REGISTRY } from '../visuals/registry';
import { fetchColorKeys, type ColorKey } from '../visuals/colorConfig';
import ColorPicker from './ColorPicker';

type SetFmt = (patch: Partial<FormatConfig>) => void;

interface Props {
  visual: DashboardVisual;
  theme: ThemeConfig;
  setFmt: SetFmt;
}

/**
 * Every colour control for a visual's Format tab. Sections are shown per visual
 * type. All pickers write into format_config and fall back to the dashboard
 * theme when cleared — no colour is ever hard-coded in a renderer.
 */
export default function FormatColorPanel({ visual, theme, setFmt }: Props) {
  const fmt = visual.format_config;
  const type = visual.visual_type;
  const meta = VISUAL_REGISTRY[type];
  const isChart = meta?.category === 'chart';
  const isTable = type === 'table' || type === 'matrix' || type === 'record_list';
  const perCategory = ['pie', 'donut', 'funnel', 'treemap', 'waterfall'].includes(type)
    || (type === 'bar' && !!fmt.stacked);

  return (
    <div className="space-y-2">
      {/* ── General (all visuals) ─────────────────────────────────────────── */}
      <Section title="General colours" defaultOpen>
        <ColorRow label="Background" value={fmt.background} onChange={(v) => setFmt({ background: v })} theme={theme} />
        <ColorRow label="Border color" value={fmt.borderColor} onChange={(v) => setFmt({ borderColor: v })} theme={theme} />
        <NumRow label="Border width" value={fmt.borderWidth ?? 1} min={0} max={12} onChange={(n) => setFmt({ borderWidth: n })} />
        <ColorRow label="Accent color" value={fmt.accentColor} onChange={(v) => setFmt({ accentColor: v })} theme={theme} />
        <ColorRow label="Title color" value={fmt.titleColor} onChange={(v) => setFmt({ titleColor: v })} theme={theme} />
        <ColorRow label="Subtitle color" value={fmt.subtitleColor} onChange={(v) => setFmt({ subtitleColor: v })} theme={theme} />
        <ColorRow label="Main value color" value={fmt.valueColor} onChange={(v) => setFmt({ valueColor: v })} theme={theme} />
        <ColorRow label="Secondary text color" value={fmt.secondaryTextColor} onChange={(v) => setFmt({ secondaryTextColor: v })} theme={theme} />
        <ColorRow label="Icon color" value={fmt.iconColor} onChange={(v) => setFmt({ iconColor: v })} theme={theme} />
        <ColorRow label="Hover color" value={fmt.hoverColor} onChange={(v) => setFmt({ hoverColor: v })} theme={theme} />
        <ColorRow label="Selected color" value={fmt.selectedColor} onChange={(v) => setFmt({ selectedColor: v })} theme={theme} />
        <ColorRow label="Empty-state color" value={fmt.emptyStateColor} onChange={(v) => setFmt({ emptyStateColor: v })} theme={theme} />
        <NumRow label="Transparency / opacity" value={Math.round((fmt.opacity ?? 1) * 100)} min={0} max={100} suffix="%" onChange={(n) => setFmt({ opacity: Math.max(0, Math.min(1, n / 100)) })} />
      </Section>

      {/* ── KPI card ──────────────────────────────────────────────────────── */}
      {type === 'kpi' && (
        <>
          <Section title="KPI card colours" defaultOpen>
            <ColorRow label="Main value color" value={fmt.valueColor} onChange={(v) => setFmt({ valueColor: v })} theme={theme} />
            <ColorRow label="Total label color" value={fmt.totalLabelColor} onChange={(v) => setFmt({ totalLabelColor: v })} theme={theme} />
            <ColorRow label="Accent line color" value={fmt.accentColor} onChange={(v) => setFmt({ accentColor: v })} theme={theme} />
            <ColorRow label="Breakdown label color" value={fmt.breakdownLabelColor} onChange={(v) => setFmt({ breakdownLabelColor: v })} theme={theme} />
            <ColorRow label="Breakdown value color" value={fmt.breakdownValueColor} onChange={(v) => setFmt({ breakdownValueColor: v })} theme={theme} />
            <ColorRow label="Breakdown bar background" value={fmt.breakdownTrackColor} onChange={(v) => setFmt({ breakdownTrackColor: v })} theme={theme} />
          </Section>
          <ColorByValueSection visual={visual} theme={theme} fmt={fmt} setFmt={setFmt} title="Color by breakdown value" />
        </>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {isChart && type !== 'gauge' && (
        <Section title="Chart colours" defaultOpen>
          <ColorRow label="Legend text color" value={fmt.legendTextColor} onChange={(v) => setFmt({ legendTextColor: v })} theme={theme} />
          <ColorRow label="Axis text color" value={fmt.axisTextColor} onChange={(v) => setFmt({ axisTextColor: v })} theme={theme} />
          <ColorRow label="Axis line color" value={fmt.axisLineColor} onChange={(v) => setFmt({ axisLineColor: v })} theme={theme} />
          <ColorRow label="Grid line color" value={fmt.gridLineColor} onChange={(v) => setFmt({ gridLineColor: v })} theme={theme} />
          <ColorRow label="Data label color" value={fmt.dataLabelColor} onChange={(v) => setFmt({ dataLabelColor: v })} theme={theme} />
          <ColorRow label="Tooltip background" value={fmt.tooltipBg} onChange={(v) => setFmt({ tooltipBg: v })} theme={theme} />
          <ColorRow label="Tooltip text color" value={fmt.tooltipTextColor} onChange={(v) => setFmt({ tooltipTextColor: v })} theme={theme} />
        </Section>
      )}

      {/* Bar / line / waterfall — sign + target colours */}
      {['bar', 'line', 'area', 'combo', 'waterfall'].includes(type) && (
        <Section title="Series & value colours">
          <SeriesColorsRows visual={visual} theme={theme} fmt={fmt} setFmt={setFmt} />
          <ColorRow label="Positive color" value={fmt.positiveColor} onChange={(v) => setFmt({ positiveColor: v })} theme={theme} />
          <ColorRow label="Negative color" value={fmt.negativeColor} onChange={(v) => setFmt({ negativeColor: v })} theme={theme} />
          <ColorRow label="Target / reference line" value={fmt.targetColor} onChange={(v) => setFmt({ targetColor: v })} theme={theme} />
        </Section>
      )}

      {/* Per-category colour list (pie/donut/funnel/treemap/waterfall/stacked bar) */}
      {perCategory && (
        <ColorByValueSection visual={visual} theme={theme} fmt={fmt} setFmt={setFmt} title="Category colors" />
      )}

      {/* ── Gauge ─────────────────────────────────────────────────────────── */}
      {type === 'gauge' && (
        <Section title="Gauge colours" defaultOpen>
          <ColorRow label="Gauge track color" value={fmt.gaugeTrackColor} onChange={(v) => setFmt({ gaugeTrackColor: v })} theme={theme} />
          <ColorRow label="Value arc color" value={fmt.gaugeArcColor} onChange={(v) => setFmt({ gaugeArcColor: v })} theme={theme} />
          <ColorRow label="Target marker color" value={fmt.targetMarkerColor} onChange={(v) => setFmt({ targetMarkerColor: v })} theme={theme} />
          <ColorRow label="Center value color" value={fmt.valueColor} onChange={(v) => setFmt({ valueColor: v })} theme={theme} />
          <ThresholdRows fmt={fmt} setFmt={setFmt} theme={theme} />
        </Section>
      )}

      {/* ── Donut Progress Gauge ──────────────────────────────────────────── */}
      {type === 'donut_progress' && (
        <Section title="Donut colours" defaultOpen>
          <ColorRow label="Primary / completed" value={fmt.donutPrimaryColor} onChange={(v) => setFmt({ donutPrimaryColor: v })} theme={theme} />
          <ColorRow label="Secondary / remaining" value={fmt.donutSecondaryColor} onChange={(v) => setFmt({ donutSecondaryColor: v })} theme={theme} />
          <ColorRow label="Track color" value={fmt.donutTrackColor} onChange={(v) => setFmt({ donutTrackColor: v })} theme={theme} />
          <ColorRow label="Center value color" value={fmt.valueColor} onChange={(v) => setFmt({ valueColor: v })} theme={theme} />
          <ColorRow label="Secondary text color" value={fmt.secondaryTextColor} onChange={(v) => setFmt({ secondaryTextColor: v })} theme={theme} />
        </Section>
      )}

      {/* ── Table / Matrix ────────────────────────────────────────────────── */}
      {isTable && (
        <Section title="Table colours" defaultOpen>
          <ColorRow label="Header background" value={fmt.headerBg} onChange={(v) => setFmt({ headerBg: v })} theme={theme} />
          <ColorRow label="Header text color" value={fmt.headerTextColor} onChange={(v) => setFmt({ headerTextColor: v })} theme={theme} />
          <ColorRow label="Row background" value={fmt.rowBg} onChange={(v) => setFmt({ rowBg: v })} theme={theme} />
          <ColorRow label="Alternate row background" value={fmt.altRowBg} onChange={(v) => setFmt({ altRowBg: v })} theme={theme} />
          <ColorRow label="Cell text color" value={fmt.cellTextColor} onChange={(v) => setFmt({ cellTextColor: v })} theme={theme} />
          <ColorRow label="Total row background" value={fmt.totalRowBg} onChange={(v) => setFmt({ totalRowBg: v })} theme={theme} />
          <ColorRow label="Total row text color" value={fmt.totalRowTextColor} onChange={(v) => setFmt({ totalRowTextColor: v })} theme={theme} />
          <ColorRow label="Selected row color" value={fmt.selectedRowColor} onChange={(v) => setFmt({ selectedRowColor: v })} theme={theme} />
          <ColorRow label="Hover row color" value={fmt.hoverColor} onChange={(v) => setFmt({ hoverColor: v })} theme={theme} />
        </Section>
      )}

      {/* ── Button ────────────────────────────────────────────────────────── */}
      {type === 'button' && (
        <Section title="Button colours" defaultOpen>
          <ColorRow label="Background color" value={fmt.buttonBg} onChange={(v) => setFmt({ buttonBg: v })} theme={theme} />
          <ColorRow label="Text color" value={fmt.buttonTextColor} onChange={(v) => setFmt({ buttonTextColor: v })} theme={theme} />
          <ColorRow label="Icon color" value={fmt.buttonIconColor} onChange={(v) => setFmt({ buttonIconColor: v })} theme={theme} />
          <ColorRow label="Hover background" value={fmt.buttonHoverBg} onChange={(v) => setFmt({ buttonHoverBg: v })} theme={theme} />
          <ColorRow label="Hover text color" value={fmt.buttonHoverTextColor} onChange={(v) => setFmt({ buttonHoverTextColor: v })} theme={theme} />
          <ColorRow label="Disabled background" value={fmt.buttonDisabledBg} onChange={(v) => setFmt({ buttonDisabledBg: v })} theme={theme} />
          <ColorRow label="Disabled text color" value={fmt.buttonDisabledTextColor} onChange={(v) => setFmt({ buttonDisabledTextColor: v })} theme={theme} />
        </Section>
      )}

      {/* ── Shape ─────────────────────────────────────────────────────────── */}
      {type === 'shape' && (
        <Section title="Shape colours" defaultOpen>
          <ColorRow label="Fill color" value={fmt.fillColor} onChange={(v) => setFmt({ fillColor: v })} theme={theme} />
          <ColorRow label="Border color" value={fmt.borderColor} onChange={(v) => setFmt({ borderColor: v })} theme={theme} />
          <ColorRow label="Line color" value={fmt.lineColor} onChange={(v) => setFmt({ lineColor: v })} theme={theme} />
        </Section>
      )}

      {/* ── Text ──────────────────────────────────────────────────────────── */}
      {(type === 'text' || type === 'html') && (
        <Section title="Text colours" defaultOpen>
          <ColorRow label="Text color" value={fmt.textColor} onChange={(v) => setFmt({ textColor: v })} theme={theme} />
        </Section>
      )}
    </div>
  );
}

// ── Color-by-value (dynamic per-category list) ──────────────────────────────────
function ColorByValueSection({ visual, theme, fmt, setFmt, title }: {
  visual: DashboardVisual; theme: ThemeConfig; fmt: FormatConfig; setFmt: SetFmt; title: string;
}) {
  const [keys, setKeys] = useState<ColorKey[]>([]);
  const [loading, setLoading] = useState(false);
  const cfgKey = JSON.stringify([
    visual.query_config.entity, visual.query_config.filters,
    visual.data_config.breakdownField, visual.data_config.kpiMode, visual.data_config.mainAgg,
    visual.data_config.mainField, visual.data_config.breakdownLimit, visual.data_config.customBreakdownItems,
    visual.query_config.groupBy,
  ]);

  const load = () => {
    setLoading(true);
    fetchColorKeys(visual).then((k) => setKeys(k)).catch(() => setKeys([])).finally(() => setLoading(false));
  };
  // Reload whenever the underlying query changes.
  const lastCfg = useRef('');
  useEffect(() => {
    if (lastCfg.current === cfgKey) return;
    lastCfg.current = cfgKey;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey]);

  const colorByValue = fmt.colorByValue ?? {};
  const setColor = (key: string, color: string | undefined) => {
    const next = { ...colorByValue };
    if (color == null) delete next[key]; else next[key] = color;
    setFmt({ colorByValue: next });
  };
  const resetAll = () => setFmt({ colorByValue: {} });
  const autoAssign = () => {
    const next: Record<string, string> = { ...colorByValue };
    keys.forEach((k, i) => { next[k.key] = theme.chartPalette[i % theme.chartPalette.length]; });
    setFmt({ colorByValue: next });
  };

  return (
    <Section title={title} defaultOpen>
      <div className="flex items-center gap-1.5 mb-1.5">
        <button onClick={load} title="Refresh values" className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-slate-700 hover:bg-slate-700 text-slate-300">
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Refresh
        </button>
        <button onClick={autoAssign} disabled={!keys.length} title="Assign palette colours" className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-slate-700 hover:bg-slate-700 text-slate-300 disabled:opacity-40">
          <Wand2 size={11} /> Auto
        </button>
        <button onClick={resetAll} title="Reset to theme colours" className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-slate-700 hover:bg-slate-700 text-slate-300 ml-auto">
          <RotateCcw size={11} /> Reset
        </button>
      </div>
      {!keys.length && !loading && (
        <p className="text-[10px] text-slate-500 py-1">No values yet — set the breakdown/category field and data, then Refresh.</p>
      )}
      <div className="space-y-1.5">
        {keys.map((k) => (
          <div key={k.key} className="flex items-center gap-2">
            <span className="text-[11px] text-slate-300 truncate flex-1" title={k.label}>{k.label}</span>
            <div className="w-28 shrink-0">
              <ColorPicker value={colorByValue[k.key]} onChange={(v) => setColor(k.key, v)} theme={theme} placeholder="Theme" />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Per-series colours (one picker per measure) ─────────────────────────────────
function SeriesColorsRows({ visual, theme, fmt, setFmt }: {
  visual: DashboardVisual; theme: ThemeConfig; fmt: FormatConfig; setFmt: SetFmt;
}) {
  const aggs = visual.query_config.aggregations ?? [];
  const series = aggs.length ? aggs.map((a) => a.alias) : ['Series 1'];
  const colors = fmt.seriesColors ?? [];
  const setSeries = (i: number, color: string | undefined) => {
    const next = [...colors];
    next[i] = color ?? '';
    setFmt({ seriesColors: next });
  };
  return (
    <>
      {series.map((name, i) => (
        <ColorRow key={i} label={`Series — ${name}`} value={colors[i] || undefined} onChange={(v) => setSeries(i, v)} theme={theme} />
      ))}
    </>
  );
}

// ── Gauge threshold ranges ──────────────────────────────────────────────────────
function ThresholdRows({ fmt, setFmt, theme }: { fmt: FormatConfig; setFmt: SetFmt; theme: ThemeConfig }) {
  const thresholds = fmt.thresholds ?? [];
  const update = (i: number, patch: Partial<{ value: number; color: string }>) => {
    const next = thresholds.map((t, j) => j === i ? { ...t, ...patch } : t);
    setFmt({ thresholds: next });
  };
  return (
    <div className="pt-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Threshold ranges</span>
        <button onClick={() => setFmt({ thresholds: [...thresholds, { value: 0, color: theme.warning }] })}
          className="text-[10px] text-blue-400 hover:text-blue-300">+ Add</button>
      </div>
      <div className="space-y-1.5">
        {thresholds.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="number" value={t.value} onChange={(e) => update(i, { value: Number(e.target.value) })}
              className="w-16 px-1.5 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200" />
            <div className="flex-1"><ColorPicker value={t.color} onChange={(v) => update(i, { color: v ?? theme.warning })} theme={theme} allowTransparent={false} /></div>
            <button onClick={() => setFmt({ thresholds: thresholds.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-400 text-[11px]">✕</button>
          </div>
        ))}
        {!thresholds.length && <p className="text-[10px] text-slate-500">No thresholds — the value arc uses a single colour.</p>}
      </div>
    </div>
  );
}

// ── Layout primitives ───────────────────────────────────────────────────────────
export function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded border border-slate-700/70 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-slate-700/40">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {title}
      </button>
      {open && <div className="px-2 pb-2 pt-1 space-y-1.5">{children}</div>}
    </div>
  );
}

export function ColorRow({ label, value, onChange, theme, allowTransparent }: {
  label: string; value?: string; onChange: (v: string | undefined) => void; theme: ThemeConfig; allowTransparent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400 flex-1">{label}</span>
      <div className="w-32 shrink-0"><ColorPicker value={value} onChange={onChange} theme={theme} allowTransparent={allowTransparent} /></div>
    </div>
  );
}

function NumRow({ label, value, min, max, suffix, onChange }: {
  label: string; value: number; min: number; max: number; suffix?: string; onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400 flex-1">{label}</span>
      <div className="w-32 shrink-0 flex items-center gap-1">
        <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))}
          className="w-full px-1.5 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200" />
        {suffix && <span className="text-[10px] text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}
