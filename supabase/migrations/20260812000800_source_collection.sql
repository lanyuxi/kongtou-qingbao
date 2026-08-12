create type public.collection_outcome as enum (
  'stored_new_content',
  'not_modified',
  'unchanged_content',
  'discovered_only',
  'body_fetch_budget_exhausted',
  'rejected_url',
  'rejected_dns_target',
  'redirect_rejected',
  'unsupported_content_type',
  'invalid_text_encoding',
  'response_too_large',
  'timeout',
  'http_error',
  'invalid_feed',
  'persistence_failed'
);

create type public.collection_content_kind as enum (
  'official_html',
  'rss_feed',
  'atom_feed',
  'feed_article_html'
);

create type public.discovery_disposition as enum (
  'eligible',
  'discovered_only',
  'body_fetch_budget_exhausted',
  'fetched',
  'fetch_failed'
);

create function public.valid_collection_redirect_chain(candidate jsonb)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select
    pg_catalog.jsonb_typeof(candidate) = 'array'
    and pg_catalog.jsonb_array_length(candidate) <= 20
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(candidate) as redirect_hop(value)
      where pg_catalog.jsonb_typeof(redirect_hop.value) <> 'object'
        or not redirect_hop.value ? 'hop'
        or not redirect_hop.value ? 'status'
        or not redirect_hop.value ? 'url'
        or exists (
          select 1
          from pg_catalog.jsonb_object_keys(redirect_hop.value) as object_keys(object_key)
          where object_key not in ('hop', 'status', 'url')
        )
        or pg_catalog.jsonb_typeof(redirect_hop.value -> 'hop') <> 'number'
        or not (redirect_hop.value ->> 'hop' ~ '^(0|[1-9][0-9]*)$')
        or (redirect_hop.value ->> 'hop')::numeric > 20
        or pg_catalog.jsonb_typeof(redirect_hop.value -> 'status') <> 'number'
        or not (redirect_hop.value ->> 'status' ~ '^[1-5][0-9]{2}$')
        or (redirect_hop.value ->> 'status')::numeric not between 100 and 599
        or pg_catalog.jsonb_typeof(redirect_hop.value -> 'url') <> 'string'
        or pg_catalog.char_length(redirect_hop.value ->> 'url') not between 1 and 4096
    );
$$;

create table public.collection_attempts (
  id uuid primary key,
  project_id uuid not null
    constraint collection_attempts_project_id_fkey
    references public.projects (id) on delete restrict,
  source_id uuid not null
    constraint collection_attempts_source_id_fkey
    references public.sources (id) on delete restrict,
  parent_discovered_item_id uuid null,
  idempotency_key text not null,
  requested_url text not null,
  final_url text null,
  redirect_chain jsonb not null default '[]'::jsonb,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  collected_at timestamptz not null,
  http_status integer null,
  media_type text null,
  etag text null,
  last_modified text null,
  decompressed_bytes integer null,
  outcome public.collection_outcome not null,
  error_code text null,
  error_detail text null,
  raw_item_id uuid null,
  discovered_count integer not null default 0,
  body_fetch_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint collection_attempts_idempotency_key_key unique (idempotency_key),
  constraint collection_attempts_id_project_source_key unique (id, project_id, source_id),
  constraint collection_attempts_idempotency_key_valid check (
    idempotency_key = pg_catalog.btrim(idempotency_key)
    and pg_catalog.char_length(idempotency_key) between 1 and 255
  ),
  constraint collection_attempts_requested_url_valid check (
    pg_catalog.char_length(requested_url) between 1 and 4096
  ),
  constraint collection_attempts_final_url_valid check (
    final_url is null or pg_catalog.char_length(final_url) between 1 and 4096
  ),
  constraint collection_attempts_redirect_chain_valid check (
    public.valid_collection_redirect_chain(redirect_chain)
  ),
  constraint collection_attempts_completed_after_started check (completed_at >= started_at),
  constraint collection_attempts_http_status_valid check (
    http_status is null or http_status between 100 and 599
  ),
  constraint collection_attempts_media_type_valid check (
    media_type is null or pg_catalog.char_length(media_type) between 1 and 255
  ),
  constraint collection_attempts_etag_valid check (
    etag is null or pg_catalog.char_length(etag) between 1 and 1024
  ),
  constraint collection_attempts_last_modified_valid check (
    last_modified is null or pg_catalog.char_length(last_modified) between 1 and 128
  ),
  constraint collection_attempts_decompressed_bytes_valid check (
    decompressed_bytes is null or decompressed_bytes between 0 and 2097152
  ),
  constraint collection_attempts_error_code_valid check (
    error_code is null or pg_catalog.char_length(error_code) between 1 and 100
  ),
  constraint collection_attempts_error_detail_valid check (
    error_detail is null or pg_catalog.char_length(error_detail) between 1 and 500
  ),
  constraint collection_attempts_discovered_count_valid check (
    discovered_count between 0 and 100
  ),
  constraint collection_attempts_body_fetch_count_valid check (
    body_fetch_count between 0 and 20
  )
);

