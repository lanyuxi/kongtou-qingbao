-- Canonical intelligence governance boundary: human review, deterministic
-- Evidence grounding, append-only audit records, and transactional outbox.

do $role_boundary$
declare
  service_role pg_catalog.pg_roles;
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'promotion_service'
  ) then
    create role promotion_service
      nologin
      noinherit
      nobypassrls
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication;
  end if;

  alter role promotion_service
    nologin
    noinherit
    nocreatedb
    nocreaterole
    password null;

  select * into strict service_role
  from pg_catalog.pg_roles
  where rolname = 'promotion_service';

  if service_role.rolsuper
    or service_role.rolbypassrls
    or service_role.rolreplication
  then
    raise exception 'promotion_service_privileged_attributes_forbidden'
      using errcode = '55000';
  end if;
end;
$role_boundary$;

grant promotion_service to postgres
with admin false, inherit false, set true;

revoke insert on table public.signals from ai_stage_worker;
drop policy if exists signals_ai_stage_worker_insert on public.signals;
revoke execute on function public.promote_extraction_candidate(uuid, text)
from ai_stage_worker;

-- The stage worker may append candidates but may no longer perform candidate
-- review transitions or forge Promotion audit records.
revoke update (status, signal_id, decided_at)
on table public.extraction_candidates from ai_stage_worker;
drop policy if exists extraction_candidates_ai_stage_worker_update
on public.extraction_candidates;
revoke insert on table public.promotion_events from ai_stage_worker;
drop policy if exists promotion_events_ai_stage_worker_insert
on public.promotion_events;
revoke insert on table public.extraction_candidates from ai_stage_worker;
grant insert (
  ai_run_id, project_id, source_id, discovered_item_id, raw_item_id,
  payload, payload_sha256
) on table public.extraction_candidates to ai_stage_worker;
drop policy if exists extraction_candidates_ai_stage_worker_insert
on public.extraction_candidates;

alter table public.extraction_candidates
  add column version bigint not null default 1
    constraint extraction_candidates_version_positive check (version > 0),
  add column review_status text not null default 'pending'
    constraint extraction_candidates_review_status_valid
    check (review_status in ('pending', 'needs_review', 'decided'));

alter table public.extraction_candidates
  drop constraint extraction_candidates_status_shape,
  add constraint extraction_candidates_status_shape check (
    (status = 'promoted' and signal_id is not null and decided_at is not null)
    or (status = 'rejected' and signal_id is null and decided_at is not null)
    or (status = 'pending' and signal_id is null and decided_at is null)
  );

create policy extraction_candidates_ai_stage_worker_insert
on public.extraction_candidates
for insert
to ai_stage_worker
with check (
  status = 'pending'
  and signal_id is null
  and decided_at is null
  and version = 1
  and review_status = 'pending'
);

