import { useState, useEffect } from 'react';
import {
  Settings, Eye, EyeOff, ChevronLeft, ChevronRight, Trash2, Plus, X,
  LayoutGrid, Link2, ChevronDown, Loader2, Info,
} from 'lucide-react';
import type { DesignerStore } from './designerStore';
import type { FormScript, FormEventHandler, EventType, LookupConfig, DesignerControl } from '../../types/form';
import type { BusinessRule } from '../../types/businessRule';
import type { ViewDefinition } from '../../types/view';
import type { RelationshipDefinitionWithEntities } from '../../types/relationship';
import { fetchViewsForEntity } from '../../services/viewService';
import { fetchRelationshipsForEntity } from '../../services/relationshipService';
import FieldBusinessRulesPanel from './FieldBusinessRulesPanel';

const EVENT_TYPES: EventType[] = ['onLoad', 'onSave', 'onChange', 'onTabChange'];

interface PropertiesPanelProps {
  store: DesignerStore;
  scripts: FormScript[];
  eventHandlers: FormEventHandler[];
  onAddScript: (s: Partial<FormScript>) => void;
  onDeleteScript: (id: string) => void;
  onAddHandler: (h: Partial<FormEventHandler>) => void;
  onDeleteHandler: (id: string) => void;
  /** entity_definition_id for each lookup field: keyed by field_definition_id */
  lookupEntityMap: Record<string, string>;
  entityId: string;
  entityName: string;
  onOpenRule: (rule: BusinessRule) => void;
  onNewRule: (fieldLogicalName: string, fieldDisplayName: string) => void;
}

type PanelTab = 'properties' | 'events' | 'scripts' | 'rules';

