-- Power Automation — flow categories.
--
-- Lets an automation rule be filed under a named, color-coded category so the
-- Power Automation list can group flows into collapsible sections (Sales,
-- Finance, …). Categories are optional: a rule with a null category_id shows in
-- an "Uncategorized" group. Deleting a category detaches its rules (SET NULL),
-- it never deletes the flows.
--
-- Local DB notes: no `authenticated`/`anon`/`service_role` roles exist here, so
-- all grants use TO public (mirrors the rest of the automation schema).

begin;

create table if not exists public.automation_category (
  automation_category_id uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Hex accent shown on the section header + category chips (e.g. '#2563eb').
  color       text not null default '#64748b',
  -- Manual ordering of the sections in the list.
  sort_order  integer not null default 0,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

-- Attach a rule to a category. ON DELETE SET NULL so removing a category keeps
-- its flows (they fall back into "Uncategorized").
alter table public.automation_rule
  add column if not exists category_id uuid
    references public.automation_category (automation_category_id) on delete set null;

create index if not exists idx_automation_rule_category
  on public.automation_rule (category_id);

-- This DB has no Supabase roles; grant TO public.
grant all on public.automation_category to public;

commit;
