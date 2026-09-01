-- Phase 7B Task 4 closes the reviewer read and note-persistence boundary
-- without rewriting the already-applied Reference Ledger foundation.

alter table public.project_domain_authority_decisions
  add column note text null,
  add constraint project_domain_authority_decisions_note_valid check (
    note is null
    or (
      note = pg_catalog.btrim(note)
      and pg_catalog.char_length(note) between 1 and 1000
    )
  );

alter table public.project_reference_decisions
  add column note text null,
  add constraint project_reference_decisions_note_valid check (
    note is null
    or (
      note = pg_catalog.btrim(note)
      and pg_catalog.char_length(note) between 1 and 1000
    )
  );

alter table public.project_references
  drop constraint project_references_url_key,
  add constraint project_references_url_key unique (project_id, normalized_url);

create or replace function public.submit_register_domain_authority(
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
  v_project_id uuid;
  v_domain text;
  v_normalized_domain text;
  v_evidence_id uuid;
  v_note text;
  v_command_id uuid;
  v_authority_id uuid;
  v_version bigint;
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
      array['version', 'projectId', 'domain', 'evidenceId', 'note']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'projectId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'domain') <> 'string'
    or not public.security_json_uuid_is_valid(p_command_payload, 'evidenceId')
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

  v_project_id := (p_command_payload ->> 'projectId')::uuid;
  v_evidence_id := (p_command_payload ->> 'evidenceId')::uuid;
  v_note := p_command_payload ->> 'note';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'register_domain_authority', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();
  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  select * into v_existing
  from public.reference_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'register_domain_authority'
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

  v_domain := p_command_payload ->> 'domain';
  v_normalized_domain := public.normalize_reference_domain_v1(v_domain);
  if v_normalized_domain is null then
    raise exception 'reference_normalization_invalid' using errcode = 'AR210';
  end if;

  if not exists (select 1 from public.projects as project where project.id = v_project_id) then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;
  if not public.reference_evidence_is_usable(v_evidence_id) then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  begin
    if exists (
      select 1
      from public.project_domain_authorities as authority
      where authority.project_id = v_project_id
        and authority.normalized_domain = v_normalized_domain
    ) then
      raise exception 'reference_command_invalid' using errcode = 'AR208';
    end if;

    insert into public.project_domain_authorities (project_id, normalized_domain)
    values (v_project_id, v_normalized_domain);

    select authority.id, authority.version
    into v_authority_id, v_version
    from public.project_domain_authorities as authority
    where authority.project_id = v_project_id
      and authority.normalized_domain = v_normalized_domain;

    insert into public.project_domain_authority_decisions (
      authority_id, decision, resulting_state, reason_code, aggregate_version,
      evidence_id, actor_user_id, idempotency_key, note, created_at
    ) values (
      v_authority_id, 'register', 'candidate', 'insufficient_context', v_version,
      v_evidence_id, v_actor, p_idempotency_key, v_note, v_now
    ) returning id into v_decision_id;

    v_command_id := extensions.gen_random_uuid();
    insert into public.reference_review_commands (
      id, actor_user_id, operation, aggregate_type, aggregate_id,
      idempotency_key, input_hash, resulting_version, decision_id,
      result_payload, created_at
    ) values (
      v_command_id, v_actor, 'register_domain_authority', 'domain_authority',
      v_authority_id, p_idempotency_key, v_input_hash, v_version, v_decision_id,
      pg_catalog.jsonb_build_object(
        'version', 1,
        'commandId', v_command_id,
        'authorityId', v_authority_id,
        'authorityVersion', v_version,
        'state', 'candidate'
      ),
      v_now
    );

    insert into public.outbox_events (
      aggregate_type, aggregate_id, aggregate_version,
      event_type, payload, occurred_at, created_at
    ) values (
      'domain_authority', v_authority_id, v_version,
      'domain_authority.decided.v1',
      pg_catalog.jsonb_build_object(
        'version', 1,
        'eventType', 'domain_authority.decided.v1',
        'aggregateId', v_authority_id,
        'aggregateVersion', v_version,
        'decisionId', v_decision_id,
        'resultingState', 'candidate',
        'occurredAt', v_occurred_at_text
      ),
      v_now, v_now
    );

    return query select
      1, v_command_id, v_authority_id, v_version, 'candidate'::text, false;
  exception
    when unique_violation then
      raise exception 'reference_command_invalid' using errcode = 'AR208';
    when others then
      if SQLSTATE in ('AR204', 'AR207', 'AR208', 'AR209', 'AR210') then
        raise;
      end if;
      raise exception 'reference_persistence_failed' using errcode = 'AR299';
  end;
end;
$function$;

alter function public.submit_register_domain_authority(jsonb, text) owner to postgres;

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

create or replace function public.submit_register_reference(
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
  v_project_id uuid;
  v_kind text;
  v_url text;
  v_normalized_url text;
  v_normalized_domain text;
  v_label text;
  v_evidence_id uuid;
  v_note text;
  v_command_id uuid;
  v_reference_id uuid;
  v_version bigint;
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
      array['version', 'projectId', 'kind', 'url', 'label', 'evidenceId', 'note']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'projectId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'kind') <> 'string'
    or p_command_payload ->> 'kind' not in (
      'official_site',
      'official_docs',
      'claim_portal',
      'app_entry',
      'official_social',
      'code_repository',
      'announcement',
      'other'
    )
    or pg_catalog.jsonb_typeof(p_command_payload -> 'url') <> 'string'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'label') <> 'string'
    or not public.security_json_uuid_is_valid(p_command_payload, 'evidenceId')
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

  v_project_id := (p_command_payload ->> 'projectId')::uuid;
  v_kind := p_command_payload ->> 'kind';
  v_url := p_command_payload ->> 'url';
  v_label := p_command_payload ->> 'label';
  v_evidence_id := (p_command_payload ->> 'evidenceId')::uuid;
  v_note := p_command_payload ->> 'note';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'register_reference', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();
  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  select * into v_existing
  from public.reference_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'register_reference'
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

  v_normalized_url := public.normalize_reference_url_v1(v_url);
  v_normalized_domain := public.reference_url_host_v1(coalesce(v_normalized_url, ''));
  if v_normalized_url is null
    or v_normalized_domain is null
    or pg_catalog.char_length(v_label) < 1
    or pg_catalog.char_length(v_label) > 160
    or v_label <> pg_catalog.btrim(v_label)
  then
    raise exception 'reference_normalization_invalid' using errcode = 'AR210';
  end if;

  if not exists (select 1 from public.projects as project where project.id = v_project_id) then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;
  if not public.reference_evidence_is_usable(v_evidence_id) then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  begin
    if exists (
      select 1
      from public.project_references as reference_row
      where reference_row.project_id = v_project_id
        and reference_row.normalized_url = v_normalized_url
    ) then
      raise exception 'reference_command_invalid' using errcode = 'AR208';
    end if;

    insert into public.project_references (
      project_id, kind, normalized_url, normalized_domain, label
    ) values (
      v_project_id, v_kind, v_normalized_url, v_normalized_domain, v_label
    );

    select reference_row.id, reference_row.version
    into v_reference_id, v_version
    from public.project_references as reference_row
    where reference_row.project_id = v_project_id
      and reference_row.normalized_url = v_normalized_url;

    insert into public.project_reference_decisions (
      reference_id, decision, resulting_state, reason_code, aggregate_version,
      evidence_id, actor_user_id, idempotency_key, note, created_at
    ) values (
      v_reference_id, 'register', 'candidate', 'insufficient_context', v_version,
      v_evidence_id, v_actor, p_idempotency_key, v_note, v_now
    ) returning id into v_decision_id;

    v_command_id := extensions.gen_random_uuid();
    insert into public.reference_review_commands (
      id, actor_user_id, operation, aggregate_type, aggregate_id,
      idempotency_key, input_hash, resulting_version, decision_id,
      result_payload, created_at
    ) values (
      v_command_id, v_actor, 'register_reference', 'reference',
      v_reference_id, p_idempotency_key, v_input_hash, v_version, v_decision_id,
      pg_catalog.jsonb_build_object(
        'version', 1,
        'commandId', v_command_id,
        'referenceId', v_reference_id,
        'referenceVersion', v_version,
        'state', 'candidate'
      ),
      v_now
    );

    insert into public.outbox_events (
      aggregate_type, aggregate_id, aggregate_version,
      event_type, payload, occurred_at, created_at
    ) values (
      'reference', v_reference_id, v_version,
      'reference.registered.v1',
      pg_catalog.jsonb_build_object(
        'version', 1,
        'eventType', 'reference.registered.v1',
        'aggregateId', v_reference_id,
        'aggregateVersion', v_version,
        'projectId', v_project_id,
        'occurredAt', v_occurred_at_text
      ),
      v_now, v_now
    );

    return query select
      1, v_command_id, v_reference_id, v_version, 'candidate'::text, false;
  exception
    when unique_violation then
      raise exception 'reference_command_invalid' using errcode = 'AR208';
    when others then
      if SQLSTATE in ('AR204', 'AR207', 'AR208', 'AR209', 'AR210') then
        raise;
      end if;
      raise exception 'reference_persistence_failed' using errcode = 'AR299';
  end;
end;
$function$;

alter function public.submit_register_reference(jsonb, text) owner to postgres;

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
  if v_evidence_id is not null
    and not public.reference_evidence_is_usable(v_evidence_id)
  then
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

create or replace function public.reference_is_publicly_renderable_v1(p_reference_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select
    public.reference_current_state_v1(p_reference_id) = 'verified'
    and public.domain_authority_state_for_reference(p_reference_id) = 'granted'
    and exists (
      select 1
      from public.projects as project
      where project.id = (
        select reference_row.project_id
        from public.project_references as reference_row
        where reference_row.id = p_reference_id
      )
        and project.lifecycle in ('active', 'rumored')
    )
    and public.current_security_target_posture(
      'project',
      (
        select reference_row.project_id
        from public.project_references as reference_row
        where reference_row.id = p_reference_id
      )
    ) <> 'blocked';
$function$;

alter function public.reference_is_publicly_renderable_v1(uuid) owner to postgres;

create function public.list_reference_review_items(
  p_project_id uuid,
  p_state text,
  p_cursor_updated_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns table (
  version integer,
  "referenceId" uuid,
  "projectId" uuid,
  kind text,
  label text,
  url text,
  state text,
  "referenceVersion" bigint,
  "lastVerifiedAt" timestamptz,
  "activeIndicatorId" uuid,
  "updatedAt" timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'reference_reviewer_required' using errcode = 'AR204';
  end if;
  if p_state is null or p_state not in ('all', 'candidate', 'verified', 'flagged', 'withdrawn')
    or (p_cursor_updated_at is null) <> (p_cursor_id is null)
    or p_limit is null or p_limit not between 1 and 100
  then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;

  return query
  select
    1,
    current_reference.reference_id,
    current_reference.project_id,
    current_reference.kind,
    current_reference.label,
    current_reference.normalized_url,
    current_reference.current_state,
    current_reference.version,
    current_reference.last_verified_at,
    current_reference.active_indicator_id,
    latest_decision.created_at
  from public.project_reference_current_state as current_reference
  cross join lateral (
    select decision.created_at
    from public.project_reference_decisions as decision
    where decision.reference_id = current_reference.reference_id
    order by decision.aggregate_version desc, decision.created_at desc, decision.id desc
    limit 1
  ) as latest_decision
  where (p_project_id is null or current_reference.project_id = p_project_id)
    and (p_state = 'all' or current_reference.current_state = p_state)
    and (
      p_cursor_updated_at is null
      or (latest_decision.created_at, current_reference.reference_id)
        < (p_cursor_updated_at, p_cursor_id)
    )
  order by latest_decision.created_at desc, current_reference.reference_id desc
  limit p_limit;
end;
$function$;

alter function public.list_reference_review_items(uuid, text, timestamptz, uuid, integer)
owner to postgres;

create function public.get_reference_review_detail(p_reference_id uuid)
returns table (
  version integer,
  "referenceId" uuid,
  "projectId" uuid,
  kind text,
  label text,
  url text,
  state text,
  "referenceVersion" bigint,
  "lastVerifiedAt" timestamptz,
  "activeIndicatorId" uuid,
  "updatedAt" timestamptz,
  "domainAuthority" jsonb,
  decisions jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'reference_reviewer_required' using errcode = 'AR204';
  end if;
  if p_reference_id is null then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;

  return query
  select
    1,
    current_reference.reference_id,
    current_reference.project_id,
    current_reference.kind,
    current_reference.label,
    current_reference.normalized_url,
    current_reference.current_state,
    current_reference.version,
    current_reference.last_verified_at,
    current_reference.active_indicator_id,
    latest_decision.created_at,
    authority.detail,
    coalesce(history.decisions, '[]'::jsonb)
  from public.project_reference_current_state as current_reference
  cross join lateral (
    select decision.created_at
    from public.project_reference_decisions as decision
    where decision.reference_id = current_reference.reference_id
    order by decision.aggregate_version desc, decision.created_at desc, decision.id desc
    limit 1
  ) as latest_decision
  left join lateral (
    select pg_catalog.jsonb_build_object(
      'authorityId', authority_row.id,
      'domain', authority_row.normalized_domain,
      'state', public.domain_authority_current_state_v1(authority_row.id),
      'authorityVersion', authority_row.version
    ) as detail
    from public.project_domain_authorities as authority_row
    where authority_row.project_id = current_reference.project_id
      and authority_row.normalized_domain = current_reference.normalized_domain
    limit 1
  ) as authority on true
  left join lateral (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'decisionId', decision.id,
        'decision', decision.decision,
        'resultingState', decision.resulting_state,
        'reasonCode', decision.reason_code,
        'evidenceId', decision.evidence_id,
        'note', decision.note,
        'createdAt', decision.created_at
      ) order by decision.aggregate_version asc, decision.created_at asc, decision.id asc
    ) as decisions
    from public.project_reference_decisions as decision
    where decision.reference_id = current_reference.reference_id
  ) as history on true
  where current_reference.reference_id = p_reference_id;

  if not found then
    raise exception 'reference_not_found' using errcode = 'AR201';
  end if;
end;
$function$;

alter function public.get_reference_review_detail(uuid) owner to postgres;

create function public.list_domain_authority_review_items(
  p_project_id uuid,
  p_state text,
  p_cursor_updated_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns table (
  version integer,
  "authorityId" uuid,
  "projectId" uuid,
  domain text,
  state text,
  "authorityVersion" bigint,
  "updatedAt" timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'reference_reviewer_required' using errcode = 'AR204';
  end if;
  if p_state is null or p_state not in ('all', 'candidate', 'granted', 'revoked')
    or (p_cursor_updated_at is null) <> (p_cursor_id is null)
    or p_limit is null or p_limit not between 1 and 100
  then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;

  return query
  select
    1,
    authority_row.id,
    authority_row.project_id,
    authority_row.normalized_domain,
    public.domain_authority_current_state_v1(authority_row.id),
    authority_row.version,
    latest_decision.created_at
  from public.project_domain_authorities as authority_row
  cross join lateral (
    select decision.created_at
    from public.project_domain_authority_decisions as decision
    where decision.authority_id = authority_row.id
    order by decision.aggregate_version desc, decision.created_at desc, decision.id desc
    limit 1
  ) as latest_decision
  where (p_project_id is null or authority_row.project_id = p_project_id)
    and (
      p_state = 'all'
      or public.domain_authority_current_state_v1(authority_row.id) = p_state
    )
    and (
      p_cursor_updated_at is null
      or (latest_decision.created_at, authority_row.id) < (p_cursor_updated_at, p_cursor_id)
    )
  order by latest_decision.created_at desc, authority_row.id desc
  limit p_limit;
end;
$function$;

alter function public.list_domain_authority_review_items(uuid, text, timestamptz, uuid, integer)
owner to postgres;

create function public.get_domain_authority_review_detail(p_authority_id uuid)
returns table (
  version integer,
  "authorityId" uuid,
  "projectId" uuid,
  domain text,
  state text,
  "authorityVersion" bigint,
  "updatedAt" timestamptz,
  decisions jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'reference_reviewer_required' using errcode = 'AR204';
  end if;
  if p_authority_id is null then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;

  return query
  select
    1,
    authority_row.id,
    authority_row.project_id,
    authority_row.normalized_domain,
    public.domain_authority_current_state_v1(authority_row.id),
    authority_row.version,
    latest_decision.created_at,
    coalesce(history.decisions, '[]'::jsonb)
  from public.project_domain_authorities as authority_row
  cross join lateral (
    select decision.created_at
    from public.project_domain_authority_decisions as decision
    where decision.authority_id = authority_row.id
    order by decision.aggregate_version desc, decision.created_at desc, decision.id desc
    limit 1
  ) as latest_decision
  left join lateral (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'decisionId', decision.id,
        'decision', decision.decision,
        'resultingState', decision.resulting_state,
        'reasonCode', decision.reason_code,
        'evidenceId', decision.evidence_id,
        'note', decision.note,
        'createdAt', decision.created_at
      ) order by decision.aggregate_version asc, decision.created_at asc, decision.id asc
    ) as decisions
    from public.project_domain_authority_decisions as decision
    where decision.authority_id = authority_row.id
  ) as history on true
  where authority_row.id = p_authority_id;

  if not found then
    raise exception 'domain_authority_not_found' using errcode = 'AR203';
  end if;
end;
$function$;

alter function public.get_domain_authority_review_detail(uuid) owner to postgres;

revoke all on function public.list_reference_review_items(
  uuid, text, timestamptz, uuid, integer
) from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.get_reference_review_detail(uuid)
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.list_domain_authority_review_items(
  uuid, text, timestamptz, uuid, integer
) from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.get_domain_authority_review_detail(uuid)
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;

grant execute on function public.list_reference_review_items(
  uuid, text, timestamptz, uuid, integer
) to authenticated;
grant execute on function public.get_reference_review_detail(uuid) to authenticated;
grant execute on function public.list_domain_authority_review_items(
  uuid, text, timestamptz, uuid, integer
) to authenticated;
grant execute on function public.get_domain_authority_review_detail(uuid) to authenticated;
