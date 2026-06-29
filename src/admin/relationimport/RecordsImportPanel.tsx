import { useState, useEffect, useCallback } from 'react';
import { Database, Loader2, AlertTriangle, FileSpreadsheet, ArrowRight } from 'lucide-react';
import FilterSelect from '../../app/components/FilterSelect';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../app/context/ToastContext';
import { fetchEntities } from '../../services/entityService';
import type { EntityDefinition } from '../../types/entity';
import type { ColumnState } from '../../app/components/ColumnCustomizer';
import { resolveAllEntityColumnStates } from '../../app/services/importEngine';
import ImportFromExcelModal from '../../app/components/ImportFromExcelModal';

export default function RecordsImportPanel() {
  const { showSuccess } = useToast();
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [columns, setColumns] = useState<ColumnState[] | null>(null);
  const [loadingCols, setLoadingCols] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? ''));
    fetchEntities()
      .then((ents) => setEntities(ents.filter((e) => e.is_active)))
      .catch((e) => setError(e.message ?? 'Failed to load tables'))
      .finally(() => setLoadingEntities(false));
  }, []);

  const selected = entities.find((e) => e.entity_definition_id === selectedId) ?? null;

  const handleSelect = useCallback(async (id: string) => {
    setSelectedId(id);
    setColumns(null);
    setError(null);
    const ent = entities.find((e) => e.entity_definition_id === id);
    if (!ent) return;
    setLoadingCols(true);
    try {
      const cols = await resolveAllEntityColumnStates(ent.logical_name);
      if (cols.length === 0) {
        setError('No importable columns found for this table.');
      }
      setColumns(cols);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load columns');
    } finally {
      setLoadingCols(false);
    }
  }, [entities]);

  const lookupCols = (columns ?? []).filter((c) => c.type === 'lookup' || c.type === 'owner');

  return (
    <div className="max-w-[1100px] mx-auto">
      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-md bg-red-50 border border-red-200">
          <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <span className="text-[12px] text-red-700">{error}</span>
        </div>
      )}

      <div className="bg-white border rounded-lg p-4 mb-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Database size={15} className="text-blue-600" />
          <span className="text-[13px] font-semibold text-[var(--ink-800)]">Table to import</span>
        </div>
        <p className="text-[12px] text-[var(--ink-500)] mb-3">
          Pick any table and import its records from Excel. Relationships to other records (e.g. an
          Opportunity → POS Location link) come across automatically — each lookup column is matched by
          the related record's <strong>name</strong>, falling back to its <strong>legacy ID</strong> when present.
          Import parent tables before their children.
        </p>
        {loadingEntities ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--ink-500)]">
            <Loader2 size={14} className="animate-spin" /> Loading tables…
          </div>
        ) : (
          <FilterSelect
            value={selectedId}
            onChange={(e) => handleSelect(e.target.value)}
            className="w-full h-[34px] px-3 text-[12px] bg-white border rounded text-[var(--ink-700)]
              focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)]"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">Select a table…</option>
            {entities.map((e) => (
              <option key={e.entity_definition_id} value={e.entity_definition_id}>
                {e.display_name}
              </option>
            ))}
          </FilterSelect>
        )}
      </div>

      {selected && (
        <div className="bg-white border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
          {loadingCols ? (
            <div className="flex items-center gap-2 text-[12px] text-[var(--ink-500)] py-4">
              <Loader2 size={14} className="animate-spin" /> Resolving columns…
            </div>
          ) : columns ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-[12px] mb-3">
                <div>
                  <span className="text-[11px] text-[var(--ink-400)] uppercase tracking-wide">Table</span>
                  <p className="text-[12px] text-[var(--ink-800)] font-mono">{selected.physical_table_name}</p>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--ink-400)] uppercase tracking-wide">Importable columns</span>
                  <p className="text-[12px] text-[var(--ink-800)]">{columns.length}</p>
                </div>
              </div>
              {lookupCols.length > 0 && (
                <div className="mb-3">
                  <span className="text-[11px] font-semibold text-[var(--ink-600)] uppercase tracking-wide">
                    Relationship (lookup) columns
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {lookupCols.map((c) => (
                      <span key={c.key} className="px-2 py-0.5 rounded text-[11px] bg-blue-50 text-blue-700">
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={() => setShowModal(true)}
                disabled={columns.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium rounded
                  bg-[var(--navy-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                <FileSpreadsheet size={14} /> Open Importer <ArrowRight size={13} />
              </button>
            </>
          ) : null}
        </div>
      )}

      {showModal && selected && columns && (
        <ImportFromExcelModal
          entity={selected.logical_name}
          entityLabel={selected.display_name}
          viewName="All Columns"
          viewColumns={columns}
          userId={userId}
          onClose={() => setShowModal(false)}
          onImportComplete={() => showSuccess(`${selected.display_name} import completed.`)}
        />
      )}
    </div>
  );
}