create table public.raw_items (
  id uuid primary key,
  project_id uuid not null
    constraint raw_items_project_id_fkey
    references public.projects (id) on delete restrict,
  source_id uuid not null
    constraint raw_items_source_id_fkey
    references public.sources (id) on delete restrict,
  parent_discovered_item_id uuid null,
  logical_url text not null,
  final_url text not null,
  content_kind public.collection_content_kind not null,
  media_type text not null,
  raw_text text not null,
  sha256 text not null,
  published_at timestamptz null,
  collected_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint raw_items_id_project_source_key unique (id, project_id, source_id),
  constraint raw_items_project_source_logical_sha_key
    unique (project_id, source_id, logical_url, sha256),
  constraint raw_items_logical_url_valid check (
    pg_catalog.char_length(logical_url) between 1 and 4096
  ),
  constraint raw_items_final_url_valid check (
    pg_catalog.char_length(final_url) between 1 and 4096
  ),
  constraint raw_items_media_type_valid check (
    pg_catalog.char_length(media_type) between 1 and 255
  ),
  constraint raw_items_raw_text_valid check (
    pg_catalog.octet_length(raw_text) <= 2097152
  ),
  constraint raw_items_sha256_valid check (sha256 ~ '^[0-9a-f]{64}$')
);

create table public.discovered_items (
  id uuid primary key,
  project_id uuid not null
    constraint discovered_items_project_id_fkey
    references public.projects (id) on delete restrict,
  source_id uuid not null
    constraint discovered_items_source_id_fkey
    references public.sources (id) on delete restrict,
  feed_raw_item_id uuid not null,
  stable_entry_key text not null,
  version integer not null,
  supersedes_discovered_item_id uuid null,
  entry_url text null,
  title text null,
  summary text null,
  author text null,
  external_entry_id text null,
  published_at timestamptz null,
  updated_at timestamptz null,
  is_authority_domain boolean not null,
  disposition public.discovery_disposition not null,
  article_collection_attempt_id uuid null,
  article_raw_item_id uuid null,
  created_at timestamptz not null default now(),
  constraint discovered_items_id_project_source_key unique (id, project_id, source_id),
  constraint discovered_items_identity_key unique (id, project_id, source_id, stable_entry_key),
  constraint discovered_items_feed_entry_version_key
    unique (feed_raw_item_id, stable_entry_key, version),
  constraint discovered_items_stable_entry_key_valid check (
    pg_catalog.char_length(stable_entry_key) between 1 and 4096
  ),
  constraint discovered_items_version_positive check (version > 0),
  constraint discovered_items_entry_url_valid check (
    entry_url is null or pg_catalog.char_length(entry_url) between 1 and 4096
  ),
  constraint discovered_items_title_valid check (
    title is null or pg_catalog.char_length(title) between 1 and 500
  ),
  constraint discovered_items_summary_valid check (
    summary is null or pg_catalog.char_length(summary) between 1 and 10000
  ),
  constraint discovered_items_author_valid check (
    author is null or pg_catalog.char_length(author) between 1 and 500
  ),
  constraint discovered_items_external_entry_id_valid check (
    external_entry_id is null or pg_catalog.char_length(external_entry_id) between 1 and 2048
  )
);

alter table public.collection_attempts
  add constraint collection_attempts_parent_identity_fkey
  foreign key (parent_discovered_item_id, project_id, source_id)
  references public.discovered_items (id, project_id, source_id)
  on delete restrict deferrable initially deferred,
  add constraint collection_attempts_raw_item_identity_fkey
  foreign key (raw_item_id, project_id, source_id)
  references public.raw_items (id, project_id, source_id)
  on delete restrict deferrable initially deferred;

alter table public.raw_items
  add constraint raw_items_parent_identity_fkey
  foreign key (parent_discovered_item_id, project_id, source_id)
  references public.discovered_items (id, project_id, source_id)
  on delete restrict deferrable initially deferred;

alter table public.discovered_items
  add constraint discovered_items_feed_raw_identity_fkey
  foreign key (feed_raw_item_id, project_id, source_id)
  references public.raw_items (id, project_id, source_id)
  on delete restrict deferrable initially deferred,
  add constraint discovered_items_supersedes_identity_fkey
  foreign key (supersedes_discovered_item_id, project_id, source_id, stable_entry_key)
  references public.discovered_items (id, project_id, source_id, stable_entry_key)
  on delete restrict deferrable initially deferred,
  add constraint discovered_items_article_attempt_identity_fkey
  foreign key (article_collection_attempt_id, project_id, source_id)
  references public.collection_attempts (id, project_id, source_id)
  on delete restrict deferrable initially deferred,
  add constraint discovered_items_article_raw_identity_fkey
  foreign key (article_raw_item_id, project_id, source_id)
  references public.raw_items (id, project_id, source_id)
  on delete restrict deferrable initially deferred;

create index collection_attempts_source_collected_idx
on public.collection_attempts (source_id, collected_at desc, id desc);

create index raw_items_source_collected_idx
on public.raw_items (source_id, collected_at desc, id desc);

