// Shared breakdown renderer — the clickable "value / count / % / progress bar"
// rows used by BOTH the KPI card and each Funnel Stage card. It owns the row
// markup, per-value colours, selection emphasis and the click→emit wiring, so the
// two visuals share one selection + toggle implementation (the toggle/multi-select
// rules themselves live in useCrossFilter's reducer; this component only emits).

import { Check } from 'lucide-react';
import type { NumberFormat } from '../types/dashboard';
import { formatNumber } from './formatValue';
import { pick } from './colorConfig';
import type { SelectionEmit, RawValue } from './useCrossFilter';
import type { BreakdownItem } from './breakdownQuery';

export interface BreakdownColors {
  accent: string;                       // bar/dot fallback colour (single-hue lists)
  labelColor: string;
  valueColor: string;
  trackColor: string;
  colorByValue?: Record<string, string>;
  /** Distinct per-row hues (theme chart palette) for multi-category lists. When
   *  set, a row with no explicit colorByValue picks palette[index] instead of the
   *  single `accent`, so the list recolours with the theme yet stays legible. */
  palette?: string[];
}

interface Props {
  items: BreakdownItem[];
  total: number;
  /** Detailed = coloured dot + progress bar; compact = single line. */
  detailed: boolean;
  showPercentages?: boolean;
  colors: BreakdownColors;
  /** Number format used for breakdown VALUES (currency stays currency, else number). */
  numberFormat?: NumberFormat;
  decimals?: number;
  // ── cross-filter wiring (omit onSelect / fieldId to make rows inert) ──────────
  sourceVisualId: string;
  entity: string;
  fieldId?: string;
  onSelect?: (emit: SelectionEmit) => void;
  /** Raw values currently selected — emphasised, others dimmed. */
  highlight?: Set<string>;
  className?: string;
}

export default function BreakdownList({
  items, total, detailed, showPercentages, colors, numberFormat, decimals,
  sourceVisualId, entity, fieldId, onSelect, highlight, className,
}: Props) {
  if (!items.length) return null;
  const valueFmt = { numberFormat: numberFormat === 'currency' ? 'currency' as const : 'number' as const, decimals };

  // Ordered selectable raws power shift-range selection in the reducer.
  const ordered: RawValue[] = items.filter((b) => b.selectable).map((b) => ({ raw: b.raw, label: b.label }));
  const anySel = !!highlight && highlight.size > 0;

  return (
    <div className={`${detailed ? 'space-y-1.5' : 'space-y-0.5'} ${className ?? ''}`}>
      {items.map((b, i) => {
        const pct = total > 0 ? (b.value / total) * 100 : 0;
        // Per-value colour: explicit colorByValue[id] → theme palette (distinct
        // per row, when supplied) → single accent fallback.
        const paletteColor = colors.palette?.length ? colors.palette[i % colors.palette.length] : undefined;
        const barColor = pick(colors.colorByValue?.[b.id], paletteColor ?? colors.accent);
        const clickable = !!onSelect && !!fieldId && b.selectable;
        const selected = !!highlight && b.raw != null && highlight.has(String(b.raw));
        const fire = (e: React.MouseEvent) => {
          if (!clickable) return;
          e.stopPropagation();   // don't also trigger a stage-level click
          onSelect!({
            sourceVisualId, entity, fieldId: fieldId!,
            value: { raw: b.raw, label: b.label },
            modifiers: { ctrl: e.ctrlKey, shift: e.shiftKey, meta: e.metaKey }, ordered,
          });
        };
        return (
          <div key={b.id || i} className="text-[12px]" onClick={fire}
            style={{ cursor: clickable ? 'pointer' : 'default', opacity: anySel && !selected ? 0.4 : 1 }}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate flex items-center gap-1.5" style={{ color: colors.labelColor, fontWeight: selected ? 600 : undefined }}>
                {detailed && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: barColor }} />}
                {selected && <Check size={11} className="shrink-0" />}
                {b.label}
              </span>
              <span className="font-medium tabular-nums" style={{ color: colors.valueColor }}>
                {formatNumber(b.value, valueFmt)}
                {showPercentages && <span className="ml-1.5 text-[11px]" style={{ color: colors.labelColor }}>{pct.toFixed(0)}%</span>}
              </span>
            </div>
            {detailed && (
              <div className="mt-0.5 h-1 rounded-full overflow-hidden" style={{ background: colors.trackColor, outline: selected ? `1px solid ${barColor}` : undefined }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
