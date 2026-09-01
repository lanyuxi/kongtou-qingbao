create or replace function public.flag_references_for_new_indicator()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_reference_id uuid;
  v_reference_version bigint;
  v_occurred_at_text text;
begin
  v_occurred_at_text := pg_catalog.to_char(
    pg_catalog.transaction_timestamp() at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  for v_reference_id in
    select reference_row.id
    from public.match_references_for_indicator(new.indicator_type, new.value_text) as matched
    join public.project_references as reference_row
      on reference_row.id = matched.reference_id
    order by reference_row.id::text asc
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      public.security_target_lock_key_v1('reference', v_reference_id)
    );

    select reference_row.version into v_reference_version
    from public.project_references as reference_row
    where reference_row.id = v_reference_id;

    if not found then
      continue;
    end if;

    insert into public.reference_security_flags (reference_id, indicator_id)
    values (v_reference_id, new.id)
    on conflict (reference_id, indicator_id) do nothing;

    -- Only the flag that this indicator actually created is published.
    if found then
      insert into public.outbox_events (
        aggregate_type, aggregate_id, aggregate_version,
        event_type, payload, occurred_at, created_at
      ) values (
        'reference', v_reference_id, v_reference_version,
        'reference.security_flagged.v1',
        pg_catalog.jsonb_build_object(
          'version', 1,
          'eventType', 'reference.security_flagged.v1',
          'aggregateId', v_reference_id,
          'aggregateVersion', v_reference_version,
          'indicatorId', new.id,
          'occurredAt', v_occurred_at_text
        ),
        pg_catalog.transaction_timestamp(),
        pg_catalog.transaction_timestamp()
      );
    end if;
  end loop;

  return null;
end;
$function$;

alter function public.flag_references_for_new_indicator() owner to postgres;

