/*
  # Add owner_id to All Entity Tables Missing It

  ## Problem
  Several entity tables tracked in entity_definition were missing owner_id.
  Without owner_id, role-based record-level security (User/BU/Org scope) cannot
  filter records correctly — all records become invisible when scope is "User".

  ## Tables Updated
  - currency: add owner_id, backfill to system admin
  - business_unit: add owner_id, backfill to system admin
  - team: add owner_id, backfill to system admin
  - security_role: add owner_id, backfill to system admin
  - organization: add owner_id, backfill to system admin
  - test_entity: add owner_id, backfill to system admin

  ## Notes
  - crm_user is intentionally skipped (users own themselves — not scoped by owner_id)
  - crm_industries / crm_sources / ticket have no physical tables (orphan definitions), skipped
  - All columns are nullable with no default to avoid breaking existing insert statements
  - Backfill sets owner_id to the first active system admin
  - FK references crm_user(user_id)
*/

-- ─── currency ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'currency' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.currency ADD COLUMN owner_id uuid REFERENCES public.crm_user(user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── business_unit ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'business_unit' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.business_unit ADD COLUMN owner_id uuid REFERENCES public.crm_user(user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── team ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.team ADD COLUMN owner_id uuid REFERENCES public.crm_user(user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── security_role ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'security_role' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.security_role ADD COLUMN owner_id uuid REFERENCES public.crm_user(user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── organization ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organization' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.organization ADD COLUMN owner_id uuid REFERENCES public.crm_user(user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── test_entity ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'test_entity' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.test_entity ADD COLUMN owner_id uuid REFERENCES public.crm_user(user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Backfill all new owner_id columns with system admin ─────────────────────
DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT user_id INTO v_admin_id
  FROM public.crm_user
  WHERE is_system_admin = true AND is_active = true
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'No system admin found — skipping backfill';
    RETURN;
  END IF;

  UPDATE public.currency      SET owner_id = v_admin_id WHERE owner_id IS NULL;
  UPDATE public.business_unit SET owner_id = v_admin_id WHERE owner_id IS NULL;
  UPDATE public.team          SET owner_id = v_admin_id WHERE owner_id IS NULL;
  UPDATE public.security_role SET owner_id = v_admin_id WHERE owner_id IS NULL;
  UPDATE public.organization  SET owner_id = v_admin_id WHERE owner_id IS NULL;
  UPDATE public.test_entity   SET owner_id = v_admin_id WHERE owner_id IS NULL;
END $$;
