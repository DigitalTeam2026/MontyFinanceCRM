/*
  # BPF Designer — Draft / Publish support

  ## Summary
  Adds a draft layer to the Business Process Flow designer so edits can be saved
  as a draft WITHOUT touching the live (published) flow, and applied atomically
  only when the user clicks Publish.

  ## Schema changes (process_flow only)
  - draft_json        jsonb        — serialized working model (stages, transitions,
                                      stage fields, entity configs, flow scalars).
  - has_draft         boolean      — true when an unpublished draft exists.
  - draft_modified_at timestamptz  — when the draft was last saved.
  - draft_modified_by uuid         — who saved the draft.

  These columns are ignored by the runtime engine (it never reads them), so adding
  them is byte-for-byte safe for records currently using the flow.

  ## New function
  - publish_process_flow_draft(p_flow_id uuid, p_snapshot jsonb)
    SECURITY DEFINER, service_role only (called by the admin-process-flow Edge
    Function after it validates the caller is a system admin — same pattern as
    soft_delete_process_flow). Applies a fully ID-resolved snapshot to the live
    child tables in ONE transaction:
      * UPSERTS stages by process_stage_id (so surviving stages keep their UUIDs
        and in-flight records' active_process_stage_id stays valid),
      * deletes stages removed in the draft,
      * replaces stage fields / transitions / entity configs,
      * updates flow scalars + default_stage_id,
      * clears the draft.

  The snapshot is expected to already have every temp id resolved to a real UUID
  on the client (only newly-added stages get fresh UUIDs; existing stages keep
  theirs). No id remapping happens here.
*/

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Draft columns on process_flow
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE process_flow
  ADD COLUMN IF NOT EXISTS draft_json        jsonb,
  ADD COLUMN IF NOT EXISTS has_draft         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_modified_at timestamptz,
  ADD COLUMN IF NOT EXISTS draft_modified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Publish RPC
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_process_flow_draft(
  p_flow_id  uuid,
  p_snapshot jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_flow jsonb := p_snapshot->'flow';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM process_flow WHERE process_flow_id = p_flow_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Process flow not found';
  END IF;

  -- Defer FK checks (default_stage_id is DEFERRABLE) until commit.
  SET CONSTRAINTS ALL DEFERRED;

  -- Detach the flow's default pointer up front so removed stages can be deleted.
  UPDATE process_flow SET default_stage_id = NULL WHERE process_flow_id = p_flow_id;

  -- ── Stages: upsert by id (surviving stages keep their UUID → records stay valid) ──
  INSERT INTO process_stage AS ps
  SELECT (jsonb_populate_record(
            NULL::process_stage,
            -- defaults first (fill NOT NULL columns the client may omit on new stages),
            -- then the element, then forced flow id + timestamps.
            jsonb_build_object(
              'is_terminal',          false,
              'stage_visible_fields', '[]'::jsonb,
              'gate_required_fields', '[]'::jsonb,
              'gate_conditions',      '[]'::jsonb,
              'entry_rules',          '[]'::jsonb,
              'exit_rules',           '[]'::jsonb,
              'target_relationship_name', '',
              'create_linked_record', false
            )
            || elem
            || jsonb_build_object(
                 'process_flow_id', p_flow_id,
                 'created_at',      COALESCE(elem->>'created_at', now()::text),
                 'modified_at',     now()::text
               )
         )).*
  FROM jsonb_array_elements(COALESCE(p_snapshot->'stages', '[]'::jsonb)) elem
  ON CONFLICT (process_stage_id) DO UPDATE SET
    component_type            = EXCLUDED.component_type,
    name                      = EXCLUDED.name,
    description               = EXCLUDED.description,
    stage_key                 = EXCLUDED.stage_key,
    display_order             = EXCLUDED.display_order,
    stage_color               = EXCLUDED.stage_color,
    stage_type                = EXCLUDED.stage_type,
    stage_category            = EXCLUDED.stage_category,
    is_default                = EXCLUDED.is_default,
    is_fixed                  = EXCLUDED.is_fixed,
    is_terminal               = EXCLUDED.is_terminal,
    probability               = EXCLUDED.probability,
    allow_backward_movement   = EXCLUDED.allow_backward_movement,
    requires_entry_approval   = EXCLUDED.requires_entry_approval,
    requires_exit_approval    = EXCLUDED.requires_exit_approval,
    entry_rules               = EXCLUDED.entry_rules,
    exit_rules                = EXCLUDED.exit_rules,
    allowed_transitions       = EXCLUDED.allowed_transitions,
    stage_visible_fields      = EXCLUDED.stage_visible_fields,
    gate_required_fields      = EXCLUDED.gate_required_fields,
    gate_conditions           = EXCLUDED.gate_conditions,
    target_entity_id          = EXCLUDED.target_entity_id,
    stage_entity_id           = EXCLUDED.stage_entity_id,
    target_relationship_name  = EXCLUDED.target_relationship_name,
    relationship_definition_id = EXCLUDED.relationship_definition_id,
    create_linked_record      = EXCLUDED.create_linked_record,
    branch_yes_stage_id       = EXCLUDED.branch_yes_stage_id,
    branch_no_stage_id        = EXCLUDED.branch_no_stage_id,
    condition_entity_id       = EXCLUDED.condition_entity_id,
    condition_field           = EXCLUDED.condition_field,
    condition_operator        = EXCLUDED.condition_operator,
    condition_value           = EXCLUDED.condition_value,
    condition_rules           = EXCLUDED.condition_rules,
    modified_at               = now();

  -- Delete stages that were removed in the draft.
  DELETE FROM process_stage
  WHERE process_flow_id = p_flow_id
    AND process_stage_id NOT IN (
      SELECT (elem->>'process_stage_id')::uuid
      FROM jsonb_array_elements(COALESCE(p_snapshot->'stages', '[]'::jsonb)) elem
    );

  -- ── Stage fields: replace all for this flow (leaf table, no inbound FKs) ──
  DELETE FROM process_stage_fields WHERE process_flow_id = p_flow_id;
  INSERT INTO process_stage_fields
  SELECT (jsonb_populate_record(
            NULL::process_stage_fields,
            elem || jsonb_build_object(
                      'process_flow_id', p_flow_id,
                      'created_at',  COALESCE(elem->>'created_at', now()::text),
                      'modified_at', now()::text
                    )
         )).*
  FROM jsonb_array_elements(COALESCE(p_snapshot->'stageFields', '[]'::jsonb)) elem;

  -- ── Transitions: replace all for this flow (leaf table) ──
  DELETE FROM process_flow_transition WHERE process_flow_id = p_flow_id;
  INSERT INTO process_flow_transition
  SELECT (jsonb_populate_record(
            NULL::process_flow_transition,
            elem || jsonb_build_object(
                      'process_flow_id', p_flow_id,
                      'created_at', COALESCE(elem->>'created_at', now()::text)
                    )
         )).*
  FROM jsonb_array_elements(COALESCE(p_snapshot->'transitions', '[]'::jsonb)) elem;

  -- ── Entity configs: replace all for this flow (leaf table) ──
  DELETE FROM process_flow_entity_config WHERE process_flow_id = p_flow_id;
  INSERT INTO process_flow_entity_config
  SELECT (jsonb_populate_record(
            NULL::process_flow_entity_config,
            elem || jsonb_build_object(
                      'process_flow_id', p_flow_id,
                      'created_at',  COALESCE(elem->>'created_at', now()::text),
                      'modified_at', now()::text
                    )
         )).*
  FROM jsonb_array_elements(COALESCE(p_snapshot->'entityConfigs', '[]'::jsonb)) elem;

  -- ── Flow scalars + default stage + clear draft ──
  UPDATE process_flow SET
    name                 = COALESCE(v_flow->>'name', name),
    description          = COALESCE(v_flow->>'description', description),
    entity_definition_id = COALESCE((v_flow->>'entity_definition_id')::uuid, entity_definition_id),
    lob_id               = (v_flow->>'lob_id')::uuid,
    product_id           = (v_flow->>'product_id')::uuid,
    form_id              = (v_flow->>'form_id')::uuid,
    stage_field          = COALESCE(v_flow->>'stage_field', stage_field),
    is_active            = COALESCE((v_flow->>'is_active')::boolean, is_active),
    default_stage_id     = (v_flow->>'default_stage_id')::uuid,
    has_draft            = false,
    draft_json           = NULL,
    draft_modified_at    = NULL,
    draft_modified_by    = NULL,
    modified_at          = now()
  WHERE process_flow_id = p_flow_id;
END;
$$;

-- Only service_role (via the admin Edge Function) may publish.
REVOKE ALL ON FUNCTION public.publish_process_flow_draft(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_process_flow_draft(uuid, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.publish_process_flow_draft(uuid, jsonb) TO service_role;
