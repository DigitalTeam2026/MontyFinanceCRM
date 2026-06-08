/*
  # Drop status column from all tables and add topic to lead

  ## Changes

  1. Drop `status` (text) column from every table that has it:
     - activity_log, crm_user, duplicate_job, merge_candidate
     - process_flow_instance, process_instances, product, product_family
     - record_transformation_instance, scheduled_workflow_step
     - workflow_run_log, workflow_step_log

  2. Deactivate all `status` field_definitions (already inactive, ensure clean state)

  3. Add `topic` (text) column to the `lead` table

  4. Register `topic` as a system field_definition on the lead entity

  Notes:
  - status was a legacy "Active/Inactive" choice field replaced by state_code/status_reason
  - All field_definitions for status were already marked is_active = false
  - topic on lead mirrors the Dynamics 365 lead topic/subject field
*/

-- ── 1. Drop status column from all tables that have it ───────────────────────

ALTER TABLE activity_log                   DROP COLUMN IF EXISTS status;
ALTER TABLE crm_user                       DROP COLUMN IF EXISTS status;
ALTER TABLE duplicate_job                  DROP COLUMN IF EXISTS status;
ALTER TABLE merge_candidate                DROP COLUMN IF EXISTS status;
ALTER TABLE process_flow_instance          DROP COLUMN IF EXISTS status;
ALTER TABLE process_instances              DROP COLUMN IF EXISTS status;
ALTER TABLE product                        DROP COLUMN IF EXISTS status;
ALTER TABLE product_family                 DROP COLUMN IF EXISTS status;
ALTER TABLE record_transformation_instance DROP COLUMN IF EXISTS status;
ALTER TABLE scheduled_workflow_step        DROP COLUMN IF EXISTS status;
ALTER TABLE workflow_run_log               DROP COLUMN IF EXISTS status;
ALTER TABLE workflow_step_log              DROP COLUMN IF EXISTS status;

-- ── 2. Ensure all status field_definitions are deactivated ───────────────────

UPDATE field_definition
SET is_active = false
WHERE physical_column_name = 'status';

-- ── 3. Add topic column to lead ───────────────────────────────────────────────

ALTER TABLE lead ADD COLUMN IF NOT EXISTS topic text;

-- ── 4. Register topic as a system field_definition on lead ────────────────────

INSERT INTO field_definition (
  entity_definition_id,
  logical_name,
  display_name,
  physical_column_name,
  field_type_id,
  is_system,
  is_active,
  is_required,
  is_searchable,
  sort_order
)
SELECT
  ed.entity_definition_id,
  'topic',
  'Topic',
  'topic',
  (SELECT field_type_id FROM field_type WHERE name = 'text' LIMIT 1),
  true,
  true,
  false,
  true,
  50
FROM entity_definition ed
WHERE ed.logical_name = 'lead'
ON CONFLICT (entity_definition_id, logical_name) DO UPDATE
  SET
    physical_column_name = 'topic',
    display_name         = 'Topic',
    is_system            = true,
    is_active            = true;

-- ── 5. Reload PostgREST schema cache ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
