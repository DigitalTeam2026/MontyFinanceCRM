import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw, DatabaseZap, AlertTriangle, CheckCircle2, Wrench, Table2, Columns3,
  FileText, LayoutList, ShieldCheck,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import {
  fetchMetadataHealthReport, reloadPostgrestSchema, countHealthIssues,
  type MetadataHealthReport,
} from '../../services/schemaService';
import { fetchEntities, repairEntityTable } from '../../services/entityService';
import { recreateFieldColumn, deleteFieldById } from '../../services/fieldService';
import { bootstrapEntity } from '../../services/bootstrapEntityService';
import { invalidateAllMetadataCaches } from '../../app/services/metadata/cacheBus';
import { supabase } from '../../lib/supabase';
import type { EntityDefinition } from '../../types/entity';

export default function SystemHealthPage() {
  const { showSuccess, showError } = useToast();
  const [report, setReport] = useState<MetadataHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchMetadataHealthReport();
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run health check');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, [run]);

  const withBusy = async (key: string, fn: () => Promise<void>, successMsg: string) => {
    setBusy(key);
    try {
      await fn();
      invalidateAllMetadataCaches();
      showSuccess(successMsg);
      await run();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const handleReloadSchema = () =>
    withBusy('reload', async () => {
      const ok = await reloadPostgrestSchema();
      if (!ok) throw new Error('Schema reload could not be triggered (is the migration applied?)');
    }, 'PostgREST schema cache reloaded');

  const handleRepairTable = (entityId: string) =>
    withBusy(`table:${entityId}`, async () => {
      await repairEntityTable(entityId);
      await reloadPostgrestSchema();
    }, 'Physical table created');

  const handleCreateDefaults = (entityId: string) =>
    withBusy(`defaults:${entityId}`, async () => {
      const entities = await fetchEntities();
      const ent = entities.find((e) => e.entity_definition_id === entityId) as EntityDefinition | undefined;
      if (!ent) throw new Error('Entity not found');
      await bootstrapEntity(ent);
    }, 'Default forms/views created');

  const handleGrantPrivileges = (entityId: string) =>
    withBusy(`priv:${entityId}`, async () => {
      const { error: rpcErr } = await supabase.rpc('sync_system_admin_privileges');
      if (rpcErr) throw rpcErr;
    }, 'Administrator privileges synced');

  const handleRecreateColumn = (fieldId: string) =>
    withBusy(`col:${fieldId}`, () => recreateFieldColumn(fieldId), 'Database column created');

  const handleDeleteField = (fieldId: string) =>
    withBusy(`field:${fieldId}`, () => deleteFieldById(fieldId), 'Field removed');

  // ── Per-section "Fix all": run the safe auto-fix for every row in a section ──────
  const handleFixAllTables = () =>
    withBusy('fixall:tables', async () => {
      for (const t of (report?.missing_tables ?? []).filter((x) => x.is_custom)) {
        await repairEntityTable(t.entity_definition_id);
      }
      await reloadPostgrestSchema();
    }, 'Tables created');

  const handleFixAllDefaults = (entities: MetadataHealthReport['entities_missing_main_form']) =>
    async () => {
      const all = await fetchEntities();
      for (const e of entities) {
        const ent = all.find((x) => x.entity_definition_id === e.entity_definition_id) as
          | EntityDefinition
          | undefined;
        if (ent) await bootstrapEntity(ent);
      }
    };

  const handleFixAllForms = () =>
    withBusy('fixall:forms', handleFixAllDefaults(report?.entities_missing_main_form ?? []), 'Default forms created');

  const handleFixAllViews = () =>
    withBusy('fixall:views', handleFixAllDefaults(report?.entities_missing_active_view ?? []), 'Default views created');

  const handleFixAllPrivileges = () =>
    withBusy('fixall:priv', async () => {
      const { error: rpcErr } = await supabase.rpc('sync_system_admin_privileges');
      if (rpcErr) throw rpcErr;
    }, 'Administrator privileges synced');

  const issueCount = report ? countHealthIssues(report) : 0;

  return (
    <div className="flex-1 overflow-auto bg-[#f3f4f6] p-5">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between bg-white border border-[#e5e7eb] rounded-lg px-4 py-3">
          <div className="flex items-center gap-2.5">
            <DatabaseZap size={18} className="text-blue-600" />
            <div>
              <p className="text-[13px] font-semibold text-[#1e293b] leading-tight">System Health</p>
              <p className="text-[11px] text-[#6b7280]">Verify CRM metadata is in sync with the physical database</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReloadSchema}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded border border-[#d1d5db] text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
              title="Tell the Supabase Data API to re-read the database schema (fixes new tables/columns not appearing)"
            >
              <DatabaseZap size={13} className={busy === 'reload' ? 'animate-pulse' : ''} />
              Reload schema cache
            </button>
            <button
              onClick={run}
              disabled={loading || busy !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Re-run check
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-[12px] text-red-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !report && (
          <div className="flex items-center justify-center py-16 text-[#9ca3af]">
            <RefreshCw size={18} className="animate-spin" />
          </div>
        )}

        {report && !loading && issueCount === 0 && (
          <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-lg px-4 py-5 text-[13px] text-green-800">
            <CheckCircle2 size={18} className="text-green-600" />
            <span>All entities are in sync with the database. No drift detected.</span>
          </div>
        )}

        {report && (
          <>
            <HealthSection<typeof report.missing_tables[number]>
              icon={<Table2 size={14} />}
              title="Missing physical tables"
              hint="The entity metadata exists but its database table does not. Opening these entities errors."
              items={report.missing_tables}
              render={(t) => `${t.display_name} (${t.physical_table_name})`}
              actions={(t) =>
                t.is_custom
                  ? [{ label: 'Create table', onClick: () => handleRepairTable(t.entity_definition_id), busyKey: `table:${t.entity_definition_id}` }]
                  : []
              }
              fixAll={
                report.missing_tables.some((t) => t.is_custom)
                  ? { label: 'Create all', onClick: handleFixAllTables, busyKey: 'fixall:tables' }
                  : null
              }
              busy={busy}
            />

            <HealthSection<typeof report.missing_columns[number]>
              icon={<Columns3 size={14} />}
              title="Fields with no database column"
              hint="A field maps to a column the table lacks. Try reloading the schema cache first. If it persists, either re-create the column (for a real field) or delete the field (for a malformed one). This is per-row on purpose — recreating a column is additive, deleting a field is destructive."
              items={report.missing_columns}
              render={(c) => `${c.entity_display_name}.${c.field_display_name} → ${c.physical_table_name}.${c.physical_column_name}`}
              actions={(c) => [
                { label: 'Recreate column', onClick: () => handleRecreateColumn(c.field_definition_id), busyKey: `col:${c.field_definition_id}` },
                { label: 'Delete field', onClick: () => handleDeleteField(c.field_definition_id), busyKey: `field:${c.field_definition_id}`, danger: true },
              ]}
              busy={busy}
            />

            <HealthSection<typeof report.entities_missing_main_form[number]>
              icon={<FileText size={14} />}
              title="Entities missing a Main form"
              hint="Records can't be created/edited without a form. Create the default forms."
              items={report.entities_missing_main_form}
              render={(e) => e.display_name}
              actions={(e) => [{ label: 'Create defaults', onClick: () => handleCreateDefaults(e.entity_definition_id), busyKey: `defaults:${e.entity_definition_id}` }]}
              fixAll={{ label: 'Create all', onClick: handleFixAllForms, busyKey: 'fixall:forms' }}
              busy={busy}
            />

            <HealthSection<typeof report.entities_missing_active_view[number]>
              icon={<LayoutList size={14} />}
              title="Entities missing an active view"
              hint="The list page needs at least one view. Create the default views."
              items={report.entities_missing_active_view}
              render={(e) => e.display_name}
              actions={(e) => [{ label: 'Create defaults', onClick: () => handleCreateDefaults(e.entity_definition_id), busyKey: `defaults:${e.entity_definition_id}` }]}
              fixAll={{ label: 'Create all', onClick: handleFixAllViews, busyKey: 'fixall:views' }}
              busy={busy}
            />

            <HealthSection<typeof report.entities_missing_admin_privilege[number]>
              icon={<ShieldCheck size={14} />}
              title="Entities missing administrator privileges"
              hint="System Administrator has no privilege row for these entities. Sync privileges."
              items={report.entities_missing_admin_privilege}
              render={(e) => e.display_name}
              actions={(e) => [{ label: 'Grant', onClick: () => handleGrantPrivileges(e.entity_definition_id), busyKey: `priv:${e.entity_definition_id}` }]}
              fixAll={{ label: 'Grant all', onClick: handleFixAllPrivileges, busyKey: 'fixall:priv' }}
              busy={busy}
            />
          </>
        )}
      </div>
    </div>
  );
}

interface ActionSpec {
  label: string;
  onClick: () => void;
  busyKey: string;
  danger?: boolean;
}

function FixButton({ spec, busy }: { spec: ActionSpec; busy: string | null }) {
  return (
    <button
      onClick={spec.onClick}
      disabled={busy !== null}
      className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border disabled:opacity-50 shrink-0 ${
        spec.danger
          ? 'border-red-300 text-red-600 hover:bg-red-50'
          : 'border-[#d1d5db] text-[#374151] hover:bg-[#f9fafb]'
      }`}
    >
      <Wrench size={11} className={busy === spec.busyKey ? 'animate-pulse' : ''} />
      {spec.label}
    </button>
  );
}

function HealthSection<T>(props: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  items: T[];
  render: (item: T) => string;
  actions: (item: T) => ActionSpec[];
  fixAll?: ActionSpec | null;
  busy: string | null;
}) {
  const { icon, title, hint, items, render, actions, fixAll, busy } = props;
  const ok = items.length === 0;
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#f1f5f9]">
        <span className={ok ? 'text-green-600' : 'text-amber-600'}>{icon}</span>
        <span className="text-[12px] font-semibold text-[#1e293b]">{title}</span>
        {!ok && fixAll && (
          <button
            onClick={fixAll.onClick}
            disabled={busy !== null}
            className="ml-2 flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Wrench size={11} className={busy === fixAll.busyKey ? 'animate-pulse' : ''} />
            {fixAll.label}
          </button>
        )}
        <span className={`ml-auto text-[11px] font-medium px-1.5 py-0.5 rounded ${ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {ok ? 'OK' : `${items.length} issue${items.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {!ok && (
        <>
          <p className="px-4 pt-2 text-[11px] text-[#6b7280]">{hint}</p>
          <ul className="px-4 py-2 space-y-1.5">
            {items.map((item, i) => {
              const specs = actions(item);
              return (
                <li key={i} className="flex items-center gap-2 text-[12px] text-[#374151]">
                  <span className="font-mono text-[11px] text-[#475569] flex-1 truncate">{render(item)}</span>
                  {specs.map((spec) => (
                    <FixButton key={spec.busyKey} spec={spec} busy={busy} />
                  ))}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
