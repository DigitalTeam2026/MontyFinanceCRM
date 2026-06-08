/*
  # Fix MontyPay-PG form layout_json format

  1. Modified Tables
    - `form_definition`
      - Wraps the layout_json for form "MontyPay-PG" (bc9e76aa-e2f3-47fd-b0f9-67539ab0c535)
        from a bare JSON array of tabs into the expected `{tabs: [...]}` object format
  
  2. Important Notes
    - The form designer stores layout_json as `{tabs: [...]}`
    - This form had its layout stored as a bare array `[...]` which caused
      a crash when accessing `layout.tabs`
    - Also fixes any other form_definition rows with the same issue
*/

UPDATE form_definition
SET layout_json = jsonb_build_object('tabs', layout_json)
WHERE jsonb_typeof(layout_json) = 'array';
