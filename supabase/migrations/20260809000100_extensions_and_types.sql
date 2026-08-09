do $$
declare
  existing_schema text;
begin
  select extension_namespace.nspname::text
  into existing_schema
  from pg_catalog.pg_extension as installed_extension
  join pg_catalog.pg_namespace as extension_namespace on extension_namespace.oid = installed_extension.extnamespace
  where installed_extension.extname = 'pgcrypto';

  if existing_schema is not null and existing_schema <> 'extensions' then
    raise exception 'pgcrypto must be installed in the extensions schema, found %', existing_schema
      using errcode = 'invalid_schema_name';
  end if;
end
$$;

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum (
  'user',
  'reviewer',
  'senior_reviewer',
  'security_reviewer',
  'admin'
);

create type public.project_lifecycle as enum (
  'rumored',
  'active',
  'paused',
  'ended',
  'archived'
);

create type public.source_type as enum (
  'official_web',
  'official_social',
  'official_docs',
  'code_repository',
  'chain_explorer',
  'independent_research',
  'news',
  'community'
);

create type public.source_status as enum (
  'active',
  'degraded',
  'suspended',
  'retired'
);

create type public.signal_verification as enum (
  'unverified',
  'corroborated',
  'verified',
  'disputed',
  'retracted'
);

create type public.signal_lifecycle as enum (
  'detected',
  'normalized',
  'linked',
  'under_review',
  'published',
  'superseded',
  'expired',
  'rejected'
);

create type public.risk_level as enum (
  'low',
  'medium',
  'high',
  'critical'
);

create type public.recommendation as enum (
  'act_now',
  'watch',
  'research',
  'avoid',
  'blocked'
);

create type public.participation_status as enum (
  'interested',
  'researching',
  'participating',
  'paused',
  'completed',
  'abandoned'
);

create type public.task_status as enum (
  'backlog',
  'planned',
  'in_progress',
  'completed',
  'skipped',
  'blocked'
);

create type public.task_priority as enum (
  'low',
  'medium',
  'high',
  'urgent'
);
