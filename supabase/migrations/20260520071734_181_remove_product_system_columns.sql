/*
  # Remove system columns from Product and Product Family

  1. Deactivated Fields
    - Product entity:
      - `requiresapproval` (Requires Approval) - boolean
      - `requirescompliancereview` (Requires Compliance Review) - boolean
      - `requirestechnicalreview` (Requires Technical Review) - boolean
      - `requiressettlementreview` (Requires Settlement Review) - boolean
      - `accessmode` (Access Mode) - choice
      - `lobid` (Line of Business) - choice
      - `producttype` (Product Type) - choice
    - Product Family entity:
      - `lobid` (Line of Business) - choice

  2. Form Layout Cleanup
    - Product Main Form: removed Product Type, Access Mode, Line of Business controls
      and entire Review Gates section
    - Product Quick Create: removed Product Type and Line of Business controls
    - Product Quick View: removed Product Type control
    - Product Family Main Form: removed Line of Business control
    - Product Family Quick Create: removed Line of Business control

  3. Notes
    - Physical columns remain intact (no data loss)
    - Fields are deactivated (is_active = false) not deleted
    - Form layouts are updated via jsonb manipulation to strip removed controls
*/

-- ============================================================
-- 1. Deactivate field definitions on Product
-- ============================================================
UPDATE field_definition
SET is_active = false, modified_at = now()
WHERE field_definition_id IN (
  '822011ea-f9bb-4fe3-b286-8edb5dffc4bb',  -- requiresapproval
  'f2a92e2d-f67f-461e-baf4-091010afb430',  -- requirescompliancereview
  '2b7f1a58-67bf-4c09-9fec-71e9bec701cb',  -- requiressettlementreview
  '2f0f7a1b-3de4-4dff-ae08-57cf194e0404',  -- requirestechnicalreview
  '46fdbb8a-4282-4a63-9a1a-1a1aa6b375f4',  -- accessmode
  '1f66d1d7-30f2-4472-b080-eb3bcab93db9',  -- lobid (Product)
  '55a0808f-ad4a-49ca-ad5a-c37fad125d5f'   -- producttype
)
AND is_active = true;

-- ============================================================
-- 2. Deactivate field definition on Product Family
-- ============================================================
UPDATE field_definition
SET is_active = false, modified_at = now()
WHERE field_definition_id = '8735f816-9855-4cad-b746-9d4fbf6b43df'  -- lobid (Product Family)
AND is_active = true;

-- ============================================================
-- 3. Product Main Form (6be619bb): remove controls and review section
-- ============================================================
DO $$
DECLARE
  v_layout jsonb;
  v_tabs   jsonb;
  v_tab    jsonb;
  v_secs   jsonb;
  v_sec    jsonb;
  v_ctrls  jsonb;
  v_new_ctrls jsonb;
  v_new_secs  jsonb;
  v_new_tabs  jsonb;
  i int;
  j int;
  k int;
  v_ctrl jsonb;
  v_remove_ids text[] := ARRAY[
    '55a0808f-ad4a-49ca-ad5a-c37fad125d5f',
    '46fdbb8a-4282-4a63-9a1a-1a1aa6b375f4',
    '1f66d1d7-30f2-4472-b080-eb3bcab93db9',
    '822011ea-f9bb-4fe3-b286-8edb5dffc4bb',
    'f2a92e2d-f67f-461e-baf4-091010afb430',
    '2f0f7a1b-3de4-4dff-ae08-57cf194e0404',
    '2b7f1a58-67bf-4c09-9fec-71e9bec701cb'
  ];
BEGIN
  SELECT layout_json INTO v_layout FROM form_definition WHERE form_id = '6be619bb-eb2a-47d4-b524-ff1f50fba70f';
  IF v_layout IS NULL THEN RETURN; END IF;
  v_tabs := v_layout->'tabs';
  v_new_tabs := '[]'::jsonb;
  FOR i IN 0..jsonb_array_length(v_tabs)-1 LOOP
    v_tab := v_tabs->i;
    v_secs := v_tab->'sections';
    v_new_secs := '[]'::jsonb;
    FOR j IN 0..jsonb_array_length(v_secs)-1 LOOP
      v_sec := v_secs->j;
      v_ctrls := v_sec->'controls';
      v_new_ctrls := '[]'::jsonb;
      FOR k IN 0..jsonb_array_length(v_ctrls)-1 LOOP
        v_ctrl := v_ctrls->k;
        IF NOT (v_ctrl->>'field_definition_id' = ANY(v_remove_ids)) THEN
          v_new_ctrls := v_new_ctrls || jsonb_build_array(v_ctrl);
        END IF;
      END LOOP;
      IF jsonb_array_length(v_new_ctrls) > 0 THEN
        v_sec := jsonb_set(v_sec, '{controls}', v_new_ctrls);
        v_new_secs := v_new_secs || jsonb_build_array(v_sec);
      END IF;
    END LOOP;
    v_tab := jsonb_set(v_tab, '{sections}', v_new_secs);
    v_new_tabs := v_new_tabs || jsonb_build_array(v_tab);
  END LOOP;
  v_layout := jsonb_set(v_layout, '{tabs}', v_new_tabs);
  UPDATE form_definition SET layout_json = v_layout, modified_at = now()
  WHERE form_id = '6be619bb-eb2a-47d4-b524-ff1f50fba70f';
