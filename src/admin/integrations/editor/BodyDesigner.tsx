import FilterSelect from '../../../app/components/FilterSelect';
import { useMemo, useState } from 'react';
import {
  Plus, Trash2, GripVertical, Braces, Brackets, Type, AlertTriangle, Code2,
} from 'lucide-react';
import type {
  BodyConfig,
  BodyFieldMapping,
  EntityFieldInfo,
  LookupEntityField,
  LookupValueType,
} from '../../../types/apiIntegration';
import FieldSelectorModal, { TypeBadge } from './FieldSelectorModal';

interface Props {
  entityLogical: string;
  fields: EntityFieldInfo[];
  config: BodyConfig;
  lookupCache: Record<string, LookupEntityField[]>;
  lookupLoading: Record<string, boolean>;
  onLoadLookup: (entityId: string) => void;
  onChange: (config: BodyConfig) => void;
}

const LOOKUP_VALUE_OPTIONS: { value: LookupValueType; label: string }[] = [
  { value: 'id', label: 'Related record GUID' },
  { value: 'primary_name', label: 'Related primary name' },
  { value: 'field', label: 'Another related field…' },
];

export default function BodyDesigner({
  entityLogical,
  fields,
  config,
  lookupCache,
  lookupLoading,
  onLoadLookup,
  onChange,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const usedColumns = useMemo(
    () => new Set(config.fields.map((f) => f.field_physical_column ?? '').filter(Boolean)),
    [config.fields]
  );

  // Duplicate JSON-key detection
  const dupKeys = useMemo(() => {
    const seen = new Map<string, number>();
    config.fields.forEach((f) => seen.set(f.json_key, (seen.get(f.json_key) ?? 0) + 1));
    return new Set([...seen.entries()].filter(([k, n]) => k && n > 1).map(([k]) => k));
  }, [config.fields]);

  function patch(fields: BodyFieldMapping[]) {
    onChange({ ...config, fields });
  }

  function addField(field: EntityFieldInfo) {
    const isLookup = field.field_type?.name === 'lookup' || !!field.lookup_entity;
    const mapping: BodyFieldMapping = {
      id: crypto.randomUUID(),
      json_key: field.logical_name,
      value_type: 'field',
      field_definition_id: field.field_definition_id,
      field_physical_column: field.physical_column_name,
      field_display_name: field.display_name,
      field_type_name: field.field_type?.name ?? 'text',
      is_lookup: isLookup,
      lookup_value_type: isLookup ? 'id' : undefined,
      lookup_entity_id: field.lookup_entity?.entity_definition_id,
      lookup_entity_physical_table: field.lookup_entity?.physical_table_name,
      lookup_entity_pk: field.lookup_entity ? `${field.lookup_entity.logical_name}_id` : undefined,
      lookup_entity_primary_field: field.lookup_entity?.primary_field_name,
      is_required: false,
    };
    patch([...config.fields, mapping]);
    setPickerOpen(false);
  }

  function addStatic() {
    patch([...config.fields, {
      id: crypto.randomUUID(), json_key: 'value', value_type: 'static', static_value: '', is_required: false,
    }]);
  }

  function addRaw(kind: 'object' | 'array') {
    patch([...config.fields, {
      id: crypto.randomUUID(),
      json_key: kind === 'object' ? 'data' : 'items',
      value_type: 'raw',
      static_value: kind === 'object' ? '{\n  \n}' : '[\n  \n]',
      is_required: false,
    }]);
  }

  function update(id: string, p: Partial<BodyFieldMapping>) {
    patch(config.fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  }
  function remove(id: string) {
    patch(config.fields.filter((f) => f.id !== id));
  }

  function reorder(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const arr = [...config.fields];
    const from = arr.findIndex((f) => f.id === dragId);
    const to = arr.findIndex((f) => f.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    patch(arr);
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={config.exclude_null_fields}
            onChange={(e) => onChange({ ...config, exclude_null_fields: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
          />
          <span className="text-xs text-gray-700">Exclude null / empty optional fields</span>
        </label>
        <div className="flex items-center gap-1.5">
          <ToolbarBtn onClick={() => setPickerOpen(true)} icon={Plus} label="Add Field" primary />
          <ToolbarBtn onClick={addStatic} icon={Type} label="Static" />
          <ToolbarBtn onClick={() => addRaw('object')} icon={Braces} label="Object" />
          <ToolbarBtn onClick={() => addRaw('array')} icon={Brackets} label="Array" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(260px,360px)] gap-4 items-start">
        {/* Mapping table */}
        <div>
          {config.fields.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-8 text-sm text-slate-400 border border-dashed border-gray-200 rounded-lg">
              <Code2 size={18} className="text-slate-300" />
              Use the buttons above to map fields into the request body.
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[20px_minmax(110px,150px)_1fr_64px_28px] gap-2 px-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                <span />
                <span>JSON Key</span>
                <span>Source / Value to Send</span>
                <span className="text-center">Req.</span>
                <span />
              </div>
              {config.fields.map((m) => (
                <Row
                  key={m.id}
                  m={m}
                  isDup={dupKeys.has(m.json_key)}
                  relFields={m.lookup_entity_id ? lookupCache[m.lookup_entity_id] ?? [] : []}
                  relLoading={m.lookup_entity_id ? lookupLoading[m.lookup_entity_id] ?? false : false}
                  onLoadLookup={onLoadLookup}
                  onChange={(p) => update(m.id, p)}
                  onRemove={() => remove(m.id)}
                  onDragStart={() => setDragId(m.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragEnterRow={() => reorder(m.id)}
                  dragging={dragId === m.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-2">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <Code2 size={11} /> Live JSON Preview
          </p>
          <pre className="text-[11px] bg-[#1e2430] text-emerald-300 rounded-lg p-3.5 overflow-auto max-h-[340px] leading-relaxed">
            {buildPreview(config, entityLogical)}
          </pre>
        </div>
      </div>

      {pickerOpen && (
        <FieldSelectorModal
          title="Add field to request body"
          fields={fields}
          usedColumns={usedColumns}
          onSelect={addField}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function ToolbarBtn({
  onClick, icon: Icon, label, primary,
}: { onClick: () => void; icon: typeof Plus; label: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors border ${
        primary
          ? 'text-blue-600 border-blue-300 bg-blue-50 hover:bg-blue-100'
          : 'text-slate-600 border-gray-200 hover:bg-gray-50'
      }`}
    >
      <Icon size={12} /> {label}
    </button>
  );
}

function Row({
  m, isDup, relFields, relLoading, onLoadLookup, onChange, onRemove,
  onDragStart, onDragEnd, onDragEnterRow, dragging,
}: {
  m: BodyFieldMapping;
  isDup: boolean;
  relFields: LookupEntityField[];
  relLoading: boolean;
  onLoadLookup: (entityId: string) => void;
  onChange: (p: Partial<BodyFieldMapping>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnterRow: () => void;
  dragging: boolean;
}) {
  const rawInvalid = m.value_type === 'raw' && !isValidJson(m.static_value ?? '');

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragEnterRow(); }}
      className={`rounded-lg border ${dragging ? 'opacity-50 border-blue-300' : 'border-transparent'}`}
    >
      <div className="grid grid-cols-[20px_minmax(110px,150px)_1fr_64px_28px] gap-2 items-start">
        {/* Drag handle */}
        <button
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="flex items-center justify-center h-[34px] text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical size={13} />
        </button>

        {/* JSON key */}
        <div>
          <input
            className={`field-input text-xs font-mono py-1.5 ${isDup ? 'border-red-300 ring-1 ring-red-200' : ''}`}
            placeholder="json.key"
            value={m.json_key}
            onChange={(e) => onChange({ json_key: e.target.value })}
          />
          {isDup && (
            <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1">
              <AlertTriangle size={9} /> Duplicate key
            </p>
          )}
        </div>

        {/* Source / value */}
        <div className="space-y-1.5">
          {m.value_type === 'static' && (
            <input
              className="field-input text-xs py-1.5"
              placeholder="Static value"
              value={m.static_value ?? ''}
              onChange={(e) => onChange({ static_value: e.target.value })}
            />
          )}

          {m.value_type === 'raw' && (
            <div>
              <textarea
                className={`field-input text-xs font-mono py-1.5 resize-y ${rawInvalid ? 'border-red-300 ring-1 ring-red-200' : ''}`}
                rows={3}
                placeholder='{ "key": "value" }'
                value={m.static_value ?? ''}
                onChange={(e) => onChange({ static_value: e.target.value })}
              />
              {rawInvalid && (
                <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1">
                  <AlertTriangle size={9} /> Invalid JSON
                </p>
              )}
            </div>
          )}

          {m.value_type === 'field' && (
            <>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-slate-600">
                <TypeBadge type={m.field_type_name ?? 'text'} />
                <span className="truncate">{m.field_display_name ?? m.field_physical_column}</span>
              </div>
              {m.is_lookup && (
                <FilterSelect
                  className="field-input text-xs py-1.5"
                  value={m.lookup_value_type ?? 'id'}
                  onChange={(e) => {
                    const v = e.target.value as LookupValueType;
                    onChange({ lookup_value_type: v });
                    if (v === 'field' && m.lookup_entity_id) onLoadLookup(m.lookup_entity_id);
                  }}
                >
                  {LOOKUP_VALUE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </FilterSelect>
              )}
              {m.is_lookup && m.lookup_value_type === 'field' && (
                relLoading ? (
                  <p className="text-[11px] text-slate-400">Loading related fields…</p>
                ) : (
                  <FilterSelect
                    className="field-input text-xs py-1.5"
                    value={m.lookup_field_physical_column ?? ''}
                    onChange={(e) => {
                      const chosen = relFields.find((f) => f.physical_column_name === e.target.value);
                      onChange({
                        lookup_field_physical_column: e.target.value,
                        lookup_field_display_name: chosen?.display_name,
                      });
                    }}
                  >
                    <option value="">— choose related field —</option>
                    {relFields.map((f) => (
                      <option key={f.field_definition_id} value={f.physical_column_name}>
                        {f.display_name} ({f.physical_column_name})
                      </option>
                    ))}
                  </FilterSelect>
                )
              )}
            </>
          )}
        </div>

        {/* Required */}
        <div className="flex justify-center pt-2">
          <input
            type="checkbox"
            checked={m.is_required ?? false}
            onChange={(e) => onChange({ is_required: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
            title="Always include, even when empty"
          />
        </div>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="flex items-center justify-center h-[34px] rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Preview + utils ─────────────────────────────────────────────────────────

function buildPreview(config: BodyConfig, entityLogical: string): string {
  const e = entityLogical || 'record';
  const out: Record<string, unknown> = {};
  for (const f of config.fields) {
    let val: unknown;
    if (f.value_type === 'static') {
      val = f.static_value ?? '';
    } else if (f.value_type === 'raw') {
      val = isValidJson(f.static_value ?? '') ? JSON.parse(f.static_value as string) : '«invalid JSON»';
    } else if (f.is_lookup) {
      switch (f.lookup_value_type) {
        case 'primary_name':
          val = `{{${e}.${f.field_physical_column}.${f.lookup_entity_primary_field ?? 'name'}}}`;
          break;
        case 'field':
          val = `{{${e}.${f.field_physical_column}.${f.lookup_field_physical_column ?? 'field'}}}`;
          break;
        default:
          val = `{{${e}.${f.field_physical_column}.id}}`;
      }
    } else {
      val = `{{${e}.${f.field_physical_column ?? f.json_key}}}`;
    }
    setNested(out, f.json_key, val);
  }
  return JSON.stringify(out, null, 2);
}

function isValidJson(s: string): boolean {
  if (!s.trim()) return false;
  try { JSON.parse(s); return true; } catch { return false; }
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
