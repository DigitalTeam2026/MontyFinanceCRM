import { useState, useEffect, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import AppSidebar from './components/AppSidebar';
import AppHeader from './components/AppHeader';
import { useCurrentUserName } from './hooks/useCurrentUserName';
import EntityListPage from './pages/EntityListPage';
import RecordFormPage from './pages/RecordFormPage';
import SalesDashboard from './pages/SalesDashboard';
import type { AppEntity, AppModule } from './types';
import { ENTITY_LOGICAL_NAME } from './types';
import LoginPage from '../LoginPage';
import { PermissionProvider } from './context/PermissionContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './context/ToastContext';
import { PublishedMetadataProvider } from './context/PublishedMetadataProvider';
import { trackRecentItem } from './services/recentPinsService';
import type { QuickCreateType } from './components/QuickCreateButton';
import QuickCreateModal from './components/form/QuickCreateModal';
import { saveRecord } from './services/recordService';
import GlobalSearch from './components/GlobalSearch';
import { fetchCreationControlRules, isCreationBlocked } from './services/lifecycleRuleEngine';
import type { DigitalRule } from '../types/digitalRule';
import type { ActiveFilter } from './services/listService';
import { buildCrmHash, replaceHash } from '../lib/appRoute';
import type { CrmRouteView } from '../lib/appRoute';

type AppView =
  | { type: 'dashboard' }
  | { type: 'list' }
  | { type: 'record'; id: string }
  | { type: 'new' }
  | { type: 'filtered-list'; filters: ActiveFilter[]; contextLabel: string; parentFilter?: { fkColumn: string; parentId: string; parentLabel: string; parentEntity: string } };

interface CrmAppProps {
  initialEntity?: AppEntity;
  initialModule?: AppModule;
  /** Full initial view, parsed from the URL hash on (re)load. */
  initialView?: CrmRouteView;
  /** Active saved view id for an initial list view. */
  initialViewId?: string;
  /** Keyword search for an initial list view. */
  initialSearch?: string;
}

/** Map a URL-serialized view onto CrmApp's internal view state. */
function routeViewToAppView(v: CrmRouteView | undefined): AppView {
  if (!v) return { type: 'list' };
  switch (v.type) {
    case 'record':
      return { type: 'record', id: v.id };
    case 'new':
      return { type: 'new' };
    case 'filtered-list':
      return {
        type: 'filtered-list',
        filters: v.data.filters as ActiveFilter[],
        contextLabel: v.data.contextLabel,
        parentFilter: v.data.parentFilter,
      };
    case 'dashboard':
      return { type: 'dashboard' };
    default:
      return { type: 'list' };
  }
}

export default function CrmApp({
  initialEntity,
  initialModule,
  initialView,
  initialViewId,
  initialSearch,
}: CrmAppProps = {}) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const userName = useCurrentUserName(session?.user?.id);
  const [activeModule, setActiveModule] = useState<AppModule>(initialModule ?? 'sales');
  const [activeEntity, setActiveEntity] = useState<AppEntity>(initialEntity ?? 'accounts');
  const [search, setSearch] = useState(initialSearch ?? '');
  const [view, setView] = useState<AppView>(() => routeViewToAppView(initialView));
  // Active saved view id for the list (mirrored to the URL so a refresh reopens it).
  const [activeViewId, setActiveViewId] = useState<string | undefined>(initialViewId);
  // Active record tab (mirrored to the URL so a refresh reopens the same tab).
  const [activeRecordTab, setActiveRecordTab] = useState<string | undefined>(
    initialView?.type === 'record' ? initialView.tab : undefined
  );
  const [recentRefreshKey, setRecentRefreshKey] = useState(0);
  const [quickCreateType, setQuickCreateType] = useState<QuickCreateType | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [creationRules, setCreationRules] = useState<DigitalRule[]>([]);
  // Bumped when new customizations are published, to remount the content area so
  // open lists/records/dashboards reload metadata from the fresh snapshot.
  const [metadataEpoch, setMetadataEpoch] = useState(0);

  useEffect(() => {
    const onPublished = () => setMetadataEpoch((e) => e + 1);
    window.addEventListener('customizations-published', onPublished);
    return () => window.removeEventListener('customizations-published', onPublished);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        // If refresh fails, treat as signed out — don't fall back to the expired session
        const s = refreshed.session ?? null;
        setSession(s);
        if (s) loadAdminFlag(s.user.id);
      } else {
        setSession(null);
      }
    }).catch((err) => {
      // Never leave the app stuck on the loading spinner if session bootstrap throws
      console.error('[CrmApp] session bootstrap failed:', err);
      setSession(null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) loadAdminFlag(s.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchCreationControlRules().then(setCreationRules).catch(() => {});
    }
  }, [session]);

  const loadAdminFlag = async (userId: string) => {
    const { data } = await supabase
      .from('crm_user')
      .select('is_system_admin')
      .eq('user_id', userId)
      .maybeSingle();
    setIsSystemAdmin(data?.is_system_admin ?? false);
  };

  const handleActiveViewChange = useCallback((id: string | null) => {
    setActiveViewId(id ?? undefined);
  }, []);

  const handleGlobalSearchNavigate = useCallback((entity: AppEntity, module: AppModule, id: string) => {
    setGlobalSearchOpen(false);
    setActiveModule(module);
    setActiveEntity(entity);
    setSearch('');
    setView({ type: 'record', id });
  }, []);

  const handleNotificationNavigate = useCallback((module: AppModule, entity: AppEntity, id: string) => {
    setActiveModule(module);
    setActiveEntity(entity);
    setSearch('');
    setView({ type: 'record', id });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keep the URL hash in sync with the full CRM context (module, entity, view,
  // open record + tab, active saved view, keyword search, filtered-list context)
  // so any browser refresh restores the exact same location. Uses replaceState
  // (no history churn, never fires 'hashchange'); parseRoute reads it on reload.
  useEffect(() => {
    let routeView: CrmRouteView;
    if (view.type === 'record') {
      routeView = { type: 'record', id: view.id, tab: activeRecordTab };
    } else if (view.type === 'new') {
      routeView = { type: 'new' };
    } else if (view.type === 'filtered-list') {
      routeView = {
        type: 'filtered-list',
        data: { filters: view.filters, contextLabel: view.contextLabel, parentFilter: view.parentFilter },
      };
    } else if (view.type === 'dashboard') {
      routeView = { type: 'dashboard' };
    } else {
      routeView = { type: 'list' };
    }
    replaceHash(
      buildCrmHash({
        module: activeModule,
        entity: activeEntity,
        view: routeView,
        viewId: view.type === 'list' ? activeViewId : undefined,
        search: view.type === 'list' ? search : undefined,
      })
    );
  }, [view, activeModule, activeEntity, activeViewId, activeRecordTab, search]);

  // A saved-view id belongs to one entity; drop it when the entity changes so it
  // never leaks onto the wrong list. The ref skips the initial mount so the
  // view id parsed from the URL on reload is preserved.
  const prevEntityRef = useRef(activeEntity);
  useEffect(() => {
    if (prevEntityRef.current !== activeEntity) {
      prevEntityRef.current = activeEntity;
      setActiveViewId(undefined);
    }
  }, [activeEntity]);

  // The active tab belongs to one record; reset it when a different record opens
  // so the new record lands on its default tab. Skips the initial mount.
  const prevRecordIdRef = useRef(view.type === 'record' ? view.id : null);
  useEffect(() => {
    const id = view.type === 'record' ? view.id : null;
    if (prevRecordIdRef.current !== id) {
      prevRecordIdRef.current = id;
      setActiveRecordTab(undefined);
    }
  }, [view]);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--navy-900)' }}>
        <div className="w-5 h-5 border-2 border-[var(--navy-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage onLogin={() => {}} />;
  }

  const handleNavigate = (module: AppModule, entity: AppEntity) => {
    setActiveModule(module);
    setActiveEntity(entity);
    setSearch('');
    setView({ type: 'list' });
  };

  const handleOpenRecord = (id: string, label?: string) => {
    setView({ type: 'record', id });
    if (label) {
      trackRecentItem(session.user.id, activeEntity, activeModule, id, label).then(() => {
        setRecentRefreshKey((k) => k + 1);
      });
    }
  };

  const entityLogical = ENTITY_LOGICAL_NAME[activeEntity] ?? activeEntity;
  const creationCheck = isCreationBlocked(creationRules, entityLogical);

  const handleNewRecord = () => {
    if (creationCheck.blocked) return;
    setView({ type: 'new' });
  };
  const handleBack = () => setView({ type: 'list' });

  const handleViewAll = (entitySlug: string, fkColumn: string, parentId: string, contextLabel: string) => {
    const entityMap: Record<string, AppEntity> = {
      contacts: 'contacts', opportunities: 'opportunities', tickets: 'tickets',
      accounts: 'accounts', leads: 'leads',
    };
    const moduleMap: Record<AppEntity, AppModule> = {
      accounts: 'sales', contacts: 'sales', leads: 'sales',
      opportunities: 'sales', tickets: 'support',
    };
    const ent = entityMap[entitySlug];
    if (!ent) return;
    setActiveEntity(ent);
    setActiveModule(moduleMap[ent]);
    setSearch('');
    setView({
      type: 'filtered-list',
      filters: [{ id: `parent_${fkColumn}`, field: fkColumn, label: fkColumn, operator: 'eq', value: parentId }],
      contextLabel,
      parentFilter: { fkColumn, parentId, parentLabel: contextLabel, parentEntity: activeEntity },
    });
  };

  const handleSidebarNavigateToRecord = (module: AppModule, entity: AppEntity, recordId: string) => {
    setActiveModule(module);
    setActiveEntity(entity);
    setSearch('');
    setView({ type: 'record', id: recordId });
  };

  // Dashboard drill-down → open a record of an arbitrary entity (switches entity).
  const handleDashboardOpenRecord = (entity: AppEntity, id: string, label?: string) => {
    setActiveEntity(entity);
    setActiveModule('sales');
    setSearch('');
    setView({ type: 'record', id });
    if (label) {
      trackRecentItem(session.user.id, entity, 'sales', id, label).then(() => {
        setRecentRefreshKey((k) => k + 1);
      });
    }
  };

  const handleNavigateToDashboard = (module: AppModule, entity: AppEntity) => {
    setActiveModule(module);
    setActiveEntity(entity);
    setSearch('');
    setView({ type: 'dashboard' });
  };

  const handleDashboardNavigateFiltered = (
    entity: AppEntity,
    module: AppModule,
    filters: ActiveFilter[],
    contextLabel = 'Personal Dashboard',
  ) => {
    setActiveModule(module);
    setActiveEntity(entity);
    setSearch('');
    setView({
      type: 'filtered-list',
      filters,
      contextLabel,
    });
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      await supabase.auth.signOut({ scope: 'local' });
    }
    setSession(null);
  };

  const QUICK_CREATE_CONFIG: Record<QuickCreateType, {
    entity: AppEntity;
    module: AppModule;
    title: string;
    fields: import('./components/form/QuickCreateModal').QuickCreateField[];
    pk: string;
    nameField: string;
  }> = {
    lead: {
      entity: 'leads', module: 'sales', title: 'New Lead', pk: 'lead_id', nameField: 'full_name',
      fields: [
        { key: 'full_name',    label: 'Full Name',    type: 'text',     required: true,  placeholder: 'Jane Smith' },
        { key: 'company_name', label: 'Company',      type: 'text',     required: false, placeholder: 'Acme Corp' },
        { key: 'job_title',    label: 'Job Title',    type: 'text',     required: false, placeholder: 'Sales Manager' },
        { key: 'email',        label: 'Email',        type: 'email',    required: false, placeholder: 'jane@acme.com' },
        { key: 'phone',        label: 'Phone',        type: 'phone',    required: false, placeholder: '+1 555 000 0000' },
        { key: 'lead_source',  label: 'Lead Source',  type: 'select',   required: false,
          options: ['Web','Referral','Cold Call','Email Campaign','Social Media','Trade Show','Partner','Other'].map(v => ({ value: v.toLowerCase().replace(/ /g,'_'), label: v })) },
        { key: 'description',  label: 'Description',  type: 'textarea', required: false, placeholder: 'Additional notes about this lead...' },
      ],
    },
    opportunity: {
      entity: 'opportunities', module: 'sales', title: 'New Opportunity', pk: 'opportunity_id', nameField: 'name',
      fields: [
        { key: 'name',             label: 'Opportunity Name', type: 'text',   required: true,  placeholder: 'Deal name' },
        { key: 'estimated_value',  label: 'Est. Value ($)',   type: 'text',   required: false, placeholder: '10000' },
        { key: 'stage',            label: 'Stage',            type: 'select', required: false,
          options: ['Qualification','Proposal','Negotiation','Closed Won','Closed Lost'].map(v => ({ value: v.toLowerCase().replace(/ /g,'_'), label: v })) },
        { key: 'close_date',       label: 'Close Date',       type: 'text',   required: false, placeholder: 'YYYY-MM-DD' },
      ],
    },
    ticket: {
      entity: 'tickets', module: 'support', title: 'New Ticket', pk: 'case_id', nameField: 'title',
      fields: [
        { key: 'title',       label: 'Title',    type: 'text',     required: true,  placeholder: 'Briefly describe the issue' },
        { key: 'description', label: 'Details',  type: 'textarea', required: false, placeholder: 'More context...' },
        { key: 'priority',    label: 'Priority', type: 'select',   required: false,
          options: ['Low','Medium','High','Critical'].map(v => ({ value: v.toLowerCase(), label: v })) },
      ],
    },
  };

  const handleQuickCreate = async (values: Record<string, unknown>) => {
    if (!quickCreateType || !session) return;
    const cfg = QUICK_CREATE_CONFIG[quickCreateType];
    const qcLogical = ENTITY_LOGICAL_NAME[cfg.entity] ?? cfg.entity;
    if (isCreationBlocked(creationRules, qcLogical).blocked) {
      setQuickCreateType(null);
      return;
    }
    const record = await saveRecord(cfg.entity, null, values, session.user.id);
    const id = record[cfg.pk] as string;
    const label = (record[cfg.nameField] as string) ?? 'Record';
    await trackRecentItem(session.user.id, cfg.entity, cfg.module, id, label);
    setRecentRefreshKey((k) => k + 1);
    setActiveModule(cfg.module);
    setActiveEntity(cfg.entity);
    setSearch('');
    setView({ type: 'record', id });
    setQuickCreateType(null);
  };

  return (
    <PublishedMetadataProvider>
    <PermissionProvider userId={session.user.id}>
    <ToastProvider>
    <NotificationProvider userId={session.user.id}>
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Full-width app bar */}
      <AppHeader
        module={activeModule}
        entity={activeEntity}
        viewType={view.type}
        search={search}
        onSearchChange={setSearch}
        onGlobalSearch={() => setGlobalSearchOpen(true)}
        onNotificationNavigate={handleNotificationNavigate}
        userName={userName}
        userEmail={session.user.email}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AppSidebar
          activeModule={activeModule}
          activeEntity={activeEntity}
          onNavigate={handleNavigate}
          onNavigateToRecord={handleSidebarNavigateToRecord}
          onNavigateToDashboard={handleNavigateToDashboard}
          userEmail={session.user.email}
          userName={userName}
          onSignOut={handleSignOut}
          userId={session.user.id}
          recentRefreshKey={recentRefreshKey}
          isSystemAdmin={isSystemAdmin}
          viewType={view.type}
        />
        <div key={metadataEpoch} className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {view.type === 'dashboard' && (
            <SalesDashboard
              userId={session.user.id}
              onNavigateFiltered={(entity, module, filters, contextLabel) =>
                handleDashboardNavigateFiltered(entity, module, filters as ActiveFilter[], contextLabel)
              }
              onOpenRecord={handleDashboardOpenRecord}
            />
          )}

          {(view.type === 'list' || view.type === 'filtered-list') && (
            <EntityListPage
              module={activeModule}
              entity={activeEntity}
              search={search}
              onSearchChange={setSearch}
              onNewRecord={handleNewRecord}
              onOpenRecord={(id, label) => handleOpenRecord(id, label)}
              userId={session.user.id}
              initialFilters={view.type === 'filtered-list' ? view.filters : undefined}
              filterContextLabel={view.type === 'filtered-list' ? view.contextLabel : undefined}
              parentFilter={view.type === 'filtered-list' ? view.parentFilter : undefined}
              onClearParentFilter={() => setView({ type: 'list' })}
              initialViewId={view.type === 'list' ? activeViewId : undefined}
              onActiveViewChange={handleActiveViewChange}
              creationBlocked={creationCheck.blocked}
              creationBlockedMessage={creationCheck.message}
            />
          )}

          {(view.type === 'record' || view.type === 'new') && (
          <RecordFormPage
            module={activeModule}
            entity={activeEntity}
            recordId={view.type === 'record' ? view.id : null}
            initialTab={view.type === 'record' ? activeRecordTab : undefined}
            onTabChange={setActiveRecordTab}
            onBack={handleBack}
            onNavigate={(ent, id) => {
              setActiveEntity(ent);
              setView({ type: 'record', id });
            }}
            userId={session.user.id}
            onRecordLoaded={(id, label) => {
              trackRecentItem(session.user.id, activeEntity, activeModule, id, label).then(() => {
                setRecentRefreshKey((k) => k + 1);
              });
            }}
            onViewAll={handleViewAll}
            onNewRecord={handleNewRecord}
            creationBlocked={creationCheck.blocked}
            creationBlockedMessage={creationCheck.message}
            creationControlRules={creationRules}
          />
          )}
        </div>
      </div>
    </div>

    {globalSearchOpen && (
      <GlobalSearch
        userId={session.user.id}
        onNavigate={handleGlobalSearchNavigate}
        onClose={() => setGlobalSearchOpen(false)}
      />
    )}

    {quickCreateType && (
      <QuickCreateModal
        key={quickCreateType}
        title={QUICK_CREATE_CONFIG[quickCreateType].title}
        fields={QUICK_CREATE_CONFIG[quickCreateType].fields}
        onSave={handleQuickCreate}
        onClose={() => setQuickCreateType(null)}
      />
    )}
    </NotificationProvider>
    </ToastProvider>
    </PermissionProvider>
    </PublishedMetadataProvider>
  );
}
