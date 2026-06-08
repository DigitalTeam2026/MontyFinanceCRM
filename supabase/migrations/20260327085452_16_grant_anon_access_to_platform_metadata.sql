/*
  # Grant anon role access to all platform metadata tables

  ## Summary
  The Admin Studio application uses the Supabase anon key (no auth) to access
  all platform metadata. All existing RLS policies only allow the `authenticated`
  role, which means every query returns empty results in the studio.

  This migration adds full CRUD policies for the `anon` role on every metadata
  and operational table so the studio can read and write data correctly.

  ## Security note
  This is an internal admin tool with no public-facing users. Anon access is
  intentional. When auth is added in the future, these policies should be
  replaced with user-scoped ones.
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
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
      AND policyname = 'Anon users can view ' || tbl
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Anon users can view %1$s" ON %1$s FOR SELECT TO anon USING (true)',
        tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
      AND policyname = 'Anon users can insert ' || tbl
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Anon users can insert %1$s" ON %1$s FOR INSERT TO anon WITH CHECK (true)',
        tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
      AND policyname = 'Anon users can update ' || tbl
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Anon users can update %1$s" ON %1$s FOR UPDATE TO anon USING (true) WITH CHECK (true)',
        tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
      AND policyname = 'Anon users can delete ' || tbl
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Anon users can delete %1$s" ON %1$s FOR DELETE TO anon USING (true)',
        tbl
      );
    END IF;
  END LOOP;
END $$;
