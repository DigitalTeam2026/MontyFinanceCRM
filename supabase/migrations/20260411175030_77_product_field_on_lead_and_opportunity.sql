/*
  # Product Field on Lead and Opportunity

  ## Summary
  Adds a product_id foreign-key column to the lead and opportunity tables, plus
  corresponding field_definition metadata rows so the field appears in the CRM
  form designer and renderer.

  ## Changes

  ### Table: lead
  - New column `product_id uuid` — nullable FK to product(product_id)

  ### Table: opportunity
  - New column `product_id uuid` — nullable FK to product(product_id)

  ### field_definition rows
  - Lead → 'productid' / 'Product' / physical 'product_id' / type 'choice' /
    config_json { "control": "product_picker" }
  - Opportunity → same pattern

  ## Notes
  - Field type is seeded as 'choice' with a custom config_json flag so the
    FieldControl component can render a dynamic product-picker dropdown
    (products are fetched at runtime, not stored in a static option set).
  - The physical column uses a standard UUID FK to the product table.
  - RLS on the product table already governs which products a user can see;
    the picker will query only accessible active products.
*/

-- ─── 1. Physical columns ──────────────────────────────────────────────────────

ALTER TABLE lead
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES product(product_id) ON DELETE SET NULL;

ALTER TABLE opportunity
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES product(product_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lead_product_id ON lead(product_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_product_id ON opportunity(product_id);

-- ─── 2. Field definitions ─────────────────────────────────────────────────────

DO $$
DECLARE
  eid_lead         uuid;
  eid_opportunity  uuid;
  ft_choice        uuid;
BEGIN
  SELECT entity_definition_id INTO eid_lead
    FROM entity_definition WHERE logical_name = 'lead';

  SELECT entity_definition_id INTO eid_opportunity
    FROM entity_definition WHERE logical_name = 'opportunity';

  SELECT field_type_id INTO ft_choice
    FROM field_type WHERE name = 'choice';

  -- Lead: product field
  IF eid_lead IS NOT NULL AND ft_choice IS NOT NULL THEN
    INSERT INTO field_definition (
      entity_definition_id, field_type_id,
      logical_name, display_name, physical_column_name,
      description, placeholder,
      is_required, is_searchable, is_sortable, is_filterable,
      is_custom, is_active, is_system, is_deletable, is_schema_editable,
      sort_order, config_json
    ) VALUES (
      eid_lead, ft_choice,
      'productid', 'Product', 'product_id',
      'The product associated with this lead',
      'Select a product...',
      false, true, true, true,
      false, true, false, true, false,
      85, '{"control":"product_picker"}'::jsonb
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Opportunity: product field
  IF eid_opportunity IS NOT NULL AND ft_choice IS NOT NULL THEN
    INSERT INTO field_definition (
      entity_definition_id, field_type_id,
      logical_name, display_name, physical_column_name,
      description, placeholder,
      is_required, is_searchable, is_sortable, is_filterable,
      is_custom, is_active, is_system, is_deletable, is_schema_editable,
      sort_order, config_json
    ) VALUES (
      eid_opportunity, ft_choice,
      'productid', 'Product', 'product_id',
      'The product associated with this opportunity',
      'Select a product...',
      false, true, true, true,
      false, true, false, true, false,
      85, '{"control":"product_picker"}'::jsonb
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
