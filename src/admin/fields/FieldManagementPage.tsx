import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState } from 'react';
import {
  Plus, Search, RefreshCw, Layers, Shield, Wrench, Filter, X, Download } from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { FieldDefinition, FieldFormData, FieldType, ChoiceOption } from '../../types/field';
import type { EntityDefinition } from '../../types/entity';
import { fetchFieldsForEntity, fetchFieldTypes, createField, updateField, softDeleteField } from '../../services/fieldService';
import { fetchEntities } from '../../services/entityService';
import { setFieldSecured } from '../../services/columnSecurityService';
import { createLookupRelationshipPair } from '../../services/relationshipService';
import { checkColumnDependencies } from '../../services/dependencyService';
import type { DependencyResult } from '../../services/dependencyService';
import FieldGrid from './FieldGrid';
import FieldEditorPanel from './FieldEditorPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import DependencyBlockModal from '../components/DependencyBlockModal';

type CategoryTab = 'all' | 'system' | 'custom';

interface FieldManagementPageProps {
  preselectedEntityId?: string;
}

export default function FieldManagementPage({ preselectedEntityId }: FieldManagementPageProps) {
  const { showSuccess, showError } = useToast();
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>(preselectedEntityId ?? '');
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [fieldTypes, setFieldTypes] = useState<FieldType[]>([]);
  const [loading, setLoading] = useState(true);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<FieldDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [depResult, setDepResult] = useState<DependencyResult | null>(null);
  const [depChecking, setDepChecking] = useState(false);
  const [togglingSecured, setTogglingSecured] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [ents, types] = await Promise.all([fetchEntities(), fetchFieldTypes()]);
        setEntities(ents);
        setFieldTypes(types);
        if (!preselectedEntityId && ents.length > 0) setSelectedEntityId(ents[0].entity_definition_id);
      } catch (e: unknown) { showError(e instanceof Error ? e.message : 'Failed to load'); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedEntityId) return;
    (async () => {
      setFieldsLoading(true);
      try { setFields(await fetchFieldsForEntity(selectedEntityId)); }
      catch (e: unknown) { showError(e instanceof Error ? e.message : 'Failed to load fields'); }
      finally { setFieldsLoading(false); }
    })();
  }, [selectedEntityId]);

  const systemCount = fields.filter((f) => f.is_system).length;
  const customCount = fields.filter((f) => f.is_custom).length;

  const filtered = fields.filter((f) => {
    const matchesSearch =
      f.display_name.toLowerCase().includes(search.toLowerCase()) ||
      f.logical_name.toLowerCase().includes(search.toLowerCase()) ||
      (f.field_type?.display_name ?? '').toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      categoryTab === 'all' ||
      (categoryTab === 'system' && f.is_system) ||
      (categoryTab === 'custom' && f.is_custom);

    return matchesSearch && matchesCategory;
  });

  const handleSave = async (form: FieldFormData, choices: ChoiceOption[]) => {
    if (editingField) {
      const updated = await updateField(editingField.field_definition_id, form, choices);
      setFields((prev) => prev.map((f) => f.field_definition_id === updated.field_definition_id ? updated : f));
    } else {
      const created = await createField(form, choices, fieldTypes);
      setFields((prev) => [...prev, created]);

      const isLookup = fieldTypes.find((t) => t.field_type_id === form.field_type_id)?.name === 'lookup';
      if (isLookup && form.lookup_entity_id) {
        const sourceEntity = entities.find((e) => e.entity_definition_id === selectedEntityId);
        const targetEntity = entities.find((e) => e.entity_definition_id === form.lookup_entity_id);
        if (sourceEntity && targetEntity) {
          try {
            await createLookupRelationshipPair({
              sourceEntityId: selectedEntityId,
              targetEntityId: form.lookup_entity_id,
              lookupFieldId: created.field_definition_id,
              sourceLogicalName: sourceEntity.logical_name,
              targetLogicalName: targetEntity.logical_name,
              sourceDisplayName: sourceEntity.display_name,
              targetDisplayName: targetEntity.display_name,
              fieldLogicalName: created.logical_name,
              fieldDisplayName: created.display_name,
            });
          } catch {
            // Non-fatal
          }
        }
      }
    }
    showSuccess('Field saved');
    setPanelOpen(false);
    setEditingField(undefined);
  };

  const handleToggleSecured = async (field: FieldDefinition, secured: boolean) => {
    setTogglingSecured(field.field_definition_id);
    try {
      await setFieldSecured(field.field_definition_id, secured);
      setFields((prev) => prev.map((f) => f.field_definition_id === field.field_definition_id ? { ...f, is_secured: secured } : f));
    } catch (e: unknown) { showError(e instanceof Error ? e.message : 'Failed to update field security'); }
    finally { setTogglingSecured(null); }
  };

  const handleDeleteRequest = async (field: FieldDefinition) => {
    setDepChecking(true);
    try {
      const entity = entities.find((e) => e.entity_definition_id === selectedEntityId);
      const result = await checkColumnDependencies(
        selectedEntityId,
        field.field_definition_id,
        field.logical_name,
        entity?.logical_name ?? '',
      );
      if (!result.canDelete) {
        setDepResult(result);
        setDeleteTarget(field);
      } else {
        setDepResult(null);
        setDeleteTarget(field);
      }
    } catch {
      setDepResult(null);
      setDeleteTarget(field);
    } finally {
      setDepChecking(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteField(deleteTarget.field_definition_id);
      setFields((prev) => prev.filter((f) => f.field_definition_id !== deleteTarget.field_definition_id));
      setDeleteTarget(null);
    } catch (e: unknown) { showError(e instanceof Error ? e.message : 'Delete failed'); }
    finally { setDeleting(false); }
  };

  const refreshFields = () => {
    if (!selectedEntityId) return;
    setSelectedEntityId((prev) => prev);
    setFieldsLoading(true);
    fetchFieldsForEntity(selectedEntityId)
      .then(setFields)
      .catch((e: unknown) => showError(e instanceof Error ? e.message : 'Failed to reload'))
      .finally(() => setFieldsLoading(false));
  };

  const selectedEntity = entities.find((e) => e.entity_definition_id === selectedEntityId);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><RefreshCw size={16} className="animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafbfc]">
      {/* Command Bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-2 flex items-center gap-1.5 shrink-0">
        <CmdBtn primary onClick={() => { setEditingField(undefined); setPanelOpen(true); }} icon={<Plus size={13} />} disabled={!selectedEntityId}>
          New column
        </CmdBtn>
        <CmdSep />
        <CmdBtn onClick={refreshFields} icon={<RefreshCw size={12} className={fieldsLoading ? 'animate-spin' : ''} />}>
          Refresh
        </CmdBtn>
        <CmdBtn icon={<Download size={12} />}>Export</CmdBtn>
        <div className="flex-1" />
        <span className="text-[11px] text-slate-400 mr-2">{filtered.length} column{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filter Chips + Entity Selector + Search */}
      <div className="bg-white border-b border-slate-100 px-5 py-2 flex items-center gap-3 shrink-0">
        <div className="relative">
          <FilterSelect
            value={selectedEntityId}
            onChange={(e) => { setSelectedEntityId(e.target.value); setCategoryTab('all'); setSearch(''); }}
            className="appearance-none pl-2.5 pr-7 py-1.5 text-[12px] font-medium border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700"
          >
            {entities.map((e) => <option key={e.entity_definition_id} value={e.entity_definition_id}>{e.display_name}</option>)}
          </FilterSelect>
          </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="flex items-center gap-1">
          <Filter size={12} className="text-slate-400 mr-1" />
          {([
            { id: 'all' as const, label: 'All', count: fields.length },
            { id: 'system' as const, label: 'System', count: systemCount, icon: <Shield size={10} /> },
            { id: 'custom' as const, label: 'Custom', count: customCount, icon: <Wrench size={10} /> },
          ]).map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryTab(c.id)}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                categoryTab === c.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.icon}
              {c.label}
              <span className={`text-[10px] ${categoryTab === c.id ? 'text-blue-200' : 'text-slate-400'}`}>
                {c.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search columns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 py-1.5 text-[12px] border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 w-56 placeholder:text-slate-400 transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {fieldsLoading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw size={20} className="animate-spin text-slate-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Layers size={28} className="text-slate-200 mb-3" />
            <p className="text-[13px] text-slate-500 font-medium mb-1">
              {search
                ? 'No columns match your search'
                : categoryTab === 'custom'
                  ? selectedEntity ? `No custom columns for ${selectedEntity.display_name} yet` : 'Select a table'
                  : selectedEntity ? `No columns for ${selectedEntity.display_name}` : 'Select a table'}
            </p>
            <p className="text-[11px] text-slate-400 mb-3">Columns define the data attributes stored on each record.</p>
            {!search && selectedEntityId && categoryTab !== 'system' && (
              <button onClick={() => { setEditingField(undefined); setPanelOpen(true); }} className="text-[12px] text-blue-600 hover:text-blue-800 font-medium hover:underline">
                + Add the first custom column
              </button>
            )}
          </div>
        ) : (
          <FieldGrid
            fields={filtered}
            onEdit={(f) => { setEditingField(f); setPanelOpen(true); }}
            onDelete={handleDeleteRequest}
            onToggleSecured={handleToggleSecured}
            togglingSecured={togglingSecured}
          />
        )}
      </div>

      {panelOpen && (
        <FieldEditorPanel
          entityId={selectedEntityId}
          field={editingField}
          fieldTypes={fieldTypes}
          entities={entities}
          onSave={handleSave}
          onClose={() => { setPanelOpen(false); setEditingField(undefined); }}
        />
      )}

      {depChecking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl px-6 py-4 text-[13px] text-slate-600 flex items-center gap-3">
            <RefreshCw size={15} className="animate-spin text-slate-400" />
            Checking dependencies...
          </div>
        </div>
      )}

      {deleteTarget && depResult && !depResult.canDelete && (
        <DependencyBlockModal
          title="Cannot Delete Column"
          itemName={deleteTarget.display_name}
          dependencies={depResult.dependencies}
          fieldDefinitionId={deleteTarget.field_definition_id}
          fieldLogicalName={deleteTarget.logical_name}
          onClose={() => { setDeleteTarget(null); setDepResult(null); }}
          onDepsCleared={() => {
            // All deps resolved — re-check to confirm, then allow delete
            setDepResult({ canDelete: true, dependencies: [] });
          }}
          onOpenBusinessRule={(_ruleId) => {
            setDeleteTarget(null);
            setDepResult(null);
            // Navigate to business rules — handled by parent via AdminStudio
            // We dispatch a custom event the AdminStudio can listen to
            window.dispatchEvent(new CustomEvent('navigate-admin', { detail: { module: 'rules' } }));
          }}
          onOpenProcessFlow={(_flowId) => {
            setDeleteTarget(null);
            setDepResult(null);
            window.dispatchEvent(new CustomEvent('navigate-admin', { detail: { module: 'processflows' } }));
          }}
        />
      )}

      {deleteTarget && (!depResult || depResult.canDelete) && !depChecking && (
        <ConfirmDialog
          title="Delete Custom Column"
          message={`Delete "${deleteTarget.display_name}"? This cannot be undone.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete'}
          onConfirm={handleDelete}
          onCancel={() => { setDeleteTarget(null); setDepResult(null); }}
          danger
        />
      )}
    </div>
  );
}

function CmdBtn({ children, onClick, icon, primary, disabled }: {
  children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; primary?: boolean; disabled?: boolean;
}) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded transition-all disabled:opacity-50';
  const style = primary
    ? `${base} bg-blue-600 hover:bg-blue-700 text-white shadow-sm`
    : `${base} text-slate-600 hover:bg-slate-100`;
  return <button className={style} onClick={onClick} disabled={disabled}>{icon}{children}</button>;
}

function CmdSep() {
  return <div className="w-px h-5 bg-slate-200 mx-1" />;
}
