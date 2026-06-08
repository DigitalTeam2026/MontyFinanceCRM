
/*
  # Migration 2: Platform Metadata & Low-Code Foundation

  ## Overview
  Establishes the metadata/customization layer that enables dynamic form rendering,
  view configuration, business rules, and workflow automation. This is the engine
  that makes the CRM behave like a platform (Dynamics-style) rather than a fixed app.

  ## New Tables

  ### Entity & Field Metadata
  - `field_type` — Catalog of supported field data types (text, number, lookup, etc.)
  - `entity_definition` — Registry of all CRM entities (standard and future custom ones)
  - `option_set` — Named sets of choices (e.g. "Lead Status", "Priority")
  - `option_set_value` — Individual values within an option set
  - `field_definition` — All fields for each entity with type, display, and validation metadata

  ### Form Metadata
  - `form_definition` — Form layouts per entity (main form, quick create, quick view)
  - `form_section` — Tabs and sections within a form
  - `form_control` — Individual field controls within a section

  ### View Metadata
  - `view_definition` — Saved views per entity with filter and sort configuration
  - `view_column` — Column definitions for each view

  ### Subgrid
  - `subgrid_definition` — Related list configurations shown within forms

  ### Automation
  - `business_rule` — Lightweight UI/data rules (show/hide, required, default values)
  - `workflow_definition` — Process automation definitions (on create, on update, etc.)
  - `workflow_step` — Individual steps within a workflow

  ## Security
  - RLS enabled on all tables
  - All metadata is readable by authenticated users
  - Write access restricted to authenticated users (admin enforcement via app layer)
*/

-- ─────────────────────────────────────────────
-- FIELD TYPE
-- Catalog of supported field data types
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_type (
  field_type_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  description     text,
  sort_order      integer NOT NULL DEFAULT 0
);

ALTER TABLE field_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view field types"
  ON field_type FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert field types"
  ON field_type FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update field types"
  ON field_type FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- ENTITY DEFINITION
