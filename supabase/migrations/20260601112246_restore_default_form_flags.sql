/*
  # Restore is_default flags on form definitions

  1. Changes
    - The publish function incorrectly set is_default = true on the POS form and
      is_default = false on the actual Default Form for leads
    - This migration restores the correct flags
    - Only the "Default Form" should be is_default = true for the lead entity main forms

  2. Affected Tables
    - `form_definition` - restoring correct is_default flags
*/

-- Set POS form back to is_default = false
UPDATE form_definition
SET is_default = false
WHERE form_id = '70546c47-1e1b-454e-b91a-8f07f53eced2'
  AND is_default = true;

-- Restore Default Form as is_default = true
UPDATE form_definition
SET is_default = true
WHERE form_id = 'e7781cd5-3a91-4ca2-8e65-d524b3712941'
  AND is_default = false;
