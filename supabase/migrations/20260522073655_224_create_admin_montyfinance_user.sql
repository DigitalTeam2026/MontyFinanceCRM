
/*
  # Create admin@montyfinance.com user
  Creates the admin user with password Admin@1234, System Administrator role.
*/

DO $$
DECLARE
  v_auth_id uuid := gen_random_uuid();
  v_bu_id   uuid;
BEGIN
  SELECT business_unit_id INTO v_bu_id
  FROM business_unit
  WHERE parent_business_unit_id IS NULL
  LIMIT 1;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    v_auth_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'admin@montyfinance.com',
    crypt('Admin@1234', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(), now(),
    '', '', '', ''
  );

  INSERT INTO crm_user (
    user_id, business_unit_id, full_name, email, username,
    is_active, is_system_admin, state_code, status_reason
  ) VALUES (
    v_auth_id, v_bu_id,
    'Admin',
    'admin@montyfinance.com',
    'admin@montyfinance.com',
    true, true, 0, 1
  );

  INSERT INTO user_security_role (user_id, role_id)
  VALUES (v_auth_id, 'fd7459d7-af45-412a-87fd-c53c0d8c68ce');
END $$;
