-- Power Automation — automation-rules engine.
--
-- Replaces the removed Workflows feature. Model:
--   WHEN a record in [table] is created/updated and [field] changes to [value]
--   THEN run one or more ordered [actions].
--
-- Detection happens in the application save pipeline (recordService.saveRecord),
-- which enqueues an automation_job row. A server-side worker (server/index.js)
-- drains the queue and executes actions with retries + idempotency. No database
-- triggers on business tables.
--
-- Local DB notes: no `authenticated`/`anon` roles exist here, so all grants /
-- policies use TO public. auth.uid() and the security.* helpers do exist.

begin;

-- ============================================================================
-- 1. RULE DEFINITION
-- ============================================================================
create table if not exists public.automation_rule (
  automation_rule_id  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text,
  -- Logical name of the entity whose records trigger the rule (e.g. 'opportunity').
  table_logical_name  text not null,
  -- create | update | both
  trigger_event       text not null default 'update'
                        check (trigger_event in ('create','update','both')),
  -- The field whose change is watched (logical name). Null = fire on any create/update.
  field_logical_name  text,
  -- changes_to | equals | changes_from_to | is_any_of | changed
  operator            text not null default 'changes_to'
                        check (operator in ('changes_to','equals','changes_from_to','is_any_of','changed')),
  -- Target value(s). Shape depends on operator:
  --   changes_to/equals -> scalar; is_any_of -> array; changes_from_to -> {from,to}
  trigger_value       jsonb,
  -- Optional extra AND-group filters: [{field, operator, value}, ...]
  conditions          jsonb not null default '[]'::jsonb,
  -- Optional batching window (Phase 3): group events within N seconds into one email.
  batch_window_seconds integer,
  enabled             boolean not null default false,
  is_published        boolean not null default false,
  -- Identity actions run under. 'system' = the automation service identity.
  run_as              text not null default 'system',
  error_count         integer not null default 0,
  last_run_at         timestamptz,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  modified_at         timestamptz not null default now()
);

create index if not exists idx_automation_rule_table_enabled
  on public.automation_rule (table_logical_name, enabled);

-- ============================================================================
-- 2. RULE ACTIONS (ordered, 1..n per rule)
-- ============================================================================
create table if not exists public.automation_rule_action (
  automation_rule_action_id uuid primary key default gen_random_uuid(),
  rule_id      uuid not null
                 references public.automation_rule(automation_rule_id) on delete cascade,
  sort_order   integer not null default 0,
  -- send_email | update_field | generate_document
  action_type  text not null
                 check (action_type in ('send_email','update_field','generate_document')),
  -- Per-action config, schema-validated server-side by the action registry.
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  modified_at  timestamptz not null default now()
);

create index if not exists idx_automation_rule_action_rule
  on public.automation_rule_action (rule_id, sort_order);

-- ============================================================================
-- 3. JOB QUEUE (durable; drained by the server worker)
-- ============================================================================
create table if not exists public.automation_job (
  automation_job_id uuid primary key default gen_random_uuid(),
  rule_id       uuid references public.automation_rule(automation_rule_id) on delete cascade,
  record_table  text not null,
  record_id     uuid,
  trigger_event text,
  -- {before, after, changed_fields, org?} snapshot captured at detection time.
  change_snapshot jsonb not null default '{}'::jsonb,
  -- pending | running | succeeded | failed | dead | skipped
  status        text not null default 'pending'
                  check (status in ('pending','running','succeeded','failed','dead','skipped')),
  attempts      integer not null default 0,
  max_attempts  integer not null default 3,
  -- (rule_id:record_id:change_version) — guarantees exactly-once side effects.
  idempotency_key text unique,
  -- Loop protection: an update_field action that re-triggers carries depth+1.
  depth         integer not null default 0,
  error         text,
  next_attempt_at timestamptz not null default now(),
  queued_at     timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  created_by    uuid
);

-- Worker polls pending/failed jobs whose backoff has elapsed, oldest first.
create index if not exists idx_automation_job_claimable
  on public.automation_job (status, next_attempt_at)
  where status in ('pending','failed');

create index if not exists idx_automation_job_rule
  on public.automation_job (rule_id, queued_at desc);