END $$;

-- ============================================================
-- 4. Product Quick Create (1e3cdec5): remove producttype, lobid
-- ============================================================
DO $$
DECLARE
  v_layout jsonb;
  v_tabs   jsonb;
  v_tab    jsonb;
  v_secs   jsonb;
  v_sec    jsonb;
  v_ctrls  jsonb;
  v_new_ctrls jsonb;
  v_new_secs  jsonb;
  v_new_tabs  jsonb;
  i int;
  j int;
  k int;
  v_ctrl jsonb;
  v_remove_ids text[] := ARRAY[
    '55a0808f-ad4a-49ca-ad5a-c37fad125d5f',
    '1f66d1d7-30f2-4472-b080-eb3bcab93db9'
  ];
BEGIN
  SELECT layout_json INTO v_layout FROM form_definition WHERE form_id = '1e3cdec5-ccfd-46df-9b8c-ef5ec410a1ae';
  IF v_layout IS NULL THEN RETURN; END IF;
  v_tabs := v_layout->'tabs';
  v_new_tabs := '[]'::jsonb;
  FOR i IN 0..jsonb_array_length(v_tabs)-1 LOOP
    v_tab := v_tabs->i;
    v_secs := v_tab->'sections';
    v_new_secs := '[]'::jsonb;
    FOR j IN 0..jsonb_array_length(v_secs)-1 LOOP
      v_sec := v_secs->j;
      v_ctrls := v_sec->'controls';
      v_new_ctrls := '[]'::jsonb;
      FOR k IN 0..jsonb_array_length(v_ctrls)-1 LOOP
        v_ctrl := v_ctrls->k;
        IF NOT (v_ctrl->>'field_definition_id' = ANY(v_remove_ids)) THEN
          v_new_ctrls := v_new_ctrls || jsonb_build_array(v_ctrl);
        END IF;
      END LOOP;
      v_sec := jsonb_set(v_sec, '{controls}', v_new_ctrls);
      v_new_secs := v_new_secs || jsonb_build_array(v_sec);
    END LOOP;
    v_tab := jsonb_set(v_tab, '{sections}', v_new_secs);
    v_new_tabs := v_new_tabs || jsonb_build_array(v_tab);
  END LOOP;
  v_layout := jsonb_set(v_layout, '{tabs}', v_new_tabs);
  UPDATE form_definition SET layout_json = v_layout, modified_at = now()
  WHERE form_id = '1e3cdec5-ccfd-46df-9b8c-ef5ec410a1ae';
END $$;

-- ============================================================
-- 5. Product Quick View (7ce26965): remove producttype
-- ============================================================
DO $$
DECLARE
  v_layout jsonb;
  v_tabs   jsonb;
  v_tab    jsonb;
  v_secs   jsonb;
  v_sec    jsonb;
  v_ctrls  jsonb;
  v_new_ctrls jsonb;
  v_new_secs  jsonb;
  v_new_tabs  jsonb;
  i int;
  j int;
  k int;
  v_ctrl jsonb;
BEGIN
  SELECT layout_json INTO v_layout FROM form_definition WHERE form_id = '7ce26965-0a20-48a6-a884-bdaca7375957';
  IF v_layout IS NULL THEN RETURN; END IF;
  v_tabs := v_layout->'tabs';
  v_new_tabs := '[]'::jsonb;
  FOR i IN 0..jsonb_array_length(v_tabs)-1 LOOP
    v_tab := v_tabs->i;
    v_secs := v_tab->'sections';
    v_new_secs := '[]'::jsonb;
    FOR j IN 0..jsonb_array_length(v_secs)-1 LOOP
      v_sec := v_secs->j;
      v_ctrls := v_sec->'controls';
      v_new_ctrls := '[]'::jsonb;
      FOR k IN 0..jsonb_array_length(v_ctrls)-1 LOOP
        v_ctrl := v_ctrls->k;
        IF v_ctrl->>'field_definition_id' != '55a0808f-ad4a-49ca-ad5a-c37fad125d5f' THEN
          v_new_ctrls := v_new_ctrls || jsonb_build_array(v_ctrl);
        END IF;
      END LOOP;
      v_sec := jsonb_set(v_sec, '{controls}', v_new_ctrls);
      v_new_secs := v_new_secs || jsonb_build_array(v_sec);
    END LOOP;
    v_tab := jsonb_set(v_tab, '{sections}', v_new_secs);
    v_new_tabs := v_new_tabs || jsonb_build_array(v_tab);
  END LOOP;
  v_layout := jsonb_set(v_layout, '{tabs}', v_new_tabs);
  UPDATE form_definition SET layout_json = v_layout, modified_at = now()
  WHERE form_id = '7ce26965-0a20-48a6-a884-bdaca7375957';
