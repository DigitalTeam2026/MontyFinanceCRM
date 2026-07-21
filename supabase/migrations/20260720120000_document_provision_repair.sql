-- Document Location — folder provisioning failure queue + repair.
--
-- Problem: when a record is created, the browser asks the file server to create
-- the record's storage folder (<root>/YYYY/MM/DD/<record id>/). That call is
-- best-effort and its failures were swallowed entirely — if the file server was
-- down, the entity had no Document Location yet, or the network blipped, the
-- record silently ended up with no folder and nobody ever found out.
--
-- Fix, part 1 (this migration): record every failed provision attempt here so
-- the Document Location admin page can list them and re-run them on demand
-- ("Repair folders"). Part 2 is the admin-triggered sweep, which additionally
-- finds records that predate the queue (or whose failure was never logged) by
-- re-provisioning at the record's own created_at day folder — idempotent, so
-- records that already have a folder are reported as "already present".
--
-- Local DB notes: no `authenticated`/`anon`/`service_role` roles exist here, so
-- grants use TO public (mirrors business_rule_category and the rest of the
-- platform metadata schema).

begin;

create table if not exists public.document_provision_failure (
  document_provision_failure_id uuid primary key default gen_random_uuid(),
  -- Entity is stored by LOGICAL name, matching document_location_config's key.
  entity_logical_name text not null,
  record_id           text not null,
  -- Best-effort label so the admin list is readable without joining out to the
  -- record's table (which may since have been deleted).
  record_label        text,
  -- Last failure message from the file server (or the fetch error).
  last_error          text,
  attempts            integer not null default 1,
  first_failed_at     timestamptz not null default now(),
  last_failed_at      timestamptz not null default now(),
  -- Set once a repair run successfully created / confirmed the folder. Resolved
  -- rows are kept as an audit trail rather than deleted.
  resolved_at         timestamptz,
  resolved_by         uuid
);

-- One row per record: repeated failures bump attempts instead of piling up.
create unique index if not exists uq_document_provision_failure_record
  on public.document_provision_failure (entity_logical_name, record_id);

-- The admin page's default read: outstanding failures, newest first.
create index if not exists idx_document_provision_failure_open
  on public.document_provision_failure (resolved_at, last_failed_at desc);

grant all on public.document_provision_failure to public;

commit;
