/*
  # Delete test_entity + ticket, create source entity, set org ownership

  ## Summary
  1. Soft-deletes test_entity and ticket with all associated metadata
  2. Creates 'source' as a system, organization-owned entity with physical table crm_source
  3. Updates all non-custom entities ownership_type to 'organization'

  ## Key schema facts
  - entity_definition: plural column is display_name_plural
  - field_definition: no unique constraint on (entity_definition_id, logical_name)
  - relationship_definition: no deleted_at, only is_active
  - statecode_definition: unique on (entity_definition_id, state_value) — insert each row separately
*/

-- ── Step 1: Soft-delete test_entity and ticket ────────────────────────────────
DO $$
DECLARE
  v_test_id uuid := 'a6a25f98-b5a5-42ca-9fd5-6eb64974c165';
  v_tick_id uuid := '4a5cfe79-23d5-49b2-91ec-357b1469d00c';
  v_now     timestamptz := now();
BEGIN
  UPDATE field_definition SET deleted_at=v_now,is_active=false
    WHERE entity_definition_id IN(v_test_id,v_tick_id) AND deleted_at IS NULL;

  DELETE FROM view_column WHERE view_id IN(
    SELECT view_id FROM view_definition WHERE entity_definition_id IN(v_test_id,v_tick_id));

  UPDATE view_definition SET deleted_at=v_now,is_active=false
    WHERE entity_definition_id IN(v_test_id,v_tick_id) AND deleted_at IS NULL;

  UPDATE form_definition SET deleted_at=v_now,is_active=false
    WHERE entity_definition_id IN(v_test_id,v_tick_id) AND deleted_at IS NULL;

  UPDATE business_rule SET deleted_at=v_now,is_active=false
    WHERE entity_definition_id IN(v_test_id,v_tick_id) AND deleted_at IS NULL;

  UPDATE workflow_definition SET deleted_at=v_now,is_active=false
    WHERE entity_definition_id IN(v_test_id,v_tick_id) AND deleted_at IS NULL;

  UPDATE process_flow SET deleted_at=v_now,is_active=false
    WHERE entity_definition_id IN(v_test_id,v_tick_id) AND deleted_at IS NULL;

  UPDATE relationship_definition SET is_active=false
    WHERE source_entity_id IN(v_test_id,v_tick_id) OR target_entity_id IN(v_test_id,v_tick_id);

  UPDATE nav_item SET is_active=false WHERE entity_name IN('test_entity','ticket');

  DELETE FROM role_privilege WHERE entity_name IN('test_entity','ticket');
  DELETE FROM status_reason_definition WHERE entity_definition_id IN(v_test_id,v_tick_id);
  DELETE FROM statecode_definition WHERE entity_definition_id IN(v_test_id,v_tick_id);

  UPDATE entity_definition SET deleted_at=v_now,is_active=false
    WHERE entity_definition_id IN(v_test_id,v_tick_id);
END $$;

-- ── Step 2: Create source entity record ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM entity_definition WHERE logical_name='source' AND deleted_at IS NULL) THEN
    INSERT INTO entity_definition(
      logical_name,display_name,display_name_plural,physical_table_name,
      primary_field_name,is_custom,is_active,ownership_type,
      enable_activities,enable_notes,enable_audit
    ) VALUES(
      'source','Source','Sources','crm_source',
      'name',false,true,'organization',false,false,false
    );
  ELSE
    UPDATE entity_definition
    SET display_name='Source',display_name_plural='Sources',physical_table_name='crm_source',
        primary_field_name='name',is_custom=false,is_active=true,
        ownership_type='organization',deleted_at=NULL
    WHERE logical_name='source';
  END IF;
END $$;

-- ── Step 3: Physical table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_source (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL DEFAULT '',
  description   text,
  state_code    text        NOT NULL DEFAULT 'active',
  status_reason text,
  owner_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  modified_at   timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  modified_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted    boolean     NOT NULL DEFAULT false,
  deleted_at    timestamptz,
  custom_fields jsonb       NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE crm_source ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='crm_source' AND policyname='source select') THEN
    CREATE POLICY "source select" ON crm_source FOR SELECT TO authenticated USING(is_deleted=false);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='crm_source' AND policyname='source insert') THEN
    CREATE POLICY "source insert" ON crm_source FOR INSERT TO authenticated WITH CHECK(true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='crm_source' AND policyname='source update') THEN
    CREATE POLICY "source update" ON crm_source FOR UPDATE TO authenticated USING(is_deleted=false) WITH CHECK(true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='crm_source' AND policyname='source delete') THEN
    CREATE POLICY "source delete" ON crm_source FOR DELETE TO authenticated USING(is_deleted=false);
  END IF;
END $$;

-- ── Step 4: Bootstrap fields, statecodes, views, forms ───────────────────────
DO $$
DECLARE
  v_eid    uuid;
  v_text   uuid; v_dt uuid; v_sc uuid; v_sr uuid;
  v_name_id uuid; v_sc_fid uuid; v_cdon_id uuid;
  v_av_id uuid; v_iv_id uuid;
