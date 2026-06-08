import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import LoginPage from './LoginPage';
import AdminStudio from './admin/AdminStudio';
import CrmApp from './app/CrmApp';
import type { AppEntity } from './app/types';

const ENTITY_MODULE_MAP: Record<AppEntity, 'sales' | 'marketing' | 'support'> = {
  accounts: 'sales',
  contacts: 'sales',
  leads: 'sales',
  opportunities: 'sales',
  tickets: 'support',
};

type ParsedRoute =
  | { type: 'studio' }
  | { type: 'app' }
  | { type: 'record'; entity: AppEntity; id: string };

function parseRoute(): ParsedRoute {
  const hash = window.location.hash;
  if (hash.startsWith('#/studio')) return { type: 'studio' };
  const recordMatch = hash.match(/^#\/record\/([^/]+)\/([^/]+)/);
  if (recordMatch) {
    const entity = recordMatch[1] as AppEntity;
    if (entity in ENTITY_MODULE_MAP) {
      return { type: 'record', entity, id: recordMatch[2] };
    }
  }
  return { type: 'app' };
}

export function buildRecordUrl(entitySlug: string, id: string): string {
  return `${window.location.pathname}${window.location.search}#/record/${entitySlug}/${id}`;
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isSystemAdmin, setIsSystemAdmin] = useState<boolean | null>(null);
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    const handler = () => setRoute(parseRoute());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    // Timeout guard: if auth check doesn't resolve in 5s, fall through to login
    const timeout = setTimeout(() => {
      setSession((prev) => (prev === undefined ? null : prev));
      setIsSystemAdmin((prev) => (prev === null ? false : prev));
    }, 5000);

    supabase.auth.getSession().then(({ data }) => {
      clearTimeout(timeout);
      if (data.session) {
        setSession(data.session);
        loadAdminStatus(data.session.user.id);
      } else {
        setSession(null);
        setIsSystemAdmin(false);
      }
    }).catch(() => {
      clearTimeout(timeout);
      setSession(null);
      setIsSystemAdmin(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
      if (s) {
        loadAdminStatus(s.user.id);
      } else {
        setIsSystemAdmin(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const loadAdminStatus = async (userId: string) => {
    const { data } = await supabase
      .from('crm_user')
      .select('is_system_admin')
      .eq('user_id', userId)
      .maybeSingle();
    setIsSystemAdmin(data?.is_system_admin ?? false);
  };

  // Loading
  if (session === undefined || (session !== null && isSystemAdmin === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not logged in
  if (!session) {
    return <LoginPage onLogin={() => {}} />;
  }

  // Admin + studio route
  if (isSystemAdmin && route.type === 'studio') {
    return <AdminStudio />;
  }

  // CRM app (all users)
  if (route.type === 'record') {
    return (
      <CrmApp
        initialEntity={route.entity}
        initialModule={ENTITY_MODULE_MAP[route.entity]}
        initialRecordId={route.id}
      />
    );
  }

  return <CrmApp />;
}
