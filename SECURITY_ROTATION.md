# Security: Secret Rotation Required (SEC-1)

On **2026-06-11**, two high-privilege Supabase management secrets were found stored in
`.env` and were exposed during a review session. They have been **removed from
`.env`** but **must be rotated** — removal alone is not enough, because the values
were already exposed.

> `.env` is gitignored and was never committed, so the exposure is limited to local
> copies and the review session. Rotate anyway.

## 1. Rotate the Supabase Personal Access Token (PAT)

The leaked token began with `sbp_a004…`.

1. Go to https://supabase.com/dashboard/account/tokens
2. **Revoke** the existing token (the one starting `sbp_a004…`).
3. **Generate a new** access token.
4. Store it in your shell / credential manager, NOT in `.env`:
   - PowerShell (current session): `$env:SUPABASE_ACCESS_TOKEN = "sbp_newvalue"`
   - Or add it to your CI/CD provider's secret store.

## 2. Rotate the database password

The value previously in `.env` (`Databasepassword=…`) also failed authentication
during the review (likely already stale), so reset it to a known-good value:

1. Go to https://supabase.com/dashboard/project/ruzfzebjvikfslbyjsrm/settings/database
2. Under **Database password**, click **Reset database password**.
3. Store the new password in your credential manager / CI secrets.
4. For local CLI use: `$env:SUPABASE_DB_PASSWORD = "newpassword"` (do not put it in `.env`).

## 3. Verify

- New PAT works:  `npx supabase projects list`  (should list "Monty Finance CRM").
- Old PAT is dead: a request with the old `sbp_a004…` token should now 401.
- App still loads with the unchanged `VITE_SUPABASE_*` values (those are public and
  were intentionally left in `.env`).

## Why the Vite vars stayed

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are **public** — the anon key is
embedded in the client bundle by design and is constrained by Row-Level Security.
Rotating it is optional and only needed if you suspect RLS was bypassed.