BEGIN
  SELECT entity_definition_id INTO v_eid FROM entity_definition WHERE logical_name='source' AND deleted_at IS NULL LIMIT 1;
  IF v_eid IS NULL THEN RETURN; END IF;

  SELECT field_type_id INTO v_text FROM field_type WHERE name='text'         LIMIT 1;
  SELECT field_type_id INTO v_dt   FROM field_type WHERE name='datetime'     LIMIT 1;
  SELECT field_type_id INTO v_sc   FROM field_type WHERE name='statecode'   LIMIT 1;
  SELECT field_type_id INTO v_sr   FROM field_type WHERE name='statusreason' LIMIT 1;

  -- Fields (guard each individually)
  IF NOT EXISTS(SELECT 1 FROM field_definition WHERE entity_definition_id=v_eid AND logical_name='name' AND deleted_at IS NULL) THEN
    INSERT INTO field_definition(entity_definition_id,logical_name,display_name,physical_column_name,field_type_id,is_required,is_system,is_custom,is_searchable,is_sortable,is_filterable,is_active,sort_order)
    VALUES(v_eid,'name','Name','name',v_text,true,true,false,true,true,true,true,10);
  END IF;
  SELECT field_definition_id INTO v_name_id FROM field_definition WHERE entity_definition_id=v_eid AND logical_name='name' AND deleted_at IS NULL LIMIT 1;

  IF NOT EXISTS(SELECT 1 FROM field_definition WHERE entity_definition_id=v_eid AND logical_name='description' AND deleted_at IS NULL) THEN
    INSERT INTO field_definition(entity_definition_id,logical_name,display_name,physical_column_name,field_type_id,is_required,is_system,is_custom,is_searchable,is_sortable,is_filterable,is_active,sort_order)
    VALUES(v_eid,'description','Description','description',v_text,false,true,false,true,false,false,true,20);
  END IF;

  IF NOT EXISTS(SELECT 1 FROM field_definition WHERE entity_definition_id=v_eid AND logical_name='statecode' AND deleted_at IS NULL) THEN
    INSERT INTO field_definition(entity_definition_id,logical_name,display_name,physical_column_name,field_type_id,is_required,is_system,is_custom,is_searchable,is_sortable,is_filterable,is_active,sort_order)
    VALUES(v_eid,'statecode','Status','state_code',v_sc,true,true,false,false,true,true,true,900);
  END IF;
  SELECT field_definition_id INTO v_sc_fid FROM field_definition WHERE entity_definition_id=v_eid AND logical_name='statecode' AND deleted_at IS NULL LIMIT 1;

  IF NOT EXISTS(SELECT 1 FROM field_definition WHERE entity_definition_id=v_eid AND logical_name='statusreason' AND deleted_at IS NULL) THEN
    INSERT INTO field_definition(entity_definition_id,logical_name,display_name,physical_column_name,field_type_id,is_required,is_system,is_custom,is_searchable,is_sortable,is_filterable,is_active,sort_order)
    VALUES(v_eid,'statusreason','Status Reason','status_reason',v_sr,false,true,false,false,true,true,true,910);
  END IF;

  IF NOT EXISTS(SELECT 1 FROM field_definition WHERE entity_definition_id=v_eid AND logical_name='createdon' AND deleted_at IS NULL) THEN
    INSERT INTO field_definition(entity_definition_id,logical_name,display_name,physical_column_name,field_type_id,is_required,is_system,is_custom,is_searchable,is_sortable,is_filterable,is_active,sort_order)
    VALUES(v_eid,'createdon','Created On','created_at',v_dt,false,true,false,false,true,true,true,930);
  END IF;
  SELECT field_definition_id INTO v_cdon_id FROM field_definition WHERE entity_definition_id=v_eid AND logical_name='createdon' AND deleted_at IS NULL LIMIT 1;

  IF NOT EXISTS(SELECT 1 FROM field_definition WHERE entity_definition_id=v_eid AND logical_name='modifiedon' AND deleted_at IS NULL) THEN
    INSERT INTO field_definition(entity_definition_id,logical_name,display_name,physical_column_name,field_type_id,is_required,is_system,is_custom,is_searchable,is_sortable,is_filterable,is_active,sort_order)
    VALUES(v_eid,'modifiedon','Modified On','modified_at',v_dt,false,true,false,false,true,true,true,940);
  END IF;

  -- Statecodes (each row guarded separately due to unique constraint)
  IF NOT EXISTS(SELECT 1 FROM statecode_definition WHERE entity_definition_id=v_eid AND state_value=0) THEN
    INSERT INTO statecode_definition(entity_definition_id,state_value,display_label,is_active_state,sort_order,is_system)
    VALUES(v_eid,0,'Active',true,10,true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM statecode_definition WHERE entity_definition_id=v_eid AND state_value=1) THEN
    INSERT INTO statecode_definition(entity_definition_id,state_value,display_label,is_active_state,sort_order,is_system)
    VALUES(v_eid,1,'Inactive',false,20,true);
  END IF;

  -- Views
  IF NOT EXISTS(SELECT 1 FROM view_definition WHERE entity_definition_id=v_eid AND name='Active Sources' AND deleted_at IS NULL) THEN
    INSERT INTO view_definition(entity_definition_id,name,view_type,is_default,is_system,is_active,filter_json,sort_json)
    VALUES(v_eid,'Active Sources','public',true,true,true,
      '{"conditions":[{"field_logical_name":"statecode","field_display_name":"Status","operator":"eq","value":"active"}]}',
      '[{"field_logical_name":"name","direction":"asc"}]');
  END IF;
  SELECT view_id INTO v_av_id FROM view_definition WHERE entity_definition_id=v_eid AND name='Active Sources' AND deleted_at IS NULL LIMIT 1;

  IF NOT EXISTS(SELECT 1 FROM view_definition WHERE entity_definition_id=v_eid AND name='Inactive Sources' AND deleted_at IS NULL) THEN
    INSERT INTO view_definition(entity_definition_id,name,view_type,is_default,is_system,is_active,filter_json,sort_json)
    VALUES(v_eid,'Inactive Sources','public',false,true,true,
      '{"conditions":[{"field_logical_name":"statecode","field_display_name":"Status","operator":"eq","value":"inactive"}]}',
      '[{"field_logical_name":"name","direction":"asc"}]');
  END IF;
  SELECT view_id INTO v_iv_id FROM view_definition WHERE entity_definition_id=v_eid AND name='Inactive Sources' AND deleted_at IS NULL LIMIT 1;

  -- View columns
  IF v_av_id IS NOT NULL THEN
    DELETE FROM view_column WHERE view_id=v_av_id;
    IF v_name_id  IS NOT NULL THEN INSERT INTO view_column(view_id,field_definition_id,display_order,is_hidden,is_sortable) VALUES(v_av_id,v_name_id,1,false,true); END IF;
    IF v_sc_fid   IS NOT NULL THEN INSERT INTO view_column(view_id,field_definition_id,display_order,is_hidden,is_sortable) VALUES(v_av_id,v_sc_fid,2,false,true);   END IF;
    IF v_cdon_id  IS NOT NULL THEN INSERT INTO view_column(view_id,field_definition_id,display_order,is_hidden,is_sortable) VALUES(v_av_id,v_cdon_id,3,false,true);  END IF;
  END IF;
  IF v_iv_id IS NOT NULL THEN
    DELETE FROM view_column WHERE view_id=v_iv_id;
    IF v_name_id  IS NOT NULL THEN INSERT INTO view_column(view_id,field_definition_id,display_order,is_hidden,is_sortable) VALUES(v_iv_id,v_name_id,1,false,true); END IF;
    IF v_sc_fid   IS NOT NULL THEN INSERT INTO view_column(view_id,field_definition_id,display_order,is_hidden,is_sortable) VALUES(v_iv_id,v_sc_fid,2,false,true);   END IF;
    IF v_cdon_id  IS NOT NULL THEN INSERT INTO view_column(view_id,field_definition_id,display_order,is_hidden,is_sortable) VALUES(v_iv_id,v_cdon_id,3,false,true);  END IF;
  END IF;

  -- Main form
  IF NOT EXISTS(SELECT 1 FROM form_definition WHERE entity_definition_id=v_eid AND form_type='main' AND deleted_at IS NULL) THEN
    INSERT INTO form_definition(entity_definition_id,name,form_type,is_default,is_system,is_active,layout_json)
    VALUES(v_eid,'Source Main Form','main',true,true,true,
      json_build_object('tabs',json_build_array(
        json_build_object('id','tab_general','label','General','sections',json_build_array(
          json_build_object('id','sec_info','label','Source Information','columns',2,'controls',json_build_array(
            json_build_object('id','ctrl_name','control_type','field','field_logical_name','name','field_definition_id',v_name_id,'label','Name','required',true,'col_span',1),
            json_build_object('id','ctrl_desc','control_type','field','field_logical_name','description','label','Description','required',false,'col_span',1)
          ))
        ))
      ))
    );
  END IF;

  -- Quick create form
  IF NOT EXISTS(SELECT 1 FROM form_definition WHERE entity_definition_id=v_eid AND form_type='quick_create' AND deleted_at IS NULL) THEN
    INSERT INTO form_definition(entity_definition_id,name,form_type,is_default,is_system,is_active,layout_json)
    VALUES(v_eid,'Source Quick Create','quick_create',true,true,true,
      json_build_object('tabs',json_build_array(
        json_build_object('id','tab_main','label','Main','sections',json_build_array(
          json_build_object('id','sec_main','label','','columns',1,'controls',json_build_array(
            json_build_object('id','ctrl_name','control_type','field','field_logical_name','name','field_definition_id',v_name_id,'label','Name','required',true,'col_span',1)
          ))
        ))
      ))
    );
  END IF;

END $$;

-- ── Step 5: All system entities → ownership_type = organization ───────────────
UPDATE entity_definition
SET ownership_type = 'organization'
WHERE is_custom = false AND deleted_at IS NULL;