-- ============================================================================
-- 4. PER-ACTION EXECUTION LOG (drives run history; retries don't re-run
--    already-succeeded actions)
-- ============================================================================
create table if not exists public.automation_job_action_log (
  automation_job_action_log_id uuid primary key default gen_random_uuid(),
  job_id      uuid not null
                references public.automation_job(automation_job_id) on delete cascade,
  action_id   uuid,               -- soft ref to automation_rule_action (may be deleted)
  action_type text,
  sort_order  integer,
  -- pending | running | succeeded | failed | skipped
  status      text not null default 'pending',
  error       text,
  -- {message_id, transport, document_id, ...}
  output      jsonb,
  started_at  timestamptz,
  finished_at timestamptz
);

create index if not exists idx_automation_job_action_log_job
  on public.automation_job_action_log (job_id);

-- ============================================================================
-- 5. RLS — enabled with permissive TO public policies (local has no
--    authenticated role; the app server connects as a superuser which bypasses
--    RLS anyway — these keep parity with sibling metadata tables).
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'automation_rule','automation_rule_action','automation_job','automation_job_action_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_all on public.%I', t);
    execute format(
      'create policy p_all on public.%I for all to public using (true) with check (true)', t);
  end loop;
end $$;

-- ============================================================================
-- 6. PERMISSION — "Manage Automation Rules" capability privilege + helper
-- ============================================================================
create or replace function security.can_manage_automation_rules()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select security.crm_user_has_privilege('__manage_automation_rules__', 'can_write');
$$;

-- Grant to the System Administrator role (rides role_privilege, like publish).
do $$
declare v_role_id uuid;
begin
  select role_id into v_role_id
    from public.security_role
   where name = 'System Administrator'
   limit 1;
  if v_role_id is not null then
    insert into public.role_privilege (role_id, entity_name, can_read, can_write, access_level)
    values (v_role_id, '__manage_automation_rules__', true, true, 'organization')
    on conflict (role_id, entity_name) do update
      set can_read = true, can_write = true, modified_at = now();
  end if;
end $$;

-- ============================================================================
-- 7. PUBLISH INTEGRATION — attach the customization change-log trigger so rule
--    edits show as pending changes and clear on "Publish All"; include the
--    config tables in the metadata snapshot.
-- ============================================================================
do $$
declare r record;
begin
  for r in select * from (values
    ('automation_rule','automation_rule','automation_rule_id'),
    ('automation_rule_action','automation_rule','automation_rule_action_id')
  ) as t(tbl, comp, pk)
  loop
    if exists (select 1 from information_schema.tables
                where table_schema='public' and table_name=r.tbl) then
      execute format('drop trigger if exists zz_customization_change on public.%I', r.tbl);
      execute format(
        'create trigger zz_customization_change after insert or update or delete on public.%I '
        || 'for each row execute function public.trg_record_customization_change(%L, %L)',
        r.tbl, r.comp, r.pk);
    end if;
  end loop;
end $$;

-- Re-declare the snapshot builder with the automation tables appended to its
-- table list (same body as 20260615130000; robust against missing tables).
create or replace function public.build_customization_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_rows   jsonb;
  r record;
begin
  for r in select unnest(array[
    'form_definition','form_tab','form_section','form_control','form_script',
    'form_event_handler','subgrid_definition','entity_definition','field_definition',
    'view_definition','view_column','business_rule','process_flow','process_stage',
    'process_flow_transition','nav_area','nav_group','nav_item','dashboard',
    'dashboard_widget','dashboard_role_assignment','option_set','option_set_value',
    'statecode_definition','status_reason_definition','relationship_definition',
    'lead_qualification_rule','lead_qualification_field_mapping',
    'automation_rule','automation_rule_action',
    'digital_rule','digital_rule_condition','digital_rule_action'
  ]) as tbl
  loop
    if exists (select 1 from information_schema.tables
                where table_schema='public' and table_name=r.tbl) then
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', r.tbl)
        into v_rows;
      v_result := v_result || jsonb_build_object(r.tbl, v_rows);
    end if;
  end loop;
  return v_result;
end;
$$;

commit;
