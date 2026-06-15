// Single entry point for the unified Dashboards area (Admin Studio → Dashboards).
//
// Flow: on open, auto-loads the organization DEFAULT dashboard into the live
// runtime viewer (Power BI–style). From there: Back → gallery (browse/manage all
// dashboards), Edit → designer. Gallery "open" returns to the viewer.

import { useEffect, useState } from 'react';
import type { Dashboard } from '../../types/dashboard';
import { fetchDefaultDashboard } from '../../services/dashboardService';
import DashboardListPage from './DashboardListPage';
import DashboardDesignerPage from './DashboardDesignerPage';
import DashboardRuntime from './DashboardRuntime';

type View = 'loading' | 'viewer' | 'gallery' | 'designer';

interface DashboardsPageProps {
  userId: string;
}

export default function DashboardsPage({ userId }: DashboardsPageProps) {
  const [view, setView] = useState<View>('loading');
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);

  // Auto-open the default dashboard on first entry.
  useEffect(() => {
    let alive = true;
    fetchDefaultDashboard()
      .then((d) => {
        if (!alive) return;
        if (d) { setActiveDashboardId(d.dashboard_id); setView('viewer'); }
        else setView('gallery');
      })
      .catch(() => { if (alive) setView('gallery'); });
    return () => { alive = false; };
  }, []);

  const openViewer = (d: Dashboard) => { setActiveDashboardId(d.dashboard_id); setView('viewer'); };
  const openDesigner = (id: string) => { setActiveDashboardId(id); setView('designer'); };
  const backToGallery = () => { setActiveDashboardId(null); setView('gallery'); };

  if (view === 'loading') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (view === 'viewer' && activeDashboardId) {
    return (
      <DashboardRuntime
        dashboardId={activeDashboardId}
        userId={userId}
        onBack={backToGallery}
        onEdit={openDesigner}
      />
    );
  }

  if (view === 'designer' && activeDashboardId) {
    return <DashboardDesignerPage dashboardId={activeDashboardId} onBack={backToGallery} />;
  }

  // Gallery: "View/Open" opens the runtime viewer; Edit opens the designer.
  return <DashboardListPage onEdit={openViewer} />;
}
