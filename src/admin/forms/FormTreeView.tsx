import { ChevronDown, ChevronRight, Layers, LayoutGrid, Square, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { DesignerLayout, SelectionTarget } from '../../types/form';

interface FormTreeViewProps {
  layout: DesignerLayout;
  selection: SelectionTarget;
  onSelect: (target: SelectionTarget) => void;
}

export default function FormTreeView({ layout, selection, onSelect }: FormTreeViewProps) {
  const [expandedTabs, setExpandedTabs] = useState<Set<string>>(() => new Set(layout.tabs.map((t) => t.id)));
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());

  const toggleTab = (id: string) => {
    setExpandedTabs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isSelected = (target: SelectionTarget) => {
    if (!selection || !target) return false;
    if (selection.type === 'tab' && target.type === 'tab') return selection.tabId === target.tabId;
    if (selection.type === 'section' && target.type === 'section')
      return selection.tabId === target.tabId && selection.sectionId === target.sectionId;
    if (selection.type === 'control' && target.type === 'control')
      return selection.tabId === target.tabId && selection.sectionId === target.sectionId && selection.controlId === target.controlId;
    return false;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="px-3 py-2.5 border-b border-slate-700/60">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Structure</p>
      </div>
      <div className="flex-1 overflow-y-auto py-1.5">
        {layout.tabs.map((tab) => {
          const tabTarget: SelectionTarget = { type: 'tab', tabId: tab.id };
          const tabExpanded = expandedTabs.has(tab.id);
          const tabSel = isSelected(tabTarget);

          return (
            <div key={tab.id}>
              <TreeRow
                level={0}
                label={tab.label}
                icon={<Layers size={10} />}
                expanded={tabExpanded}
                selected={tabSel}
                hasChildren={tab.sections.length > 0}
                visible={tab.is_visible}
                onToggle={() => toggleTab(tab.id)}
                onSelect={() => onSelect(tabTarget)}
              />

              {tabExpanded &&
                tab.sections.map((section) => {
                  const sectionTarget: SelectionTarget = {
                    type: 'section',
                    tabId: tab.id,
                    sectionId: section.id,
                  };
                  const sectionExpanded = expandedSections.has(section.id);
                  const sectionSel = isSelected(sectionTarget);

                  return (
                    <div key={section.id}>
                      <TreeRow
                        level={1}
                        label={section.label}
                        icon={<LayoutGrid size={10} />}
                        expanded={sectionExpanded}
                        selected={sectionSel}
                        hasChildren={section.controls.length > 0}
                        visible={section.is_visible}
                        onToggle={() => toggleSection(section.id)}
                        onSelect={() => onSelect(sectionTarget)}
                      />

                      {sectionExpanded &&
                        section.controls.map((control) => {
                          const controlTarget: SelectionTarget = {
                            type: 'control',
                            tabId: tab.id,
                            sectionId: section.id,
                            controlId: control.id,
                          };
                          const controlSel = isSelected(controlTarget);
                          const label =
                            control.label_override ??
                            control.field_display_name ??
                            control.control_type;

                          return (
                            <TreeRow
                              key={control.id}
                              level={2}
                              label={label ?? ''}
                              icon={<Square size={9} />}
                              expanded={false}
                              selected={controlSel}
                              hasChildren={false}
                              visible={control.is_visible}
                              onToggle={() => {}}
                              onSelect={() => onSelect(controlTarget)}
                            />
                          );
                        })}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TreeRow({
  level,
  label,
  icon,
  expanded,
  selected,
  hasChildren,
  visible,
  onToggle,
  onSelect,
}: {
  level: number;
  label: string;
  icon: React.ReactNode;
  expanded: boolean;
  selected: boolean;
  hasChildren: boolean;
  visible: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-1 py-1 pr-2 cursor-pointer transition-colors select-none ${
        selected ? 'bg-blue-600/30 text-blue-300' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
      }`}
      style={{ paddingLeft: `${8 + level * 14}px` }}
      onClick={() => {
        onSelect();
        if (hasChildren) onToggle();
      }}
    >
      <span className="shrink-0 w-3 flex items-center justify-center text-slate-600">
        {hasChildren ? (
          expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />
        ) : null}
      </span>
      <span className="shrink-0 text-slate-500">{icon}</span>
      <span className="text-[11px] truncate flex-1">{label}</span>
      {!visible && <EyeOff size={9} className="text-slate-600 shrink-0" />}
    </div>
  );
}
