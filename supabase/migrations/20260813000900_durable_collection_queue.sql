create type public.durable_job_state as enum (
  'queued', 'leased', 'retry_wait', 'succeeded', 'dead_letter', 'canceled'
);

create type public.durable_job_event_type as enum (
  'enqueued', 'claimed', 'lease_renewed', 'lease_expired',
  'retry_scheduled', 'succeeded', 'dead_lettered', 'canceled'
);

create type public.source_schedule_command_type as enum (
  'pause', 'resume', 'change_interval', 'collect_now'
);

create type public.source_schedule_event_type as enum (
  'auto_created', 'paused', 'resumed', 'interval_changed'
);

create type public.collection_job_trigger as enum ('scheduled', 'manual');
create type public.source_schedule_origin as enum ('automatic', 'manual');

create table public.source_collection_schedules (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null,
  source_id uuid not null,
  enabled boolean not null default true,
  enablement_origin public.source_schedule_origin not null default 'automatic',
  interval_seconds integer not null default 1800,
  next_run_at timestamptz not null,
  last_enqueued_at timestamptz null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_collection_schedules_project_source_key unique (project_id, source_id),
  constraint source_collection_schedules_identity_key unique (id, project_id, source_id),
  constraint source_collection_schedules_project_source_fkey
    foreign key (project_id, source_id)
    references public.project_sources (project_id, source_id)
    on delete restrict,
  constraint source_collection_schedules_interval_bounds
    check (interval_seconds between 300 and 604800),
  constraint source_collection_schedules_version_positive check (version > 0)
);

create table public.source_schedule_commands (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null
    constraint source_schedule_commands_actor_id_fkey
    references public.profiles (id) on delete restrict,
  schedule_id uuid not null
    constraint source_schedule_commands_schedule_id_fkey
    references public.source_collection_schedules (id) on delete restrict,
  command_type public.source_schedule_command_type not null,
  idempotency_key text not null,
  input_hash text not null,
  expected_version bigint not null,
  resulting_version bigint not null,
  result_enabled boolean not null,
  result_interval_seconds integer not null,
  result_next_run_at timestamptz not null,
  job_id uuid null,
  created_at timestamptz not null default now(),
  constraint source_schedule_commands_replay_key
    unique (actor_id, schedule_id, idempotency_key),
  constraint source_schedule_commands_idempotency_key_valid check (
    idempotency_key = pg_catalog.btrim(idempotency_key)
    and pg_catalog.char_length(idempotency_key) between 1 and 255
  ),
  constraint source_schedule_commands_input_hash_valid check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint source_schedule_commands_versions_valid check (
    expected_version >= 0 and resulting_version > 0
  ),
  constraint source_schedule_commands_interval_bounds check (
    result_interval_seconds between 300 and 604800
  )
);

create table public.source_schedule_events (
  id uuid primary key default extensions.gen_random_uuid(),
  schedule_id uuid not null
    constraint source_schedule_events_schedule_id_fkey
    references public.source_collection_schedules (id) on delete restrict,
  event_type public.source_schedule_event_type not null,
  schedule_version bigint not null,
  actor_id uuid null
    constraint source_schedule_events_actor_id_fkey
    references public.profiles (id) on delete restrict,
  command_id uuid null
    constraint source_schedule_events_command_id_fkey
    references public.source_schedule_commands (id) on delete restrict,
  occurred_at timestamptz not null,
  constraint source_schedule_events_version_positive check (schedule_version > 0),
  constraint source_schedule_events_actor_command_pair check (
    (actor_id is null and command_id is null)
    or (actor_id is not null and command_id is not null)
  )
);

