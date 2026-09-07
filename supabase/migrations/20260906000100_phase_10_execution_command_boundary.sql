-- Phase 10 Execution command boundary (migration 32).
-- Migration 5 created the four Execution tables with owner-scoped RLS and one
-- security definer update command, but left browser rows directly writable.
-- This forward-only migration hardens the domain to the Phase 9 standard:
-- every write becomes a versioned, idempotent, receipt-first command, task
-- changes append to an immutable history, and outbox events commit in the same
-- transaction as the state they describe.

-- ---------------------------------------------------------------------------
-- 1. Ledger shape, aggregate versions, and browser write denial
-- ---------------------------------------------------------------------------

alter table public.watchlists
  add column version bigint not null default 1,
  add constraint watchlists_version_positive check (version > 0);

alter table public.user_projects
  add column version bigint not null default 1,
  add constraint user_projects_version_positive check (version > 0);

create table public.user_task_events (
  id uuid primary key default extensions.gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null,
  event_type text not null,
  task_version bigint not null,
  actor_user_id uuid not null,
  title text not null,
  status public.task_status not null,
  priority public.task_priority not null,
  occurred_at timestamptz not null,
  constraint user_task_events_type_valid check (
    event_type in ('created', 'updated', 'deleted', 'status_changed')
  ),
  constraint user_task_events_version_positive check (task_version > 0)
);

comment on table public.user_task_events is
  'Append-only history of every execution task change; rows are never updated or deleted.';

alter table public.user_task_events enable row level security;

create policy user_task_events_select_owner
on public.user_task_events
for select
to authenticated
using (user_id = (select auth.uid()));

comment on policy user_task_events_select_owner
on public.user_task_events is
  'A user may read their own task history; nothing else may touch this table.';

grant select on table public.user_task_events to authenticated;

-- No write policy: only the protected commands below may append, and they run
-- as the owner.

create table public.execution_command_receipts (
  idempotency_key text not null,
  command text not null,
  user_id uuid not null,
  response jsonb not null,
  id uuid not null default extensions.gen_random_uuid(),
  input_hash text null,
  expected_version bigint null,
  resulting_version bigint null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint execution_command_receipts_pkey primary key (command, user_id, idempotency_key)
);

comment on table public.execution_command_receipts is
  'Idempotency receipts for execution commands; a repeated key replays its original response.';

alter table public.execution_command_receipts enable row level security;

-- No policy at all: receipts are only written and read by the definer commands.

-- Direct browser writes are closed on every execution table. The protected
-- commands are the only write path, exactly as in the Identity domain.

revoke insert, update, delete, truncate on table public.watchlists
  from public, anon, authenticated, service_role, ai_stage_worker, promotion_service, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke insert, update, delete, truncate on table public.watchlist_projects
  from public, anon, authenticated, service_role, ai_stage_worker, promotion_service, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke insert, update, delete, truncate on table public.user_projects
  from public, anon, authenticated, service_role, ai_stage_worker, promotion_service, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke insert, update, delete, truncate on table public.user_tasks
  from public, anon, authenticated, service_role, ai_stage_worker, promotion_service, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke insert, update, delete, truncate on table public.user_task_events
  from public, anon, authenticated, service_role, ai_stage_worker, promotion_service, collection_worker, collection_queue_worker, collection_schedule_admin;
revoke insert, update, delete, truncate on table public.execution_command_receipts
  from public, anon, authenticated, service_role, ai_stage_worker, promotion_service, collection_worker, collection_queue_worker, collection_schedule_admin;

-- The read policies stay: they are what the security definer commands rely on
-- for row visibility, and they are what keeps a leaked bearer token from
-- reading another user's rows through any future accidental grant.

create function public.reject_execution_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'execution_ledger_rows_are_command_owned' using errcode = '55000';
end;
$function$;

alter function public.reject_execution_ledger_mutation() owner to postgres;
revoke all on function public.reject_execution_ledger_mutation() from public;

create trigger execution_command_receipts_reject_mutation
before update or delete on public.execution_command_receipts
for each row execute function public.reject_execution_ledger_mutation();

create trigger user_task_events_reject_mutation
before update or delete on public.user_task_events
for each row execute function public.reject_execution_ledger_mutation();

-- ---------------------------------------------------------------------------
-- 2. Versioned, receipt-first mutation commands
-- ---------------------------------------------------------------------------
--
-- Every command follows the same shape proven in the Identity domain:
--   1. fail closed without a session (EX201)
--   2. validate the exact payload shape
--   3. hash the input and take a per-user, per-command advisory lock
--   4. replay an existing receipt when the hash matches, reject when it does not
--   5. lock the row, verify the expected version
--   6. write state, append history, insert the outbox event, insert the receipt
--      all in one transaction

