import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import type { Session } from './lib/supabase';
import { supabase } from './lib/supabase';
import LoginPage from './LoginPage';
import { parseRoute, replaceHash } from './lib/appRoute';

const DEFAULT_HASH = '#/app/sales/accounts/dashboard';

// Admin Studio is admin-only and pulls in a large designer surface (entity/form/
// workflow/dashboard editors). Lazy-load it so regular users never download it,
// and the CRM app loads independently of the admin bundle.
const AdminStudio = lazy(() => import('./admin/AdminStudio'));
const CrmApp = lazy(() => import('./app/CrmApp'));

/** Minimal full-screen spinner shown while a lazy surface chunk downloads. */
function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function buildRecordUrl(entitySlug: string, id: string): string {
  return `${window.location.pathname}${window.location.search}#/record/${entitySlug}/${id}`;
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isSystemAdmin, setIsSystemAdmin] = useState<boolean | null>(null);
  const [route, setRoute] = useState(parseRoute);
  // Where to send the user after a successful login — the route they originally
  // tried to open before being bounced to #/login.
  const redirectTargetRef = useRef<string | null>(null);

  useEffect(() => {
    const handler = () => setRoute(parseRoute());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // Keep the URL in sync with the auth gate. Logged-out users are sent to
  // #/login (remembering where they were headed); once logged in, anyone sitting
  // on #/login is bounced to their intended destination (or the default).
  useEffect(() => {
    if (session === undefined) return; // auth still resolving
    if (!session) {
      if (route.surface !== 'login') {
        const current = window.location.hash;
        redirectTargetRef.current =
          current && !current.startsWith('#/login') ? current : null;
        replaceHash('#/login');
        setRoute(parseRoute());
      }
      return;
    }
    if (route.surface === 'login') {
      const target = redirectTargetRef.current;
      redirectTargetRef.current = null;
      replaceHash(target && !target.startsWith('#/login') ? target : DEFAULT_HASH);
      setRoute(parseRoute());
    }
  }, [session, route.surface]);

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

  // Not logged in — the gate effect has pointed the URL at #/login.
  if (!session) {
    return <LoginPage onLogin={() => {}} />;
  }

  // Logged in but still on #/login: the gate effect is redirecting to the
  // intended destination. Show the spinner rather than a flash of the CRM app.
  if (route.surface === 'login') {
    return <FullScreenSpinner />;
  }

  // Admin + studio route
  if (isSystemAdmin && route.surface === 'studio') {
    return (
      <Suspense fallback={<FullScreenSpinner />}>
        <AdminStudio />
      </Suspense>
    );
  }

  // CRM app (all users). A non-admin landing on a studio hash falls through to
  // the CRM default rather than being shown a blank screen. Session and admin
  // status are passed down so CrmApp does not re-run the auth bootstrap.
  return (
    <Suspense fallback={<FullScreenSpinner />}>
      <CrmApp
        initialSession={session}
        initialIsSystemAdmin={isSystemAdmin}
        initialModule={route.surface === 'crm' ? route.module : undefined}
        initialEntity={route.surface === 'crm' ? route.entity : undefined}
        initialView={route.surface === 'crm' ? route.view : undefined}
        initialViewId={route.surface === 'crm' ? route.viewId : undefined}
        initialSearch={route.surface === 'crm' ? route.search : undefined}
      />
    </Suspense>
  );
}
