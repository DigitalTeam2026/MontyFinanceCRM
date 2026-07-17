-- Business Rules — rule categories.
--
-- Lets a business rule be filed under a named, color-coded category so the
-- Business Rules list can group / filter rules (Validation, Defaults, …).
-- Categories are optional: a rule with a null category_id shows in an
-- "Uncategorized" group. Categories are global (shared across entities), which
-- mirrors the Power Automation category model. Deleting a category detaches its
-- rules (SET NULL); it never deletes the rules themselves.
--
-- Local DB notes: no `authenticated`/`anon`/`service_role` roles exist here, so
-- all grants use TO public (mirrors automation_category and the rest of the
-- platform metadata schema).

begin;

create table if not exists public.business_rule_category (
  business_rule_category_id uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Hex accent shown on the category chips / filter (e.g. '#2563eb').
  color       text not null default '#64748b',
  -- Manual ordering in the category filter / manager.
  sort_order  integer not null default 0,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

-- Attach a rule to a category. ON DELETE SET NULL so removing a category keeps
-- its rules (they fall back into "Uncategorized").
alter table public.business_rule
  add column if not exists category_id uuid
    references public.business_rule_category (business_rule_category_id) on delete set null;

create index if not exists idx_business_rule_category
  on public.business_rule (category_id);

-- This DB has no Supabase roles; grant TO public.
grant all on public.business_rule_category to public;

commit;