create or replace function public.submit_create_task(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.execution_command_receipts%rowtype;
  v_task_id uuid := extensions.gen_random_uuid();
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task_count bigint;
  v_status public.task_status;
  v_priority public.task_priority;
begin
  if v_user_id is null then
    raise exception 'execution_session_required' using errcode = 'EX201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload,
      array['idempotencyKey', 'expectedVersion', 'projectId', 'title', 'status', 'priority', 'dueAt']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or p_payload ->> 'expectedVersion' <> '1'
    or not (
      pg_catalog.jsonb_typeof(p_payload -> 'projectId') = 'null'
      or public.security_json_uuid_is_valid(p_payload, 'projectId')
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'title') <> 'string'
    or p_payload ->> 'title' <> pg_catalog.btrim(p_payload ->> 'title')
    or pg_catalog.char_length(p_payload ->> 'title') not between 1 and 200
    or pg_catalog.jsonb_typeof(p_payload -> 'status') <> 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'priority') <> 'string'
    or not (
      pg_catalog.jsonb_typeof(p_payload -> 'dueAt') = 'null'
      or pg_catalog.jsonb_typeof(p_payload -> 'dueAt') = 'string'
    )
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  v_status := (p_payload ->> 'status')::public.task_status;
  v_priority := (p_payload ->> 'priority')::public.task_priority;

  if p_payload ->> 'dueAt' is not null
    and p_payload ->> 'dueAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'create_task', 'payload', p_payload)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':create_task:' || v_key, 0)
  );

  select * into v_existing
  from public.execution_command_receipts as receipt
  where receipt.command = 'create_task'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'execution_idempotency_conflict' using errcode = 'EX210';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select pg_catalog.count(*) into v_task_count
  from public.user_tasks as task
  where task.user_id = v_user_id;
  if v_task_count >= 500 then
    raise exception 'execution_task_limit_reached' using errcode = 'EX205';
  end if;

  if p_payload ->> 'projectId' is not null then
    perform 1
    from public.projects as project
    where project.id = (p_payload ->> 'projectId')::uuid;
    if not found then
      raise exception 'execution_project_not_found' using errcode = 'EX204';
    end if;
  end if;

  insert into public.user_tasks (
    id, user_id, project_id, title, status, priority, due_at,
    completed_at, version, created_at, updated_at
  ) values (
    v_task_id, v_user_id, (p_payload ->> 'projectId')::uuid,
    p_payload ->> 'title', v_status, v_priority,
    (p_payload ->> 'dueAt')::timestamptz,
    case when v_status = 'completed' then v_now else null end,
    1, v_now, v_now
  );

  insert into public.user_task_events (
    task_id, user_id, event_type, task_version, actor_user_id,
    title, status, priority, occurred_at
  ) values (
    v_task_id, v_user_id, 'created', 1, v_user_id,
    p_payload ->> 'title', v_status, v_priority, v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'replayed', false,
    'taskId', v_task_id,
    'taskVersion', 1
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, event_version, payload, occurred_at
  ) values (
    'execution_task', v_task_id, 1,
    'execution.task.created.v1', 1,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'execution.task.created.v1',
      'aggregateId', v_task_id,
      'aggregateVersion', 1,
      'occurredAt', pg_catalog.to_char(
        v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    ),
    v_now
  );

  insert into public.execution_command_receipts (
    command, user_id, idempotency_key, response, input_hash,
    expected_version, resulting_version, created_at
  ) values (
    'create_task', v_user_id, v_key, v_result, v_input_hash, 1, 1, v_now
  );

  return v_result;
end;
$function$;

alter function public.submit_create_task(jsonb) owner to postgres;
revoke all on function public.submit_create_task(jsonb) from public, anon;
grant execute on function public.submit_create_task(jsonb) to authenticated;

