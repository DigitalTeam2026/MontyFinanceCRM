import { useState, useEffect, lazy, Suspense } from 'react';
import type { Session } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { ToastProvider } from '../app/context/ToastContext';
import LoginPage from '../LoginPage';
import StudioSidebar from './components/StudioSidebar';
import { useCurrentUserName } from '../app/hooks/useCurrentUserName';
import StudioHeader from './components/StudioHeader';
import PublishAllButton from './publish/PublishAllButton';
// Every admin page is lazy-loaded so each becomes its own chunk fetched only when
// its module is opened. Without this, all ~32 pages bundle into one ~1.4MB
// AdminStudio chunk even though only one module is ever shown at a time.
const EntityListPage = lazy(() => import('./entities/EntityListPage'));
const EntityDesignerPage = lazy(() => import('./entities/EntityDesignerPage'));
const EntityDetailPage = lazy(() => import('./entities/EntityDetailPage'));
const FullDataGridPage = lazy(() => import('./entities/FullDataGridPage'));
const EntityRecycleBinPage = lazy(() => import('./entities/EntityRecycleBinPage'));
const FieldManagementPage = lazy(() => import('./fields/FieldManagementPage'));
const FormManagementPage = lazy(() => import('./forms/FormManagementPage'));
const ViewManagementPage = lazy(() => import('./views/ViewManagementPage'));
const BusinessRulesPage = lazy(() => import('./rules/BusinessRulesPage'));
const PowerAutomationPage = lazy(() => import('./automationrules/PowerAutomationPage'));
const EmailAccountsPage = lazy(() => import('./automationrules/EmailAccountsPage'));
const SecurityManagementPage = lazy(() => import('./security/SecurityManagementPage'));
const NavigationPage = lazy(() => import('./navigation/NavigationPage'));
const CurrenciesPage = lazy(() => import('./currencies/CurrenciesPage'));
const ProcessFlowsPage = lazy(() => import('./processflows/ProcessFlowsPage'));
const PipelineStagesPage = lazy(() => import('./stages/PipelineStagesPage'));
const DuplicateDetectionPage = lazy(() => import('./duplicates/DuplicateDetectionPage'));
const ApprovalProcessesPage = lazy(() => import('./approvals/ApprovalProcessesPage'));
const DataPoliciesPage = lazy(() => import('./policies/DataPoliciesPage'));
const MergeCenterPage = lazy(() => import('./merges/MergeCenterPage'));
const ColumnSecurityPage = lazy(() => import('./columnsecurity/ColumnSecurityPage'));
const DigitalRulesPage = lazy(() => import('./digitalrules/DigitalRulesPage'));
const RelationshipListPage = lazy(() => import('./relationships/RelationshipListPage'));
const RelationshipEditorPage = lazy(() => import('./relationships/RelationshipEditorPage'));
const ImportRelationsPage = lazy(() => import('./relationimport/ImportRelationsPage'));
const DatabaseValidationPage = lazy(() => import('./validation/DatabaseValidationPage'));
const SystemHealthPage = lazy(() => import('./system/SystemHealthPage'));
const ApiIntegrationsPage = lazy(() => import('./integrations/ApiIntegrationsPage'));
const CompanyProfilePage = lazy(() => import('./companyprofile/CompanyProfilePage'));
const DocumentLocationPage = lazy(() => import('./documents/DocumentLocationPage'));
const PublicationHistoryPage = lazy(() => import('./publish/PublicationHistoryPage'));
const DashboardsPage = lazy(() => import('./dashboards/DashboardsPage'));
const ClearDataPage = lazy(() => import('./cleardata/ClearDataPage'));
import type { EntityDefinition } from '../types/entity';
import type { RelationshipDefinitionWithEntities } from '../types/relationship';
import { fetchEntities } from '../services/entityService';
import { parseRoute, buildStudioHash, replaceHash } from '../lib/appRoute';
import type { StudioDashboardView } from '../lib/appRoute';

type EntityView = 'list' | 'new' | 'edit' | 'detail' | 'data' | 'recycle';

/** Read the Admin Studio module from the URL hash (defaults to 'entities'). */
function initialStudioModule(): string {
  const r = parseRoute();
  return r.surface === 'studio' ? r.module : 'entities';
}

interface EntityState {
  view: EntityView;
  editing?: EntityDefinition;
  selectedEntity?: EntityDefinition;
}

type RelationshipView = 'list' | 'new' | 'edit';

interface RelationshipState {
  view: RelationshipView;
  editing?: RelationshipDefinitionWithEntities;
}

