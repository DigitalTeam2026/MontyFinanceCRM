/*
  # Fix Security Issues

  ## Changes

  ### 1. crm_source RLS Policies — fix always-true WITH CHECK
  - `source insert`: Replace `true` WITH CHECK with authenticated active-user check
  - `source update`: Replace `true` WITH CHECK with authenticated active-user check

  ### 2. Revoke public/anon EXECUTE on admin SECURITY DEFINER functions
  - `admin_add_missing_column`: DDL helper — revoke from anon, authenticated, PUBLIC
  - `validate_field_column_alignment`: Admin validation — revoke from anon, authenticated, PUBLIC

  ### 3. Revoke fn_check_product_access from direct authenticated REST calls
  - Used only internally by RLS policies; not a public API endpoint
*/

-- ─── 1. Fix crm_source INSERT policy ─────────────────────────────────────────
DROP POLICY IF EXISTS "source insert" ON public.crm_source;

CREATE POLICY "source insert"
  ON public.crm_source
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_active = true
    )
  );

-- ─── 2. Fix crm_source UPDATE policy ─────────────────────────────────────────
DROP POLICY IF EXISTS "source update" ON public.crm_source;

CREATE POLICY "source update"
  ON public.crm_source
  FOR UPDATE
  TO authenticated
  USING (is_deleted = false)
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_active = true
    )
  );

-- ─── 3. Revoke admin_add_missing_column from anon and authenticated ───────────
REVOKE EXECUTE ON FUNCTION public.admin_add_missing_column(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_add_missing_column(text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_add_missing_column(text, text, text) FROM PUBLIC;

-- ─── 4. Revoke validate_field_column_alignment from anon and authenticated ────
REVOKE EXECUTE ON FUNCTION public.validate_field_column_alignment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_field_column_alignment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_field_column_alignment() FROM PUBLIC;

-- ─── 5. Revoke fn_check_product_access from direct REST calls ────────────────
REVOKE EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) FROM PUBLIC;
