import { useState, useRef, useCallback } from 'react';
import {
  Plus, Trash2, EyeOff, GripVertical,
  Columns2 as Columns, LayoutGrid, Minus, Type, Hash, Calendar, ToggleLeft,
  Mail, Phone, Globe, Link, List, AlignLeft, DollarSign, Clock, File, Image,
  Tag, AlertCircle, Eye, StickyNote, Send, Paperclip,
} from 'lucide-react';
import type { DesignerControl, DesignerSection, DesignerTab, SelectionTarget } from '../../types/form';
import type { DesignerStore } from './designerStore';
import { uid } from './designerStore';
import { DRAG_TYPE } from './ComponentLibrary';

// ─── Field type icons ─────────────────────────────────────────────────────────

const FIELD_ICONS: Record<string, React.ReactNode> = {
  text: <Type size={11} />,
  textarea: <AlignLeft size={11} />,
  number: <Hash size={11} />,
  decimal: <Hash size={11} />,
  currency: <DollarSign size={11} />,
  boolean: <ToggleLeft size={11} />,
  date: <Calendar size={11} />,
  datetime: <Calendar size={11} />,
  time: <Clock size={11} />,
  email: <Mail size={11} />,
  phone: <Phone size={11} />,
  url: <Globe size={11} />,
  lookup: <Link size={11} />,
  choice: <List size={11} />,
  multi_choice: <List size={11} />,
  option_set: <List size={11} />,
  multi_option_set: <List size={11} />,
  file: <File size={11} />,
  image: <Image size={11} />,
  autonumber: <Hash size={11} />,
};

// MIME type for within-canvas drags
const CONTROL_DRAG_TYPE = 'application/x-form-control';
const SECTION_DRAG_TYPE = 'application/x-form-section';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DragState {
  controlId: string;
  fromTabId: string;
  fromSectionId: string;
  fromIndex: number;
}

