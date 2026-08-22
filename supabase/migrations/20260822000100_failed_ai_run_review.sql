-- Append-only failed AI run review boundary for Phase 6B.

create table public.ai_run_review_decisions (
  id uuid primary key,
  ai_run_id uuid not null
    constraint ai_run_review_decisions_ai_run_id_fkey
    references public.ai_runs (id) on delete restrict,
  review_version bigint not null,
  reviewer_user_id uuid not null
    constraint ai_run_review_decisions_reviewer_user_id_fkey
    references public.profiles (id) on delete restrict,
  decision text not null,
  reason_code text not null,
  note text null,
  created_at timestamptz not null,
  constraint ai_run_review_decisions_run_version_key unique (ai_run_id, review_version),
  constraint ai_run_review_decisions_version_positive check (review_version > 0),
  constraint ai_run_review_decisions_note_valid check (
    note is null
    or (
      note = pg_catalog.btrim(note)
      and pg_catalog.char_length(note) between 1 and 1000
    )
  ),
  constraint ai_run_review_decisions_shape check (
    (decision = 'needs_investigation' and reason_code in (
      'provider_instability', 'schema_regression', 'grounding_regression',
      'source_data_problem', 'suspected_prompt_injection', 'other'
    ))
    or (decision = 'dismiss' and reason_code in (
      'transient_failure', 'duplicate_or_superseded', 'expected_invalid_input',
      'no_action_needed', 'other'
    ))
  )
);

create index ai_run_review_decisions_run_latest_idx
on public.ai_run_review_decisions (ai_run_id, review_version desc);

create index ai_run_review_decisions_reviewer_created_idx
on public.ai_run_review_decisions (reviewer_user_id, created_at desc, id desc);

create table public.ai_run_review_commands (
  id uuid primary key,
  reviewer_user_id uuid not null
    constraint ai_run_review_commands_reviewer_user_id_fkey
    references public.profiles (id) on delete restrict,
  ai_run_id uuid not null
    constraint ai_run_review_commands_ai_run_id_fkey
    references public.ai_runs (id) on delete restrict,
  idempotency_key text not null,
  expected_review_version bigint not null,
  decision text not null,
  reason_code text not null,
  note text null,
  resulting_review_version bigint not null,
  decision_id uuid not null
    constraint ai_run_review_commands_decision_id_fkey
    references public.ai_run_review_decisions (id) on delete restrict,
  created_at timestamptz not null,
  constraint ai_run_review_commands_reviewer_key unique (reviewer_user_id, idempotency_key),
  constraint ai_run_review_commands_idempotency_key_valid check (
    idempotency_key = pg_catalog.btrim(idempotency_key)
    and pg_catalog.char_length(idempotency_key) between 1 and 255
  ),
  constraint ai_run_review_commands_expected_version_valid check (
    expected_review_version >= 0
  ),
  constraint ai_run_review_commands_resulting_version_valid check (
    resulting_review_version > 0
  ),
  constraint ai_run_review_commands_shape check (
    resulting_review_version = expected_review_version + 1
    and (
      note is null
      or (
        note = pg_catalog.btrim(note)
        and pg_catalog.char_length(note) between 1 and 1000
      )
    )
    and (
      (decision = 'needs_investigation' and reason_code in (
        'provider_instability', 'schema_regression', 'grounding_regression',
        'source_data_problem', 'suspected_prompt_injection', 'other'
      ))
      or (decision = 'dismiss' and reason_code in (
        'transient_failure', 'duplicate_or_superseded', 'expected_invalid_input',
        'no_action_needed', 'other'
      ))
    )
  )
);

create index ai_run_review_commands_run_created_idx
on public.ai_run_review_commands (ai_run_id, created_at desc, id desc);

alter table public.ai_run_review_decisions enable row level security;
alter table public.ai_run_review_commands enable row level security;

revoke all on table public.ai_run_review_decisions
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on table public.ai_run_review_commands
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;

create function public.reject_failed_ai_run_review_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'failed_ai_run_review_history_append_only' using errcode = '55000';
end;
$$;

alter function public.reject_failed_ai_run_review_history_mutation() owner to postgres;

create trigger ai_run_review_decisions_reject_mutation
before update or delete on public.ai_run_review_decisions
for each row execute function public.reject_failed_ai_run_review_history_mutation();

create trigger ai_run_review_commands_reject_mutation
before update or delete on public.ai_run_review_commands
for each row execute function public.reject_failed_ai_run_review_history_mutation();

