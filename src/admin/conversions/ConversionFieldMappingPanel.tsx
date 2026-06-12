import { Plus, Trash2, AlertCircle } from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import type { EntityConversionFieldMapping, ConversionMappingType } from '../../types/entityConversion';
import { MAPPING_TYPE_OPTIONS, MAPPING_TYPE_META } from '../../types/entityConversion';

export interface FieldOption {
  /** Physical column name — this is what gets stored in the mapping and read by the RPC */
  value: string;
  display_name: string;
}

interface Props {
  mappings: EntityConversionFieldMapping[];
  onChange: (mappings: EntityConversionFieldMapping[]) => void;
  sourceFields: FieldOption[];
  targetFields: FieldOption[];
  sourceLabel: string;
  targetLabel: string;
  disabled?: boolean;
}

export default function ConversionFieldMappingPanel({
  mappings,
  onChange,
  sourceFields,
  targetFields,
  sourceLabel,
  targetLabel,
  disabled,
}: Props) {
  const addRow = () => {
    const newRow: EntityConversionFieldMapping = {
      entity_conversion_field_mapping_id: `new-${Date.now()}`,
      entity_conversion_rule_id: '',
      source_field: '',
      target_field: '',
      mapping_type: 'direct',
      default_value: null,
      lookup_match_field: null,
      is_required: false,
      display_order: mappings.length * 10,
      created_at: new Date().toISOString(),
    };
    onChange([...mappings, newRow]);
  };

  const updateRow = (id: string, patch: Partial<EntityConversionFieldMapping>) => {
    onChange(
      mappings.map((m) =>
        m.entity_conversion_field_mapping_id === id ? { ...m, ...patch } : m,
      ),
    );
  };

  const removeRow = (id: string) => {
    onChange(mappings.filter((m) => m.entity_conversion_field_mapping_id !== id));
  };

  const hasIncomplete = mappings.some(
    (m) => m.mapping_type !== 'default_value' && (!m.source_field || !m.target_field),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">
            {sourceLabel} → {targetLabel} Field Mappings
          </span>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0">{mappings.length}</span>
          {hasIncomplete && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600">
              <AlertCircle size={10} />incomplete rows
            </span>
          )}
        </div>
        {!disabled && (
          <button
            onClick={addRow}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <Plus size={11} />Add mapping
          </button>
        )}
      </div>

      {mappings.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
          No field mappings — the {targetLabel} will be created with system fields only.
          {!disabled && (
            <button onClick={addRow} className="block mx-auto mt-1.5 text-blue-600 hover:underline">
              Add first mapping
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_1fr_110px_70px_28px] gap-2 px-1 mb-0.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{sourceLabel} Field</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{targetLabel} Field</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Type</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Required</span>
            <span />
          </div>
          {mappings.map((mapping) => (
            <MappingRow
              key={mapping.entity_conversion_field_mapping_id}
              mapping={mapping}
              sourceFields={sourceFields}
              targetFields={targetFields}
              disabled={disabled}
              onChange={(patch) => updateRow(mapping.entity_conversion_field_mapping_id, patch)}
              onRemove={() => removeRow(mapping.entity_conversion_field_mapping_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface MappingRowProps {
  mapping: EntityConversionFieldMapping;
  sourceFields: FieldOption[];
  targetFields: FieldOption[];
  disabled?: boolean;
  onChange: (patch: Partial<EntityConversionFieldMapping>) => void;
  onRemove: () => void;
}

function MappingRow({ mapping, sourceFields, targetFields, disabled, onChange, onRemove }: MappingRowProps) {
  const isDefaultValue = mapping.mapping_type === 'default_value';
  const isLookup = mapping.mapping_type === 'lookup';
  const incomplete = !isDefaultValue && (!mapping.source_field || !mapping.target_field);

  return (
    <div
      className={`rounded-xl border transition-colors p-2 ${
        incomplete ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="grid grid-cols-[1fr_1fr_110px_70px_28px] gap-2 items-center">
        {/* Source field — disabled when default_value (no source needed) */}
        {isDefaultValue ? (
          <input
            value={mapping.default_value ?? ''}
            onChange={(e) => onChange({ default_value: e.target.value })}
            placeholder="Fixed value…"
            disabled={disabled}
            className="h-8 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        ) : (
          <SearchableSelect
            options={sourceFields.map((f) => ({ value: f.value, label: f.display_name }))}
            value={mapping.source_field}
            onChange={(v) => onChange({ source_field: v })}
            placeholder="Select source field…"
            disabled={disabled}
            heightClass="h-8"
            className={!mapping.source_field ? 'ring-1 ring-amber-300 rounded-lg' : ''}
          />
        )}

        {/* Target field */}
        <div className="flex items-center gap-1">
          <span className="text-gray-300 text-xs flex-shrink-0">&rarr;</span>
          <SearchableSelect
            options={targetFields.map((f) => ({ value: f.value, label: f.display_name }))}
            value={mapping.target_field}
            onChange={(v) => onChange({ target_field: v })}
            placeholder="Select target field…"
            disabled={disabled}
            heightClass="h-8"
            className={`flex-1 ${!mapping.target_field ? 'ring-1 ring-amber-300 rounded-lg' : ''}`}
          />
        </div>

        {/* Mapping type */}
        <SearchableSelect
          options={MAPPING_TYPE_OPTIONS}
          value={mapping.mapping_type}
          onChange={(v) => onChange({ mapping_type: v as ConversionMappingType })}
          placeholder="Type"
          disabled={disabled}
          heightClass="h-8"
        />

        {/* Required toggle */}
        <div className="flex items-center justify-center">
          <button
            onClick={() => !disabled && onChange({ is_required: !mapping.is_required })}
            className={`text-[10px] font-medium rounded-full px-2 py-0.5 transition-colors ${
              mapping.is_required
                ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
            } ${disabled ? 'pointer-events-none' : 'cursor-pointer'}`}
          >
            {mapping.is_required ? 'Required' : 'Optional'}
          </button>
        </div>

        {/* Remove */}
        <div className="flex items-center justify-center">
          {!disabled && (
            <button onClick={onRemove} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Secondary row: lookup alternate-key field + type hint */}
      <div className="flex items-center gap-2 mt-1.5 pl-1">
        <span className="text-[10px] text-gray-400">{MAPPING_TYPE_META[mapping.mapping_type].description}</span>
        {isLookup && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] text-gray-400">Match on:</span>
            <input
              value={mapping.lookup_match_field ?? ''}
              onChange={(e) => onChange({ lookup_match_field: e.target.value || null })}
              placeholder="GUID (default) or iso_code / name / email"
              disabled={disabled}
              className="h-6 px-2 text-[11px] border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-56"
            />
          </div>
        )}
      </div>
    </div>
  );
}