create or replace function public.submit_update_task(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.execution_command_receipts%rowtype;
  v_task public.user_tasks%rowtype;
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_next_version bigint;
  v_next_status public.task_status;
  v_next_priority public.task_priority;
  v_next_title text;
  v_next_project_id uuid;
  v_next_due_at timestamptz;
  v_next_completed_at timestamptz;
  v_material boolean := false;
  v_event_type text := 'updated';
begin
  if v_user_id is null then
    raise exception 'execution_session_required' using errcode = 'EX201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload,
      array['idempotencyKey', 'expectedVersion', 'taskId', 'projectId', 'title',
            'status', 'priority', 'dueAt', 'completedAt']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or not public.security_json_uuid_is_valid(p_payload, 'taskId')
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  if p_payload ->> 'status' is not null
    and pg_catalog.jsonb_typeof(p_payload -> 'status') <> 'string'
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;
  if p_payload ->> 'priority' is not null
    and pg_catalog.jsonb_typeof(p_payload -> 'priority') <> 'string'
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;
  if p_payload ->> 'title' is not null
    and (
      pg_catalog.jsonb_typeof(p_payload -> 'title') <> 'string'
      or p_payload ->> 'title' <> pg_catalog.btrim(p_payload ->> 'title')
      or pg_catalog.char_length(p_payload ->> 'title') not between 1 and 200
    )
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;
  if p_payload ->> 'projectId' is not null
    and pg_catalog.jsonb_typeof(p_payload -> 'projectId') <> 'null'
    and not public.security_json_uuid_is_valid(p_payload, 'projectId')
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'update_task', 'payload', p_payload)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':update_task:' || v_key, 0)
  );

  select * into v_existing
  from public.execution_command_receipts as receipt
  where receipt.command = 'update_task'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'execution_idempotency_conflict' using errcode = 'EX210';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select * into v_task
  from public.user_tasks as task
  where task.id = (p_payload ->> 'taskId')::uuid
    and task.user_id = v_user_id
  for update;
  if not found then
    raise exception 'execution_task_not_found' using errcode = 'EX202';
  end if;
  if v_task.version <> (p_payload ->> 'expectedVersion')::bigint then
    raise exception 'execution_version_conflict' using errcode = 'EX209';
  end if;

  v_next_title := coalesce(p_payload ->> 'title', v_task.title);
  v_next_status := coalesce(
    (p_payload ->> 'status')::public.task_status, v_task.status
  );
  v_next_priority := coalesce(
    (p_payload ->> 'priority')::public.task_priority, v_task.priority
  );
  v_next_project_id := case
    when pg_catalog.jsonb_typeof(p_payload -> 'projectId') = 'null'
      then null
    when p_payload ->> 'projectId' is not null
      then (p_payload ->> 'projectId')::uuid
    else v_task.project_id
  end;
  v_next_due_at := case
    when pg_catalog.jsonb_typeof(p_payload -> 'dueAt') = 'null' then null
    when p_payload ->> 'dueAt' is not null then (p_payload ->> 'dueAt')::timestamptz
    else v_task.due_at
  end;

  if p_payload ->> 'status' is not null then
    if v_next_status = 'completed' then
      v_next_completed_at := case
        when pg_catalog.jsonb_typeof(p_payload -> 'completedAt') = 'null' then null
        when p_payload ->> 'completedAt' is not null
          then (p_payload ->> 'completedAt')::timestamptz
        else coalesce(v_task.completed_at, v_now)
      end;
    else
      v_next_completed_at := null;
    end if;
  else
    v_next_completed_at := v_task.completed_at;
  end if;

  if p_payload ->> 'status' is not null
    and (
      (v_next_status = 'completed') <> (v_next_completed_at is not null)
    )
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  v_material :=
    v_next_title is distinct from v_task.title
    or v_next_status is distinct from v_task.status
    or v_next_priority is distinct from v_task.priority
    or v_next_project_id is distinct from v_task.project_id
    or v_next_due_at is distinct from v_task.due_at
    or v_next_completed_at is distinct from v_task.completed_at;

  if not v_material then
    v_result := pg_catalog.jsonb_build_object(
      'version', 1,
      'commandId', v_command_id,
      'replayed', false,
      'taskId', v_task.id,
      'taskVersion', v_task.version
    );
    insert into public.execution_command_receipts (
      command, user_id, idempotency_key, response, input_hash,
      expected_version, resulting_version, created_at
    ) values (
      'update_task', v_user_id, v_key, v_result, v_input_hash,
      v_task.version, v_task.version, v_now
    );
    return v_result;
  end if;

  v_next_version := v_task.version + 1;

  if v_next_status <> v_task.status then
    v_event_type := 'status_changed';
  end if;

  update public.user_tasks
  set project_id = v_next_project_id,
      title = v_next_title,
      status = v_next_status,
      priority = v_next_priority,
      due_at = v_next_due_at,
      completed_at = v_next_completed_at,
      version = v_next_version,
      updated_at = v_now
  where id = v_task.id;

  insert into public.user_task_events (
    task_id, user_id, event_type, task_version, actor_user_id,
    title, status, priority, occurred_at
  ) values (
    v_task.id, v_user_id, v_event_type, v_next_version, v_user_id,
    v_next_title, v_next_status, v_next_priority, v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'replayed', false,
    'taskId', v_task.id,
    'taskVersion', v_next_version
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, event_version, payload, occurred_at
  ) values (
    'execution_task', v_task.id, v_next_version,
    'execution.task.updated.v1', 1,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'execution.task.updated.v1',
      'aggregateId', v_task.id,
      'aggregateVersion', v_next_version,
      'occurredAt', pg_catalog.to_char(
        v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    ),
    v_now
  );

  insert into public.execution_command_receipts (
    command, user_id, idempotency_key, response, input_hash,
    expected_version, resulting_version, created_at
  ) values (
    'update_task', v_user_id, v_key, v_result, v_input_hash,
    v_task.version, v_next_version, v_now
  );

  return v_result;
end;
$function$;

alter function public.submit_update_task(jsonb) owner to postgres;
revoke all on function public.submit_update_task(jsonb) from public, anon;
grant execute on function public.submit_update_task(jsonb) to authenticated;

