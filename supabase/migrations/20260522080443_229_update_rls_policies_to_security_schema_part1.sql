
/*
  # Update RLS policies part 1: CRM data entities
  Tables: account, contact, lead, opportunity, ticket, ticket_comment
  Replace public.* helper calls with security.* helpers
*/

-- account
DROP POLICY IF EXISTS "Users can view accounts they have access to" ON public.account;
CREATE POLICY "Users can view accounts they have access to"
  ON public.account FOR SELECT TO authenticated
  USING (
    ((is_deleted = false) AND security.crm_user_has_access('account', account_id, owner_type, owner_id))
    OR
    ((is_deleted = true) AND (
      security.is_system_admin()
      OR ((owner_type = 'user') AND (owner_id = (SELECT auth.uid())))
      OR ((owner_type = 'team') AND (EXISTS (SELECT 1 FROM team_user tu WHERE tu.team_id = account.owner_id AND tu.user_id = (SELECT auth.uid()))))
    ))
  );

DROP POLICY IF EXISTS "Users with create privilege can insert accounts" ON public.account;
CREATE POLICY "Users with create privilege can insert accounts"
  ON public.account FOR INSERT TO authenticated
  WITH CHECK ((created_by = (SELECT auth.uid())) AND security.crm_user_has_privilege('account', 'can_create'));

DROP POLICY IF EXISTS "Users can update or soft-delete accounts based on privileges" ON public.account;
CREATE POLICY "Users can update or soft-delete accounts based on privileges"
  ON public.account FOR UPDATE TO authenticated
  USING (
    (security.crm_user_has_privilege('account', 'can_write') AND security.crm_user_has_access('account', account_id, owner_type, owner_id))
    OR (security.crm_user_has_privilege('account', 'can_delete') AND (((owner_type = 'user') AND (owner_id = (SELECT auth.uid()))) OR security.is_system_admin()))
  )
  WITH CHECK (
    (security.crm_user_has_privilege('account', 'can_write') AND (modified_by = (SELECT auth.uid())))
    OR (security.crm_user_has_privilege('account', 'can_delete') AND (((owner_type = 'user') AND (owner_id = (SELECT auth.uid()))) OR security.is_system_admin()))
  );

-- contact
DROP POLICY IF EXISTS "Users can view contacts they have access to" ON public.contact;
CREATE POLICY "Users can view contacts they have access to"
  ON public.contact FOR SELECT TO authenticated
  USING (
    ((is_deleted = false) AND security.crm_user_has_access('contact', contact_id, owner_type, owner_id))
    OR
    ((is_deleted = true) AND (
      security.is_system_admin()
      OR ((owner_type = 'user') AND (owner_id = (SELECT auth.uid())))
      OR ((owner_type = 'team') AND (EXISTS (SELECT 1 FROM team_user tu WHERE tu.team_id = contact.owner_id AND tu.user_id = (SELECT auth.uid()))))
    ))
  );

DROP POLICY IF EXISTS "Users with create privilege can insert contacts" ON public.contact;
CREATE POLICY "Users with create privilege can insert contacts"
  ON public.contact FOR INSERT TO authenticated
  WITH CHECK ((created_by = (SELECT auth.uid())) AND security.crm_user_has_privilege('contact', 'can_create'));

DROP POLICY IF EXISTS "Users can update or soft-delete contacts based on privileges" ON public.contact;
CREATE POLICY "Users can update or soft-delete contacts based on privileges"
  ON public.contact FOR UPDATE TO authenticated
  USING (
    (security.crm_user_has_privilege('contact', 'can_write') AND security.crm_user_has_access('contact', contact_id, owner_type, owner_id))
    OR (security.crm_user_has_privilege('contact', 'can_delete') AND (((owner_type = 'user') AND (owner_id = (SELECT auth.uid()))) OR security.is_system_admin()))
  )
  WITH CHECK (
    (security.crm_user_has_privilege('contact', 'can_write') AND (modified_by = (SELECT auth.uid())))
    OR (security.crm_user_has_privilege('contact', 'can_delete') AND (((owner_type = 'user') AND (owner_id = (SELECT auth.uid()))) OR security.is_system_admin()))
  );

-- lead
DROP POLICY IF EXISTS "Users can view leads they have access to" ON public.lead;
CREATE POLICY "Users can view leads they have access to"
  ON public.lead FOR SELECT TO authenticated
  USING (
    ((is_deleted = false) AND security.crm_user_has_access('lead', lead_id, owner_type, owner_id))
    OR
    ((is_deleted = true) AND (
      security.is_system_admin()
      OR ((owner_type = 'user') AND (owner_id = (SELECT auth.uid())))
      OR ((owner_type = 'team') AND (EXISTS (SELECT 1 FROM team_user tu WHERE tu.team_id = lead.owner_id AND tu.user_id = (SELECT auth.uid()))))
    ))
  );

DROP POLICY IF EXISTS "Users with create privilege can insert leads" ON public.lead;
CREATE POLICY "Users with create privilege can insert leads"
  ON public.lead FOR INSERT TO authenticated
  WITH CHECK ((created_by = (SELECT auth.uid())) AND security.crm_user_has_privilege('lead', 'can_create'));

