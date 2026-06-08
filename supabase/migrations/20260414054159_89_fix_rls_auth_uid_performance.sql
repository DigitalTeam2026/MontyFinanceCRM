/*
  # Fix Auth RLS Initialization Plan Performance

  ## Summary
  Replace all direct `auth.uid()` calls in RLS policies with `(select auth.uid())`.
  This ensures the auth function is evaluated once per query rather than once per row,
  significantly improving performance at scale.

  All policies are dropped and recreated with the optimized form.
*/

-- ─── account ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can see their own soft-deleted accounts for update" ON account;
CREATE POLICY "Users can see their own soft-deleted accounts for update"
  ON account FOR SELECT TO authenticated
  USING (
    is_deleted = true
    AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = (SELECT auth.uid()))
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = account.owner_id AND tu.user_id = (SELECT auth.uid())
      ))
    )
  );

DROP POLICY IF EXISTS "Users can update or soft-delete accounts based on privileges" ON account;
CREATE POLICY "Users can update or soft-delete accounts based on privileges"
  ON account FOR UPDATE TO authenticated
  USING (
    (crm_user_has_privilege('account'::text, 'can_write'::text) AND crm_user_has_access('account'::text, account_id, owner_type, owner_id))
    OR (crm_user_has_privilege('account'::text, 'can_delete'::text) AND ((owner_type = 'user' AND owner_id = (SELECT auth.uid())) OR is_system_admin()))
  )
  WITH CHECK (
    (crm_user_has_privilege('account'::text, 'can_write'::text) AND modified_by = (SELECT auth.uid()))
    OR (crm_user_has_privilege('account'::text, 'can_delete'::text) AND ((owner_type = 'user' AND owner_id = (SELECT auth.uid())) OR is_system_admin()))
  );

DROP POLICY IF EXISTS "Users with create privilege can insert accounts" ON account;
CREATE POLICY "Users with create privilege can insert accounts"
  ON account FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND crm_user_has_privilege('account'::text, 'can_create'::text));

-- ─── activity_log ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert their own activities" ON activity_log;
CREATE POLICY "Users can insert their own activities"
  ON activity_log FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Users can soft-delete their own activities" ON activity_log;
CREATE POLICY "Users can soft-delete their own activities"
  ON activity_log FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Users can update their own activities" ON activity_log;
CREATE POLICY "Users can update their own activities"
  ON activity_log FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ─── attachment ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert attachments" ON attachment;
CREATE POLICY "Authenticated users can insert attachments"
  ON attachment FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can soft-delete their own attachments" ON attachment;
CREATE POLICY "Users can soft-delete their own attachments"
  ON attachment FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view attachments they created" ON attachment;
CREATE POLICY "Users can view attachments they created"
  ON attachment FOR SELECT TO authenticated
  USING (is_deleted = false AND created_by = (SELECT auth.uid()));

-- ─── audit_log ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_log;
CREATE POLICY "Authenticated users can insert audit logs"
  ON audit_log FOR INSERT TO authenticated
  WITH CHECK (changed_by = (SELECT auth.uid()));

-- ─── business_rule ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can delete their own rules" ON business_rule;
CREATE POLICY "Users can delete their own rules"
  ON business_rule FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- ─── campaign ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert campaigns" ON campaign;
CREATE POLICY "Authenticated users can insert campaigns"
  ON campaign FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update campaigns they own or are shared with write" ON campaign;
CREATE POLICY "Users can update campaigns they own or are shared with write"
  ON campaign FOR UPDATE TO authenticated
  USING (crm_user_has_access('campaign'::text, campaign_id, owner_type, owner_id))
  WITH CHECK (modified_by = (SELECT auth.uid()));

-- ─── contact ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users with create privilege can insert contacts" ON contact;
CREATE POLICY "Users with create privilege can insert contacts"
  ON contact FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND crm_user_has_privilege('contact'::text, 'can_create'::text));

