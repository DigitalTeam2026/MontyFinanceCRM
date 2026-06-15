// Right-side widget settings panel used inside the shared dashboard renderer's
// EDIT mode. Edits a real dashboard_widget row (the same row Sales renders), so
// there is no separate "designer" model. Changes are applied live to the draft
// and persisted when the admin clicks Save.
//
// Covers the practical Power BI sections: General, Data source + Measure,
// Condition, Group by, and Visual. (Nested condition groups, formula measures,
// and per-widget date-field binding are layered on in later passes.)

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { DashboardWidget } from '../../../types/dashboard';
import { ENTITY_META, META_BY_ENTITY } from '../../admindashboard/entityMeta';
import type { StatusFilter } from '../../admindashboard/entityMeta';
import { fetchStatusOptions } from '../../admindashboard/genericData';

interface Props {
  widget: DashboardWidget;
  onChange: (w: DashboardWidget) => void;
  onClose: () => void;
}

const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 6px' };
const field: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none' };
const sectionHdr: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: '4px 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--border)' };

type Viz = 'kpi' | 'donut' | 'bars';

function patchQD(w: DashboardWidget, changes: Record<string, unknown>): DashboardWidget {
  return { ...w, query_definition: { ...(w.query_definition ?? {}), ...changes } };
}
function patchVC(w: DashboardWidget, changes: Record<string, unknown>): DashboardWidget {
  return { ...w, visual_config: { ...(w.visual_config ?? {}), ...changes } };
}

function currentViz(w: DashboardWidget): Viz {
  if (w.widget_type === 'kpi') return 'kpi';
  return w.visual_config?.chartType === 'bars' ? 'bars' : 'donut';
}