create index discovered_items_source_created_idx
on public.discovered_items (source_id, created_at desc, id desc);

create function public.reject_collection_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'collection_history_append_only' using errcode = '55000';
end;
$$;

create trigger collection_attempts_reject_mutation
before update or delete on public.collection_attempts
for each row execute function public.reject_collection_history_mutation();

create trigger raw_items_reject_mutation
before update or delete on public.raw_items
for each row execute function public.reject_collection_history_mutation();

create trigger discovered_items_reject_mutation
before update or delete on public.discovered_items
for each row execute function public.reject_collection_history_mutation();

alter table public.collection_attempts enable row level security;
alter table public.collection_attempts force row level security;
alter table public.raw_items enable row level security;
alter table public.raw_items force row level security;
alter table public.discovered_items enable row level security;
alter table public.discovered_items force row level security;

do $role_boundary$
declare
  worker_role pg_catalog.pg_roles%rowtype;
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'collection_worker'
  ) then
    create role collection_worker
      nologin
      noinherit
      nobypassrls
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication;
  end if;

  alter role collection_worker
    nologin
    noinherit
    nocreatedb
    nocreaterole
    password null;

  select *
  into strict worker_role
  from pg_catalog.pg_roles
  where rolname = 'collection_worker';

  if worker_role.rolsuper
    or worker_role.rolbypassrls
    or worker_role.rolreplication
  then
    raise exception 'collection_worker_privileged_attributes_forbidden'
      using errcode = '55000';
  end if;
end;
$role_boundary$;

grant collection_worker to postgres
with admin false, inherit false, set true;

create function public.load_source_collection_context(
  requested_project_id uuid,
  requested_source_id uuid
)
returns table (
  project_id uuid,
  source_id uuid,
  canonical_url text,
  authority_domains text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if requested_project_id is null or requested_source_id is null then
    raise exception 'source_collection_context_ids_required' using errcode = '22004';
  end if;

  return query
  select
    project_source.project_id,
    project_source.source_id,
    source_record.canonical_url,
    project_source.authority_domains
  from public.project_sources as project_source
  join public.projects as project_record
    on project_record.id = project_source.project_id
  join public.sources as source_record
    on source_record.id = project_source.source_id
  where project_source.project_id = requested_project_id
    and project_source.source_id = requested_source_id
    and project_source.is_official
    and project_source.verified_at is not null
    and project_source.verified_by is not null
    and project_record.lifecycle = 'active'
    and source_record.status = 'active';
end;
$$;

alter function public.load_source_collection_context(uuid, uuid) owner to postgres;

revoke all on table public.collection_attempts from public, anon, authenticated, service_role;
revoke all on table public.raw_items from public, anon, authenticated, service_role;
revoke all on table public.discovered_items from public, anon, authenticated, service_role;

grant usage on schema public to collection_worker;
grant select, insert on table public.collection_attempts to collection_worker;
grant select, insert on table public.raw_items to collection_worker;
grant select, insert on table public.discovered_items to collection_worker;

revoke all on function public.load_source_collection_context(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.load_source_collection_context(uuid, uuid)
to collection_worker;

revoke all on function public.valid_collection_redirect_chain(jsonb)
from public, anon, authenticated, service_role, collection_worker;
grant execute on function public.valid_collection_redirect_chain(jsonb)
to collection_worker;
revoke all on function public.reject_collection_history_mutation()
from public, anon, authenticated, service_role, collection_worker;

create policy collection_attempts_select_collection_worker
on public.collection_attempts
for select
to collection_worker
using (true);

comment on policy collection_attempts_select_collection_worker on public.collection_attempts is
  'Collection workers may read append-only attempt history for idempotent collection.';

create policy collection_attempts_insert_collection_worker
on public.collection_attempts
for insert
to collection_worker
with check (
  exists (
    select 1
    from public.load_source_collection_context(project_id, source_id)
  )
);

comment on policy collection_attempts_insert_collection_worker on public.collection_attempts is
  'Collection workers may append attempts only for verified active official project sources.';

create policy raw_items_select_collection_worker
on public.raw_items
for select
to collection_worker
using (true);

comment on policy raw_items_select_collection_worker on public.raw_items is
  'Collection workers may read append-only raw history for content idempotency.';

create policy raw_items_insert_collection_worker
on public.raw_items
for insert
to collection_worker
with check (
  exists (
    select 1
    from public.load_source_collection_context(project_id, source_id)
  )
);

comment on policy raw_items_insert_collection_worker on public.raw_items is
  'Collection workers may append raw content only for verified active official project sources.';

create policy discovered_items_select_collection_worker
on public.discovered_items
for select
to collection_worker
using (true);

comment on policy discovered_items_select_collection_worker on public.discovered_items is
  'Collection workers may read append-only discovery history for versioning.';

create policy discovered_items_insert_collection_worker
on public.discovered_items
for insert
to collection_worker
with check (
  exists (
    select 1
    from public.load_source_collection_context(project_id, source_id)
  )
);

comment on policy discovered_items_insert_collection_worker on public.discovered_items is
  'Collection workers may append discovery versions only for verified active official project sources.';