// A drop target is a specific linear index in a section's controls array.
// For 2-col sections: hovering over a cell highlights that cell and insertion
// means "replace the slot at that index" by inserting before it.
interface DropTarget {
  tabId: string;
  sectionId: string;
  insertIndex: number;   // insert BEFORE this index
  cellIndex?: number;    // for 2-col: exact cell index being hovered (shows highlight)
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FormCanvasProps {
  store: DesignerStore;
  onActiveSectionChange: (tabId: string, sectionId: string) => void;
}

export default function FormCanvas({ store, onActiveSectionChange }: FormCanvasProps) {
  const {
    layout, selection, setSelection,
    addSection, updateSection,
    removeSection, removeControl,
    addControl, moveControlCrossSection,
  } = store;

  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [sectionDrop, setSectionDrop] = useState<{ sectionId: string; side: 'left' | 'right' } | null>(null);
  const dragState = useRef<DragState | null>(null);

  const activeTab = layout.tabs[activeTabIdx] ?? layout.tabs[0];

  // ── Selection ──────────────────────────────────────────────────────────────

  const isSelected = useCallback((target: SelectionTarget): boolean => {
    if (!selection || !target) return false;
    if (selection.type === 'tab' && target.type === 'tab') return selection.tabId === target.tabId;
    if (selection.type === 'section' && target.type === 'section')
      return selection.tabId === target.tabId && selection.sectionId === target.sectionId;
    if (selection.type === 'control' && target.type === 'control')
      return selection.tabId === target.tabId &&
        selection.sectionId === target.sectionId &&
        selection.controlId === target.controlId;
    return false;
  }, [selection]);

  const selectTab = (tab: DesignerTab) => setSelection({ type: 'tab', tabId: tab.id });

  const selectSection = (tab: DesignerTab, section: DesignerSection) => {
    setSelection({ type: 'section', tabId: tab.id, sectionId: section.id });
    onActiveSectionChange(tab.id, section.id);
  };

  const selectControl = (tab: DesignerTab, section: DesignerSection, control: DesignerControl) => {
    setSelection({ type: 'control', tabId: tab.id, sectionId: section.id, controlId: control.id });
  };

  // ── Drag: control card ─────────────────────────────────────────────────────

  const handleControlDragStart = (
    e: React.DragEvent,
    tab: DesignerTab,
    section: DesignerSection,
    control: DesignerControl,
    fromIndex: number,
  ) => {
    dragState.current = {
      controlId: control.id,
      fromTabId: tab.id,
      fromSectionId: section.id,
      fromIndex,
    };
    e.dataTransfer.setData(CONTROL_DRAG_TYPE, control.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    dragState.current = null;
    setDropTarget(null);
  };

  // ── Drop resolution ────────────────────────────────────────────────────────

  const resolveInsertIndex = (
    raw: DropTarget,
    fromTabId: string,
    fromSectionId: string,
    fromIndex: number,
  ): number => {
    let idx = raw.insertIndex;
    // If moving within same section and source was before the target, shift back by 1
    if (fromTabId === raw.tabId && fromSectionId === raw.sectionId && fromIndex < idx) {
      idx = idx - 1;
    }
    return idx;
  };

  // Called from child sections
  const commitDrop = useCallback((
    target: DropTarget,
    tab: DesignerTab,
    section: DesignerSection,
    e: React.DragEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    // ── Canvas control move ──
    if (e.dataTransfer.types.includes(CONTROL_DRAG_TYPE) && dragState.current) {
      const { controlId, fromTabId, fromSectionId, fromIndex } = dragState.current;
      const finalIndex = resolveInsertIndex(target, fromTabId, fromSectionId, fromIndex);
      moveControlCrossSection(fromTabId, fromSectionId, controlId, tab.id, section.id, finalIndex);
      dragState.current = null;
      return;
    }

    // ── Field library drop ──
    if (e.dataTransfer.types.includes(DRAG_TYPE)) {
      const raw = e.dataTransfer.getData(DRAG_TYPE);
      if (!raw) return;
      try {
        const data = JSON.parse(raw) as {
          fieldId: string; logical_name: string; display_name: string;
          type_name: string; is_required: boolean;
        };
        const control: DesignerControl = {
          id: uid(),
          control_type: 'field',
          field_definition_id: data.fieldId,
          field_logical_name: data.logical_name,
          field_display_name: data.display_name,
          field_type_name: data.type_name,
          label_override: null,
          column_span: 1,
          column_position: undefined,
          is_visible: true,
          is_readonly: false,
          is_required_override: data.is_required,
          subgrid_config: null,
        };
        const insertIdx = target.insertIndex;
        addControl(tab.id, section.id, control);
        if (insertIdx < section.controls.length) {
          moveControlCrossSection(tab.id, section.id, control.id, tab.id, section.id, insertIdx);
        }
        onActiveSectionChange(tab.id, section.id);
      } catch { /* ignore */ }
    }
  }, [addControl, moveControlCrossSection, onActiveSectionChange]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-end gap-0 px-4 pt-3 bg-slate-100 border-b border-slate-200">
        {layout.tabs.map((tab, idx) => {
          const active = idx === activeTabIdx;
          const sel = isSelected({ type: 'tab', tabId: tab.id });
          return (
            <div
              key={tab.id}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-xs font-medium cursor-pointer border-b-2 transition-all select-none rounded-t-md mr-0.5 ${
                active
                  ? 'bg-white border-blue-500 text-blue-700 shadow-sm'
                  : 'bg-slate-200/60 border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/70'
              } ${sel ? 'ring-1 ring-blue-400 ring-inset' : ''}`}
              onClick={() => { setActiveTabIdx(idx); selectTab(tab); }}
            >
              {!tab.is_visible && <EyeOff size={10} className="text-slate-400" />}
              {tab.label}
            </div>
          );
        })}
        <button
          onClick={() => { store.addTab(); setActiveTabIdx(layout.tabs.length); }}
          className="flex items-center gap-1 px-3 py-2 text-xs text-slate-400 hover:text-blue-600 hover:bg-white/70 rounded-t-md transition-colors ml-1"
          title="Add Tab"
        >
          <Plus size={12} />
          Tab
        </button>
      </div>

      {/* Canvas body */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab && (
          <div className="max-w-4xl mx-auto" style={{ columnCount: 2, columnGap: '0.75rem' }}>
            {activeTab.sections.length === 0 && (
              <div style={{ columnSpan: 'all' }}>
                <EmptySection onClick={() => addSection(activeTab.id)} />
              </div>
            )}

            {activeTab.sections.map((section) => (
              <div
                key={section.id}
                className="relative break-inside-avoid mb-3"
                style={section.column_span === 1 ? undefined : { columnSpan: 'all' }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(SECTION_DRAG_TYPE)) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const side = e.clientX > rect.left + rect.width / 2 ? 'right' : 'left';
                  setSectionDrop({ sectionId: section.id, side });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setSectionDrop(null);
                }}
                onDrop={(e) => {
                  if (!e.dataTransfer.types.includes(SECTION_DRAG_TYPE)) return;
                  e.preventDefault();
                  const draggedId = e.dataTransfer.getData(SECTION_DRAG_TYPE);
                  const side = sectionDrop?.side ?? 'right';
                  if (draggedId) store.moveSectionBeside(activeTab.id, draggedId, section.id, side);
                  setSectionDrop(null);
                }}
              >
                {sectionDrop?.sectionId === section.id && (
                  <div className={`absolute top-0 bottom-0 w-1.5 bg-blue-500 rounded-full z-10 ${sectionDrop.side === 'right' ? '-right-2' : '-left-2'}`} />
                )}
                <SectionCard
                  tab={activeTab}
                  section={section}
                  store={store}
                  isSelected={isSelected}
                  dropTarget={dropTarget}
                  dragState={dragState}
                  selectSection={selectSection}
                  selectControl={selectControl}
                  onControlDragStart={handleControlDragStart}
                  onDragEnd={handleDragEnd}
                  onSetDropTarget={setDropTarget}
                  onCommitDrop={commitDrop}
                  onRemoveSection={() => removeSection(activeTab.id, section.id)}
                  onRemoveControl={(cId) => removeControl(activeTab.id, section.id, cId)}
                />
              </div>
            ))}

            {activeTab.sections.length > 0 && (
              <button
                onClick={() => addSection(activeTab.id)}
                style={{ columnSpan: 'all' }}
                className="break-inside-avoid w-full flex items-center justify-center gap-1.5 py-2 text-xs text-slate-400 hover:text-blue-600 border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-xl transition-colors"
              >
                <Plus size={12} />
                Add Section
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  tab: DesignerTab;
  section: DesignerSection;
  store: DesignerStore;
  isSelected: (t: SelectionTarget) => boolean;
  dropTarget: DropTarget | null;
  dragState: React.MutableRefObject<DragState | null>;
  selectSection: (tab: DesignerTab, section: DesignerSection) => void;
  selectControl: (tab: DesignerTab, section: DesignerSection, control: DesignerControl) => void;
  onControlDragStart: (e: React.DragEvent, tab: DesignerTab, section: DesignerSection, control: DesignerControl, fromIndex: number) => void;
  onDragEnd: () => void;
  onSetDropTarget: (t: DropTarget | null) => void;
  onCommitDrop: (target: DropTarget, tab: DesignerTab, section: DesignerSection, e: React.DragEvent) => void;
  onRemoveSection: () => void;
  onRemoveControl: (controlId: string) => void;
}

function SectionCard({
  tab, section, store, isSelected, dropTarget, dragState,
  selectSection, selectControl, onControlDragStart, onDragEnd,
  onSetDropTarget, onCommitDrop, onRemoveSection, onRemoveControl,
}: SectionCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionSelected = isSelected({ type: 'section', tabId: tab.id, sectionId: section.id });

  const sectionDropActive =
    dropTarget !== null &&
    dropTarget.tabId === tab.id &&
    dropTarget.sectionId === section.id;

  const isDragOver = (insertIndex: number, cellIndex?: number) => {
    if (!sectionDropActive) return false;
    if (cellIndex !== undefined) return dropTarget?.cellIndex === cellIndex;
    return dropTarget?.insertIndex === insertIndex && dropTarget?.cellIndex === undefined;
  };

  const handleDragOver = (e: React.DragEvent, insertIndex: number, cellIndex?: number) => {
    const hasControl = e.dataTransfer.types.includes(CONTROL_DRAG_TYPE);
    const hasField = e.dataTransfer.types.includes(DRAG_TYPE);
    if (!hasControl && !hasField) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = hasControl ? 'move' : 'copy';
    onSetDropTarget({ tabId: tab.id, sectionId: section.id, insertIndex, cellIndex });
  };

  const handleDrop = (e: React.DragEvent, insertIndex: number, cellIndex?: number) => {
    onCommitDrop({ tabId: tab.id, sectionId: section.id, insertIndex, cellIndex }, tab, section, e);
  };

  const handleContainerLeave = (e: React.DragEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      onSetDropTarget(null);
    }
  };

  const controls = section.controls;
  const cols = section.columns;

  return (
    <div
      className={`bg-white rounded-xl border-2 transition-all ${
        sectionSelected ? 'border-blue-400 shadow-md' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Section header */}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(SECTION_DRAG_TYPE, section.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        className={`flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 cursor-grab active:cursor-grabbing rounded-t-xl ${
          sectionSelected ? 'bg-blue-50' : 'bg-slate-50 hover:bg-slate-100'
        }`}
        onClick={() => selectSection(tab, section)}
      >
        <GripVertical size={14} className="text-slate-300 shrink-0" />
        <span className="text-xs font-semibold text-slate-700 flex-1">{section.label}</span>
        {!section.is_visible && <EyeOff size={12} className="text-slate-400" />}
        <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
          <ToolButton
            icon={<Columns size={11} />}
            title={`Toggle columns (${section.columns})`}
            onClick={() => store.updateSection(tab.id, section.id, { columns: section.columns === 1 ? 2 : 1 })}
          />
          <ToolButton
            icon={<LayoutGrid size={11} />}
            title={`Section width: ${section.column_span === 1 ? 'half (side by side)' : 'full row'}`}
            onClick={() => store.updateSection(tab.id, section.id, { column_span: section.column_span === 1 ? 2 : 1 })}
          />
          <ToolButton
            icon={<Eye size={11} />}
            title="Toggle visibility"
            onClick={() => store.updateSection(tab.id, section.id, { is_visible: !section.is_visible })}
          />
          <ToolButton
            icon={<Trash2 size={11} />}
            title="Remove section"
            danger
            onClick={onRemoveSection}
          />
        </div>
        <span className="text-[10px] text-slate-400 ml-1">{cols === 1 ? '1-col' : '2-col'}</span>
      </div>

      {/* Controls area */}
      <div
        ref={containerRef}
        className={`p-3 min-h-[72px] transition-colors ${sectionDropActive ? 'bg-blue-50/20' : ''}`}
        onDragLeave={handleContainerLeave}
      >
        {controls.length === 0 ? (
          <div
            className={`flex items-center justify-center rounded-lg border-2 border-dashed transition-all min-h-[56px] ${
              sectionDropActive
                ? 'border-blue-400 bg-blue-50 text-blue-500'
                : 'border-slate-200 text-slate-300'
            }`}
            onDragOver={(e) => handleDragOver(e, 0)}
            onDrop={(e) => handleDrop(e, 0)}
          >
            <span className="text-xs">{sectionDropActive ? 'Drop here' : 'Drag fields here'}</span>
          </div>
        ) : cols === 1 ? (
          <OneColLayout
            controls={controls}
            tab={tab}
            section={section}
            isSelected={isSelected}
            isDragOver={isDragOver}
            dragState={dragState}
            selectControl={selectControl}
            onControlDragStart={onControlDragStart}
            onDragEnd={onDragEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onRemoveControl={onRemoveControl}
          />
        ) : (
          <TwoColLayout
            controls={controls}
            tab={tab}
            section={section}
            isSelected={isSelected}
            isDragOver={isDragOver}
            dragState={dragState}
            selectControl={selectControl}
            onControlDragStart={onControlDragStart}
            onDragEnd={onDragEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onRemoveControl={onRemoveControl}
          />
        )}
      </div>
    </div>
  );
}

// ─── Shared layout props ───────────────────────────────────────────────────────

interface LayoutProps {
  controls: DesignerControl[];
  tab: DesignerTab;
  section: DesignerSection;
  isSelected: (t: SelectionTarget) => boolean;
  isDragOver: (insertIndex: number, cellIndex?: number) => boolean;
  dragState: React.MutableRefObject<DragState | null>;
  selectControl: (tab: DesignerTab, section: DesignerSection, control: DesignerControl) => void;
  onControlDragStart: (e: React.DragEvent, tab: DesignerTab, section: DesignerSection, control: DesignerControl, fromIndex: number) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, insertIndex: number, cellIndex?: number) => void;
  onDrop: (e: React.DragEvent, insertIndex: number, cellIndex?: number) => void;
  onRemoveControl: (controlId: string) => void;
}

// ─── 1-Column Layout ──────────────────────────────────────────────────────────

function OneColLayout({
  controls, tab, section, isSelected, isDragOver, dragState,
  selectControl, onControlDragStart, onDragEnd, onDragOver, onDrop, onRemoveControl,
}: LayoutProps) {
  return (
    <div>
      {controls.map((control, idx) => (
        <div key={control.id}>
          {/* Drop slot BEFORE this control */}
          <HorizontalDropSlot
            active={isDragOver(idx)}
            onDragOver={(e) => onDragOver(e, idx)}
            onDrop={(e) => onDrop(e, idx)}
          />
          <ControlCard
            control={control}
            tab={tab}
            section={section}
            isSelected={isSelected({ type: 'control', tabId: tab.id, sectionId: section.id, controlId: control.id })}
            isDragging={dragState.current?.controlId === control.id}
            onSelect={() => selectControl(tab, section, control)}
            onDragStart={(e) => onControlDragStart(e, tab, section, control, idx)}
            onDragEnd={onDragEnd}
            onRemove={() => onRemoveControl(control.id)}
          />
        </div>
      ))}
      {/* Trailing drop slot */}
      <HorizontalDropSlot
        active={isDragOver(controls.length)}
        onDragOver={(e) => onDragOver(e, controls.length)}
        onDrop={(e) => onDrop(e, controls.length)}
      />
    </div>
  );
}

// ─── 2-Column Layout ──────────────────────────────────────────────────────────
// Each cell in the grid is its own drop target using `cellIndex` = control index.
// Dropping on a cell inserts at that index (push existing control right/down).
// Between-row gaps also serve as drop slots.

function TwoColLayout({
  controls, tab, section, isSelected, isDragOver, dragState,
  selectControl, onControlDragStart, onDragEnd, onDragOver, onDrop, onRemoveControl,
}: LayoutProps) {
  // Build rows: each row is up to 2 controls, unless a control is span-2.
  type Row = { left: DesignerControl | null; right: DesignerControl | null; leftIdx: number; rightIdx: number };
  const rows: Row[] = [];
  let i = 0;
  while (i < controls.length) {
    const ctrl = controls[i];
    if (ctrl.column_span === 2) {
      rows.push({ left: ctrl, right: null, leftIdx: i, rightIdx: -1 });
      i++;
    } else {
      const next = controls[i + 1];
      if (next && next.column_span !== 2) {
        rows.push({ left: ctrl, right: next, leftIdx: i, rightIdx: i + 1 });
        i += 2;
      } else {
        rows.push({ left: ctrl, right: null, leftIdx: i, rightIdx: -1 });
        i++;
      }
    }
  }

  return (
    <div className="space-y-0">
      {rows.map((row, rowIdx) => {
        // The horizontal drop slot before this row uses the row's first control index
        const rowInsertIdx = row.leftIdx;
        const isSpan2 = row.left?.column_span === 2;

        return (
          <div key={row.leftIdx}>
            {/* Between-row horizontal drop slot */}
            <HorizontalDropSlot
              active={isDragOver(rowInsertIdx)}
              onDragOver={(e) => onDragOver(e, rowInsertIdx)}
              onDrop={(e) => onDrop(e, rowInsertIdx)}
              span={2}
            />

            {isSpan2 ? (
              // Full-width span-2 card
              <div className="grid grid-cols-2">
                <div className="col-span-2">
                  <ControlCard
                    control={row.left!}
                    tab={tab}
                    section={section}
                    isSelected={isSelected({ type: 'control', tabId: tab.id, sectionId: section.id, controlId: row.left!.id })}
                    isDragging={dragState.current?.controlId === row.left!.id}
                    isCellHovered={isDragOver(row.leftIdx, row.leftIdx)}
                    onSelect={() => selectControl(tab, section, row.left!)}
                    onDragStart={(e) => onControlDragStart(e, tab, section, row.left!, row.leftIdx)}
                    onDragEnd={onDragEnd}
                    onRemove={() => onRemoveControl(row.left!.id)}
                    onCellDragOver={(e) => onDragOver(e, row.leftIdx, row.leftIdx)}
                    onCellDrop={(e) => onDrop(e, row.leftIdx, row.leftIdx)}
                  />
                </div>
              </div>
            ) : (
              // Normal 2-cell row
              <div className="grid grid-cols-2 gap-2">
                {/* Left cell */}
                <ControlCard
                  control={row.left!}
                  tab={tab}
                  section={section}
                  isSelected={isSelected({ type: 'control', tabId: tab.id, sectionId: section.id, controlId: row.left!.id })}
                  isDragging={dragState.current?.controlId === row.left!.id}
                  isCellHovered={isDragOver(row.leftIdx, row.leftIdx)}
                  onSelect={() => selectControl(tab, section, row.left!)}
                  onDragStart={(e) => onControlDragStart(e, tab, section, row.left!, row.leftIdx)}
                  onDragEnd={onDragEnd}
                  onRemove={() => onRemoveControl(row.left!.id)}
                  onCellDragOver={(e) => onDragOver(e, row.leftIdx, row.leftIdx)}
                  onCellDrop={(e) => onDrop(e, row.leftIdx, row.leftIdx)}
                />

                {/* Right cell: either a real card or an empty drop zone */}
                {row.right ? (
                  <ControlCard
                    control={row.right}
                    tab={tab}
                    section={section}
                    isSelected={isSelected({ type: 'control', tabId: tab.id, sectionId: section.id, controlId: row.right.id })}
                    isDragging={dragState.current?.controlId === row.right.id}
                    isCellHovered={isDragOver(row.rightIdx, row.rightIdx)}
                    onSelect={() => selectControl(tab, section, row.right!)}
                    onDragStart={(e) => onControlDragStart(e, tab, section, row.right!, row.rightIdx)}
                    onDragEnd={onDragEnd}
                    onRemove={() => onRemoveControl(row.right.id)}
                    onCellDragOver={(e) => onDragOver(e, row.rightIdx, row.rightIdx)}
                    onCellDrop={(e) => onDrop(e, row.rightIdx, row.rightIdx)}
                  />
                ) : (
                  // Empty right cell — drop here appends after left
                  <EmptyCellSlot
                    active={isDragOver(row.leftIdx + 1, row.leftIdx + 1)}
                    onDragOver={(e) => onDragOver(e, row.leftIdx + 1, row.leftIdx + 1)}
                    onDrop={(e) => onDrop(e, row.leftIdx + 1, row.leftIdx + 1)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Trailing between-row drop slot */}
      <HorizontalDropSlot
        active={isDragOver(controls.length)}
        onDragOver={(e) => onDragOver(e, controls.length)}
        onDrop={(e) => onDrop(e, controls.length)}
        span={2}
      />
    </div>
  );
}

// ─── Horizontal Drop Slot ─────────────────────────────────────────────────────
// A thin line between rows that glows blue when a drag is over it.

function HorizontalDropSlot({
  active, onDragOver, onDrop, span,
}: {
  active: boolean;
  span?: number;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={`relative flex items-center transition-all ${active ? 'h-5 my-0.5' : 'h-2'}`}
      style={span && span > 1 ? { gridColumn: `span ${span}` } : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {active && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none px-1">
          <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
          <div className="flex-1 h-0.5 bg-blue-400 rounded-full" />
          <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
        </div>
      )}
    </div>
  );
}

// ─── Empty Cell Slot ──────────────────────────────────────────────────────────

function EmptyCellSlot({
  active, onDragOver, onDrop,
}: {
  active: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={`min-h-[44px] rounded-lg border-2 border-dashed flex items-center justify-center transition-all ${
        active ? 'border-blue-400 bg-blue-50 text-blue-400' : 'border-slate-150 text-slate-200'
      }`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {active && <span className="text-[10px] font-medium">Drop here</span>}
    </div>
  );
}

// ─── Control Card ─────────────────────────────────────────────────────────────

interface ControlCardProps {
  control: DesignerControl;
  tab: DesignerTab;
  section: DesignerSection;
  isSelected: boolean;
  isDragging: boolean;
  isCellHovered?: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onRemove: () => void;
  onCellDragOver?: (e: React.DragEvent) => void;
  onCellDrop?: (e: React.DragEvent) => void;
}

function ControlCard({
  control, isSelected, isDragging, isCellHovered,
  onSelect, onDragStart, onDragEnd, onRemove,
  onCellDragOver, onCellDrop,
}: ControlCardProps) {
  const handleDragOver = (e: React.DragEvent) => {
    const hasControl = e.dataTransfer.types.includes(CONTROL_DRAG_TYPE);
    const hasField = e.dataTransfer.types.includes(DRAG_TYPE);
    if (!hasControl && !hasField) return;
    e.preventDefault();
    e.stopPropagation();
    onCellDragOver?.(e);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.stopPropagation();
    onCellDrop?.(e);
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className={`relative rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing select-none group ${
        isDragging
          ? 'opacity-40 border-blue-300 bg-blue-50/50'
          : isCellHovered
          ? 'border-blue-400 bg-blue-50 shadow-sm ring-2 ring-blue-200'
          : isSelected
          ? 'border-blue-500 bg-blue-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
      }`}
    >
      <ControlCellContent control={control} isSelected={isSelected} onRemove={onRemove} />
    </div>
  );
}

// ─── Control Cell Content ─────────────────────────────────────────────────────

function ControlCellContent({
  control, isSelected, onRemove,
}: {
  control: DesignerControl;
  isSelected: boolean;
  onRemove: () => void;
}) {
  const deleteBtn = (
    <button
      title="Remove"
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      className={`p-1 rounded transition-colors text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0 ${
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      <Trash2 size={10} />
    </button>
  );

  const grip = <GripVertical size={12} className="text-slate-300 shrink-0" />;

  if (control.control_type === 'spacer') {
    return (
      <div className="flex items-center justify-between px-2 py-2.5 min-h-[44px]">
        <div className="flex items-center gap-1.5">{grip}<span className="text-[10px] text-slate-300 italic">Spacer</span></div>
        {deleteBtn}
      </div>
    );
  }

  if (control.control_type === 'separator') {
    return (
      <div className="flex items-center gap-2 px-2 py-2">
        {grip}
        <Minus size={12} className="text-slate-400" />
        <div className="flex-1 border-t border-slate-200" />
        {deleteBtn}
      </div>
    );
  }

  if (control.control_type === 'label') {
    return (
      <div className="flex items-center justify-between px-2 py-2.5">
        <div className="flex items-center gap-1.5">
          {grip}
          <Tag size={11} className="text-slate-400" />
          <span className="text-xs font-medium text-slate-700">{control.label_override ?? 'Label Text'}</span>
        </div>
        {deleteBtn}
      </div>
    );
  }

  if (control.control_type === 'subgrid') {
    return (
      <div className="flex items-center justify-between px-2 py-2.5">
        <div className="flex items-center gap-2">
          {grip}
          <LayoutGrid size={11} className="text-blue-500" />
          <div>
            <span className="text-xs font-medium text-slate-700">{control.field_display_name ?? 'Subgrid'}</span>
            <p className="text-[10px] text-slate-400">Related Records</p>
          </div>
        </div>
        {deleteBtn}
      </div>
    );
  }

  if (control.control_type === 'timeline') {
    return (
      <div className="flex items-center justify-between px-2 py-2.5">
        <div className="flex items-center gap-2">
          {grip}
          <Clock size={11} className="text-blue-500" />
          <div>
            <span className="text-xs font-medium text-slate-700">Timeline</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="flex items-center gap-0.5 text-[9px] text-slate-400"><StickyNote size={8} /> Notes</span>
              <span className="flex items-center gap-0.5 text-[9px] text-slate-400"><Calendar size={8} /> Appts</span>
              <span className="flex items-center gap-0.5 text-[9px] text-slate-400"><Send size={8} /> Emails</span>
              <span className="flex items-center gap-0.5 text-[9px] text-slate-400"><Paperclip size={8} /> Files</span>
            </div>
          </div>
        </div>
        {deleteBtn}
      </div>
    );
  }

  const icon = FIELD_ICONS[control.field_type_name ?? ''] ?? <AlertCircle size={11} />;
  const label = control.label_override ?? control.field_display_name ?? control.field_logical_name ?? '—';

  return (
    <div className="flex items-center justify-between px-2 py-2.5 min-h-[44px]">
      <div className="flex items-center gap-1.5 min-w-0">
        {grip}
        <span className="text-slate-400 shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-700 truncate">{label}</span>
            {control.is_required_override && <span className="text-red-400 text-[9px] shrink-0">*</span>}
            {control.is_readonly && <span className="text-[9px] text-slate-400 bg-slate-100 px-1 rounded shrink-0">RO</span>}
            {!control.is_visible && <EyeOff size={9} className="text-slate-300 shrink-0" />}
          </div>
          <p className="text-[10px] text-slate-400 truncate font-mono">{control.field_logical_name}</p>
        </div>
      </div>
      {deleteBtn}
    </div>
  );
}

// ─── Empty Section placeholder ────────────────────────────────────────────────

function EmptySection({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 text-sm cursor-pointer hover:border-blue-400 hover:text-blue-500 transition-colors"
      onClick={onClick}
    >
      <Plus size={20} className="mb-1" />
      Add Section
    </div>
  );
}

// ─── Tool Button ──────────────────────────────────────────────────────────────

function ToolButton({
  icon, title, onClick, danger, disabled,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: (e?: React.MouseEvent) => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={`p-1 rounded transition-colors disabled:opacity-20 ${
        danger ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
      }`}
    >
      {icon}
    </button>
  );
}
