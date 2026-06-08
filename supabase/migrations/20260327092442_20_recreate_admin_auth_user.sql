/*
  # Recreate admin auth user to fix GoTrue 500 error

  ## Summary
  The Supabase GoTrue auth service is returning a 500 "Database error querying schema"
  error when attempting to sign in. This recreates the auth user with a clean state
  and a simple known email/password.

  ## Changes
  1. Delete existing auth user and all related records
  2. Recreate auth user: admin@montyfinance.com / Admin@1234
  3. Recreate crm_user profile
*/

DO $$
DECLARE
  v_old_user_id uuid := 'e5702039-37b1-44db-a564-213a67dac09f';
  v_new_user_id uuid := gen_random_uuid();
BEGIN
  DELETE FROM auth.identities WHERE user_id = v_old_user_id;
  DELETE FROM auth.sessions WHERE user_id = v_old_user_id;
  DELETE FROM auth.mfa_factors WHERE user_id = v_old_user_id;
  DELETE FROM auth.one_time_tokens WHERE user_id = v_old_user_id;
  DELETE FROM public.crm_user WHERE user_id = v_old_user_id;
  DELETE FROM auth.users WHERE id = v_old_user_id;

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, role, aud,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'admin@montyfinance.com',
    crypt('Admin@1234', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"full_name": "System Admin"}',
    NOW(), NOW(),
    'authenticated', 'authenticated',
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_new_user_id,
    'admin@montyfinance.com',
    'email',
    jsonb_build_object('sub', v_new_user_id::text, 'email', 'admin@montyfinance.com'),
    NOW(), NOW(), NOW()
  );

  INSERT INTO public.crm_user (
    user_id, full_name, email, is_active, is_system_admin
  ) VALUES (
    v_new_user_id, 'System Admin', 'admin@montyfinance.com', true, true
  );
END $$;
