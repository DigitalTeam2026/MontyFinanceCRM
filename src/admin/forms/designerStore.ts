import { useState, useCallback } from 'react';
import type {
  DesignerLayout,
  DesignerTab,
  DesignerSection,
  DesignerControl,
  SelectionTarget,
} from '../../types/form';

let idCounter = 1;
export const uid = () => `new_${Date.now()}_${idCounter++}`;

export function useDesignerStore(initialLayout?: DesignerLayout | null) {
  const [layout, setLayout] = useState<DesignerLayout>(() =>
    initialLayout ?? {
      tabs: [
        {
          id: uid(),
          name: 'general',
          label: 'General',
          display_order: 0,
          is_visible: true,
          sections: [
            {
              id: uid(),
              name: 'general_section',
              label: 'General',
              columns: 2,
              display_order: 0,
              is_visible: true,
              is_collapsed: false,
              controls: [],
            },
          ],
        },
      ],
    }
  );

  const [selection, setSelection] = useState<SelectionTarget>(null);
  const [dirty, setDirty] = useState(false);

  const mark = () => setDirty(true);

  const updateLayout = useCallback((fn: (prev: DesignerLayout) => DesignerLayout) => {
    setLayout((prev) => fn(prev));
    setDirty(true);
  }, []);

  const addTab = useCallback(() => {
    const id = uid();
    const sectionId = uid();
    updateLayout((l) => ({
      tabs: [
        ...l.tabs,
        {
          id,
          name: `tab_${l.tabs.length + 1}`,
          label: `Tab ${l.tabs.length + 1}`,
          display_order: l.tabs.length,
          is_visible: true,
          sections: [
            {
              id: sectionId,
              name: 'section_1',
              label: 'Section',
              columns: 2,
              display_order: 0,
              is_visible: true,
              is_collapsed: false,
              controls: [],
            },
          ],
        },
      ],
    }));
    setSelection({ type: 'tab', tabId: id });
  }, [updateLayout]);

  const updateTab = useCallback(
    (tabId: string, patch: Partial<DesignerTab>) => {
      updateLayout((l) => ({
        tabs: l.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
      }));
    },
    [updateLayout]
  );

  const removeTab = useCallback(
    (tabId: string) => {
      updateLayout((l) => ({ tabs: l.tabs.filter((t) => t.id !== tabId) }));
      setSelection(null);
    },
    [updateLayout]
  );

  const moveTab = useCallback(
    (tabId: string, direction: 'left' | 'right') => {
      updateLayout((l) => {
        const tabs = [...l.tabs];
        const idx = tabs.findIndex((t) => t.id === tabId);
        if (idx === -1) return l;
        const target = direction === 'left' ? idx - 1 : idx + 1;
        if (target < 0 || target >= tabs.length) return l;
        [tabs[idx], tabs[target]] = [tabs[target], tabs[idx]];
        return { tabs: tabs.map((t, i) => ({ ...t, display_order: i })) };
      });
    },
    [updateLayout]
  );

  const addSection = useCallback(
    (tabId: string) => {
      const id = uid();
      updateLayout((l) => ({
        tabs: l.tabs.map((t) => {
          if (t.id !== tabId) return t;
          return {
            ...t,
            sections: [
              ...t.sections,
              {
                id,
                name: `section_${t.sections.length + 1}`,
                label: `Section ${t.sections.length + 1}`,
                columns: 2,
                display_order: t.sections.length,
                is_visible: true,
                is_collapsed: false,
                controls: [],
              },
            ],
          };
        }),
      }));
      setSelection({ type: 'section', tabId, sectionId: id });
    },
    [updateLayout]
  );

  const updateSection = useCallback(
    (tabId: string, sectionId: string, patch: Partial<DesignerSection>) => {
      updateLayout((l) => ({
        tabs: l.tabs.map((t) => {
          if (t.id !== tabId) return t;
          return {
            ...t,
            sections: t.sections.map((s) =>
              s.id === sectionId ? { ...s, ...patch } : s
            ),
          };
        }),
      }));
    },
    [updateLayout]
  );

  const removeSection = useCallback(
    (tabId: string, sectionId: string) => {
      updateLayout((l) => ({
        tabs: l.tabs.map((t) => {
          if (t.id !== tabId) return t;
          return { ...t, sections: t.sections.filter((s) => s.id !== sectionId) };
        }),
      }));
      setSelection(null);
    },
    [updateLayout]
  );

  const addControl = useCallback(
    (tabId: string, sectionId: string, control: DesignerControl) => {
      updateLayout((l) => ({
        tabs: l.tabs.map((t) => {
          if (t.id !== tabId) return t;
          return {
            ...t,
            sections: t.sections.map((s) => {
              if (s.id !== sectionId) return s;
              return {
                ...s,
                controls: [
                  ...s.controls,
                  { ...control, display_order: s.controls.length },
                ],
              };
            }),
          };
        }),
      }));
      setSelection({ type: 'control', tabId, sectionId, controlId: control.id });
    },
    [updateLayout]
  );

  const updateControl = useCallback(
    (
      tabId: string,
      sectionId: string,
      controlId: string,
      patch: Partial<DesignerControl>
    ) => {
      updateLayout((l) => ({
        tabs: l.tabs.map((t) => {
          if (t.id !== tabId) return t;
          return {
            ...t,
            sections: t.sections.map((s) => {
              if (s.id !== sectionId) return s;
              return {
                ...s,
                controls: s.controls.map((c) =>
                  c.id === controlId ? { ...c, ...patch } : c
                ),
              };
            }),
          };
        }),
      }));
    },
    [updateLayout]
  );

  const removeControl = useCallback(
    (tabId: string, sectionId: string, controlId: string) => {
      updateLayout((l) => ({
        tabs: l.tabs.map((t) => {
          if (t.id !== tabId) return t;
          return {
            ...t,
            sections: t.sections.map((s) => {
              if (s.id !== sectionId) return s;
              return {
                ...s,
                controls: s.controls.filter((c) => c.id !== controlId),
              };
            }),
          };
        }),
      }));
      setSelection(null);
    },
    [updateLayout]
  );

  const moveControl = useCallback(
    (
      tabId: string,
      sectionId: string,
      controlId: string,
      direction: 'up' | 'down'
    ) => {
      updateLayout((l) => ({
        tabs: l.tabs.map((t) => {
          if (t.id !== tabId) return t;
          return {
            ...t,
            sections: t.sections.map((s) => {
              if (s.id !== sectionId) return s;
              const controls = [...s.controls];
              const idx = controls.findIndex((c) => c.id === controlId);
              if (idx === -1) return s;
              const target = direction === 'up' ? idx - 1 : idx + 1;
              if (target < 0 || target >= controls.length) return s;
              [controls[idx], controls[target]] = [controls[target], controls[idx]];
              return {
                ...s,
                controls: controls.map((c, i) => ({ ...c, display_order: i })),
              };
            }),
          };
        }),
      }));
    },
    [updateLayout]
  );

  /**
   * Move a control from any tab/section to a specific position in a (possibly different) tab/section.
   * insertIndex is the 0-based index to insert BEFORE in the destination controls array.
   */
  const moveControlCrossSection = useCallback(
    (
      fromTabId: string,
      fromSectionId: string,
      controlId: string,
      toTabId: string,
      toSectionId: string,
      insertIndex: number,
    ) => {
      updateLayout((l) => {
        // Extract the control from source
        let movedControl: DesignerControl | null = null;
        const withoutControl = {
          tabs: l.tabs.map((t) => {
            if (t.id !== fromTabId) return t;
            return {
              ...t,
              sections: t.sections.map((s) => {
                if (s.id !== fromSectionId) return s;
                const ctrl = s.controls.find((c) => c.id === controlId);
                if (ctrl) movedControl = ctrl;
                return { ...s, controls: s.controls.filter((c) => c.id !== controlId) };
              }),
            };
          }),
        };
        if (!movedControl) return l;
        const ctrl = movedControl as DesignerControl;

        // Insert into destination
        return {
          tabs: withoutControl.tabs.map((t) => {
            if (t.id !== toTabId) return t;
            return {
              ...t,
              sections: t.sections.map((s) => {
                if (s.id !== toSectionId) return s;
                const controls = [...s.controls];
                const clampedIndex = Math.max(0, Math.min(insertIndex, controls.length));
                controls.splice(clampedIndex, 0, ctrl);
                return { ...s, controls: controls.map((c, i) => ({ ...c, display_order: i })) };
              }),
            };
          }),
        };
      });
    },
    [updateLayout]
  );

  /**
   * Move a control to a specific column (1 = left, 2 = right) within a 2-column section.
   * Sets column_position on the control. Span-2 controls cannot be moved to column 2.
   */
  const moveControlToColumn = useCallback(
    (tabId: string, sectionId: string, controlId: string, column: 1 | 2) => {
      updateLayout((l) => ({
        tabs: l.tabs.map((t) => {
          if (t.id !== tabId) return t;
          return {
            ...t,
            sections: t.sections.map((s) => {
              if (s.id !== sectionId) return s;
              return {
                ...s,
                controls: s.controls.map((c) =>
                  c.id === controlId ? { ...c, column_position: column } : c
                ),
              };
            }),
          };
        }),
      }));
    },
    [updateLayout]
  );

  const getSelectedTab = () =>
    selection?.type === 'tab' || selection?.type === 'section' || selection?.type === 'control'
      ? layout.tabs.find((t) => t.id === selection.tabId) ?? null
      : null;

  // Move a section to sit immediately before/after another section, setting both
  // to half width so they share the same row. `side` is relative to the target.
  const moveSectionBeside = useCallback(
    (tabId: string, draggedId: string, targetId: string, side: 'left' | 'right') => {
      if (draggedId === targetId) return;
      updateLayout((l) => ({
        tabs: l.tabs.map((t) => {
          if (t.id !== tabId) return t;
          const dragged = t.sections.find((s) => s.id === draggedId);
          if (!dragged) return t;
          const rest = t.sections.filter((s) => s.id !== draggedId);
          const targetIdx = rest.findIndex((s) => s.id === targetId);
          if (targetIdx === -1) return t;
          const insertIdx = side === 'right' ? targetIdx + 1 : targetIdx;
          const next = [...rest];
          next.splice(insertIdx, 0, { ...dragged, column_span: 1 });
          const spanned = next.map((s) =>
            s.id === targetId || s.id === draggedId ? { ...s, column_span: 1 as 1 | 2 } : s
          );
          return { ...t, sections: spanned.map((s, i) => ({ ...s, display_order: i })) };
        }),
      }));
    },
    [updateLayout]
  );

  const getSelectedSection = () => {
    if (selection?.type !== 'section' && selection?.type !== 'control') return null;
    const tab = layout.tabs.find((t) => t.id === selection.tabId);
    return tab?.sections.find((s) => s.id === selection.sectionId) ?? null;
  };

  const getSelectedControl = () => {
    if (selection?.type !== 'control') return null;
    const tab = layout.tabs.find((t) => t.id === selection.tabId);
    const section = tab?.sections.find((s) => s.id === selection.sectionId);
    return section?.controls.find((c) => c.id === selection.controlId) ?? null;
  };

  return {
    layout,
    setLayout,
    selection,
    setSelection,
    dirty,
    setDirty,
    mark,
    addTab,
    updateTab,
    removeTab,
    moveTab,
    addSection,
    updateSection,
    removeSection,
    addControl,
    updateControl,
    removeControl,
    moveControl,
    getSelectedTab,
    getSelectedSection,
    getSelectedControl,
    moveControlToColumn,
    moveControlCrossSection,
    moveSectionBeside,
  };
}

export type DesignerStore = ReturnType<typeof useDesignerStore>;
