// Active interactive-filter summary (spec §4). Shows one chip per selected value
// — `[Status: Active ×]` — with remove-one and Clear all. Hidden when there are
// no selections. Pure presentational: reads the cross-filter store's selections
// and calls back to mutate it.

import { useEffect, useState } from 'react';
import { X, Filter } from 'lucide-react';
import type { ThemeConfig } from '../../../admin/dashboards/types/dashboard';
import type { Selection } from '../../../admin/dashboards/visuals/useCrossFilter';
import { loadColumnMeta } from '../../../admin/dashboards/visuals/labelResolver';

interface Props {
  selections: Selection[];
  theme: ThemeConfig;
  onRemoveValue: (semanticFilterId: string, raw: unknown) => void;
  onClearAll: () => void;
}

export default function FilterSummaryBar({ selections, theme, onRemoveValue, onClearAll }: Props) {
  // Resolve human field labels (status_reason → "Status") from entity metadata.
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const s of selections) {
        const key = `${s.entity}:${s.fieldId}`;
        if (next[key]) continue;
        try {
          const meta = await loadColumnMeta(s.entity);
          next[key] = meta?.byColumn.get(s.fieldId)?.displayName ?? humanize(s.fieldId);
        } catch { next[key] = humanize(s.fieldId); }
      }
      if (alive) setFieldLabels(next);
    })();
    return () => { alive = false; };
  }, [selections]);

  if (!selections.length) return null;

  const chipBg = theme.surfaceBackground;
  const chipBorder = theme.borderColor;
  const accent = theme.primaryAccent;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t shrink-0 overflow-x-auto"
      style={{ borderColor: theme.borderColor, background: theme.cardBackground }}>
      <span className="inline-flex items-center gap-1 text-[11px] font-medium shrink-0" style={{ color: theme.secondaryText }}>
        <Filter size={12} /> Filters
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {selections.flatMap((s) => {
          const fieldLabel = fieldLabels[`${s.entity}:${s.fieldId}`] ?? humanize(s.fieldId);
          return s.values.map((v) => (
            <span key={`${s.semanticFilterId}:${String(v.raw)}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap"
              style={{ background: chipBg, border: `1px solid ${chipBorder}`, color: theme.primaryText }}>
              <span style={{ color: theme.secondaryText }}>{fieldLabel}:</span>
              <span style={{ color: accent, fontWeight: 600 }}>{v.label}</span>
              <button onClick={() => onRemoveValue(s.semanticFilterId, v.raw)}
                className="ml-0.5 rounded-full hover:opacity-70" aria-label={`Remove ${fieldLabel} ${v.label}`}
                style={{ color: theme.secondaryText }}>
                <X size={12} />
              </button>
            </span>
          ));
        })}
      </div>
      <button onClick={onClearAll}
        className="ml-auto shrink-0 px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
        style={{ color: theme.primaryText, border: `1px solid ${chipBorder}` }}>
        Clear all
      </button>
    </div>
  );
}

function humanize(field: string): string {
  return field.replace(/_id$/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
