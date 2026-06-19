-- Standardise soft-delete on a `deleted_at timestamptz` column across every
-- entity-backed table, so the Admin Studio data grid can show a recycle bin and
-- restore records (instead of a hidden is_deleted true/false flag).
--
-- For each distinct physical table referenced by entity_definition:
--   1. add `deleted_at timestamptz` if it is missing (nullable → all existing
--      rows are "active");
--   2. add an index on deleted_at to keep the active/deleted split fast;
--   3. backfill from a legacy `is_deleted` boolean if that column exists, so any
--      rows already soft-deleted stay deleted under the new convention.
--
-- Idempotent: re-running is a no-op (guards on column existence + IF NOT EXISTS).

do $$
declare
  t            text;
  has_deleted  boolean;
  has_isdel    boolean;
  idx_name     text;
begin
  for t in
    select distinct physical_table_name
    from public.entity_definition
    where physical_table_name is not null
  loop
    -- Skip names that don't resolve to a real table (views, dropped tables, …).
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'deleted_at'
    ) into has_deleted;

    if not has_deleted then
      execute format('alter table public.%I add column deleted_at timestamptz', t);

      -- Index name capped to 63 bytes (Postgres identifier limit).
      idx_name := left(format('idx_%s_deleted_at', t), 63);
      execute format('create index if not exists %I on public.%I (deleted_at)', idx_name, t);
    end if;

    -- Backfill from a legacy is_deleted boolean when present.
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'is_deleted'
    ) into has_isdel;

    if has_isdel then
      execute format(
        'update public.%I set deleted_at = now() where is_deleted = true and deleted_at is null', t
      );
    end if;
  end loop;
end $$;
