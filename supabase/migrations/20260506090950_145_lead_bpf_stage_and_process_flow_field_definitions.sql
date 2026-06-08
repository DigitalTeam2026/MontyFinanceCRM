/*
  # Lead BPF Stage and Process Flow Field Definitions

  ## Summary
  Registers field_definition records for the two new columns added to the lead
  table in migration 140: bpf_stage and process_flow_id.

  Also registers the process_flow_id field on opportunity so both fields are
  visible and manageable in the Fields Management admin screen.

  ## New Fields

  ### On 'lead' entity
  - `bpfstage` → text, physical: bpf_stage
    The current BPF stage key. Separate from status_code lifecycle status.
    is_system = true (platform infrastructure, not end-user custom field).
    is_deletable = false (removing it would break BPF rendering).

  - `processflowid` (lead) → lookup → process_flow entity
    Which process flow this lead is currently on.
    is_system = true, is_deletable = false.

  ### On 'opportunity' entity
  - `processflowid` (opportunity) → lookup → process_flow entity
    Which process flow this opportunity is currently on.
    is_system = true, is_deletable = false.

  ## Notes
  - process_flow is not a standard CRM entity registered in entity_definition.
    These lookup fields use ft_text as fallback and store UUID strings,
    since the lookup_entity_id requires an entity_definition row.
    The process_flow_id FK is enforced at the DB level regardless.
  - bpf_stage is registered as text type; it stores stage_key strings.

  ## Security
  No RLS changes.
*/

DO $$
DECLARE
  v_eid_lead       uuid;
  v_eid_opp        uuid;
  ft_text          uuid;
BEGIN

  SELECT entity_definition_id INTO v_eid_lead FROM entity_definition WHERE logical_name = 'lead'        LIMIT 1;
  SELECT entity_definition_id INTO v_eid_opp  FROM entity_definition WHERE logical_name = 'opportunity' LIMIT 1;
  SELECT field_type_id         INTO ft_text    FROM field_type           WHERE name = 'text'             LIMIT 1;

  -- bpf_stage on lead
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    description,
    is_required, is_searchable, is_sortable, is_filterable,
    is_custom, is_system, is_deletable, is_schema_editable, sort_order
  ) VALUES (
    v_eid_lead, ft_text, 'bpfstage', 'BPF Stage', 'bpf_stage',
    'Current Business Process Flow stage key for this lead',
    false, false, true, true,
    false, true, false, false, 95
  ) ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- process_flow_id on lead (stored as text logical name; FK enforced at DB level)
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    description,
    is_required, is_searchable, is_sortable, is_filterable,
    is_custom, is_system, is_deletable, is_schema_editable, sort_order
  ) VALUES (
    v_eid_lead, ft_text, 'leadprocessflowid', 'Process Flow', 'process_flow_id',
    'The process flow this lead is currently assigned to',
    false, false, false, true,
    false, true, false, false, 96
  ) ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- process_flow_id on opportunity
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    description,
    is_required, is_searchable, is_sortable, is_filterable,
    is_custom, is_system, is_deletable, is_schema_editable, sort_order
  ) VALUES (
    v_eid_opp, ft_text, 'oppprocessflowid', 'Process Flow', 'process_flow_id',
    'The process flow this opportunity is currently assigned to',
    false, false, false, true,
    false, true, false, false, 96
  ) ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

END $$;