create function public.valid_collection_job_payload(
  candidate jsonb,
  normalized_project_id uuid,
  normalized_source_id uuid,
  normalized_schedule_id uuid,
  normalized_schedule_version bigint,
  normalized_rule_version text,
  normalized_trigger public.collection_job_trigger,
  normalized_scheduled_for timestamptz
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select
    pg_catalog.jsonb_typeof(candidate) = 'object'
    and (
      select count(*) = 7
      from pg_catalog.jsonb_object_keys(candidate) as payload_keys(payload_key)
    )
    and candidate ?& array[
      'collectionRuleVersion', 'projectId', 'scheduleId', 'scheduleVersion',
      'scheduledFor', 'sourceId', 'trigger'
    ]::text[]
    and pg_catalog.jsonb_typeof(candidate -> 'projectId') = 'string'
    and candidate ->> 'projectId' = normalized_project_id::text
    and pg_catalog.jsonb_typeof(candidate -> 'sourceId') = 'string'
    and candidate ->> 'sourceId' = normalized_source_id::text
    and pg_catalog.jsonb_typeof(candidate -> 'scheduleId') = 'string'
    and candidate ->> 'scheduleId' = normalized_schedule_id::text
    and pg_catalog.jsonb_typeof(candidate -> 'scheduleVersion') = 'number'
    and candidate ->> 'scheduleVersion' ~ '^[1-9][0-9]*$'
    and (candidate ->> 'scheduleVersion')::numeric = normalized_schedule_version
    and pg_catalog.jsonb_typeof(candidate -> 'collectionRuleVersion') = 'string'
    and candidate ->> 'collectionRuleVersion' = normalized_rule_version
    and pg_catalog.jsonb_typeof(candidate -> 'trigger') = 'string'
    and candidate ->> 'trigger' = normalized_trigger::text
    and pg_catalog.jsonb_typeof(candidate -> 'scheduledFor') = 'string'
    and (candidate ->> 'scheduledFor')::timestamptz = normalized_scheduled_for;
$$;

create table public.durable_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  job_type text not null default 'collect.source',
  contract_version integer not null default 1,
  project_id uuid not null,
  source_id uuid not null,
  schedule_id uuid not null,
  schedule_version bigint not null,
  collection_rule_version text not null default 'collection-v1',
  trigger public.collection_job_trigger not null,
  scheduled_for timestamptz not null,
  idempotency_key text not null,
  payload jsonb not null,
  payload_hash text not null,
  state public.durable_job_state not null default 'queued',
  execution_attempt integer not null default 0,
  delivery_count integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null,
  lease_owner text null,
  lease_epoch bigint not null default 0,
  lease_expires_at timestamptz null,
  last_result_code text null,
  last_error_detail text null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint durable_jobs_idempotency_key_key unique (idempotency_key),
  constraint durable_jobs_scheduled_identity_key unique (
    project_id, source_id, schedule_id, scheduled_for, schedule_version,
    collection_rule_version, trigger
  ),
  constraint durable_jobs_schedule_identity_fkey
    foreign key (schedule_id, project_id, source_id)
    references public.source_collection_schedules (id, project_id, source_id)
    on delete restrict,
  constraint durable_jobs_job_type check (job_type = 'collect.source'),
  constraint durable_jobs_contract_version check (contract_version = 1),
  constraint durable_jobs_schedule_version_positive check (schedule_version > 0),
  constraint durable_jobs_collection_rule_version_valid check (
    collection_rule_version = pg_catalog.btrim(collection_rule_version)
    and pg_catalog.char_length(collection_rule_version) between 1 and 100
  ),
  constraint durable_jobs_idempotency_key_valid check (
    idempotency_key = pg_catalog.btrim(idempotency_key)
    and pg_catalog.char_length(idempotency_key) between 1 and 255
  ),
  constraint durable_jobs_payload_valid check (
    public.valid_collection_job_payload(
      payload, project_id, source_id, schedule_id, schedule_version,
      collection_rule_version, trigger, scheduled_for
    )
  ),
  constraint durable_jobs_payload_hash_valid check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint durable_jobs_attempts_valid check (
    max_attempts = 5
    and execution_attempt between 0 and max_attempts
    and delivery_count >= execution_attempt
  ),
  constraint durable_jobs_lease_epoch_nonnegative check (lease_epoch >= 0),
  constraint durable_jobs_lease_shape check (
    (state = 'leased' and lease_owner is not null and lease_expires_at is not null)
    or (state <> 'leased' and lease_owner is null and lease_expires_at is null)
  ),
  constraint durable_jobs_lease_owner_valid check (
    lease_owner is null
    or (
      lease_owner = pg_catalog.btrim(lease_owner)
      and pg_catalog.char_length(lease_owner) between 1 and 255
    )
  ),
  constraint durable_jobs_result_code_valid check (
    last_result_code is null or pg_catalog.char_length(last_result_code) between 1 and 100
  ),
  constraint durable_jobs_error_detail_valid check (
    last_error_detail is null or pg_catalog.char_length(last_error_detail) between 1 and 500
  ),
  constraint durable_jobs_version_positive check (version > 0),
  constraint durable_jobs_completion_shape check (
    (state in ('succeeded', 'dead_letter', 'canceled') and completed_at is not null)
    or (state not in ('succeeded', 'dead_letter', 'canceled') and completed_at is null)
  )
);

alter table public.source_schedule_commands
  add constraint source_schedule_commands_job_id_fkey
  foreign key (job_id) references public.durable_jobs (id) on delete restrict;

create table public.durable_job_events (
  id uuid primary key default extensions.gen_random_uuid(),
  job_id uuid not null
    constraint durable_job_events_job_id_fkey
    references public.durable_jobs (id) on delete restrict,
  event_type public.durable_job_event_type not null,
  job_state public.durable_job_state not null,
  job_version bigint not null,
  execution_attempt integer null,
  lease_epoch bigint null,
  worker_id text null,
  result_code text null,
  detail text null,
  occurred_at timestamptz not null,
  constraint durable_job_events_job_version_positive check (job_version > 0),
  constraint durable_job_events_execution_attempt_valid check (
    execution_attempt is null or execution_attempt between 0 and 5
  ),
  constraint durable_job_events_lease_epoch_valid check (lease_epoch is null or lease_epoch >= 0),
  constraint durable_job_events_worker_id_valid check (
    worker_id is null
    or (
      worker_id = pg_catalog.btrim(worker_id)
      and pg_catalog.char_length(worker_id) between 1 and 255
    )
  ),
  constraint durable_job_events_result_code_valid check (
    result_code is null or pg_catalog.char_length(result_code) between 1 and 100
  ),
  constraint durable_job_events_detail_valid check (
    detail is null or pg_catalog.char_length(detail) between 1 and 500
  )
);

create index source_collection_schedules_due_idx
on public.source_collection_schedules (next_run_at, id) where enabled;
create index source_schedule_commands_schedule_created_idx
on public.source_schedule_commands (schedule_id, created_at, id);
create index source_schedule_events_schedule_occurred_idx
on public.source_schedule_events (schedule_id, occurred_at, id);
create index durable_jobs_runnable_idx
on public.durable_jobs (available_at, id) where state in ('queued', 'retry_wait');
create index durable_jobs_expired_lease_idx
on public.durable_jobs (lease_expires_at, id) where state = 'leased';
create index durable_job_events_job_occurred_idx
on public.durable_job_events (job_id, occurred_at, id);

create function public.reject_collection_queue_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'collection_queue_history_append_only' using errcode = '55000';
end;
$$;

