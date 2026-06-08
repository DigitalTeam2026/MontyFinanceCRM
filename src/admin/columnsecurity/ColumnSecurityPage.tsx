import { useState, useEffect } from 'react';
import type { ColumnSecurityProfile } from '../../services/columnSecurityService';
import { fetchColumnSecurityProfiles } from '../../services/columnSecurityService';
import ColumnSecurityProfileListPage from './ColumnSecurityProfileListPage';
import ColumnSecurityProfileEditorPage from './ColumnSecurityProfileEditorPage';

type View = 'list' | 'new' | 'edit';

interface State {
  view: View;
  profile?: ColumnSecurityProfile;
}

export default function ColumnSecurityPage() {
  const [state, setState] = useState<State>({ view: 'list' });
  const [profiles, setProfiles] = useState<ColumnSecurityProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchColumnSecurityProfiles()
      .then(setProfiles)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (state.view === 'new') {
    return (
      <ColumnSecurityProfileEditorPage
        onBack={() => setState({ view: 'list' })}
        onSaved={load}
      />
    );
  }

  if (state.view === 'edit' && state.profile) {
    return (
      <ColumnSecurityProfileEditorPage
        profile={state.profile}
        onBack={() => setState({ view: 'list' })}
        onSaved={load}
      />
    );
  }

  return (
    <ColumnSecurityProfileListPage
      profiles={profiles}
      loading={loading}
      onNew={() => setState({ view: 'new' })}
      onEdit={(p) => setState({ view: 'edit', profile: p })}
      onRefresh={load}
    />
  );
}