create trigger ai_runs_append_only
before update or delete on public.ai_runs
for each row execute function public.reject_ai_history_mutation();

-- Extend the existing transactional outbox without weakening its prior event contracts.
alter table public.outbox_events
  drop constraint outbox_events_event_type_valid,
  add constraint outbox_events_event_type_valid check (
    event_type in (
      'intelligence.signal.promoted.v1',
      'intelligence.candidate.reviewed.v1',
      'intelligence.ai_run.reviewed.v1'
    )
  );

alter table public.outbox_events
  drop constraint outbox_events_payload_valid,
  add constraint outbox_events_payload_valid check (
    pg_catalog.jsonb_typeof(payload) = 'object'
    and (payload ->> 'version') = '1'
    and (
      (
        event_type in (
          'intelligence.signal.promoted.v1',
          'intelligence.candidate.reviewed.v1'
        )
        and payload ->> 'eventType' = event_type
      )
      or (
        event_type = 'intelligence.ai_run.reviewed.v1'
        and payload ?& array[
          'version', 'runId', 'reviewVersion', 'decisionId',
          'decision', 'reasonCode', 'occurredAt'
        ]
        and payload
          - 'version' - 'runId' - 'reviewVersion' - 'decisionId'
          - 'decision' - 'reasonCode' - 'occurredAt' = '{}'::jsonb
        and pg_catalog.jsonb_typeof(payload -> 'version') = 'number'
        and pg_catalog.jsonb_typeof(payload -> 'runId') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'reviewVersion') = 'number'
        and pg_catalog.jsonb_typeof(payload -> 'decisionId') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'decision') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'reasonCode') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'occurredAt') = 'string'
      )
    )
  );