create or replace function public.submit_delete_task(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.execution_command_receipts%rowtype;
  v_task public.user_tasks%rowtype;
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'execution_session_required' using errcode = 'EX201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload, array['idempotencyKey', 'expectedVersion', 'taskId']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or not public.security_json_uuid_is_valid(p_payload, 'taskId')
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'delete_task', 'payload', p_payload)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':delete_task:' || v_key, 0)
  );

  select * into v_existing
  from public.execution_command_receipts as receipt
  where receipt.command = 'delete_task'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'execution_idempotency_conflict' using errcode = 'EX210';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select * into v_task
  from public.user_tasks as task
  where task.id = (p_payload ->> 'taskId')::uuid
    and task.user_id = v_user_id
  for update;
  if not found then
    raise exception 'execution_task_not_found' using errcode = 'EX202';
  end if;
  if v_task.version <> (p_payload ->> 'expectedVersion')::bigint then
    raise exception 'execution_version_conflict' using errcode = 'EX209';
  end if;

  insert into public.user_task_events (
    task_id, user_id, event_type, task_version, actor_user_id,
    title, status, priority, occurred_at
  ) values (
    v_task.id, v_user_id, 'deleted', v_task.version, v_user_id,
    v_task.title, v_task.status, v_task.priority, v_now
  );

  delete from public.user_tasks where id = v_task.id;

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'replayed', false,
    'taskId', v_task.id,
    'taskVersion', v_task.version
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, event_version, payload, occurred_at
  ) values (
    'execution_task', v_task.id, v_task.version,
    'execution.task.deleted.v1', 1,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'execution.task.deleted.v1',
      'aggregateId', v_task.id,
      'aggregateVersion', v_task.version,
      'occurredAt', pg_catalog.to_char(
        v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    ),
    v_now
  );

  insert into public.execution_command_receipts (
    command, user_id, idempotency_key, response, input_hash,
    expected_version, resulting_version, created_at
  ) values (
    'delete_task', v_user_id, v_key, v_result, v_input_hash,
    v_task.version, v_task.version, v_now
  );

  return v_result;
end;
$function$;

alter function public.submit_delete_task(jsonb) owner to postgres;
revoke all on function public.submit_delete_task(jsonb) from public, anon;
grant execute on function public.submit_delete_task(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Watchlist and participation commands
-- ---------------------------------------------------------------------------

create or replace function public.submit_create_watchlist(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.execution_command_receipts%rowtype;
  v_watchlist_id uuid := extensions.gen_random_uuid();
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_list_count bigint;
begin
  if v_user_id is null then
    raise exception 'execution_session_required' using errcode = 'EX201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload, array['idempotencyKey', 'expectedVersion', 'name']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or p_payload ->> 'expectedVersion' <> '1'
    or pg_catalog.jsonb_typeof(p_payload -> 'name') <> 'string'
    or p_payload ->> 'name' <> pg_catalog.btrim(p_payload ->> 'name')
    or pg_catalog.char_length(p_payload ->> 'name') not between 1 and 80
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'create_watchlist', 'payload', p_payload)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':create_watchlist:' || v_key, 0)
  );

  select * into v_existing
  from public.execution_command_receipts as receipt
  where receipt.command = 'create_watchlist'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'execution_idempotency_conflict' using errcode = 'EX210';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select pg_catalog.count(*) into v_list_count
  from public.watchlists as list
  where list.user_id = v_user_id;
  if v_list_count >= 20 then
    raise exception 'execution_watchlist_limit_reached' using errcode = 'EX206';
  end if;

  perform 1
  from public.watchlists as list
  where list.user_id = v_user_id
    and list.name = p_payload ->> 'name';
  if found then
    raise exception 'execution_name_conflict' using errcode = 'EX208';
  end if;

  insert into public.watchlists (
    id, user_id, name, is_default, version, created_at, updated_at
  ) values (
    v_watchlist_id, v_user_id, p_payload ->> 'name', false, 1, v_now, v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'replayed', false,
    'watchlistId', v_watchlist_id,
    'watchlistVersion', 1
  );

  insert into public.execution_command_receipts (
    command, user_id, idempotency_key, response, input_hash,
    expected_version, resulting_version, created_at
  ) values (
    'create_watchlist', v_user_id, v_key, v_result, v_input_hash, 1, 1, v_now
  );

  return v_result;
end;
$function$;

alter function public.submit_create_watchlist(jsonb) owner to postgres;
revoke all on function public.submit_create_watchlist(jsonb) from public, anon;
grant execute on function public.submit_create_watchlist(jsonb) to authenticated;

