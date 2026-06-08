import { useState } from 'react';
import type { ViewDefinition } from '../../types/view';
import ViewListPage from './ViewListPage';
import ViewDesignerPage from './ViewDesignerPage';

type View = 'list' | 'designer';

interface ViewManagementPageProps {
  preselectedEntityId?: string;
}

export default function ViewManagementPage({ preselectedEntityId }: ViewManagementPageProps) {
  const [view, setView] = useState<View>('list');
  const [activeView, setActiveView] = useState<ViewDefinition | null>(null);
  const [activeEntityId, setActiveEntityId] = useState(preselectedEntityId ?? '');

  const handleOpen = (v: ViewDefinition, entityId: string) => {
    setActiveView(v);
    setActiveEntityId(entityId);
    setView('designer');
  };

  const handleBack = () => {
    setView('list');
    setActiveView(null);
    setActiveEntityId('');
  };

  if (view === 'designer' && activeView) {
    return (
      <ViewDesignerPage
        view={activeView}
        entityId={activeEntityId}
        onBack={handleBack}
        onViewUpdate={(updated) => setActiveView(updated)}
      />
    );
  }

  return <ViewListPage onOpen={handleOpen} preselectedEntityId={preselectedEntityId} />;
}
