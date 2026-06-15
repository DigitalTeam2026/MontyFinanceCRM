// Config editor for a configurable widget (Custom KPI / Custom Chart).
//
// Lets the admin repoint a card: choose the source entity, the metric (count /
// sum) or group-by dimension, the chart type, and an optional status/condition
// (e.g. Opportunities where status = Lost). Changes apply live to the dashboard
// and are persisted with the layout (frontend-only) when the admin clicks Save.

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  ENTITY_META, META_BY_ENTITY, type WidgetConfig, type KpiConfig, type ChartConfig, type StatusFilter,
} from './entityMeta';
import { fetchStatusOptions } from './genericData';

interface WidgetConfigPanelProps {
  config: WidgetConfig;
  onApply: (cfg: WidgetConfig) => void;
  onClose: () => void;
}

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 6px' };
const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none',
};

export default function WidgetConfigPanel({ config, onApply, onClose }: WidgetConfigPanelProps) {
  const [cfg, setCfg] = useState<WidgetConfig>(config);
  const [statusOptions, setStatusOptions] = useState<StatusFilter[]>([]);
  const meta = META_BY_ENTITY[cfg.entity];

  // Load the selectable conditions whenever the entity changes.
  useEffect(() => {
    let alive = true;
    setStatusOptions([]);
    if (meta) fetchStatusOptions(meta).then((opts) => { if (alive) setStatusOptions(opts); }).catch(() => { if (alive) setStatusOptions([]); });
    return () => { alive = false; };
  }, [meta]);

  const update = (next: WidgetConfig) => { setCfg(next); onApply(next); };

  // When the entity changes, reset entity-specific fields to valid defaults.
  const changeEntity = (entity: string) => {
    const m = META_BY_ENTITY[entity];
    if (!m) return;
    if (cfg.kind === 'kpi') {
      const measure = m.sumFields.length === 0 ? 'count' : cfg.measure;
      const field = measure === 'sum' ? (m.sumFields[0]?.key) : undefined;
      update({ ...cfg, entity, measure, field, status: undefined, label: cfg.label || m.label });
    } else {
      update({ ...cfg, entity, dimension: m.dimensions[0]?.key ?? 'state_code', status: undefined, title: cfg.title || `${m.label} by ${m.dimensions[0]?.label ?? ''}` });
    }
  };

  const statusValue = cfg.status ? `${cfg.status.field}|${cfg.status.value}` : '';
  const changeStatus = (raw: string) => {
    if (!raw) { update({ ...cfg, status: undefined }); return; }
    const opt = statusOptions.find((o) => `${o.field}|${o.value}` === raw);
    update({ ...cfg, status: opt });
  };

  const headerTitle = useMemo(() => (cfg.kind === 'kpi' ? 'Configure KPI card' : 'Configure chart'), [cfg.kind]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{
        position: 'relative', width: 380, maxWidth: '92vw', height: '100%', background: 'var(--surface)',
        borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{headerTitle}</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0 0' }}>Choose what this card shows</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title / label */}
          <div>
            <p style={labelStyle}>{cfg.kind === 'kpi' ? 'Card label' : 'Chart title'}</p>
            <input
              style={fieldStyle}
              value={cfg.kind === 'kpi' ? cfg.label : cfg.title}
              onChange={(e) => update(cfg.kind === 'kpi' ? { ...cfg, label: e.target.value } : { ...cfg, title: e.target.value })}
            />
          </div>

          {/* Source entity */}
          <div>
            <p style={labelStyle}>Source</p>
            <select style={fieldStyle} value={cfg.entity} onChange={(e) => changeEntity(e.target.value)}>
              {ENTITY_META.map((m) => <option key={m.entity} value={m.entity}>{m.label}</option>)}
            </select>
          </div>

          {cfg.kind === 'kpi' ? (
            <KpiFields cfg={cfg} update={update} />
          ) : (
            <ChartFields cfg={cfg} update={update} />
          )}

          {/* Condition */}
          <div>
            <p style={labelStyle}>Condition (optional)</p>
            <select style={fieldStyle} value={statusValue} onChange={(e) => changeStatus(e.target.value)} disabled={!meta?.statusField}>
              <option value="">All records</option>
              {statusOptions.map((o) => <option key={`${o.field}|${o.value}`} value={`${o.field}|${o.value}`}>{o.label}</option>)}
            </select>
            {!meta?.statusField && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 0' }}>This source has no status to filter on.</p>}
          </div>
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--primary)',
            background: 'var(--primary)', color: 'var(--primary-text)',
          }}>Done</button>
        </div>
      </div>
    </div>
  );
}

function KpiFields({ cfg, update }: { cfg: KpiConfig; update: (c: WidgetConfig) => void }) {
  const meta = META_BY_ENTITY[cfg.entity];
  const canSum = (meta?.sumFields.length ?? 0) > 0;
  return (
    <>
      <div>
        <p style={labelStyle}>Measure</p>
        <select style={fieldStyle} value={cfg.measure} onChange={(e) => {
          const measure = e.target.value as 'count' | 'sum';
          update({ ...cfg, measure, field: measure === 'sum' ? (cfg.field ?? meta?.sumFields[0]?.key) : undefined });
        }}>
          <option value="count">Count of records</option>
          {canSum && <option value="sum">Sum of a value</option>}
        </select>
      </div>
      {cfg.measure === 'sum' && canSum && (
        <div>
          <p style={labelStyle}>Value to sum</p>
          <select style={fieldStyle} value={cfg.field ?? meta!.sumFields[0].key} onChange={(e) => update({ ...cfg, field: e.target.value })}>
            {meta!.sumFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
      )}
    </>
  );
}

function ChartFields({ cfg, update }: { cfg: ChartConfig; update: (c: WidgetConfig) => void }) {
  const meta = META_BY_ENTITY[cfg.entity];
  return (
    <>
      <div>
        <p style={labelStyle}>Group by</p>
        <select style={fieldStyle} value={cfg.dimension} onChange={(e) => update({ ...cfg, dimension: e.target.value })}>
          {meta?.dimensions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </div>
      <div>
        <p style={labelStyle}>Chart type</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['donut', 'bars'] as const).map((t) => {
            const active = cfg.chartType === t;
            return (
              <button key={t} onClick={() => update({ ...cfg, chartType: t })} style={{
                flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'var(--surface-2)',
                color: active ? 'var(--primary)' : 'var(--text)',
              }}>
                {t === 'donut' ? 'Donut' : 'Bars'}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
