import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Save, BarChart2, TrendingUp, PieChart,
  Hash, Table2, Activity, Plus, Shield, Wrench,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import {
  fetchDashboardWithWidgets, updateDashboard, upsertWidgets,
} from '../../services/dashboardService';
import type { Dashboard, DashboardWidget } from '../../types/dashboard';
import WidgetPreview from './WidgetPreview';
import WidgetConfigPanel from './WidgetConfigPanel';

interface DashboardDesignerPageProps {
  dashboardId: string;
  onBack: () => void;
}

interface WidgetTemplate {
  type: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  defaultConfig: Record<string, unknown>;
  width: number;
  height: number;
}

const WIDGET_TEMPLATES: WidgetTemplate[] = [
  {
    type: 'kpi', label: 'KPI Card', icon: <Hash size={15} />,
    color: 'text-rose-500 bg-rose-50 border-rose-200',
    defaultConfig: { entity: 'lead', aggregation: 'count', color: 'blue' },
    width: 3, height: 2,
  },
  {
    type: 'chart', label: 'Bar Chart', icon: <BarChart2 size={15} />,
    color: 'text-blue-500 bg-blue-50 border-blue-200',
    defaultConfig: { entity: 'lead', chart_type: 'bar', group_by: 'status' },
    width: 6, height: 4,
  },
  {
    type: 'chart', label: 'Line Chart', icon: <TrendingUp size={15} />,
    color: 'text-emerald-500 bg-emerald-50 border-emerald-200',
    defaultConfig: { entity: 'opportunity', chart_type: 'line', group_by: 'close_date' },
    width: 6, height: 4,
  },
  {
    type: 'chart', label: 'Pie Chart', icon: <PieChart size={15} />,
    color: 'text-amber-500 bg-amber-50 border-amber-200',
    defaultConfig: { entity: 'lead', chart_type: 'pie', group_by: 'source' },
    width: 4, height: 4,
  },
  {
    type: 'table', label: 'Data Table', icon: <Table2 size={15} />,
    color: 'text-slate-600 bg-slate-100 border-slate-200',
    defaultConfig: { entity: 'lead', columns: ['name', 'status', 'created_at'], limit: '5' },
    width: 12, height: 4,
  },
  {
    type: 'activity', label: 'Activity Feed', icon: <Activity size={15} />,
    color: 'text-sky-500 bg-sky-50 border-sky-200',
    defaultConfig: { entity: 'lead' },
    width: 4, height: 5,
  },
];

const COLS = 12;
const ROW_H = 80;
const COL_W = 76;