create table public.evidence (
  id uuid primary key default extensions.gen_random_uuid(),
  source_id uuid not null
    constraint evidence_source_id_fkey
    references public.sources (id) on delete restrict,
  raw_item_id uuid not null
    constraint evidence_raw_item_id_fkey
    references public.raw_items (id) on delete restrict,
  discovered_item_id uuid null
    constraint evidence_discovered_item_id_fkey
    references public.discovered_items (id) on delete restrict,
  locator_version smallint not null default 1,
  locator_kind text not null default 'exact_quote',
  source_field text not null,
  quote_text text not null,
  normalized_quote_sha256 text not null,
  verification_method text not null default 'deterministic_exact_quote_v1',
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint evidence_locator_version_valid check (locator_version = 1),
  constraint evidence_locator_kind_valid check (locator_kind = 'exact_quote'),
  constraint evidence_source_field_valid check (
    source_field in ('article_raw_text', 'discovered_summary')
  ),
  constraint evidence_quote_text_valid check (
    quote_text = pg_catalog.btrim(quote_text)
    and pg_catalog.char_length(quote_text) between 10 and 500
  ),
  constraint evidence_normalized_quote_sha256_valid check (
    normalized_quote_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint evidence_verification_method_valid check (
    verification_method = 'deterministic_exact_quote_v1'
  ),
  constraint evidence_discovered_shape check (
    (source_field = 'article_raw_text')
    or (source_field = 'discovered_summary' and discovered_item_id is not null)
  )
);

create unique index evidence_deterministic_key
on public.evidence (
  raw_item_id,
  (coalesce(discovered_item_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  source_field,
  normalized_quote_sha256
);
create index evidence_source_created_idx
on public.evidence (source_id, created_at desc, id desc);
create index evidence_discovered_item_idx
on public.evidence (discovered_item_id, created_at desc, id desc)
where discovered_item_id is not null;

create table public.signal_evidence_links (
  signal_id uuid not null
    constraint signal_evidence_links_signal_id_fkey
    references public.signals (id) on delete restrict,
  evidence_id uuid not null
    constraint signal_evidence_links_evidence_id_fkey
    references public.evidence (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (signal_id, evidence_id)
);

create index signal_evidence_links_evidence_idx
on public.signal_evidence_links (evidence_id, signal_id);

create table public.candidate_review_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  candidate_id uuid not null
    constraint candidate_review_decisions_candidate_id_fkey
    references public.extraction_candidates (id) on delete restrict,
  candidate_version bigint not null,
  reviewer_user_id uuid not null
    constraint candidate_review_decisions_reviewer_user_id_fkey
    references public.profiles (id) on delete restrict,
  decision text not null,
  reason_code text not null,
  note text null,
  evidence_id uuid null
    constraint candidate_review_decisions_evidence_id_fkey
    references public.evidence (id) on delete restrict,
  signal_id uuid null
    constraint candidate_review_decisions_signal_id_fkey
    references public.signals (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint candidate_review_decisions_version_positive check (candidate_version > 0),
  constraint candidate_review_decisions_decision_valid check (
    decision in ('approve', 'reject', 'needs_review')
  ),
  constraint candidate_review_decisions_reason_code_valid check (
    reason_code in (
      'evidence_verified', 'claim_not_supported', 'source_mismatch',
      'grounding_failed', 'insufficient_context',
      'historical_reconciliation_failed'
    )
  ),
  constraint candidate_review_decisions_note_valid check (
    note is null
    or (
      note = pg_catalog.btrim(note)
      and pg_catalog.char_length(note) between 1 and 1000
    )
  ),
  constraint candidate_review_decisions_shape check (
    (decision = 'approve' and reason_code = 'evidence_verified'
      and evidence_id is not null and signal_id is not null)
    or (decision = 'reject'
      and reason_code in ('claim_not_supported', 'source_mismatch')
      and evidence_id is null and signal_id is null)
    or (decision = 'needs_review'
      and reason_code in (
        'source_mismatch', 'grounding_failed', 'insufficient_context',
        'historical_reconciliation_failed'
      )
      and evidence_id is null and signal_id is null)
  )
);

create index candidate_review_decisions_candidate_latest_idx
on public.candidate_review_decisions (candidate_id, created_at desc, id desc);
create index candidate_review_decisions_reviewer_created_idx
on public.candidate_review_decisions (reviewer_user_id, created_at desc, id desc);

create table public.promotion_commands (
  id uuid primary key default extensions.gen_random_uuid(),
  reviewer_user_id uuid not null
    constraint promotion_commands_reviewer_user_id_fkey
    references public.profiles (id) on delete restrict,
  candidate_id uuid not null
    constraint promotion_commands_candidate_id_fkey
    references public.extraction_candidates (id) on delete restrict,
  idempotency_key text not null,
  input_hash text not null,
  expected_candidate_version bigint not null,
  resulting_candidate_version bigint not null,
  decision_id uuid not null
    constraint promotion_commands_decision_id_fkey
    references public.candidate_review_decisions (id) on delete restrict,
  outcome text not null,
  signal_id uuid null
    constraint promotion_commands_signal_id_fkey
    references public.signals (id) on delete restrict,
  evidence_id uuid null
    constraint promotion_commands_evidence_id_fkey
    references public.evidence (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint promotion_commands_reviewer_key unique (reviewer_user_id, idempotency_key),
  constraint promotion_commands_idempotency_key_valid check (
    pg_catalog.char_length(idempotency_key) between 1 and 200
    and pg_catalog.btrim(idempotency_key) <> ''
  ),
  constraint promotion_commands_input_hash_valid check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint promotion_commands_versions_positive check (
    expected_candidate_version > 0 and resulting_candidate_version > 0
  ),
  constraint promotion_commands_outcome_valid check (
    outcome in ('promoted', 'rejected', 'needs_review')
  ),
  constraint promotion_commands_result_shape check (
    (outcome = 'promoted' and signal_id is not null and evidence_id is not null)
    or (outcome in ('rejected', 'needs_review')
      and signal_id is null and evidence_id is null)
  )
);

create index promotion_commands_candidate_created_idx
on public.promotion_commands (candidate_id, created_at desc, id desc);

create table public.outbox_events (
  id uuid primary key default extensions.gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version bigint not null,
  event_type text not null,
  event_version smallint not null default 1,
  payload jsonb not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  published_at timestamptz null,
  delivery_attempts integer not null default 0,
  last_error_code text null,
  constraint outbox_events_identity_key unique (
    aggregate_type, aggregate_id, aggregate_version, event_type, event_version
  ),
  constraint outbox_events_aggregate_type_valid check (
    aggregate_type = pg_catalog.btrim(aggregate_type)
    and pg_catalog.char_length(aggregate_type) between 1 and 80
  ),
  constraint outbox_events_aggregate_version_positive check (aggregate_version > 0),
  constraint outbox_events_event_type_valid check (
    event_type in (
      'intelligence.signal.promoted.v1',
      'intelligence.candidate.reviewed.v1'
    )
  ),
  constraint outbox_events_event_version_valid check (event_version = 1),
  constraint outbox_events_payload_valid check (
    pg_catalog.jsonb_typeof(payload) = 'object'
    and (payload ->> 'version') = '1'
    and payload ->> 'eventType' = event_type
  ),
  constraint outbox_events_delivery_attempts_valid check (delivery_attempts >= 0),
  constraint outbox_events_last_error_code_valid check (
    last_error_code is null
    or (
      last_error_code = pg_catalog.btrim(last_error_code)
      and pg_catalog.char_length(last_error_code) between 1 and 100
    )
  )
);

create index outbox_events_unpublished_idx
on public.outbox_events (occurred_at, id)
where published_at is null;

alter table public.promotion_events
  add column review_decision_id uuid null
    constraint promotion_events_review_decision_id_fkey
    references public.candidate_review_decisions (id) on delete restrict,
  add column reviewer_user_id uuid null
    constraint promotion_events_reviewer_user_id_fkey
    references public.profiles (id) on delete restrict,
  add constraint promotion_events_governance_shape check (
    (review_decision_id is null and reviewer_user_id is null)
    or (review_decision_id is not null and reviewer_user_id is not null)
  );

alter table public.evidence enable row level security;
alter table public.signal_evidence_links enable row level security;
alter table public.candidate_review_decisions enable row level security;
alter table public.promotion_commands enable row level security;
alter table public.outbox_events enable row level security;

revoke all on table public.evidence
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, promotion_service;
revoke all on table public.signal_evidence_links
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, promotion_service;
revoke all on table public.candidate_review_decisions
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, promotion_service;
revoke all on table public.promotion_commands
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, promotion_service;
revoke all on table public.outbox_events
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, promotion_service;

create function public.reject_governance_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'governance_history_append_only' using errcode = '55000';
end;
$$;

alter function public.reject_governance_history_mutation() owner to postgres;

create trigger evidence_reject_mutation
before update or delete on public.evidence
for each row execute function public.reject_governance_history_mutation();
create trigger signal_evidence_links_reject_mutation
before update or delete on public.signal_evidence_links
for each row execute function public.reject_governance_history_mutation();
create trigger candidate_review_decisions_reject_mutation
before update or delete on public.candidate_review_decisions
for each row execute function public.reject_governance_history_mutation();
create trigger promotion_commands_reject_mutation
before update or delete on public.promotion_commands
for each row execute function public.reject_governance_history_mutation();

create function public.normalize_evidence_text_v1(input_text text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.translate(
        input_text,
        U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000',
        pg_catalog.repeat(' ', 19)
      ),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ' '
  );
$$;

alter function public.normalize_evidence_text_v1(text) owner to postgres;

create function public.evidence_quote_sha256_v1(input_text text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public, extensions
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(public.normalize_evidence_text_v1(input_text), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

alter function public.evidence_quote_sha256_v1(text) owner to postgres;

create function public.execute_extraction_candidate_review(
  p_reviewer_user_id uuid,
  p_command_payload jsonb,
  p_idempotency_key text,
  p_input_hash text,
  p_now timestamptz
)
returns table (
  command_id uuid,
  candidate_id uuid,
  candidate_version bigint,
  decision_id uuid,
  outcome text,
  signal_id uuid,
  evidence_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  candidate_record public.extraction_candidates%rowtype;
  receipt_record public.promotion_commands%rowtype;
  discovered_record public.discovered_items%rowtype;
  raw_record public.raw_items%rowtype;
  requested_candidate_id uuid;
  requested_reviewer_id uuid;
  expected_version bigint;
  requested_decision text;
  requested_reason text;
  requested_note text;
  stored_quote text;
  normalized_quote text;
  normalized_source text;
  resolved_source_field text;
  resolved_raw_item_id uuid;
  next_version bigint;
  result_outcome text;
  result_reason text;
  new_command_id uuid := extensions.gen_random_uuid();
  new_decision_id uuid := extensions.gen_random_uuid();
  new_signal_id uuid;
  resolved_evidence_id uuid;
  source_identity_matches boolean := true;
  grounding_matches boolean := false;
  occurred_at_text text;
begin
  if p_reviewer_user_id is null
    or p_command_payload is null
    or pg_catalog.jsonb_typeof(p_command_payload) <> 'object'
    or p_idempotency_key is null
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
    or pg_catalog.btrim(p_idempotency_key) = ''
    or p_input_hash is null
    or p_input_hash !~ '^[0-9a-f]{64}$'
    or p_now is null
    or not pg_catalog.isfinite(p_now)
    or (select count(*) from pg_catalog.jsonb_object_keys(p_command_payload)) <> 7
    or not (p_command_payload ?& array[
      'version', 'candidateId', 'reviewerUserId', 'expectedCandidateVersion',
      'decision', 'reasonCode', 'note'
    ])
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(p_command_payload) as command_key(key)
      where command_key.key not in (
        'version', 'candidateId', 'reviewerUserId', 'expectedCandidateVersion',
        'decision', 'reasonCode', 'note'
      )
    )
    or pg_catalog.jsonb_typeof(p_command_payload -> 'version') <> 'number'
    or p_command_payload ->> 'version' <> '1'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'candidateId') <> 'string'
    or p_command_payload ->> 'candidateId'
      !~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'reviewerUserId') <> 'string'
    or p_command_payload ->> 'reviewerUserId'
      !~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'expectedCandidateVersion') <> 'number'
    or p_command_payload ->> 'expectedCandidateVersion' !~ '^[1-9][0-9]*$'
    or (p_command_payload ->> 'expectedCandidateVersion')::numeric > 9223372036854775807
    or pg_catalog.jsonb_typeof(p_command_payload -> 'decision') <> 'string'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'reasonCode') <> 'string'
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'string'
        and p_command_payload ->> 'note' = pg_catalog.btrim(p_command_payload ->> 'note')
        and pg_catalog.char_length(p_command_payload ->> 'note') between 1 and 1000
      )
    )
    or pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(p_command_payload::text, 'UTF8'), 'sha256'),
      'hex'
    ) <> p_input_hash
  then
    raise exception 'promotion_command_invalid' using errcode = 'AI106';
  end if;

  requested_candidate_id := (p_command_payload ->> 'candidateId')::uuid;
  requested_reviewer_id := (p_command_payload ->> 'reviewerUserId')::uuid;
  expected_version := (p_command_payload ->> 'expectedCandidateVersion')::bigint;
  requested_decision := p_command_payload ->> 'decision';
  requested_reason := p_command_payload ->> 'reasonCode';
  requested_note := p_command_payload ->> 'note';

  if requested_reviewer_id <> p_reviewer_user_id then
    raise exception 'promotion_command_invalid' using errcode = 'AI106';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_reviewer_user_id::text || ':' ||
      pg_catalog.char_length(p_idempotency_key)::text || ':' ||
      p_idempotency_key,
      0
    )
  );

  select receipt.* into receipt_record
  from public.promotion_commands as receipt
  where receipt.reviewer_user_id = p_reviewer_user_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if receipt_record.input_hash <> p_input_hash then
      raise exception 'promotion_idempotency_conflict' using errcode = 'AI104';
    end if;

    return query select
      receipt_record.id,
      receipt_record.candidate_id,
      receipt_record.resulting_candidate_version,
      receipt_record.decision_id,
      receipt_record.outcome,
      receipt_record.signal_id,
      receipt_record.evidence_id,
      true;
    return;
  end if;

  if not exists (
    select 1 from public.user_roles as role_grant
    where role_grant.user_id = p_reviewer_user_id
      and role_grant.role in ('reviewer', 'senior_reviewer', 'security_reviewer', 'admin')
      and role_grant.revoked_at is null
  ) then
    raise exception 'promotion_reviewer_not_authorized' using errcode = 'AI105';
  end if;

  select candidate.* into candidate_record
  from public.extraction_candidates as candidate
  where candidate.id = requested_candidate_id
  for update;

  if not found then
    raise exception 'promotion_candidate_not_found' using errcode = 'AI101';
  end if;

  if candidate_record.version <> expected_version then
    raise exception 'promotion_version_conflict' using errcode = 'AI103';
  end if;

  if candidate_record.status <> 'pending' then
    raise exception 'promotion_candidate_not_reviewable' using errcode = 'AI102';
  end if;

  if not (
    (requested_decision = 'approve' and requested_reason = 'evidence_verified')
    or (requested_decision = 'reject'
      and requested_reason in ('claim_not_supported', 'source_mismatch'))
    or (requested_decision = 'needs_review'
      and requested_reason in (
        'source_mismatch', 'grounding_failed', 'insufficient_context',
        'historical_reconciliation_failed'
      ))
  ) then
    raise exception 'promotion_command_invalid' using errcode = 'AI106';
  end if;

  next_version := candidate_record.version + 1;
  occurred_at_text := pg_catalog.to_char(
    p_now at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  if requested_decision = 'approve' then
    if pg_catalog.jsonb_typeof(candidate_record.payload -> 'evidenceQuote') <> 'string'
      or pg_catalog.char_length(candidate_record.payload ->> 'evidenceQuote') not between 10 and 500
    then
      raise exception 'promotion_evidence_quote_invalid' using errcode = 'AI107';
    end if;

    stored_quote := candidate_record.payload ->> 'evidenceQuote';
    normalized_quote := public.normalize_evidence_text_v1(stored_quote);
    if pg_catalog.char_length(normalized_quote) not between 10 and 500 then
      raise exception 'promotion_evidence_quote_invalid' using errcode = 'AI107';
    end if;

    select discovered.* into discovered_record
    from public.discovered_items as discovered
    where discovered.id = candidate_record.discovered_item_id;

    if not found
      or discovered_record.project_id <> candidate_record.project_id
      or discovered_record.source_id <> candidate_record.source_id
    then
      source_identity_matches := false;
    elsif candidate_record.raw_item_id is not null then
      resolved_source_field := 'article_raw_text';
      select raw_item.* into raw_record
      from public.raw_items as raw_item
      where raw_item.id = candidate_record.raw_item_id;

      if not found
        or raw_record.project_id <> candidate_record.project_id
        or raw_record.source_id <> candidate_record.source_id
      then
        source_identity_matches := false;
      else
        resolved_raw_item_id := raw_record.id;
        normalized_source := public.normalize_evidence_text_v1(raw_record.raw_text);
      end if;
    else
      resolved_source_field := 'discovered_summary';
      select raw_item.* into raw_record
      from public.raw_items as raw_item
      where raw_item.id = discovered_record.feed_raw_item_id;

      if not found
        or raw_record.project_id <> candidate_record.project_id
        or raw_record.source_id <> candidate_record.source_id
        or discovered_record.summary is null
      then
        source_identity_matches := false;
      else
        resolved_raw_item_id := raw_record.id;
        normalized_source := public.normalize_evidence_text_v1(discovered_record.summary);
      end if;
    end if;

    grounding_matches := source_identity_matches
      and pg_catalog.strpos(normalized_source, normalized_quote) > 0;

    if not source_identity_matches or not grounding_matches then
      result_outcome := 'needs_review';
      result_reason := case
        when not source_identity_matches then 'source_mismatch'
        else 'grounding_failed'
      end;

      insert into public.candidate_review_decisions (
        id, candidate_id, candidate_version, reviewer_user_id, decision,
        reason_code, note, created_at
      ) values (
        new_decision_id, candidate_record.id, next_version, p_reviewer_user_id,
        'needs_review', result_reason, requested_note, p_now
      );

      update public.extraction_candidates
      set review_status = 'needs_review', version = next_version
      where id = candidate_record.id;
    else
      insert into public.evidence (
        source_id, raw_item_id, discovered_item_id, source_field, quote_text,
        normalized_quote_sha256, verified_at, created_at
      ) values (
        candidate_record.source_id,
        resolved_raw_item_id,
        candidate_record.discovered_item_id,
        resolved_source_field,
        normalized_quote,
        public.evidence_quote_sha256_v1(stored_quote),
        p_now,
        p_now
      )
      on conflict do nothing
      returning id into resolved_evidence_id;

      if resolved_evidence_id is null then
        select evidence_record.id into strict resolved_evidence_id
        from public.evidence as evidence_record
        where evidence_record.raw_item_id = resolved_raw_item_id
          and evidence_record.discovered_item_id is not distinct from candidate_record.discovered_item_id
          and evidence_record.source_field = resolved_source_field
          and evidence_record.normalized_quote_sha256 = public.evidence_quote_sha256_v1(stored_quote);
      end if;

      insert into public.signals (
        project_id, signal_type, title, summary, verification, lifecycle,
        confidence, occurred_at, published_at, created_at
      ) values (
        candidate_record.project_id,
        candidate_record.payload ->> 'signalType',
        candidate_record.payload ->> 'title',
        candidate_record.payload ->> 'summary',
        'unverified',
        'published',
        (candidate_record.payload ->> 'confidence')::numeric,
        nullif(candidate_record.payload ->> 'occurredAtIso', '')::timestamptz,
        p_now,
        p_now
      ) returning id into new_signal_id;

      insert into public.signal_evidence_links (signal_id, evidence_id, created_at)
      values (new_signal_id, resolved_evidence_id, p_now);

      insert into public.candidate_review_decisions (
        id, candidate_id, candidate_version, reviewer_user_id, decision,
        reason_code, note, evidence_id, signal_id, created_at
      ) values (
        new_decision_id, candidate_record.id, next_version, p_reviewer_user_id,
        'approve', 'evidence_verified', requested_note, resolved_evidence_id,
        new_signal_id, p_now
      );

      insert into public.promotion_events (
        candidate_id, signal_id, actor, review_decision_id, reviewer_user_id,
        created_at
      ) values (
        candidate_record.id, new_signal_id, 'user:' || p_reviewer_user_id::text,
        new_decision_id, p_reviewer_user_id, p_now
      );

      update public.extraction_candidates
      set status = 'promoted', signal_id = new_signal_id, decided_at = p_now,
        review_status = 'decided', version = next_version
      where id = candidate_record.id;

      result_outcome := 'promoted';
      result_reason := 'evidence_verified';
    end if;
  elsif requested_decision = 'reject' then
    result_outcome := 'rejected';
    result_reason := requested_reason;

    insert into public.candidate_review_decisions (
      id, candidate_id, candidate_version, reviewer_user_id, decision,
      reason_code, note, created_at
    ) values (
      new_decision_id, candidate_record.id, next_version, p_reviewer_user_id,
      'reject', result_reason, requested_note, p_now
    );

    update public.extraction_candidates
    set status = 'rejected', decided_at = p_now, review_status = 'decided',
      version = next_version
    where id = candidate_record.id;
  else
    result_outcome := 'needs_review';
    result_reason := requested_reason;

    insert into public.candidate_review_decisions (
      id, candidate_id, candidate_version, reviewer_user_id, decision,
      reason_code, note, created_at
    ) values (
      new_decision_id, candidate_record.id, next_version, p_reviewer_user_id,
      'needs_review', result_reason, requested_note, p_now
    );

    update public.extraction_candidates
    set review_status = 'needs_review', version = next_version
    where id = candidate_record.id;
  end if;

  if result_outcome = 'promoted' then
    insert into public.outbox_events (
      aggregate_type, aggregate_id, aggregate_version, event_type,
      payload, occurred_at, created_at
    ) values (
      'extraction_candidate', candidate_record.id, next_version,
      'intelligence.signal.promoted.v1',
      pg_catalog.jsonb_build_object(
        'version', 1,
        'eventType', 'intelligence.signal.promoted.v1',
        'candidateId', candidate_record.id,
        'candidateVersion', next_version,
        'decisionId', new_decision_id,
        'signalId', new_signal_id,
        'evidenceId', resolved_evidence_id,
        'occurredAt', occurred_at_text
      ),
      p_now,
      p_now
    );
  else
    insert into public.outbox_events (
      aggregate_type, aggregate_id, aggregate_version, event_type,
      payload, occurred_at, created_at
    ) values (
      'extraction_candidate', candidate_record.id, next_version,
      'intelligence.candidate.reviewed.v1',
      pg_catalog.jsonb_build_object(
        'version', 1,
        'eventType', 'intelligence.candidate.reviewed.v1',
        'candidateId', candidate_record.id,
        'candidateVersion', next_version,
        'decisionId', new_decision_id,
        'outcome', result_outcome,
        'occurredAt', occurred_at_text
      ),
      p_now,
      p_now
    );
  end if;

  insert into public.promotion_commands (
    id, reviewer_user_id, candidate_id, idempotency_key, input_hash,
    expected_candidate_version, resulting_candidate_version, decision_id,
    outcome, signal_id, evidence_id, created_at
  ) values (
    new_command_id, p_reviewer_user_id, candidate_record.id, p_idempotency_key,
    p_input_hash, expected_version, next_version, new_decision_id,
    result_outcome, new_signal_id, resolved_evidence_id, p_now
  );

  return query select
    new_command_id,
    candidate_record.id,
    next_version,
    new_decision_id,
    result_outcome,
    new_signal_id,
    resolved_evidence_id,
    false;
end;
$$;

alter function public.execute_extraction_candidate_review(
  uuid, jsonb, text, text, timestamptz
) owner to postgres;

create function public.reconcile_extraction_candidate_evidence(
  p_reviewer_user_id uuid,
  p_candidate_id uuid,
  p_expected_candidate_version bigint,
  p_idempotency_key text,
  p_now timestamptz
)
returns table (
  command_id uuid,
  candidate_id uuid,
  candidate_version bigint,
  decision_id uuid,
  outcome text,
  signal_id uuid,
  evidence_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  candidate_record public.extraction_candidates%rowtype;
  receipt_record public.promotion_commands%rowtype;
  discovered_record public.discovered_items%rowtype;
  raw_record public.raw_items%rowtype;
  canonical_input jsonb;
  canonical_input_hash text;
  stored_quote text;
  normalized_quote text;
  normalized_source text;
  resolved_source_field text;
  resolved_raw_item_id uuid;
  next_version bigint;
  result_outcome text;
  new_command_id uuid := extensions.gen_random_uuid();
  new_decision_id uuid := extensions.gen_random_uuid();
  resolved_evidence_id uuid;
  source_identity_matches boolean := true;
  grounding_matches boolean := false;
  occurred_at_text text;
begin
  if p_reviewer_user_id is null
    or p_candidate_id is null
    or p_expected_candidate_version is null
    or p_expected_candidate_version <= 0
    or p_idempotency_key is null
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
    or pg_catalog.btrim(p_idempotency_key) = ''
    or p_now is null
    or not pg_catalog.isfinite(p_now)
  then
    raise exception 'promotion_command_invalid' using errcode = 'AI106';
  end if;

  canonical_input := pg_catalog.jsonb_build_object(
    'version', 1,
    'operation', 'reconcile_evidence',
    'candidateId', p_candidate_id,
    'reviewerUserId', p_reviewer_user_id,
    'expectedCandidateVersion', p_expected_candidate_version
  );
  canonical_input_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(canonical_input::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_reviewer_user_id::text || ':' ||
      pg_catalog.char_length(p_idempotency_key)::text || ':' ||
      p_idempotency_key,
      0
    )
  );

  select receipt.* into receipt_record
  from public.promotion_commands as receipt
  where receipt.reviewer_user_id = p_reviewer_user_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if receipt_record.input_hash <> canonical_input_hash then
      raise exception 'promotion_idempotency_conflict' using errcode = 'AI104';
    end if;

    return query select
      receipt_record.id,
      receipt_record.candidate_id,
      receipt_record.resulting_candidate_version,
      receipt_record.decision_id,
      receipt_record.outcome,
      receipt_record.signal_id,
      receipt_record.evidence_id,
      true;
    return;
  end if;

  if not exists (
    select 1 from public.user_roles as role_grant
    where role_grant.user_id = p_reviewer_user_id
      and role_grant.role in ('reviewer', 'senior_reviewer', 'security_reviewer', 'admin')
      and role_grant.revoked_at is null
  ) then
    raise exception 'promotion_reviewer_not_authorized' using errcode = 'AI105';
  end if;

  select candidate.* into candidate_record
  from public.extraction_candidates as candidate
  where candidate.id = p_candidate_id
  for update;

  if not found then
    raise exception 'promotion_candidate_not_found' using errcode = 'AI101';
  end if;

  if candidate_record.version <> p_expected_candidate_version then
    raise exception 'promotion_version_conflict' using errcode = 'AI103';
  end if;

  if candidate_record.status <> 'promoted'
    or candidate_record.signal_id is null
    or exists (
      select 1 from public.signal_evidence_links as evidence_link
      where evidence_link.signal_id = candidate_record.signal_id
    )
  then
    raise exception 'promotion_candidate_not_reviewable' using errcode = 'AI102';
  end if;

  next_version := candidate_record.version + 1;
  occurred_at_text := pg_catalog.to_char(
    p_now at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  if pg_catalog.jsonb_typeof(candidate_record.payload -> 'evidenceQuote') = 'string'
    and pg_catalog.char_length(candidate_record.payload ->> 'evidenceQuote') between 10 and 500
  then
    stored_quote := candidate_record.payload ->> 'evidenceQuote';
    normalized_quote := public.normalize_evidence_text_v1(stored_quote);
  end if;

  if normalized_quote is not null
    and pg_catalog.char_length(normalized_quote) between 10 and 500
  then
    select discovered.* into discovered_record
    from public.discovered_items as discovered
    where discovered.id = candidate_record.discovered_item_id;

    if not found
      or discovered_record.project_id <> candidate_record.project_id
      or discovered_record.source_id <> candidate_record.source_id
    then
      source_identity_matches := false;
    elsif candidate_record.raw_item_id is not null then
      resolved_source_field := 'article_raw_text';
      select raw_item.* into raw_record
      from public.raw_items as raw_item
      where raw_item.id = candidate_record.raw_item_id;
      if not found
        or raw_record.project_id <> candidate_record.project_id
        or raw_record.source_id <> candidate_record.source_id
      then
        source_identity_matches := false;
      else
        resolved_raw_item_id := raw_record.id;
        normalized_source := public.normalize_evidence_text_v1(raw_record.raw_text);
      end if;
    else
      resolved_source_field := 'discovered_summary';
      select raw_item.* into raw_record
      from public.raw_items as raw_item
      where raw_item.id = discovered_record.feed_raw_item_id;
      if not found
        or raw_record.project_id <> candidate_record.project_id
        or raw_record.source_id <> candidate_record.source_id
        or discovered_record.summary is null
      then
        source_identity_matches := false;
      else
        resolved_raw_item_id := raw_record.id;
        normalized_source := public.normalize_evidence_text_v1(discovered_record.summary);
      end if;
    end if;

    grounding_matches := source_identity_matches
      and pg_catalog.strpos(normalized_source, normalized_quote) > 0;
  end if;

  if grounding_matches then
    insert into public.evidence (
      source_id, raw_item_id, discovered_item_id, source_field, quote_text,
      normalized_quote_sha256, verified_at, created_at
    ) values (
      candidate_record.source_id, resolved_raw_item_id,
      candidate_record.discovered_item_id, resolved_source_field,
      normalized_quote, public.evidence_quote_sha256_v1(stored_quote), p_now, p_now
    )
    on conflict do nothing
    returning id into resolved_evidence_id;

    if resolved_evidence_id is null then
      select evidence_record.id into strict resolved_evidence_id
      from public.evidence as evidence_record
      where evidence_record.raw_item_id = resolved_raw_item_id
        and evidence_record.discovered_item_id is not distinct from candidate_record.discovered_item_id
        and evidence_record.source_field = resolved_source_field
        and evidence_record.normalized_quote_sha256 = public.evidence_quote_sha256_v1(stored_quote);
    end if;

    insert into public.signal_evidence_links (signal_id, evidence_id, created_at)
    values (candidate_record.signal_id, resolved_evidence_id, p_now);

    insert into public.candidate_review_decisions (
      id, candidate_id, candidate_version, reviewer_user_id, decision,
      reason_code, evidence_id, signal_id, created_at
    ) values (
      new_decision_id, candidate_record.id, next_version, p_reviewer_user_id,
      'approve', 'evidence_verified', resolved_evidence_id,
      candidate_record.signal_id, p_now
    );

    insert into public.promotion_events (
      candidate_id, signal_id, actor, review_decision_id, reviewer_user_id,
      created_at
    ) values (
      candidate_record.id, candidate_record.signal_id,
      'user:' || p_reviewer_user_id::text, new_decision_id,
      p_reviewer_user_id, p_now
    );

    update public.extraction_candidates
    set review_status = 'decided', version = next_version
    where id = candidate_record.id;

    result_outcome := 'promoted';
  else
    insert into public.candidate_review_decisions (
      id, candidate_id, candidate_version, reviewer_user_id, decision,
      reason_code, created_at
    ) values (
      new_decision_id, candidate_record.id, next_version, p_reviewer_user_id,
      'needs_review', 'historical_reconciliation_failed', p_now
    );

    update public.extraction_candidates
    set review_status = 'needs_review', version = next_version
    where id = candidate_record.id;

    result_outcome := 'needs_review';
  end if;

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version, event_type,
    payload, occurred_at, created_at
  ) values (
    'extraction_candidate', candidate_record.id, next_version,
    'intelligence.candidate.reviewed.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'intelligence.candidate.reviewed.v1',
      'candidateId', candidate_record.id,
      'candidateVersion', next_version,
      'decisionId', new_decision_id,
      'outcome', result_outcome,
      'occurredAt', occurred_at_text
    ),
    p_now,
    p_now
  );

  insert into public.promotion_commands (
    id, reviewer_user_id, candidate_id, idempotency_key, input_hash,
    expected_candidate_version, resulting_candidate_version, decision_id,
    outcome, signal_id, evidence_id, created_at
  ) values (
    new_command_id, p_reviewer_user_id, candidate_record.id, p_idempotency_key,
    canonical_input_hash, p_expected_candidate_version, next_version,
    new_decision_id, result_outcome,
    case when result_outcome = 'promoted' then candidate_record.signal_id else null end,
    resolved_evidence_id, p_now
  );

  return query select
    new_command_id,
    candidate_record.id,
    next_version,
    new_decision_id,
    result_outcome,
    case when result_outcome = 'promoted' then candidate_record.signal_id else null end,
    resolved_evidence_id,
    false;
end;
$$;

alter function public.reconcile_extraction_candidate_evidence(
  uuid, uuid, bigint, text, timestamptz
) owner to postgres;

revoke all on function public.normalize_evidence_text_v1(text)
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker;
revoke all on function public.evidence_quote_sha256_v1(text)
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker;
revoke all on function public.execute_extraction_candidate_review(
  uuid, jsonb, text, text, timestamptz
) from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker;
revoke all on function public.reconcile_extraction_candidate_evidence(
  uuid, uuid, bigint, text, timestamptz
) from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker;

grant usage on schema public to promotion_service;
grant execute on function public.execute_extraction_candidate_review(
  uuid, jsonb, text, text, timestamptz
) to promotion_service;
grant execute on function public.reconcile_extraction_candidate_evidence(
  uuid, uuid, bigint, text, timestamptz
) to promotion_service;
