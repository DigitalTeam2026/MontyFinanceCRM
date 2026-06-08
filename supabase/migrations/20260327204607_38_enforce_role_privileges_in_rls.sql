/*
  # Enforce Role-Based Privileges in RLS Policies

  ## Summary
  This migration closes a security gap where role-based CRUD permissions
  (can_create, can_write, can_delete) were only enforced client-side in the
  React application. A user with direct database access or a custom client
  could bypass these UI-level checks entirely.

  ## Changes

  ### New Function: crm_user_has_privilege
  A SECURITY DEFINER helper function that checks whether the current
  authenticated user holds a specific privilege (can_create, can_write,
  can_delete) for a given entity, by reading their role_privilege rows.
  System admins always pass this check.

  ### Updated INSERT Policies (5 entity tables)
  The existing "Authenticated users can insert X" policies are replaced with
  policies that additionally require can_create = true in role_privilege.
  Tables updated: account, contact, lead, opportunity, ticket

  ### Updated UPDATE Policies (5 entity tables)
  The existing ownership-based update policies are replaced with policies
  that additionally require can_write = true in role_privilege.
  Tables updated: account, contact, lead, opportunity, ticket

  ### Soft-Delete UPDATE Policies (account)
  The soft-delete policy is tightened to require can_delete = true.

  ### Important Notes
  1. System admins (is_system_admin = true in crm_user) bypass all privilege
     checks and retain full access.
  2. The function uses SECURITY DEFINER + fixed search_path to prevent
     RLS recursion on crm_user and role_privilege tables.
  3. SELECT (read) policies are intentionally left unchanged — read access
     is already controlled by record ownership / sharing (crm_user_has_access).
     The can_read privilege in role_privilege remains a UI-level hint only,
     because at the DB level any authenticated user can only see records they own or share.
  4. Ticket primary key is ticket_id (not case_id).
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER FUNCTION: role-based privilege check
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_user_has_privilege(
  p_entity_name text,
  p_privilege   text   -- 'can_create' | 'can_write' | 'can_delete' | 'can_assign' | 'can_share'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- System admins always have every privilege
    EXISTS (
      SELECT 1 FROM crm_user cu
      WHERE cu.user_id = auth.uid()
        AND cu.is_system_admin = true
    )
    OR
    -- User has at least one active role that grants this privilege on this entity
    EXISTS (
      SELECT 1
      FROM user_security_role usr
      JOIN role_privilege rp
        ON rp.role_id = usr.role_id
       AND rp.entity_name = p_entity_name
      WHERE usr.user_id = auth.uid()
        AND CASE p_privilege
              WHEN 'can_create' THEN rp.can_create
              WHEN 'can_write'  THEN rp.can_write
              WHEN 'can_delete' THEN rp.can_delete
              WHEN 'can_assign' THEN rp.can_assign
              WHEN 'can_share'  THEN rp.can_share
              ELSE false
            END = true
    );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCOUNT — enforce can_create, can_write, can_delete
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert accounts" ON account;
CREATE POLICY "Users with create privilege can insert accounts"
  ON account FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.crm_user_has_privilege('account', 'can_create')
  );

DROP POLICY IF EXISTS "Users can update accounts they own or are shared with write" ON account;
CREATE POLICY "Users with write privilege can update accounts they have access to"
  ON account FOR UPDATE
  TO authenticated
  USING (
    public.crm_user_has_privilege('account', 'can_write')
    AND public.crm_user_has_access('account', account_id, owner_type, owner_id)
  )
  WITH CHECK (
    public.crm_user_has_privilege('account', 'can_write')
    AND modified_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can soft delete accounts they own" ON account;
CREATE POLICY "Users with delete privilege can soft-delete accounts they own"
  ON account FOR UPDATE
  TO authenticated
  USING (
    public.crm_user_has_privilege('account', 'can_delete')
    AND (
      (owner_type = 'user' AND owner_id = auth.uid())
      OR public.is_system_admin()
    )
  )
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTACT — enforce can_create, can_write
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert contacts" ON contact;
CREATE POLICY "Users with create privilege can insert contacts"
  ON contact FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.crm_user_has_privilege('contact', 'can_create')
  );

DROP POLICY IF EXISTS "Users can update contacts they own or are shared with write" ON contact;
CREATE POLICY "Users with write privilege can update contacts they have access to"
  ON contact FOR UPDATE
  TO authenticated
  USING (
    public.crm_user_has_privilege('contact', 'can_write')
    AND public.crm_user_has_access('contact', contact_id, owner_type, owner_id)
  )
  WITH CHECK (
    public.crm_user_has_privilege('contact', 'can_write')
    AND modified_by = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- LEAD — enforce can_create, can_write
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert leads" ON lead;
CREATE POLICY "Users with create privilege can insert leads"
  ON lead FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.crm_user_has_privilege('lead', 'can_create')
  );

DROP POLICY IF EXISTS "Users can update leads they own or are shared with write" ON lead;
CREATE POLICY "Users with write privilege can update leads they have access to"
  ON lead FOR UPDATE
  TO authenticated
  USING (
    public.crm_user_has_privilege('lead', 'can_write')
    AND public.crm_user_has_access('lead', lead_id, owner_type, owner_id)
  )
  WITH CHECK (
    public.crm_user_has_privilege('lead', 'can_write')
    AND modified_by = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- OPPORTUNITY — enforce can_create, can_write
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert opportunities" ON opportunity;
CREATE POLICY "Users with create privilege can insert opportunities"
  ON opportunity FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.crm_user_has_privilege('opportunity', 'can_create')
  );

DROP POLICY IF EXISTS "Users can update opportunities they own or are shared with write" ON opportunity;
CREATE POLICY "Users with write privilege can update opportunities they have access to"
  ON opportunity FOR UPDATE
  TO authenticated
  USING (
    public.crm_user_has_privilege('opportunity', 'can_write')
    AND public.crm_user_has_access('opportunity', opportunity_id, owner_type, owner_id)
  )
  WITH CHECK (
    public.crm_user_has_privilege('opportunity', 'can_write')
    AND modified_by = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- TICKET — enforce can_create, can_write
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert tickets" ON ticket;
CREATE POLICY "Users with create privilege can insert tickets"
  ON ticket FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.crm_user_has_privilege('ticket', 'can_create')
  );

DROP POLICY IF EXISTS "Users can update tickets they own or are shared with write" ON ticket;
CREATE POLICY "Users with write privilege can update tickets they have access to"
  ON ticket FOR UPDATE
  TO authenticated
  USING (
    public.crm_user_has_privilege('ticket', 'can_write')
    AND public.crm_user_has_access('ticket', ticket_id, owner_type, owner_id)
  )
  WITH CHECK (
    public.crm_user_has_privilege('ticket', 'can_write')
    AND modified_by = auth.uid()
  );
