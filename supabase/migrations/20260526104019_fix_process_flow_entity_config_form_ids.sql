/*
  # Fix Process Flow Entity Config Form IDs

  1. Changes
    - Update the lead entity config in the "Payment Gateway BPF-Lead-Opportunity" process flow
      to use the "Monty Pay" form instead of the generic "Default Form"
    - Update the opportunity entity config to explicitly use the "Opportunity Main Form"
      instead of falling back to the flow-level form_id (which is the lead "Monty Pay" form)

  2. Problem
    - Lead entity config pointed to "Default Form" which has fewer fields than "Monty Pay"
    - Opportunity entity config had NULL form_id, causing fallback to the lead form
    - This resulted in missing columns on the lead page and broken opportunity form

  3. Notes
    - Uses subqueries to resolve form_id by name + entity so the migration is portable
    - Only updates rows that match the specific process flow
*/

-- Fix lead entity config: point to "Monty Pay" form
UPDATE process_flow_entity_config
SET form_id = (
      SELECT fd.form_id FROM form_definition fd
      JOIN entity_definition ed ON ed.entity_definition_id = fd.entity_definition_id
      WHERE ed.logical_name = 'lead'
        AND fd.name = 'Monty Pay'
        AND fd.form_type = 'main'
        AND fd.is_active = true
        AND fd.deleted_at IS NULL
      LIMIT 1
    ),
    modified_at = now()
WHERE process_flow_id = (
      SELECT process_flow_id FROM process_flow
      WHERE name = 'Payment Gateway BPF-Lead-Opportunity'
        AND deleted_at IS NULL
      LIMIT 1
    )
  AND entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition
      WHERE logical_name = 'lead'
      LIMIT 1
    );

-- Fix opportunity entity config: point to "Opportunity Main Form"
UPDATE process_flow_entity_config
SET form_id = (
      SELECT fd.form_id FROM form_definition fd
      JOIN entity_definition ed ON ed.entity_definition_id = fd.entity_definition_id
      WHERE ed.logical_name = 'opportunity'
        AND fd.name = 'Opportunity Main Form'
        AND fd.form_type = 'main'
        AND fd.is_active = true
        AND fd.deleted_at IS NULL
      LIMIT 1
    ),
    modified_at = now()
WHERE process_flow_id = (
      SELECT process_flow_id FROM process_flow
      WHERE name = 'Payment Gateway BPF-Lead-Opportunity'
        AND deleted_at IS NULL
      LIMIT 1
    )
  AND entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition
      WHERE logical_name = 'opportunity'
      LIMIT 1
    );
