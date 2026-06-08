import { useState, useMemo } from 'react';
import {
  Search, Type, Hash, Calendar, ToggleLeft, Mail, Phone, Globe, Link,
  List, AlignLeft, DollarSign, Clock, File, Image, Table2, Minus, Space,
  Tag, ChevronDown, ChevronRight, Plus, CheckCircle2, AlertCircle,
} from 'lucide-react';
import type { FieldDefinition } from '../../types/field';
import type { EntityDefinition } from '../../types/entity';
import type { DesignerControl } from '../../types/form';
import { uid } from './designerStore';

export const DRAG_TYPE = 'application/x-form-field';

export const FIELD_TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <Type size={13} />,
  textarea: <AlignLeft size={13} />,
  number: <Hash size={13} />,
  decimal: <Hash size={13} />,
  currency: <DollarSign size={13} />,
  boolean: <ToggleLeft size={13} />,
  date: <Calendar size={13} />,
  datetime: <Calendar size={13} />,
  time: <Clock size={13} />,
  email: <Mail size={13} />,
  phone: <Phone size={13} />,
  url: <Globe size={13} />,
  lookup: <Link size={13} />,
  choice: <List size={13} />,
  multi_choice: <List size={13} />,
  option_set: <List size={13} />,
  multi_option_set: <List size={13} />,
  file: <File size={13} />,
  image: <Image size={13} />,
  autonumber: <Hash size={13} />,
};

import { LayoutGrid } from 'lucide-react';

const LAYOUT_COMPONENTS = [
  { id: 'section',   label: 'Section',   icon: <Table2 size={13} />,      hint: 'Group fields into a section' },
  { id: 'subgrid',   label: 'Subgrid',   icon: <LayoutGrid size={13} />,  hint: 'Display related records' },
  { id: 'timeline',  label: 'Timeline',  icon: <Clock size={13} />,       hint: 'Activity timeline (notes, appointments, emails, attachments)' },
  { id: 'spacer',    label: 'Spacer',    icon: <Space size={13} />,       hint: 'Empty placeholder cell' },
  { id: 'separator', label: 'Separator', icon: <Minus size={13} />,       hint: 'Horizontal divider line' },
  { id: 'label',     label: 'Label',     icon: <Tag size={13} />,         hint: 'Static text label' },
];

export function fieldToControl(field: FieldDefinition): DesignerControl {
  return {
    id: uid(),
    control_type: 'field',
    field_definition_id: field.field_definition_id,
    field_logical_name: field.logical_name,
    field_display_name: field.display_name,
    field_type_name: field.field_type?.name ?? null,
    label_override: null,
    column_span: 1,
    is_visible: true,
    is_readonly: false,
    is_required_override: field.is_required,
    subgrid_config: null,
  };
}

interface ComponentLibraryProps {
  fields: FieldDefinition[];
  entities: EntityDefinition[];
  activeTabId: string;
  activeSectionId: string;
  onAddControl: (tabId: string, sectionId: string, control: DesignerControl) => void;
  onAddTab: () => void;
  onAddSection: (tabId: string) => void;
  layoutTabId: string;
  fieldsInForm: Set<string>;
  onNewColumn: () => void;
  onAddSubgrid: () => void;
}

