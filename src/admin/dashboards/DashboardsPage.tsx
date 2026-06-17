import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import type { DashboardState } from '../AdminStudio';
import DashboardListPage from './DashboardListPage';
import DashboardCreatePage from './DashboardCreatePage';

// The designer pulls in ECharts + dnd-kit, so load it lazily.
const DashboardDesigner = lazy(() => import('./designer/DashboardDesigner'));

interface Props {
  state: DashboardState;
  onStateChange: (s: DashboardState) => void;
}

export default function DashboardsPage({ state, onStateChange }: Props) {
  if (state.view === 'create') {
    return (
      <DashboardCreatePage
        onCreated={(id) => onStateChange({ view: 'designer', dashboardId: id })}
        onCancel={() => onStateChange({ view: 'list' })}
      />
    );
  }

  if (state.view === 'designer' && state.dashboardId) {
    return (
      <Suspense fallback={<DesignerLoading />}>
        <DashboardDesigner
          dashboardId={state.dashboardId}
          onExit={() => onStateChange({ view: 'list' })}
        />
      </Suspense>
    );
  }

  return (
    <DashboardListPage
      onNew={() => onStateChange({ view: 'create' })}
      onOpen={(id) => onStateChange({ view: 'designer', dashboardId: id })}
    />
  );
}

function DesignerLoading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-900 text-slate-300">
      <Loader2 className="animate-spin" size={20} />
    </div>
  );
}
