/*
  # Remove anon RLS policies — require authenticated access

  ## Summary
  The Admin Studio now has a proper login screen. Anon access is no longer
  needed. This migration drops all "Anon users can ..." policies that were
  added in migration 16 so that only authenticated (logged-in) users can
  read and write platform data.
*/

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'entity_definition','field_definition','field_type',
    'form_definition','form_tab','form_section','form_control',
    'form_script','form_event_handler',
    'view_definition','view_column','subgrid_definition',
    'business_rule',
    'workflow_definition','workflow_step',
    'option_set','option_set_value',
    'nav_area','nav_group','nav_item',
    'security_role','role_privilege',
    'crm_user','business_unit',
    'team','team_user','team_security_role','user_security_role',
    'account','contact','lead','opportunity',
    'ticket','ticket_comment','ticket_priority','ticket_status',
    'campaign','campaign_member',
    'note','attachment','audit_log','record_share',
    'contact_source','contact_subsource',
    'country','currency','industry','organization',
    'event','journey','journey_step','marketing_email','segment'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Anon users can view %1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Anon users can insert %1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Anon users can update %1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Anon users can delete %1$s" ON %1$s', tbl);
  END LOOP;
END $$;