DROP POLICY IF EXISTS "Users can see their own soft-deleted contacts for update" ON contact;
CREATE POLICY "Users can see their own soft-deleted contacts for update"
  ON contact FOR SELECT TO authenticated
  USING (
    is_deleted = true
    AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = (SELECT auth.uid()))
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = contact.owner_id AND tu.user_id = (SELECT auth.uid())
      ))
    )
  );

DROP POLICY IF EXISTS "Users can update or soft-delete contacts based on privileges" ON contact;
CREATE POLICY "Users can update or soft-delete contacts based on privileges"
  ON contact FOR UPDATE TO authenticated
  USING (
    (crm_user_has_privilege('contact'::text, 'can_write'::text) AND crm_user_has_access('contact'::text, contact_id, owner_type, owner_id))
    OR (crm_user_has_privilege('contact'::text, 'can_delete'::text) AND ((owner_type = 'user' AND owner_id = (SELECT auth.uid())) OR is_system_admin()))
  )
  WITH CHECK (
    (crm_user_has_privilege('contact'::text, 'can_write'::text) AND modified_by = (SELECT auth.uid()))
    OR (crm_user_has_privilege('contact'::text, 'can_delete'::text) AND ((owner_type = 'user' AND owner_id = (SELECT auth.uid())) OR is_system_admin()))
  );

-- ─── crm_user ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert their own profile" ON crm_user;
CREATE POLICY "Users can insert their own profile"
  ON crm_user FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON crm_user;
CREATE POLICY "Users can update their own profile"
  ON crm_user FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own profile" ON crm_user;
CREATE POLICY "Users can view their own profile"
  ON crm_user FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─── currency_audit_log ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert currency audit logs" ON currency_audit_log;
CREATE POLICY "Authenticated users can insert currency audit logs"
  ON currency_audit_log FOR INSERT TO authenticated
  WITH CHECK (changed_by = (SELECT auth.uid()));

-- ─── event ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert events" ON event;
CREATE POLICY "Authenticated users can insert events"
  ON event FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update events they own or are shared with write" ON event;
CREATE POLICY "Users can update events they own or are shared with write"
  ON event FOR UPDATE TO authenticated
  USING (crm_user_has_access('event'::text, event_id, owner_type, owner_id))
  WITH CHECK (modified_by = (SELECT auth.uid()));

-- ─── field_change_log ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert field change logs" ON field_change_log;
CREATE POLICY "Authenticated users can insert field change logs"
  ON field_change_log FOR INSERT TO authenticated
  WITH CHECK (changed_by = (SELECT auth.uid()));

-- ─── journey ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert journeys" ON journey;
CREATE POLICY "Authenticated users can insert journeys"
  ON journey FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update journeys they own" ON journey;
CREATE POLICY "Users can update journeys they own"
  ON journey FOR UPDATE TO authenticated
  USING (crm_user_has_access('journey'::text, journey_id, owner_type, owner_id))
  WITH CHECK (modified_by = (SELECT auth.uid()));

-- ─── lead ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users with create privilege can insert leads" ON lead;
CREATE POLICY "Users with create privilege can insert leads"
  ON lead FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND crm_user_has_privilege('lead'::text, 'can_create'::text));

DROP POLICY IF EXISTS "Users can see their own soft-deleted leads for update" ON lead;
CREATE POLICY "Users can see their own soft-deleted leads for update"
  ON lead FOR SELECT TO authenticated
  USING (
    is_deleted = true
    AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = (SELECT auth.uid()))
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = lead.owner_id AND tu.user_id = (SELECT auth.uid())
      ))
    )
  );

DROP POLICY IF EXISTS "Users can update or soft-delete leads based on privileges" ON lead;
CREATE POLICY "Users can update or soft-delete leads based on privileges"
  ON lead FOR UPDATE TO authenticated
  USING (
    (crm_user_has_privilege('lead'::text, 'can_write'::text) AND crm_user_has_access('lead'::text, lead_id, owner_type, owner_id))
    OR (crm_user_has_privilege('lead'::text, 'can_delete'::text) AND ((owner_type = 'user' AND owner_id = (SELECT auth.uid())) OR is_system_admin()))
  )
  WITH CHECK (
    (crm_user_has_privilege('lead'::text, 'can_write'::text) AND modified_by = (SELECT auth.uid()))
    OR (crm_user_has_privilege('lead'::text, 'can_delete'::text) AND ((owner_type = 'user' AND owner_id = (SELECT auth.uid())) OR is_system_admin()))
  );

