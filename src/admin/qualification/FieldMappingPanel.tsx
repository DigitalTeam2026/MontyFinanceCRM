import { Plus, Trash2, AlertCircle } from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import type { LeadQualificationFieldMapping, TargetEntity } from '../../types/leadQualification';
import { TARGET_ENTITY_LABELS } from '../../types/leadQualification';

export interface FieldOption {
  logical_name: string;
  display_name: string;
}

interface FieldMappingPanelProps {
  targetEntity: TargetEntity;
  mappings: LeadQualificationFieldMapping[];
  onChange: (mappings: LeadQualificationFieldMapping[]) => void;
  leadFields: FieldOption[];
  targetFields: FieldOption[];
  disabled?: boolean;
}

export default function FieldMappingPanel({ targetEntity, mappings, onChange, leadFields, targetFields, disabled }: FieldMappingPanelProps) {
  const entityMappings = mappings.filter((m) => m.target_entity === targetEntity);
  const otherMappings = mappings.filter((m) => m.target_entity !== targetEntity);

  const addRow = () => {
    const newRow: LeadQualificationFieldMapping = {
      lead_qualification_field_mapping_id: `new-${Date.now()}`,
      lead_qualification_rule_id: '',
      target_entity: targetEntity,
      lead_field: '',
      target_field: '',
      is_required: false,
      transform: null,
      display_order: entityMappings.length,
      created_at: new Date().toISOString(),
    };
    onChange([...otherMappings, ...entityMappings, newRow]);
  };

  const updateRow = (id: string, patch: Partial<LeadQualificationFieldMapping>) => {
    onChange(mappings.map((m) =>
      m.lead_qualification_field_mapping_id === id ? { ...m, ...patch } : m
    ));
  };

  const removeRow = (id: string) => {
    onChange(mappings.filter((m) => m.lead_qualification_field_mapping_id !== id));
  };

  const targetLabel = TARGET_ENTITY_LABELS[targetEntity];
  const hasIncomplete = entityMappings.some((m) => !m.lead_field || !m.target_field);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">{targetLabel} Field Mappings</span>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0">{entityMappings.length}</span>
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

      {entityMappings.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
          No field mappings — {targetLabel} fields will not be populated from the Lead.
          {!disabled && <button onClick={addRow} className="block mx-auto mt-1.5 text-blue-600 hover:underline">Add first mapping</button>}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_1fr_80px_28px] gap-2 px-1 mb-0.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Lead Field</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{targetLabel} Field</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Required</span>
            <span />
          </div>
          {entityMappings.map((mapping) => (
            <MappingRow
              key={mapping.lead_qualification_field_mapping_id}
              mapping={mapping}
              leadFields={leadFields}
              targetFields={targetFields}
              disabled={disabled}
              onChange={(patch) => updateRow(mapping.lead_qualification_field_mapping_id, patch)}
              onRemove={() => removeRow(mapping.lead_qualification_field_mapping_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface MappingRowProps {
  mapping: LeadQualificationFieldMapping;
  leadFields: FieldOption[];
  targetFields: FieldOption[];
  disabled?: boolean;
  onChange: (patch: Partial<LeadQualificationFieldMapping>) => void;
  onRemove: () => void;
}

function MappingRow({ mapping, leadFields, targetFields, disabled, onChange, onRemove }: MappingRowProps) {
  const incomplete = !mapping.lead_field || !mapping.target_field;

  return (
    <div className={`grid grid-cols-[1fr_1fr_80px_28px] gap-2 items-center p-2 rounded-xl border transition-colors ${
      incomplete ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200 bg-gray-50'
    }`}>
      <SearchableSelect
        options={leadFields.map((f) => ({ value: f.logical_name, label: f.display_name }))}
        value={mapping.lead_field}
        onChange={(v) => onChange({ lead_field: v })}
        placeholder="Select lead field..."
        disabled={disabled}
        heightClass="h-8"
        className={!mapping.lead_field ? 'ring-1 ring-amber-300 rounded-lg' : ''}
      />

      <div className="flex items-center gap-1">
        <span className="text-gray-300 text-xs flex-shrink-0">&rarr;</span>
        <SearchableSelect
          options={targetFields.map((f) => ({ value: f.logical_name, label: f.display_name }))}
          value={mapping.target_field}
          onChange={(v) => onChange({ target_field: v })}
          placeholder="Select target field..."
          disabled={disabled}
          heightClass="h-8"
          className={`flex-1 ${!mapping.target_field ? 'ring-1 ring-amber-300 rounded-lg' : ''}`}
        />
      </div>

      <div className="flex items-center justify-center">
        <button
          onClick={() => !disabled && onChange({ is_required: !mapping.is_required })}
          className={`flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 transition-colors ${
            mapping.is_required
              ? 'bg-red-50 text-red-600 border border-red-200'
              : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
          } ${disabled ? 'pointer-events-none' : 'cursor-pointer'}`}
        >
          {mapping.is_required ? 'Required' : 'Optional'}
        </button>
      </div>

      <div className="flex items-center justify-center">
        {!disabled && (
          <button
            onClick={onRemove}
            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
