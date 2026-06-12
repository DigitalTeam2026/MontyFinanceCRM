import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState } from 'react';
import {
  Plus, Search, RefreshCw, GitFork, Lock, Pencil, Trash2, ArrowRight, ArrowLeftRight, Filter, X, Download } from 'lucide-react';
import type { RelationshipDefinitionWithEntities, RelationshipType } from '../../types/relationship';
import { fetchRelationships, deleteRelationship } from '../../services/relationshipService';
import { fetchEntities } from '../../services/entityService';
import type { EntityDefinition } from '../../types/entity';
import ConfirmDialog from '../components/ConfirmDialog';

interface RelationshipListPageProps {
  preselectedEntityId?: string;
  onNew: () => void;
  onEdit: (rel: RelationshipDefinitionWithEntities) => void;
}

type FilterTab = 'all' | 'system' | 'custom';

const TYPE_COLORS: Record<RelationshipType, string> = {
  '1:N': 'bg-blue-50 text-blue-700 ring-blue-200',
  'N:1': 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  'N:N': 'bg-amber-50 text-amber-700 ring-amber-200',
};

const STORAGE_COLORS: Record<string, string> = {
  lookup:   'bg-slate-50 text-slate-600 ring-slate-200',
  junction: 'bg-orange-50 text-orange-700 ring-orange-200',
};