create or replace function public.submit_decide_domain_authority(
  p_authority_id uuid,
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "authorityId" uuid,
  "authorityVersion" bigint,
  state text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
  v_input_hash text;
  v_decision text;
  v_reason text;
  v_evidence_id uuid;
  v_evidence_source_id uuid;
  v_note text;
  v_expected_version bigint;
  v_current_version bigint;
  v_current_state text;
  v_next_state text;
  v_command_id uuid;
  v_decision_id uuid;
  v_now timestamptz;
  v_occurred_at_text text;
  v_existing record;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'reference_reviewer_required' using errcode = 'AR204';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'authorityId', 'expectedVersion', 'decision', 'reasonCode', 'evidenceId', 'note']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'authorityId')
    or p_command_payload ->> 'authorityId' <> p_authority_id::text
    or not public.security_json_positive_bigint_is_valid(p_command_payload, 'expectedVersion')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'decision') <> 'string'
    or p_command_payload ->> 'decision' not in ('grant', 'revoke', 'regrant')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'reasonCode') <> 'string'
    or p_command_payload ->> 'reasonCode' not in (
      'evidence_verified',
      'official_announcement',
      'corroborated_source',
      'ownership_unproven',
      'domain_mismatch',
      'duplicate_reference',
      'source_no_longer_official',
      'security_flag_cleared',
      'withdrawn_by_reviewer',
      'insufficient_context'
    )
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'evidenceId') = 'null'
      or public.security_json_uuid_is_valid(p_command_payload, 'evidenceId')
    )
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'string'
        and p_command_payload ->> 'note' = pg_catalog.btrim(p_command_payload ->> 'note')
        and pg_catalog.char_length(p_command_payload ->> 'note') between 1 and 1000
      )
    )
  then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;

  v_decision := p_command_payload ->> 'decision';
  v_reason := p_command_payload ->> 'reasonCode';
  v_evidence_id := (p_command_payload ->> 'evidenceId')::uuid;
  v_note := p_command_payload ->> 'note';
  v_expected_version := (p_command_payload ->> 'expectedVersion')::bigint;
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'decide_domain_authority', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();
  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  if v_decision in ('grant', 'regrant') and v_evidence_id is null then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  select * into v_existing
  from public.reference_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'decide_domain_authority'
      or v_existing.aggregate_id <> p_authority_id
      or v_existing.input_hash <> v_input_hash
    then
      raise exception 'reference_idempotency_conflict' using errcode = 'AR207';
    end if;
    return query select
      1,
      v_existing.id,
      v_existing.aggregate_id,
      v_existing.resulting_version,
      v_existing.result_payload ->> 'state',
      true;
    return;
  end if;

  if v_evidence_id is not null then
    select source_row.id into v_evidence_source_id
    from public.evidence as evidence_row
    join public.raw_items as raw_item_row
      on raw_item_row.id = evidence_row.raw_item_id
      and raw_item_row.source_id = evidence_row.source_id
    join public.sources as source_row
      on source_row.id = evidence_row.source_id
    where evidence_row.id = v_evidence_id;
  end if;

  if v_evidence_id is not null and v_evidence_source_id is null then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  if v_evidence_source_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      public.security_target_lock_key_v1('source', v_evidence_source_id)
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.security_target_lock_key_v1('domain_authority', p_authority_id)
  );

  select authority.version into v_current_version
  from public.project_domain_authorities as authority
  where authority.id = p_authority_id
  for update;

  if not found then
    raise exception 'domain_authority_not_found' using errcode = 'AR203';
  end if;

  if v_current_version <> v_expected_version then
    raise exception 'reference_version_conflict' using errcode = 'AR206';
  end if;

  if v_evidence_id is not null
    and not public.reference_evidence_is_usable(v_evidence_id)
  then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  v_current_state := public.domain_authority_current_state_v1(p_authority_id);

  v_next_state := case
    when v_decision = 'grant' then 'granted'
    when v_decision = 'revoke' then 'revoked'
    when v_decision = 'regrant' then 'granted'
  end;

  if not (
    (v_current_state = 'candidate' and v_decision = 'grant')
    or (v_current_state = 'granted' and v_decision = 'revoke')
    or (v_current_state = 'revoked' and v_decision = 'regrant')
  ) then
    raise exception 'reference_not_decidable' using errcode = 'AR202';
  end if;

  update public.project_domain_authorities as authority_row
  set version = authority_row.version + 1
  where authority_row.id = p_authority_id;

  insert into public.project_domain_authority_decisions (
    authority_id, decision, resulting_state, reason_code, aggregate_version,
    evidence_id, actor_user_id, idempotency_key, note, created_at
  ) values (
    p_authority_id, v_decision, v_next_state, v_reason, v_current_version + 1,
    v_evidence_id, v_actor, p_idempotency_key, v_note, v_now
  ) returning id into v_decision_id;

  v_command_id := extensions.gen_random_uuid();
  insert into public.reference_review_commands (
    id, actor_user_id, operation, aggregate_type, aggregate_id,
    idempotency_key, input_hash, expected_version, resulting_version,
    decision_id, result_payload, created_at
  ) values (
    v_command_id, v_actor, 'decide_domain_authority', 'domain_authority',
    p_authority_id, p_idempotency_key, v_input_hash, v_current_version,
    v_current_version + 1, v_decision_id,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'commandId', v_command_id,
      'authorityId', p_authority_id,
      'authorityVersion', v_current_version + 1,
      'state', v_next_state
    ),
    v_now
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, occurred_at, created_at
  ) values (
    'domain_authority', p_authority_id, v_current_version + 1,
    'domain_authority.decided.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'domain_authority.decided.v1',
      'aggregateId', p_authority_id,
      'aggregateVersion', v_current_version + 1,
      'decisionId', v_decision_id,
      'resultingState', v_next_state,
      'occurredAt', v_occurred_at_text
    ),
    v_now, v_now
  );

  return query select
    1, v_command_id, p_authority_id, v_current_version + 1, v_next_state::text, false;
