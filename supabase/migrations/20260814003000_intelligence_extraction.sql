-- Intelligence extraction layer for Phase 3.
-- AI runs record every model invocation (idempotent per input hash), extraction
-- candidates hold AI-proposed intelligence (never canonical), and promotion
-- events audit every candidate-to-signal transition (append-only).

-- Stage worker role follows the collection_worker boundary pattern.
do $role_boundary$
declare
  worker_role pg_catalog.pg_roles;
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'ai_stage_worker'
  ) then
    create role ai_stage_worker
      nologin
      noinherit
      nobypassrls
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication;
  end if;

  alter role ai_stage_worker
    nologin
    noinherit
    nocreatedb
    nocreaterole
    password null;

  select *
  into strict worker_role
  from pg_catalog.pg_roles
  where rolname = 'ai_stage_worker';

  if worker_role.rolsuper
    or worker_role.rolbypassrls
    or worker_role.rolreplication
  then
    raise exception 'ai_stage_worker_privileged_attributes_forbidden'
      using errcode = '55000';
  end if;
end;
$role_boundary$;

grant ai_stage_worker to postgres
with admin false, inherit false, set true;

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  input_kind text not null,
  input_id uuid not null,
  input_hash text not null,
  model_id text not null,
  prompt_version text not null,
  schema_version text not null,
  pipeline_version text not null,
  status text not null,
  output jsonb null,
  usage jsonb null,
  latency_ms integer null,
  error_detail text null,
  created_at timestamptz not null default now(),
  constraint ai_runs_stage_valid check (
    stage = pg_catalog.btrim(stage)
    and pg_catalog.char_length(stage) between 1 and 60
  ),
  constraint ai_runs_input_kind_valid check (
    input_kind in ('discovered_item', 'raw_item')
  ),
  constraint ai_runs_input_hash_valid check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_runs_model_id_valid check (
    model_id = pg_catalog.btrim(model_id)
    and pg_catalog.char_length(model_id) between 1 and 120
  ),
  constraint ai_runs_version_fields_valid check (
    pg_catalog.char_length(prompt_version) between 1 and 60
    and pg_catalog.char_length(schema_version) between 1 and 60
    and pg_catalog.char_length(pipeline_version) between 1 and 60
  ),
  constraint ai_runs_status_valid check (
    status in (
      'succeeded',
      'schema_invalid_after_repair',
      'grounding_failed',
      'provider_error',
      'skipped_no_content'
    )
  ),
  constraint ai_runs_error_detail_valid check (
    error_detail is null
    or pg_catalog.char_length(error_detail) between 1 and 1000
  ),
  constraint ai_runs_latency_valid check (
    latency_ms is null or latency_ms between 0 and 3600000
  ),
  constraint ai_runs_shape check (
    (status = 'succeeded' and output is not null)
    or (status <> 'succeeded' and output is null)
  ),
  constraint ai_runs_idempotency_key unique (
    stage, input_kind, input_id, input_hash, pipeline_version
  )
);

create index ai_runs_input_lookup_idx
on public.ai_runs (input_kind, input_id, created_at desc);

create table public.extraction_candidates (
  id uuid primary key default gen_random_uuid(),
  ai_run_id uuid not null
    constraint extraction_candidates_ai_run_fkey
    references public.ai_runs (id) on delete restrict,
  project_id uuid not null
    constraint extraction_candidates_project_fkey
    references public.projects (id) on delete restrict,
  source_id uuid not null
    constraint extraction_candidates_source_fkey
    references public.sources (id) on delete restrict,
  discovered_item_id uuid not null
    constraint extraction_candidates_discovered_item_fkey
    references public.discovered_items (id) on delete restrict,
  raw_item_id uuid null
    constraint extraction_candidates_raw_item_fkey
    references public.raw_items (id) on delete restrict,
  payload jsonb not null,
  payload_sha256 text not null,
  status text not null default 'pending',
  signal_id uuid null
    constraint extraction_candidates_signal_fkey
    references public.signals (id) on delete restrict,
  decided_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint extraction_candidates_status_valid check (
    status in ('pending', 'promoted', 'rejected')
  ),
  constraint extraction_candidates_status_shape check (
    (status = 'promoted' and signal_id is not null and decided_at is not null)
    or (status <> 'promoted' and signal_id is null and decided_at is null)
  ),
  constraint extraction_candidates_payload_sha256_valid check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint extraction_candidates_dedup_key unique (
    discovered_item_id, payload_sha256
  )
);

create index extraction_candidates_pending_idx
on public.extraction_candidates (status, created_at desc)
where status = 'pending';

create index extraction_candidates_project_idx
on public.extraction_candidates (project_id, created_at desc);

create table public.promotion_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null
    constraint promotion_events_candidate_fkey
    references public.extraction_candidates (id) on delete restrict,
  signal_id uuid not null
    constraint promotion_events_signal_fkey
    references public.signals (id) on delete restrict,
  actor text not null,
  created_at timestamptz not null default now(),
  constraint promotion_events_actor_valid check (
    actor = pg_catalog.btrim(actor)
    and pg_catalog.char_length(actor) between 1 and 120
  )
);

create index promotion_events_candidate_idx
on public.promotion_events (candidate_id, created_at desc);

alter table public.ai_runs enable row level security;
alter table public.extraction_candidates enable row level security;
alter table public.promotion_events enable row level security;

revoke all on table public.ai_runs from public, anon, authenticated, service_role;
revoke all on table public.extraction_candidates from public, anon, authenticated, service_role;
revoke all on table public.promotion_events from public, anon, authenticated, service_role;

grant usage on schema public to ai_stage_worker;
grant select, insert on table public.ai_runs to ai_stage_worker;
grant select, insert, update
  (status, signal_id, decided_at)
on table public.extraction_candidates to ai_stage_worker;
grant select on table public.extraction_candidates to ai_stage_worker;
grant insert on table public.promotion_events to ai_stage_worker;
grant select on table public.promotion_events to ai_stage_worker;
grant select on table public.discovered_items to ai_stage_worker;
grant select on table public.raw_items to ai_stage_worker;
grant insert on table public.signals to ai_stage_worker;

create policy ai_runs_ai_stage_worker_write
on public.ai_runs
for select
to ai_stage_worker
using (true);

create policy ai_runs_ai_stage_worker_insert
on public.ai_runs
for insert
to ai_stage_worker
with check (true);

create policy extraction_candidates_ai_stage_worker_read
on public.extraction_candidates
for select
to ai_stage_worker
using (true);

create policy extraction_candidates_ai_stage_worker_insert
on public.extraction_candidates
for insert
to ai_stage_worker
with check (true);

create policy extraction_candidates_ai_stage_worker_update
on public.extraction_candidates
for update
to ai_stage_worker
using (true)
with check (true);

create policy promotion_events_ai_stage_worker_read
on public.promotion_events
for select
to ai_stage_worker
using (true);

create policy promotion_events_ai_stage_worker_insert
on public.promotion_events
for insert
to ai_stage_worker
with check (true);

-- Promotion writes canonical signals through the stage worker boundary.
create policy signals_ai_stage_worker_insert
on public.signals
for insert
to ai_stage_worker
with check (true);

-- Historical AI run and promotion records are append-only.
create function public.reject_ai_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ai_history_append_only' using errcode = '55000';
  return null;
end;
$$;

alter function public.reject_ai_history_mutation owner to postgres;

create trigger promotion_events_append_only
before update or delete on public.promotion_events
for each row execute function public.reject_ai_history_mutation();
