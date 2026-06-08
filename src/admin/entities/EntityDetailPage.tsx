import { useEffect, useState, useCallback } from 'react';
import {
  ChevronRight, Database, Layers, GitFork, FileText, LayoutList,
  Zap, RefreshCw, Settings, Pencil, Trash2, Lock,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, ExternalLink, Table2,
} from 'lucide-react';
import type { EntityDefinition } from '../../types/entity';
import { softDeleteEntity, updateEntity } from '../../services/entityService';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { fetchFormsForEntity } from '../../services/formService';
import { fetchViewsForEntity } from '../../services/viewService';
import { fetchRulesForEntity } from '../../services/businessRuleService';
import { fetchRelationshipsForEntity } from '../../services/relationshipService';
import { fetchWorkflowsForEntity } from '../../services/workflowService';
import { checkEntityDependencies } from '../../services/dependencyService';
import type { DependencyResult } from '../../services/dependencyService';
import ConfirmDialog from '../components/ConfirmDialog';
import DependencyBlockModal from '../components/DependencyBlockModal';

interface EntityDetailPageProps {
  entity: EntityDefinition;
  onBack: () => void;
  onEditProperties: (entity: EntityDefinition) => void;
  onNavigateColumns: (entity: EntityDefinition) => void;
  onNavigateRelationships: (entity: EntityDefinition) => void;
  onNavigateForms: (entity: EntityDefinition) => void;
  onNavigateViews: (entity: EntityDefinition) => void;
  onNavigateRules: (entity: EntityDefinition) => void;
  onNavigateWorkflows: (entity: EntityDefinition) => void;
  onNavigateData?: (entity: EntityDefinition) => void;
  onNavigateNavigation?: () => void;
}

interface Counts {
  columns: number | null;
  relationships: number | null;
  forms: number | null;
  views: number | null;
  rules: number | null;
  workflows: number | null;
}

