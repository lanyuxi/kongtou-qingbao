create function public.valid_authority_domains(domains text[])
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  domain_name text;
  domain_label text;
  seen_domains text[] := '{}';
begin
  if domains is null then
    return false;
  end if;

  foreach domain_name in array domains
  loop
    if domain_name is null
      or domain_name <> pg_catalog.btrim(domain_name)
      or domain_name <> pg_catalog.lower(domain_name)
      or pg_catalog.char_length(domain_name) not between 1 and 253
      or pg_catalog.strpos(domain_name, '.') = 0
      or domain_name = any(seen_domains)
    then
      return false;
    end if;

    foreach domain_label in array pg_catalog.string_to_array(domain_name, '.')
    loop
      if pg_catalog.char_length(domain_label) not between 1 and 63
        or domain_label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
      then
        return false;
      end if;
    end loop;

    seen_domains := pg_catalog.array_append(seen_domains, domain_name);
  end loop;

  return true;
end;
$$;

create function public.apply_project_material_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
    or new.version is distinct from old.version
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at
  then
    raise exception 'project_system_fields_immutable'
      using errcode = 'check_violation';
  end if;

  if row(
    new.slug,
    new.name,
    new.summary,
    new.lifecycle,
    new.primary_chain,
    new.official_website_url
  ) is distinct from row(
    old.slug,
    old.name,
    old.summary,
    old.lifecycle,
    old.primary_chain,
    old.official_website_url
  )
  then
    new.version := old.version + 1;
    new.updated_at := pg_catalog.clock_timestamp();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

create function public.apply_source_material_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at
  then
    raise exception 'source_system_fields_immutable'
      using errcode = 'check_violation';
  end if;

  if row(
    new.source_type,
    new.name,
    new.canonical_url,
    new.status,
    new.reputation_score
  ) is distinct from row(
    old.source_type,
    old.name,
    old.canonical_url,
    old.status,
    old.reputation_score
  )
  then
    new.updated_at := pg_catalog.clock_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  summary text null,
  lifecycle public.project_lifecycle not null default 'rumored',
  primary_chain text null,
  official_website_url text null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_slug_valid check (
    pg_catalog.char_length(slug) between 1 and 120
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint projects_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 1 and 120
  ),
  constraint projects_summary_valid check (
    summary is null
    or pg_catalog.char_length(summary) <= 1000
  ),
  constraint projects_primary_chain_valid check (
    primary_chain is null
    or (
      primary_chain = pg_catalog.btrim(primary_chain)
      and pg_catalog.char_length(primary_chain) between 1 and 80
    )
  ),
  constraint projects_official_website_url_https check (
    official_website_url is null
    or official_website_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
  ),
  constraint projects_version_positive check (version > 0)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  source_type public.source_type not null,
  name text not null,
  canonical_url text not null unique,
  status public.source_status not null default 'active',
  reputation_score numeric(5,2) not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 1 and 160
  ),
  constraint sources_canonical_url_https check (
    canonical_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
  ),
  constraint sources_reputation_score_bounds check (
    reputation_score between 0 and 100
  )
);

create table public.project_sources (
  project_id uuid not null references public.projects (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete restrict,
  authority_domains text[] not null default '{}',
  is_official boolean not null default false,
  verified_at timestamptz null,
  verified_by uuid null
    constraint project_sources_verified_by_fkey
    references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (project_id, source_id),
  constraint project_sources_authority_domains_valid check (
    public.valid_authority_domains(authority_domains)
  ),
  constraint project_sources_official_verification_complete check (
    not is_official
    or (
      pg_catalog.cardinality(authority_domains) > 0
      and verified_at is not null
      and verified_by is not null
    )
  )
);

create trigger projects_apply_material_update
before update on public.projects
for each row execute function public.apply_project_material_update();

create trigger sources_apply_material_update
before update on public.sources
for each row execute function public.apply_source_material_update();

create index projects_lifecycle_updated_at_idx
on public.projects (lifecycle, updated_at desc);

create index sources_status_updated_at_idx
on public.sources (status, updated_at desc);

create index project_sources_source_id_idx
on public.project_sources (source_id);

create index project_sources_authority_domains_idx
on public.project_sources using gin (authority_domains);

alter table public.projects enable row level security;
alter table public.sources enable row level security;
alter table public.project_sources enable row level security;

revoke all on table public.projects from public, anon, authenticated, service_role;
revoke all on table public.sources from public, anon, authenticated, service_role;
revoke all on table public.project_sources from public, anon, authenticated, service_role;

grant select on table public.projects to anon, authenticated, service_role;
grant select on table public.sources to anon, authenticated, service_role;
grant select on table public.project_sources to anon, authenticated, service_role;

grant insert (slug, name, summary, lifecycle, primary_chain, official_website_url)
on public.projects to service_role;
grant update (slug, name, summary, lifecycle, primary_chain, official_website_url)
on public.projects to service_role;

grant insert (source_type, name, canonical_url, status, reputation_score)
on public.sources to service_role;
grant update (source_type, name, canonical_url, status, reputation_score)
on public.sources to service_role;

grant insert (project_id, source_id, authority_domains, is_official, verified_at, verified_by)
on public.project_sources to service_role;
grant update (authority_domains, is_official, verified_at, verified_by)
on public.project_sources to service_role;

create policy projects_read_active
on public.projects
for select
to anon, authenticated
using (lifecycle = 'active');

create policy sources_read_active
on public.sources
for select
to anon, authenticated
using (status = 'active');

create policy project_sources_read_active
on public.project_sources
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.projects as project
    where project.id = project_sources.project_id
      and project.lifecycle = 'active'
  )
  and exists (
    select 1
    from public.sources as source
    where source.id = project_sources.source_id
      and source.status = 'active'
  )
);

revoke all on function public.valid_authority_domains(text[]) from public, anon, authenticated, service_role;
revoke all on function public.apply_project_material_update() from public, anon, authenticated, service_role;
revoke all on function public.apply_source_material_update() from public, anon, authenticated, service_role;

grant execute on function public.valid_authority_domains(text[]) to service_role;
