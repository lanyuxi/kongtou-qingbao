begin;

select plan(12);

select ok(
  exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'pgcrypto'
  ),
  'pgcrypto extension is installed'
);

with expected(enum_name, labels) as (
  values
    ('app_role', array['user', 'reviewer', 'senior_reviewer', 'security_reviewer', 'admin']::text[]),
    ('project_lifecycle', array['rumored', 'active', 'paused', 'ended', 'archived']::text[]),
    (
      'source_type',
      array[
        'official_web',
        'official_social',
        'official_docs',
        'code_repository',
        'chain_explorer',
        'independent_research',
        'news',
        'community'
      ]::text[]
    ),
    ('source_status', array['active', 'degraded', 'suspended', 'retired']::text[]),
    (
      'signal_verification',
      array['unverified', 'corroborated', 'verified', 'disputed', 'retracted']::text[]
    ),
    (
      'signal_lifecycle',
      array['detected', 'normalized', 'linked', 'under_review', 'published', 'superseded', 'expired', 'rejected']::text[]
    ),
    ('risk_level', array['low', 'medium', 'high', 'critical']::text[]),
    ('recommendation', array['act_now', 'watch', 'research', 'avoid', 'blocked']::text[]),
    (
      'participation_status',
      array['interested', 'researching', 'participating', 'paused', 'completed', 'abandoned']::text[]
    ),
    ('task_status', array['backlog', 'planned', 'in_progress', 'completed', 'skipped', 'blocked']::text[]),
    ('task_priority', array['low', 'medium', 'high', 'urgent']::text[])
)
select is(
  (
    select array_agg(enum_value.enumlabel order by enum_value.enumsortorder)::text[]
    from pg_catalog.pg_type as enum_type
    join pg_catalog.pg_namespace as enum_namespace on enum_namespace.oid = enum_type.typnamespace
    join pg_catalog.pg_enum as enum_value on enum_value.enumtypid = enum_type.oid
    where enum_namespace.nspname = 'public'
      and enum_type.typname::text = expected.enum_name
  ),
  expected.labels,
  format('%s has exact labels in contract order', expected.enum_name)
)
from expected;

select * from finish();

rollback;