export default function DashboardConfigPanel({ widget, onChange, onClose }: Props) {
  const w = widget;
  const ds = w.data_source_type ?? 'entity';
  const qd = w.query_definition ?? {};
  const entity = qd.entity ?? w.entity_name ?? 'opportunities';
  const meta = META_BY_ENTITY[entity];
  const [statusOptions, setStatusOptions] = useState<StatusFilter[]>([]);

  useEffect(() => {
    let alive = true;
    setStatusOptions([]);
    if (meta) fetchStatusOptions(meta).then((o) => { if (alive) setStatusOptions(o); }).catch(() => { if (alive) setStatusOptions([]); });
    return () => { alive = false; };
  }, [meta]);

  const viz = currentViz(w);

  const setEntity = (e: string) => {
    const m = META_BY_ENTITY[e];
    onChange({
      ...patchQD(w, { entity: e, dimension: m?.dimensions[0]?.key ?? 'state_code', status: undefined, field: undefined }),
      entity_name: e,
    });
  };

  const setViz = (v: Viz) => {
    if (v === 'kpi') onChange({ ...patchVC(w, { chartType: 'kpi' }), widget_type: 'kpi' });
    else onChange({ ...patchVC(w, { chartType: v }), widget_type: 'chart' });
  };

  const statusValue = qd.status ? `${qd.status.field}|${qd.status.value}` : '';
  const setStatus = (raw: string) => {
    if (!raw) { onChange(patchQD(w, { status: undefined })); return; }
    const o = statusOptions.find((x) => `${x.field}|${x.value}` === raw);
    onChange(patchQD(w, { status: o }));
  };

  const isPreset = ds === 'preset';
  const isSql = ds === 'sql';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{ position: 'relative', width: 380, maxWidth: '92vw', height: '100%', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Widget settings</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>{w.title || 'Untitled widget'}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* General */}
          <div>
            <p style={sectionHdr}>General</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><p style={label}>Title</p><input style={field} value={w.title} onChange={(e) => onChange({ ...w, title: e.target.value })} /></div>
              <div><p style={label}>Subtitle</p><input style={field} value={w.subtitle ?? ''} onChange={(e) => onChange({ ...w, subtitle: e.target.value })} /></div>
              <div><p style={label}>Section</p><input style={field} placeholder="e.g. Opportunities" value={qd.section ?? ''} onChange={(e) => onChange(patchQD(w, { section: e.target.value || undefined }))} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}><p style={label}>Width (1–12)</p><input type="number" min={1} max={12} style={field} value={w.width} onChange={(e) => onChange({ ...w, width: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} /></div>
                <div style={{ flex: 1 }}><p style={label}>Height</p><input type="number" min={1} max={12} style={field} value={w.height} onChange={(e) => onChange({ ...w, height: Math.max(1, Number(e.target.value) || 1) })} /></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={w.is_visible !== false} onChange={(e) => onChange({ ...w, is_visible: e.target.checked })} /> Visible
              </label>
            </div>
          </div>

          {isPreset ? (
            <div>
              <p style={sectionHdr}>Data</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
                This is a <b style={{ color: 'var(--text)' }}>template</b> widget ({w.query_definition?.preset}). Convert it to a configurable widget to edit its entity, measure, and conditions.
              </p>
              <button onClick={() => onChange({ ...patchQD(w, { preset: undefined, entity: 'opportunities', dimension: 'state_code' }), data_source_type: 'entity', entity_name: 'opportunities', widget_type: 'chart' })}
                style={{ ...field, cursor: 'pointer', fontWeight: 600, color: 'var(--link)', textAlign: 'center' }}>
                Convert to configurable widget
              </button>
            </div>
          ) : isSql ? (
            <div>
              <p style={sectionHdr}>Data — SQL</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>SQL widgets are edited in the SQL editor (requires the “Manage dashboard SQL” privilege).</p>
            </div>
          ) : (
            <>
              {/* Data source + measure / group-by */}
              <div>
                <p style={sectionHdr}>Data source</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <p style={label}>Entity</p>
                    <select style={field} value={entity} onChange={(e) => setEntity(e.target.value)}>
                      {ENTITY_META.map((m) => <option key={m.entity} value={m.entity}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <p style={label}>Visualize as</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['kpi', 'donut', 'bars'] as Viz[]).map((v) => {
                        const active = viz === v;
                        return (
                          <button key={v} onClick={() => setViz(v)} style={{ flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'var(--surface-2)', color: active ? 'var(--primary)' : 'var(--text)' }}>
                            {v === 'kpi' ? 'KPI' : v === 'donut' ? 'Donut' : 'Bars'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {viz === 'kpi' ? (
                <div>
                  <p style={sectionHdr}>Measure</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <p style={label}>Measure</p>
                      <select style={field} value={qd.measure ?? 'count'} onChange={(e) => {
                        const m = e.target.value as 'count' | 'sum';
                        onChange(patchQD(w, { measure: m, field: m === 'sum' ? (qd.field ?? meta?.sumFields[0]?.key) : undefined }));
                      }}>
                        <option value="count">Count of records</option>
                        {(meta?.sumFields.length ?? 0) > 0 && <option value="sum">Sum of a value</option>}
                      </select>
                    </div>
                    {qd.measure === 'sum' && (meta?.sumFields.length ?? 0) > 0 && (
                      <div>
                        <p style={label}>Value to sum</p>
                        <select style={field} value={qd.field ?? meta!.sumFields[0].key} onChange={(e) => onChange(patchQD(w, { field: e.target.value }))}>
                          {meta!.sumFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <p style={sectionHdr}>Group by</p>
                  <select style={field} value={qd.dimension ?? meta?.dimensions[0]?.key} onChange={(e) => onChange(patchQD(w, { dimension: e.target.value }))}>
                    {meta?.dimensions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                </div>
              )}

              {/* Condition */}
              <div>
                <p style={sectionHdr}>Condition</p>
                <select style={field} value={statusValue} onChange={(e) => setStatus(e.target.value)} disabled={!meta?.statusField}>
                  <option value="">All records</option>
                  {statusOptions.map((o) => <option key={`${o.field}|${o.value}`} value={`${o.field}|${o.value}`}>{o.label}</option>)}
                </select>
                {!meta?.statusField && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 0' }}>This entity has no status to filter on.</p>}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--primary)', background: 'var(--primary)', color: 'var(--primary-text)' }}>Done</button>
        </div>
      </div>
    </div>
  );
}

// Keep a stable import surface for the editor.
export const CONFIG_PANEL_SECTIONS = ['General', 'Data source', 'Measure', 'Group by', 'Condition', 'Visual'] as const;