export default function ComponentLibrary({
  fields,
  activeTabId,
  activeSectionId,
  onAddControl,
  onAddTab,
  onAddSection,
  layoutTabId,
  fieldsInForm,
  onNewColumn,
  onAddSubgrid,
}: ComponentLibraryProps) {
  const [search, setSearch] = useState('');
  const [onFormExpanded, setOnFormExpanded] = useState(false);
  const [notOnFormExpanded, setNotOnFormExpanded] = useState(true);
  const [layoutExpanded, setLayoutExpanded] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return fields.filter(
      (f) =>
        f.display_name.toLowerCase().includes(q) ||
        f.logical_name.toLowerCase().includes(q)
    );
  }, [fields, search]);

  const onForm = filtered.filter((f) => fieldsInForm.has(f.field_definition_id));
  const notOnForm = filtered.filter((f) => !fieldsInForm.has(f.field_definition_id));

  const handleAddField = (field: FieldDefinition) => {
    if (!activeTabId || !activeSectionId) return;
    onAddControl(activeTabId, activeSectionId, fieldToControl(field));
  };

  const handleLayoutAction = (componentId: string) => {
    if (componentId === 'tab') {
      onAddTab();
    } else if (componentId === 'section') {
      if (activeTabId) onAddSection(activeTabId);
    } else if (componentId === 'subgrid') {
      if (activeTabId && activeSectionId) onAddSubgrid();
    } else if (componentId === 'timeline') {
      if (!activeTabId || !activeSectionId) return;
      const control: DesignerControl = {
        id: uid(),
        control_type: 'timeline',
        field_definition_id: null,
        field_logical_name: null,
        field_display_name: 'Timeline',
        field_type_name: null,
        label_override: null,
        column_span: 2,
        is_visible: true,
        is_readonly: false,
        is_required_override: false,
        subgrid_config: null,
      };
      onAddControl(activeTabId, activeSectionId, control);
    } else if (componentId === 'spacer' || componentId === 'separator' || componentId === 'label') {
      if (!activeTabId || !activeSectionId) return;
      const control: DesignerControl = {
        id: uid(),
        control_type: componentId as DesignerControl['control_type'],
        field_definition_id: null,
        field_logical_name: null,
        field_display_name: componentId === 'label' ? 'Label Text' : null,
        field_type_name: null,
        label_override: componentId === 'label' ? 'Label Text' : null,
        column_span: 1,
        is_visible: true,
        is_readonly: false,
        is_required_override: false,
        subgrid_config: null,
      };
      onAddControl(activeTabId, activeSectionId, control);
    }
  };

  const canAdd = !!activeTabId && !!activeSectionId;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Columns</p>
          <button
            onClick={onNewColumn}
            title="Create a new column for this entity"
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <Plus size={11} />
            New
          </button>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search columns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Columns not yet on form */}
        <GroupHeader
          label="Available"
          count={notOnForm.length}
          expanded={notOnFormExpanded}
          onToggle={() => setNotOnFormExpanded(!notOnFormExpanded)}
          accent="blue"
        />
        {notOnFormExpanded && (
          <div className="pb-1">
            {notOnForm.length === 0 ? (
              <p className="text-[11px] text-slate-400 px-3 py-2 italic">
                {search ? 'No matches' : 'All columns are on the form'}
              </p>
            ) : (
              notOnForm.map((field) => (
                <FieldRow
                  key={field.field_definition_id}
                  field={field}
                  canAdd={canAdd}
                  onAdd={handleAddField}
                  activeTabId={activeTabId}
                  activeSectionId={activeSectionId}
                />
              ))
            )}
          </div>
        )}

        {/* Columns already on form */}
        <GroupHeader
          label="On Form"
          count={onForm.length}
          expanded={onFormExpanded}
          onToggle={() => setOnFormExpanded(!onFormExpanded)}
          accent="green"
        />
        {onFormExpanded && (
          <div className="pb-1">
            {onForm.length === 0 ? (
              <p className="text-[11px] text-slate-400 px-3 py-2 italic">None yet</p>
            ) : (
              onForm.map((field) => (
                <FieldRow
                  key={field.field_definition_id}
                  field={field}
                  canAdd={canAdd}
                  onAdd={handleAddField}
                  onForm
                  activeTabId={activeTabId}
                  activeSectionId={activeSectionId}
                />
              ))
            )}
          </div>
        )}

        {/* Layout elements */}
        <GroupHeader
          label="Layout"
          count={LAYOUT_COMPONENTS.length}
          expanded={layoutExpanded}
          onToggle={() => setLayoutExpanded(!layoutExpanded)}
          accent="slate"
        />
        {layoutExpanded && (
          <div className="pb-1">
            <button
              onClick={onAddTab}
              title="Add a new tab"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors text-left group"
            >
              <span className="text-slate-400 group-hover:text-slate-600 shrink-0"><Tag size={13} /></span>
              <span className="font-medium">Tab</span>
            </button>
            {LAYOUT_COMPONENTS.map((comp) => {
              const needsSection = comp.id === 'subgrid' || comp.id === 'spacer' || comp.id === 'separator' || comp.id === 'label' || comp.id === 'timeline';
              const disabled = needsSection ? !canAdd : (comp.id !== 'tab' && !layoutTabId);
              return (
                <button
                  key={comp.id}
                  onClick={() => handleLayoutAction(comp.id)}
                  disabled={disabled}
                  title={disabled ? 'Select a section first' : comp.hint}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left group ${
                    comp.id === 'subgrid' || comp.id === 'timeline' ? 'hover:text-blue-700 hover:bg-blue-50' : ''
                  }`}
                >
                  <span className={`shrink-0 ${comp.id === 'subgrid' || comp.id === 'timeline' ? 'text-blue-500 group-hover:text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}>{comp.icon}</span>
                  <span className="font-medium">{comp.label}</span>
                  {(comp.id === 'subgrid' || comp.id === 'timeline') && (
                    <span className="ml-auto text-[9px] font-bold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Add</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!canAdd && (
        <div className="px-3 py-2 border-t border-slate-100 bg-amber-50 shrink-0">
          <p className="text-[10px] text-amber-600 leading-relaxed">
            Click a section on the canvas to start adding columns
          </p>
        </div>
      )}
    </div>
  );
}

function GroupHeader({
  label, count, expanded, onToggle, accent,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  accent: 'blue' | 'green' | 'slate';
}) {
  const countColor = accent === 'blue' ? 'bg-blue-100 text-blue-700' : accent === 'green' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500';
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-colors border-t border-slate-100"
    >
      {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      <span className="flex-1 text-left">{label}</span>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${countColor}`}>{count}</span>
    </button>
  );
}

function FieldRow({
  field, canAdd, onAdd, onForm, activeTabId, activeSectionId,
}: {
  field: FieldDefinition;
  canAdd: boolean;
  onAdd: (f: FieldDefinition) => void;
  onForm?: boolean;
  activeTabId: string;
  activeSectionId: string;
}) {
  const icon = FIELD_TYPE_ICONS[field.field_type?.name ?? ''] ?? <AlertCircle size={13} />;
  const typeName = field.field_type?.name ?? '';

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({
      fieldId: field.field_definition_id,
      logical_name: field.logical_name,
      display_name: field.display_name,
      type_name: typeName,
      is_required: field.is_required,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      title={canAdd ? `Drag or click to add "${field.display_name}"` : 'Select a section first'}
      className={`group w-full flex items-center gap-2.5 px-3 py-2 cursor-grab active:cursor-grabbing transition-colors select-none ${
        onForm ? 'hover:bg-slate-50' : 'hover:bg-blue-50'
      }`}
    >
      <span className={`shrink-0 ${onForm ? 'text-emerald-500' : 'text-slate-400 group-hover:text-blue-500'}`}>
        {onForm ? <CheckCircle2 size={13} /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-medium truncate ${onForm ? 'text-slate-400' : 'text-slate-700'}`}>
          {field.display_name}
        </p>
        <p className="text-[10px] text-slate-400 truncate font-mono">{field.logical_name}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {field.is_required && (
          <span className="text-red-400 text-[9px] font-bold">REQ</span>
        )}
        {field.is_custom && (
          <span className="text-[9px] text-violet-500 font-semibold">CUSTOM</span>
        )}
        {canAdd && !onForm && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(field); }}
            title={`Add to form`}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-blue-400 hover:text-blue-700 hover:bg-blue-100 rounded transition-all"
          >
            <Plus size={12} />
          </button>
        )}
        {canAdd && onForm && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(field); }}
            title="Add another instance"
            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-blue-700 hover:bg-blue-100 rounded transition-all"
          >
            <Plus size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