-- ─── marketing_email ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert marketing emails" ON marketing_email;
CREATE POLICY "Authenticated users can insert marketing emails"
  ON marketing_email FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update marketing emails they own" ON marketing_email;
CREATE POLICY "Users can update marketing emails they own"
  ON marketing_email FOR UPDATE TO authenticated
  USING (crm_user_has_access('marketing_email'::text, email_id, owner_type, owner_id))
  WITH CHECK (modified_by = (SELECT auth.uid()));

-- ─── note ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert notes" ON note;
CREATE POLICY "Authenticated users can insert notes"
  ON note FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own notes" ON note;
CREATE POLICY "Users can update their own notes"
  ON note FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (modified_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view notes they created" ON note;
CREATE POLICY "Users can view notes they created"
  ON note FOR SELECT TO authenticated
  USING (is_deleted = false AND created_by = (SELECT auth.uid()));

-- ─── opportunity ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users with create privilege can insert opportunities" ON opportunity;
CREATE POLICY "Users with create privilege can insert opportunities"
  ON opportunity FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND crm_user_has_privilege('opportunity'::text, 'can_create'::text));

DROP POLICY IF EXISTS "Users can see their own soft-deleted opportunities for update" ON opportunity;
CREATE POLICY "Users can see their own soft-deleted opportunities for update"
  ON opportunity FOR SELECT TO authenticated
  USING (
    is_deleted = true
    AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = (SELECT auth.uid()))
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = opportunity.owner_id AND tu.user_id = (SELECT auth.uid())
      ))
    )
  );

DROP POLICY IF EXISTS "Users with write or delete privilege can update opportunities" ON opportunity;
DROP POLICY IF EXISTS "Users can update or soft-delete opportunities based on privileges" ON opportunity;
CREATE POLICY "Users can update or soft-delete opportunities based on privileges"
  ON opportunity FOR UPDATE TO authenticated
  USING (
    (crm_user_has_privilege('opportunity'::text, 'can_write'::text) AND crm_user_has_access('opportunity'::text, opportunity_id, owner_type, owner_id))
    OR (crm_user_has_privilege('opportunity'::text, 'can_delete'::text) AND ((owner_type = 'user' AND owner_id = (SELECT auth.uid())) OR is_system_admin()))
  )
  WITH CHECK (
    (crm_user_has_privilege('opportunity'::text, 'can_write'::text) AND modified_by = (SELECT auth.uid()))
    OR (crm_user_has_privilege('opportunity'::text, 'can_delete'::text) AND ((owner_type = 'user' AND owner_id = (SELECT auth.uid())) OR is_system_admin()))
  );

-- ─── pinned_records ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert own pinned records" ON pinned_records;
CREATE POLICY "Users can insert own pinned records"
  ON pinned_records FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can select own pinned records" ON pinned_records;
CREATE POLICY "Users can select own pinned records"
  ON pinned_records FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own pinned records" ON pinned_records;
CREATE POLICY "Users can update own pinned records"
  ON pinned_records FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own pinned records" ON pinned_records;
CREATE POLICY "Users can delete own pinned records"
  ON pinned_records FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─── product_business_unit_access ────────────────────────────────────────────

DROP POLICY IF EXISTS "System admins can insert product BU access" ON product_business_unit_access;
CREATE POLICY "System admins can insert product BU access"
  ON product_business_unit_access FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM crm_user WHERE crm_user.user_id = (SELECT auth.uid()) AND crm_user.is_system_admin = true));

