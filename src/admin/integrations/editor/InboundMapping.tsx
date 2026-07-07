import { uuid } from '../../../lib/uuid';
import FilterSelect from '../../../app/components/FilterSelect';
import { useMemo, useState } from 'react';
import { Plus, Trash2, ArrowRight, Code2, Info, FlaskConical, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type {
  InboundConfig,
  InboundFieldMapping,
  EntityFieldInfo,
  LookupEntityField,
  LookupMatchBy,
  LookupMatchType,
  LookupNotFoundBehavior,
  LookupResolutionTestResult,
  InboundOperation,
} from '../../../types/apiIntegration';
import FieldSelectorModal, { TypeBadge } from './FieldSelectorModal';

interface Props {
  fields: EntityFieldInfo[];
  config: InboundConfig;
  operation: InboundOperation;
  lookupCache: Record<string, LookupEntityField[]>;
  lookupLoading: Record<string, boolean>;
  onLoadLookup: (entityId: string) => void;
  onChange: (config: InboundConfig) => void;
  onTestLookup: (m: InboundFieldMapping, value: string) => Promise<LookupResolutionTestResult>;
}

const MATCH_BY_OPTIONS: { value: LookupMatchBy; label: string }[] = [
  { value: 'id', label: 'Related record GUID' },
  { value: 'primary_name', label: 'Related record primary name' },
  { value: 'field', label: 'Another related-entity field' },
];

const MATCH_TYPE_OPTIONS: { value: LookupMatchType; label: string }[] = [
  { value: 'case_insensitive_exact', label: 'Case-insensitive exact' },
  { value: 'exact', label: 'Exact match' },
];

const NOT_FOUND_OPTIONS: { value: LookupNotFoundBehavior; label: string }[] = [
  { value: 'reject', label: 'Reject request' },
  { value: 'set_null', label: 'Set to null (when optional)' },
  { value: 'create', label: 'Create related record' },
];

export default function InboundMapping({
  fields, config, operation, lookupCache, lookupLoading, onLoadLookup, onChange, onTestLookup,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const usedColumns = useMemo(
    () => new Set(config.fields.map((f) => f.target_physical_column ?? '').filter(Boolean)),
    [config.fields]
  );

  function patchFields(next: InboundFieldMapping[]) {
    onChange({ ...config, fields: next });
  }

  function addField(field: EntityFieldInfo) {
    const isLookup = field.field_type?.name === 'lookup' || !!field.lookup_entity;
    patchFields([...config.fields, {
      id: uuid(),
      json_path: field.logical_name,
      field_definition_id: field.field_definition_id,
      target_physical_column: field.physical_column_name,
      target_display_name: field.display_name,
      target_field_type: field.field_type?.name ?? 'text',
      is_required: field.is_required,
      is_lookup: isLookup,
      lookup_match_by: isLookup ? 'id' : undefined,
      lookup_entity_id: field.lookup_entity?.entity_definition_id,
      lookup_entity_physical_table: field.lookup_entity?.physical_table_name,
      lookup_entity_pk: field.lookup_entity ? `${field.lookup_entity.logical_name}_id` : undefined,
      lookup_entity_primary_field: field.lookup_entity?.primary_field_name,
      lookup_entity_display_name: field.lookup_entity?.display_name,
      lookup_match_type: isLookup ? 'case_insensitive_exact' : undefined,
      lookup_not_found_behavior: isLookup ? 'reject' : undefined,
      lookup_multiple_match_behavior: isLookup ? 'reject' : undefined,
    }]);
    setPickerOpen(false);
  }

  function update(id: string, p: Partial<InboundFieldMapping>) {
    patchFields(config.fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  }
  function remove(id: string) {
    const removed = config.fields.find((f) => f.id === id);
    const next = config.fields.filter((f) => f.id !== id);
    // clear match_field if it pointed at the removed column
    const matchField =
      removed && config.match_field === removed.target_physical_column ? null : config.match_field;
    onChange({ ...config, fields: next, match_field: matchField });
  }

  const needsMatch = operation === 'update' || operation === 'upsert';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-xs text-slate-500">
          Map incoming JSON properties to fields on the selected entity.
        </p>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-300 bg-blue-50 rounded-lg px-2.5 py-1.5 hover:bg-blue-100 transition-colors"
        >
          <Plus size={12} /> Add Field
        </button>
      </div>

      {needsMatch && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700 mb-3">
          <Info size={13} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-medium">Match field for {operation}: </span>
            <FilterSelect
              className="ml-1 border border-amber-200 rounded px-2 py-1 text-xs bg-white"
              value={config.match_field ?? ''}
              onChange={(e) => onChange({ ...config, match_field: e.target.value || null })}
            >
              <option value="">— select —</option>
              {config.fields
                .filter((f) => f.target_physical_column)
                .map((f) => (
                  <option key={f.id} value={f.target_physical_column}>
                    {f.target_display_name} ({f.target_physical_column})
                  </option>
                ))}
            </FilterSelect>
            <span className="block mt-1 text-amber-600">
              Used to locate the existing record. Map this property in the rows below.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(240px,320px)] gap-4 items-start">
        {/* Mapping table */}
        <div>
          {config.fields.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-8 text-sm text-slate-400 border border-dashed border-gray-200 rounded-lg">
              <Code2 size={18} className="text-slate-300" />
              Use "Add Field" to map incoming properties into CRM fields.
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[1fr_16px_1fr_64px_28px] gap-2 px-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                <span>Incoming property</span>
                <span />
                <span>CRM field</span>
                <span className="text-center">Req.</span>
                <span />
              </div>
              {config.fields.map((m) => (
                <Row
                  key={m.id}
                  m={m}
                  relFields={m.lookup_entity_id ? lookupCache[m.lookup_entity_id] ?? [] : []}
                  relLoading={m.lookup_entity_id ? lookupLoading[m.lookup_entity_id] ?? false : false}
                  onLoadLookup={onLoadLookup}
                  onChange={(p) => update(m.id, p)}
                  onRemove={() => remove(m.id)}
                  onTestLookup={onTestLookup}
                />
              ))}
            </div>
          )}
        </div>

        {/* Example payload */}
        <div className="lg:sticky lg:top-2">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <Code2 size={11} /> Expected request body
          </p>
          <pre className="text-[11px] bg-[#1e2430] text-emerald-300 rounded-lg p-3.5 overflow-auto max-h-[340px] leading-relaxed">
            {buildExample(config)}
          </pre>
        </div>
      </div>

      {pickerOpen && (
        <FieldSelectorModal
          title="Map incoming property to field"
          fields={fields}
          usedColumns={usedColumns}
          onSelect={addField}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function Row({
  m, relFields, relLoading, onLoadLookup, onChange, onRemove, onTestLookup,
}: {
  m: InboundFieldMapping;
  relFields: LookupEntityField[];
  relLoading: boolean;
  onLoadLookup: (entityId: string) => void;
  onChange: (p: Partial<InboundFieldMapping>) => void;
  onRemove: () => void;
  onTestLookup: (m: InboundFieldMapping, value: string) => Promise<LookupResolutionTestResult>;
}) {
  const matchBy = m.lookup_match_by ?? 'id';
  // Match strategy only matters when comparing text (primary name / another field).
  const showMatchType = m.is_lookup && matchBy !== 'id';

  return (
    <div className="grid grid-cols-[1fr_16px_1fr_64px_28px] gap-2 items-start">
      {/* Incoming JSON path */}
      <input
        className="field-input text-xs font-mono py-1.5"
        placeholder="json.path"
        value={m.json_path}
        onChange={(e) => onChange({ json_path: e.target.value })}
      />

      <div className="flex items-center justify-center pt-2 text-slate-300">
        <ArrowRight size={13} />
      </div>

      {/* Target field + lookup resolution */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-slate-600">
          <TypeBadge type={m.target_field_type ?? 'text'} />
          <span className="truncate">{m.target_display_name ?? m.target_physical_column}</span>
        </div>

        {m.is_lookup && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-2 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-700">
              <span className="uppercase tracking-wide">Lookup → {m.lookup_entity_display_name ?? m.lookup_entity_physical_table ?? 'related entity'}</span>
            </div>

            {/* Incoming value represents */}
            <label className="block">
              <span className="block text-[10px] font-medium text-slate-500 mb-0.5">Incoming value represents</span>
              <FilterSelect
                className="field-input text-xs py-1.5"
                value={matchBy}
                onChange={(e) => {
                  const v = e.target.value as LookupMatchBy;
                  onChange({ lookup_match_by: v });
                  if (v === 'field' && m.lookup_entity_id) onLoadLookup(m.lookup_entity_id);
                }}
              >
                {MATCH_BY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </FilterSelect>
            </label>

            {/* Match field (searchable native select — type to filter) */}
            {matchBy === 'field' && (
              <label className="block">
                <span className="block text-[10px] font-medium text-slate-500 mb-0.5">Match related record using</span>
                {relLoading ? (
                  <p className="text-[11px] text-slate-400">Loading related fields…</p>
                ) : (
                  <FilterSelect
                    className="field-input text-xs py-1.5"
                    value={m.lookup_match_field_physical_column ?? ''}
                    onChange={(e) => {
                      const chosen = relFields.find((f) => f.physical_column_name === e.target.value);
                      onChange({
                        lookup_match_field_physical_column: e.target.value,
                        lookup_match_field_display_name: chosen?.display_name,
                      });
                    }}
                  >
                    <option value="">— select a field —</option>
                    {relFields.map((f) => (
                      <option key={f.field_definition_id} value={f.physical_column_name}>
                        {f.display_name} ({f.physical_column_name})
                      </option>
                    ))}
                  </FilterSelect>
                )}
              </label>
            )}

            {/* Match behaviour */}
            {showMatchType && (
              <label className="block">
                <span className="block text-[10px] font-medium text-slate-500 mb-0.5">Match behaviour</span>
                <FilterSelect
                  className="field-input text-xs py-1.5"
                  value={m.lookup_match_type ?? 'case_insensitive_exact'}
                  onChange={(e) => onChange({ lookup_match_type: e.target.value as LookupMatchType })}
                >
                  {MATCH_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </FilterSelect>
              </label>
            )}

            {/* Not-found behaviour */}
            <label className="block">
              <span className="block text-[10px] font-medium text-slate-500 mb-0.5">If no record is found</span>
              <FilterSelect
                className="field-input text-xs py-1.5"
                value={m.lookup_not_found_behavior ?? 'reject'}
                onChange={(e) => onChange({ lookup_not_found_behavior: e.target.value as LookupNotFoundBehavior })}
              >
                {NOT_FOUND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </FilterSelect>
            </label>

            {/* Multiple-match behaviour (fixed: reject as ambiguous) */}
            <p className="flex items-center gap-1 text-[10px] text-slate-500">
              <AlertTriangle size={10} className="text-amber-500 shrink-0" />
              Multiple matches are rejected as ambiguous.
            </p>

            {/* Test Mapping */}
            {matchBy !== 'id' && <LookupTester m={m} onTestLookup={onTestLookup} />}
          </div>
        )}
      </div>

      {/* Required */}
      <div className="flex justify-center pt-2">
        <input
          type="checkbox"
          checked={m.is_required ?? false}
          onChange={(e) => onChange({ is_required: e.target.checked })}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
          title="Reject the request if this property is missing"
        />
      </div>

      <button
        onClick={onRemove}
        className="flex items-center justify-center h-[34px] rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// Inline "Test Mapping" — enter a sample value, see the matched record (name + GUID).
function LookupTester({
  m, onTestLookup,
}: {
  m: InboundFieldMapping;
  onTestLookup: (m: InboundFieldMapping, value: string) => Promise<LookupResolutionTestResult>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookupResolutionTestResult | null>(null);

  const canTest =
    !!m.lookup_entity_physical_table &&
    (m.lookup_match_by === 'primary_name' || (m.lookup_match_by === 'field' && !!m.lookup_match_field_physical_column));

  async function run() {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      setResult(await onTestLookup(m, value));
    } catch (e) {
      setResult({ status: 'error', matches: [], message: e instanceof Error ? e.message : 'Test failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-1.5 border-t border-violet-200/70 space-y-1.5">
      <div className="flex items-center gap-1">
        <input
          className="field-input text-xs py-1.5 flex-1"
          placeholder="Sample value e.g. LB"
          value={value}
          disabled={!canTest}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
        />
        <button
          type="button"
          onClick={run}
          disabled={!canTest || !value.trim() || busy}
          title={canTest ? 'Test this mapping' : 'Choose a match field first'}
          className="flex items-center gap-1 text-[11px] font-medium text-violet-700 border border-violet-300 bg-white rounded-lg px-2 py-1.5 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <FlaskConical size={11} />} Test
        </button>
      </div>

      {result && <TestResult result={result} />}
    </div>
  );
}

function TestResult({ result }: { result: LookupResolutionTestResult }) {
  if (result.status === 'found') {
    const r = result.matches[0];
    return (
      <div className="flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
        <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-medium truncate">{r.label}</p>
          <p className="font-mono text-[10px] text-emerald-600/80 truncate">{r.id}</p>
        </div>
      </div>
    );
  }
  if (result.status === 'not_found') {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
        <XCircle size={12} className="shrink-0" /> No matching record found.
      </div>
    );
  }
  if (result.status === 'ambiguous') {
    return (
      <div className="flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
        <span>Ambiguous — {result.matches.length}+ records match. The request would be rejected.</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5">
      <XCircle size={12} className="shrink-0" /> {result.message ?? 'Could not run the test.'}
    </div>
  );
}

function buildExample(config: InboundConfig): string {
  const out: Record<string, unknown> = {};
  for (const f of config.fields) {
    if (!f.json_path) continue;
    let sample: unknown = 'string';
    switch (f.target_field_type) {
      case 'number': case 'integer': case 'decimal': case 'money': sample = 0; break;
      case 'boolean': sample = true; break;
      case 'datetime': case 'date': sample = '2026-01-01T00:00:00Z'; break;
    }
    if (f.is_lookup) {
      if (f.lookup_match_by === 'primary_name') sample = 'related record name';
      else if (f.lookup_match_by === 'field') sample = f.lookup_match_field_display_name ? `${f.lookup_match_field_display_name} value` : 'related field value';
      else sample = 'related-record-guid';
    }
    setNested(out, f.json_path, sample);
  }
  return JSON.stringify(out, null, 2);
}

function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}
