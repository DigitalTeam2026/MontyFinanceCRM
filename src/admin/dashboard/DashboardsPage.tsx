import { useState } from 'react';
import type { Dashboard } from '../../types/dashboard';
import DashboardListPage from './DashboardListPage';
import DashboardDesignerPage from './DashboardDesignerPage';

type View = 'list' | 'designer';

export default function DashboardsPage() {
  const [view, setView] = useState<View>('list');
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);

  const handleEdit = (dashboard: Dashboard) => {
    setActiveDashboardId(dashboard.dashboard_id);
    setView('designer');
  };

  const handleBack = () => {
    setActiveDashboardId(null);
    setView('list');
  };

  if (view === 'designer' && activeDashboardId) {
    return <DashboardDesignerPage dashboardId={activeDashboardId} onBack={handleBack} />;
  }

  return <DashboardListPage onEdit={handleEdit} />;
}