DROP POLICY IF EXISTS "System admins can delete product BU access" ON product_business_unit_access;
CREATE POLICY "System admins can delete product BU access"
  ON product_business_unit_access FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM crm_user WHERE crm_user.user_id = (SELECT auth.uid()) AND crm_user.is_system_admin = true));

-- ─── product_role_access ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "System admins can insert product role access" ON product_role_access;
CREATE POLICY "System admins can insert product role access"
  ON product_role_access FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM crm_user WHERE crm_user.user_id = (SELECT auth.uid()) AND crm_user.is_system_admin = true));

DROP POLICY IF EXISTS "System admins can delete product role access" ON product_role_access;
CREATE POLICY "System admins can delete product role access"
  ON product_role_access FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM crm_user WHERE crm_user.user_id = (SELECT auth.uid()) AND crm_user.is_system_admin = true));

-- ─── product_team_access ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "System admins can insert product team access" ON product_team_access;
CREATE POLICY "System admins can insert product team access"
  ON product_team_access FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM crm_user WHERE crm_user.user_id = (SELECT auth.uid()) AND crm_user.is_system_admin = true));

DROP POLICY IF EXISTS "System admins can delete product team access" ON product_team_access;
CREATE POLICY "System admins can delete product team access"
  ON product_team_access FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM crm_user WHERE crm_user.user_id = (SELECT auth.uid()) AND crm_user.is_system_admin = true));

-- ─── product_user_access ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "System admins can insert product user access" ON product_user_access;
CREATE POLICY "System admins can insert product user access"
  ON product_user_access FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM crm_user WHERE crm_user.user_id = (SELECT auth.uid()) AND crm_user.is_system_admin = true));

DROP POLICY IF EXISTS "System admins can delete product user access" ON product_user_access;
CREATE POLICY "System admins can delete product user access"
  ON product_user_access FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM crm_user WHERE crm_user.user_id = (SELECT auth.uid()) AND crm_user.is_system_admin = true));

DROP POLICY IF EXISTS "System admins can update product user access" ON product_user_access;
CREATE POLICY "System admins can update product user access"
  ON product_user_access FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM crm_user WHERE crm_user.user_id = (SELECT auth.uid()) AND crm_user.is_system_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM crm_user WHERE crm_user.user_id = (SELECT auth.uid()) AND crm_user.is_system_admin = true));

-- ─── recent_items ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert own recent items" ON recent_items;
CREATE POLICY "Users can insert own recent items"
  ON recent_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can select own recent items" ON recent_items;
CREATE POLICY "Users can select own recent items"
  ON recent_items FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own recent items" ON recent_items;
CREATE POLICY "Users can update own recent items"
  ON recent_items FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own recent items" ON recent_items;
CREATE POLICY "Users can delete own recent items"
  ON recent_items FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─── record_share ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert record shares" ON record_share;
CREATE POLICY "Users can insert record shares"
  ON record_share FOR INSERT TO authenticated
  WITH CHECK (shared_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own record shares" ON record_share;
CREATE POLICY "Users can delete their own record shares"
  ON record_share FOR DELETE TO authenticated
  USING (shared_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view shares where they are principal or sharer" ON record_share;
CREATE POLICY "Users can view shares where they are principal or sharer"
  ON record_share FOR SELECT TO authenticated
  USING (
    (principal_type = 'user' AND principal_id = (SELECT auth.uid()))
    OR shared_by = (SELECT auth.uid())
    OR is_system_admin()
  );

-- ─── saved_filter ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert own saved filters" ON saved_filter;
CREATE POLICY "Users can insert own saved filters"
  ON saved_filter FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can select own saved filters" ON saved_filter;
CREATE POLICY "Users can select own saved filters"
  ON saved_filter FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own saved filters" ON saved_filter;
CREATE POLICY "Users can update own saved filters"
  ON saved_filter FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own saved filters" ON saved_filter;
CREATE POLICY "Users can delete own saved filters"
  ON saved_filter FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ─── segment ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert segments" ON segment;
CREATE POLICY "Authenticated users can insert segments"
  ON segment FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update segments they own" ON segment;
CREATE POLICY "Users can update segments they own"
  ON segment FOR UPDATE TO authenticated
  USING (crm_user_has_access('segment'::text, segment_id, owner_type, owner_id))
  WITH CHECK (modified_by = (SELECT auth.uid()));

-- ─── ticket ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users with create privilege can insert tickets" ON ticket;
CREATE POLICY "Users with create privilege can insert tickets"
  ON ticket FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND crm_user_has_privilege('ticket'::text, 'can_create'::text));

DROP POLICY IF EXISTS "Users can see their own soft-deleted tickets for update" ON ticket;
CREATE POLICY "Users can see their own soft-deleted tickets for update"
  ON ticket FOR SELECT TO authenticated
  USING (
    is_deleted = true
    AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = (SELECT auth.uid()))
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = ticket.owner_id AND tu.user_id = (SELECT auth.uid())
      ))
    )
  );

