// Sales → Dashboard entry point.
//
// Renders the PUBLISHED organization default dashboard through the SAME shared
// renderer the Admin Studio designer uses (view mode), so Sales shows exactly
// what an admin configured and published. Until a default dashboard has been
// published (with widgets), it falls back to the original hardcoded dashboard so
// there is never a regression.

import { useEffect, useState } from 'react';
import type { AppEntity, AppModule } from '../types';
import { fetchDefaultDashboard, fetchDashboardWithWidgets } from '../../services/dashboardService';
import DashboardRenderer from '../../admin/dashboard/DashboardRenderer';
import PersonalDashboard, { type DashFilter } from './PersonalDashboard';

interface SalesDashboardProps {
  userId: string;
  onNavigateFiltered?: (entity: AppEntity, module: AppModule, filters: DashFilter[], contextLabel: string) => void;
  onOpenRecord?: (entity: AppEntity, id: string, label?: string) => void;
}

type Mode = 'loading' | 'db' | 'fallback';

export default function SalesDashboard({ userId, onNavigateFiltered, onOpenRecord }: SalesDashboardProps) {
  const [mode, setMode] = useState<Mode>('loading');
  const [dashboardId, setDashboardId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const def = await fetchDefaultDashboard();
        if (!def) { if (alive) setMode('fallback'); return; }
        const { widgets } = await fetchDashboardWithWidgets(def.dashboard_id);
        if (!alive) return;
        if (widgets.length > 0) { setDashboardId(def.dashboard_id); setMode('db'); }
        else setMode('fallback');
      } catch {
        if (alive) setMode('fallback');
      }
    })();
    return () => { alive = false; };
  }, []);

  if (mode === 'loading') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)' }}>
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (mode === 'db' && dashboardId) {
    // Pure consumption: no Back / no Edit controls in Sales.
    return <DashboardRenderer dashboardId={dashboardId} userId={userId} mode="view" />;
  }

  return (
    <PersonalDashboard userId={userId} onNavigateFiltered={onNavigateFiltered} onOpenRecord={onOpenRecord} />
  );
}
