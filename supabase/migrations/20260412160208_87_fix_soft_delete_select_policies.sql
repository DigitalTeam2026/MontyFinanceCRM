/*
  # Fix Soft-Delete RLS via Second SELECT Policy

  ## Root Cause
  PostgreSQL applies all SELECT policies' USING clauses as implicit WITH CHECK
  on the NEW row during UPDATE. The only SELECT policy on each entity table
  requires `is_deleted = false`, so setting `is_deleted = true` makes the new
  row fail that implicit check — causing a 403 even though the UPDATE policy passes.

  ## Fix (mirrors account table pattern)
  Add a second permissive SELECT policy per table that allows viewing soft-deleted
  records by their owner or system admins. This makes the new row (is_deleted = true)
  satisfy at least one SELECT policy, allowing the UPDATE to complete.

  Also clean up duplicate/conflicting UPDATE policies on contact, lead, ticket.
*/

-- ─── OPPORTUNITY ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can see their own soft-deleted opportunities for update" ON opportunity;
CREATE POLICY "Users can see their own soft-deleted opportunities for update"
  ON opportunity FOR SELECT
  TO authenticated
  USING (
    is_deleted = true
    AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = auth.uid())
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = opportunity.owner_id AND tu.user_id = auth.uid()
      ))
    )
  );

-- ─── CONTACT ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can see their own soft-deleted contacts for update" ON contact;
CREATE POLICY "Users can see their own soft-deleted contacts for update"
  ON contact FOR SELECT
  TO authenticated
  USING (
    is_deleted = true
    AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = auth.uid())
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = contact.owner_id AND tu.user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users with delete privilege can soft-delete contacts" ON contact;
DROP POLICY IF EXISTS "Users can update or soft-delete contacts based on privileges" ON contact;
CREATE POLICY "Users can update or soft-delete contacts based on privileges"
  ON contact FOR UPDATE
  TO authenticated
  USING (
    (
      crm_user_has_privilege('contact'::text, 'can_write'::text)
      AND crm_user_has_access('contact'::text, contact_id, owner_type, owner_id)
    )
    OR (
      crm_user_has_privilege('contact'::text, 'can_delete'::text)
      AND (
        (owner_type = 'user' AND owner_id = auth.uid())
        OR is_system_admin()
      )
    )
  )
  WITH CHECK (
    (
      crm_user_has_privilege('contact'::text, 'can_write'::text)
      AND modified_by = auth.uid()
    )
    OR (
      crm_user_has_privilege('contact'::text, 'can_delete'::text)
      AND (
        (owner_type = 'user' AND owner_id = auth.uid())
        OR is_system_admin()
      )
    )
  );

-- ─── LEAD ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can see their own soft-deleted leads for update" ON lead;
CREATE POLICY "Users can see their own soft-deleted leads for update"
  ON lead FOR SELECT
  TO authenticated
  USING (
    is_deleted = true
    AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = auth.uid())
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = lead.owner_id AND tu.user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users with delete privilege can soft-delete leads" ON lead;
DROP POLICY IF EXISTS "Users can update or soft-delete leads based on privileges" ON lead;
CREATE POLICY "Users can update or soft-delete leads based on privileges"
  ON lead FOR UPDATE
  TO authenticated
  USING (
    (
      crm_user_has_privilege('lead'::text, 'can_write'::text)
      AND crm_user_has_access('lead'::text, lead_id, owner_type, owner_id)
    )
    OR (
      crm_user_has_privilege('lead'::text, 'can_delete'::text)
      AND (
        (owner_type = 'user' AND owner_id = auth.uid())
        OR is_system_admin()
      )
    )
  )
  WITH CHECK (
    (
      crm_user_has_privilege('lead'::text, 'can_write'::text)
      AND modified_by = auth.uid()
    )
    OR (
      crm_user_has_privilege('lead'::text, 'can_delete'::text)
      AND (
        (owner_type = 'user' AND owner_id = auth.uid())
        OR is_system_admin()
      )
    )
  );

-- ─── TICKET ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can see their own soft-deleted tickets for update" ON ticket;
CREATE POLICY "Users can see their own soft-deleted tickets for update"
  ON ticket FOR SELECT
  TO authenticated
  USING (
    is_deleted = true
    AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = auth.uid())
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = ticket.owner_id AND tu.user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users with delete privilege can soft-delete tickets" ON ticket;
DROP POLICY IF EXISTS "Users with write privilege can update tickets they have access to" ON ticket;
DROP POLICY IF EXISTS "Users with write privilege can update tickets they have access " ON ticket;
CREATE POLICY "Users can update or soft-delete tickets based on privileges"
  ON ticket FOR UPDATE
  TO authenticated
  USING (
    (
      crm_user_has_privilege('ticket'::text, 'can_write'::text)
      AND crm_user_has_access('ticket'::text, ticket_id, owner_type, owner_id)
    )
    OR (
      crm_user_has_privilege('ticket'::text, 'can_delete'::text)
      AND (
        (owner_type = 'user' AND owner_id = auth.uid())
        OR is_system_admin()
      )
    )
  )
  WITH CHECK (
    (
      crm_user_has_privilege('ticket'::text, 'can_write'::text)
      AND modified_by = auth.uid()
    )
    OR (
      crm_user_has_privilege('ticket'::text, 'can_delete'::text)
      AND (
        (owner_type = 'user' AND owner_id = auth.uid())
        OR is_system_admin()
      )
    )
  );
