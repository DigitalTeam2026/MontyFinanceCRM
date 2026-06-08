/*
  # Business Rule Scope Redesign

  ## Summary
  Changes the scope model for business rules from three values
  (all, main_form, quick_create) to two clearer values:

  - all_forms     — entity-level; rule applies on every form, quick create,
                    and any other context where the entity is rendered
  - specific_form — rule applies only to a single named form identified by
                    target_form_id (FK → form_definition.form_id)

  ## Changes
  1. Drop the old scope check constraint first, then do the data migration,
     then add the new constraint.
  2. New column `target_form_id` on `business_rule`
  3. Scope values migrated: all → all_forms, main_form/quick_create → specific_form
*/

ALTER TABLE business_rule DROP CONSTRAINT IF EXISTS business_rule_scope_check;

ALTER TABLE business_rule
  ADD COLUMN IF NOT EXISTS target_form_id uuid REFERENCES form_definition(form_id) ON DELETE SET NULL;

UPDATE business_rule SET scope = 'all_forms'      WHERE scope = 'all';
UPDATE business_rule SET scope = 'specific_form'  WHERE scope IN ('main_form', 'quick_create');

ALTER TABLE business_rule
  ADD CONSTRAINT business_rule_scope_check
  CHECK (scope IN ('all_forms', 'specific_form'));
