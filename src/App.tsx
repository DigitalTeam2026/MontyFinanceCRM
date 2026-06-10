import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import LoginPage from './LoginPage';
import AdminStudio from './admin/AdminStudio';
import CrmApp from './app/CrmApp';
import { parseRoute } from './lib/appRoute';

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
  if (isSystemAdmin && route.surface === 'studio') {
    return <AdminStudio />;
  }

  // CRM app (all users). A non-admin landing on a studio hash falls through to
  // the CRM default rather than being shown a blank screen.
  if (route.surface === 'crm') {
    return (
      <CrmApp
        initialModule={route.module}
        initialEntity={route.entity}
        initialView={route.view}
        initialViewId={route.viewId}
        initialSearch={route.search}
      />
    );
  }

  return <CrmApp />;
}
