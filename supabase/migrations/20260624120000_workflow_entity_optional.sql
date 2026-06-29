-- Decouple workflows from a single owning entity (Power-Automate-style):
-- a flow is created first, then the table is chosen INSIDE the trigger. The
-- entity therefore becomes optional on the workflow definition. The FK is kept
-- (so a set value still references a real entity) but NULL is now allowed for
-- scheduled/manual flows or flows whose table is picked later in the editor.
ALTER TABLE workflow_definition
  ALTER COLUMN entity_definition_id DROP NOT NULL;
