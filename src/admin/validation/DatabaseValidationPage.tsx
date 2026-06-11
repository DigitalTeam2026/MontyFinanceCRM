import { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle, CheckCircle, RefreshCw, Search, Filter,
  Database, Table2, Wrench, ChevronDown, ChevronUp,
  XCircle, Info, Loader, ShieldAlert,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ValidationRow {
  entity_name: string;
  logical_name: string;
  physical_table_name: string;
  table_exists: boolean;
  field_definition_id: string;
  field_name: string;
  field_logical_name: string;
  physical_column_name: string;
  field_type_name: string;
  is_custom: boolean;
  storage_type: 'PHYSICAL_COLUMN' | 'JSONB_CUSTOM' | 'NO_MAPPING';
  column_exists: boolean;
  status: 'ok' | 'broken' | 'no_table' | 'jsonb';
}

type FilterMode = 'all' | 'broken' | 'no_table' | 'jsonb' | 'ok';

const STATUS_CONFIG = {
  ok:       { label: 'Valid',              color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  broken:   { label: 'Missing Column',     color: 'text-red-700 bg-red-50 border-red-200',             dot: 'bg-red-500' },
  no_table: { label: 'Table Not Found',    color: 'text-orange-700 bg-orange-50 border-orange-200',    dot: 'bg-orange-500' },
  jsonb:    { label: 'JSONB Custom Field', color: 'text-blue-700 bg-blue-50 border-blue-200',          dot: 'bg-blue-400' },
};

const FIELD_TYPE_SQL: Record<string, string> = {
  text:        'text',
  long_text:   'text',
  email:       'text',
  phone:       'text',
  url:         'text',
  number:      'numeric',
  decimal:     'numeric',
  whole_number:'integer',
  currency:    'numeric',
  boolean:     'boolean',
  date:        'date',
  datetime:    'timestamptz',
  time:        'time',
  choice:      'text',
  option_set:  'text',
  multi_choice:'text[]',
  multi_option_set: 'text[]',
  lookup:      'uuid',
  auto_number: 'text',
  autonumber:  'text',
  calculated:  'text',
  textarea:    'text',
  image:       'text',
  file:        'text',
};

export default function DatabaseValidationPage() {
  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [repairing, setRepairing] = useState<string | null>(null);
  const [repairResults, setRepairResults] = useState<Record<string, 'ok' | 'error'>>({});
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('validate_field_column_alignment');
      if (error) throw error;
      setRows(data as ValidationRow[]);
      // auto-expand entities with issues
      const broken = new Set<string>(
        (data as ValidationRow[])
          .filter((r) => r.status === 'broken' || r.status === 'no_table')
          .map((r) => r.logical_name)
      );
      setExpandedEntities(broken);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => {
    if (showOnlyIssues && r.status !== 'broken' && r.status !== 'no_table') return false;
    if (filter !== 'all' && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.entity_name.toLowerCase().includes(q) ||
        r.field_name.toLowerCase().includes(q) ||
        r.field_logical_name.toLowerCase().includes(q) ||
        r.physical_column_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by entity
  const grouped = filtered.reduce<Record<string, { meta: ValidationRow; rows: ValidationRow[] }>>((acc, row) => {
    const key = row.logical_name;
    if (!acc[key]) {
      acc[key] = { meta: row, rows: [] };
    }
    acc[key].rows.push(row);
    return acc;
  }, {});

  const counts = {
    all:      rows.length,
    broken:   rows.filter((r) => r.status === 'broken').length,
    no_table: rows.filter((r) => r.status === 'no_table').length,
    jsonb:    rows.filter((r) => r.status === 'jsonb').length,
    ok:       rows.filter((r) => r.status === 'ok').length,
  };

  const toggleEntity = (key: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const repairColumn = async (row: ValidationRow) => {
    const key = row.field_definition_id;
    setRepairing(key);
    try {
      const sqlType = FIELD_TYPE_SQL[row.field_type_name] ?? 'text';
      const { error } = await supabase.rpc('admin_add_missing_column', {
        p_table: row.physical_table_name,
        p_column: row.physical_column_name,
        p_sql_type: sqlType,
      });
      if (error) throw error;
      setRepairResults((prev) => ({ ...prev, [key]: 'ok' }));
      setRows((prev) =>
        prev.map((r) =>
          r.field_definition_id === key ? { ...r, column_exists: true, status: 'ok' } : r
        )
      );
    } catch {
      setRepairResults((prev) => ({ ...prev, [key]: 'error' }));
    } finally {
      setRepairing(null);
    }
  };

  const repairAllBroken = async () => {
    const brokenRows = rows.filter((r) => r.status === 'broken');
    for (const row of brokenRows) {
      await repairColumn(row);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafbfc]">
      {/* Stats bar */}
      <div className="bg-white border-b border-slate-100 px-5 py-3 shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          {counts.broken > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
              <XCircle size={14} className="text-red-500 shrink-0" />
              <span className="text-[12px] font-semibold text-red-700">{counts.broken} missing column{counts.broken !== 1 ? 's' : ''}</span>
            </div>
          )}
          {counts.no_table > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg">
              <AlertTriangle size={14} className="text-orange-500 shrink-0" />
              <span className="text-[12px] font-semibold text-orange-700">{counts.no_table} fields in missing tables</span>
            </div>
          )}
          {counts.broken === 0 && counts.no_table === 0 && !loading && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle size={14} className="text-emerald-500 shrink-0" />
              <span className="text-[12px] font-semibold text-emerald-700">All columns are aligned</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {counts.broken > 0 && (
              <button
                onClick={repairAllBroken}
                disabled={!!repairing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                <Wrench size={12} />
                Repair All ({counts.broken})
              </button>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-slate-100 px-5 py-2.5 flex items-center gap-3 shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields or entities..."
            className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-slate-400 shrink-0" />
          {(Object.keys(STATUS_CONFIG) as FilterMode[]).concat(['all' as FilterMode]).map((f) => {
            if (f === 'all') {
              return (
                <button
                  key="all"
                  onClick={() => setFilter('all')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                    filter === 'all'
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  All ({counts.all})
                </button>
              );
            }
            const cfg = STATUS_CONFIG[f as keyof typeof STATUS_CONFIG];
            const count = counts[f as keyof typeof counts];
            return (
              <button
                key={f}
                onClick={() => setFilter(f as FilterMode)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                  filter === f ? cfg.color : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={showOnlyIssues}
            onChange={(e) => setShowOnlyIssues(e.target.checked)}
            className="rounded border-slate-300"
          />
          Issues only
        </label>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader size={18} className="animate-spin mr-2" />
            <span className="text-[13px]">Scanning all entity tables...</span>
          </div>
        )}

        {!loading && Object.keys(grouped).length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle size={36} className="text-emerald-400 mb-3" />
            <p className="text-[14px] font-semibold text-slate-700">No issues found</p>
            <p className="text-[12px] text-slate-400 mt-1">All field definitions match their physical database columns.</p>
          </div>
        )}

        {!loading && Object.entries(grouped).map(([entityKey, { meta, rows: entityRows }]) => {
          const isExpanded = expandedEntities.has(entityKey);
          const brokenCount = entityRows.filter((r) => r.status === 'broken').length;
          const noTableCount = entityRows.filter((r) => r.status === 'no_table').length;
          const hasIssues = brokenCount > 0 || noTableCount > 0;

          return (
            <div key={entityKey} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {/* Entity header */}
              <button
                onClick={() => toggleEntity(entityKey)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  hasIssues ? 'bg-red-50/40 hover:bg-red-50' : 'bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  hasIssues ? 'bg-red-100 ring-1 ring-red-200' : 'bg-slate-100 ring-1 ring-slate-200'
                }`}>
                  <Database size={14} className={hasIssues ? 'text-red-500' : 'text-slate-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-slate-800">{meta.entity_name}</p>
                    {!meta.table_exists && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-orange-100 text-orange-700 rounded border border-orange-200">
                        <AlertTriangle size={9} /> Table Missing
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">{meta.physical_table_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {brokenCount > 0 && (
                    <span className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      {brokenCount} broken
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400">{entityRows.length} fields</span>
                  {isExpanded ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                </div>
              </button>

              {/* Fields table */}
              {isExpanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Field</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Physical Column</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Type</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Storage</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Status</th>
                        <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {entityRows.map((row) => {
                        const cfg = STATUS_CONFIG[row.status];
                        const repaired = repairResults[row.field_definition_id];
                        return (
                          <tr key={row.field_definition_id} className={row.status === 'broken' ? 'bg-red-50/30' : ''}>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-slate-800">{row.field_name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{row.field_logical_name}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-mono text-slate-600 text-[10px]">{row.physical_column_name}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-slate-500">{row.field_type_name}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              {row.storage_type === 'JSONB_CUSTOM' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded text-[10px] font-medium">
                                  <Table2 size={9} /> JSONB
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 rounded text-[10px] font-medium">
                                  <Database size={9} /> Column
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {repaired === 'ok' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium text-emerald-700 bg-emerald-50 border-emerald-200">
                                  <CheckCircle size={9} /> Repaired
                                </span>
                              ) : repaired === 'error' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium text-red-700 bg-red-50 border-red-200">
                                  <XCircle size={9} /> Failed
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${cfg.color}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                  {cfg.label}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {row.status === 'broken' && !repairResults[row.field_definition_id] && (
                                <button
                                  onClick={() => repairColumn(row)}
                                  disabled={repairing === row.field_definition_id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                                >
                                  {repairing === row.field_definition_id
                                    ? <Loader size={10} className="animate-spin" />
                                    : <Wrench size={10} />
                                  }
                                  Create Column
                                </button>
                              )}
                              {row.status === 'no_table' && (
                                <span className="text-[10px] text-orange-600 flex items-center justify-end gap-1">
                                  <Info size={10} /> Table schema missing
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      {!loading && rows.length > 0 && (
        <div className="bg-white border-t border-slate-100 px-5 py-2 flex items-center gap-4 text-[11px] text-slate-500 shrink-0">
          <ShieldAlert size={12} className="text-slate-400" />
          <span>
            {rows.length} total field definitions across {Object.keys(grouped).length} entities
            {counts.broken > 0 && <> &bull; <span className="text-red-600 font-semibold">{counts.broken} need repair</span></>}
            {counts.ok > 0 && <> &bull; <span className="text-emerald-600">{counts.ok} valid columns</span></>}
            {counts.jsonb > 0 && <> &bull; <span className="text-blue-600">{counts.jsonb} JSONB custom fields</span></>}
          </span>
          <button
            onClick={() => setExpandedEntities(new Set(Object.keys(grouped)))}
            className="ml-auto text-blue-600 hover:underline"
          >
            Expand all
          </button>
          <button
            onClick={() => setExpandedEntities(new Set())}
            className="text-slate-400 hover:underline"
          >
            Collapse all
          </button>
        </div>
      )}
    </div>
  );
}