export default function RelationshipListPage({ preselectedEntityId, onNew, onEdit }: RelationshipListPageProps) {
  const [relationships, setRelationships] = useState<RelationshipDefinitionWithEntities[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>(preselectedEntityId ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [deleteTarget, setDeleteTarget] = useState<RelationshipDefinitionWithEntities | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rels, ents] = await Promise.all([fetchRelationships(), fetchEntities()]);
      setRelationships(rels);
      setEntities(ents);
    }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const entityFiltered = selectedEntityId
    ? relationships.filter((r) => r.source_entity_id === selectedEntityId || r.target_entity_id === selectedEntityId)
    : relationships;
  const systemCount = entityFiltered.filter((r) => r.is_system).length;
  const customCount = entityFiltered.filter((r) => !r.is_system).length;

  const filtered = relationships.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      r.display_name.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.source_entity_display_name?.toLowerCase().includes(q) ||
      r.target_entity_display_name?.toLowerCase().includes(q);
    const matchesTab =
      filterTab === 'all' ||
      (filterTab === 'system' && r.is_system) ||
      (filterTab === 'custom' && !r.is_system);
    const matchesEntity =
      !selectedEntityId ||
      r.source_entity_id === selectedEntityId ||
      r.target_entity_id === selectedEntityId;
    return matchesSearch && matchesTab && matchesEntity;
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRelationship(deleteTarget.relationship_definition_id);
      setRelationships((prev) =>
        prev.filter((r) => r.relationship_definition_id !== deleteTarget.relationship_definition_id)
      );
      setDeleteTarget(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafbfc]">
      {/* Command Bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-2 flex items-center gap-1.5 shrink-0">
        <CmdBtn primary onClick={onNew} icon={<Plus size={13} />}>New relationship</CmdBtn>
        <CmdSep />
        <CmdBtn onClick={load} icon={<RefreshCw size={12} className={loading ? 'animate-spin' : ''} />}>Refresh</CmdBtn>
        <CmdBtn icon={<Download size={12} />}>Export</CmdBtn>
        <div className="flex-1" />
        <span className="text-[11px] text-slate-400 mr-2">{filtered.length} relationship{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filter Chips + Entity Selector + Search */}
      <div className="bg-white border-b border-slate-100 px-5 py-2 flex items-center gap-3 shrink-0">
        <div className="relative">
          <FilterSelect
            value={selectedEntityId}
            onChange={(e) => { setSelectedEntityId(e.target.value); setFilterTab('all'); }}
            className="appearance-none pl-2.5 pr-7 py-1.5 text-[12px] font-medium border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700 min-w-[150px]"
          >
            <option value="">All tables</option>
            {entities.map((e) => (
              <option key={e.entity_definition_id} value={e.entity_definition_id}>
                {e.display_name}
              </option>
            ))}
          </FilterSelect>
          </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="flex items-center gap-1">
          <Filter size={12} className="text-slate-400 mr-1" />
          {([
            { id: 'all' as const, label: 'All', count: entityFiltered.length },
            { id: 'system' as const, label: 'System', count: systemCount },
            { id: 'custom' as const, label: 'Custom', count: customCount },
          ]).map((c) => (
            <button
              key={c.id}
              onClick={() => setFilterTab(c.id)}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                filterTab === c.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.label}
              <span className={`text-[10px] ${filterTab === c.id ? 'text-blue-200' : 'text-slate-400'}`}>
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
            placeholder="Search relationships..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 py-1.5 text-[12px] border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 w-60 placeholder:text-slate-400 transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mt-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-[12px] rounded-md flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw size={20} className="animate-spin text-slate-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <GitFork size={28} className="text-slate-200 mb-3" />
            <p className="text-[13px] text-slate-500 font-medium mb-1">
              {search ? 'No relationships match your search' : 'No relationships found'}
            </p>
            <p className="text-[11px] text-slate-400 mb-3">Relationships define how tables are connected.</p>
            {!search && filterTab !== 'system' && (
              <button onClick={onNew} className="text-[12px] text-blue-600 hover:text-blue-800 font-medium hover:underline">
                + Register your first relationship
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Relationship name</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Related tables</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Storage</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Lookup column</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Managed</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="w-16 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((rel) => (
                <tr
                  key={rel.relationship_definition_id}
                  className="border-b border-slate-100 transition-colors cursor-pointer hover:bg-slate-50/80 group"
                  onClick={() => !rel.is_system && onEdit(rel)}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-slate-50 ring-1 ring-slate-200">
                        {rel.relationship_type === 'N:N'
                          ? <ArrowLeftRight size={13} className="text-slate-400" />
                          : <ArrowRight size={13} className="text-slate-400" />
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate leading-tight">{rel.display_name}</p>
                        <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5 font-mono">{rel.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                        {rel.source_entity_display_name}
                      </span>
                      {rel.relationship_type === 'N:N'
                        ? <ArrowLeftRight size={10} className="text-slate-400 shrink-0" />
                        : <ArrowRight size={10} className="text-slate-400 shrink-0" />
                      }
                      <span className="text-[11px] font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                        {rel.target_entity_display_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold ring-1 ring-inset ${TYPE_COLORS[rel.relationship_type]}`}>
                      {rel.relationship_type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-medium ring-1 ring-inset ${STORAGE_COLORS[rel.relationship_storage_type] ?? 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
                      {rel.relationship_storage_type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {rel.relationship_storage_type === 'lookup' ? (
                      rel.lookup_field_display_name ? (
                        <div>
                          <span className="text-[11px] text-slate-700">{rel.lookup_field_display_name}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{rel.lookup_field_physical_column}</p>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">--</span>
                      )
                    ) : (
                      <code className="text-[10px] text-slate-500 font-mono">{rel.junction_table}</code>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {rel.is_system ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                        <Lock size={9} className="text-slate-400" /> Managed
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Unmanaged</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${rel.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className={`text-[11px] ${rel.is_active ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {rel.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {rel.is_system ? (
                      <div className="p-1 text-slate-200 cursor-not-allowed">
                        <Lock size={12} />
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onEdit(rel)}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(rel)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Relationship"
          message={`Delete "${deleteTarget.display_name}"? This will remove the metadata registration. The underlying database structure is not affected.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete'}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}
    </div>
  );
}

function CmdBtn({ children, onClick, icon, primary }: {
  children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; primary?: boolean;
}) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded transition-all';
  const style = primary
    ? `${base} bg-blue-600 hover:bg-blue-700 text-white shadow-sm`
    : `${base} text-slate-600 hover:bg-slate-100`;
  return <button className={style} onClick={onClick}>{icon}{children}</button>;
}

function CmdSep() {
  return <div className="w-px h-5 bg-slate-200 mx-1" />;
}