END $$;

-- ============================================================
-- 6. Product Family Main Form (586d89f6): remove lobid
-- ============================================================
DO $$
DECLARE
  v_layout jsonb;
  v_tabs   jsonb;
  v_tab    jsonb;
  v_secs   jsonb;
  v_sec    jsonb;
  v_ctrls  jsonb;
  v_new_ctrls jsonb;
  v_new_secs  jsonb;
  v_new_tabs  jsonb;
  i int;
  j int;
  k int;
  v_ctrl jsonb;
BEGIN
  SELECT layout_json INTO v_layout FROM form_definition WHERE form_id = '586d89f6-aa5f-4155-b22c-52d487d0d4a8';
  IF v_layout IS NULL THEN RETURN; END IF;
  v_tabs := v_layout->'tabs';
  v_new_tabs := '[]'::jsonb;
  FOR i IN 0..jsonb_array_length(v_tabs)-1 LOOP
    v_tab := v_tabs->i;
    v_secs := v_tab->'sections';
    v_new_secs := '[]'::jsonb;
    FOR j IN 0..jsonb_array_length(v_secs)-1 LOOP
      v_sec := v_secs->j;
      v_ctrls := v_sec->'controls';
      v_new_ctrls := '[]'::jsonb;
      FOR k IN 0..jsonb_array_length(v_ctrls)-1 LOOP
        v_ctrl := v_ctrls->k;
        IF v_ctrl->>'field_definition_id' != '8735f816-9855-4cad-b746-9d4fbf6b43df' THEN
          v_new_ctrls := v_new_ctrls || jsonb_build_array(v_ctrl);
        END IF;
      END LOOP;
      v_sec := jsonb_set(v_sec, '{controls}', v_new_ctrls);
      v_new_secs := v_new_secs || jsonb_build_array(v_sec);
    END LOOP;
    v_tab := jsonb_set(v_tab, '{sections}', v_new_secs);
    v_new_tabs := v_new_tabs || jsonb_build_array(v_tab);
  END LOOP;
  v_layout := jsonb_set(v_layout, '{tabs}', v_new_tabs);
  UPDATE form_definition SET layout_json = v_layout, modified_at = now()
  WHERE form_id = '586d89f6-aa5f-4155-b22c-52d487d0d4a8';
END $$;

-- ============================================================
-- 7. Product Family Quick Create (8d36273a): remove lobid
-- ============================================================
DO $$
DECLARE
  v_layout jsonb;
  v_tabs   jsonb;
  v_tab    jsonb;
  v_secs   jsonb;
  v_sec    jsonb;
  v_ctrls  jsonb;
  v_new_ctrls jsonb;
  v_new_secs  jsonb;
  v_new_tabs  jsonb;
  i int;
  j int;
  k int;
  v_ctrl jsonb;
BEGIN
  SELECT layout_json INTO v_layout FROM form_definition WHERE form_id = '8d36273a-8a80-4ddc-87c1-5847e8fc1a20';
  IF v_layout IS NULL THEN RETURN; END IF;
  v_tabs := v_layout->'tabs';
  v_new_tabs := '[]'::jsonb;
  FOR i IN 0..jsonb_array_length(v_tabs)-1 LOOP
    v_tab := v_tabs->i;
    v_secs := v_tab->'sections';
    v_new_secs := '[]'::jsonb;
    FOR j IN 0..jsonb_array_length(v_secs)-1 LOOP
      v_sec := v_secs->j;
      v_ctrls := v_sec->'controls';
      v_new_ctrls := '[]'::jsonb;
      FOR k IN 0..jsonb_array_length(v_ctrls)-1 LOOP
        v_ctrl := v_ctrls->k;
        IF v_ctrl->>'field_definition_id' != '8735f816-9855-4cad-b746-9d4fbf6b43df' THEN
          v_new_ctrls := v_new_ctrls || jsonb_build_array(v_ctrl);
        END IF;
      END LOOP;
      v_sec := jsonb_set(v_sec, '{controls}', v_new_ctrls);
      v_new_secs := v_new_secs || jsonb_build_array(v_sec);
    END LOOP;
    v_tab := jsonb_set(v_tab, '{sections}', v_new_secs);
    v_new_tabs := v_new_tabs || jsonb_build_array(v_tab);
  END LOOP;
  v_layout := jsonb_set(v_layout, '{tabs}', v_new_tabs);
  UPDATE form_definition SET layout_json = v_layout, modified_at = now()
  WHERE form_id = '8d36273a-8a80-4ddc-87c1-5847e8fc1a20';
END $$;