export default function PropertiesPanel({
  store,
  scripts,
  eventHandlers,
  onAddScript,
  onDeleteScript,
  onAddHandler,
  onDeleteHandler,
  lookupEntityMap,
  entityId,
  entityName,
  onOpenRule,
  onNewRule,
}: PropertiesPanelProps) {
  const { selection } = store;
  const tab = store.getSelectedTab();
  const section = store.getSelectedSection();
  const control = store.getSelectedControl();

  const isFieldControl = selection?.type === 'control' && control &&
    control.control_type === 'field' && control.field_logical_name;

  const [activePanel, setActivePanel] = useState<PanelTab>('properties');

  const visibleTabs: PanelTab[] = isFieldControl
    ? ['properties', 'rules', 'events', 'scripts']
    : ['properties', 'events', 'scripts'];

  const effectivePanel = visibleTabs.includes(activePanel) ? activePanel : 'properties';

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      <div className="flex border-b border-slate-200 shrink-0">
        {visibleTabs.map((p) => (
          <button
            key={p}
            onClick={() => setActivePanel(p)}
            className={`flex-1 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              effectivePanel === p
                ? 'text-blue-600 border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {effectivePanel === 'properties' && (
          <div className="p-3 space-y-4">
            {!selection && <NoSelection />}

            {selection?.type === 'tab' && tab && (
              <TabProperties store={store} tab={tab} />
            )}

            {selection?.type === 'section' && section && tab && (
              <SectionProperties store={store} tab={tab} section={section} />
            )}

            {selection?.type === 'control' && control && tab && section && (
              <ControlProperties
                store={store}
                tab={tab}
                section={section}
                control={control}
                lookupEntityMap={lookupEntityMap}
              />
            )}
          </div>
        )}

        {effectivePanel === 'rules' && isFieldControl && control && (
          <FieldBusinessRulesPanel
            entityId={entityId}
            entityName={entityName}
            fieldLogicalName={control.field_logical_name!}
            fieldDisplayName={control.field_display_name ?? control.field_logical_name!}
            onOpenRule={onOpenRule}
            onNewRule={onNewRule}
          />
        )}

        {effectivePanel === 'events' && (
          <EventsPanel handlers={eventHandlers} onAdd={onAddHandler} onDelete={onDeleteHandler} />
        )}

        {effectivePanel === 'scripts' && (
          <ScriptsPanel scripts={scripts} onAdd={onAddScript} onDelete={onDeleteScript} />
        )}
      </div>
    </div>
  );
}

// ─── No Selection ─────────────────────────────────────────────────────────────

function NoSelection() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Settings size={24} className="text-slate-200 mb-3" />
      <p className="text-xs text-slate-400">Select a tab, section, or field to edit properties</p>
    </div>
  );
}

// ─── Tab Properties ───────────────────────────────────────────────────────────

function TabProperties({
  store, tab,
}: {
  store: DesignerStore;
  tab: NonNullable<ReturnType<DesignerStore['getSelectedTab']>>;
}) {
  return (
    <>
      <PropSection title="Tab">
        <PropField label="Label">
          <input
            type="text"
            value={tab.label}
            onChange={(e) => store.updateTab(tab.id, { label: e.target.value })}
            className={pi()}
          />
        </PropField>
        <PropField label="Name">
          <input
            type="text"
            value={tab.name}
            onChange={(e) => store.updateTab(tab.id, { name: e.target.value })}
            className={pi()}
          />
        </PropField>
        <PropToggle
          label="Visible"
          checked={tab.is_visible}
          onChange={(v) => store.updateTab(tab.id, { is_visible: v })}
        />
      </PropSection>
      <PropSection title="Actions">
        <div className="flex gap-1.5">
          <PropButton label="Move Left" icon={<ChevronLeft size={11} />} onClick={() => store.moveTab(tab.id, 'left')} />
          <PropButton label="Move Right" icon={<ChevronRight size={11} />} onClick={() => store.moveTab(tab.id, 'right')} />
        </div>
        <PropButton label="Delete Tab" icon={<Trash2 size={11} />} danger onClick={() => store.removeTab(tab.id)} />
      </PropSection>
    </>
  );
}

// ─── Section Properties ───────────────────────────────────────────────────────

function SectionProperties({
  store, tab, section,
}: {
  store: DesignerStore;
  tab: NonNullable<ReturnType<DesignerStore['getSelectedTab']>>;
  section: NonNullable<ReturnType<DesignerStore['getSelectedSection']>>;
}) {
  return (
    <>
      <PropSection title="Section">
        <PropField label="Label">
          <input
            type="text"
            value={section.label}
            onChange={(e) => store.updateSection(tab.id, section.id, { label: e.target.value })}
            className={pi()}
          />
        </PropField>
        <PropField label="Name">
          <input
            type="text"
            value={section.name}
            onChange={(e) => store.updateSection(tab.id, section.id, { name: e.target.value })}
            className={pi()}
          />
        </PropField>
        <PropField label="Layout">
          <select
            value={section.columns}
            onChange={(e) => store.updateSection(tab.id, section.id, { columns: Number(e.target.value) as 1 | 2 })}
            className={pi()}
          >
            <option value={1}>1 Column</option>
            <option value={2}>2 Columns</option>
          </select>
        </PropField>
        <PropToggle
          label="Visible"
          checked={section.is_visible}
          onChange={(v) => store.updateSection(tab.id, section.id, { is_visible: v })}
        />
        <PropToggle
          label="Collapsed by Default"
          checked={section.is_collapsed}
          onChange={(v) => store.updateSection(tab.id, section.id, { is_collapsed: v })}
        />
      </PropSection>
      <PropSection title="Actions">
        <PropButton
          label="Delete Section"
          icon={<Trash2 size={11} />}
          danger
          onClick={() => store.removeSection(tab.id, section.id)}
        />
      </PropSection>
    </>
  );
}

// ─── Control Properties ───────────────────────────────────────────────────────

function ControlProperties({
  store, tab, section, control, lookupEntityMap,
}: {
  store: DesignerStore;
  tab: NonNullable<ReturnType<DesignerStore['getSelectedTab']>>;
  section: NonNullable<ReturnType<DesignerStore['getSelectedSection']>>;
  control: NonNullable<ReturnType<DesignerStore['getSelectedControl']>>;
  lookupEntityMap: Record<string, string>;
}) {
  const upd = (patch: Parameters<DesignerStore['updateControl']>[3]) =>
    store.updateControl(tab.id, section.id, control.id, patch);

  if (control.control_type === 'spacer') {
    return (
      <PropSection title="Spacer">
        <PropButton label="Remove" icon={<Trash2 size={11} />} danger onClick={() => store.removeControl(tab.id, section.id, control.id)} />
      </PropSection>
    );
  }

  if (control.control_type === 'separator') {
    return (
      <PropSection title="Separator">
        <PropButton label="Remove" icon={<Trash2 size={11} />} danger onClick={() => store.removeControl(tab.id, section.id, control.id)} />
      </PropSection>
    );
  }

  if (control.control_type === 'subgrid') {
    const cfg = control.subgrid_config;
    return (
      <>
        <PropSection title="Subgrid">
          <div className="p-2.5 bg-slate-50 rounded-lg mb-1">
            <div className="flex items-center gap-2 mb-1">
              <LayoutGrid size={13} className="text-blue-500 shrink-0" />
              <p className="text-xs font-semibold text-slate-700 truncate">{control.field_display_name ?? 'Subgrid'}</p>
            </div>
            {cfg?.related_entity_name && (
              <p className="text-[10px] text-slate-400 font-mono">{cfg.related_entity_name}</p>
            )}
          </div>
          <PropField label="Label Override">
            <input
              type="text"
              value={control.label_override ?? ''}
              placeholder={control.field_display_name ?? 'Subgrid'}
              onChange={(e) => upd({ label_override: e.target.value || null })}
              className={pi()}
            />
          </PropField>
          <PropField label="Rows to Show">
            <input
              type="number"
              min={1}
              max={50}
              value={cfg?.rows_to_show ?? 8}
              onChange={(e) => {
                if (!cfg) return;
                upd({ subgrid_config: { ...cfg, rows_to_show: Number(e.target.value) } });
              }}
              className={pi()}
            />
          </PropField>
          <PropToggle
            label="Allow Create"
            checked={cfg?.allow_create ?? true}
            onChange={(v) => { if (!cfg) return; upd({ subgrid_config: { ...cfg, allow_create: v } }); }}
          />
          <PropToggle
            label="Visible"
            checked={control.is_visible}
            onChange={(v) => upd({ is_visible: v })}
          />
        </PropSection>
        <PropSection title="Actions">
          <PropButton label="Remove Subgrid" icon={<Trash2 size={11} />} danger onClick={() => store.removeControl(tab.id, section.id, control.id)} />
        </PropSection>
      </>
    );
  }

  if (control.control_type === 'label') {
    return (
      <PropSection title="Label">
        <PropField label="Text">
          <input
            type="text"
            value={control.label_override ?? ''}
            onChange={(e) => upd({ label_override: e.target.value })}
            className={pi()}
          />
        </PropField>
        <PropField label="Width">
          <select
            value={control.column_span}
            onChange={(e) => upd({ column_span: Number(e.target.value) as 1 | 2 })}
            className={pi()}
          >
            <option value={1}>Half width</option>
            <option value={2}>Full width</option>
          </select>
        </PropField>
        <PropButton label="Remove" icon={<Trash2 size={11} />} danger onClick={() => store.removeControl(tab.id, section.id, control.id)} />
      </PropSection>
    );
  }

  // ── Regular field ──────────────────────────────────────────────────────────
  const isLookup = control.field_type_name === 'lookup';
  const targetEntityId = isLookup && control.field_definition_id
    ? (lookupEntityMap[control.field_definition_id] ?? null)
    : null;

  // Collect other lookup fields on the same form (for "Filter By" dropdown)
  const otherLookupControls: DesignerControl[] = [];
  for (const t of store.layout.tabs) {
    for (const s of t.sections) {
      for (const c of s.controls) {
        if (
          c.id !== control.id &&
          c.field_type_name === 'lookup' &&
          c.field_logical_name
        ) {
          otherLookupControls.push(c);
        }
      }
    }
  }

  return (
    <>
      <PropSection title="Field">
        <div className="p-2.5 bg-slate-50 rounded-lg mb-1">
          <p className="text-xs font-semibold text-slate-700">{control.field_display_name}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{control.field_logical_name}</p>
          <span className={`inline-block text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded-full ${
            isLookup ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {control.field_type_name}
          </span>
        </div>
      </PropSection>

      <PropSection title="Display">
        <PropField label="Label Override">
          <input
            type="text"
            value={control.label_override ?? ''}
            placeholder={control.field_display_name ?? ''}
            onChange={(e) => upd({ label_override: e.target.value || null })}
            className={pi()}
          />
        </PropField>
        <PropField label="Width">
          <select
            value={control.column_span}
            onChange={(e) => upd({ column_span: Number(e.target.value) as 1 | 2 })}
            className={pi()}
          >
            <option value={1}>Half width</option>
            <option value={2}>Full width</option>
          </select>
        </PropField>
        <PropToggle
          label="Visible"
          checked={control.is_visible}
          onChange={(v) => upd({ is_visible: v })}
        />
        <PropToggle
          label="Read Only"
          checked={control.is_readonly}
          onChange={(v) => upd({ is_readonly: v })}
        />
        <PropToggle
          label="Required"
          checked={control.is_required_override}
          onChange={(v) => upd({ is_required_override: v })}
        />
      </PropSection>

      {/* Lookup-specific configuration */}
      {isLookup && targetEntityId && (
        <LookupConfigPanel
          control={control}
          targetEntityId={targetEntityId}
          otherLookupControls={otherLookupControls}
          onUpdate={(cfg) => upd({ lookup_config: cfg })}
        />
      )}

      <PropSection title="Actions">
        <PropButton
          label="Remove Field"
          icon={<Trash2 size={11} />}
          danger
          onClick={() => store.removeControl(tab.id, section.id, control.id)}
        />
      </PropSection>
    </>
  );
}

// ─── Lookup Configuration Panel ───────────────────────────────────────────────

function LookupConfigPanel({
  control,
  targetEntityId,
  otherLookupControls,
  onUpdate,
}: {
  control: NonNullable<ReturnType<DesignerStore['getSelectedControl']>>;
  targetEntityId: string;
  otherLookupControls: DesignerControl[];
  onUpdate: (cfg: LookupConfig) => void;
}) {
  const [views, setViews] = useState<ViewDefinition[]>([]);
  const [relationships, setRelationships] = useState<RelationshipDefinitionWithEntities[]>([]);
  const [loadingViews, setLoadingViews] = useState(true);
  const [loadingRels, setLoadingRels] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const cfg = control.lookup_config ?? {
    target_entity_id: targetEntityId,
    default_view_id: null,
    filter_by_field_logical_name: null,
    filter_fk_column: null,
    filter_relationship_id: null,
  };

  // Patch helper — merges into existing config
  const patch = (partial: Partial<LookupConfig>) =>
    onUpdate({ ...cfg, target_entity_id: targetEntityId, ...partial });

  // Load views for target entity
  useEffect(() => {
    setLoadingViews(true);
    fetchViewsForEntity(targetEntityId)
      .then(setViews)
      .catch(() => setViews([]))
      .finally(() => setLoadingViews(false));
  }, [targetEntityId]);

  // When a filter source field is chosen, load relationships to find the FK
  const selectedFilterField = otherLookupControls.find(
    (c) => c.field_logical_name === cfg.filter_by_field_logical_name,
  );

  // Get the entity ID of the filter source field so we can look up relationships
  // The filter relationship: target entity has an FK pointing to filter source entity
  // We load relationships of the target entity and find ones pointing to the source
  const filterSourceFieldId = selectedFilterField?.field_definition_id ?? null;

  useEffect(() => {
    if (!filterSourceFieldId) { setRelationships([]); return; }
    setLoadingRels(true);
    fetchRelationshipsForEntity(targetEntityId)
      .then((rels) => {
        // We want relationships where the target entity (this lookup's entity) has a lookup FK
        // pointing to some entity, and that FK can be matched to the selected filter field's entity.
        // Keep only lookup-type rels involving targetEntityId as source (the entity being filtered)
        const relevant = rels.filter(
          (r) => r.relationship_storage_type === 'lookup' && r.source_entity_id === targetEntityId,
        );
        setRelationships(relevant);
      })
      .catch(() => setRelationships([]))
      .finally(() => setLoadingRels(false));
  }, [targetEntityId, filterSourceFieldId]);

  return (
    <div className="border border-blue-100 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
      >
        <Link2 size={12} className="text-blue-500 shrink-0" />
        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex-1">
          Lookup Configuration
        </span>
        <ChevronDown
          size={12}
          className={`text-blue-400 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}
        />
      </button>

      {expanded && (
        <div className="p-3 space-y-3 bg-white">
          {/* Default View */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Default Lookup View
            </label>
            {loadingViews ? (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 py-1.5">
                <Loader2 size={11} className="animate-spin" /> Loading views…
              </div>
            ) : (
              <select
                value={cfg.default_view_id ?? ''}
                onChange={(e) => patch({ default_view_id: e.target.value || null })}
                className={pi()}
              >
                <option value="">System default</option>
                {views.map((v) => (
                  <option key={v.view_id} value={v.view_id}>
                    {v.name}
                    {v.view_type === 'system' ? ' (System)' : v.view_type === 'personal' ? ' (Personal)' : ''}
                  </option>
                ))}
              </select>
            )}
            {cfg.default_view_id && (
              <p className="text-[10px] text-blue-600 mt-1 flex items-center gap-1">
                <Info size={9} />
                Lookup picker will open with this view
              </p>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* Dependent Lookup Filter */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Dependent Filter</p>
              <span className="text-[9px] bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-full">Optional</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed mb-2">
              Filter this lookup based on another field already selected on the form. E.g. show only Contacts linked to the selected Account.
            </p>

            {otherLookupControls.length === 0 ? (
              <div className="flex items-start gap-1.5 p-2 bg-slate-50 rounded-lg">
                <Info size={11} className="text-slate-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Add another lookup field to the form to enable dependent filtering.
                </p>
              </div>
            ) : (
              <>
                <PropField label="Filter By Field">
                  <select
                    value={cfg.filter_by_field_logical_name ?? ''}
                    onChange={(e) => {
                      patch({
                        filter_by_field_logical_name: e.target.value || null,
                        filter_fk_column: null,
                        filter_relationship_id: null,
                      });
                    }}
                    className={pi()}
                  >
                    <option value="">None (no filter)</option>
                    {otherLookupControls.map((c) => (
                      <option key={c.id} value={c.field_logical_name!}>
                        {c.field_display_name ?? c.field_logical_name}
                      </option>
                    ))}
                  </select>
                </PropField>

                {cfg.filter_by_field_logical_name && (
                  <>
                    {/* Relationship selector */}
                    <div className="mt-2">
                      <PropField label="Link via Relationship">
                        {loadingRels ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 py-1.5">
                            <Loader2 size={11} className="animate-spin" /> Loading…
                          </div>
                        ) : relationships.length === 0 ? (
                          <div className="p-2 bg-amber-50 border border-amber-100 rounded-lg">
                            <p className="text-[10px] text-amber-700 leading-relaxed">
                              No relationships found from this entity. Define a relationship between the entities first.
                            </p>
                          </div>
                        ) : (
                          <select
                            value={cfg.filter_relationship_id ?? ''}
                            onChange={(e) => {
                              const rel = relationships.find(
                                (r) => r.relationship_definition_id === e.target.value,
                              );
                              patch({
                                filter_relationship_id: e.target.value || null,
                                filter_fk_column: rel?.lookup_field_physical_column ?? null,
                              });
                            }}
                            className={pi()}
                          >
                            <option value="">Select relationship…</option>
                            {relationships.map((r) => (
                              <option key={r.relationship_definition_id} value={r.relationship_definition_id}>
                                {r.display_name}
                              </option>
                            ))}
                          </select>
                        )}
                      </PropField>
                    </div>

                    {/* FK column — auto-filled by relationship but editable */}
                    <div className="mt-2">
                      <PropField label="FK Column on Target Entity">
                        <input
                          type="text"
                          value={cfg.filter_fk_column ?? ''}
                          onChange={(e) => patch({ filter_fk_column: e.target.value || null })}
                          placeholder="e.g. accountid"
                          className={`${pi()} font-mono`}
                        />
                      </PropField>
                    </div>

                    {/* Summary card */}
                    {cfg.filter_fk_column && cfg.filter_by_field_logical_name && (
                      <div className="mt-2 p-2.5 bg-green-50 border border-green-100 rounded-lg space-y-1">
                        <p className="text-[10px] font-semibold text-green-700 flex items-center gap-1">
                          <Info size={10} />
                          Filter will be applied:
                        </p>
                        <p className="text-[10px] text-green-600 leading-relaxed font-mono">
                          {control.field_display_name}.{cfg.filter_fk_column}
                          {' = '}
                          {selectedFilterField?.field_display_name ?? cfg.filter_by_field_logical_name}
                        </p>
                        <p className="text-[10px] text-green-500 leading-relaxed">
                          When the user changes{' '}
                          <strong>{selectedFilterField?.field_display_name ?? cfg.filter_by_field_logical_name}</strong>,
                          this lookup will be cleared and refiltered automatically.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Clear all */}
          {(cfg.default_view_id || cfg.filter_by_field_logical_name) && (
            <button
              onClick={() => onUpdate({
                target_entity_id: targetEntityId,
                default_view_id: null,
                filter_by_field_logical_name: null,
                filter_fk_column: null,
                filter_relationship_id: null,
              })}
              className="w-full text-[10px] text-slate-400 hover:text-red-500 transition-colors py-1 border border-dashed border-slate-200 hover:border-red-200 rounded-lg"
            >
              Clear lookup configuration
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Events Panel ─────────────────────────────────────────────────────────────

function EventsPanel({
  handlers, onAdd, onDelete,
}: {
  handlers: FormEventHandler[];
  onAdd: (h: Partial<FormEventHandler>) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newHandler, setNewHandler] = useState<Partial<FormEventHandler>>({
    event_type: 'onLoad',
    function_name: '',
    pass_execution_context: true,
    is_active: true,
  });

  const grouped = EVENT_TYPES.reduce((acc, et) => {
    acc[et] = handlers.filter((h) => h.event_type === et);
    return acc;
  }, {} as Record<EventType, FormEventHandler[]>);

  return (
    <div className="p-3 space-y-4">
      {EVENT_TYPES.map((et) => (
        <div key={et}>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{et}</p>
          {grouped[et].length === 0 ? (
            <p className="text-[10px] text-slate-300 px-1">No handlers</p>
          ) : (
            <div className="space-y-1">
              {grouped[et].map((h) => (
                <div key={h.handler_id} className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-slate-700 truncate">{h.function_name}</p>
                    {h.field_logical_name && (
                      <p className="text-[10px] text-slate-400 truncate">field: {h.field_logical_name}</p>
                    )}
                  </div>
                  {!h.is_active && <EyeOff size={10} className="text-slate-300 shrink-0" />}
                  <button onClick={() => onDelete(h.handler_id)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-blue-600 border-2 border-dashed border-blue-200 rounded-lg hover:border-blue-400 transition-colors"
        >
          <Plus size={12} />
          Add Handler
        </button>
      ) : (
        <div className="border border-slate-200 rounded-lg p-3 space-y-2.5">
          <p className="text-xs font-semibold text-slate-700">New Event Handler</p>
          <PropField label="Event">
            <select
              value={newHandler.event_type}
              onChange={(e) => setNewHandler({ ...newHandler, event_type: e.target.value as EventType })}
              className={pi()}
            >
              {EVENT_TYPES.map((et) => <option key={et} value={et}>{et}</option>)}
            </select>
          </PropField>
          {newHandler.event_type === 'onChange' && (
            <PropField label="Field (logical name)">
              <input
                type="text"
                value={newHandler.field_logical_name ?? ''}
                onChange={(e) => setNewHandler({ ...newHandler, field_logical_name: e.target.value || undefined })}
                className={pi()}
                placeholder="e.g. company_name"
              />
            </PropField>
          )}
          <PropField label="Function Name">
            <input
              type="text"
              value={newHandler.function_name ?? ''}
              onChange={(e) => setNewHandler({ ...newHandler, function_name: e.target.value })}
              className={pi()}
              placeholder="e.g. MyLib.onLoad"
            />
          </PropField>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (newHandler.function_name) {
                  onAdd(newHandler);
                  setAdding(false);
                  setNewHandler({ event_type: 'onLoad', function_name: '', pass_execution_context: true, is_active: true });
                }
              }}
              className="flex-1 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setAdding(false)}
              className="flex-1 py-1.5 border border-slate-200 text-xs rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scripts Panel ────────────────────────────────────────────────────────────

function ScriptsPanel({
  scripts, onAdd, onDelete,
}: {
  scripts: FormScript[];
  onAdd: (s: Partial<FormScript>) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newScript, setNewScript] = useState<Partial<FormScript>>({
    name: '',
    script_type: 'js_library',
    source_url: '',
    is_active: true,
  });

  return (
    <div className="p-3 space-y-3">
      {scripts.length === 0 && !adding && (
        <p className="text-xs text-slate-400 text-center py-4">No scripts configured</p>
      )}
      {scripts.map((s) => (
        <div key={s.script_id} className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{s.name}</p>
            <p className="text-[10px] text-blue-500 mt-0.5 truncate">
              {s.script_type === 'js_library' ? s.source_url : 'Inline script'}
            </p>
          </div>
          <button onClick={() => onDelete(s.script_id)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
            <X size={11} />
          </button>
        </div>
      ))}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-blue-600 border-2 border-dashed border-blue-200 rounded-lg hover:border-blue-400 transition-colors"
        >
          <Plus size={12} />
          Add Script Library
        </button>
      ) : (
        <div className="border border-slate-200 rounded-lg p-3 space-y-2.5">
          <p className="text-xs font-semibold text-slate-700">Add Script</p>
          <PropField label="Name">
            <input
              type="text"
              value={newScript.name ?? ''}
              onChange={(e) => setNewScript({ ...newScript, name: e.target.value })}
              className={pi()}
              placeholder="e.g. MyLibrary"
            />
          </PropField>
          <PropField label="Type">
            <select
              value={newScript.script_type}
              onChange={(e) => setNewScript({ ...newScript, script_type: e.target.value as 'js_library' | 'inline' })}
              className={pi()}
            >
              <option value="js_library">JS Library URL</option>
              <option value="inline">Inline Script</option>
            </select>
          </PropField>
          {newScript.script_type === 'js_library' ? (
            <PropField label="URL">
              <input
                type="text"
                value={newScript.source_url ?? ''}
                onChange={(e) => setNewScript({ ...newScript, source_url: e.target.value })}
                className={pi()}
                placeholder="https://..."
              />
            </PropField>
          ) : (
            <PropField label="Script Body">
              <textarea
                value={newScript.body ?? ''}
                onChange={(e) => setNewScript({ ...newScript, body: e.target.value })}
                className={`${pi()} resize-none font-mono`}
                rows={4}
                placeholder="// Your script..."
              />
            </PropField>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (newScript.name) {
                  onAdd(newScript);
                  setAdding(false);
                  setNewScript({ name: '', script_type: 'js_library', source_url: '', is_active: true });
                }
              }}
              className="flex-1 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setAdding(false)}
              className="flex-1 py-1.5 border border-slate-200 text-xs rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function PropSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function PropField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function PropToggle({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 cursor-pointer" onClick={() => onChange(!checked)}>
      <span className="text-xs text-slate-600">{label}</span>
      <div
        className={`relative rounded-full transition-colors shrink-0 ${checked ? 'bg-blue-500' : 'bg-slate-200'}`}
        style={{ height: '18px', width: '32px' }}
      >
        <div
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`}
        />
      </div>
    </div>
  );
}

function PropButton({
  label, icon, danger, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors ${
        danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function pi() {
  return 'w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-slate-700';
}
