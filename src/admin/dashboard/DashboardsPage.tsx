// Single entry point for the unified Dashboards area (Admin Studio → Dashboards).
//
// On open, auto-loads the organization DEFAULT dashboard into the shared renderer
// (the SAME component Sales uses). "Edit" switches the same renderer into edit
// mode — there is no separate designer canvas. Back → gallery to browse/manage all.

import { useEffect, useState } from 'react';
import type { Dashboard } from '../../types/dashboard';
import { fetchDefaultDashboard } from '../../services/dashboardService';
import DashboardListPage from './DashboardListPage';
import DashboardRenderer from './DashboardRenderer';

type View = 'loading' | 'viewer' | 'editor' | 'gallery';

interface DashboardsPageProps {
  userId: string;
}

export default function DashboardsPage({ userId }: DashboardsPageProps) {
  const [view, setView] = useState<View>('loading');
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchDefaultDashboard()
      .then((d) => { if (!alive) return; if (d) { setActiveId(d.dashboard_id); setView('viewer'); } else setView('gallery'); })
      .catch(() => { if (alive) setView('gallery'); });
    return () => { alive = false; };
  }, []);

  const openViewer = (d: Dashboard) => { setActiveId(d.dashboard_id); setView('viewer'); };
  const backToGallery = () => { setActiveId(null); setView('gallery'); };

  if (view === 'loading') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (view === 'viewer' && activeId) {
    return (
      <DashboardRenderer
        dashboardId={activeId}
        userId={userId}
        mode="view"
        canEdit
        onBack={backToGallery}
        onRequestEdit={() => setView('editor')}
      />
    );
  }

  if (view === 'editor' && activeId) {
    return (
      <DashboardRenderer
        dashboardId={activeId}
        userId={userId}
        mode="edit"
        onBack={backToGallery}
        onExitEdit={() => setView('viewer')}
      />
    );
  }

  // Gallery: opening a dashboard loads it in the shared renderer.
  return <DashboardListPage onEdit={openViewer} />;
}