create or replace function public.submit_rename_watchlist(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.execution_command_receipts%rowtype;
  v_list public.watchlists%rowtype;
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_next_version bigint;
begin
  if v_user_id is null then
    raise exception 'execution_session_required' using errcode = 'EX201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload, array['idempotencyKey', 'expectedVersion', 'watchlistId', 'name']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or not public.security_json_uuid_is_valid(p_payload, 'watchlistId')
    or pg_catalog.jsonb_typeof(p_payload -> 'name') <> 'string'
    or p_payload ->> 'name' <> pg_catalog.btrim(p_payload ->> 'name')
    or pg_catalog.char_length(p_payload ->> 'name') not between 1 and 80
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'rename_watchlist', 'payload', p_payload)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':rename_watchlist:' || v_key, 0)
  );

  select * into v_existing
  from public.execution_command_receipts as receipt
  where receipt.command = 'rename_watchlist'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'execution_idempotency_conflict' using errcode = 'EX210';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select * into v_list
  from public.watchlists as list
  where list.id = (p_payload ->> 'watchlistId')::uuid
    and list.user_id = v_user_id
  for update;
  if not found then
    raise exception 'execution_watchlist_not_found' using errcode = 'EX203';
  end if;
  if v_list.version <> (p_payload ->> 'expectedVersion')::bigint then
    raise exception 'execution_version_conflict' using errcode = 'EX209';
  end if;

  perform 1
  from public.watchlists as other
  where other.user_id = v_user_id
    and other.name = p_payload ->> 'name'
    and other.id <> v_list.id;
  if found then
    raise exception 'execution_name_conflict' using errcode = 'EX208';
  end if;

  v_next_version := v_list.version + 1;

  update public.watchlists
  set name = p_payload ->> 'name',
      version = v_next_version,
      updated_at = v_now
  where id = v_list.id;

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'replayed', false,
    'watchlistId', v_list.id,
    'watchlistVersion', v_next_version
  );

  insert into public.execution_command_receipts (
    command, user_id, idempotency_key, response, input_hash,
    expected_version, resulting_version, created_at
  ) values (
    'rename_watchlist', v_user_id, v_key, v_result, v_input_hash,
    v_list.version, v_next_version, v_now
  );

  return v_result;
end;
$function$;

alter function public.submit_rename_watchlist(jsonb) owner to postgres;
revoke all on function public.submit_rename_watchlist(jsonb) from public, anon;
grant execute on function public.submit_rename_watchlist(jsonb) to authenticated;

create or replace function public.submit_delete_watchlist(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.execution_command_receipts%rowtype;
  v_list public.watchlists%rowtype;
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'execution_session_required' using errcode = 'EX201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload, array['idempotencyKey', 'expectedVersion', 'watchlistId']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or not public.security_json_uuid_is_valid(p_payload, 'watchlistId')
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'delete_watchlist', 'payload', p_payload)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':delete_watchlist:' || v_key, 0)
  );

  select * into v_existing
  from public.execution_command_receipts as receipt
  where receipt.command = 'delete_watchlist'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'execution_idempotency_conflict' using errcode = 'EX210';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select * into v_list
  from public.watchlists as list
  where list.id = (p_payload ->> 'watchlistId')::uuid
    and list.user_id = v_user_id
  for update;
  if not found then
    raise exception 'execution_watchlist_not_found' using errcode = 'EX203';
  end if;
  if v_list.version <> (p_payload ->> 'expectedVersion')::bigint then
    raise exception 'execution_version_conflict' using errcode = 'EX209';
  end if;
  if v_list.is_default then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  delete from public.watchlist_projects where watchlist_id = v_list.id;
  delete from public.watchlists where id = v_list.id;

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'replayed', false,
    'watchlistId', v_list.id,
    'watchlistVersion', v_list.version
  );

  insert into public.execution_command_receipts (
    command, user_id, idempotency_key, response, input_hash,
    expected_version, resulting_version, created_at
  ) values (
    'delete_watchlist', v_user_id, v_key, v_result, v_input_hash,
    v_list.version, v_list.version, v_now
  );

  return v_result;
end;
$function$;

alter function public.submit_delete_watchlist(jsonb) owner to postgres;
revoke all on function public.submit_delete_watchlist(jsonb) from public, anon;
grant execute on function public.submit_delete_watchlist(jsonb) to authenticated;

