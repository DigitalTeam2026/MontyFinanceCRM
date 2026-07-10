-- Power Automation — sender mailboxes ("send on behalf" accounts).
--
-- Stores one row per mailbox the send_email action can send AS. Each row can
-- carry its own Microsoft Graph app-registration credentials (tenant/client id +
-- secret) so different flows can send from different mailboxes; rows may also
-- share one app registration and only differ by `from_address`.
--
-- The Azure app registration needs the APPLICATION permission `Mail.Send`
-- (admin-consented). With client credentials it can send as any licensed mailbox
-- in the tenant; the worker sends from `from_address`.
--
-- Secrets live in the local DB in plaintext — same trust model as the root .env
-- on this single-org on-prem box.

create table if not exists automation_email_account (
  account_id     uuid primary key default gen_random_uuid(),
  name           text not null,                       -- label shown in the flow picker
  from_address   text not null,                       -- mailbox UPN to send AS (the "on behalf" address)
  provider       text not null default 'graph',       -- 'graph' (Microsoft 365) — room for 'smtp' later
  tenant_id      text,                                -- Azure AD tenant id or domain
  client_id      text,                                -- app registration (client) id
  client_secret  text,                                -- app registration client secret
  is_default     boolean not null default false,      -- used when a flow doesn't pick one
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  modified_at    timestamptz not null default now()
);

-- At most one default mailbox.
create unique index if not exists automation_email_account_one_default
  on automation_email_account (is_default) where is_default = true;

-- This DB has no Supabase roles (authenticated/anon/service_role); grant TO public.
grant all on automation_email_account to public;
