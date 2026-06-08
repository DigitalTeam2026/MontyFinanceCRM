/*
  # Cross-Entity Process Flow Stages & Conditional Transitions

  ## Summary
  Extends the process flow system with two major capabilities:

  ### 1. Cross-Entity Stages
  A single process flow can span multiple CRM entities. For example, a flow
  starting on Lead can continue on the Opportunity entity after qualification.
  Stages can now optionally "target" a linked entity record via a named
  relationship, so the stage bar shows the flow continuing on the related record.

  ### New Columns on `process_stage`
  - `target_entity_id` — if set, this stage operates on a linked record of
    a different entity (e.g. opportunity linked via originating_lead)
  - `target_relationship_name` — the FK/relationship name used to traverse
    from the primary record to the linked record (e.g. "originating_lead")
  - `create_linked_record` — boolean: when entering this stage, should the
    system auto-create the linked record if it doesn't exist yet?

  ### 2. Conditional Transitions (Branching)
  Transitions can now carry field-level conditions and a priority order.
  When multiple transitions exist from the same stage, the engine evaluates
  them in ascending priority order and takes the FIRST one whose conditions
  all pass. This enables "if lead_score >= 80 → Fast-Track, else → Standard".

  ### New Columns on `process_flow_transition`
  - `conditions` — jsonb array of { field, operator, value } conditions (AND logic)
  - `priority` — integer (default 100), lower = evaluated first
  - `is_default` — boolean: this transition fires when no conditional transition matches

  ### Security
  - No new RLS tables; existing policies cover the modified columns.
  - Added indexes for the new priority ordering query.
*/

-- ─── process_stage: cross-entity fields ──────────────────────────────────────

ALTER TABLE process_stage
  ADD COLUMN IF NOT EXISTS target_entity_id uuid
    REFERENCES entity_definition(entity_definition_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_relationship_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS create_linked_record boolean NOT NULL DEFAULT false;

-- ─── process_flow_transition: conditional branching ──────────────────────────

ALTER TABLE process_flow_transition
  ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Index to efficiently fetch transitions for a from_stage ordered by priority
CREATE INDEX IF NOT EXISTS idx_pft_from_stage_priority
  ON process_flow_transition (from_stage_id, priority);