create or replace function public.submit_add_watchlist_project(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.execution_command_receipts%rowtype;
  v_list public.watchlists%rowtype;
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_next_version bigint;
  v_project_count bigint;
begin
  if v_user_id is null then
    raise exception 'execution_session_required' using errcode = 'EX201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload, array['idempotencyKey', 'expectedVersion', 'watchlistId', 'projectId']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or not public.security_json_uuid_is_valid(p_payload, 'watchlistId')
    or not public.security_json_uuid_is_valid(p_payload, 'projectId')
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'add_watchlist_project', 'payload', p_payload)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':add_watchlist_project:' || v_key, 0)
  );

  select * into v_existing
  from public.execution_command_receipts as receipt
  where receipt.command = 'add_watchlist_project'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'execution_idempotency_conflict' using errcode = 'EX210';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select * into v_list
  from public.watchlists as list
  where list.id = (p_payload ->> 'watchlistId')::uuid
    and list.user_id = v_user_id
  for update;
  if not found then
    raise exception 'execution_watchlist_not_found' using errcode = 'EX203';
  end if;
  if v_list.version <> (p_payload ->> 'expectedVersion')::bigint then
    raise exception 'execution_version_conflict' using errcode = 'EX209';
  end if;

  perform 1
  from public.watchlist_projects as member
  where member.watchlist_id = v_list.id
    and member.project_id = (p_payload ->> 'projectId')::uuid;
  if found then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  perform 1
  from public.projects as project
  where project.id = (p_payload ->> 'projectId')::uuid;
  if not found then
    raise exception 'execution_project_not_found' using errcode = 'EX204';
  end if;

  select pg_catalog.count(*) into v_project_count
  from public.watchlist_projects as member
  where member.watchlist_id = v_list.id;
  if v_project_count >= 200 then
    raise exception 'execution_watchlist_project_limit_reached' using errcode = 'EX207';
  end if;

  insert into public.watchlist_projects (watchlist_id, project_id, added_at)
  values (v_list.id, (p_payload ->> 'projectId')::uuid, v_now);

  v_next_version := v_list.version + 1;
  update public.watchlists
  set version = v_next_version, updated_at = v_now
  where id = v_list.id;

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'replayed', false,
    'watchlistId', v_list.id,
    'watchlistVersion', v_next_version
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, event_version, payload, occurred_at
  ) values (
    'execution_watchlist', v_list.id, v_next_version,
    'execution.watchlist.project_added.v1', 1,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'execution.watchlist.project_added.v1',
      'aggregateId', v_list.id,
      'aggregateVersion', v_next_version,
      'occurredAt', pg_catalog.to_char(
        v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    ),
    v_now
  );

  insert into public.execution_command_receipts (
    command, user_id, idempotency_key, response, input_hash,
    expected_version, resulting_version, created_at
  ) values (
    'add_watchlist_project', v_user_id, v_key, v_result, v_input_hash,
    v_list.version, v_next_version, v_now
  );

  return v_result;
end;
$function$;

alter function public.submit_add_watchlist_project(jsonb) owner to postgres;
revoke all on function public.submit_add_watchlist_project(jsonb) from public, anon;
grant execute on function public.submit_add_watchlist_project(jsonb) to authenticated;

create or replace function public.submit_remove_watchlist_project(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.execution_command_receipts%rowtype;
  v_list public.watchlists%rowtype;
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_next_version bigint;
begin
  if v_user_id is null then
    raise exception 'execution_session_required' using errcode = 'EX201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload, array['idempotencyKey', 'expectedVersion', 'watchlistId', 'projectId']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or not public.security_json_uuid_is_valid(p_payload, 'watchlistId')
    or not public.security_json_uuid_is_valid(p_payload, 'projectId')
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'remove_watchlist_project', 'payload', p_payload)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':remove_watchlist_project:' || v_key, 0)
  );

  select * into v_existing
  from public.execution_command_receipts as receipt
  where receipt.command = 'remove_watchlist_project'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'execution_idempotency_conflict' using errcode = 'EX210';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select * into v_list
  from public.watchlists as list
  where list.id = (p_payload ->> 'watchlistId')::uuid
    and list.user_id = v_user_id
  for update;
  if not found then
    raise exception 'execution_watchlist_not_found' using errcode = 'EX203';
  end if;
  if v_list.version <> (p_payload ->> 'expectedVersion')::bigint then
    raise exception 'execution_version_conflict' using errcode = 'EX209';
  end if;

  perform 1
  from public.watchlist_projects as member
  where member.watchlist_id = v_list.id
    and member.project_id = (p_payload ->> 'projectId')::uuid;
  if not found then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  delete from public.watchlist_projects
  where watchlist_id = v_list.id
    and project_id = (p_payload ->> 'projectId')::uuid;

  v_next_version := v_list.version + 1;
  update public.watchlists
  set version = v_next_version, updated_at = v_now
  where id = v_list.id;

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'replayed', false,
    'watchlistId', v_list.id,
    'watchlistVersion', v_next_version
  );

  insert into public.execution_command_receipts (
    command, user_id, idempotency_key, response, input_hash,
    expected_version, resulting_version, created_at
  ) values (
    'remove_watchlist_project', v_user_id, v_key, v_result, v_input_hash,
    v_list.version, v_next_version, v_now
  );

  return v_result;
end;
$function$;

alter function public.submit_remove_watchlist_project(jsonb) owner to postgres;
revoke all on function public.submit_remove_watchlist_project(jsonb) from public, anon;
grant execute on function public.submit_remove_watchlist_project(jsonb) to authenticated;

