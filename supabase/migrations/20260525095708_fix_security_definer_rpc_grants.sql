/*
  # Fix SECURITY DEFINER RPC function grants

  ## Changes

  1. `update_bpf_stage`
     - Revoke EXECUTE from `anon` role — anonymous users must never advance BPF stages.
       The function already checks `security.crm_user_has_access()` internally, but
       `anon` has no CRM user record so the check would always fail anyway. Removing
       the grant eliminates the exposure entirely.
     - `authenticated` keep (callers are logged-in CRM users; internal check validates access).

  2. `is_system_admin`
     - Revoke EXECUTE from `authenticated` role.
       The application reads `is_system_admin` as a column from `crm_user` — it never
       calls this function via RPC. Exposing it as a callable RPC adds an unnecessary
       attack surface (information disclosure about the current user's admin status
       via a SECURITY DEFINER context).

  3. `soft_delete_process_flow`
     - Kept as SECURITY DEFINER with `authenticated` execute because:
       a) It must update multiple tables that have strict RLS policies.
       b) It already enforces `security.is_system_admin()` as its first statement,
          raising an exception for any non-admin caller.
     - No grant change needed — the internal guard is the correct mitigation here.
*/

-- 1. Revoke anon from update_bpf_stage
REVOKE EXECUTE ON FUNCTION public.update_bpf_stage(text, text, uuid, uuid, boolean) FROM anon;

-- 2. Revoke authenticated from is_system_admin (not used as RPC by the app)
REVOKE EXECUTE ON FUNCTION public.is_system_admin() FROM authenticated;
