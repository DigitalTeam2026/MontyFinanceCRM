/*
  # Fix crm_sources RLS policies — entity name mismatch

  1. Problem
    - INSERT/UPDATE/DELETE policies on `crm_sources` pass the physical table name
      `'crm_sources'` to `security.crm_user_has_privilege()`, but `role_privilege`
      stores the logical name `'sources'`.
    - This causes every INSERT/UPDATE/DELETE to be denied with a 403 even when
      the user's security role grants the privilege.

  2. Fix
    - Recreate the INSERT, UPDATE, and DELETE policies using `'sources'` as the
      entity name argument.
    - The SELECT policy only checks `is_deleted = false` and is not affected.
*/

-- DROP existing broken policies
DROP POLICY IF EXISTS "Privileged users can insert sources" ON public.crm_sources;
DROP POLICY IF EXISTS "Privileged users can update sources" ON public.crm_sources;
DROP POLICY IF EXISTS "Privileged users can delete sources" ON public.crm_sources;

-- Recreate with correct logical entity name
CREATE POLICY "Privileged users can insert sources"
  ON public.crm_sources FOR INSERT
  TO authenticated
  WITH CHECK (security.crm_user_has_privilege('sources', 'can_create'));

CREATE POLICY "Privileged users can update sources"
  ON public.crm_sources FOR UPDATE
  TO authenticated
  USING (security.crm_user_has_privilege('sources', 'can_write'))
  WITH CHECK (security.crm_user_has_privilege('sources', 'can_write'));

CREATE POLICY "Privileged users can delete sources"
  ON public.crm_sources FOR DELETE
  TO authenticated
  USING (security.crm_user_has_privilege('sources', 'can_delete'));