create or replace function public.submit_set_participation_status(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.execution_command_receipts%rowtype;
  v_current public.user_projects%rowtype;
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_next_version bigint;
  v_next_notes text;
  v_next_started_at timestamptz;
  v_next_status public.participation_status;
begin
  if v_user_id is null then
    raise exception 'execution_session_required' using errcode = 'EX201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload,
      array['idempotencyKey', 'expectedVersion', 'projectId', 'participationStatus', 'notes']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or not public.security_json_uuid_is_valid(p_payload, 'projectId')
    or pg_catalog.jsonb_typeof(p_payload -> 'participationStatus') <> 'string'
    or not (
      pg_catalog.jsonb_typeof(p_payload -> 'notes') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_payload -> 'notes') = 'string'
        and p_payload ->> 'notes' = pg_catalog.btrim(p_payload ->> 'notes')
        and pg_catalog.char_length(p_payload ->> 'notes') <= 4000
      )
    )
  then
    raise exception 'execution_command_invalid' using errcode = 'EX211';
  end if;

  v_next_status := (p_payload ->> 'participationStatus')::public.participation_status;
  v_next_notes := case
    when pg_catalog.jsonb_typeof(p_payload -> 'notes') = 'null' then null
    else p_payload ->> 'notes'
  end;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'set_participation_status', 'payload', p_payload)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':set_participation_status:' || v_key, 0)
  );

  select * into v_existing
  from public.execution_command_receipts as receipt
  where receipt.command = 'set_participation_status'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'execution_idempotency_conflict' using errcode = 'EX210';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  perform 1
  from public.projects as project
  where project.id = (p_payload ->> 'projectId')::uuid;
  if not found then
    raise exception 'execution_project_not_found' using errcode = 'EX204';
  end if;

  select * into v_current
  from public.user_projects as participation
  where participation.user_id = v_user_id
    and participation.project_id = (p_payload ->> 'projectId')::uuid
  for update;

  if found then
    if v_current.version <> (p_payload ->> 'expectedVersion')::bigint then
      raise exception 'execution_version_conflict' using errcode = 'EX209';
    end if;
    v_next_version := v_current.version + 1;
    v_next_started_at := case
      when v_current.started_at is null
        and v_next_status in ('participating', 'completed')
        then v_now
      else v_current.started_at
    end;
    update public.user_projects
    set participation_status = v_next_status,
        notes = v_next_notes,
        started_at = v_next_started_at,
        version = v_next_version,
        updated_at = v_now
    where user_id = v_user_id
      and project_id = (p_payload ->> 'projectId')::uuid;
  else
    if (p_payload ->> 'expectedVersion')::bigint <> 1 then
      raise exception 'execution_version_conflict' using errcode = 'EX209';
    end if;
    v_next_version := 1;
    v_next_started_at := case
      when v_next_status in ('participating', 'completed') then v_now
      else null
    end;
    insert into public.user_projects (
      user_id, project_id, participation_status, notes, started_at,
      version, updated_at
    ) values (
      v_user_id, (p_payload ->> 'projectId')::uuid, v_next_status, v_next_notes,
      v_next_started_at, 1, v_now
    );
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'replayed', false,
    'projectId', p_payload ->> 'projectId'
  );

  insert into public.execution_command_receipts (
    command, user_id, idempotency_key, response, input_hash,
    expected_version, resulting_version, created_at
  ) values (
    'set_participation_status', v_user_id, v_key, v_result, v_input_hash,
    (p_payload ->> 'expectedVersion')::bigint, v_next_version, v_now
  );

  return v_result;
end;
$function$;

