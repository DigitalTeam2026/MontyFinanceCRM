import type { FieldDefinition } from '../../types/field';
import type { DesignerLayout, DesignerTab, DesignerSection, DesignerControl } from '../../types/form';

interface TabLayout {
  id: string;
  label: string;
  sections: SectionLayout[];
}

interface SectionLayout {
  id: string;
  label: string;
  columns: 1 | 2;
  controls: ControlLayout[];
}

interface ControlLayout {
  id: string;
  fieldLogicalName: string | null;
  fieldDisplayName: string | null;
  fieldTypeName: string | null;
  fieldDefinitionId: string | null;
  columnSpan: 1 | 2;
  isReadonly: boolean;
  isRequired: boolean;
  isVisible: boolean;
  controlType: string;
}

export type { TabLayout, SectionLayout, ControlLayout };

const SYSTEM_FIELDS = new Set(['createdon', 'modifiedon', 'createdby', 'modifiedby']);

function fieldTypeName(field: FieldDefinition): string {
  return field.field_type?.name ?? 'text';
}

function ctrl(field: FieldDefinition, span: 1 | 2 = 1): ControlLayout {
  return {
    id: field.field_definition_id,
    fieldLogicalName: field.logical_name,
    fieldDisplayName: field.display_name,
    fieldTypeName: fieldTypeName(field),
    fieldDefinitionId: field.field_definition_id,
    columnSpan: fieldTypeName(field) === 'textarea' ? 2 : span,
    isReadonly: SYSTEM_FIELDS.has(field.logical_name),
    isRequired: field.is_required,
    isVisible: true,
    controlType: 'field',
  };
}

function buildAutoLayout(fields: FieldDefinition[]): TabLayout[] {
  const visible = fields.filter((f) => f.is_active && !f.deleted_at);
  const systemFields = visible.filter((f) => SYSTEM_FIELDS.has(f.logical_name));
  const mainFields = visible.filter((f) => !SYSTEM_FIELDS.has(f.logical_name));

  const generalFields = mainFields.filter((f) => !['description', 'notes'].includes(f.logical_name));
  const descField = mainFields.find((f) => ['description', 'notes'].includes(f.logical_name));

  const generalSection: SectionLayout = {
    id: 'general',
    label: 'General Information',
    columns: 2,
    controls: generalFields.map((f) => ctrl(f)),
  };
  if (descField) {
    generalSection.controls.push(ctrl(descField, 2));
  }

  const adminSection: SectionLayout = {
    id: 'admin',
    label: 'System Information',
    columns: 2,
    controls: systemFields.map((f) => ctrl(f)),
  };

  const tabs: TabLayout[] = [
    {
      id: 'general',
      label: 'General',
      sections: [generalSection, ...(systemFields.length > 0 ? [adminSection] : [])],
    },
  ];

  return tabs;
}

function fromDesignerLayout(layout: DesignerLayout, fields: FieldDefinition[]): TabLayout[] {
  const fieldMap = new Map(fields.map((f) => [f.field_definition_id, f]));

  return layout.tabs.filter((t: DesignerTab) => t.is_visible !== false).map((tab: DesignerTab) => ({
    id: tab.id,
    label: tab.label,
    sections: tab.sections
      .filter((s: DesignerSection) => s.is_visible !== false)
      .map((section: DesignerSection) => ({
        id: section.id,
        label: section.label,
        columns: section.columns,
        controls: section.controls
          .filter((c: DesignerControl) => c.is_visible !== false && c.control_type === 'field')
          .map((c: DesignerControl) => {
            const field = c.field_definition_id ? fieldMap.get(c.field_definition_id) : null;
            return {
              id: c.id,
              fieldLogicalName: c.field_logical_name ?? field?.logical_name ?? null,
              fieldDisplayName: c.label_override ?? c.field_display_name ?? field?.display_name ?? null,
              fieldTypeName: c.field_type_name ?? (field ? fieldTypeName(field) : 'text'),
              fieldDefinitionId: c.field_definition_id,
              columnSpan: c.column_span,
              isReadonly: c.is_readonly || SYSTEM_FIELDS.has(c.field_logical_name ?? ''),
              isRequired: c.is_required_override || (field?.is_required ?? false),
              isVisible: c.is_visible,
              controlType: c.control_type,
            } as ControlLayout;
          }),
      })),
  }));
}

export function buildLayout(
  fields: FieldDefinition[],
  designerLayout?: DesignerLayout | null
): TabLayout[] {
  if (designerLayout?.tabs?.length) {
    return fromDesignerLayout(designerLayout, fields);
  }
  return buildAutoLayout(fields);
}