-- Registry of all CRM entities
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entity_definition (
  entity_definition_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logical_name            text NOT NULL UNIQUE,
  display_name            text NOT NULL,
  display_name_plural     text NOT NULL,
  physical_table_name     text NOT NULL,
  primary_field_name      text NOT NULL DEFAULT 'name',
  description             text,
  icon_name               text,
  is_custom               boolean NOT NULL DEFAULT false,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  modified_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE entity_definition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view entity definitions"
  ON entity_definition FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert entity definitions"
  ON entity_definition FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update entity definitions"
  ON entity_definition FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- OPTION SET
-- Named sets of choices (e.g. "Lead Status")
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS option_set (
  option_set_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  description     text,
  is_global       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  modified_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE option_set ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view option sets"
  ON option_set FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert option sets"
  ON option_set FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update option sets"
  ON option_set FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- OPTION SET VALUE
-- Individual values within an option set
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS option_set_value (
  option_set_value_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_set_id         uuid NOT NULL REFERENCES option_set(option_set_id) ON DELETE CASCADE,
  value                 text NOT NULL,
  display_label         text NOT NULL,
  color                 text,
  sort_order            integer NOT NULL DEFAULT 0,
  is_default            boolean NOT NULL DEFAULT false,
  is_active             boolean NOT NULL DEFAULT true,
  UNIQUE(option_set_id, value)
);

CREATE INDEX IF NOT EXISTS idx_option_set_value_set ON option_set_value(option_set_id);

ALTER TABLE option_set_value ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view option set values"
  ON option_set_value FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert option set values"
  ON option_set_value FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update option set values"
  ON option_set_value FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete option set values"
  ON option_set_value FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- FIELD DEFINITION
-- All fields for each entity with metadata
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_definition (
  field_definition_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_definition_id    uuid NOT NULL REFERENCES entity_definition(entity_definition_id) ON DELETE CASCADE,
  field_type_id           uuid NOT NULL REFERENCES field_type(field_type_id),
  option_set_id           uuid REFERENCES option_set(option_set_id),
  lookup_entity_id        uuid REFERENCES entity_definition(entity_definition_id),
  logical_name            text NOT NULL,
  display_name            text NOT NULL,
  physical_column_name    text NOT NULL,
  description             text,
  placeholder             text,
  default_value           text,
  max_length              integer,
  min_value               numeric,
  max_value               numeric,
  is_required             boolean NOT NULL DEFAULT false,
  is_searchable           boolean NOT NULL DEFAULT true,
  is_sortable             boolean NOT NULL DEFAULT true,
  is_filterable           boolean NOT NULL DEFAULT true,
  is_custom               boolean NOT NULL DEFAULT false,
  is_active               boolean NOT NULL DEFAULT true,
  sort_order              integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  modified_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_definition_id, logical_name)
);

CREATE INDEX IF NOT EXISTS idx_field_definition_entity ON field_definition(entity_definition_id);
CREATE INDEX IF NOT EXISTS idx_field_definition_type ON field_definition(field_type_id);

ALTER TABLE field_definition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view field definitions"
  ON field_definition FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert field definitions"
  ON field_definition FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update field definitions"
  ON field_definition FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete field definitions"
  ON field_definition FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- FORM DEFINITION
-- Form layouts per entity
-- form_type: 'main' | 'quick_create' | 'quick_view' | 'card'
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_definition (
  form_id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_definition_id    uuid NOT NULL REFERENCES entity_definition(entity_definition_id) ON DELETE CASCADE,
  name                    text NOT NULL,
  form_type               text NOT NULL DEFAULT 'main' CHECK (form_type IN ('main', 'quick_create', 'quick_view', 'card')),
  description             text,
  is_default              boolean NOT NULL DEFAULT false,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  modified_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_definition_entity ON form_definition(entity_definition_id);

ALTER TABLE form_definition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view form definitions"
  ON form_definition FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert form definitions"
  ON form_definition FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update form definitions"
  ON form_definition FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete form definitions"
  ON form_definition FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- FORM SECTION
-- Tabs and sections within a form
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_section (
  section_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         uuid NOT NULL REFERENCES form_definition(form_id) ON DELETE CASCADE,
  tab_name        text NOT NULL DEFAULT 'General',
  section_name    text NOT NULL,
  description     text,
  columns         integer NOT NULL DEFAULT 2 CHECK (columns IN (1, 2, 3)),
  display_order   integer NOT NULL DEFAULT 0,
  is_visible      boolean NOT NULL DEFAULT true,
  is_collapsed    boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_form_section_form ON form_section(form_id);

ALTER TABLE form_section ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view form sections"
  ON form_section FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert form sections"
  ON form_section FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update form sections"
  ON form_section FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete form sections"
  ON form_section FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- FORM CONTROL
-- Individual field controls within a section
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_control (
  control_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id              uuid NOT NULL REFERENCES form_section(section_id) ON DELETE CASCADE,
  field_definition_id     uuid NOT NULL REFERENCES field_definition(field_definition_id) ON DELETE CASCADE,
  label_override          text,
  display_order           integer NOT NULL DEFAULT 0,
  column_span             integer NOT NULL DEFAULT 1 CHECK (column_span IN (1, 2, 3)),
  is_visible              boolean NOT NULL DEFAULT true,
  is_readonly             boolean NOT NULL DEFAULT false,
  is_required_override    boolean,
  custom_css_class        text
);

CREATE INDEX IF NOT EXISTS idx_form_control_section ON form_control(section_id);
CREATE INDEX IF NOT EXISTS idx_form_control_field ON form_control(field_definition_id);

ALTER TABLE form_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view form controls"
  ON form_control FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert form controls"
  ON form_control FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update form controls"
  ON form_control FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete form controls"
  ON form_control FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- VIEW DEFINITION
-- Saved views per entity with filter and sort
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS view_definition (
  view_id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_definition_id    uuid NOT NULL REFERENCES entity_definition(entity_definition_id) ON DELETE CASCADE,
  name                    text NOT NULL,
  view_type               text NOT NULL DEFAULT 'public' CHECK (view_type IN ('public', 'personal', 'system')),
  description             text,
  filter_json             jsonb,
  sort_json               jsonb,
  is_default              boolean NOT NULL DEFAULT false,
  is_active               boolean NOT NULL DEFAULT true,
  created_by              uuid REFERENCES crm_user(user_id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  modified_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_view_definition_entity ON view_definition(entity_definition_id);

ALTER TABLE view_definition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view public and system views"
  ON view_definition FOR SELECT
  TO authenticated
  USING (view_type IN ('public', 'system') OR created_by = auth.uid());

CREATE POLICY "Authenticated users can insert views"
  ON view_definition FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own views"
  ON view_definition FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR view_type = 'system')
  WITH CHECK (created_by = auth.uid() OR view_type = 'system');

CREATE POLICY "Users can delete their own views"
  ON view_definition FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- ─────────────────────────────────────────────
-- VIEW COLUMN
-- Column definitions for each view
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS view_column (
  view_column_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  view_id                 uuid NOT NULL REFERENCES view_definition(view_id) ON DELETE CASCADE,
  field_definition_id     uuid NOT NULL REFERENCES field_definition(field_definition_id) ON DELETE CASCADE,
  display_order           integer NOT NULL DEFAULT 0,
  width                   integer,
  is_sortable             boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_view_column_view ON view_column(view_id);

ALTER TABLE view_column ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view view columns"
  ON view_column FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert view columns"
  ON view_column FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update view columns"
  ON view_column FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete view columns"
  ON view_column FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- SUBGRID DEFINITION
-- Related list configurations shown within forms
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subgrid_definition (
  subgrid_id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_section_id               uuid NOT NULL REFERENCES form_section(section_id) ON DELETE CASCADE,
  related_entity_definition_id  uuid NOT NULL REFERENCES entity_definition(entity_definition_id),
  relationship_field            text NOT NULL,
  name                          text NOT NULL,
  view_id                       uuid REFERENCES view_definition(view_id),
  display_order                 integer NOT NULL DEFAULT 0,
  rows_to_show                  integer NOT NULL DEFAULT 5,
  is_visible                    boolean NOT NULL DEFAULT true,
  allow_create                  boolean NOT NULL DEFAULT true,
  allow_associate               boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_subgrid_section ON subgrid_definition(form_section_id);
CREATE INDEX IF NOT EXISTS idx_subgrid_entity ON subgrid_definition(related_entity_definition_id);

ALTER TABLE subgrid_definition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view subgrid definitions"
  ON subgrid_definition FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert subgrid definitions"
  ON subgrid_definition FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update subgrid definitions"
  ON subgrid_definition FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete subgrid definitions"
  ON subgrid_definition FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- BUSINESS RULE
-- Lightweight UI/data rules (show/hide, required, default values)
-- trigger_json: conditions that activate the rule
-- action_json: what the rule does when triggered
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_rule (
  business_rule_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_definition_id    uuid NOT NULL REFERENCES entity_definition(entity_definition_id) ON DELETE CASCADE,
  name                    text NOT NULL,
  description             text,
  trigger_json            jsonb NOT NULL DEFAULT '{}',
  action_json             jsonb NOT NULL DEFAULT '{}',
  scope                   text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'main_form', 'quick_create')),
  is_active               boolean NOT NULL DEFAULT true,
  created_by              uuid REFERENCES crm_user(user_id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  modified_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_rule_entity ON business_rule(entity_definition_id);

ALTER TABLE business_rule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view business rules"
  ON business_rule FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert business rules"
  ON business_rule FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update business rules"
  ON business_rule FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete business rules"
  ON business_rule FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- WORKFLOW DEFINITION
-- Process automation definitions
-- trigger_type: 'on_create' | 'on_update' | 'on_delete' | 'on_status_change' | 'scheduled' | 'manual'
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_definition (
  workflow_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_definition_id    uuid NOT NULL REFERENCES entity_definition(entity_definition_id) ON DELETE CASCADE,
  name                    text NOT NULL,
  description             text,
  trigger_type            text NOT NULL CHECK (trigger_type IN ('on_create', 'on_update', 'on_delete', 'on_status_change', 'scheduled', 'manual')),
  trigger_conditions      jsonb,
  run_as                  text NOT NULL DEFAULT 'owner' CHECK (run_as IN ('owner', 'system')),
  is_active               boolean NOT NULL DEFAULT true,
  created_by              uuid REFERENCES crm_user(user_id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  modified_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_definition_entity ON workflow_definition(entity_definition_id);

ALTER TABLE workflow_definition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view workflow definitions"
  ON workflow_definition FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert workflow definitions"
  ON workflow_definition FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update workflow definitions"
  ON workflow_definition FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete workflow definitions"
  ON workflow_definition FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- WORKFLOW STEP
-- Individual steps within a workflow
-- step_type: 'assign' | 'send_email' | 'create_record' | 'update_field'
--            | 'condition' | 'wait' | 'approval' | 'webhook'
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_step (
  workflow_step_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id         uuid NOT NULL REFERENCES workflow_definition(workflow_id) ON DELETE CASCADE,
  step_type           text NOT NULL CHECK (step_type IN (
                        'assign', 'send_email', 'create_record', 'update_field',
                        'condition', 'wait', 'approval', 'webhook', 'notification'
                      )),
  name                text NOT NULL,
  step_order          integer NOT NULL DEFAULT 0,
  config_json         jsonb NOT NULL DEFAULT '{}',
  next_step_id        uuid REFERENCES workflow_step(workflow_step_id),
  next_step_on_false  uuid REFERENCES workflow_step(workflow_step_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_step_workflow ON workflow_step(workflow_id);

ALTER TABLE workflow_step ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view workflow steps"
  ON workflow_step FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert workflow steps"
  ON workflow_step FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update workflow steps"
  ON workflow_step FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete workflow steps"
  ON workflow_step FOR DELETE
  TO authenticated
  USING (true);