export default function DashboardDesignerPage({ dashboardId, onBack }: DashboardDesignerPageProps) {
  const { showSuccess } = useToast();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dashName, setDashName] = useState('');
  const [editingName, setEditingName] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { dashboard: d, widgets: w } = await fetchDashboardWithWidgets(dashboardId);
      setDashboard(d);
      setDashName(d.name);
      setWidgets(w);
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => { load(); }, [load]);

  const selectedWidget = widgets.find((w) => w.widget_id === selectedId) ?? null;

  const addWidget = (template: WidgetTemplate) => {
    const maxY = widgets.reduce((acc, w) => Math.max(acc, w.position_y + w.height), 0);
    const newWidget: DashboardWidget = {
      widget_id: `temp-${Date.now()}`,
      dashboard_id: dashboardId,
      widget_type: template.type as DashboardWidget['widget_type'],
      title: template.label,
      config_json: template.defaultConfig,
      position_x: 0,
      position_y: maxY,
      width: template.width,
      height: template.height,
      sort_order: widgets.length,
    };
    setWidgets((prev) => [...prev, newWidget]);
    setSelectedId(newWidget.widget_id);
  };

  const updateWidget = (widgetId: string, updates: Partial<DashboardWidget>) => {
    setWidgets((prev) =>
      prev.map((w) => w.widget_id === widgetId ? { ...w, ...updates } : w)
    );
  };

  const removeWidget = (widgetId: string) => {
    setWidgets((prev) => prev.filter((w) => w.widget_id !== widgetId));
    if (selectedId === widgetId) setSelectedId(null);
  };

  const handleSave = async () => {
    if (!dashboard) return;
    setSaving(true);
    try {
      const nameChanged = dashName !== dashboard.name;
      if (nameChanged) {
        const updated = await updateDashboard(dashboardId, { name: dashName });
        setDashboard(updated);
      }

      const toSave = widgets.map(({ widget_id, ...rest }) => ({
        ...rest,
        dashboard_id: dashboardId,
        widget_id: widget_id.startsWith('temp-') ? undefined : widget_id,
      }));

      const saved_widgets = await upsertWidgets(dashboardId, toSave as Parameters<typeof upsertWidgets>[1]);
      setWidgets(saved_widgets);
      showSuccess('Dashboard saved');
    } finally {
      setSaving(false);
    }
  };

  const canvasWidth = COLS * COL_W;
  const canvasHeight = Math.max(
    4,
    widgets.reduce((acc, w) => Math.max(acc, w.position_y + w.height), 0) + 2
  ) * ROW_H;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!dashboard) return null;

  const isSystem = dashboard.is_system;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f3f4f6]">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div className="w-px h-4 bg-slate-200" />
          {editingName ? (
            <input
              type="text"
              value={dashName}
              onChange={(e) => setDashName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
              className="text-sm font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:border-blue-500"
              autoFocus
            />
          ) : (
            <button
              onClick={() => !isSystem && setEditingName(true)}
              className={`text-sm font-bold text-slate-800 ${!isSystem ? 'hover:text-blue-600 cursor-pointer' : 'cursor-default'}`}
            >
              {dashName}
            </button>
          )}
          {isSystem ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-semibold rounded-full">
              <Shield size={9} /> System
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold rounded-full">
              <Wrench size={9} /> Custom
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <Save size={13} />
            {saving ? 'Saving…' : 'Save Dashboard'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left: Widget palette */}
        <div className="w-52 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="px-3 py-2.5 border-b border-slate-100">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Add Widget</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {WIDGET_TEMPLATES.map((t) => (
              <button
                key={`${t.type}-${t.label}`}
                onClick={() => addWidget(t)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left group"
              >
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${t.color}`}>
                  {t.icon}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">{t.label}</p>
                  <p className="text-[10px] text-slate-400">{t.width}×{t.height}</p>
                </div>
                <Plus size={12} className="ml-auto text-slate-300 group-hover:text-blue-400 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 overflow-auto p-6 bg-[#f0f2f5]">
          <div
            className="relative bg-white rounded-2xl shadow-sm border border-slate-200 mx-auto"
            style={{ width: canvasWidth, minHeight: canvasHeight }}
          >
            {/* Grid lines */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, #e2e8f0 0px, #e2e8f0 1px, transparent 1px, transparent ${COL_W}px),
                                   repeating-linear-gradient(to bottom, #e2e8f0 0px, #e2e8f0 1px, transparent 1px, transparent ${ROW_H}px)`,
                backgroundSize: `${COL_W}px ${ROW_H}px`,
              }}
            />

            {widgets.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
                <BarChart2 size={40} className="text-slate-200 mb-3" />
                <p className="text-sm font-medium text-slate-400">Add widgets from the left panel</p>
                <p className="text-xs text-slate-300 mt-1">Click any widget type to add it to the canvas</p>
              </div>
            )}

            {widgets.map((w) => (
              <div
                key={w.widget_id}
                className="absolute p-1"
                style={{
                  left: w.position_x * COL_W,
                  top: w.position_y * ROW_H,
                  width: w.width * COL_W,
                  height: w.height * ROW_H,
                }}
              >
                <WidgetPreview
                  widget={w}
                  selected={selectedId === w.widget_id}
                  onClick={() => setSelectedId(selectedId === w.widget_id ? null : w.widget_id)}
                  onRemove={() => removeWidget(w.widget_id)}
                />
              </div>
            ))}
          </div>

          {/* Layout controls hint */}
          <div className="mt-4 text-center">
            <p className="text-[11px] text-slate-400">
              Click a widget to configure it · Adjust position & size in the right panel
            </p>
          </div>
        </div>

        {/* Right: Widget config */}
        {selectedWidget && (
          <WidgetConfigPanel
            widget={selectedWidget}
            onChange={(updates) => updateWidget(selectedWidget.widget_id, updates)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