export default function EntityDetailPage({
  entity,
  onBack,
  onEditProperties,
  onNavigateColumns,
  onNavigateRelationships,
  onNavigateForms,
  onNavigateViews,
  onNavigateRules,
  onNavigateWorkflows,
  onNavigateData,
  onNavigateNavigation,
}: EntityDetailPageProps) {
  const [counts, setCounts] = useState<Counts>({
    columns: null, relationships: null, forms: null,
    views: null, rules: null, workflows: null,
  });
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [depChecking, setDepChecking] = useState(false);
  const [depResult, setDepResult] = useState<DependencyResult | null>(null);
  const [propsExpanded, setPropsExpanded] = useState(true);
  const [statusToggling, setStatusToggling] = useState(false);
  const [currentEntity, setCurrentEntity] = useState(entity);

  const id = entity.entity_definition_id;

  const loadCounts = useCallback(async () => {
    setLoading(true);
    try {
      const [fields, rels, forms, views, rules, workflows] = await Promise.all([
        fetchFieldsForEntity(id).catch(() => []),
        fetchRelationshipsForEntity(id).catch(() => []),
        fetchFormsForEntity(id).catch(() => []),
        fetchViewsForEntity(id).catch(() => []),
        fetchRulesForEntity(id).catch(() => []),
        fetchWorkflowsForEntity(id).catch(() => []),
      ]);
      setCounts({
        columns: fields.length,
        relationships: rels.length,
        forms: forms.length,
        views: views.length,
        rules: rules.length,
        workflows: workflows.length,
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const handleDeleteRequest = async () => {
    setDepChecking(true);
    try {
      const result = await checkEntityDependencies(
        id,
        currentEntity.logical_name,
        currentEntity.display_name,
      );
      setDepResult(result);
      if (result.canDelete) {
        setDeleteConfirm(true);
      }
    } catch {
      setDepResult(null);
      setDeleteConfirm(true);
    } finally {
      setDepChecking(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await softDeleteEntity(id);
      onBack();
    } catch {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async () => {
    setStatusToggling(true);
    try {
      const updated = await updateEntity(id, { is_active: !currentEntity.is_active });
      setCurrentEntity(updated);
    } finally {
      setStatusToggling(false);
    }
  };

  const modified = currentEntity.modified_at
    ? new Date(currentEntity.modified_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : 'Unknown';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafbfc]">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-slate-200 px-5 py-2 flex items-center gap-1.5 shrink-0 text-[12px]">
        <button
          onClick={onBack}
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
        >
          Tables
        </button>
        <ChevronRight size={11} className="text-slate-300" />
        <span className="text-slate-800 font-semibold">{currentEntity.display_name}</span>
      </div>

      {/* Command Bar */}
      <div className="bg-white border-b border-slate-100 px-5 py-2 flex items-center gap-1.5 shrink-0">
        <CmdBtn icon={<Pencil size={12} />} onClick={() => onEditProperties(currentEntity)}>
          Edit properties
        </CmdBtn>
        <CmdSep />
        <CmdBtn icon={<RefreshCw size={12} className={loading ? 'animate-spin' : ''} />} onClick={loadCounts}>
          Refresh
        </CmdBtn>
        {onNavigateData && (
          <>
            <CmdSep />
            <CmdBtn icon={<Table2 size={12} />} onClick={() => onNavigateData(currentEntity)}>
              Edit data
            </CmdBtn>
          </>
        )}
        <CmdSep />
        <CmdBtn
          icon={currentEntity.is_active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
          onClick={handleToggleStatus}
          disabled={statusToggling}
        >
          {currentEntity.is_active ? 'Deactivate' : 'Activate'}
        </CmdBtn>
        {currentEntity.is_custom && (
          <>
            <CmdSep />
            <CmdBtn icon={depChecking ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />} danger onClick={handleDeleteRequest} disabled={depChecking}>
              Delete
            </CmdBtn>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
        {/* Properties Card */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setPropsExpanded(!propsExpanded)}
            className="w-full flex items-center gap-2.5 px-4 py-3 bg-slate-50/80 border-b border-slate-100 text-left hover:bg-slate-50 transition-colors"
          >
            {propsExpanded ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              currentEntity.is_custom ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-slate-100 ring-1 ring-slate-200'
            }`}>
              <Database size={15} className={currentEntity.is_custom ? 'text-amber-500' : 'text-slate-400'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-slate-800">{currentEntity.display_name}</p>
              <p className="text-[11px] text-slate-400 font-mono">{currentEntity.logical_name}</p>
            </div>
            <StatusPill active={currentEntity.is_active} />
            {!currentEntity.is_custom && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200">
                <Lock size={8} /> Managed
              </span>
            )}
          </button>

          {propsExpanded && (
            <div className="px-4 py-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                <PropRow label="Display name" value={currentEntity.display_name} />
                <PropRow label="Plural name" value={currentEntity.display_name_plural} />
                <PropRow label="Schema name" value={currentEntity.logical_name} mono />
                <PropRow label="Physical table" value={currentEntity.physical_table_name} mono />
                <PropRow label="Primary column" value={currentEntity.primary_field_name} mono />
                <PropRow label="Ownership" value={currentEntity.ownership_type} capitalize />
                <PropRow label="Type" value={currentEntity.is_custom ? 'Custom' : 'Standard'} />
                <PropRow label="Last modified" value={modified} />
                <PropRow
                  label="Description"
                  value={currentEntity.description || 'No description'}
                  muted={!currentEntity.description}
                />
              </div>

              <div className="mt-4 flex items-center gap-4 text-[11px]">
                <CapBadge label="Activities" on={currentEntity.enable_activities} />
                <CapBadge label="Notes" on={currentEntity.enable_notes} />
                <CapBadge label="Audit" on={currentEntity.enable_audit} />
              </div>
            </div>
          )}
        </div>

        {/* Sub-area Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Schema */}
          <SubAreaCard title="Schema" desc="Define the data model for this table">
            <SubAreaLink
              icon={<Layers size={14} />}
              label="Columns"
              count={counts.columns}
              loading={loading}
              onClick={() => onNavigateColumns(currentEntity)}
            />
            <SubAreaLink
              icon={<GitFork size={14} />}
              label="Relationships"
              count={counts.relationships}
              loading={loading}
              onClick={() => onNavigateRelationships(currentEntity)}
            />
          </SubAreaCard>

          {/* Data Experiences */}
          <SubAreaCard title="Data experiences" desc="How users interact with data">
            <SubAreaLink
              icon={<FileText size={14} />}
              label="Forms"
              count={counts.forms}
              loading={loading}
              onClick={() => onNavigateForms(currentEntity)}
            />
            <SubAreaLink
              icon={<LayoutList size={14} />}
              label="Views"
              count={counts.views}
              loading={loading}
              onClick={() => onNavigateViews(currentEntity)}
            />
          </SubAreaCard>

          {/* Customizations */}
          <SubAreaCard title="Customizations" desc="Logic and automation">
            <SubAreaLink
              icon={<Zap size={14} />}
              label="Business rules"
              count={counts.rules}
              loading={loading}
              onClick={() => onNavigateRules(currentEntity)}
            />
            <SubAreaLink
              icon={<Settings size={14} />}
              label="Workflows"
              count={counts.workflows}
              loading={loading}
              onClick={() => onNavigateWorkflows(currentEntity)}
            />
          </SubAreaCard>
        </div>

      </div>

      {depResult && !depResult.canDelete && (
        <DependencyBlockModal
          title="Cannot Delete Table"
          itemName={currentEntity.display_name}
          dependencies={depResult.dependencies}
          onClose={() => setDepResult(null)}
          onOpenNavigation={onNavigateNavigation ? () => { setDepResult(null); onNavigateNavigation(); } : undefined}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Custom Table"
          message={`Permanently delete "${currentEntity.display_name}"? All associated columns, forms, and views will be removed.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete'}
          onConfirm={handleDelete}
          onCancel={() => { setDeleteConfirm(false); setDepResult(null); }}
          danger
        />
      )}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function PropRow({ label, value, mono, capitalize, muted }: {
  label: string; value: string; mono?: boolean; capitalize?: boolean; muted?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-[12px] leading-snug ${
        muted ? 'text-slate-400 italic' : 'text-slate-700'
      } ${mono ? 'font-mono text-[11px]' : ''} ${capitalize ? 'capitalize' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function CapBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
      on ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-400 ring-1 ring-slate-200'
    }`}>
      <span className={`w-1 h-1 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      {label}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
      active
        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
        : 'bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function SubAreaCard({ title, desc, children }: {
  title: string; desc: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-[12px] font-semibold text-slate-700">{title}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </div>
  );
}

function SubAreaLink({ icon, label, count, loading, onClick }: {
  icon: React.ReactNode; label: string; count: number | null; loading: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors group"
    >
      <div className="w-8 h-8 rounded-md bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center shrink-0 text-blue-500 group-hover:bg-blue-100 transition-colors">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-slate-700 group-hover:text-blue-600 transition-colors">{label}</p>
        <p className="text-[10px] text-slate-400">
          {loading ? 'Loading...' : count !== null ? `${count} item${count !== 1 ? 's' : ''}` : ''}
        </p>
      </div>
      <ExternalLink size={12} className="text-slate-300 group-hover:text-blue-400 transition-colors shrink-0" />
    </button>
  );
}

function CmdBtn({ children, onClick, icon, danger, disabled }: {
  children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; danger?: boolean; disabled?: boolean;
}) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded transition-all disabled:opacity-50';
  const style = danger
    ? `${base} text-red-600 hover:bg-red-50`
    : `${base} text-slate-600 hover:bg-slate-100`;
  return <button className={style} onClick={onClick} disabled={disabled}>{icon}{children}</button>;
}

function CmdSep() {
  return <div className="w-px h-5 bg-slate-200 mx-1" />;
}