alter function public.submit_set_participation_status(jsonb) owner to postgres;
revoke all on function public.submit_set_participation_status(jsonb) from public, anon;
grant execute on function public.submit_set_participation_status(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Exact private read surfaces
-- ---------------------------------------------------------------------------

create function public.list_my_execution_tasks()
returns setof public.user_tasks
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select task.*
  from public.user_tasks as task
  where task.user_id = auth.uid()
  order by task.created_at desc, task.id desc
$function$;

alter function public.list_my_execution_tasks() owner to postgres;
revoke all on function public.list_my_execution_tasks() from public, anon;
grant execute on function public.list_my_execution_tasks() to authenticated;

create function public.list_my_watchlists()
returns table (
  watchlist_id uuid,
  name text,
  is_default boolean,
  project_count bigint,
  version bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select list.id,
         list.name,
         list.is_default,
         pg_catalog.count(member.project_id),
         list.version,
         list.created_at,
         list.updated_at
  from public.watchlists as list
  left join public.watchlist_projects as member
    on member.watchlist_id = list.id
  where list.user_id = auth.uid()
  group by list.id
  order by list.is_default desc, list.created_at asc, list.id asc
$function$;

alter function public.list_my_watchlists() owner to postgres;
revoke all on function public.list_my_watchlists() from public, anon;
grant execute on function public.list_my_watchlists() to authenticated;

create function public.list_my_watchlist_projects(p_watchlist_id uuid)
returns setof public.watchlist_projects
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select member.*
  from public.watchlist_projects as member
  where member.watchlist_id = p_watchlist_id
    and exists (
      select 1 from public.watchlists as list
      where list.id = member.watchlist_id
        and list.user_id = auth.uid()
    )
  order by member.added_at desc, member.project_id desc
$function$;

alter function public.list_my_watchlist_projects(uuid) owner to postgres;
revoke all on function public.list_my_watchlist_projects(uuid) from public, anon;
grant execute on function public.list_my_watchlist_projects(uuid) to authenticated;

create function public.get_my_participation(p_project_id uuid)
returns public.user_projects
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select participation.*
  from public.user_projects as participation
  where participation.user_id = auth.uid()
    and participation.project_id = p_project_id
$function$;

alter function public.get_my_participation(uuid) owner to postgres;
revoke all on function public.get_my_participation(uuid) from public, anon;
grant execute on function public.get_my_participation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Default watchlist bootstrap (decision D3)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_execution_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  insert into public.watchlists (user_id, name, is_default, version)
  values (new.id, '默认关注', true, 1)
  on conflict (user_id, name) do nothing;
  return new;
end;
$function$;

alter function public.handle_new_execution_user() owner to postgres;
revoke all on function public.handle_new_execution_user() from public;

drop trigger if exists execution_default_watchlist_bootstrap on public.profiles;
create trigger execution_default_watchlist_bootstrap
after insert on public.profiles
for each row execute function public.handle_new_execution_user();

-- Existing profiles created before this migration get their default list too,
-- so the project detail page's follow action always has a target.
insert into public.watchlists (user_id, name, is_default, version)
select profile.id, '默认关注', true, 1
from public.profiles as profile
where not exists (
  select 1 from public.watchlists as list
  where list.user_id = profile.id and list.is_default
)
on conflict (user_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Extend the shared outbox without re-stating or weakening old branches
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_previous_event_type_expression text;
  v_previous_payload_expression text;
  v_execution_event_type_expression text := $constraint$
    event_type in (
      'execution.task.created.v1',
      'execution.task.updated.v1',
      'execution.task.deleted.v1',
      'execution.watchlist.project_added.v1'
    )
  $constraint$;
  v_execution_payload_expression text := $constraint$
    event_type in (
      'execution.task.created.v1',
      'execution.task.updated.v1',
      'execution.task.deleted.v1',
      'execution.watchlist.project_added.v1'
    )
    and payload ?& array[
      'version', 'eventType', 'aggregateId', 'aggregateVersion', 'occurredAt'
    ]
    and payload - array[
      'version', 'eventType', 'aggregateId', 'aggregateVersion', 'occurredAt'
    ]::text[] = '{}'::jsonb
    and pg_catalog.jsonb_typeof(payload -> 'version') = 'number'
    and payload ->> 'version' = '1'
    and pg_catalog.jsonb_typeof(payload -> 'eventType') = 'string'
    and payload ->> 'eventType' = event_type
    and pg_catalog.jsonb_typeof(payload -> 'aggregateId') = 'string'
    and payload ->> 'aggregateId' ~
      '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
    and pg_catalog.jsonb_typeof(payload -> 'aggregateVersion') = 'number'
    and payload ->> 'aggregateVersion' ~ '^[1-9][0-9]*$'
    and pg_catalog.jsonb_typeof(payload -> 'occurredAt') = 'string'
    and payload ->> 'occurredAt' ~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  $constraint$;
begin
  select pg_catalog.pg_get_expr(conbin, conrelid)
  into v_previous_event_type_expression
  from pg_catalog.pg_constraint
  where conname = 'outbox_events_event_type_valid'
    and conrelid = 'public.outbox_events'::regclass;

  if v_previous_event_type_expression is null then
    raise exception 'outbox_events_event_type_valid constraint missing';
  end if;

  execute pg_catalog.format(
    'alter table public.outbox_events drop constraint outbox_events_event_type_valid'
  );
  execute pg_catalog.format(
    'alter table public.outbox_events add constraint outbox_events_event_type_valid check (%s or %s)',
    v_previous_event_type_expression,
    v_execution_event_type_expression
  );

  select pg_catalog.pg_get_expr(conbin, conrelid)
  into v_previous_payload_expression
  from pg_catalog.pg_constraint
  where conname = 'outbox_events_payload_valid'
    and conrelid = 'public.outbox_events'::regclass;

  if v_previous_payload_expression is null then
    raise exception 'outbox_events_payload_valid constraint missing';
  end if;

  execute pg_catalog.format(
    'alter table public.outbox_events drop constraint outbox_events_payload_valid'
  );
  execute pg_catalog.format(
    'alter table public.outbox_events add constraint outbox_events_payload_valid check (%s or %s)',
    v_previous_payload_expression,
    v_execution_payload_expression
  );
end;
$migration$;