DROP POLICY IF EXISTS "Users can update or soft-delete tickets based on privileges" ON ticket;
CREATE POLICY "Users can update or soft-delete tickets based on privileges"
  ON ticket FOR UPDATE TO authenticated
  USING (
    (crm_user_has_privilege('ticket'::text, 'can_write'::text) AND crm_user_has_access('ticket'::text, ticket_id, owner_type, owner_id))
    OR (crm_user_has_privilege('ticket'::text, 'can_delete'::text) AND ((owner_type = 'user' AND owner_id = (SELECT auth.uid())) OR is_system_admin()))
  )
  WITH CHECK (
    (crm_user_has_privilege('ticket'::text, 'can_write'::text) AND modified_by = (SELECT auth.uid()))
    OR (crm_user_has_privilege('ticket'::text, 'can_delete'::text) AND ((owner_type = 'user' AND owner_id = (SELECT auth.uid())) OR is_system_admin()))
  );

-- ─── ticket_comment ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert comments on tickets they have access to" ON ticket_comment;
CREATE POLICY "Users can insert comments on tickets they have access to"
  ON ticket_comment FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM ticket t
      WHERE t.ticket_id = ticket_comment.ticket_id
      AND crm_user_has_access('ticket'::text, t.ticket_id, t.owner_type, t.owner_id)
    )
  );

DROP POLICY IF EXISTS "Users can update their own comments" ON ticket_comment;
CREATE POLICY "Users can update their own comments"
  ON ticket_comment FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (modified_by = (SELECT auth.uid()));

-- ─── user_notification ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view their own notifications" ON user_notification;
CREATE POLICY "Users can view their own notifications"
  ON user_notification FOR SELECT TO authenticated
  USING (recipient_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own notifications" ON user_notification;
CREATE POLICY "Users can update their own notifications"
  ON user_notification FOR UPDATE TO authenticated
  USING (recipient_id = (SELECT auth.uid()))
  WITH CHECK (recipient_id = (SELECT auth.uid()));

-- ─── view_definition ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can view public and system views" ON view_definition;
CREATE POLICY "Authenticated users can view public and system views"
  ON view_definition FOR SELECT TO authenticated
  USING (view_type = ANY (ARRAY['public'::text, 'system'::text]) OR created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own views" ON view_definition;
CREATE POLICY "Users can delete their own views"
  ON view_definition FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own views" ON view_definition;
CREATE POLICY "Users can update their own views"
  ON view_definition FOR UPDATE TO authenticated
  USING ((created_by = (SELECT auth.uid())) OR view_type = 'system'::text)
  WITH CHECK ((created_by = (SELECT auth.uid())) OR view_type = 'system'::text);

-- ─── workflow_definition ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can delete their own workflows" ON workflow_definition;
CREATE POLICY "Users can delete their own workflows"
  ON workflow_definition FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- ─── workflow_step ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can delete their own workflow steps" ON workflow_step;
CREATE POLICY "Users can delete their own workflow steps"
  ON workflow_step FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workflow_definition wd
    WHERE wd.workflow_id = workflow_step.workflow_id AND wd.created_by = (SELECT auth.uid())
  ));
