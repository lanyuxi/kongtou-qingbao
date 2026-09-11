begin;
select plan(3);

-- Phase 16: JSON API collection.
--
-- Two structural facts carry the phase: the content-kind enum gained `json_api`,
-- and the body-fetch budget the collector actually uses (35) is the budget the
-- database enforces. The second one is the regression lock: raising the
-- collector's budget without raising this constraint is what made a busy pass
-- roll back its whole batch and record `persistence_failed`.

-- ---------------------------------------------------------------------------
-- The content kind enum
-- ---------------------------------------------------------------------------

select results_eq(
  $$
    select enum_value.enumlabel::text collate "C"
    from pg_catalog.pg_type as enum_type
    join pg_catalog.pg_enum as enum_value on enum_value.enumtypid = enum_type.oid
    join pg_catalog.pg_namespace as namespace on namespace.oid = enum_type.typnamespace
    where namespace.nspname = 'public'
      and enum_type.typname = 'collection_content_kind'
    order by enum_value.enumsortorder
  $$,
  $$
    select expected.enum_value collate "C"
    from (
      values
      ('official_html'::text),
      ('rss_feed'),
      ('atom_feed'),
      ('feed_article_html'),
      ('json_api')
    ) as expected(enum_value)
  $$,
  'collection_content_kind has the exact ordered values, including json_api'
);

-- ---------------------------------------------------------------------------
-- The body-fetch budget
-- ---------------------------------------------------------------------------

select ok(
  (
    select pg_catalog.pg_get_constraintdef(constraint_row.oid)
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as table_row on table_row.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = table_row.relnamespace
    where namespace.nspname = 'public'
      and table_row.relname = 'collection_attempts'
      and constraint_row.conname = 'collection_attempts_body_fetch_count_valid'
  ) ~ 'body_fetch_count <= 35',
  'the body-fetch budget allows the 35 fetches one pass may perform'
);

select ok(
  (
    select pg_catalog.pg_get_constraintdef(constraint_row.oid)
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as table_row on table_row.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = table_row.relnamespace
    where namespace.nspname = 'public'
      and table_row.relname = 'collection_attempts'
      and constraint_row.conname = 'collection_attempts_body_fetch_count_valid'
  ) !~ '<= 20',
  'the body-fetch budget is no longer capped at 20'
);

select * from finish();
rollback;