DROP POLICY IF EXISTS "Users can update or soft-delete leads based on privileges" ON public.lead;
CREATE POLICY "Users can update or soft-delete leads based on privileges"
  ON public.lead FOR UPDATE TO authenticated
  USING (
    (security.crm_user_has_privilege('lead', 'can_write') AND security.crm_user_has_access('lead', lead_id, owner_type, owner_id))
    OR (security.crm_user_has_privilege('lead', 'can_delete') AND (((owner_type = 'user') AND (owner_id = (SELECT auth.uid()))) OR security.is_system_admin()))
  )
  WITH CHECK (
    (security.crm_user_has_privilege('lead', 'can_write') AND (modified_by = (SELECT auth.uid())))
    OR (security.crm_user_has_privilege('lead', 'can_delete') AND (((owner_type = 'user') AND (owner_id = (SELECT auth.uid()))) OR security.is_system_admin()))
  );

-- opportunity
DROP POLICY IF EXISTS "Users can view opportunities they have access to" ON public.opportunity;
CREATE POLICY "Users can view opportunities they have access to"
  ON public.opportunity FOR SELECT TO authenticated
  USING (
    ((is_deleted = false) AND security.crm_user_has_access('opportunity', opportunity_id, owner_type, owner_id))
    OR
    ((is_deleted = true) AND (
      security.is_system_admin()
      OR ((owner_type = 'user') AND (owner_id = (SELECT auth.uid())))
      OR ((owner_type = 'team') AND (EXISTS (SELECT 1 FROM team_user tu WHERE tu.team_id = opportunity.owner_id AND tu.user_id = (SELECT auth.uid()))))
    ))
  );

DROP POLICY IF EXISTS "Users with create privilege can insert opportunities" ON public.opportunity;
CREATE POLICY "Users with create privilege can insert opportunities"
  ON public.opportunity FOR INSERT TO authenticated
  WITH CHECK ((created_by = (SELECT auth.uid())) AND security.crm_user_has_privilege('opportunity', 'can_create'));

DROP POLICY IF EXISTS "Users can update or soft-delete opportunities based on privileges" ON public.opportunity;
CREATE POLICY "Users can update or soft-delete opportunities based on privileges"
  ON public.opportunity FOR UPDATE TO authenticated
  USING (
    (security.crm_user_has_privilege('opportunity', 'can_write') AND security.crm_user_has_access('opportunity', opportunity_id, owner_type, owner_id))
    OR (security.crm_user_has_privilege('opportunity', 'can_delete') AND (((owner_type = 'user') AND (owner_id = (SELECT auth.uid()))) OR security.is_system_admin()))
  )
  WITH CHECK (
    (security.crm_user_has_privilege('opportunity', 'can_write') AND (modified_by = (SELECT auth.uid())))
    OR (security.crm_user_has_privilege('opportunity', 'can_delete') AND (((owner_type = 'user') AND (owner_id = (SELECT auth.uid()))) OR security.is_system_admin()))
  );

-- ticket
DROP POLICY IF EXISTS "Users can view tickets they have access to" ON public.ticket;
CREATE POLICY "Users can view tickets they have access to"
  ON public.ticket FOR SELECT TO authenticated
  USING (
    ((is_deleted = false) AND security.crm_user_has_access('ticket', ticket_id, owner_type, owner_id))
    OR
    ((is_deleted = true) AND (
      security.is_system_admin()
      OR ((owner_type = 'user') AND (owner_id = (SELECT auth.uid())))
      OR ((owner_type = 'team') AND (EXISTS (SELECT 1 FROM team_user tu WHERE tu.team_id = ticket.owner_id AND tu.user_id = (SELECT auth.uid()))))
    ))
  );

DROP POLICY IF EXISTS "Users with create privilege can insert tickets" ON public.ticket;
CREATE POLICY "Users with create privilege can insert tickets"
  ON public.ticket FOR INSERT TO authenticated
  WITH CHECK ((created_by = (SELECT auth.uid())) AND security.crm_user_has_privilege('ticket', 'can_create'));

DROP POLICY IF EXISTS "Users can update or soft-delete tickets based on privileges" ON public.ticket;
CREATE POLICY "Users can update or soft-delete tickets based on privileges"
  ON public.ticket FOR UPDATE TO authenticated
  USING (
    (security.crm_user_has_privilege('ticket', 'can_write') AND security.crm_user_has_access('ticket', ticket_id, owner_type, owner_id))
    OR (security.crm_user_has_privilege('ticket', 'can_delete') AND (((owner_type = 'user') AND (owner_id = (SELECT auth.uid()))) OR security.is_system_admin()))
  )
  WITH CHECK (
    (security.crm_user_has_privilege('ticket', 'can_write') AND (modified_by = (SELECT auth.uid())))
    OR (security.crm_user_has_privilege('ticket', 'can_delete') AND (((owner_type = 'user') AND (owner_id = (SELECT auth.uid()))) OR security.is_system_admin()))
  );

-- ticket_comment
DROP POLICY IF EXISTS "Users can view comments on tickets they have access to" ON public.ticket_comment;
CREATE POLICY "Users can view comments on tickets they have access to"
  ON public.ticket_comment FOR SELECT TO authenticated
  USING (
    (is_deleted = false) AND EXISTS (
      SELECT 1 FROM public.ticket t
      WHERE t.ticket_id = ticket_comment.ticket_id
        AND security.crm_user_has_access('ticket', t.ticket_id, t.owner_type, t.owner_id)
    )
  );

DROP POLICY IF EXISTS "Users can insert comments on tickets they have access to" ON public.ticket_comment;
CREATE POLICY "Users can insert comments on tickets they have access to"
  ON public.ticket_comment FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ticket t
      WHERE t.ticket_id = ticket_comment.ticket_id
        AND security.crm_user_has_access('ticket', t.ticket_id, t.owner_type, t.owner_id)
    )
  );
