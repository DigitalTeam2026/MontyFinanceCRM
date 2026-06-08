
/*
  # Update RLS policies part 2: Marketing entities + crm_user + process_flow
  Tables: campaign, campaign_member, event, journey, journey_step,
          marketing_email, segment, crm_user, process_flow
*/

-- campaign
DROP POLICY IF EXISTS "Users can view campaigns they have access to" ON public.campaign;
CREATE POLICY "Users can view campaigns they have access to"
  ON public.campaign FOR SELECT TO authenticated
  USING ((is_deleted = false) AND security.crm_user_has_access('campaign', campaign_id, owner_type, owner_id));

DROP POLICY IF EXISTS "Users can update campaigns they own or are shared with write" ON public.campaign;
CREATE POLICY "Users can update campaigns they own or are shared with write"
  ON public.campaign FOR UPDATE TO authenticated
  USING (security.crm_user_has_access('campaign', campaign_id, owner_type, owner_id));

-- campaign_member
DROP POLICY IF EXISTS "Users can view campaign members for campaigns they have access" ON public.campaign_member;
CREATE POLICY "Users can view campaign members for campaigns they have access"
  ON public.campaign_member FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaign c
    WHERE c.campaign_id = campaign_member.campaign_id
      AND security.crm_user_has_access('campaign', c.campaign_id, c.owner_type, c.owner_id)
  ));

DROP POLICY IF EXISTS "Users can insert campaign members for campaigns they own" ON public.campaign_member;
CREATE POLICY "Users can insert campaign members for campaigns they own"
  ON public.campaign_member FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaign c
    WHERE c.campaign_id = campaign_member.campaign_id
      AND security.crm_user_has_access('campaign', c.campaign_id, c.owner_type, c.owner_id)
  ));

DROP POLICY IF EXISTS "Users can update campaign members for campaigns they own" ON public.campaign_member;
CREATE POLICY "Users can update campaign members for campaigns they own"
  ON public.campaign_member FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaign c
    WHERE c.campaign_id = campaign_member.campaign_id
      AND security.crm_user_has_access('campaign', c.campaign_id, c.owner_type, c.owner_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaign c
    WHERE c.campaign_id = campaign_member.campaign_id
      AND security.crm_user_has_access('campaign', c.campaign_id, c.owner_type, c.owner_id)
  ));

DROP POLICY IF EXISTS "Users can delete campaign members for campaigns they own" ON public.campaign_member;
CREATE POLICY "Users can delete campaign members for campaigns they own"
  ON public.campaign_member FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaign c
    WHERE c.campaign_id = campaign_member.campaign_id
      AND security.crm_user_has_access('campaign', c.campaign_id, c.owner_type, c.owner_id)
  ));

-- event
DROP POLICY IF EXISTS "Users can view events they have access to" ON public.event;
CREATE POLICY "Users can view events they have access to"
  ON public.event FOR SELECT TO authenticated
  USING ((is_deleted = false) AND security.crm_user_has_access('event', event_id, owner_type, owner_id));

DROP POLICY IF EXISTS "Users can update events they own or are shared with write" ON public.event;
CREATE POLICY "Users can update events they own or are shared with write"
  ON public.event FOR UPDATE TO authenticated
  USING (security.crm_user_has_access('event', event_id, owner_type, owner_id));

-- journey
DROP POLICY IF EXISTS "Users can view journeys they have access to" ON public.journey;
CREATE POLICY "Users can view journeys they have access to"
  ON public.journey FOR SELECT TO authenticated
  USING (security.crm_user_has_access('journey', journey_id, owner_type, owner_id));

DROP POLICY IF EXISTS "Users can update journeys they own" ON public.journey;
CREATE POLICY "Users can update journeys they own"
  ON public.journey FOR UPDATE TO authenticated
  USING (security.crm_user_has_access('journey', journey_id, owner_type, owner_id));

-- journey_step
DROP POLICY IF EXISTS "Users can view journey steps for journeys they have access to" ON public.journey_step;
CREATE POLICY "Users can view journey steps for journeys they have access to"
  ON public.journey_step FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.journey j
    WHERE j.journey_id = journey_step.journey_id
      AND security.crm_user_has_access('journey', j.journey_id, j.owner_type, j.owner_id)
  ));

DROP POLICY IF EXISTS "System admins can insert journey steps" ON public.journey_step;
CREATE POLICY "System admins can insert journey steps"
  ON public.journey_step FOR INSERT TO authenticated
  WITH CHECK (security.is_system_admin());

DROP POLICY IF EXISTS "System admins can update journey steps" ON public.journey_step;
CREATE POLICY "System admins can update journey steps"
  ON public.journey_step FOR UPDATE TO authenticated
  USING (security.is_system_admin());

DROP POLICY IF EXISTS "System admins can delete journey steps" ON public.journey_step;
CREATE POLICY "System admins can delete journey steps"
  ON public.journey_step FOR DELETE TO authenticated
  USING (security.is_system_admin());

-- marketing_email
DROP POLICY IF EXISTS "Users can view marketing emails they have access to" ON public.marketing_email;
CREATE POLICY "Users can view marketing emails they have access to"
  ON public.marketing_email FOR SELECT TO authenticated
  USING ((is_deleted = false) AND security.crm_user_has_access('marketing_email', email_id, owner_type, owner_id));

DROP POLICY IF EXISTS "Users can update marketing emails they own" ON public.marketing_email;
CREATE POLICY "Users can update marketing emails they own"
  ON public.marketing_email FOR UPDATE TO authenticated
  USING (security.crm_user_has_access('marketing_email', email_id, owner_type, owner_id));

-- segment
DROP POLICY IF EXISTS "Users can view segments they have access to" ON public.segment;
CREATE POLICY "Users can view segments they have access to"
  ON public.segment FOR SELECT TO authenticated
  USING (security.crm_user_has_access('segment', segment_id, owner_type, owner_id));

DROP POLICY IF EXISTS "Users can update segments they own" ON public.segment;
CREATE POLICY "Users can update segments they own"
  ON public.segment FOR UPDATE TO authenticated
  USING (security.crm_user_has_access('segment', segment_id, owner_type, owner_id));

-- crm_user: replace get_is_system_admin_bypass_rls with security.is_system_admin
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.crm_user;
CREATE POLICY "Admins can view all profiles"
  ON public.crm_user FOR SELECT TO authenticated
  USING (security.is_system_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.crm_user;
CREATE POLICY "Admins can update all profiles"
  ON public.crm_user FOR UPDATE TO authenticated
  USING (security.is_system_admin())
  WITH CHECK (security.is_system_admin());

-- process_flow: replace get_is_system_admin_bypass_rls
DROP POLICY IF EXISTS "Admins can insert process flows" ON public.process_flow;
CREATE POLICY "Admins can insert process flows"
  ON public.process_flow FOR INSERT TO authenticated
  WITH CHECK (security.is_system_admin());

DROP POLICY IF EXISTS "Admins can update process flows" ON public.process_flow;
CREATE POLICY "Admins can update process flows"
  ON public.process_flow FOR UPDATE TO authenticated
  USING (security.is_system_admin())
  WITH CHECK (security.is_system_admin());

DROP POLICY IF EXISTS "Admins can delete process flows" ON public.process_flow;
CREATE POLICY "Admins can delete process flows"
  ON public.process_flow FOR DELETE TO authenticated
  USING (security.is_system_admin());
