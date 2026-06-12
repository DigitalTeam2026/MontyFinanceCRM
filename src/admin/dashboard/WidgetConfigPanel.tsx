import FilterSelect from '../../app/components/FilterSelect';
import { X, Settings } from 'lucide-react';
import type { DashboardWidget, WidgetType, ChartType } from '../../types/dashboard';

interface WidgetConfigPanelProps {
  widget: DashboardWidget;
  onChange: (updates: Partial<DashboardWidget>) => void;
  onClose: () => void;
}

const ENTITIES = [
  { value: 'lead', label: 'Lead' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'account', label: 'Account' },
  { value: 'contact', label: 'Contact' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'campaign', label: 'Campaign' },
];

const KPI_AGGREGATIONS = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'conversion_rate', label: 'Conversion Rate' },
  { value: 'win_rate', label: 'Win Rate' },
];

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bar Chart' },
  { value: 'line', label: 'Line Chart' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'donut', label: 'Donut Chart' },
];

const KPI_COLORS = ['blue', 'emerald', 'amber', 'rose', 'sky', 'slate'];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

function Select({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <FilterSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 bg-white"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </FilterSelect>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
    />
  );
}

export default function WidgetConfigPanel({ widget, onChange, onClose }: WidgetConfigPanelProps) {
  const cfg = widget.config_json as Record<string, string>;

  const updateCfg = (key: string, value: string) => {
    onChange({ config_json: { ...cfg, [key]: value } });
  };

  const WIDGET_TYPE_OPTIONS: { value: WidgetType; label: string }[] = [
    { value: 'kpi', label: 'KPI Card' },
    { value: 'chart', label: 'Chart' },
    { value: 'table', label: 'Data Table' },
    { value: 'activity', label: 'Activity Feed' },
  ];

  return (
    <div className="w-72 bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <Settings size={14} className="text-slate-500" />
          <span className="text-xs font-bold text-slate-700">Widget Settings</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded transition-colors">
          <X size={13} className="text-slate-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Row label="Title">
          <TextInput
            value={widget.title}
            onChange={(v) => onChange({ title: v })}
            placeholder="Widget title"
          />
        </Row>

        <Row label="Widget Type">
          <Select
            value={widget.widget_type}
            onChange={(v) => onChange({ widget_type: v as WidgetType })}
            options={WIDGET_TYPE_OPTIONS}
          />
        </Row>

        <Row label="Data Source">
          <Select
            value={cfg.entity || 'lead'}
            onChange={(v) => updateCfg('entity', v)}
            options={ENTITIES}
          />
        </Row>

        {widget.widget_type === 'kpi' && (
          <>
            <Row label="Aggregation">
              <Select
                value={cfg.aggregation || 'count'}
                onChange={(v) => updateCfg('aggregation', v)}
                options={KPI_AGGREGATIONS}
              />
            </Row>
            {(cfg.aggregation === 'sum' || cfg.aggregation === 'avg') && (
              <Row label="Field">
                <TextInput
                  value={cfg.field || ''}
                  onChange={(v) => updateCfg('field', v)}
                  placeholder="e.g. amount"
                />
              </Row>
            )}
            <Row label="Accent Color">
              <div className="flex gap-1.5 flex-wrap">
                {KPI_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateCfg('color', c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      cfg.color === c ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105'
                    } bg-${c}-500`}
                    title={c}
                  />
                ))}
              </div>
            </Row>
          </>
        )}

        {widget.widget_type === 'chart' && (
          <>
            <Row label="Chart Type">
              <Select
                value={cfg.chart_type || 'bar'}
                onChange={(v) => updateCfg('chart_type', v)}
                options={CHART_TYPES}
              />
            </Row>
            <Row label="Group By">
              <TextInput
                value={cfg.group_by || ''}
                onChange={(v) => updateCfg('group_by', v)}
                placeholder="e.g. status, source"
              />
            </Row>
          </>
        )}

        {widget.widget_type === 'table' && (
          <>
            <Row label="Columns (comma-separated)">
              <TextInput
                value={Array.isArray((widget.config_json as Record<string, unknown>).columns)
                  ? ((widget.config_json as Record<string, unknown>).columns as string[]).join(', ')
                  : ''}
                onChange={(v) => onChange({ config_json: { ...cfg, columns: v.split(',').map((s) => s.trim()) as unknown as string } })}
                placeholder="name, status, date"
              />
            </Row>
            <Row label="Row Limit">
              <TextInput
                value={String(cfg.limit || '5')}
                onChange={(v) => updateCfg('limit', v)}
                placeholder="5"
              />
            </Row>
          </>
        )}

        <div className="border-t border-slate-100 pt-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Size & Position</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-500 mb-0.5 block">Width (cols)</label>
              <input
                type="number"
                min={1}
                max={12}
                value={widget.width}
                onChange={(e) => onChange({ width: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-0.5 block">Height (rows)</label>
              <input
                type="number"
                min={1}
                max={8}
                value={widget.height}
                onChange={(e) => onChange({ height: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