create trigger source_schedule_commands_reject_mutation
before update or delete on public.source_schedule_commands
for each row execute function public.reject_collection_queue_history_mutation();
create trigger source_schedule_events_reject_mutation
before update or delete on public.source_schedule_events
for each row execute function public.reject_collection_queue_history_mutation();
create trigger durable_job_events_reject_mutation
before update or delete on public.durable_job_events
for each row execute function public.reject_collection_queue_history_mutation();

alter table public.source_collection_schedules enable row level security;
alter table public.source_collection_schedules force row level security;
alter table public.source_schedule_commands enable row level security;
alter table public.source_schedule_commands force row level security;
alter table public.source_schedule_events enable row level security;
alter table public.source_schedule_events force row level security;
alter table public.durable_jobs enable row level security;
alter table public.durable_jobs force row level security;
alter table public.durable_job_events enable row level security;
alter table public.durable_job_events force row level security;

do $role_boundary$
declare
  role_name text;
  role_record pg_catalog.pg_roles%rowtype;
begin
  foreach role_name in array array['collection_queue_worker', 'collection_schedule_admin']
  loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = role_name) then
      execute pg_catalog.format(
        'create role %I nologin noinherit nobypassrls nosuperuser nocreatedb nocreaterole noreplication',
        role_name
      );
    end if;

    execute pg_catalog.format(
      'alter role %I nologin noinherit nocreatedb nocreaterole password null',
      role_name
    );

    select * into strict role_record from pg_catalog.pg_roles where rolname = role_name;
    if role_record.rolbypassrls
      or role_record.rolsuper
      or role_record.rolreplication
    then
      raise exception 'collection_queue_privileged_role_forbidden' using errcode = '55000';
    end if;
  end loop;
end;
$role_boundary$;

grant collection_queue_worker to postgres with admin false, inherit false, set true;
grant collection_schedule_admin to postgres with admin false, inherit false, set true;

create function public.collection_schedule_jitter_seconds(
  project_id uuid,
  source_id uuid,
  scheduled_for timestamptz,
  interval_seconds integer
)
returns integer
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  input_bytes bytea;
  hash_value numeric := 2166136261;
  byte_index integer;
  jitter_bound integer;
