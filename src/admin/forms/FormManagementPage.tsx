import { useState } from 'react';
import type { FormDefinition } from '../../types/form';
import FormListPage from './FormListPage';
import FormDesignerPage from './FormDesignerPage';

type View = 'list' | 'designer';

interface FormManagementPageProps {
  preselectedEntityId?: string;
}

export default function FormManagementPage({ preselectedEntityId }: FormManagementPageProps) {
  const [view, setView] = useState<View>('list');
  const [activeForm, setActiveForm] = useState<FormDefinition | null>(null);
  const [activeEntityId, setActiveEntityId] = useState(preselectedEntityId ?? '');

  const handleOpen = (form: FormDefinition, entityId: string) => {
    setActiveForm(form);
    setActiveEntityId(entityId);
    setView('designer');
  };

  const handleBack = () => {
    setView('list');
    setActiveForm(null);
    setActiveEntityId('');
  };

  if (view === 'designer' && activeForm) {
    return (
      <FormDesignerPage
        form={activeForm}
        entityId={activeEntityId}
        onBack={handleBack}
        onFormUpdate={(updated) => setActiveForm(updated)}
      />
    );
  }

  return <FormListPage onOpen={handleOpen} preselectedEntityId={preselectedEntityId} />;
}