create function public.list_failed_ai_runs(
  p_review_state text,
  p_status text,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns table (
  version integer,
  "runId" uuid,
  status text,
  "safeFailureCode" text,
  stage text,
  "inputKind" text,
  "modelId" text,
  "promptVersion" text,
  "schemaVersion" text,
  "pipelineVersion" text,
  project jsonb,
  source jsonb,
  "createdAt" timestamptz,
  "reviewState" text,
  "reviewVersion" bigint,
  "latestDecisionAt" timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  requested_reviewer_id uuid;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null then
    raise exception 'reviewer_required' using errcode = 'AR104';
  end if;

  if not exists (
    select 1
    from public.user_roles as role_grant
    where role_grant.user_id = requested_reviewer_id
      and role_grant.role in ('reviewer', 'senior_reviewer', 'security_reviewer', 'admin')
      and role_grant.revoked_at is null
  ) then
    raise exception 'reviewer_required' using errcode = 'AR104';
  end if;

  if p_review_state is null
    or p_review_state not in ('all', 'unreviewed', 'needs_investigation', 'dismissed')
    or p_status is null
    or p_status not in (
      'all', 'provider_error', 'schema_invalid_after_repair', 'grounding_failed'
    )
    or (p_cursor_created_at is null) <> (p_cursor_id is null)
    or p_limit is null
    or p_limit not between 1 and 101
  then
    raise exception 'invalid_review_command' using errcode = 'AR105';
  end if;

  return query
  select
    1,
    run_record.id,
    run_record.status,
    run_record.status,
    run_record.stage,
    run_record.input_kind,
    run_record.model_id,
    run_record.prompt_version,
    run_record.schema_version,
    run_record.pipeline_version,
    case
      when project_record.id is null then null
      else pg_catalog.jsonb_build_object(
        'id', project_record.id,
        'slug', project_record.slug,
        'name', project_record.name
      )
    end,
    case
      when source_record.id is null then null
      else pg_catalog.jsonb_build_object(
        'id', source_record.id,
        'name', source_record.name,
        'sourceType', source_record.source_type::text
      )
    end,
    run_record.created_at,
    review_projection.review_state,
    pg_catalog.coalesce(latest_decision.review_version, 0::bigint),
    latest_decision.created_at
  from public.ai_runs as run_record
  left join public.raw_items as raw_input
    on run_record.input_kind = 'raw_item'
    and raw_input.id = run_record.input_id
  left join public.discovered_items as discovered_input
    on run_record.input_kind = 'discovered_item'
    and discovered_input.id = run_record.input_id
  left join public.projects as project_record
    on project_record.id = pg_catalog.coalesce(raw_input.project_id, discovered_input.project_id)
  left join public.sources as source_record
    on source_record.id = pg_catalog.coalesce(raw_input.source_id, discovered_input.source_id)
  left join lateral (
    select decision_record.review_version, decision_record.decision,
      decision_record.created_at
    from public.ai_run_review_decisions as decision_record
    where decision_record.ai_run_id = run_record.id
    order by decision_record.review_version desc
    limit 1
  ) as latest_decision on true
  cross join lateral (
    select case
      when latest_decision.review_version is null then 'unreviewed'::text
      when latest_decision.decision = 'needs_investigation' then 'needs_investigation'::text
      else 'dismissed'::text
    end as review_state
  ) as review_projection
  where run_record.status in (
      'provider_error', 'schema_invalid_after_repair', 'grounding_failed'
    )
    and (p_status = 'all' or run_record.status = p_status)
    and (p_review_state = 'all' or review_projection.review_state = p_review_state)
    and (
      p_cursor_created_at is null
      or run_record.created_at < p_cursor_created_at
      or (
        run_record.created_at = p_cursor_created_at
        and run_record.id < p_cursor_id
      )
    )
  order by run_record.created_at desc, run_record.id desc
  limit p_limit;
end;
$$;

alter function public.list_failed_ai_runs(text, text, timestamptz, uuid, integer)
owner to postgres;

create function public.get_failed_ai_run(p_ai_run_id uuid)
returns table (
  version integer,
  run jsonb,
  input jsonb,
  decisions jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  requested_reviewer_id uuid;
  run_record public.ai_runs%rowtype;
  project_projection jsonb;
  source_projection jsonb;
  collected_at_projection timestamptz;
  latest_decision_record public.ai_run_review_decisions%rowtype;
  run_projection jsonb;
  input_projection jsonb;
  decision_history jsonb;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null then
    raise exception 'reviewer_required' using errcode = 'AR104';
  end if;

  if not exists (
    select 1
    from public.user_roles as role_grant
    where role_grant.user_id = requested_reviewer_id
      and role_grant.role in ('reviewer', 'senior_reviewer', 'security_reviewer', 'admin')
      and role_grant.revoked_at is null
  ) then
    raise exception 'reviewer_required' using errcode = 'AR104';
  end if;

  if p_ai_run_id is null then
    raise exception 'review_run_not_found' using errcode = 'AR103';
  end if;

  begin
    select *
    into strict run_record
    from public.ai_runs as selected_run
    where selected_run.id = p_ai_run_id
      and selected_run.status in (
        'provider_error', 'schema_invalid_after_repair', 'grounding_failed'
      );
  exception
    when no_data_found then
      raise exception 'review_run_not_found' using errcode = 'AR103';
  end;

  select
    case
      when project_record.id is null then null
      else pg_catalog.jsonb_build_object(
        'id', project_record.id,
        'slug', project_record.slug,
        'name', project_record.name
      )
    end,
    case
      when source_record.id is null then null
      else pg_catalog.jsonb_build_object(
        'id', source_record.id,
        'name', source_record.name,
        'sourceType', source_record.source_type::text
      )
    end,
    case when run_record.input_kind = 'raw_item' then raw_input.collected_at else null end
  into project_projection, source_projection, collected_at_projection
  from (select 1) as singleton
  left join public.raw_items as raw_input
    on run_record.input_kind = 'raw_item'
    and raw_input.id = run_record.input_id
  left join public.discovered_items as discovered_input
    on run_record.input_kind = 'discovered_item'
    and discovered_input.id = run_record.input_id
  left join public.projects as project_record
    on project_record.id = pg_catalog.coalesce(raw_input.project_id, discovered_input.project_id)
  left join public.sources as source_record
    on source_record.id = pg_catalog.coalesce(raw_input.source_id, discovered_input.source_id);

  select *
  into latest_decision_record
  from public.ai_run_review_decisions as decision_record
  where decision_record.ai_run_id = run_record.id
  order by decision_record.review_version desc
  limit 1;

  run_projection := pg_catalog.jsonb_build_object(
    'version', 1,
    'runId', run_record.id,
    'status', run_record.status,
    'safeFailureCode', run_record.status,
    'stage', run_record.stage,
    'inputKind', run_record.input_kind,
    'modelId', run_record.model_id,
    'promptVersion', run_record.prompt_version,
    'schemaVersion', run_record.schema_version,
    'pipelineVersion', run_record.pipeline_version,
    'project', project_projection,
    'source', source_projection,
    'createdAt', run_record.created_at,
    'reviewState', case
      when latest_decision_record.review_version is null then 'unreviewed'
      when latest_decision_record.decision = 'needs_investigation' then 'needs_investigation'
      else 'dismissed'
    end,
    'reviewVersion', pg_catalog.coalesce(latest_decision_record.review_version, 0::bigint),
    'latestDecisionAt', latest_decision_record.created_at
  );

  input_projection := pg_catalog.jsonb_build_object(
    'kind', run_record.input_kind,
    'id', run_record.input_id,
    'collectedAt', collected_at_projection
  );

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'version', 1,
        'decisionId', decision_record.id,
        'reviewVersion', decision_record.review_version,
        'decision', decision_record.decision,
        'reasonCode', decision_record.reason_code,
        'note', decision_record.note,
        'reviewerUserId', decision_record.reviewer_user_id,
        'createdAt', decision_record.created_at
      ) order by decision_record.review_version asc
    ),
    '[]'::jsonb
  )
  into decision_history
  from public.ai_run_review_decisions as decision_record
  where decision_record.ai_run_id = run_record.id;

  return query select 1, run_projection, input_projection, decision_history;
