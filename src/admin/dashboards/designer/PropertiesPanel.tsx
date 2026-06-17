import { useState, useEffect } from 'react';
import { Database, Palette, Settings2, Plus, Trash2 } from 'lucide-react';
import type { DashboardVisual, AggFn, DateGrain, FilterOp, NumberFormat } from '../types/dashboard';
import type { EntityDefinition } from '../../../types/entity';
import type { FieldDefinition } from '../../../types/field';
import { fetchFieldsForEntity } from '../../../services/fieldService';
import { VISUAL_REGISTRY } from '../visuals/registry';
import { getFilterFieldInfo, type FilterFieldInfo } from '../visuals/labelResolver';
import FilterSelect from '../../../app/components/FilterSelect';

interface Props {
  visual: DashboardVisual;
  entities: EntityDefinition[];
  onChange: (patch: Partial<DashboardVisual>) => void;
}

const AGG_FNS: AggFn[] = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'];
const GRAINS: (DateGrain | '')[] = ['', 'year', 'quarter', 'month', 'week', 'day', 'hour'];
const OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts_with', 'is_empty', 'is_not_empty', 'in'];

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, '_');

export default function PropertiesPanel({ visual, entities, onChange }: Props) {
  const [tab, setTab] = useState<'data' | 'format' | 'advanced'>('data');
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const meta = VISUAL_REGISTRY[visual.visual_type];
  const q = visual.query_config;
  const fmt = visual.format_config;

  const entity = entities.find((e) =>
    e.logical_name === q.entity || e.physical_table_name === q.entity);

  useEffect(() => {
    if (!entity) { setFields([]); return; }
    fetchFieldsForEntity(entity.entity_definition_id).then(setFields).catch(() => setFields([]));
  }, [entity]);

  const setQuery = (patch: Partial<typeof q>) => onChange({ query_config: { ...q, ...patch } });
  const setFmt = (patch: Partial<typeof fmt>) => onChange({ format_config: { ...fmt, ...patch } });

  // Friendly single category + single measure model (covers most chart/kpi cases).
  const category = q.groupBy?.[0];
  const measure = q.aggregations?.[0];

  const setCategory = (field: string, grain: DateGrain | '') => {
    if (!field) { setQuery({ groupBy: [] }); return; }
    setQuery({ groupBy: [{ field, dateGrain: grain || null, alias: sanitize(field) }] });
  };
  const setMeasure = (fn: AggFn, field: string) => {
    const alias = fn === 'count' ? 'count' : sanitize(`${fn}_${field || 'value'}`);
    setQuery({ aggregations: [{ fn, field: fn === 'count' ? '*' : field, alias }] });
  };

  return (
    <div className="w-72 shrink-0 flex flex-col border-l border-slate-700 bg-slate-800 text-slate-200">
      <div className="flex border-b border-slate-700">
        {([['data', Database, 'Data'], ['format', Palette, 'Format'], ['advanced', Settings2, 'Advanced']] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium ${tab === id ? 'text-white border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-[12px]">
        <Row label="Title">
          <input value={visual.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </Row>

        {tab === 'data' && meta?.dataMode !== 'none' && (
          <>
            <Row label="Entity">
              <FilterSelect value={q.entity ?? ''} onChange={(e) => setQuery({ entity: e.target.value || undefined })} className={inputCls}>
                <option value="">— Select —</option>
                {entities.map((en) => <option key={en.entity_definition_id} value={en.logical_name}>{en.display_name}</option>)}
              </FilterSelect>
            </Row>

            {meta?.dataMode === 'aggregate' && (
              <>
                <Row label="Category (group by)">
                  <FilterSelect value={category?.field ?? ''} onChange={(e) => setCategory(e.target.value, (category?.dateGrain ?? '') as DateGrain | '')} className={inputCls}>
                    <option value="">— None —</option>
                    {fields.map((f) => <option key={f.field_definition_id} value={f.physical_column_name}>{f.display_name}</option>)}
                  </FilterSelect>
                </Row>
                {category && (
                  <Row label="Date grain">
                    <FilterSelect value={category.dateGrain ?? ''} onChange={(e) => setCategory(category.field, e.target.value as DateGrain | '')} className={inputCls}>
                      {GRAINS.map((g) => <option key={g} value={g}>{g || '(none)'}</option>)}
                    </FilterSelect>
                  </Row>
                )}
                <Row label="Measure">
                  <div className="flex gap-1.5">
                    <FilterSelect value={measure?.fn ?? 'count'} onChange={(e) => setMeasure(e.target.value as AggFn, measure?.field === '*' ? '' : measure?.field ?? '')} className={inputCls}>
                      {AGG_FNS.map((fn) => <option key={fn} value={fn}>{fn}</option>)}
                    </FilterSelect>
                    {measure?.fn !== 'count' && (
                      <FilterSelect value={measure?.field ?? ''} onChange={(e) => setMeasure(measure?.fn ?? 'sum', e.target.value)} className={inputCls}>
                        <option value="">field…</option>
                        {fields.map((f) => <option key={f.field_definition_id} value={f.physical_column_name}>{f.display_name}</option>)}
                      </FilterSelect>
                    )}
                  </div>
                </Row>
              </>
            )}

            {meta?.dataMode === 'record' && (
              <Row label="Columns">
                <div className="max-h-44 overflow-auto rounded border border-slate-700 p-1.5 space-y-0.5">
                  {fields.map((f) => {
                    const on = (q.columns ?? []).includes(f.physical_column_name);
                    return (
                      <label key={f.field_definition_id} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-700/40 rounded cursor-pointer">
                        <input type="checkbox" checked={on}
                          onChange={() => setQuery({ columns: on
                            ? (q.columns ?? []).filter((c) => c !== f.physical_column_name)
                            : [...(q.columns ?? []), f.physical_column_name] })} />
                        <span className="truncate">{f.display_name}</span>
                      </label>
                    );
                  })}
                  {!fields.length && <p className="text-slate-500 px-1">Select an entity first.</p>}
                </div>
              </Row>
            )}

            <FilterEditor visual={visual} fields={fields} onChange={setQuery} ops={OPS} entityName={q.entity} />
          </>
        )}

        {tab === 'data' && meta?.dataMode === 'none' && visual.visual_type === 'text' && (
          <Row label="Content"><textarea value={fmt.content ?? ''} onChange={(e) => setFmt({ content: e.target.value })} rows={4} className={inputCls} /></Row>
        )}
        {tab === 'data' && visual.visual_type === 'image' && (
          <Row label="Image URL"><input value={fmt.imageUrl ?? ''} onChange={(e) => setFmt({ imageUrl: e.target.value })} className={inputCls} /></Row>
        )}
        {tab === 'data' && visual.visual_type === 'html' && (
          <Row label="HTML (sanitized)"><textarea value={fmt.content ?? ''} onChange={(e) => setFmt({ content: e.target.value })} rows={5} className={inputCls} /></Row>
        )}

        {tab === 'format' && (
          <>
            <Toggle label="Show header" checked={fmt.showHeader !== false} onChange={(v) => setFmt({ showHeader: v })} />
            {meta?.category === 'chart' && <Toggle label="Show legend" checked={fmt.showLegend !== false} onChange={(v) => setFmt({ showLegend: v })} />}
            {meta?.category === 'chart' && <Toggle label="Data labels" checked={!!fmt.showDataLabels} onChange={(v) => setFmt({ showDataLabels: v })} />}
            {visual.visual_type === 'bar' && <Toggle label="Horizontal" checked={fmt.orientation === 'horizontal'} onChange={(v) => setFmt({ orientation: v ? 'horizontal' : 'vertical' })} />}
            {(visual.visual_type === 'bar' || visual.visual_type === 'line' || visual.visual_type === 'area') &&
              <Toggle label="Stacked" checked={!!fmt.stacked} onChange={(v) => setFmt({ stacked: v })} />}
            <Row label="Number format">
              <FilterSelect value={fmt.numberFormat ?? 'number'} onChange={(e) => setFmt({ numberFormat: e.target.value as NumberFormat })} className={inputCls}>
                {(['number', 'currency', 'percentage', 'compact'] as NumberFormat[]).map((n) => <option key={n} value={n}>{n}</option>)}
              </FilterSelect>
            </Row>
            <Row label="Decimals">
              <input type="number" min={0} max={6} value={fmt.decimals ?? 0} onChange={(e) => setFmt({ decimals: Number(e.target.value) })} className={inputCls} />
            </Row>
            <Row label="Accent color">
              <input type="color" value={fmt.accentColor ?? '#4f8cff'} onChange={(e) => setFmt({ accentColor: e.target.value })} className="h-8 w-full rounded border border-slate-700 bg-slate-900" />
            </Row>
            <Row label="Empty message">
              <input value={fmt.emptyMessage ?? 'No data'} onChange={(e) => setFmt({ emptyMessage: e.target.value })} className={inputCls} />
            </Row>
          </>
        )}

        {tab === 'advanced' && (
          <div className="grid grid-cols-2 gap-2">
            {(['x', 'y', 'width', 'height'] as const).map((k) => (
              <Row key={k} label={k}>
                <input type="number" value={visual[k]} onChange={(e) => onChange({ [k]: Number(e.target.value) } as Partial<DashboardVisual>)} className={inputCls} />
              </Row>
            ))}
            <Row label="Z-index"><input type="number" value={visual.z_index} onChange={(e) => onChange({ z_index: Number(e.target.value) })} className={inputCls} /></Row>
            <div className="col-span-2 space-y-1.5">
              <Toggle label="Visible" checked={visual.is_visible} onChange={(v) => onChange({ is_visible: v })} />
              <Toggle label="Locked" checked={visual.is_locked} onChange={(v) => onChange({ is_locked: v })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterEditor({ visual, fields, onChange, ops, entityName }: {
  visual: DashboardVisual; fields: FieldDefinition[];
  onChange: (patch: Partial<DashboardVisual['query_config']>) => void; ops: FilterOp[];
  entityName?: string;
}) {
  const filters = visual.query_config.filters ?? [];
  const [info, setInfo] = useState<Record<string, FilterFieldInfo>>({});

  // Lazily load label-driven value options for the fields used in filters.
  useEffect(() => {
    if (!entityName) return;
    const needed = [...new Set(filters.map((f) => f.field).filter((c) => c && !(c in info)))];
    if (!needed.length) return;
    let cancelled = false;
    Promise.all(needed.map((c) => getFilterFieldInfo(entityName, c).then((fi) => [c, fi] as const).catch(() => [c, { kind: 'text', options: [] } as FilterFieldInfo] as const)))
      .then((pairs) => { if (!cancelled) setInfo((prev) => ({ ...prev, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName, filters.map((f) => f.field).join(',')]);

  const update = (i: number, patch: Partial<typeof filters[number]>) => {
    const n = [...filters]; n[i] = { ...filters[i], ...patch }; onChange({ filters: n });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-slate-400 text-[11px] font-medium">Filters</span>
        <button onClick={() => onChange({ filters: [...filters, { field: fields[0]?.physical_column_name ?? '', op: 'eq', value: '' }] })}
          className="text-blue-400 hover:text-blue-300"><Plus size={13} /></button>
      </div>
      <div className="space-y-1.5">
        {filters.map((f, i) => {
          const fi = info[f.field];
          const hasOptions = fi && fi.kind !== 'text' && fi.options.length > 0;
          const needsValue = !['is_empty', 'is_not_empty'].includes(f.op);
          return (
            <div key={i} className="flex gap-1 items-center">
              <FilterSelect value={f.field} onChange={(e) => update(i, { field: e.target.value, value: '' })} className={inputCls}>
                {fields.map((fd) => <option key={fd.field_definition_id} value={fd.physical_column_name}>{fd.display_name}</option>)}
              </FilterSelect>
              <FilterSelect value={f.op} onChange={(e) => update(i, { op: e.target.value as FilterOp })} className="w-20 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200">
                {ops.map((op) => <option key={op} value={op}>{op}</option>)}
              </FilterSelect>
              {needsValue && (hasOptions ? (
                // Label-driven picker: show names, store the underlying raw value.
                <FilterSelect value={String(f.value ?? '')} onChange={(e) => update(i, { value: e.target.value })}
                  className="w-24 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200">
                  <option value="">—</option>
                  {fi!.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </FilterSelect>
              ) : (
                <input value={String(f.value ?? '')} onChange={(e) => update(i, { value: e.target.value })} className="w-24 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200" />
              ))}
              <button onClick={() => onChange({ filters: filters.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputCls = 'w-full px-2 py-1.5 text-[12px] rounded border border-slate-700 bg-slate-900 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] text-slate-400 mb-1">{label}</label>{children}</div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-0.5 cursor-pointer">
      <span className="text-slate-300">{label}</span>
      <button type="button" onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors relative ${checked ? 'bg-blue-500' : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
      </button>
    </label>
  );
}
