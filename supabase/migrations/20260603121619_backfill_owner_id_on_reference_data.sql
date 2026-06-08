/*
  # Backfill owner_id on Reference Data Records

  ## Problem
  Reference/system entities (industry, country, currency, product, product_family, crm_source)
  were seeded without an owner_id. When role-based record-level security applies a "User" scope
  filter (owner_id = current_user), these records become invisible because owner_id IS NULL
  never matches.

  ## Solution
  Backfill owner_id on all ownerless rows to the system admin user so scope-based filtering
  works correctly. The frontend also treats NULL owner_id as "shared" records visible to all.

  ## Tables Updated
  - industry, country, currency, product, product_family, crm_source
    (only rows where owner_id IS NULL)
*/

DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT user_id INTO v_admin_id
  FROM public.crm_user
  WHERE is_system_admin = true AND is_active = true
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'No system admin found — skipping owner_id backfill';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'industry' AND column_name = 'owner_id') THEN
    UPDATE public.industry SET owner_id = v_admin_id WHERE owner_id IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'country' AND column_name = 'owner_id') THEN
    UPDATE public.country SET owner_id = v_admin_id WHERE owner_id IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'currency' AND column_name = 'owner_id') THEN
    UPDATE public.currency SET owner_id = v_admin_id WHERE owner_id IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product' AND column_name = 'owner_id') THEN
    UPDATE public.product SET owner_id = v_admin_id WHERE owner_id IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_family' AND column_name = 'owner_id') THEN
    UPDATE public.product_family SET owner_id = v_admin_id WHERE owner_id IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crm_source' AND column_name = 'owner_id') THEN
    UPDATE public.crm_source SET owner_id = v_admin_id WHERE owner_id IS NULL;
  END IF;

END $$;