export interface DashboardState {
  view: StudioDashboardView;
  dashboardId?: string;
}

export default function AdminStudio() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const userName = useCurrentUserName(session?.user?.id);
  const [activeModule, setActiveModule] = useState(initialStudioModule);
  const [entityState, setEntityState] = useState<EntityState>(() => {
    const r = parseRoute();
    // selectedEntity is filled in asynchronously by the restore effect below.
    if (r.surface === 'studio' && r.module === 'entities' && r.entityId) {
      return { view: r.entityView ?? 'detail' };
    }
    return { view: 'list' };
  });
  const [relationshipState, setRelationshipState] = useState<RelationshipState>({ view: 'list' });
  const [dashboardState, setDashboardState] = useState<DashboardState>(() => {
    const r = parseRoute();
    if (r.surface === 'studio' && r.module === 'dashboards') {
      return { view: r.dashboardView ?? 'list', dashboardId: r.dashboardId };
    }
    return { view: 'list' };
  });

  useEffect(() => {
    // getSession() returns the stored session and auto-refreshes it when expired
    // (autoRefreshToken is on). Do NOT call refreshSession() here too — a second
    // concurrent refresh reuses an already-rotated token and gets a 400.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ module: string }>).detail;
      if (detail?.module) {
        setActiveModule(detail.module);
        setEntityState({ view: 'list' });
        setRelationshipState({ view: 'list' });
      }
    };
    window.addEventListener('navigate-admin', handler);
    return () => window.removeEventListener('navigate-admin', handler);
  }, []);

  // Restore the selected-entity sub-context from the URL after a refresh by
  // refetching the entity definition by id (it can't be serialized in the hash).
  useEffect(() => {
    const r = parseRoute();
    if (r.surface !== 'studio' || !r.entityId) return;
    let cancelled = false;
    fetchEntities()
      .then((ents) => {
        if (cancelled) return;
        const found = ents.find((e) => e.entity_definition_id === r.entityId);
        if (!found) return;
        setEntityState((prev) => ({
          ...prev,
          selectedEntity: found,
          editing: r.module === 'entities' && r.entityView === 'edit' ? found : prev.editing,
          view: r.module === 'entities' ? (r.entityView ?? 'detail') : prev.view,
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Keep the URL hash in sync with the active Admin Studio page and the selected
  // entity sub-context so a browser refresh reopens the exact same location.
  useEffect(() => {
    replaceHash(
      buildStudioHash({
        module: activeModule,
        entityId: entityState.selectedEntity?.entity_definition_id,
        entityView: activeModule === 'entities' ? entityState.view : undefined,
        dashboardId: activeModule === 'dashboards' ? dashboardState.dashboardId : undefined,
        dashboardView: activeModule === 'dashboards' ? dashboardState.view : undefined,
      })
    );
  }, [activeModule, entityState.view, entityState.selectedEntity, dashboardState.view, dashboardState.dashboardId]);

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#0f1623] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage onLogin={() => {}} />;
  }

  const handleNavigate = (id: string) => {
    setActiveModule(id);
    setEntityState({ view: 'list' });
    setRelationshipState({ view: 'list' });
    setDashboardState({ view: 'list' });
  };

  const navigateEntitySubArea = (module: string, ent: EntityDefinition) => {
    setEntityState((prev) => ({ ...prev, selectedEntity: ent }));
    setActiveModule(module);
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      await supabase.auth.signOut({ scope: 'local' });
    }
    setSession(null);
  };

  const backToEntityDetail = () => {
    if (entityState.selectedEntity) {
      setActiveModule('entities');
      setEntityState({ view: 'detail', selectedEntity: entityState.selectedEntity });
    } else {
      setActiveModule('entities');
      setEntityState({ view: 'list' });
    }
  };

  const entityCtxLabel = entityState.selectedEntity?.display_name;

  const getHeader = () => {
    if (activeModule === 'entities') {
      if (entityState.view === 'new') {
        return {
          title: 'New Table',
          subtitle: 'Define a new CRM table',
          onBack: () => setEntityState({ view: 'list' }),
        };
      }
      if (entityState.view === 'edit' && entityState.editing) {
        return {
          title: `Edit: ${entityState.editing.display_name}`,
          subtitle: entityState.editing.logical_name,
          onBack: () => {
            if (entityState.selectedEntity) {
              setEntityState({ view: 'detail', selectedEntity: entityState.selectedEntity, editing: undefined });
            } else {
              setEntityState({ view: 'list' });
            }
          },
        };
      }
      if (entityState.view === 'data' && entityState.selectedEntity) {
        return {
          title: `${entityState.selectedEntity.display_name} - Data`,
          subtitle: `Full data grid for ${entityState.selectedEntity.display_name}`,
          onBack: () => setEntityState({ view: 'detail', selectedEntity: entityState.selectedEntity }),
        };
      }
      if (entityState.view === 'detail' && entityState.selectedEntity) {
        return {
          title: entityState.selectedEntity.display_name,
          subtitle: entityState.selectedEntity.logical_name,
          onBack: () => setEntityState({ view: 'list' }),
        };
      }
      return { title: 'Tables', subtitle: 'Define and manage CRM tables' };
    }
    if (activeModule === 'fields') {
      return {
        title: entityCtxLabel ? `Columns - ${entityCtxLabel}` : 'Column Management',
        subtitle: entityCtxLabel ? `Manage columns for ${entityCtxLabel}` : 'Define and manage entity columns',
        onBack: entityState.selectedEntity ? backToEntityDetail : undefined,
      };
    }
    if (activeModule === 'relationships') {
      if (relationshipState.view === 'new') {
        return {
          title: 'New Relationship',
          subtitle: 'Register a relationship between two entities',
          onBack: () => setRelationshipState({ view: 'list' }),
        };
      }
      if (relationshipState.view === 'edit' && relationshipState.editing) {
        return {
          title: `Relationship: ${relationshipState.editing.display_name}`,
          subtitle: relationshipState.editing.name,
          onBack: () => setRelationshipState({ view: 'list' }),
        };
      }
      return {
        title: entityCtxLabel ? `Relationships - ${entityCtxLabel}` : 'Relationships',
        subtitle: entityCtxLabel ? `Relationships for ${entityCtxLabel}` : 'Entity relationships that drive process flows, transformations, and subgrids',
        onBack: entityState.selectedEntity ? backToEntityDetail : undefined,
      };
    }
    if (activeModule === 'forms') {
      return {
        title: entityCtxLabel ? `Forms - ${entityCtxLabel}` : 'Form Designer',
        subtitle: entityCtxLabel ? `Design forms for ${entityCtxLabel}` : 'Design forms for CRM entities',
        onBack: entityState.selectedEntity ? backToEntityDetail : undefined,
      };
    }
    if (activeModule === 'views') {
      return {
        title: entityCtxLabel ? `Views - ${entityCtxLabel}` : 'View Designer',
        subtitle: entityCtxLabel ? `Design grid views for ${entityCtxLabel}` : 'Design grid views for CRM entities',
        onBack: entityState.selectedEntity ? backToEntityDetail : undefined,
      };
    }
    if (activeModule === 'rules') {
      return {
        title: entityCtxLabel ? `Business Rules - ${entityCtxLabel}` : 'Business Rules',
        subtitle: entityCtxLabel ? `Conditional logic for ${entityCtxLabel}` : 'Automate UI behaviour with conditional logic',
        onBack: entityState.selectedEntity ? backToEntityDetail : undefined,
      };
    }
    if (activeModule === 'automationrules') {
      return {
        title: 'Power Automation',
        subtitle: 'Automation rules — when a record changes, run actions',
      };
    }
    if (activeModule === 'emailaccounts') {
      return {
        title: 'Email Accounts',
        subtitle: 'Sender mailboxes your flows can send from (Microsoft 365)',
      };
    }
    if (activeModule === 'security') {
      return { title: 'Security Management', subtitle: 'Users, teams, business units, and role privileges' };
    }
    if (activeModule === 'navigation') {
      return { title: 'Navigation Designer', subtitle: 'Design the app sitemap — areas, groups, and entity links' };
    }
    if (activeModule === 'currencies') {
      return { title: 'Currency Management', subtitle: 'Configure active currencies, exchange rates, and base currency' };
    }
    if (activeModule === 'processflows') {
      return { title: 'Process Flows', subtitle: 'Define lifecycle pipelines and stage progressions for entities' };
    }
    if (activeModule === 'stages') {
      return { title: 'Pipeline Stages', subtitle: 'Browse and configure all stages across process flows' };
    }
    if (activeModule === 'duplicates') {
      return { title: 'Duplicate Detection', subtitle: 'Configure rules to detect and prevent duplicate records' };
    }
    if (activeModule === 'approvals') {
      return { title: 'Approval Processes', subtitle: 'Configure approval workflows triggered by entity, product, amount, stage, or business unit' };
    }
    if (activeModule === 'policies') {
      return { title: 'Data Policies', subtitle: 'Reusable governance rules for uniqueness, format, mandatory fields, relational integrity, and value locking' };
    }
    if (activeModule === 'digitalrules') {
      return { title: 'Digital Rules', subtitle: 'Lifecycle rules for qualification, close, reopen, status transitions, delete cascades, and related-record handling' };
    }
    if (activeModule === 'merges') {
      return { title: 'Merge Center', subtitle: 'Review suspected duplicates, compare records side-by-side, choose a master, and execute merges with full audit trail' };
    }
    if (activeModule === 'columnsecurity') {
      return { title: 'Column Security', subtitle: 'Create named profiles to control read and update access on secured fields, and assign them to users or teams' };
    }
    if (activeModule === 'dbvalidation') {
      return { title: 'Database Validation', subtitle: 'Scan all entity field definitions and verify physical database columns exist and are correctly mapped' };
    }
    if (activeModule === 'relationimport') {
      return { title: 'Import Relations', subtitle: 'Bulk-import N:N relation (junction) records from Excel — links existing records by name or legacy ID' };
    }
    if (activeModule === 'systemhealth') {
      return { title: 'System Health', subtitle: 'Detect and repair drift between CRM metadata and the physical database — missing tables, columns, forms, views, privileges, and stale API schema cache' };
    }
    if (activeModule === 'integrations') {
      return { title: 'API Integrations', subtitle: 'Configure HTTP integrations triggered by CRM entity events — webhooks, automation tools, and external APIs' };
    }
    if (activeModule === 'companyprofile') {
      return { title: 'Company Profile', subtitle: 'Manage company details — logo, industry, country, contact info, status — and the branding shown on the login screen' };
    }
    if (activeModule === 'documentlocation') {
      return { title: 'Document Location', subtitle: 'Configure the root storage folder per entity — files are saved to <root>/<record id>/<file> by the local file server' };
    }
    if (activeModule === 'publishhistory') {
      return { title: 'Publication History', subtitle: 'Every customization publication — version, who published, components, outcome, and rollback' };
    }
    if (activeModule === 'dashboards') {
      return { title: 'Dashboards', subtitle: 'Design interactive analytical dashboards from CRM entities, fields, and views' };
    }
    if (activeModule === 'cleardata') {
      return { title: 'Clear Data', subtitle: 'Permanently delete row data and definitions per category — tables, views, forms, rules, process flows, security roles, field security, and categories' };
    }
    return { title: 'Admin Studio' };
  };

  const header = getHeader();
  // The dashboard designer is immersive — it renders its own toolbar full-bleed.
  const immersive = activeModule === 'dashboards' && dashboardState.view === 'designer';

  const renderContent = () => {
    if (activeModule === 'entities') {
      if (entityState.view === 'new') {
        return (
          <EntityDesignerPage
            onSaved={() => setEntityState({ view: 'list' })}
            onCancel={() => setEntityState({ view: 'list' })}
          />
        );
      }
      if (entityState.view === 'edit' && entityState.editing) {
        return (
          <EntityDesignerPage
            entity={entityState.editing}
            onSaved={(updated) => {
              if (entityState.selectedEntity) {
                setEntityState({ view: 'detail', selectedEntity: updated, editing: undefined });
              } else {
                setEntityState({ view: 'list' });
              }
            }}
            onCancel={() => {
              if (entityState.selectedEntity) {
                setEntityState({ view: 'detail', selectedEntity: entityState.selectedEntity, editing: undefined });
              } else {
                setEntityState({ view: 'list' });
              }
            }}
          />
        );
      }
      if (entityState.view === 'data' && entityState.selectedEntity) {
        return (
          <FullDataGridPage
            entity={entityState.selectedEntity}
            onBack={() => setEntityState({ view: 'detail', selectedEntity: entityState.selectedEntity })}
          />
        );
      }
      if (entityState.view === 'recycle' && entityState.selectedEntity) {
        return (
          <EntityRecycleBinPage
            entity={entityState.selectedEntity}
            onBack={() => setEntityState({ view: 'detail', selectedEntity: entityState.selectedEntity })}
          />
        );
      }
      if (entityState.view === 'detail' && entityState.selectedEntity) {
        return (
          <EntityDetailPage
            entity={entityState.selectedEntity}
            onBack={() => setEntityState({ view: 'list' })}
            onEditProperties={(e) => setEntityState({ view: 'edit', editing: e, selectedEntity: e })}
            onNavigateColumns={(e) => navigateEntitySubArea('fields', e)}
            onNavigateRelationships={(e) => navigateEntitySubArea('relationships', e)}
            onNavigateForms={(e) => navigateEntitySubArea('forms', e)}
            onNavigateViews={(e) => navigateEntitySubArea('views', e)}
            onNavigateRules={(e) => navigateEntitySubArea('rules', e)}
            onNavigateData={(e) => setEntityState({ view: 'data', selectedEntity: e })}
            onNavigateRecycleBin={(e) => setEntityState({ view: 'recycle', selectedEntity: e })}
            onNavigateNavigation={() => { setActiveModule('navigation'); setEntityState({ view: 'list' }); }}
          />
        );
      }
      return (
        <EntityListPage
          onNew={() => setEntityState({ view: 'new' })}
          onEdit={(e) => setEntityState({ view: 'detail', selectedEntity: e })}
        />
      );
    }

    if (activeModule === 'fields') {
      return <FieldManagementPage preselectedEntityId={entityState.selectedEntity?.entity_definition_id} />;
    }

    if (activeModule === 'relationships') {
      if (relationshipState.view === 'new') {
        return (
          <RelationshipEditorPage
            onSaved={() => setRelationshipState({ view: 'list' })}
            onCancel={() => setRelationshipState({ view: 'list' })}
          />
        );
      }
      if (relationshipState.view === 'edit' && relationshipState.editing) {
        return (
          <RelationshipEditorPage
            relationship={relationshipState.editing}
            onSaved={() => setRelationshipState({ view: 'list' })}
            onCancel={() => setRelationshipState({ view: 'list' })}
          />
        );
      }
      return (
        <RelationshipListPage
          preselectedEntityId={entityState.selectedEntity?.entity_definition_id}
          onNew={() => setRelationshipState({ view: 'new' })}
          onEdit={(r) => setRelationshipState({ view: 'edit', editing: r })}
        />
      );
    }

    if (activeModule === 'forms') {
      return <FormManagementPage preselectedEntityId={entityState.selectedEntity?.entity_definition_id} />;
    }
    if (activeModule === 'views') {
      return <ViewManagementPage preselectedEntityId={entityState.selectedEntity?.entity_definition_id} />;
    }
    if (activeModule === 'rules') {
      return <BusinessRulesPage preselectedEntityId={entityState.selectedEntity?.entity_definition_id} />;
    }
    if (activeModule === 'automationrules') return <PowerAutomationPage />;
    if (activeModule === 'emailaccounts') return <EmailAccountsPage />;
    if (activeModule === 'security') return <SecurityManagementPage />;
    if (activeModule === 'navigation') return <NavigationPage />;
    if (activeModule === 'currencies') return <CurrenciesPage />;
    if (activeModule === 'processflows') return <ProcessFlowsPage />;
    if (activeModule === 'stages') return <PipelineStagesPage />;
    if (activeModule === 'duplicates') return <DuplicateDetectionPage />;
    if (activeModule === 'approvals') return <ApprovalProcessesPage />;
    if (activeModule === 'policies') return <DataPoliciesPage />;
    if (activeModule === 'digitalrules') return <DigitalRulesPage />;
    if (activeModule === 'merges') return <MergeCenterPage />;
    if (activeModule === 'columnsecurity') return <ColumnSecurityPage />;
    if (activeModule === 'dbvalidation') return <DatabaseValidationPage />;
    if (activeModule === 'relationimport') return <ImportRelationsPage />;
    if (activeModule === 'systemhealth') return <SystemHealthPage />;
    if (activeModule === 'integrations') return <ApiIntegrationsPage />;
    if (activeModule === 'companyprofile') return <CompanyProfilePage />;
    if (activeModule === 'documentlocation') return <DocumentLocationPage />;
    if (activeModule === 'publishhistory') return <PublicationHistoryPage />;
    if (activeModule === 'dashboards') {
      return <DashboardsPage state={dashboardState} onStateChange={setDashboardState} />;
    }
    if (activeModule === 'cleardata') return <ClearDataPage />;

    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Coming soon
      </div>
    );
  };

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--app-bg)' }}>
        <StudioSidebar
          activeModule={activeModule}
          onNavigate={handleNavigate}
          userEmail={session.user.email}
          userName={userName}
          onSignOut={handleSignOut}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {!immersive && (
            <StudioHeader
              title={header.title}
              subtitle={header.subtitle}
              onBack={header.onBack}
              actions={<PublishAllButton />}
            />
          )}
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            {renderContent()}
          </Suspense>
        </div>
      </div>
    </ToastProvider>
  );
}
