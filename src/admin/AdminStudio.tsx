import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ToastProvider } from '../app/context/ToastContext';
import LoginPage from '../LoginPage';
import StudioSidebar from './components/StudioSidebar';
import StudioHeader from './components/StudioHeader';
import EntityListPage from './entities/EntityListPage';
import EntityDesignerPage from './entities/EntityDesignerPage';
import EntityDetailPage from './entities/EntityDetailPage';
import FullDataGridPage from './entities/FullDataGridPage';
import FieldManagementPage from './fields/FieldManagementPage';
import FormManagementPage from './forms/FormManagementPage';
import ViewManagementPage from './views/ViewManagementPage';
import BusinessRulesPage from './rules/BusinessRulesPage';
import WorkflowsPage from './workflows/WorkflowsPage';
import SecurityManagementPage from './security/SecurityManagementPage';
import NavigationPage from './navigation/NavigationPage';
import DashboardsPage from './dashboard/DashboardsPage';
import CurrenciesPage from './currencies/CurrenciesPage';
import ProcessFlowsPage from './processflows/ProcessFlowsPage';
import PipelineStagesPage from './stages/PipelineStagesPage';
import DuplicateDetectionPage from './duplicates/DuplicateDetectionPage';
import ApprovalProcessesPage from './approvals/ApprovalProcessesPage';
import DataPoliciesPage from './policies/DataPoliciesPage';
import MergeCenterPage from './merges/MergeCenterPage';
import ColumnSecurityPage from './columnsecurity/ColumnSecurityPage';
import DigitalRulesPage from './digitalrules/DigitalRulesPage';
import RelationshipListPage from './relationships/RelationshipListPage';
import RelationshipEditorPage from './relationships/RelationshipEditorPage';
import DatabaseValidationPage from './validation/DatabaseValidationPage';
import ApiIntegrationsPage from './integrations/ApiIntegrationsPage';
import type { EntityDefinition } from '../types/entity';
import type { RelationshipDefinitionWithEntities } from '../types/relationship';

type EntityView = 'list' | 'new' | 'edit' | 'detail' | 'data';

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

export default function AdminStudio() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [activeModule, setActiveModule] = useState('entities');
  const [entityState, setEntityState] = useState<EntityState>({ view: 'list' });
  const [relationshipState, setRelationshipState] = useState<RelationshipState>({ view: 'list' });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        // If refresh fails, treat as signed out — don't fall back to the expired session
        setSession(refreshed.session ?? null);
      } else {
        setSession(null);
      }
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
    if (activeModule === 'workflows') {
      return {
        title: entityCtxLabel ? `Workflows - ${entityCtxLabel}` : 'Workflows',
        subtitle: entityCtxLabel ? `Automations for ${entityCtxLabel}` : 'Automate processes triggered by record events',
        onBack: entityState.selectedEntity ? backToEntityDetail : undefined,
      };
    }
    if (activeModule === 'security') {
      return { title: 'Security Management', subtitle: 'Users, teams, business units, and role privileges' };
    }
    if (activeModule === 'navigation') {
      return { title: 'Navigation Designer', subtitle: 'Design the app sitemap — areas, groups, and entity links' };
    }
    if (activeModule === 'dashboard') {
      return { title: 'Dashboard Management', subtitle: 'Design and manage system and custom dashboards' };
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
    if (activeModule === 'integrations') {
      return { title: 'API Integrations', subtitle: 'Configure HTTP integrations triggered by CRM entity events — webhooks, automation tools, and external APIs' };
    }
    return { title: 'Admin Studio' };
  };

  const header = getHeader();

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
            onNavigateWorkflows={(e) => navigateEntitySubArea('workflows', e)}
            onNavigateData={(e) => setEntityState({ view: 'data', selectedEntity: e })}
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
    if (activeModule === 'workflows') return <WorkflowsPage />;
    if (activeModule === 'security') return <SecurityManagementPage />;
    if (activeModule === 'navigation') return <NavigationPage />;
    if (activeModule === 'dashboard') return <DashboardsPage />;
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
    if (activeModule === 'integrations') return <ApiIntegrationsPage />;

    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Coming soon
      </div>
    );
  };

  return (
    <ToastProvider>
      <div className="flex h-screen bg-[#f3f4f6] overflow-hidden">
        <StudioSidebar
          activeModule={activeModule}
          onNavigate={handleNavigate}
          userEmail={session.user.email}
          onSignOut={handleSignOut}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <StudioHeader
            title={header.title}
            subtitle={header.subtitle}
            onBack={header.onBack}
          />
          {renderContent()}
        </div>
      </div>
    </ToastProvider>
  );
}
