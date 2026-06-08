import { BarChart2, TrendingUp, PieChart, Activity, Hash, Clock } from 'lucide-react';

const WIDGET_TYPES = [
  { icon: <BarChart2 size={20} />, label: 'Bar Chart', desc: 'Compare values across categories', color: 'text-blue-500 bg-blue-50' },
  { icon: <TrendingUp size={20} />, label: 'Line Chart', desc: 'Track trends over time', color: 'text-emerald-500 bg-emerald-50' },
  { icon: <PieChart size={20} />, label: 'Pie / Donut', desc: 'Show proportional breakdowns', color: 'text-amber-500 bg-amber-50' },
  { icon: <Hash size={20} />, label: 'KPI Card', desc: 'Single metric with target', color: 'text-rose-500 bg-rose-50' },
  { icon: <Activity size={20} />, label: 'Activity Feed', desc: 'Recent record changes', color: 'text-slate-500 bg-slate-100' },
  { icon: <Clock size={20} />, label: 'Timeline', desc: 'Events and milestones', color: 'text-sky-500 bg-sky-50' },
];

export default function DashboardBuilderPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-10">
      <div className="max-w-2xl w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-6 shadow-lg">
          <BarChart2 size={28} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Dashboard Builder</h2>
        <p className="text-sm text-slate-500 mb-2">
          Design interactive dashboards with charts, KPI cards, and activity feeds — all powered by your CRM data.
        </p>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium rounded-full mb-8">
          <Clock size={11} /> Scheduled for a later phase
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
          {WIDGET_TYPES.map((w) => (
            <div key={w.label} className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-slate-300 transition-colors">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${w.color}`}>
                {w.icon}
              </div>
              <p className="text-xs font-semibold text-slate-800 mb-0.5">{w.label}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">{w.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-left">
          <p className="text-xs font-semibold text-slate-700 mb-2">Planned capabilities</p>
          <ul className="space-y-1">
            {[
              'Drag-and-drop widget canvas with grid layout',
              'Connect widgets to any CRM entity and field',
              'Filter by date range, user, team, or business unit',
              'Share dashboards with specific security roles',
              'Auto-refresh intervals and real-time subscriptions',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-slate-500">
                <span className="w-1 h-1 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