begin
  if interval_seconds not between 300 and 604800 then
    raise exception 'invalid_collection_interval' using errcode = '22023';
  end if;

  input_bytes := pg_catalog.convert_to(
    project_id::text || '|' || source_id::text || '|' ||
    pg_catalog.to_char(scheduled_for at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'UTF8'
  );

  for byte_index in 0..pg_catalog.length(input_bytes) - 1
  loop
    hash_value := pg_catalog.mod(
      (hash_value::bigint # pg_catalog.get_byte(input_bytes, byte_index))::numeric * 16777619,
      4294967296
    );
  end loop;

  jitter_bound := least(300, interval_seconds / 10);
  return pg_catalog.mod(hash_value, jitter_bound + 1)::integer;
end;
$$;

create function public.is_source_collection_eligible(project_id uuid, source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.project_sources as project_source
    join public.projects as project_record on project_record.id = project_source.project_id
    join public.sources as source_record on source_record.id = project_source.source_id
    where project_source.project_id = is_source_collection_eligible.project_id
      and project_source.source_id = is_source_collection_eligible.source_id
      and project_record.lifecycle = 'active'
      and source_record.status = 'active'
      and project_source.is_official
      and project_source.verified_at is not null
      and project_source.verified_by is not null
  );
$$;

create function public.reconcile_due_source_schedules(
  now_at timestamptz,
  batch_limit integer
)
returns table (
  created_schedule_count integer,
  enqueued_count integer,
  canceled_count integer,
  lock_acquired boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_count integer := 0;
  queued_count integer := 0;
  stopped_count integer := 0;
  acquired boolean;
  schedule_record public.source_collection_schedules%rowtype;
  job_record public.durable_jobs%rowtype;
  next_version bigint;
  payload_value jsonb;
  payload_digest text;
  logical_text text;
begin
  if now_at is null or batch_limit is null or batch_limit not between 1 and 100 then
    raise exception 'invalid_collection_queue_batch_limit' using errcode = '22023';
  end if;

  acquired := pg_catalog.pg_try_advisory_xact_lock(9009, 1);
  if not acquired then
    return query select 0, 0, 0, false;
    return;
  end if;

  with eligible_relations as (
    select project_source.project_id, project_source.source_id
    from public.project_sources as project_source
    join public.projects as project_record on project_record.id = project_source.project_id
    join public.sources as source_record on source_record.id = project_source.source_id
    left join public.source_collection_schedules as schedule
      on schedule.project_id = project_source.project_id
      and schedule.source_id = project_source.source_id
    where schedule.id is null
      and project_record.lifecycle = 'active'
      and source_record.status = 'active'
      and project_source.is_official
      and project_source.verified_at is not null
      and project_source.verified_by is not null
    order by project_source.project_id, project_source.source_id
    limit batch_limit
  ), inserted_schedules as (
    insert into public.source_collection_schedules (
      project_id, source_id, next_run_at, created_at, updated_at
    )
    select project_id, source_id, now_at, now_at, now_at
    from eligible_relations
    on conflict (project_id, source_id) do nothing
    returning id, version
  ), inserted_events as (
    insert into public.source_schedule_events (
      schedule_id, event_type, schedule_version, occurred_at
    )
    select id, 'auto_created', version, now_at
    from inserted_schedules
    returning 1
  )
  select count(*) into created_count from inserted_events;

  with canceled_jobs as (
    update public.durable_jobs as job
    set state = 'canceled',
        lease_owner = null,
        lease_expires_at = null,
        last_result_code = 'source_ineligible',
        last_error_detail = null,
        version = job.version + 1,
        updated_at = greatest(now_at, job.updated_at + interval '1 microsecond'),
        completed_at = now_at
    from public.source_collection_schedules as schedule
    where job.schedule_id = schedule.id
      and job.state in ('queued', 'retry_wait')
      and (
        not schedule.enabled
        or not public.is_source_collection_eligible(schedule.project_id, schedule.source_id)
      )
    returning job.*
  ), inserted_events as (
    insert into public.durable_job_events (
      job_id, event_type, job_state, job_version, execution_attempt,
      lease_epoch, result_code, occurred_at
    )
    select id, 'canceled', state, version, execution_attempt,
      lease_epoch, last_result_code, now_at
    from canceled_jobs
    returning 1
  )
  select count(*) into stopped_count from inserted_events;

  for schedule_record in
    select schedule.*
    from public.source_collection_schedules as schedule
    where schedule.enabled
      and schedule.next_run_at <= now_at
      and public.is_source_collection_eligible(schedule.project_id, schedule.source_id)
    order by schedule.next_run_at, schedule.id
    for update of schedule skip locked
    limit batch_limit
  loop
    next_version := schedule_record.version + 1;
    logical_text := pg_catalog.to_char(
      schedule_record.next_run_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    );
    payload_value := pg_catalog.jsonb_build_object(
      'projectId', schedule_record.project_id::text,
      'sourceId', schedule_record.source_id::text,
      'scheduleId', schedule_record.id::text,
      'scheduleVersion', next_version,
      'collectionRuleVersion', 'collection-v1',
      'trigger', 'scheduled',
      'scheduledFor', logical_text
    );
    payload_digest := pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(payload_value::text, 'UTF8'), 'sha256'),
      'hex'
    );

    insert into public.durable_jobs (
      project_id, source_id, schedule_id, schedule_version, trigger, scheduled_for,
      idempotency_key, payload, payload_hash, available_at, created_at, updated_at
    ) values (
      schedule_record.project_id,
      schedule_record.source_id,
      schedule_record.id,
      next_version,
      'scheduled',
      schedule_record.next_run_at,
      'scheduled:' || schedule_record.id::text || ':' || logical_text || ':collection-v1',
      payload_value,
      payload_digest,
      now_at + pg_catalog.make_interval(
        secs => public.collection_schedule_jitter_seconds(
          schedule_record.project_id,
          schedule_record.source_id,
          schedule_record.next_run_at,
          schedule_record.interval_seconds
        )
      ),
      now_at,
      now_at
    )
    on conflict (idempotency_key) do nothing
    returning * into job_record;

    if found then
      insert into public.durable_job_events (
        job_id, event_type, job_state, job_version, execution_attempt,
        lease_epoch, occurred_at
      ) values (
        job_record.id, 'enqueued', job_record.state, job_record.version,
        job_record.execution_attempt, job_record.lease_epoch, now_at
      );

      update public.source_collection_schedules
      set last_enqueued_at = now_at,
          next_run_at = now_at + pg_catalog.make_interval(secs => schedule_record.interval_seconds),
          version = next_version,
          updated_at = greatest(now_at, schedule_record.updated_at + interval '1 microsecond')
      where id = schedule_record.id;

      queued_count := queued_count + 1;
    end if;
  end loop;

  return query select created_count, queued_count, stopped_count, acquired;
end;
$$;

create function public.claim_collection_jobs(
  worker_id text,
  now_at timestamptz,
  batch_limit integer
)
returns table (
  job_id uuid,
  payload jsonb,
  execution_attempt integer,
  delivery_count integer,
  max_attempts integer,
  lease_owner text,
  lease_epoch bigint,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if worker_id is null
    or worker_id <> pg_catalog.btrim(worker_id)
    or pg_catalog.char_length(worker_id) not between 1 and 255
    or now_at is null
    or batch_limit is null
    or batch_limit not between 1 and 100
  then
    raise exception 'invalid_collection_queue_claim' using errcode = '22023';
  end if;

  with expired_jobs as (
    update public.durable_jobs as job
    set state = 'queued',
        lease_owner = null,
        lease_expires_at = null,
        lease_epoch = job.lease_epoch + 1,
        version = job.version + 1,
        updated_at = greatest(now_at, job.updated_at + interval '1 microsecond')
    where job.state = 'leased'
      and job.lease_expires_at <= now_at
    returning job.*
  )
  insert into public.durable_job_events (
    job_id, event_type, job_state, job_version, execution_attempt,
    lease_epoch, worker_id, occurred_at
  )
  select expired.id, 'lease_expired', expired.state, expired.version,
    expired.execution_attempt, expired.lease_epoch, null, now_at
  from expired_jobs as expired;

  return query
  with due_jobs as (
    select job.id, job.state as prior_state, job.execution_attempt
    from public.durable_jobs as job
    where job.state in ('queued', 'retry_wait')
      and job.available_at <= now_at
    order by job.available_at, job.id
    for update of job skip locked
    limit batch_limit
  ), claimed_jobs as (
    update public.durable_jobs as job
    set state = 'leased',
        execution_attempt = case
          when due_jobs.prior_state = 'retry_wait' then job.execution_attempt + 1
          when due_jobs.prior_state = 'queued' and job.execution_attempt = 0 then 1
          else job.execution_attempt
        end,
        delivery_count = job.delivery_count + 1,
        lease_owner = worker_id,
        lease_epoch = job.lease_epoch + 1,
        lease_expires_at = now_at + interval '120 seconds',
        version = job.version + 1,
        updated_at = greatest(now_at, job.updated_at + interval '1 microsecond')
    from due_jobs
    where job.id = due_jobs.id
    returning job.*
  ), inserted_events as (
    insert into public.durable_job_events (
      job_id, event_type, job_state, job_version, execution_attempt,
      lease_epoch, worker_id, occurred_at
    )
    select claimed.id, 'claimed', claimed.state, claimed.version,
      claimed.execution_attempt, claimed.lease_epoch, claimed.lease_owner, now_at
    from claimed_jobs as claimed
  )
  select claimed_jobs.id, claimed_jobs.payload, claimed_jobs.execution_attempt,
    claimed_jobs.delivery_count, claimed_jobs.max_attempts, claimed_jobs.lease_owner,
    claimed_jobs.lease_epoch, claimed_jobs.lease_expires_at
  from claimed_jobs
  order by claimed_jobs.available_at, claimed_jobs.id;
end;
$$;

create function public.assert_collection_job_fence(
  job_id uuid,
  worker_id text,
  lease_epoch bigint,
  now_at timestamptz
)
returns public.durable_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job_record public.durable_jobs%rowtype;
begin
  select * into job_record
  from public.durable_jobs as job
  where job.id = assert_collection_job_fence.job_id
    and job.state = 'leased'
    and job.lease_owner = assert_collection_job_fence.worker_id
    and job.lease_epoch = assert_collection_job_fence.lease_epoch
    and job.lease_expires_at > assert_collection_job_fence.now_at
  for update;

  if not found then
    raise exception 'lease_fence_lost' using errcode = 'P0001';
  end if;

  return job_record;
end;
$$;

create function public.renew_collection_job_lease(
  job_id uuid,
  worker_id text,
  lease_epoch bigint,
  now_at timestamptz
)
returns table (lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job_record public.durable_jobs%rowtype;
  renewed_expires_at timestamptz;
  renewed_version bigint;
begin
  job_record := public.assert_collection_job_fence(job_id, worker_id, lease_epoch, now_at);

  update public.durable_jobs as job
  set lease_expires_at = now_at + interval '120 seconds',
      version = job.version + 1,
      updated_at = greatest(now_at, job.updated_at + interval '1 microsecond')
  where job.id = renew_collection_job_lease.job_id
  returning job.lease_expires_at, job.version
  into renewed_expires_at, renewed_version;

  insert into public.durable_job_events (
    job_id, event_type, job_state, job_version, execution_attempt,
    lease_epoch, worker_id, occurred_at
  ) values (
    job_record.id, 'lease_renewed', 'leased', renewed_version,
    job_record.execution_attempt, job_record.lease_epoch, job_record.lease_owner, now_at
  );

  return query select renewed_expires_at;
end;
$$;

create function public.complete_collection_job(
  job_id uuid,
  worker_id text,
  lease_epoch bigint,
  result_code text,
  now_at timestamptz
)
returns table (completed_job_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job_record public.durable_jobs%rowtype;
  completed_version bigint;
begin
  if result_code is null or pg_catalog.char_length(result_code) not between 1 and 100 then
    raise exception 'invalid_collection_job_result' using errcode = '22023';
  end if;
  job_record := public.assert_collection_job_fence(job_id, worker_id, lease_epoch, now_at);

  update public.durable_jobs as job
  set state = 'succeeded', lease_owner = null, lease_expires_at = null,
      last_result_code = complete_collection_job.result_code, last_error_detail = null,
      version = job.version + 1,
      updated_at = greatest(now_at, job.updated_at + interval '1 microsecond'),
      completed_at = now_at
  where job.id = complete_collection_job.job_id
  returning job.version into completed_version;

  insert into public.durable_job_events (
    job_id, event_type, job_state, job_version, execution_attempt,
    lease_epoch, worker_id, result_code, occurred_at
  ) values (
    job_record.id, 'succeeded', 'succeeded', completed_version,
    job_record.execution_attempt, job_record.lease_epoch, job_record.lease_owner,
    result_code, now_at
  );
  return query select job_record.id;
end;
$$;

create function public.retry_collection_job(
  job_id uuid,
  worker_id text,
  lease_epoch bigint,
  result_code text,
  detail text,
  available_at timestamptz,
  now_at timestamptz
)
returns table (retried_job_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job_record public.durable_jobs%rowtype;
  retried_version bigint;
begin
  if result_code is null
    or pg_catalog.char_length(result_code) not between 1 and 100
    or (detail is not null and pg_catalog.char_length(detail) > 500)
    or available_at is null
    or available_at < now_at
  then
    raise exception 'invalid_collection_job_retry' using errcode = '22023';
  end if;
  job_record := public.assert_collection_job_fence(job_id, worker_id, lease_epoch, now_at);
  if job_record.execution_attempt >= job_record.max_attempts then
    raise exception 'collection_job_attempts_exhausted' using errcode = '22023';
  end if;

  update public.durable_jobs as job
  set state = 'retry_wait', lease_owner = null, lease_expires_at = null,
      last_result_code = retry_collection_job.result_code,
      last_error_detail = retry_collection_job.detail,
      available_at = retry_collection_job.available_at,
      version = job.version + 1,
      updated_at = greatest(now_at, job.updated_at + interval '1 microsecond')
  where job.id = retry_collection_job.job_id
  returning job.version into retried_version;

  insert into public.durable_job_events (
    job_id, event_type, job_state, job_version, execution_attempt,
    lease_epoch, worker_id, result_code, detail, occurred_at
  ) values (
    job_record.id, 'retry_scheduled', 'retry_wait', retried_version,
    job_record.execution_attempt, job_record.lease_epoch, job_record.lease_owner,
    result_code, detail, now_at
  );
  return query select job_record.id;
end;
$$;

create function public.dead_letter_collection_job(
  job_id uuid,
  worker_id text,
  lease_epoch bigint,
  result_code text,
  detail text,
  now_at timestamptz
)
returns table (dead_lettered_job_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job_record public.durable_jobs%rowtype;
  terminal_version bigint;
begin
  if result_code is null
    or pg_catalog.char_length(result_code) not between 1 and 100
    or (detail is not null and pg_catalog.char_length(detail) > 500)
  then
    raise exception 'invalid_collection_job_result' using errcode = '22023';
  end if;
  job_record := public.assert_collection_job_fence(job_id, worker_id, lease_epoch, now_at);

  update public.durable_jobs as job
  set state = 'dead_letter', lease_owner = null, lease_expires_at = null,
      last_result_code = dead_letter_collection_job.result_code,
      last_error_detail = dead_letter_collection_job.detail,
      version = job.version + 1,
      updated_at = greatest(now_at, job.updated_at + interval '1 microsecond'),
      completed_at = now_at
  where job.id = dead_letter_collection_job.job_id
  returning job.version into terminal_version;

  insert into public.durable_job_events (
    job_id, event_type, job_state, job_version, execution_attempt,
    lease_epoch, worker_id, result_code, detail, occurred_at
  ) values (
    job_record.id, 'dead_lettered', 'dead_letter', terminal_version,
    job_record.execution_attempt, job_record.lease_epoch, job_record.lease_owner,
    result_code, detail, now_at
  );
  return query select job_record.id;
end;
$$;

create function public.cancel_collection_job(
  job_id uuid,
  worker_id text,
  lease_epoch bigint,
  result_code text,
  now_at timestamptz
)
returns table (canceled_job_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job_record public.durable_jobs%rowtype;
  terminal_version bigint;
begin
  if result_code is null or pg_catalog.char_length(result_code) not between 1 and 100 then
    raise exception 'invalid_collection_job_result' using errcode = '22023';
  end if;
  job_record := public.assert_collection_job_fence(job_id, worker_id, lease_epoch, now_at);

  update public.durable_jobs as job
  set state = 'canceled', lease_owner = null, lease_expires_at = null,
      last_result_code = cancel_collection_job.result_code, last_error_detail = null,
      version = job.version + 1,
      updated_at = greatest(now_at, job.updated_at + interval '1 microsecond'),
      completed_at = now_at
  where job.id = cancel_collection_job.job_id
  returning job.version into terminal_version;

  insert into public.durable_job_events (
    job_id, event_type, job_state, job_version, execution_attempt,
    lease_epoch, worker_id, result_code, occurred_at
  ) values (
    job_record.id, 'canceled', 'canceled', terminal_version,
    job_record.execution_attempt, job_record.lease_epoch, job_record.lease_owner,
    result_code, now_at
  );
  return query select job_record.id;
end;
$$;

create function public.valid_source_schedule_command_payload(candidate jsonb)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select
    pg_catalog.jsonb_typeof(candidate) = 'object'
    and (
      select pg_catalog.array_agg(payload_key order by payload_key)
      from pg_catalog.jsonb_object_keys(candidate) as payload_keys(payload_key)
    ) = array['command', 'expectedVersion', 'intervalSeconds', 'version']::text[]
    and candidate ->> 'version' = '1'
    and candidate ->> 'expectedVersion' ~ '^(0|[1-9][0-9]*)$'
    and candidate ->> 'command' in ('pause', 'resume', 'change_interval', 'collect_now')
    and (
      (
        candidate ->> 'command' = 'change_interval'
        and pg_catalog.jsonb_typeof(candidate -> 'intervalSeconds') = 'number'
        and candidate ->> 'intervalSeconds' ~ '^[1-9][0-9]*$'
        and (candidate ->> 'intervalSeconds')::numeric between 300 and 604800
      )
      or (
        candidate ->> 'command' <> 'change_interval'
        and pg_catalog.jsonb_typeof(candidate -> 'intervalSeconds') = 'null'
      )
    );
$$;

create function public.execute_source_schedule_command(
  p_actor_id uuid,
  p_schedule_id uuid,
  p_command_payload jsonb,
  p_idempotency_key text,
  p_input_hash text,
  p_now_at timestamptz
)
returns table (
  schedule_id uuid,
  command public.source_schedule_command_type,
  schedule_version bigint,
  enabled boolean,
  interval_seconds integer,
  next_run_at timestamptz,
  job_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  command_type public.source_schedule_command_type;
  expected_version bigint;
  requested_interval integer;
  schedule_record public.source_collection_schedules%rowtype;
  receipt_record public.source_schedule_commands%rowtype;
  command_id uuid := extensions.gen_random_uuid();
  job_record public.durable_jobs%rowtype;
  next_version bigint;
  next_enabled boolean;
  next_interval integer;
  next_run timestamptz;
  event_type public.source_schedule_event_type;
  is_material_change boolean := true;
  payload_value jsonb;
  payload_digest text;
  logical_text text;
begin
  if p_actor_id is null
    or p_schedule_id is null
    or p_now_at is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or p_input_hash !~ '^[0-9a-f]{64}$'
    or not public.valid_source_schedule_command_payload(p_command_payload)
    or pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(p_command_payload::text, 'UTF8'), 'sha256'),
      'hex'
    ) <> p_input_hash
  then
    raise exception 'invalid_schedule_command' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.user_roles as role_grant
    where role_grant.user_id = p_actor_id
      and role_grant.role = 'admin'
      and role_grant.revoked_at is null
  ) then
    raise exception 'admin_required' using errcode = 'P0001';
  end if;

  command_type := (p_command_payload ->> 'command')::public.source_schedule_command_type;
  expected_version := (p_command_payload ->> 'expectedVersion')::bigint;
  requested_interval := case
    when command_type = 'change_interval' then (p_command_payload ->> 'intervalSeconds')::integer
    else null
  end;

  select * into receipt_record
  from public.source_schedule_commands as receipt
  where receipt.actor_id = p_actor_id
    and receipt.schedule_id = p_schedule_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if receipt_record.input_hash <> p_input_hash
      or receipt_record.command_type <> command_type
    then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;

    return query select receipt_record.schedule_id, receipt_record.command_type,
      receipt_record.resulting_version, receipt_record.result_enabled,
      receipt_record.result_interval_seconds, receipt_record.result_next_run_at,
      receipt_record.job_id, true;
    return;
  end if;

  select * into schedule_record
  from public.source_collection_schedules as schedule
  where schedule.id = p_schedule_id
  for update;

  if not found then
    raise exception 'schedule_not_found' using errcode = 'P0001';
  end if;
  if schedule_record.version <> expected_version then
    raise exception 'schedule_version_conflict' using errcode = 'P0001';
  end if;

  next_version := schedule_record.version + 1;
  next_enabled := schedule_record.enabled;
  next_interval := schedule_record.interval_seconds;
  next_run := schedule_record.next_run_at;

  case command_type
    when 'pause' then
      is_material_change := schedule_record.enabled;
      if is_material_change then
        next_enabled := false;
        event_type := 'paused';
      end if;
    when 'resume' then
      is_material_change := not schedule_record.enabled;
      if is_material_change then
        next_enabled := true;
        next_run := p_now_at;
        event_type := 'resumed';
      end if;
    when 'change_interval' then
      is_material_change := requested_interval <> schedule_record.interval_seconds;
      if is_material_change then
        next_interval := requested_interval;
        next_run := p_now_at + pg_catalog.make_interval(secs => requested_interval);
        event_type := 'interval_changed';
      end if;
    when 'collect_now' then
      if not schedule_record.enabled
        or not public.is_source_collection_eligible(schedule_record.project_id, schedule_record.source_id)
      then
        raise exception 'source_ineligible' using errcode = 'P0001';
      end if;
      event_type := null;
  end case;

  if is_material_change then
    update public.source_collection_schedules as schedule
    set enabled = next_enabled,
        enablement_origin = 'manual',
        interval_seconds = next_interval,
        next_run_at = next_run,
        version = next_version,
        updated_at = greatest(p_now_at, schedule.updated_at + interval '1 microsecond')
    where schedule.id = schedule_record.id;
  else
    next_version := schedule_record.version;
  end if;

  if command_type = 'pause' and is_material_change then
    with canceled_jobs as (
      update public.durable_jobs as job
      set state = 'canceled', lease_owner = null, lease_expires_at = null,
          last_result_code = 'source_ineligible', last_error_detail = null,
          version = job.version + 1,
          updated_at = greatest(p_now_at, job.updated_at + interval '1 microsecond'),
          completed_at = p_now_at
      where job.schedule_id = schedule_record.id
        and job.state in ('queued', 'retry_wait')
      returning job.*
    )
    insert into public.durable_job_events (
      job_id, event_type, job_state, job_version, execution_attempt,
      lease_epoch, result_code, occurred_at
    )
    select id, 'canceled', state, version, execution_attempt,
      lease_epoch, last_result_code, p_now_at
    from canceled_jobs;
  elsif command_type = 'collect_now' then
    logical_text := pg_catalog.to_char(
      p_now_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    );
    payload_value := pg_catalog.jsonb_build_object(
      'projectId', schedule_record.project_id::text,
      'sourceId', schedule_record.source_id::text,
      'scheduleId', schedule_record.id::text,
      'scheduleVersion', next_version,
      'collectionRuleVersion', 'collection-v1',
      'trigger', 'manual',
      'scheduledFor', logical_text
    );
    payload_digest := pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(payload_value::text, 'UTF8'), 'sha256'),
      'hex'
    );
    insert into public.durable_jobs (
      project_id, source_id, schedule_id, schedule_version, trigger, scheduled_for,
      idempotency_key, payload, payload_hash, available_at, created_at, updated_at
    ) values (
      schedule_record.project_id, schedule_record.source_id, schedule_record.id,
      next_version, 'manual', p_now_at, 'manual:' || command_id::text,
      payload_value, payload_digest, p_now_at, p_now_at, p_now_at
    ) returning * into job_record;

    insert into public.durable_job_events (
      job_id, event_type, job_state, job_version, execution_attempt,
      lease_epoch, occurred_at
    ) values (
      job_record.id, 'enqueued', job_record.state, job_record.version,
      job_record.execution_attempt, job_record.lease_epoch, p_now_at
    );
  end if;

  insert into public.source_schedule_commands (
    id, actor_id, schedule_id, command_type, idempotency_key, input_hash,
    expected_version, resulting_version, result_enabled, result_interval_seconds,
    result_next_run_at, job_id, created_at
  ) values (
    command_id, p_actor_id, schedule_record.id, command_type, p_idempotency_key, p_input_hash,
    expected_version, next_version, next_enabled, next_interval, next_run,
    job_record.id, p_now_at
  );

  if event_type is not null then
    insert into public.source_schedule_events (
      schedule_id, event_type, schedule_version, actor_id, command_id, occurred_at
    ) values (
      schedule_record.id, event_type, next_version, p_actor_id, command_id, p_now_at
    );
  end if;

  return query select schedule_record.id, command_type, next_version,
    next_enabled, next_interval, next_run, job_record.id, false;
end;
$$;

create function public.collection_queue_health(now_at timestamptz)
returns table (
  queued_count bigint,
  retry_wait_count bigint,
  leased_count bigint,
  expired_lease_count bigint,
  dead_letter_count bigint,
  oldest_runnable_age_seconds integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with queue_metrics as (
    select
      count(*) filter (where state = 'queued') as queued_count,
      count(*) filter (where state = 'retry_wait') as retry_wait_count,
      count(*) filter (where state = 'leased') as leased_count,
      count(*) filter (where state = 'leased' and lease_expires_at <= now_at)
        as expired_lease_count,
      count(*) filter (where state = 'dead_letter') as dead_letter_count,
      min(available_at) filter (
        where state in ('queued', 'retry_wait') and available_at <= now_at
      ) as oldest_runnable_at
    from public.durable_jobs
  )
  select
    queue_metrics.queued_count,
    queue_metrics.retry_wait_count,
    queue_metrics.leased_count,
    queue_metrics.expired_lease_count,
    queue_metrics.dead_letter_count,
    case
      when queue_metrics.oldest_runnable_at is null then null
      else greatest(
        0,
        pg_catalog.floor(
          pg_catalog.date_part('epoch', now_at - queue_metrics.oldest_runnable_at)
        )::integer
      )
    end
  from queue_metrics;
$$;

alter function public.collection_schedule_jitter_seconds(uuid, uuid, timestamptz, integer) owner to postgres;
alter function public.is_source_collection_eligible(uuid, uuid) owner to postgres;
alter function public.reconcile_due_source_schedules(timestamptz, integer) owner to postgres;
alter function public.claim_collection_jobs(text, timestamptz, integer) owner to postgres;
alter function public.assert_collection_job_fence(uuid, text, bigint, timestamptz) owner to postgres;
alter function public.renew_collection_job_lease(uuid, text, bigint, timestamptz) owner to postgres;
alter function public.complete_collection_job(uuid, text, bigint, text, timestamptz) owner to postgres;
alter function public.retry_collection_job(uuid, text, bigint, text, text, timestamptz, timestamptz) owner to postgres;
alter function public.dead_letter_collection_job(uuid, text, bigint, text, text, timestamptz) owner to postgres;
alter function public.cancel_collection_job(uuid, text, bigint, text, timestamptz) owner to postgres;
alter function public.execute_source_schedule_command(uuid, uuid, jsonb, text, text, timestamptz) owner to postgres;
alter function public.collection_queue_health(timestamptz) owner to postgres;

revoke all on table public.source_collection_schedules from public, anon, authenticated, service_role;
revoke all on table public.source_schedule_commands from public, anon, authenticated, service_role;
revoke all on table public.source_schedule_events from public, anon, authenticated, service_role;
revoke all on table public.durable_jobs from public, anon, authenticated, service_role;
revoke all on table public.durable_job_events from public, anon, authenticated, service_role;

grant usage on schema public to collection_queue_worker, collection_schedule_admin;

revoke all on function public.collection_schedule_jitter_seconds(uuid, uuid, timestamptz, integer)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.valid_collection_job_payload(jsonb, uuid, uuid, uuid, bigint, text, public.collection_job_trigger, timestamptz)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.valid_source_schedule_command_payload(jsonb)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.reject_collection_queue_history_mutation()
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.assert_collection_job_fence(uuid, text, bigint, timestamptz)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;

revoke all on function public.is_source_collection_eligible(uuid, uuid)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.reconcile_due_source_schedules(timestamptz, integer)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.claim_collection_jobs(text, timestamptz, integer)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.renew_collection_job_lease(uuid, text, bigint, timestamptz)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.complete_collection_job(uuid, text, bigint, text, timestamptz)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.retry_collection_job(uuid, text, bigint, text, text, timestamptz, timestamptz)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.dead_letter_collection_job(uuid, text, bigint, text, text, timestamptz)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.cancel_collection_job(uuid, text, bigint, text, timestamptz)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.collection_queue_health(timestamptz)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke all on function public.execute_source_schedule_command(uuid, uuid, jsonb, text, text, timestamptz)
from public, anon, authenticated, service_role, collection_worker, collection_queue_worker, collection_schedule_admin;

grant execute on function public.is_source_collection_eligible(uuid, uuid) to collection_queue_worker;
grant execute on function public.reconcile_due_source_schedules(timestamptz, integer) to collection_queue_worker;
grant execute on function public.claim_collection_jobs(text, timestamptz, integer) to collection_queue_worker;
grant execute on function public.renew_collection_job_lease(uuid, text, bigint, timestamptz) to collection_queue_worker;
grant execute on function public.complete_collection_job(uuid, text, bigint, text, timestamptz) to collection_queue_worker;
grant execute on function public.retry_collection_job(uuid, text, bigint, text, text, timestamptz, timestamptz) to collection_queue_worker;
grant execute on function public.dead_letter_collection_job(uuid, text, bigint, text, text, timestamptz) to collection_queue_worker;
grant execute on function public.cancel_collection_job(uuid, text, bigint, text, timestamptz) to collection_queue_worker;
grant execute on function public.collection_queue_health(timestamptz) to collection_queue_worker;
grant execute on function public.execute_source_schedule_command(uuid, uuid, jsonb, text, text, timestamptz)
to collection_schedule_admin;
