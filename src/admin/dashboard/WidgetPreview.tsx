import { BarChart2, TrendingUp, PieChart, Hash, Table2, Activity } from 'lucide-react';
import type { DashboardWidget } from '../../types/dashboard';

interface WidgetPreviewProps {
  widget: DashboardWidget;
  selected: boolean;
  onClick: () => void;
  onRemove: () => void;
}

const WIDGET_ICONS: Record<string, React.ReactNode> = {
  kpi:      <Hash size={14} />,
  chart:    <BarChart2 size={14} />,
  table:    <Table2 size={14} />,
  activity: <Activity size={14} />,
};

const KPI_COLORS: Record<string, string> = {
  blue:    'from-blue-500 to-blue-600',
  emerald: 'from-emerald-500 to-emerald-600',
  amber:   'from-amber-500 to-amber-600',
  rose:    'from-rose-500 to-rose-600',
  sky:     'from-sky-500 to-sky-600',
  slate:   'from-slate-500 to-slate-600',
};

function KpiPreview({ widget }: { widget: DashboardWidget }) {
  const cfg = widget.config_json as Record<string, string>;
  const colorKey = cfg.color || 'blue';
  const gradient = KPI_COLORS[colorKey] || KPI_COLORS.blue;
  return (
    <div className="h-full flex flex-col justify-between p-3">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-slate-600 leading-tight">{widget.title}</p>
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
          <Hash size={13} className="text-white" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800">—</p>
        <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{cfg.entity || 'entity'} · {cfg.aggregation || 'count'}</p>
      </div>
    </div>
  );
}

function ChartPreview({ widget }: { widget: DashboardWidget }) {
  const cfg = widget.config_json as Record<string, string>;
  const chartType = cfg.chart_type || 'bar';

  const bars = [60, 85, 45, 70, 90, 55, 75];

  return (
    <div className="h-full flex flex-col p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-600">{widget.title}</p>
        {chartType === 'bar' && <BarChart2 size={12} className="text-slate-400" />}
        {chartType === 'line' && <TrendingUp size={12} className="text-slate-400" />}
        {(chartType === 'pie' || chartType === 'donut') && <PieChart size={12} className="text-slate-400" />}
      </div>
      <div className="flex-1 flex items-end">
        {chartType === 'bar' && (
          <div className="w-full flex items-end gap-1 h-full pb-1">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-gradient-to-t from-blue-500 to-blue-400 opacity-70"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        )}
        {chartType === 'line' && (
          <svg className="w-full h-full" viewBox="0 0 100 50" preserveAspectRatio="none">
            <polyline
              points="0,40 15,30 30,35 45,20 60,25 75,15 100,18"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.8"
            />
            <polyline
              points="0,40 15,30 30,35 45,20 60,25 75,15 100,18 100,50 0,50"
              fill="#3b82f6"
              opacity="0.1"
            />
          </svg>
        )}
        {(chartType === 'pie' || chartType === 'donut') && (
          <div className="w-full flex items-center justify-center h-full">
            <div className="relative w-16 h-16">
              <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90">
                <circle cx="16" cy="16" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                <circle cx="16" cy="16" r="14" fill="none" stroke="#3b82f6" strokeWidth="3"
                  strokeDasharray="44 44" strokeLinecap="round" />
                <circle cx="16" cy="16" r="14" fill="none" stroke="#10b981" strokeWidth="3"
                  strokeDasharray="22 66" strokeDashoffset="-44" strokeLinecap="round" />
                <circle cx="16" cy="16" r="14" fill="none" stroke="#f59e0b" strokeWidth="3"
                  strokeDasharray="22 66" strokeDashoffset="-66" strokeLinecap="round" />
              </svg>
              {chartType === 'donut' && (
                <div className="absolute inset-3 rounded-full bg-white" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TablePreview({ widget }: { widget: DashboardWidget }) {
  const cfg = widget.config_json as Record<string, unknown>;
  const cols = (cfg.columns as string[]) || ['name', 'status', 'date'];
  return (
    <div className="h-full flex flex-col p-3">
      <p className="text-xs font-semibold text-slate-600 mb-2">{widget.title}</p>
      <div className="flex-1 overflow-hidden">
        <div className="flex border-b border-slate-100 pb-1 mb-1">
          {cols.slice(0, 3).map((c) => (
            <div key={c} className="flex-1 text-[9px] font-semibold text-slate-400 uppercase">{c}</div>
          ))}
        </div>
        {[1, 2, 3].map((row) => (
          <div key={row} className="flex py-0.5">
            {cols.slice(0, 3).map((c) => (
              <div key={c} className="flex-1 h-2 bg-slate-100 rounded mr-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WidgetPreview({ widget, selected, onClick, onRemove }: WidgetPreviewProps) {
  return (
    <div
      onClick={onClick}
      className={`absolute inset-0 bg-white rounded-xl border-2 cursor-pointer transition-all overflow-hidden group ${
        selected
          ? 'border-blue-500 shadow-lg shadow-blue-100'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      {widget.widget_type === 'kpi' && <KpiPreview widget={widget} />}
      {widget.widget_type === 'chart' && <ChartPreview widget={widget} />}
      {widget.widget_type === 'table' && <TablePreview widget={widget} />}
      {widget.widget_type === 'activity' && (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <Activity size={18} className="text-slate-300 mx-auto mb-1" />
            <p className="text-[10px] text-slate-400">{widget.title}</p>
          </div>
        </div>
      )}

      {/* type badge */}
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <span className="px-1.5 py-0.5 bg-slate-800/70 text-white text-[9px] rounded-full flex items-center gap-0.5">
          {WIDGET_ICONS[widget.widget_type]} {widget.widget_type}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] transition-colors"
        >
          ×
        </button>
      </div>

      {selected && (
        <div className="absolute inset-0 ring-2 ring-blue-500 ring-inset rounded-xl pointer-events-none" />
      )}
    </div>
  );
}