end;
$$;

alter function public.get_failed_ai_run(uuid) owner to postgres;

create function public.execute_failed_ai_run_review(
  p_ai_run_id uuid,
  p_command_payload jsonb,
  p_idempotency_key text,
  p_now timestamptz
)
returns table (
  version integer,
  "commandId" uuid,
  "runId" uuid,
  "decisionId" uuid,
  "reviewVersion" bigint,
  "reviewState" text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  requested_reviewer_id uuid;
  requested_expected_version bigint;
  requested_decision text;
  requested_reason_code text;
  requested_note text;
  receipt_record public.ai_run_review_commands%rowtype;
  run_record public.ai_runs%rowtype;
  current_review_version bigint;
  next_review_version bigint;
  new_decision_id uuid;
  new_command_id uuid;
  resulting_review_state text;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null then
    raise exception 'reviewer_required' using errcode = 'AR104';
  end if;

  if not exists (
    select 1
    from public.user_roles as role_grant
    where role_grant.user_id = requested_reviewer_id
      and role_grant.role in ('reviewer', 'senior_reviewer', 'security_reviewer', 'admin')
      and role_grant.revoked_at is null
  ) then
    raise exception 'reviewer_required' using errcode = 'AR104';
  end if;

  if p_ai_run_id is null
    or p_command_payload is null
    or pg_catalog.jsonb_typeof(p_command_payload) <> 'object'
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or p_now is null
    or not pg_catalog.isfinite(p_now)
  then
    raise exception 'invalid_review_command' using errcode = 'AR105';
  end if;

  if (
    select pg_catalog.coalesce(
      pg_catalog.array_agg(payload_key order by payload_key collate "C"),
      '{}'::text[]
    )
    from pg_catalog.jsonb_object_keys(p_command_payload) as keys(payload_key)
  ) <> array['decision', 'expectedReviewVersion', 'note', 'reasonCode', 'version']::text[]
  then
    raise exception 'invalid_review_command' using errcode = 'AR105';
  end if;

  if pg_catalog.jsonb_typeof(p_command_payload -> 'version') <> 'number'
    or p_command_payload -> 'version' <> '1'::jsonb
    or pg_catalog.jsonb_typeof(p_command_payload -> 'expectedReviewVersion') <> 'number'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'decision') <> 'string'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'reasonCode') <> 'string'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'note') not in ('null', 'string')
  then
    raise exception 'invalid_review_command' using errcode = 'AR105';
  end if;

  if p_command_payload ->> 'expectedReviewVersion' !~ '^(0|[1-9][0-9]*)$' then
    raise exception 'invalid_review_command' using errcode = 'AR105';
  end if;

  if (p_command_payload ->> 'expectedReviewVersion')::numeric
    > 9223372036854775807::numeric
  then
    raise exception 'invalid_review_command' using errcode = 'AR105';
  end if;

  requested_expected_version := (p_command_payload ->> 'expectedReviewVersion')::bigint;
  requested_decision := p_command_payload ->> 'decision';
  requested_reason_code := p_command_payload ->> 'reasonCode';
  requested_note := case
    when pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'null' then null
    else p_command_payload ->> 'note'
  end;

  if (
      requested_note is not null
      and (
        requested_note <> pg_catalog.btrim(requested_note)
        or pg_catalog.char_length(requested_note) not between 1 and 1000
      )
    )
    or not (
      (requested_decision = 'needs_investigation' and requested_reason_code in (
        'provider_instability', 'schema_regression', 'grounding_regression',
        'source_data_problem', 'suspected_prompt_injection', 'other'
      ))
      or (requested_decision = 'dismiss' and requested_reason_code in (
        'transient_failure', 'duplicate_or_superseded', 'expected_invalid_input',
        'no_action_needed', 'other'
      ))
    )
  then
    raise exception 'invalid_review_command' using errcode = 'AR105';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      requested_reviewer_id::text || ':' ||
      pg_catalog.char_length(p_idempotency_key)::text || ':' || p_idempotency_key,
      0
    )
  );

  select *
  into receipt_record
  from public.ai_run_review_commands as receipt
  where receipt.reviewer_user_id = requested_reviewer_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if receipt_record.ai_run_id is distinct from p_ai_run_id
      or receipt_record.expected_review_version is distinct from requested_expected_version
      or receipt_record.decision is distinct from requested_decision
      or receipt_record.reason_code is distinct from requested_reason_code
      or receipt_record.note is distinct from requested_note
    then
      raise exception 'review_idempotency_conflict' using errcode = 'AR102';
    end if;

    return query select
      1,
      receipt_record.id,
      receipt_record.ai_run_id,
      receipt_record.decision_id,
      receipt_record.resulting_review_version,
      case
        when receipt_record.decision = 'needs_investigation' then 'needs_investigation'::text
        else 'dismissed'::text
      end,
      true;
    return;
  end if;

  begin
    select *
    into strict run_record
    from public.ai_runs as selected_run
    where selected_run.id = p_ai_run_id
      and selected_run.status in (
        'provider_error', 'schema_invalid_after_repair', 'grounding_failed'
      )
    for update;
  exception
    when no_data_found then
      raise exception 'review_run_not_found' using errcode = 'AR103';
  end;

  select pg_catalog.coalesce(pg_catalog.max(decision_record.review_version), 0::bigint)
  into current_review_version
  from public.ai_run_review_decisions as decision_record
  where decision_record.ai_run_id = run_record.id;

  if current_review_version <> requested_expected_version then
    raise exception 'review_version_conflict' using errcode = 'AR101';
  end if;

  next_review_version := current_review_version + 1;
  new_decision_id := extensions.gen_random_uuid();
  new_command_id := extensions.gen_random_uuid();
  resulting_review_state := case
    when requested_decision = 'needs_investigation' then 'needs_investigation'
    else 'dismissed'
  end;

  insert into public.ai_run_review_decisions (
    id, ai_run_id, review_version, reviewer_user_id, decision,
    reason_code, note, created_at
  ) values (
    new_decision_id, run_record.id, next_review_version, requested_reviewer_id,
    requested_decision, requested_reason_code, requested_note, p_now
  );

  insert into public.ai_run_review_commands (
    id, reviewer_user_id, ai_run_id, idempotency_key, expected_review_version,
    decision, reason_code, note, resulting_review_version, decision_id, created_at
  ) values (
    new_command_id, requested_reviewer_id, run_record.id, p_idempotency_key,
    requested_expected_version, requested_decision, requested_reason_code,
    requested_note, next_review_version, new_decision_id, p_now
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version, event_type, event_version,
    payload, occurred_at
  ) values (
    'ai_run', run_record.id, next_review_version,
    'intelligence.ai_run.reviewed.v1', 1,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'runId', run_record.id,
      'reviewVersion', next_review_version,
      'decisionId', new_decision_id,
      'decision', requested_decision,
      'reasonCode', requested_reason_code,
      'occurredAt', p_now
    ),
    p_now
  );

  return query select
    1,
    new_command_id,
    run_record.id,
    new_decision_id,
    next_review_version,
    resulting_review_state,
    false;
end;
$$;

alter function public.execute_failed_ai_run_review(uuid, jsonb, text, timestamptz)
owner to postgres;

revoke all on function public.reject_failed_ai_run_review_history_mutation()
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.list_failed_ai_runs(text, text, timestamptz, uuid, integer)
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.get_failed_ai_run(uuid)
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.execute_failed_ai_run_review(uuid, jsonb, text, timestamptz)
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;

grant execute on function public.list_failed_ai_runs(text, text, timestamptz, uuid, integer)
to authenticated;
grant execute on function public.get_failed_ai_run(uuid)
to authenticated;
grant execute on function public.execute_failed_ai_run_review(uuid, jsonb, text, timestamptz)
to authenticated;