exception
  when others then
    if SQLSTATE in ('AR202', 'AR203', 'AR204', 'AR206', 'AR207', 'AR208', 'AR209') then
      raise;
    end if;
    raise exception 'reference_persistence_failed' using errcode = 'AR299';
end;
$function$;

alter function public.submit_decide_domain_authority(uuid, jsonb, text) owner to postgres;

create or replace function public.submit_decide_reference(
  p_reference_id uuid,
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "referenceId" uuid,
  "referenceVersion" bigint,
  state text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
  v_input_hash text;
  v_decision text;
  v_reason text;
  v_evidence_id uuid;
  v_evidence_source_id uuid;
  v_authority_id uuid;
  v_note text;
  v_expected_version bigint;
  v_current_version bigint;
  v_current_state text;
  v_authority_state text;
  v_next_state text;
  v_command_id uuid;
  v_decision_id uuid;
  v_now timestamptz;
  v_occurred_at_text text;
  v_existing record;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'reference_reviewer_required' using errcode = 'AR204';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'referenceId', 'expectedVersion', 'decision', 'reasonCode', 'evidenceId', 'note']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'referenceId')
    or p_command_payload ->> 'referenceId' <> p_reference_id::text
    or not public.security_json_positive_bigint_is_valid(p_command_payload, 'expectedVersion')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'decision') <> 'string'
    or p_command_payload ->> 'decision' not in ('verify', 'reverify', 'restore', 'withdraw')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'reasonCode') <> 'string'
    or p_command_payload ->> 'reasonCode' not in (
      'evidence_verified',
      'official_announcement',
      'corroborated_source',
      'ownership_unproven',
      'domain_mismatch',
      'duplicate_reference',
      'source_no_longer_official',
      'security_flag_cleared',
      'withdrawn_by_reviewer',
      'insufficient_context'
    )
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'evidenceId') = 'null'
      or public.security_json_uuid_is_valid(p_command_payload, 'evidenceId')
    )
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'string'
        and p_command_payload ->> 'note' = pg_catalog.btrim(p_command_payload ->> 'note')
        and pg_catalog.char_length(p_command_payload ->> 'note') between 1 and 1000
      )
    )
  then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;

  v_decision := p_command_payload ->> 'decision';
  v_reason := p_command_payload ->> 'reasonCode';
  v_evidence_id := (p_command_payload ->> 'evidenceId')::uuid;
  v_note := p_command_payload ->> 'note';
  v_expected_version := (p_command_payload ->> 'expectedVersion')::bigint;
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'decide_reference', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();
  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  if v_decision in ('verify', 'reverify', 'restore') and v_evidence_id is null then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  select * into v_existing
  from public.reference_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'decide_reference'
      or v_existing.aggregate_id <> p_reference_id
      or v_existing.input_hash <> v_input_hash
    then
      raise exception 'reference_idempotency_conflict' using errcode = 'AR207';
    end if;
    return query select
      1,
      v_existing.id,
      v_existing.aggregate_id,
      v_existing.resulting_version,
      v_existing.result_payload ->> 'state',
      true;
    return;
  end if;

  if v_evidence_id is not null then
    select source_row.id into v_evidence_source_id
    from public.evidence as evidence_row
    join public.raw_items as raw_item_row
      on raw_item_row.id = evidence_row.raw_item_id
      and raw_item_row.source_id = evidence_row.source_id
    join public.sources as source_row
      on source_row.id = evidence_row.source_id
    where evidence_row.id = v_evidence_id;
  end if;

  if v_evidence_id is not null and v_evidence_source_id is null then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  select authority_row.id into v_authority_id
  from public.project_references as reference_row
  join public.project_domain_authorities as authority_row
    on authority_row.project_id = reference_row.project_id
    and authority_row.normalized_domain = reference_row.normalized_domain
  where reference_row.id = p_reference_id;

  if v_evidence_source_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      public.security_target_lock_key_v1('source', v_evidence_source_id)
    );
  end if;

  if v_authority_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      public.security_target_lock_key_v1('domain_authority', v_authority_id)
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.security_target_lock_key_v1('reference', p_reference_id)
  );

  select reference_row.version into v_current_version
  from public.project_references as reference_row
  where reference_row.id = p_reference_id
  for update;

  if not found then
    raise exception 'reference_not_found' using errcode = 'AR201';
  end if;

  if v_current_version <> v_expected_version then
    raise exception 'reference_version_conflict' using errcode = 'AR206';
  end if;

  if v_evidence_id is not null
    and not public.reference_evidence_is_usable(v_evidence_id)
  then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  v_current_state := public.reference_current_state_v1(p_reference_id);
  v_authority_state := public.domain_authority_state_for_reference(p_reference_id);

  v_next_state := case
    when v_decision in ('verify', 'reverify', 'restore') then 'verified'
    when v_decision = 'withdraw' then 'withdrawn'
  end;

  if not (
    (v_current_state = 'candidate' and v_decision in ('verify', 'withdraw'))
    or (v_current_state = 'verified' and v_decision in ('reverify', 'withdraw'))
    or (v_current_state = 'flagged' and v_decision in ('restore', 'withdraw'))
  ) then
    raise exception 'reference_not_decidable' using errcode = 'AR202';
  end if;

  if v_decision in ('verify', 'reverify', 'restore') then
    if v_authority_state is null then
      raise exception 'domain_authority_not_found' using errcode = 'AR203';
    end if;
    if v_authority_state <> 'granted' then
      raise exception 'reference_not_decidable' using errcode = 'AR202';
    end if;
  end if;

  update public.project_references as reference_row
  set version = reference_row.version + 1
  where reference_row.id = p_reference_id;

  insert into public.project_reference_decisions (
    reference_id, decision, resulting_state, reason_code, aggregate_version,
    evidence_id, actor_user_id, idempotency_key, note, created_at
  ) values (
    p_reference_id, v_decision, v_next_state, v_reason, v_current_version + 1,
    v_evidence_id, v_actor, p_idempotency_key, v_note, v_now
  ) returning id into v_decision_id;

  if v_decision = 'restore' then
    update public.reference_security_flags
    set released_at = pg_catalog.clock_timestamp(),
        released_by = v_actor,
        release_evidence_id = v_evidence_id
    where reference_id = p_reference_id
      and released_at is null;
  end if;

  v_command_id := extensions.gen_random_uuid();
  insert into public.reference_review_commands (
    id, actor_user_id, operation, aggregate_type, aggregate_id,
    idempotency_key, input_hash, expected_version, resulting_version,
    decision_id, result_payload, created_at
  ) values (
    v_command_id, v_actor, 'decide_reference', 'reference',
    p_reference_id, p_idempotency_key, v_input_hash, v_current_version,
    v_current_version + 1, v_decision_id,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'commandId', v_command_id,
      'referenceId', p_reference_id,
      'referenceVersion', v_current_version + 1,
      'state', v_next_state
    ),
    v_now
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, occurred_at, created_at
  ) values (
    'reference', p_reference_id, v_current_version + 1,
    'reference.decided.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'reference.decided.v1',
      'aggregateId', p_reference_id,
      'aggregateVersion', v_current_version + 1,
      'decisionId', v_decision_id,
      'resultingState', v_next_state,
      'occurredAt', v_occurred_at_text
    ),
    v_now, v_now
  );

  return query select
    1, v_command_id, p_reference_id, v_current_version + 1, v_next_state::text, false;
exception
  when others then
    if SQLSTATE in (
      'AR201', 'AR202', 'AR203', 'AR204', 'AR206', 'AR207', 'AR208', 'AR209'
    ) then
      raise;
    end if;
    raise exception 'reference_persistence_failed' using errcode = 'AR299';
end;
$function$;

alter function public.submit_decide_reference(uuid, jsonb, text) owner to postgres;
