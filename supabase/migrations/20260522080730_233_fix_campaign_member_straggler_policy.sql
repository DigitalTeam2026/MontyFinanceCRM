
DROP POLICY IF EXISTS "Users can view campaign members for campaigns they have access " ON public.campaign_member;
DROP POLICY IF EXISTS "Users can view campaign members for campaigns they have access" ON public.campaign_member;
CREATE POLICY "Users can view campaign members for campaigns they have access"
  ON public.campaign_member FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaign c
    WHERE c.campaign_id = campaign_member.campaign_id
      AND security.crm_user_has_access('campaign', c.campaign_id, c.owner_type, c.owner_id)
  ));
