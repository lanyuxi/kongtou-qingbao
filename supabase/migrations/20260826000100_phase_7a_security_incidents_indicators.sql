-- Phase 7A security ledger.  This is intentionally forward-only: security
-- state is derived from immutable decisions rather than stored on projects or
-- sources, and all canonical writes enter through the protected commands below.

create function public.reject_security_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'security_ledger_append_only' using errcode = '55000';
end;
$function$;

alter function public.reject_security_ledger_mutation() owner to postgres;

create function public.normalize_security_indicator_value_v1(p_value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $function$
  select public.normalize_evidence_text_v1(p_value);
$function$;

alter function public.normalize_security_indicator_value_v1(text) owner to postgres;

create function public.security_indicator_value_sha256_v1(p_value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public, extensions
as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(public.normalize_security_indicator_value_v1(p_value), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$function$;

alter function public.security_indicator_value_sha256_v1(text) owner to postgres;

create table public.security_indicator_candidates (
  id uuid primary key default extensions.gen_random_uuid(),
  origin text not null,
  extraction_candidate_id uuid null
    constraint security_indicator_candidates_extraction_candidate_fkey
    references public.extraction_candidates (id) on delete restrict,
  submitted_by_user_id uuid null
    constraint security_indicator_candidates_submitted_by_user_fkey
    references public.profiles (id) on delete restrict,
  project_id uuid not null
    constraint security_indicator_candidates_project_fkey
    references public.projects (id) on delete restrict,
  source_id uuid not null
    constraint security_indicator_candidates_source_fkey
    references public.sources (id) on delete restrict,
  manual_evidence_id uuid null
    constraint security_indicator_candidates_manual_evidence_fkey
    references public.evidence (id) on delete restrict,
  payload jsonb not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint security_indicator_candidates_origin_valid check (
    origin in ('extraction', 'reviewer_manual')
  ),
  constraint security_indicator_candidates_extraction_candidate_key unique (
    extraction_candidate_id
  ),
  constraint security_indicator_candidates_payload_object check (
    pg_catalog.jsonb_typeof(payload) = 'object'
  ),
  constraint security_indicator_candidates_origin_shape check (
    (
      origin = 'extraction'
      and extraction_candidate_id is not null
      and submitted_by_user_id is null
      and manual_evidence_id is null
    )
    or (
      origin = 'reviewer_manual'
      and extraction_candidate_id is null
      and submitted_by_user_id is not null
      and manual_evidence_id is not null
    )
  )
);

create index security_indicator_candidates_created_idx
on public.security_indicator_candidates (created_at desc, id desc);
create index security_indicator_candidates_context_idx
on public.security_indicator_candidates (project_id, source_id, created_at desc, id desc);

create table public.security_indicators (
  id uuid primary key default extensions.gen_random_uuid(),
  indicator_type text not null,
  value_text text not null,
  normalized_value_sha256 text not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint security_indicators_type_valid check (
    indicator_type in (
      'domain', 'url', 'contract_address', 'transaction_hash',
      'social_account', 'observed_behavior'
    )
  ),
  constraint security_indicators_value_valid check (
    value_text = public.normalize_security_indicator_value_v1(value_text)
    and pg_catalog.char_length(value_text) between 1 and 500
    and value_text !~ '[[:cntrl:]]'
    and (
      indicator_type <> 'domain'
      or (
        pg_catalog.char_length(value_text) <= 253
        and value_text !~ '[[:space:]]'
      )
    )
    and (
      indicator_type <> 'url'
      or value_text ~ '^https?://[^[:space:][:cntrl:]]+$'
    )
  ),
  constraint security_indicators_normalized_hash_valid check (
    normalized_value_sha256 = public.security_indicator_value_sha256_v1(value_text)
    and normalized_value_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint security_indicators_type_normalized_key unique (
    indicator_type, normalized_value_sha256
  )
);

create table public.security_indicator_evidence_links (
  indicator_id uuid not null
    constraint security_indicator_evidence_links_indicator_fkey
    references public.security_indicators (id) on delete restrict,
  evidence_id uuid not null
    constraint security_indicator_evidence_links_evidence_fkey
    references public.evidence (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint security_indicator_evidence_links_pkey primary key (indicator_id, evidence_id)
);

create index security_indicator_evidence_links_evidence_idx
on public.security_indicator_evidence_links (evidence_id, indicator_id);

create table public.security_incidents (
  id uuid primary key default extensions.gen_random_uuid(),
  target_type text not null,
  project_id uuid null
    constraint security_incidents_project_fkey
    references public.projects (id) on delete restrict,
  source_id uuid null
    constraint security_incidents_source_fkey
    references public.sources (id) on delete restrict,
  category text not null,
  opened_at timestamptz not null default pg_catalog.transaction_timestamp(),
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint security_incidents_target_type_valid check (
    target_type in ('project', 'source')
  ),
  constraint security_incidents_target_shape check (
    (target_type = 'project' and project_id is not null and source_id is null)
    or (target_type = 'source' and source_id is not null and project_id is null)
  ),
  constraint security_incidents_category_valid check (
    category in (
      'phishing', 'impersonation', 'malicious_contract', 'source_compromise',
      'fraudulent_claim', 'fund_loss', 'other_security_risk'
    )
  )
);

create index security_incidents_target_created_idx
on public.security_incidents (target_type, project_id, source_id, created_at desc, id desc);

create table public.security_candidate_review_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  candidate_id uuid not null
    constraint security_candidate_review_decisions_candidate_fkey
    references public.security_indicator_candidates (id) on delete restrict,
  candidate_version bigint not null,
  reviewer_user_id uuid not null
    constraint security_candidate_review_decisions_reviewer_fkey
    references public.profiles (id) on delete restrict,
  decision text not null,
  reason_code text not null,
  note text null,
  indicator_id uuid null
    constraint security_candidate_review_decisions_indicator_fkey
    references public.security_indicators (id) on delete restrict,
  incident_id uuid null
    constraint security_candidate_review_decisions_incident_fkey
    references public.security_incidents (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint security_candidate_review_decisions_version_positive check (candidate_version > 1),
  constraint security_candidate_review_decisions_candidate_version_key unique (
    candidate_id, candidate_version
  ),
  constraint security_candidate_review_decisions_decision_valid check (
    decision in ('needs_review', 'reject', 'accept_and_open', 'accept_and_attach')
  ),
  constraint security_candidate_review_decisions_reason_valid check (
    reason_code in (
      'evidence_verified', 'claim_not_supported', 'source_mismatch',
      'duplicate_candidate', 'wrong_scope', 'grounding_failed',
      'insufficient_context'
    )
  ),
  constraint security_candidate_review_decisions_note_valid check (
    note is null
    or (
      note = pg_catalog.btrim(note)
      and pg_catalog.char_length(note) between 1 and 1000
    )
  ),
  constraint security_candidate_review_decisions_shape check (
    (
      decision in ('accept_and_open', 'accept_and_attach')
      and reason_code = 'evidence_verified'
      and indicator_id is not null
      and incident_id is not null
    )
    or (
      decision = 'reject'
      and reason_code in ('claim_not_supported', 'source_mismatch', 'duplicate_candidate', 'wrong_scope')
      and indicator_id is null
      and incident_id is null
    )
    or (
      decision = 'needs_review'
      and reason_code in ('source_mismatch', 'grounding_failed', 'insufficient_context', 'wrong_scope')
      and indicator_id is null
      and incident_id is null
    )
  )
);

create index security_candidate_review_decisions_latest_idx
on public.security_candidate_review_decisions (candidate_id, candidate_version desc, id desc);

create table public.security_incident_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  incident_id uuid not null
    constraint security_incident_decisions_incident_fkey
    references public.security_incidents (id) on delete restrict,
  incident_version bigint not null,
  reviewer_user_id uuid not null
    constraint security_incident_decisions_reviewer_fkey
    references public.profiles (id) on delete restrict,
  action text not null,
  reason_code text not null,
  resulting_posture text null,
  resulting_severity text not null,
  public_summary text not null,
  note text null,
  evidence_id uuid not null
    constraint security_incident_decisions_evidence_fkey
    references public.evidence (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint security_incident_decisions_version_positive check (incident_version > 0),
  constraint security_incident_decisions_incident_version_key unique (incident_id, incident_version),
  constraint security_incident_decisions_action_valid check (
    action in ('open', 'attach_indicator', 'adjust', 'resolve', 'reopen')
  ),
  constraint security_incident_decisions_reason_valid check (
    reason_code in (
      'precautionary_evidence', 'active_exploitation', 'evidence_escalated',
      'evidence_deescalated', 'mitigation_verified', 'scope_corrected',
      'additional_evidence', 'false_positive_verified'
    )
  ),
  constraint security_incident_decisions_posture_valid check (
    resulting_posture is null or resulting_posture in ('caution', 'blocked')
  ),
  constraint security_incident_decisions_severity_valid check (
    resulting_severity in ('low', 'medium', 'high', 'critical')
  ),
  constraint security_incident_decisions_summary_valid check (
    public_summary = pg_catalog.btrim(public_summary)
    and pg_catalog.char_length(public_summary) between 20 and 500
  ),
  constraint security_incident_decisions_note_valid check (
    note is null
    or (
      note = pg_catalog.btrim(note)
      and pg_catalog.char_length(note) between 1 and 1000
    )
  ),
  constraint security_incident_decisions_action_shape check (
    (
      action in ('open', 'reopen')
      and resulting_posture in ('caution', 'blocked')
      and reason_code in ('precautionary_evidence', 'active_exploitation')
    )
    or (
      action = 'attach_indicator'
      and resulting_posture in ('caution', 'blocked')
      and reason_code = 'additional_evidence'
    )
    or (
      action = 'adjust'
      and resulting_posture in ('caution', 'blocked')
      and reason_code in (
        'evidence_escalated', 'active_exploitation', 'evidence_deescalated',
        'mitigation_verified', 'scope_corrected', 'additional_evidence'
      )
    )
    or (
      action = 'resolve'
      and resulting_posture is null
      and reason_code in ('mitigation_verified', 'false_positive_verified', 'scope_corrected')
    )
  ),
  constraint security_incident_decisions_open_version check (
    (incident_version = 1 and action = 'open')
    or (incident_version > 1 and action <> 'open')
  )
);

create index security_incident_decisions_latest_idx
on public.security_incident_decisions (incident_id, incident_version desc, id desc);

create table public.security_incident_indicator_links (
  incident_id uuid not null
    constraint security_incident_indicator_links_incident_fkey
    references public.security_incidents (id) on delete restrict,
  indicator_id uuid not null
    constraint security_incident_indicator_links_indicator_fkey
    references public.security_indicators (id) on delete restrict,
  linked_by_decision_id uuid not null
    constraint security_incident_indicator_links_decision_fkey
    references public.security_incident_decisions (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint security_incident_indicator_links_pkey primary key (incident_id, indicator_id)
);

create index security_incident_indicator_links_indicator_idx
on public.security_incident_indicator_links (indicator_id, incident_id);

create table public.security_events (
  id uuid primary key default extensions.gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version bigint not null,
  candidate_id uuid null
    constraint security_events_candidate_fkey
    references public.security_indicator_candidates (id) on delete restrict,
  indicator_id uuid null
    constraint security_events_indicator_fkey
    references public.security_indicators (id) on delete restrict,
  incident_id uuid null
    constraint security_events_incident_fkey
    references public.security_incidents (id) on delete restrict,
  decision_id uuid null,
  actor_kind text not null,
  actor_user_id uuid null
    constraint security_events_actor_user_fkey
    references public.profiles (id) on delete restrict,
  actor_service_name text null,
  indicator_public_safe boolean null,
  payload jsonb not null,
  occurred_at timestamptz not null default pg_catalog.transaction_timestamp(),
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint security_events_event_type_valid check (
    event_type in (
      'candidate_submitted', 'candidate_reviewed', 'indicator_accepted',
      'incident_opened', 'incident_changed', 'indicator_disclosure_changed'
    )
  ),
  constraint security_events_aggregate_type_valid check (
    aggregate_type in ('candidate', 'indicator', 'incident')
  ),
  constraint security_events_aggregate_version_positive check (aggregate_version > 0),
  constraint security_events_aggregate_version_key unique (
    aggregate_type, aggregate_id, aggregate_version
  ),
  constraint security_events_actor_kind_valid check (
    actor_kind in ('reviewer', 'ai_stage_worker', 'system')
  ),
  constraint security_events_actor_shape check (
    (actor_kind = 'reviewer' and actor_user_id is not null and actor_service_name is null)
    or (
      actor_kind in ('ai_stage_worker', 'system')
      and actor_user_id is null
      and actor_service_name is not null
      and actor_service_name = pg_catalog.btrim(actor_service_name)
      and pg_catalog.char_length(actor_service_name) between 1 and 120
    )
  ),
  constraint security_events_disclosure_shape check (
    (event_type = 'indicator_disclosure_changed' and indicator_id is not null and indicator_public_safe is not null)
    or (event_type <> 'indicator_disclosure_changed' and indicator_public_safe is null)
  ),
  constraint security_events_object_shape check (
    (event_type = 'candidate_submitted'
      and aggregate_type = 'candidate' and candidate_id = aggregate_id
      and indicator_id is null and incident_id is null and decision_id is null)
    or (event_type = 'candidate_reviewed'
      and aggregate_type = 'candidate' and candidate_id = aggregate_id
      and decision_id is not null
      and ((indicator_id is null and incident_id is null)
        or (indicator_id is not null and incident_id is not null)))
    or (event_type = 'indicator_accepted'
      and aggregate_type = 'indicator' and indicator_id = aggregate_id
      and candidate_id is null and incident_id is null and decision_id is null)
    or (event_type = 'incident_opened'
      and aggregate_type = 'incident' and incident_id = aggregate_id
      and candidate_id is null and indicator_id is not null and decision_id is not null)
    or (event_type = 'incident_changed'
      and aggregate_type = 'incident' and incident_id = aggregate_id
      and candidate_id is null and decision_id is not null)
    or (event_type = 'indicator_disclosure_changed'
      and aggregate_type = 'indicator' and indicator_id = aggregate_id
      and candidate_id is null and incident_id is null and decision_id is null)
  ),
  constraint security_events_payload_identity check (
    payload ->> 'version' = '1'
    and payload ->> 'eventType' = 'security.' ||
      case event_type
        when 'candidate_submitted' then 'candidate.submitted.v1'
        when 'candidate_reviewed' then 'candidate.reviewed.v1'
        when 'indicator_accepted' then 'indicator.accepted.v1'
        when 'incident_opened' then 'incident.opened.v1'
        when 'incident_changed' then 'incident.changed.v1'
        when 'indicator_disclosure_changed' then 'indicator.disclosure_changed.v1'
      end
    and (candidate_id is null or payload ->> 'candidateId' = candidate_id::text)
    and (indicator_id is null or payload ->> 'indicatorId' = indicator_id::text)
    and (incident_id is null or payload ->> 'incidentId' = incident_id::text)
    and (decision_id is null or payload ->> 'decisionId' = decision_id::text)
  ),
  constraint security_events_payload_object check (
    pg_catalog.jsonb_typeof(payload) = 'object'
  )
);

create index security_events_candidate_created_idx
on public.security_events (candidate_id, created_at desc, id desc)
where candidate_id is not null;
create index security_events_indicator_created_idx
on public.security_events (indicator_id, created_at desc, id desc)
where indicator_id is not null;
create index security_events_incident_created_idx
on public.security_events (incident_id, created_at desc, id desc)
where incident_id is not null;

create table public.security_review_commands (
  id uuid primary key default extensions.gen_random_uuid(),
  reviewer_user_id uuid not null
    constraint security_review_commands_reviewer_fkey
    references public.profiles (id) on delete restrict,
  operation text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  idempotency_key text not null,
  input_hash text not null,
  expected_candidate_version bigint null,
  resulting_candidate_version bigint null,
  expected_incident_version bigint null,
  resulting_incident_version bigint null,
  expected_indicator_version bigint null,
  resulting_indicator_version bigint null,
  decision_id uuid null,
  indicator_id uuid null
    constraint security_review_commands_indicator_fkey
    references public.security_indicators (id) on delete restrict,
  incident_id uuid null
    constraint security_review_commands_incident_fkey
    references public.security_incidents (id) on delete restrict,
  result_payload jsonb not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint security_review_commands_reviewer_key unique (reviewer_user_id, idempotency_key),
  constraint security_review_commands_operation_valid check (
    operation in (
      'submit_manual_candidate', 'review_candidate', 'open_incident',
      'incident_command', 'set_indicator_disclosure'
    )
  ),
  constraint security_review_commands_aggregate_type_valid check (
    aggregate_type in ('candidate', 'indicator', 'incident')
  ),
  constraint security_review_commands_idempotency_key_valid check (
    idempotency_key = pg_catalog.btrim(idempotency_key)
    and pg_catalog.char_length(idempotency_key) between 1 and 255
  ),
  constraint security_review_commands_input_hash_valid check (
    input_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint security_review_commands_versions_positive check (
    (expected_candidate_version is null or expected_candidate_version > 0)
    and (resulting_candidate_version is null or resulting_candidate_version > 0)
    and (expected_incident_version is null or expected_incident_version > 0)
    and (resulting_incident_version is null or resulting_incident_version > 0)
    and (expected_indicator_version is null or expected_indicator_version > 0)
    and (resulting_indicator_version is null or resulting_indicator_version > 0)
  ),
  constraint security_review_commands_operation_shape check (
    (operation = 'submit_manual_candidate'
      and aggregate_type = 'candidate'
      and expected_candidate_version is null and resulting_candidate_version = 1
      and expected_incident_version is null and resulting_incident_version is null
      and expected_indicator_version is null and resulting_indicator_version is null
      and decision_id is null and indicator_id is null and incident_id is null)
    or (operation = 'review_candidate'
      and aggregate_type = 'candidate'
      and expected_candidate_version is not null
      and resulting_candidate_version = expected_candidate_version + 1
      and expected_indicator_version is null and resulting_indicator_version is null
      and decision_id is not null
      and ((expected_incident_version is null and resulting_incident_version is null
          and indicator_id is null and incident_id is null)
        or (expected_incident_version is null and resulting_incident_version = 1
          and indicator_id is not null and incident_id is not null)
        or (expected_incident_version is not null
          and resulting_incident_version = expected_incident_version + 1
          and indicator_id is not null and incident_id is not null)))
    or (operation = 'open_incident'
      and aggregate_type = 'incident' and aggregate_id = incident_id
      and expected_candidate_version is null and resulting_candidate_version is null
      and expected_incident_version is null and resulting_incident_version = 1
      and expected_indicator_version is null and resulting_indicator_version is null
      and decision_id is not null and indicator_id is not null)
    or (operation = 'incident_command'
      and aggregate_type = 'incident' and aggregate_id = incident_id
      and expected_candidate_version is null and resulting_candidate_version is null
      and expected_incident_version is not null
      and resulting_incident_version = expected_incident_version + 1
      and expected_indicator_version is null and resulting_indicator_version is null
      and decision_id is not null)
    or (operation = 'set_indicator_disclosure'
      and aggregate_type = 'indicator' and aggregate_id = indicator_id
      and expected_candidate_version is null and resulting_candidate_version is null
      and expected_incident_version is null and resulting_incident_version is null
      and expected_indicator_version is not null
      and resulting_indicator_version = expected_indicator_version + 1
      and decision_id is null and incident_id is null)
  ),
  constraint security_review_commands_result_payload_object check (
    pg_catalog.jsonb_typeof(result_payload) = 'object'
  )
);

create index security_review_commands_aggregate_created_idx
on public.security_review_commands (aggregate_type, aggregate_id, created_at desc, id desc);

alter table public.security_indicator_candidates enable row level security;
alter table public.security_candidate_review_decisions enable row level security;
alter table public.security_indicators enable row level security;
alter table public.security_indicator_evidence_links enable row level security;
alter table public.security_incidents enable row level security;
alter table public.security_incident_indicator_links enable row level security;
alter table public.security_incident_decisions enable row level security;
alter table public.security_events enable row level security;
alter table public.security_review_commands enable row level security;

alter table public.security_indicator_candidates force row level security;
alter table public.security_candidate_review_decisions force row level security;
alter table public.security_indicators force row level security;
alter table public.security_indicator_evidence_links force row level security;
alter table public.security_incidents force row level security;
alter table public.security_incident_indicator_links force row level security;
alter table public.security_incident_decisions force row level security;
alter table public.security_events force row level security;
alter table public.security_review_commands force row level security;

revoke all on table public.security_indicator_candidates,
  public.security_candidate_review_decisions,
  public.security_indicators,
  public.security_indicator_evidence_links,
  public.security_incidents,
  public.security_incident_indicator_links,
  public.security_incident_decisions,
  public.security_events,
  public.security_review_commands
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;

create trigger security_indicator_candidates_reject_mutation
before update or delete on public.security_indicator_candidates
for each row execute function public.reject_security_ledger_mutation();
create trigger security_candidate_review_decisions_reject_mutation
before update or delete on public.security_candidate_review_decisions
for each row execute function public.reject_security_ledger_mutation();
create trigger security_indicators_reject_mutation
before update or delete on public.security_indicators
for each row execute function public.reject_security_ledger_mutation();
create trigger security_indicator_evidence_links_reject_mutation
before update or delete on public.security_indicator_evidence_links
for each row execute function public.reject_security_ledger_mutation();
create trigger security_incidents_reject_mutation
before update or delete on public.security_incidents
for each row execute function public.reject_security_ledger_mutation();
create trigger security_incident_indicator_links_reject_mutation
before update or delete on public.security_incident_indicator_links
for each row execute function public.reject_security_ledger_mutation();
create trigger security_incident_decisions_reject_mutation
before update or delete on public.security_incident_decisions
for each row execute function public.reject_security_ledger_mutation();
create trigger security_events_reject_mutation
before update or delete on public.security_events
for each row execute function public.reject_security_ledger_mutation();
create trigger security_review_commands_reject_mutation
before update or delete on public.security_review_commands
for each row execute function public.reject_security_ledger_mutation();

create function public.actor_has_active_security_role(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select exists (
    select 1
    from public.user_roles as role_grant
    where role_grant.user_id = p_user_id
      and role_grant.role in ('security_reviewer', 'admin')
      and role_grant.revoked_at is null
  );
$function$;

alter function public.actor_has_active_security_role(uuid) owner to postgres;

create function public.security_target_lock_key_v1(p_target_type text, p_target_id uuid)
returns bigint
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select pg_catalog.hashtextextended(p_target_type || ':' || p_target_id::text, 0);
$function$;

alter function public.security_target_lock_key_v1(text, uuid) owner to postgres;

create function public.current_security_target_posture(p_target_type text, p_target_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select case coalesce(max(case latest.resulting_posture
    when 'blocked' then 2 when 'caution' then 1 else 0 end), 0)
    when 2 then 'blocked' when 1 then 'caution' else 'clear' end
  from public.security_incidents as incident
  join lateral (
    select decision.resulting_posture
    from public.security_incident_decisions as decision
    where decision.incident_id = incident.id
    order by decision.incident_version desc
    limit 1
  ) as latest on latest.resulting_posture is not null
  where incident.target_type = p_target_type
    and coalesce(incident.project_id, incident.source_id) = p_target_id;
$function$;

alter function public.current_security_target_posture(text, uuid) owner to postgres;

revoke all on function public.reject_security_ledger_mutation() from public;
revoke all on function public.normalize_security_indicator_value_v1(text) from public;
revoke all on function public.security_indicator_value_sha256_v1(text) from public;
revoke all on function public.actor_has_active_security_role(uuid) from public;
revoke all on function public.security_target_lock_key_v1(text, uuid) from public;
revoke all on function public.current_security_target_posture(text, uuid) from public;

grant execute on function public.current_security_target_posture(text, uuid)
to promotion_service, collection_worker, collection_queue_worker, collection_schedule_admin,
  ai_stage_worker;
grant execute on function public.security_target_lock_key_v1(text, uuid)
to promotion_service, collection_worker, collection_queue_worker, collection_schedule_admin,
  ai_stage_worker;

-- Command parsing is deliberately kept in the database boundary. JSONB text
-- has deterministic key order, so hashing the strict payload gives a stable
-- retry identity without caller-provided timestamps or actor IDs.
create function public.security_json_has_exact_keys(p_payload jsonb, p_keys text[])
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select pg_catalog.jsonb_typeof(p_payload) = 'object'
    and p_payload ?& p_keys
    and not exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as payload_key(key)
      where payload_key.key <> all (p_keys)
    );
$function$;

create function public.security_json_uuid_is_valid(p_payload jsonb, p_key text)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select pg_catalog.jsonb_typeof(p_payload -> p_key) = 'string'
    and p_payload ->> p_key ~
      '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$';
$function$;

create function public.security_json_positive_bigint_is_valid(p_payload jsonb, p_key text)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select pg_catalog.jsonb_typeof(p_payload -> p_key) = 'number'
    and p_payload ->> p_key ~ '^[1-9][0-9]*$'
    and (p_payload ->> p_key)::numeric <= 9223372036854775807;
$function$;

create function public.security_command_input_hash_v1(p_payload jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $function$
  select pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
$function$;

create function public.security_evidence_matches_target(
  p_evidence_id uuid,
  p_target_type text,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select exists (
    select 1
    from public.evidence as evidence_record
    join public.raw_items as raw_item
      on raw_item.id = evidence_record.raw_item_id
    where evidence_record.id = p_evidence_id
      and raw_item.source_id = evidence_record.source_id
      and (
        (p_target_type = 'project' and raw_item.project_id = p_target_id)
        or (p_target_type = 'source' and evidence_record.source_id = p_target_id)
      )
  );
$function$;

create function public.security_indicator_is_grounded(
  p_indicator_type text,
  p_value_text text,
  p_evidence_id uuid,
  p_target_type text,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select p_indicator_type in (
      'domain', 'url', 'contract_address', 'transaction_hash',
      'social_account', 'observed_behavior'
    )
    and p_value_text = public.normalize_security_indicator_value_v1(p_value_text)
    and pg_catalog.char_length(p_value_text) between 1 and 500
    and p_value_text !~ '[[:cntrl:]]'
    and (
      p_indicator_type <> 'domain'
      or (
        pg_catalog.char_length(p_value_text) <= 253
        and p_value_text !~ '[[:space:]]'
      )
    )
    and (
      p_indicator_type <> 'url'
      or p_value_text ~ '^https?://[^[:space:][:cntrl:]]+$'
    )
    and public.security_evidence_matches_target(p_evidence_id, p_target_type, p_target_id)
    and exists (
      select 1
      from public.evidence as evidence_record
      where evidence_record.id = p_evidence_id
        and pg_catalog.strpos(
          public.normalize_evidence_text_v1(evidence_record.quote_text),
          public.normalize_security_indicator_value_v1(p_value_text)
        ) > 0
    );
$function$;

create function public.security_current_candidate_state(p_candidate_id uuid)
returns table (
  state text,
  state_version bigint,
  decision_id uuid,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select
    case latest.decision
      when 'needs_review' then 'needs_review'
      when 'reject' then 'rejected'
      when 'accept_and_open' then 'accepted'
      when 'accept_and_attach' then 'accepted'
      else 'pending'
    end,
    coalesce(latest.candidate_version, 1),
    latest.id,
    latest.created_at
  from (values (p_candidate_id)) as requested(candidate_id)
  left join lateral (
    select decision.*
    from public.security_candidate_review_decisions as decision
    where decision.candidate_id = requested.candidate_id
    order by decision.candidate_version desc, decision.id desc
    limit 1
  ) as latest on true;
$function$;

create function public.security_current_incident_decision(p_incident_id uuid)
returns table (
  decision_id uuid,
  incident_version bigint,
  action text,
  resulting_posture text,
  resulting_severity text,
  public_summary text,
  evidence_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select
    decision.id,
    decision.incident_version,
    decision.action,
    decision.resulting_posture,
    decision.resulting_severity,
    decision.public_summary,
    decision.evidence_id,
    decision.created_at
  from public.security_incident_decisions as decision
  where decision.incident_id = p_incident_id
  order by decision.incident_version desc, decision.id desc
  limit 1;
$function$;

alter function public.security_json_has_exact_keys(jsonb, text[]) owner to postgres;
alter function public.security_json_uuid_is_valid(jsonb, text) owner to postgres;
alter function public.security_json_positive_bigint_is_valid(jsonb, text) owner to postgres;
alter function public.security_command_input_hash_v1(jsonb) owner to postgres;
alter function public.security_evidence_matches_target(uuid, text, uuid) owner to postgres;
alter function public.security_indicator_is_grounded(text, text, uuid, text, uuid) owner to postgres;
alter function public.security_current_candidate_state(uuid) owner to postgres;
alter function public.security_current_incident_decision(uuid) owner to postgres;

revoke all on function public.security_json_has_exact_keys(jsonb, text[]) from public;
revoke all on function public.security_json_uuid_is_valid(jsonb, text) from public;
revoke all on function public.security_json_positive_bigint_is_valid(jsonb, text) from public;
revoke all on function public.security_command_input_hash_v1(jsonb) from public;
revoke all on function public.security_evidence_matches_target(uuid, text, uuid) from public;
revoke all on function public.security_indicator_is_grounded(text, text, uuid, text, uuid) from public;
revoke all on function public.security_current_candidate_state(uuid) from public;
revoke all on function public.security_current_incident_decision(uuid) from public;

-- Retain every pre-existing outbox contract while adding a separate strict
-- branch for the six safe security events. The explicit denial list is kept
-- in the constraint so catalog tests can guard against sensitive payload drift.
alter table public.outbox_events
  drop constraint outbox_events_event_type_valid,
  add constraint outbox_events_event_type_valid check (
    event_type in (
      'intelligence.signal.promoted.v1',
      'intelligence.candidate.reviewed.v1',
      'intelligence.ai_run.reviewed.v1',
      'security.candidate.submitted.v1',
      'security.candidate.reviewed.v1',
      'security.indicator.accepted.v1',
      'security.incident.opened.v1',
      'security.incident.changed.v1',
      'security.indicator.disclosure_changed.v1'
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
        and payload - array[
          'version', 'runId', 'reviewVersion', 'decisionId',
          'decision', 'reasonCode', 'occurredAt'
        ]::text[] = '{}'::jsonb
        and pg_catalog.jsonb_typeof(payload -> 'version') = 'number'
        and pg_catalog.jsonb_typeof(payload -> 'runId') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'reviewVersion') = 'number'
        and pg_catalog.jsonb_typeof(payload -> 'decisionId') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'decision') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'reasonCode') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'occurredAt') = 'string'
      )
      or (
        event_type in (
          'security.candidate.submitted.v1',
          'security.candidate.reviewed.v1',
          'security.indicator.accepted.v1',
          'security.incident.opened.v1',
          'security.incident.changed.v1',
          'security.indicator.disclosure_changed.v1'
        )
        and not (payload ?| array[
          'reviewerUserId', 'note', 'locator', 'quote', 'payload', 'indicatorValue',
          'evidenceId', 'rawItemId', 'rawItem', 'candidatePayload', 'internalNote'
        ])
        and payload ?& array[
          'version', 'eventType', 'aggregateId', 'aggregateVersion',
          'target', 'occurredAt'
        ]
        and pg_catalog.jsonb_typeof(payload -> 'version') = 'number'
        and pg_catalog.jsonb_typeof(payload -> 'eventType') = 'string'
        and payload ->> 'eventType' = event_type
        and pg_catalog.jsonb_typeof(payload -> 'aggregateId') = 'string'
        and payload ->> 'aggregateId' ~
          '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
        and pg_catalog.jsonb_typeof(payload -> 'aggregateVersion') = 'number'
        and payload ->> 'aggregateVersion' ~ '^[1-9][0-9]*$'
        and pg_catalog.jsonb_typeof(payload -> 'target') = 'object'
        and payload -> 'target' ?& array['type', 'id']
        and (payload -> 'target') - array['type', 'id']::text[] = '{}'::jsonb
        and pg_catalog.jsonb_typeof(payload -> 'target' -> 'type') = 'string'
        and payload -> 'target' ->> 'type' in ('project', 'source')
        and pg_catalog.jsonb_typeof(payload -> 'target' -> 'id') = 'string'
        and payload -> 'target' ->> 'id' ~
          '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
        and pg_catalog.jsonb_typeof(payload -> 'occurredAt') = 'string'
        and payload ->> 'occurredAt' ~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
        and (not payload ? 'candidateId' or (
          pg_catalog.jsonb_typeof(payload -> 'candidateId') = 'string'
          and payload ->> 'candidateId' ~
            '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'))
        and (not payload ? 'decisionId' or (
          pg_catalog.jsonb_typeof(payload -> 'decisionId') = 'string'
          and payload ->> 'decisionId' ~
            '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'))
        and (not payload ? 'indicatorId' or (
          pg_catalog.jsonb_typeof(payload -> 'indicatorId') = 'string'
          and payload ->> 'indicatorId' ~
            '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'))
        and (not payload ? 'incidentId' or (
          pg_catalog.jsonb_typeof(payload -> 'incidentId') = 'string'
          and payload ->> 'incidentId' ~
            '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'))
        and (
          (event_type = 'security.candidate.submitted.v1'
            and payload ?& array['candidateId']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'candidateId', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'security.candidate.reviewed.v1'
            and payload ?& array['candidateId', 'decisionId']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'candidateId', 'decisionId', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'security.indicator.accepted.v1'
            and payload ?& array['indicatorId']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'indicatorId', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'security.incident.opened.v1'
            and payload ?& array['incidentId', 'decisionId', 'resultingPosture']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'incidentId', 'decisionId', 'resultingPosture', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'security.incident.changed.v1'
            and payload ?& array['incidentId', 'decisionId', 'resultingPosture']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'incidentId', 'decisionId', 'resultingPosture', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'security.indicator.disclosure_changed.v1'
            and payload ?& array['indicatorId']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'indicatorId', 'occurredAt'
            ]::text[] = '{}'::jsonb)
        )
      )
    )
  );

create function public.route_security_extraction_candidate(p_extraction_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  extraction_record public.extraction_candidates%rowtype;
  security_candidate_id uuid;
  target_type text;
  target_id uuid;
  candidate_summary text;
  created_at_value timestamptz := pg_catalog.transaction_timestamp();
  occurred_at_text text;
  stored_payload jsonb;
begin
  if p_extraction_candidate_id is null then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  select candidate.* into extraction_record
  from public.extraction_candidates as candidate
  where candidate.id = p_extraction_candidate_id
  for update;

  if not found then
    raise exception 'security_candidate_not_found' using errcode = 'AS101';
  end if;

  if extraction_record.payload ->> 'claimType' not in ('security_risk', 'scam_indicator')
    or pg_catalog.jsonb_typeof(extraction_record.payload -> 'summary') <> 'string'
  then
    raise exception 'security_review_required' using errcode = 'AS111';
  end if;

  candidate_summary := extraction_record.payload ->> 'summary';
  if candidate_summary <> pg_catalog.btrim(candidate_summary)
    or pg_catalog.char_length(candidate_summary) not between 10 and 2000
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  -- The candidate's target stays inside the extraction context. This only
  -- routes AI output to a candidate queue; a reviewer makes canonical state.
  if extraction_record.payload ->> 'claimType' = 'scam_indicator' then
    target_type := 'source';
    target_id := extraction_record.source_id;
  else
    target_type := 'project';
    target_id := extraction_record.project_id;
  end if;

  stored_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'extractionCandidateId', extraction_record.id,
    'projectId', extraction_record.project_id,
    'sourceId', extraction_record.source_id,
    'summary', candidate_summary,
    'targetContext', pg_catalog.jsonb_build_object(
      'projectId', extraction_record.project_id,
      'sourceId', extraction_record.source_id
    ),
    'routingTarget', pg_catalog.jsonb_build_object('type', target_type, 'id', target_id)
  );

  insert into public.security_indicator_candidates (
    origin, extraction_candidate_id, project_id, source_id, payload, created_at
  ) values (
    'extraction', extraction_record.id, extraction_record.project_id,
    extraction_record.source_id, stored_payload, created_at_value
  )
  on conflict (extraction_candidate_id) do nothing
  returning id into security_candidate_id;

  if security_candidate_id is null then
    select candidate.id into strict security_candidate_id
    from public.security_indicator_candidates as candidate
    where candidate.extraction_candidate_id = extraction_record.id;
    return security_candidate_id;
  end if;

  occurred_at_text := pg_catalog.to_char(
    created_at_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  insert into public.security_events (
    event_type, aggregate_type, aggregate_id, aggregate_version, candidate_id,
    actor_kind, actor_service_name, payload, occurred_at, created_at
  ) values (
    'candidate_submitted', 'candidate', security_candidate_id, 1, security_candidate_id,
    'ai_stage_worker', 'ai_stage_worker',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'security.candidate.submitted.v1',
      'candidateId', security_candidate_id
    ),
    created_at_value, created_at_value
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version, event_type, payload,
    occurred_at, created_at
  ) values (
    'security_candidate', security_candidate_id, 1,
    'security.candidate.submitted.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'security.candidate.submitted.v1',
      'aggregateId', security_candidate_id,
      'aggregateVersion', 1,
      'target', pg_catalog.jsonb_build_object('type', target_type, 'id', target_id),
      'candidateId', security_candidate_id,
      'occurredAt', occurred_at_text
    ),
    created_at_value, created_at_value
  );

  return security_candidate_id;
exception
  when others then
    if SQLSTATE in ('AS101', 'AS108', 'AS111') then
      raise;
    end if;
    raise exception 'security_persistence_failed' using errcode = 'AS199';
end;
$function$;

alter function public.route_security_extraction_candidate(uuid) owner to postgres;

revoke all on function public.route_security_extraction_candidate(uuid)
from public, anon, authenticated, service_role, collection_worker,
  collection_queue_worker, collection_schedule_admin, promotion_service;
grant execute on function public.route_security_extraction_candidate(uuid)
to ai_stage_worker;

create function public.submit_manual_security_candidate(
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "candidateId" uuid,
  "candidateVersion" bigint,
  state text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  requested_reviewer_id uuid;
  target_type text;
  target_id uuid;
  evidence_id_value uuid;
  evidence_project_id uuid;
  evidence_source_id uuid;
  indicator_type_value text;
  indicator_value_text text;
  candidate_summary text;
  requested_note text;
  input_hash_value text;
  receipt_record public.security_review_commands%rowtype;
  command_id_value uuid := extensions.gen_random_uuid();
  candidate_id_value uuid := extensions.gen_random_uuid();
  created_at_value timestamptz := pg_catalog.transaction_timestamp();
  occurred_at_text text;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null
    or not public.actor_has_active_security_role(requested_reviewer_id)
  then
    raise exception 'security_reviewer_required' using errcode = 'AS104';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'target', 'evidenceId', 'indicator', 'summary', 'note']
    )
    or pg_catalog.jsonb_typeof(p_command_payload -> 'version') <> 'number'
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'evidenceId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'target') <> 'object'
    or not public.security_json_has_exact_keys(p_command_payload -> 'target', array['type', 'id'])
    or pg_catalog.jsonb_typeof(p_command_payload -> 'target' -> 'type') <> 'string'
    or p_command_payload -> 'target' ->> 'type' not in ('project', 'source')
    or not public.security_json_uuid_is_valid(p_command_payload -> 'target', 'id')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'indicator') <> 'object'
    or not public.security_json_has_exact_keys(p_command_payload -> 'indicator', array['type', 'value'])
    or pg_catalog.jsonb_typeof(p_command_payload -> 'indicator' -> 'type') <> 'string'
    or p_command_payload -> 'indicator' ->> 'type' not in (
      'domain', 'url', 'contract_address', 'transaction_hash',
      'social_account', 'observed_behavior'
    )
    or pg_catalog.jsonb_typeof(p_command_payload -> 'indicator' -> 'value') <> 'string'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'summary') <> 'string'
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'string'
        and p_command_payload ->> 'note' = pg_catalog.btrim(p_command_payload ->> 'note')
        and pg_catalog.char_length(p_command_payload ->> 'note') between 1 and 1000
      )
    )
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  target_type := p_command_payload -> 'target' ->> 'type';
  target_id := (p_command_payload -> 'target' ->> 'id')::uuid;
  evidence_id_value := (p_command_payload ->> 'evidenceId')::uuid;
  indicator_type_value := p_command_payload -> 'indicator' ->> 'type';
  indicator_value_text := public.normalize_security_indicator_value_v1(
    p_command_payload -> 'indicator' ->> 'value'
  );
  candidate_summary := p_command_payload ->> 'summary';
  requested_note := p_command_payload ->> 'note';

  if indicator_value_text <> p_command_payload -> 'indicator' ->> 'value'
    or pg_catalog.char_length(indicator_value_text) not between 1 and 500
    or candidate_summary <> pg_catalog.btrim(candidate_summary)
    or pg_catalog.char_length(candidate_summary) not between 10 and 2000
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  input_hash_value := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'submit_manual_candidate', 'payload', p_command_payload)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'security-command:' || requested_reviewer_id::text || ':' ||
      pg_catalog.char_length(p_idempotency_key)::text || ':' || p_idempotency_key,
      0
    )
  );

  select receipt.* into receipt_record
  from public.security_review_commands as receipt
  where receipt.reviewer_user_id = requested_reviewer_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if receipt_record.operation <> 'submit_manual_candidate'
      or receipt_record.input_hash <> input_hash_value
    then
      raise exception 'security_idempotency_conflict' using errcode = 'AS107';
    end if;

    return query select
      1,
      receipt_record.id,
      receipt_record.aggregate_id,
      receipt_record.resulting_candidate_version,
      receipt_record.result_payload ->> 'state',
      true;
    return;
  end if;

  select raw_item.project_id, evidence_record.source_id
  into evidence_project_id, evidence_source_id
  from public.evidence as evidence_record
  join public.raw_items as raw_item
    on raw_item.id = evidence_record.raw_item_id
  where evidence_record.id = evidence_id_value
    and raw_item.source_id = evidence_record.source_id;

  if not found then
    raise exception 'security_target_mismatch' using errcode = 'AS109';
  end if;

  if (target_type = 'project' and evidence_project_id <> target_id)
    or (target_type = 'source' and evidence_source_id <> target_id)
    or not public.security_indicator_is_grounded(
      indicator_type_value, indicator_value_text, evidence_id_value, target_type, target_id
    )
  then
    raise exception 'security_target_mismatch' using errcode = 'AS109';
  end if;

  insert into public.security_indicator_candidates (
    id, origin, submitted_by_user_id, project_id, source_id, manual_evidence_id,
    payload, created_at
  ) values (
    candidate_id_value, 'reviewer_manual', requested_reviewer_id,
    evidence_project_id, evidence_source_id, evidence_id_value,
    p_command_payload, created_at_value
  );

  occurred_at_text := pg_catalog.to_char(
    created_at_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  insert into public.security_events (
    event_type, aggregate_type, aggregate_id, aggregate_version, candidate_id,
    actor_kind, actor_user_id, payload, occurred_at, created_at
  ) values (
    'candidate_submitted', 'candidate', candidate_id_value, 1, candidate_id_value,
    'reviewer', requested_reviewer_id,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'security.candidate.submitted.v1',
      'candidateId', candidate_id_value
    ),
    created_at_value, created_at_value
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version, event_type, payload,
    occurred_at, created_at
  ) values (
    'security_candidate', candidate_id_value, 1,
    'security.candidate.submitted.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'security.candidate.submitted.v1',
      'aggregateId', candidate_id_value,
      'aggregateVersion', 1,
      'target', pg_catalog.jsonb_build_object('type', target_type, 'id', target_id),
      'candidateId', candidate_id_value,
      'occurredAt', occurred_at_text
    ),
    created_at_value, created_at_value
  );

  insert into public.security_review_commands (
    id, reviewer_user_id, operation, aggregate_type, aggregate_id,
    idempotency_key, input_hash, resulting_candidate_version, result_payload,
    created_at
  ) values (
    command_id_value, requested_reviewer_id, 'submit_manual_candidate',
    'candidate', candidate_id_value, p_idempotency_key, input_hash_value, 1,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'commandId', command_id_value,
      'candidateId', candidate_id_value,
      'candidateVersion', 1,
      'state', 'pending'
    ),
    created_at_value
  );

  return query select 1, command_id_value, candidate_id_value, 1::bigint, 'pending'::text, false;
exception
  when others then
    if SQLSTATE in ('AS104', 'AS107', 'AS108', 'AS109') then
      raise;
    end if;
    raise exception 'security_persistence_failed' using errcode = 'AS199';
end;
$function$;

alter function public.submit_manual_security_candidate(jsonb, text) owner to postgres;
revoke all on function public.submit_manual_security_candidate(jsonb, text)
from public, anon, service_role, ai_stage_worker, collection_worker,
  collection_queue_worker, collection_schedule_admin, promotion_service;
grant execute on function public.submit_manual_security_candidate(jsonb, text)
to authenticated;

create function public.execute_security_candidate_review(
  p_candidate_id uuid,
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "candidateId" uuid,
  "candidateVersion" bigint,
  "decisionId" uuid,
  state text,
  "indicatorId" uuid,
  "incidentId" uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  requested_reviewer_id uuid;
  candidate_record public.security_indicator_candidates%rowtype;
  extraction_record public.extraction_candidates%rowtype;
  discovered_record public.discovered_items%rowtype;
  raw_record public.raw_items%rowtype;
  receipt_record public.security_review_commands%rowtype;
  current_candidate_state record;
  incident_record public.security_incidents%rowtype;
  current_incident record;
  requested_decision text;
  requested_reason text;
  requested_note text;
  requested_target_type text;
  requested_target_id uuid;
  requested_evidence_id uuid;
  requested_indicator_type text;
  requested_indicator_value text;
  requested_category text;
  requested_posture text;
  requested_severity text;
  requested_summary text;
  requested_incident_id uuid;
  requested_expected_incident_version bigint;
  resolved_raw_item_id uuid;
  resolved_source_field text;
  stored_quote text;
  normalized_quote text;
  normalized_source text;
  input_hash_value text;
  next_candidate_version bigint;
  next_incident_version bigint;
  candidate_decision_id uuid := extensions.gen_random_uuid();
  incident_decision_id uuid;
  command_id_value uuid := extensions.gen_random_uuid();
  indicator_id_value uuid;
  incident_id_value uuid;
  indicator_was_created boolean := false;
  grounding_failed boolean := false;
  created_at_value timestamptz := pg_catalog.transaction_timestamp();
  occurred_at_text text;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null
    or not public.actor_has_active_security_role(requested_reviewer_id)
  then
    raise exception 'security_reviewer_required' using errcode = 'AS104';
  end if;

  if p_candidate_id is null
    or p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_uuid_is_valid(p_command_payload, 'candidateId')
    or pg_catalog.lower(p_command_payload ->> 'candidateId') <> p_candidate_id::text
    or not public.security_json_positive_bigint_is_valid(p_command_payload, 'expectedCandidateVersion')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'version') <> 'number'
    or p_command_payload ->> 'version' <> '1'
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
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  requested_decision := p_command_payload ->> 'decision';
  requested_reason := p_command_payload ->> 'reasonCode';
  requested_note := p_command_payload ->> 'note';

  if (
    requested_decision = 'needs_review'
    and not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'candidateId', 'expectedCandidateVersion', 'decision', 'reasonCode', 'note']
    )
  )
  or (
    requested_decision = 'reject'
    and not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'candidateId', 'expectedCandidateVersion', 'decision', 'reasonCode', 'note']
    )
  )
  or (
    requested_decision = 'accept_and_open'
    and not public.security_json_has_exact_keys(
      p_command_payload,
      array[
        'version', 'candidateId', 'expectedCandidateVersion', 'decision', 'reasonCode',
        'target', 'evidenceId', 'indicator', 'category', 'resultingPosture', 'resultingSeverity',
        'publicSummary', 'note'
      ]
    )
  )
  or (
    requested_decision = 'accept_and_attach'
    and not public.security_json_has_exact_keys(
      p_command_payload,
      array[
        'version', 'candidateId', 'expectedCandidateVersion', 'decision', 'reasonCode',
        'target', 'incidentId', 'expectedIncidentVersion', 'evidenceId', 'indicator', 'note'
      ]
    )
  )
  or requested_decision not in ('needs_review', 'reject', 'accept_and_open', 'accept_and_attach')
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  if (requested_decision = 'needs_review'
      and requested_reason not in ('source_mismatch', 'grounding_failed', 'insufficient_context', 'wrong_scope'))
    or (requested_decision = 'reject'
      and requested_reason not in ('claim_not_supported', 'source_mismatch', 'duplicate_candidate', 'wrong_scope'))
    or (requested_decision in ('accept_and_open', 'accept_and_attach')
      and requested_reason <> 'evidence_verified')
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  input_hash_value := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'review_candidate', 'payload', p_command_payload)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'security-command:' || requested_reviewer_id::text || ':' ||
      pg_catalog.char_length(p_idempotency_key)::text || ':' || p_idempotency_key,
      0
    )
  );

  select receipt.* into receipt_record
  from public.security_review_commands as receipt
  where receipt.reviewer_user_id = requested_reviewer_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if receipt_record.operation <> 'review_candidate'
      or receipt_record.input_hash <> input_hash_value
    then
      raise exception 'security_idempotency_conflict' using errcode = 'AS107';
    end if;

    return query select
      1,
      receipt_record.id,
      receipt_record.aggregate_id,
      receipt_record.resulting_candidate_version,
      receipt_record.decision_id,
      receipt_record.result_payload ->> 'state',
      receipt_record.indicator_id,
      receipt_record.incident_id,
      true;
    return;
  end if;

  select candidate.* into candidate_record
  from public.security_indicator_candidates as candidate
  where candidate.id = p_candidate_id
  for update;

  if not found then
    raise exception 'security_candidate_not_found' using errcode = 'AS101';
  end if;

  if candidate_record.origin = 'reviewer_manual' then
    if pg_catalog.jsonb_typeof(candidate_record.payload -> 'target') <> 'object'
      or not public.security_json_has_exact_keys(candidate_record.payload -> 'target', array['type', 'id'])
      or pg_catalog.jsonb_typeof(candidate_record.payload -> 'target' -> 'type') <> 'string'
      or candidate_record.payload -> 'target' ->> 'type' not in ('project', 'source')
      or not public.security_json_uuid_is_valid(candidate_record.payload -> 'target', 'id')
    then
      raise exception 'security_candidate_not_reviewable' using errcode = 'AS102';
    end if;
    requested_target_type := candidate_record.payload -> 'target' ->> 'type';
    requested_target_id := (candidate_record.payload -> 'target' ->> 'id')::uuid;
  elsif candidate_record.origin = 'extraction' then
    if pg_catalog.jsonb_typeof(candidate_record.payload -> 'targetContext') <> 'object'
      or not public.security_json_has_exact_keys(
        candidate_record.payload -> 'targetContext', array['projectId', 'sourceId']
      )
      or not public.security_json_uuid_is_valid(candidate_record.payload -> 'targetContext', 'projectId')
      or not public.security_json_uuid_is_valid(candidate_record.payload -> 'targetContext', 'sourceId')
      or (candidate_record.payload -> 'targetContext' ->> 'projectId')::uuid <> candidate_record.project_id
      or (candidate_record.payload -> 'targetContext' ->> 'sourceId')::uuid <> candidate_record.source_id
      or pg_catalog.jsonb_typeof(candidate_record.payload -> 'routingTarget') <> 'object'
      or not public.security_json_has_exact_keys(
        candidate_record.payload -> 'routingTarget', array['type', 'id']
      )
      or candidate_record.payload -> 'routingTarget' ->> 'type' not in ('project', 'source')
      or not public.security_json_uuid_is_valid(candidate_record.payload -> 'routingTarget', 'id')
    then
      raise exception 'security_candidate_not_reviewable' using errcode = 'AS102';
    end if;

    if requested_decision in ('accept_and_open', 'accept_and_attach') then
      if pg_catalog.jsonb_typeof(p_command_payload -> 'target') <> 'object'
        or not public.security_json_has_exact_keys(p_command_payload -> 'target', array['type', 'id'])
        or pg_catalog.jsonb_typeof(p_command_payload -> 'target' -> 'type') <> 'string'
        or p_command_payload -> 'target' ->> 'type' not in ('project', 'source')
        or not public.security_json_uuid_is_valid(p_command_payload -> 'target', 'id')
      then
        raise exception 'security_command_invalid' using errcode = 'AS108';
      end if;
      requested_target_type := p_command_payload -> 'target' ->> 'type';
      requested_target_id := (p_command_payload -> 'target' ->> 'id')::uuid;
    else
      requested_target_type := candidate_record.payload -> 'routingTarget' ->> 'type';
      requested_target_id := (candidate_record.payload -> 'routingTarget' ->> 'id')::uuid;
    end if;
  else
    raise exception 'security_candidate_not_reviewable' using errcode = 'AS102';
  end if;

  if (requested_target_type = 'project' and requested_target_id <> candidate_record.project_id)
    or (requested_target_type = 'source' and requested_target_id <> candidate_record.source_id)
  then
    raise exception 'security_target_mismatch' using errcode = 'AS109';
  end if;

  if requested_decision in ('accept_and_open', 'accept_and_attach')
    and candidate_record.origin = 'reviewer_manual'
    and (
      pg_catalog.jsonb_typeof(p_command_payload -> 'target') <> 'object'
      or not public.security_json_has_exact_keys(p_command_payload -> 'target', array['type', 'id'])
      or p_command_payload -> 'target' <> candidate_record.payload -> 'target'
    )
  then
    raise exception 'security_target_mismatch' using errcode = 'AS109';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.security_target_lock_key_v1(requested_target_type, requested_target_id)
  );

  select * into current_candidate_state
  from public.security_current_candidate_state(candidate_record.id);

  if current_candidate_state.state_version <> (p_command_payload ->> 'expectedCandidateVersion')::bigint then
    raise exception 'security_version_conflict' using errcode = 'AS106';
  end if;
  if current_candidate_state.state in ('accepted', 'rejected') then
    raise exception 'security_candidate_not_reviewable' using errcode = 'AS102';
  end if;

  next_candidate_version := current_candidate_state.state_version + 1;
  occurred_at_text := pg_catalog.to_char(
    created_at_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  if requested_decision in ('accept_and_open', 'accept_and_attach') then
    if pg_catalog.jsonb_typeof(p_command_payload -> 'indicator') <> 'object'
      or not public.security_json_has_exact_keys(p_command_payload -> 'indicator', array['type', 'value'])
      or pg_catalog.jsonb_typeof(p_command_payload -> 'indicator' -> 'type') <> 'string'
      or p_command_payload -> 'indicator' ->> 'type' not in (
        'domain', 'url', 'contract_address', 'transaction_hash',
        'social_account', 'observed_behavior'
      )
      or pg_catalog.jsonb_typeof(p_command_payload -> 'indicator' -> 'value') <> 'string'
    then
      raise exception 'security_command_invalid' using errcode = 'AS108';
    end if;

    requested_indicator_type := p_command_payload -> 'indicator' ->> 'type';
    requested_indicator_value := public.normalize_security_indicator_value_v1(
      p_command_payload -> 'indicator' ->> 'value'
    );

    if requested_indicator_value <> p_command_payload -> 'indicator' ->> 'value'
      or pg_catalog.char_length(requested_indicator_value) not between 1 and 500
    then
      grounding_failed := true;
    elsif candidate_record.origin = 'reviewer_manual' then
      if not public.security_json_uuid_is_valid(p_command_payload, 'evidenceId') then
        raise exception 'security_command_invalid' using errcode = 'AS108';
      end if;
      requested_evidence_id := (p_command_payload ->> 'evidenceId')::uuid;
      grounding_failed := not public.security_evidence_matches_target(
        requested_evidence_id, requested_target_type, requested_target_id
      )
        or not public.security_indicator_is_grounded(
          requested_indicator_type, requested_indicator_value, requested_evidence_id,
          requested_target_type, requested_target_id
        )
        or not exists (
          select 1
          from public.evidence as evidence_record
          join public.raw_items as raw_item on raw_item.id = evidence_record.raw_item_id
          where evidence_record.id = requested_evidence_id
            and raw_item.project_id = candidate_record.project_id
            and raw_item.source_id = candidate_record.source_id
            and evidence_record.source_id = candidate_record.source_id
        );
    else
      if pg_catalog.jsonb_typeof(p_command_payload -> 'evidenceId') <> 'null' then
        raise exception 'security_command_invalid' using errcode = 'AS108';
      end if;

      select extraction.* into extraction_record
      from public.extraction_candidates as extraction
      where extraction.id = candidate_record.extraction_candidate_id;
      if not found
        or extraction_record.project_id <> candidate_record.project_id
        or extraction_record.source_id <> candidate_record.source_id
        or pg_catalog.jsonb_typeof(extraction_record.payload -> 'evidenceQuote') <> 'string'
        or pg_catalog.char_length(extraction_record.payload ->> 'evidenceQuote') not between 10 and 500
      then
        grounding_failed := true;
      else
        stored_quote := extraction_record.payload ->> 'evidenceQuote';
        normalized_quote := public.normalize_evidence_text_v1(stored_quote);
        select discovered.* into discovered_record
        from public.discovered_items as discovered
        where discovered.id = extraction_record.discovered_item_id;

        if not found
          or discovered_record.project_id <> candidate_record.project_id
          or discovered_record.source_id <> candidate_record.source_id
        then
          grounding_failed := true;
        elsif extraction_record.raw_item_id is not null then
          resolved_source_field := 'article_raw_text';
          select raw_item.* into raw_record
          from public.raw_items as raw_item
          where raw_item.id = extraction_record.raw_item_id;
          if not found
            or raw_record.project_id <> candidate_record.project_id
            or raw_record.source_id <> candidate_record.source_id
          then
            grounding_failed := true;
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
            grounding_failed := true;
          else
            resolved_raw_item_id := raw_record.id;
            normalized_source := public.normalize_evidence_text_v1(discovered_record.summary);
          end if;
        end if;

        grounding_failed := grounding_failed
          or pg_catalog.char_length(normalized_quote) not between 10 and 500
          or pg_catalog.strpos(normalized_source, normalized_quote) = 0
          or pg_catalog.strpos(
            normalized_quote,
            public.normalize_security_indicator_value_v1(requested_indicator_value)
          ) = 0;

        if not grounding_failed then
          insert into public.evidence (
            source_id, raw_item_id, discovered_item_id, source_field, quote_text,
            normalized_quote_sha256, verified_at, created_at
          ) values (
            candidate_record.source_id, resolved_raw_item_id,
            extraction_record.discovered_item_id, resolved_source_field,
            normalized_quote, public.evidence_quote_sha256_v1(stored_quote),
            created_at_value, created_at_value
          )
          on conflict do nothing
          returning id into requested_evidence_id;

          if requested_evidence_id is null then
            select evidence_record.id into strict requested_evidence_id
            from public.evidence as evidence_record
            where evidence_record.raw_item_id = resolved_raw_item_id
              and evidence_record.discovered_item_id is not distinct from extraction_record.discovered_item_id
              and evidence_record.source_field = resolved_source_field
              and evidence_record.normalized_quote_sha256 = public.evidence_quote_sha256_v1(stored_quote);
          end if;
        end if;
      end if;
    end if;

    if grounding_failed then
      requested_decision := 'needs_review';
      requested_reason := 'grounding_failed';
    end if;
  end if;

  if requested_decision = 'needs_review' or requested_decision = 'reject' then
    insert into public.security_candidate_review_decisions (
      id, candidate_id, candidate_version, reviewer_user_id, decision,
      reason_code, note, created_at
    ) values (
      candidate_decision_id, candidate_record.id, next_candidate_version,
      requested_reviewer_id, requested_decision, requested_reason, requested_note,
      created_at_value
    );

    insert into public.security_events (
      event_type, aggregate_type, aggregate_id, aggregate_version, candidate_id,
      decision_id, actor_kind, actor_user_id, payload, occurred_at, created_at
    ) values (
      'candidate_reviewed', 'candidate', candidate_record.id, next_candidate_version,
      candidate_record.id, candidate_decision_id, 'reviewer', requested_reviewer_id,
      pg_catalog.jsonb_build_object(
        'version', 1,
        'eventType', 'security.candidate.reviewed.v1',
        'candidateId', candidate_record.id,
        'decisionId', candidate_decision_id,
        'state', case when requested_decision = 'reject' then 'rejected' else 'needs_review' end
      ),
      created_at_value, created_at_value
    );

    insert into public.outbox_events (
      aggregate_type, aggregate_id, aggregate_version, event_type, payload,
      occurred_at, created_at
    ) values (
      'security_candidate', candidate_record.id, next_candidate_version,
      'security.candidate.reviewed.v1',
      pg_catalog.jsonb_build_object(
        'version', 1,
        'eventType', 'security.candidate.reviewed.v1',
        'aggregateId', candidate_record.id,
        'aggregateVersion', next_candidate_version,
        'target', pg_catalog.jsonb_build_object('type', requested_target_type, 'id', requested_target_id),
        'candidateId', candidate_record.id,
        'decisionId', candidate_decision_id,
        'occurredAt', occurred_at_text
      ),
      created_at_value, created_at_value
    );

    insert into public.security_review_commands (
      id, reviewer_user_id, operation, aggregate_type, aggregate_id,
      idempotency_key, input_hash, expected_candidate_version,
      resulting_candidate_version, decision_id, result_payload, created_at
    ) values (
      command_id_value, requested_reviewer_id, 'review_candidate', 'candidate',
      candidate_record.id, p_idempotency_key, input_hash_value,
      current_candidate_state.state_version, next_candidate_version, candidate_decision_id,
      pg_catalog.jsonb_build_object(
        'version', 1,
        'commandId', command_id_value,
        'candidateId', candidate_record.id,
        'candidateVersion', next_candidate_version,
        'decisionId', candidate_decision_id,
        'state', case when requested_decision = 'reject' then 'rejected' else 'needs_review' end,
        'indicatorId', null,
        'incidentId', null
      ),
      created_at_value
    );

    return query select
      1, command_id_value, candidate_record.id, next_candidate_version,
      candidate_decision_id,
      case when requested_decision = 'reject' then 'rejected' else 'needs_review' end,
      null::uuid, null::uuid, false;
    return;
  end if;

  if requested_decision = 'accept_and_open' then
    if pg_catalog.jsonb_typeof(p_command_payload -> 'category') <> 'string'
      or p_command_payload ->> 'category' not in (
        'phishing', 'impersonation', 'malicious_contract', 'source_compromise',
        'fraudulent_claim', 'fund_loss', 'other_security_risk'
      )
      or pg_catalog.jsonb_typeof(p_command_payload -> 'resultingPosture') <> 'string'
      or p_command_payload ->> 'resultingPosture' not in ('caution', 'blocked')
      or pg_catalog.jsonb_typeof(p_command_payload -> 'resultingSeverity') <> 'string'
      or p_command_payload ->> 'resultingSeverity' not in ('low', 'medium', 'high', 'critical')
      or pg_catalog.jsonb_typeof(p_command_payload -> 'publicSummary') <> 'string'
    then
      raise exception 'security_command_invalid' using errcode = 'AS108';
    end if;

    requested_category := p_command_payload ->> 'category';
    requested_posture := p_command_payload ->> 'resultingPosture';
    requested_severity := p_command_payload ->> 'resultingSeverity';
    requested_summary := p_command_payload ->> 'publicSummary';
    if requested_summary <> pg_catalog.btrim(requested_summary)
      or pg_catalog.char_length(requested_summary) not between 20 and 500
    then
      raise exception 'security_command_invalid' using errcode = 'AS108';
    end if;
  else
    if not public.security_json_uuid_is_valid(p_command_payload, 'incidentId')
      or not public.security_json_positive_bigint_is_valid(
        p_command_payload, 'expectedIncidentVersion'
      )
    then
      raise exception 'security_command_invalid' using errcode = 'AS108';
    end if;
    requested_incident_id := (p_command_payload ->> 'incidentId')::uuid;
    requested_expected_incident_version :=
      (p_command_payload ->> 'expectedIncidentVersion')::bigint;
    select incident.* into incident_record
    from public.security_incidents as incident
    where incident.id = requested_incident_id
    for update;
    if not found then
      raise exception 'security_incident_not_found' using errcode = 'AS103';
    end if;
    if incident_record.target_type <> requested_target_type
      or coalesce(incident_record.project_id, incident_record.source_id) <> requested_target_id
    then
      raise exception 'security_target_mismatch' using errcode = 'AS109';
    end if;
    select * into current_incident
    from public.security_current_incident_decision(incident_record.id);
    if current_incident.decision_id is null or current_incident.resulting_posture is null then
      raise exception 'security_candidate_not_reviewable' using errcode = 'AS102';
    end if;
    if current_incident.incident_version <> requested_expected_incident_version then
      raise exception 'security_version_conflict' using errcode = 'AS106';
    end if;
    next_incident_version := current_incident.incident_version + 1;
    requested_posture := current_incident.resulting_posture;
    requested_severity := current_incident.resulting_severity;
    requested_summary := current_incident.public_summary;
  end if;

  insert into public.security_indicators (
    indicator_type, value_text, normalized_value_sha256, created_at
  ) values (
    requested_indicator_type, requested_indicator_value,
    public.security_indicator_value_sha256_v1(requested_indicator_value), created_at_value
  )
  on conflict (indicator_type, normalized_value_sha256) do nothing
  returning id into indicator_id_value;

  if indicator_id_value is null then
    select indicator.id into strict indicator_id_value
    from public.security_indicators as indicator
    where indicator.indicator_type = requested_indicator_type
      and indicator.normalized_value_sha256 = public.security_indicator_value_sha256_v1(requested_indicator_value);
  else
    indicator_was_created := true;
  end if;

  insert into public.security_indicator_evidence_links (indicator_id, evidence_id, created_at)
  values (indicator_id_value, requested_evidence_id, created_at_value)
  on conflict do nothing;

  if requested_decision = 'accept_and_open' then
    incident_id_value := extensions.gen_random_uuid();
    incident_decision_id := extensions.gen_random_uuid();
    insert into public.security_incidents (
      id, target_type, project_id, source_id, category, opened_at, created_at
    ) values (
      incident_id_value, requested_target_type,
      case when requested_target_type = 'project' then requested_target_id else null end,
      case when requested_target_type = 'source' then requested_target_id else null end,
      requested_category, created_at_value, created_at_value
    );
    insert into public.security_incident_decisions (
      id, incident_id, incident_version, reviewer_user_id, action, reason_code,
      resulting_posture, resulting_severity, public_summary, note, evidence_id, created_at
    ) values (
      incident_decision_id, incident_id_value, 1, requested_reviewer_id,
      'open', 'precautionary_evidence', requested_posture, requested_severity,
      requested_summary, requested_note, requested_evidence_id, created_at_value
    );
    insert into public.security_incident_indicator_links (
      incident_id, indicator_id, linked_by_decision_id, created_at
    ) values (incident_id_value, indicator_id_value, incident_decision_id, created_at_value);
  else
    incident_id_value := incident_record.id;
    incident_decision_id := extensions.gen_random_uuid();
    insert into public.security_incident_decisions (
      id, incident_id, incident_version, reviewer_user_id, action, reason_code,
      resulting_posture, resulting_severity, public_summary, note, evidence_id, created_at
    ) values (
      incident_decision_id, incident_id_value, next_incident_version, requested_reviewer_id,
      'attach_indicator', 'additional_evidence', requested_posture,
      requested_severity, requested_summary,
      requested_note, requested_evidence_id, created_at_value
    );
    insert into public.security_incident_indicator_links (
      incident_id, indicator_id, linked_by_decision_id, created_at
    ) values (incident_id_value, indicator_id_value, incident_decision_id, created_at_value)
    on conflict do nothing;
  end if;

  insert into public.security_candidate_review_decisions (
    id, candidate_id, candidate_version, reviewer_user_id, decision,
    reason_code, note, indicator_id, incident_id, created_at
  ) values (
    candidate_decision_id, candidate_record.id, next_candidate_version,
    requested_reviewer_id, requested_decision, 'evidence_verified', requested_note,
    indicator_id_value, incident_id_value, created_at_value
  );

  insert into public.security_events (
    event_type, aggregate_type, aggregate_id, aggregate_version, candidate_id,
    indicator_id, incident_id, decision_id, actor_kind, actor_user_id, payload,
    occurred_at, created_at
  ) values (
    'candidate_reviewed', 'candidate', candidate_record.id, next_candidate_version,
    candidate_record.id, indicator_id_value, incident_id_value, candidate_decision_id,
    'reviewer', requested_reviewer_id,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'security.candidate.reviewed.v1',
      'candidateId', candidate_record.id,
      'decisionId', candidate_decision_id,
      'state', 'accepted'
    ),
    created_at_value, created_at_value
  );

  if indicator_was_created then
    insert into public.security_events (
      event_type, aggregate_type, aggregate_id, aggregate_version, indicator_id,
      actor_kind, actor_user_id, payload, occurred_at, created_at
    ) values (
      'indicator_accepted', 'indicator', indicator_id_value, 1, indicator_id_value,
      'reviewer', requested_reviewer_id,
      pg_catalog.jsonb_build_object(
        'version', 1,
        'eventType', 'security.indicator.accepted.v1',
        'indicatorId', indicator_id_value
      ),
      created_at_value, created_at_value
    );
  end if;

  insert into public.security_events (
    event_type, aggregate_type, aggregate_id, aggregate_version, indicator_id,
    incident_id, decision_id, actor_kind, actor_user_id, payload, occurred_at, created_at
  ) values (
    case when requested_decision = 'accept_and_open' then 'incident_opened' else 'incident_changed' end,
    'incident', incident_id_value,
    case when requested_decision = 'accept_and_open' then 1 else next_incident_version end,
    indicator_id_value, incident_id_value, incident_decision_id,
    'reviewer', requested_reviewer_id,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', case when requested_decision = 'accept_and_open'
        then 'security.incident.opened.v1' else 'security.incident.changed.v1' end,
      'incidentId', incident_id_value,
      'decisionId', incident_decision_id
    ),
    created_at_value, created_at_value
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version, event_type, payload,
    occurred_at, created_at
  ) values (
    'security_candidate', candidate_record.id, next_candidate_version,
    'security.candidate.reviewed.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'security.candidate.reviewed.v1',
      'aggregateId', candidate_record.id,
      'aggregateVersion', next_candidate_version,
      'target', pg_catalog.jsonb_build_object('type', requested_target_type, 'id', requested_target_id),
      'candidateId', candidate_record.id,
      'decisionId', candidate_decision_id,
      'occurredAt', occurred_at_text
    ),
    created_at_value, created_at_value
  );

  if indicator_was_created then
    insert into public.outbox_events (
      aggregate_type, aggregate_id, aggregate_version, event_type, payload,
      occurred_at, created_at
    ) values (
      'security_indicator', indicator_id_value, 1,
      'security.indicator.accepted.v1',
      pg_catalog.jsonb_build_object(
        'version', 1,
        'eventType', 'security.indicator.accepted.v1',
        'aggregateId', indicator_id_value,
        'aggregateVersion', 1,
        'target', pg_catalog.jsonb_build_object('type', requested_target_type, 'id', requested_target_id),
        'indicatorId', indicator_id_value,
        'occurredAt', occurred_at_text
      ),
      created_at_value, created_at_value
    );
  end if;

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version, event_type, payload,
    occurred_at, created_at
  ) values (
    'security_incident', incident_id_value,
    case when requested_decision = 'accept_and_open' then 1 else next_incident_version end,
    case when requested_decision = 'accept_and_open'
      then 'security.incident.opened.v1' else 'security.incident.changed.v1' end,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', case when requested_decision = 'accept_and_open'
        then 'security.incident.opened.v1' else 'security.incident.changed.v1' end,
      'aggregateId', incident_id_value,
      'aggregateVersion', case when requested_decision = 'accept_and_open' then 1 else next_incident_version end,
      'target', pg_catalog.jsonb_build_object('type', requested_target_type, 'id', requested_target_id),
      'incidentId', incident_id_value,
      'decisionId', incident_decision_id,
      'resultingPosture', requested_posture,
      'occurredAt', occurred_at_text
    ),
    created_at_value, created_at_value
  );

  insert into public.security_review_commands (
    id, reviewer_user_id, operation, aggregate_type, aggregate_id,
    idempotency_key, input_hash, expected_candidate_version,
    resulting_candidate_version, expected_incident_version,
    resulting_incident_version, decision_id,
    indicator_id, incident_id, result_payload, created_at
  ) values (
    command_id_value, requested_reviewer_id, 'review_candidate', 'candidate',
    candidate_record.id, p_idempotency_key, input_hash_value,
    current_candidate_state.state_version, next_candidate_version,
    case when requested_decision = 'accept_and_attach'
      then requested_expected_incident_version else null end,
    case when requested_decision = 'accept_and_open' then 1 else next_incident_version end,
    candidate_decision_id, indicator_id_value, incident_id_value,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'commandId', command_id_value,
      'candidateId', candidate_record.id,
      'candidateVersion', next_candidate_version,
      'decisionId', candidate_decision_id,
      'state', 'accepted',
      'indicatorId', indicator_id_value,
      'incidentId', incident_id_value
    ),
    created_at_value
  );

  return query select
    1, command_id_value, candidate_record.id, next_candidate_version,
    candidate_decision_id, 'accepted'::text, indicator_id_value, incident_id_value, false;
exception
  when others then
    if SQLSTATE in (
      'AS101', 'AS102', 'AS103', 'AS104', 'AS106', 'AS107', 'AS108', 'AS109'
    ) then
      raise;
    end if;
    raise exception 'security_persistence_failed' using errcode = 'AS199';
end;
$function$;

alter function public.execute_security_candidate_review(uuid, jsonb, text) owner to postgres;
revoke all on function public.execute_security_candidate_review(uuid, jsonb, text)
from public, anon, service_role, ai_stage_worker, collection_worker,
  collection_queue_worker, collection_schedule_admin, promotion_service;
grant execute on function public.execute_security_candidate_review(uuid, jsonb, text)
to authenticated;

create function public.open_security_incident(
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "incidentId" uuid,
  "incidentVersion" bigint,
  "decisionId" uuid,
  state text,
  posture text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  requested_reviewer_id uuid;
  requested_target_type text;
  requested_target_id uuid;
  requested_category text;
  requested_indicator_id uuid;
  requested_evidence_id uuid;
  requested_posture text;
  requested_severity text;
  requested_summary text;
  requested_note text;
  input_hash_value text;
  receipt_record public.security_review_commands%rowtype;
  command_id_value uuid := extensions.gen_random_uuid();
  incident_id_value uuid := extensions.gen_random_uuid();
  decision_id_value uuid := extensions.gen_random_uuid();
  created_at_value timestamptz := pg_catalog.transaction_timestamp();
  occurred_at_text text;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null
    or not public.actor_has_active_security_role(requested_reviewer_id)
  then
    raise exception 'security_reviewer_required' using errcode = 'AS104';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array[
        'version', 'action', 'target', 'category', 'indicatorId', 'evidenceId',
        'resultingPosture', 'resultingSeverity', 'publicSummary', 'note', 'reasonCode'
      ]
    )
    or pg_catalog.jsonb_typeof(p_command_payload -> 'version') <> 'number'
    or p_command_payload ->> 'version' <> '1'
    or p_command_payload ->> 'action' <> 'open'
    or p_command_payload ->> 'reasonCode' not in ('precautionary_evidence', 'active_exploitation')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'target') <> 'object'
    or not public.security_json_has_exact_keys(p_command_payload -> 'target', array['type', 'id'])
    or pg_catalog.jsonb_typeof(p_command_payload -> 'target' -> 'type') <> 'string'
    or p_command_payload -> 'target' ->> 'type' not in ('project', 'source')
    or not public.security_json_uuid_is_valid(p_command_payload -> 'target', 'id')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'category') <> 'string'
    or p_command_payload ->> 'category' not in (
      'phishing', 'impersonation', 'malicious_contract', 'source_compromise',
      'fraudulent_claim', 'fund_loss', 'other_security_risk'
    )
    or not public.security_json_uuid_is_valid(p_command_payload, 'indicatorId')
    or not public.security_json_uuid_is_valid(p_command_payload, 'evidenceId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'resultingPosture') <> 'string'
    or p_command_payload ->> 'resultingPosture' not in ('caution', 'blocked')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'resultingSeverity') <> 'string'
    or p_command_payload ->> 'resultingSeverity' not in ('low', 'medium', 'high', 'critical')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'publicSummary') <> 'string'
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'string'
        and p_command_payload ->> 'note' = pg_catalog.btrim(p_command_payload ->> 'note')
        and pg_catalog.char_length(p_command_payload ->> 'note') between 1 and 1000
      )
    )
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  requested_target_type := p_command_payload -> 'target' ->> 'type';
  requested_target_id := (p_command_payload -> 'target' ->> 'id')::uuid;
  requested_category := p_command_payload ->> 'category';
  requested_indicator_id := (p_command_payload ->> 'indicatorId')::uuid;
  requested_evidence_id := (p_command_payload ->> 'evidenceId')::uuid;
  requested_posture := p_command_payload ->> 'resultingPosture';
  requested_severity := p_command_payload ->> 'resultingSeverity';
  requested_summary := p_command_payload ->> 'publicSummary';
  requested_note := p_command_payload ->> 'note';
  if requested_summary <> pg_catalog.btrim(requested_summary)
    or pg_catalog.char_length(requested_summary) not between 20 and 500
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  input_hash_value := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'open_incident', 'payload', p_command_payload)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'security-command:' || requested_reviewer_id::text || ':' ||
      pg_catalog.char_length(p_idempotency_key)::text || ':' || p_idempotency_key,
      0
    )
  );
  select receipt.* into receipt_record
  from public.security_review_commands as receipt
  where receipt.reviewer_user_id = requested_reviewer_id
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if receipt_record.operation <> 'open_incident'
      or receipt_record.input_hash <> input_hash_value
    then
      raise exception 'security_idempotency_conflict' using errcode = 'AS107';
    end if;
    return query select
      1, receipt_record.id, receipt_record.aggregate_id,
      receipt_record.resulting_incident_version, receipt_record.decision_id,
      receipt_record.result_payload ->> 'state',
      receipt_record.result_payload ->> 'posture', true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.security_target_lock_key_v1(requested_target_type, requested_target_id)
  );

  if not exists (
    select 1 from public.security_indicators as indicator where indicator.id = requested_indicator_id
  ) then
    raise exception 'security_indicator_not_found' using errcode = 'AS105';
  end if;
  if not public.security_evidence_matches_target(
    requested_evidence_id, requested_target_type, requested_target_id
  )
    or not exists (
      select 1
      from public.security_indicator_evidence_links as evidence_link
      where evidence_link.indicator_id = requested_indicator_id
        and public.security_evidence_matches_target(
          evidence_link.evidence_id, requested_target_type, requested_target_id
        )
    )
  then
    raise exception 'security_target_mismatch' using errcode = 'AS109';
  end if;

  insert into public.security_incidents (
    id, target_type, project_id, source_id, category, opened_at, created_at
  ) values (
    incident_id_value, requested_target_type,
    case when requested_target_type = 'project' then requested_target_id else null end,
    case when requested_target_type = 'source' then requested_target_id else null end,
    requested_category, created_at_value, created_at_value
  );
  insert into public.security_incident_decisions (
    id, incident_id, incident_version, reviewer_user_id, action, reason_code,
    resulting_posture, resulting_severity, public_summary, note, evidence_id, created_at
  ) values (
    decision_id_value, incident_id_value, 1, requested_reviewer_id, 'open',
    p_command_payload ->> 'reasonCode', requested_posture, requested_severity,
    requested_summary, requested_note, requested_evidence_id, created_at_value
  );
  insert into public.security_incident_indicator_links (
    incident_id, indicator_id, linked_by_decision_id, created_at
  ) values (incident_id_value, requested_indicator_id, decision_id_value, created_at_value);

  occurred_at_text := pg_catalog.to_char(
    created_at_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  insert into public.security_events (
    event_type, aggregate_type, aggregate_id, aggregate_version, indicator_id,
    incident_id, decision_id, actor_kind, actor_user_id, payload, occurred_at, created_at
  ) values (
    'incident_opened', 'incident', incident_id_value, 1, requested_indicator_id,
    incident_id_value, decision_id_value, 'reviewer', requested_reviewer_id,
    pg_catalog.jsonb_build_object(
      'version', 1, 'eventType', 'security.incident.opened.v1',
      'incidentId', incident_id_value, 'decisionId', decision_id_value
    ),
    created_at_value, created_at_value
  );
  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version, event_type, payload,
    occurred_at, created_at
  ) values (
    'security_incident', incident_id_value, 1, 'security.incident.opened.v1',
    pg_catalog.jsonb_build_object(
      'version', 1, 'eventType', 'security.incident.opened.v1',
      'aggregateId', incident_id_value, 'aggregateVersion', 1,
      'target', pg_catalog.jsonb_build_object('type', requested_target_type, 'id', requested_target_id),
      'incidentId', incident_id_value, 'decisionId', decision_id_value,
      'resultingPosture', requested_posture, 'occurredAt', occurred_at_text
    ),
    created_at_value, created_at_value
  );
  insert into public.security_review_commands (
    id, reviewer_user_id, operation, aggregate_type, aggregate_id,
    idempotency_key, input_hash, resulting_incident_version, decision_id,
    indicator_id, incident_id, result_payload, created_at
  ) values (
    command_id_value, requested_reviewer_id, 'open_incident', 'incident',
    incident_id_value, p_idempotency_key, input_hash_value, 1, decision_id_value,
    requested_indicator_id, incident_id_value,
    pg_catalog.jsonb_build_object(
      'version', 1, 'commandId', command_id_value, 'incidentId', incident_id_value,
      'incidentVersion', 1, 'decisionId', decision_id_value, 'state', 'active',
      'posture', requested_posture
    ),
    created_at_value
  );
  return query select
    1, command_id_value, incident_id_value, 1::bigint, decision_id_value,
    'active'::text, requested_posture, false;
exception
  when others then
    if SQLSTATE in ('AS104', 'AS105', 'AS107', 'AS108', 'AS109') then
      raise;
    end if;
    raise exception 'security_persistence_failed' using errcode = 'AS199';
end;
$function$;

alter function public.open_security_incident(jsonb, text) owner to postgres;
revoke all on function public.open_security_incident(jsonb, text)
from public, anon, service_role, ai_stage_worker, collection_worker,
  collection_queue_worker, collection_schedule_admin, promotion_service;
grant execute on function public.open_security_incident(jsonb, text)
to authenticated;

create function public.execute_security_incident_command(
  p_incident_id uuid,
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "incidentId" uuid,
  "incidentVersion" bigint,
  "decisionId" uuid,
  state text,
  posture text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  requested_reviewer_id uuid;
  incident_record public.security_incidents%rowtype;
  receipt_record public.security_review_commands%rowtype;
  current_incident record;
  requested_action text;
  requested_reason text;
  requested_evidence_id uuid;
  requested_indicator_id uuid;
  requested_posture text;
  requested_severity text;
  requested_summary text;
  requested_note text;
  target_id_value uuid;
  input_hash_value text;
  next_incident_version bigint;
  decision_id_value uuid := extensions.gen_random_uuid();
  command_id_value uuid := extensions.gen_random_uuid();
  created_at_value timestamptz := pg_catalog.transaction_timestamp();
  occurred_at_text text;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null
    or not public.actor_has_active_security_role(requested_reviewer_id)
  then
    raise exception 'security_reviewer_required' using errcode = 'AS104';
  end if;

  if p_incident_id is null
    or p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_uuid_is_valid(p_command_payload, 'incidentId')
    or pg_catalog.lower(p_command_payload ->> 'incidentId') <> p_incident_id::text
    or not public.security_json_positive_bigint_is_valid(p_command_payload, 'expectedIncidentVersion')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'version') <> 'number'
    or p_command_payload ->> 'version' <> '1'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'action') <> 'string'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'reasonCode') <> 'string'
    or not public.security_json_uuid_is_valid(p_command_payload, 'evidenceId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'resultingSeverity') <> 'string'
    or p_command_payload ->> 'resultingSeverity' not in ('low', 'medium', 'high', 'critical')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'publicSummary') <> 'string'
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'string'
        and p_command_payload ->> 'note' = pg_catalog.btrim(p_command_payload ->> 'note')
        and pg_catalog.char_length(p_command_payload ->> 'note') between 1 and 1000
      )
    )
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  requested_action := p_command_payload ->> 'action';
  requested_reason := p_command_payload ->> 'reasonCode';
  if (
    requested_action = 'attach_indicator'
    and not public.security_json_has_exact_keys(
      p_command_payload,
      array[
        'version', 'action', 'incidentId', 'expectedIncidentVersion', 'indicatorId',
        'evidenceId', 'resultingPosture', 'resultingSeverity', 'publicSummary',
        'note', 'reasonCode'
      ]
    )
  )
  or (
    requested_action = 'adjust'
    and not public.security_json_has_exact_keys(
      p_command_payload,
      array[
        'version', 'action', 'incidentId', 'expectedIncidentVersion', 'evidenceId',
        'resultingPosture', 'resultingSeverity', 'publicSummary', 'note', 'reasonCode'
      ]
    )
  )
  or (
    requested_action = 'resolve'
    and not public.security_json_has_exact_keys(
      p_command_payload,
      array[
        'version', 'action', 'incidentId', 'expectedIncidentVersion', 'evidenceId',
        'resultingSeverity', 'publicSummary', 'note', 'reasonCode'
      ]
    )
  )
  or (
    requested_action = 'reopen'
    and not public.security_json_has_exact_keys(
      p_command_payload,
      array[
        'version', 'action', 'incidentId', 'expectedIncidentVersion', 'evidenceId',
        'resultingPosture', 'resultingSeverity', 'publicSummary', 'note', 'reasonCode'
      ]
    )
  )
  or requested_action not in ('attach_indicator', 'adjust', 'resolve', 'reopen')
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  if requested_action in ('attach_indicator', 'adjust', 'reopen')
    and (
      pg_catalog.jsonb_typeof(p_command_payload -> 'resultingPosture') <> 'string'
      or p_command_payload ->> 'resultingPosture' not in ('caution', 'blocked')
    )
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;
  if requested_action = 'attach_indicator'
    and not public.security_json_uuid_is_valid(p_command_payload, 'indicatorId')
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  requested_evidence_id := (p_command_payload ->> 'evidenceId')::uuid;
  requested_indicator_id := case
    when requested_action = 'attach_indicator' then (p_command_payload ->> 'indicatorId')::uuid
    else null
  end;
  requested_posture := case
    when requested_action = 'resolve' then null
    else p_command_payload ->> 'resultingPosture'
  end;
  requested_severity := p_command_payload ->> 'resultingSeverity';
  requested_summary := p_command_payload ->> 'publicSummary';
  requested_note := p_command_payload ->> 'note';
  if requested_summary <> pg_catalog.btrim(requested_summary)
    or pg_catalog.char_length(requested_summary) not between 20 and 500
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  input_hash_value := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'incident_command', 'payload', p_command_payload)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'security-command:' || requested_reviewer_id::text || ':' ||
      pg_catalog.char_length(p_idempotency_key)::text || ':' || p_idempotency_key,
      0
    )
  );
  select receipt.* into receipt_record
  from public.security_review_commands as receipt
  where receipt.reviewer_user_id = requested_reviewer_id
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if receipt_record.operation <> 'incident_command'
      or receipt_record.input_hash <> input_hash_value
    then
      raise exception 'security_idempotency_conflict' using errcode = 'AS107';
    end if;
    return query select
      1, receipt_record.id, receipt_record.aggregate_id,
      receipt_record.resulting_incident_version, receipt_record.decision_id,
      receipt_record.result_payload ->> 'state',
      receipt_record.result_payload ->> 'posture', true;
    return;
  end if;

  select incident.* into incident_record
  from public.security_incidents as incident
  where incident.id = p_incident_id;
  if not found then
    raise exception 'security_incident_not_found' using errcode = 'AS103';
  end if;
  target_id_value := coalesce(incident_record.project_id, incident_record.source_id);
  perform pg_catalog.pg_advisory_xact_lock(
    public.security_target_lock_key_v1(incident_record.target_type, target_id_value)
  );
  select incident.* into incident_record
  from public.security_incidents as incident
  where incident.id = p_incident_id
  for update;
  if not found then
    raise exception 'security_incident_not_found' using errcode = 'AS103';
  end if;
  select * into current_incident
  from public.security_current_incident_decision(incident_record.id);
  if current_incident.decision_id is null then
    raise exception 'security_incident_not_found' using errcode = 'AS103';
  end if;
  if current_incident.incident_version <> (p_command_payload ->> 'expectedIncidentVersion')::bigint then
    raise exception 'security_version_conflict' using errcode = 'AS106';
  end if;
  if not public.security_evidence_matches_target(
    requested_evidence_id, incident_record.target_type, target_id_value
  ) then
    raise exception 'security_target_mismatch' using errcode = 'AS109';
  end if;

  if requested_action = 'attach_indicator' then
    if current_incident.resulting_posture is null
      or requested_reason <> 'additional_evidence'
      or requested_posture <> current_incident.resulting_posture
      or requested_severity <> current_incident.resulting_severity
      or requested_summary <> current_incident.public_summary
      or not exists (
        select 1 from public.security_indicators as indicator where indicator.id = requested_indicator_id
      )
      or not exists (
        select 1 from public.security_indicator_evidence_links as evidence_link
        where evidence_link.indicator_id = requested_indicator_id
          and public.security_evidence_matches_target(
            evidence_link.evidence_id, incident_record.target_type, target_id_value
          )
      )
      or exists (
        select 1
        from public.security_incident_indicator_links as existing_link
        where existing_link.incident_id = incident_record.id
          and existing_link.indicator_id = requested_indicator_id
      )
    then
      raise exception 'security_command_invalid' using errcode = 'AS108';
    end if;
  elsif requested_action = 'adjust' then
    if current_incident.resulting_posture is null then
      raise exception 'security_command_invalid' using errcode = 'AS108';
    end if;
    if (
      (requested_posture = 'blocked' and current_incident.resulting_posture = 'caution'
        and requested_reason not in ('evidence_escalated', 'active_exploitation'))
      or (requested_posture = 'caution' and current_incident.resulting_posture = 'blocked'
        and requested_reason not in ('evidence_deescalated', 'mitigation_verified', 'scope_corrected'))
      or (requested_posture = current_incident.resulting_posture
        and (
          requested_summary = current_incident.public_summary
          or requested_evidence_id = current_incident.evidence_id
          or requested_reason not in ('additional_evidence', 'mitigation_verified')
        ))
    ) then
      raise exception 'security_command_invalid' using errcode = 'AS108';
    end if;
  elsif requested_action = 'resolve' then
    if current_incident.resulting_posture is null
      or requested_reason not in ('mitigation_verified', 'false_positive_verified', 'scope_corrected')
      or requested_severity <> current_incident.resulting_severity
      or requested_summary <> current_incident.public_summary
    then
      raise exception 'security_command_invalid' using errcode = 'AS108';
    end if;
  else
    if current_incident.resulting_posture is not null
      or requested_reason not in ('precautionary_evidence', 'active_exploitation')
    then
      raise exception 'security_command_invalid' using errcode = 'AS108';
    end if;
  end if;

  next_incident_version := current_incident.incident_version + 1;
  insert into public.security_incident_decisions (
    id, incident_id, incident_version, reviewer_user_id, action, reason_code,
    resulting_posture, resulting_severity, public_summary, note, evidence_id, created_at
  ) values (
    decision_id_value, incident_record.id, next_incident_version, requested_reviewer_id,
    requested_action, requested_reason, requested_posture, requested_severity,
    requested_summary, requested_note, requested_evidence_id, created_at_value
  );
  if requested_action = 'attach_indicator' then
    insert into public.security_incident_indicator_links (
      incident_id, indicator_id, linked_by_decision_id, created_at
    ) values (
      incident_record.id, requested_indicator_id, decision_id_value, created_at_value
    );
  end if;

  occurred_at_text := pg_catalog.to_char(
    created_at_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  insert into public.security_events (
    event_type, aggregate_type, aggregate_id, aggregate_version, indicator_id,
    incident_id, decision_id, actor_kind, actor_user_id, payload, occurred_at, created_at
  ) values (
    'incident_changed', 'incident', incident_record.id, next_incident_version,
    requested_indicator_id, incident_record.id, decision_id_value,
    'reviewer', requested_reviewer_id,
    pg_catalog.jsonb_build_object(
      'version', 1, 'eventType', 'security.incident.changed.v1',
      'incidentId', incident_record.id, 'decisionId', decision_id_value
    ),
    created_at_value, created_at_value
  );
  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version, event_type, payload,
    occurred_at, created_at
  ) values (
    'security_incident', incident_record.id, next_incident_version,
    'security.incident.changed.v1',
    pg_catalog.jsonb_build_object(
      'version', 1, 'eventType', 'security.incident.changed.v1',
      'aggregateId', incident_record.id, 'aggregateVersion', next_incident_version,
      'target', pg_catalog.jsonb_build_object('type', incident_record.target_type, 'id', target_id_value),
      'incidentId', incident_record.id, 'decisionId', decision_id_value,
      'resultingPosture', requested_posture, 'occurredAt', occurred_at_text
    ),
    created_at_value, created_at_value
  );
  insert into public.security_review_commands (
    id, reviewer_user_id, operation, aggregate_type, aggregate_id,
    idempotency_key, input_hash, expected_incident_version,
    resulting_incident_version, decision_id, indicator_id, incident_id,
    result_payload, created_at
  ) values (
    command_id_value, requested_reviewer_id, 'incident_command', 'incident',
    incident_record.id, p_idempotency_key, input_hash_value,
    current_incident.incident_version, next_incident_version, decision_id_value,
    requested_indicator_id, incident_record.id,
    pg_catalog.jsonb_build_object(
      'version', 1, 'commandId', command_id_value, 'incidentId', incident_record.id,
      'incidentVersion', next_incident_version, 'decisionId', decision_id_value,
      'state', case when requested_posture is null then 'resolved' else 'active' end,
      'posture', requested_posture
    ),
    created_at_value
  );
  return query select
    1, command_id_value, incident_record.id, next_incident_version, decision_id_value,
    case when requested_posture is null then 'resolved' else 'active' end,
    requested_posture, false;
exception
  when others then
    if SQLSTATE in ('AS103', 'AS104', 'AS106', 'AS107', 'AS108', 'AS109') then
      raise;
    end if;
    raise exception 'security_persistence_failed' using errcode = 'AS199';
end;
$function$;

alter function public.execute_security_incident_command(uuid, jsonb, text) owner to postgres;
revoke all on function public.execute_security_incident_command(uuid, jsonb, text)
from public, anon, service_role, ai_stage_worker, collection_worker,
  collection_queue_worker, collection_schedule_admin, promotion_service;
grant execute on function public.execute_security_incident_command(uuid, jsonb, text)
to authenticated;

create function public.set_security_indicator_disclosure(
  p_indicator_id uuid,
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "indicatorId" uuid,
  "indicatorVersion" bigint,
  decision text,
  "publicSafe" boolean,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  requested_reviewer_id uuid;
  receipt_record public.security_review_commands%rowtype;
  requested_decision text;
  requested_reason text;
  requested_note text;
  input_hash_value text;
  current_indicator_version bigint;
  next_indicator_version bigint;
  target_type_value text;
  target_id_value uuid;
  public_safe_value boolean;
  command_id_value uuid := extensions.gen_random_uuid();
  created_at_value timestamptz := pg_catalog.transaction_timestamp();
  occurred_at_text text;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null
    or not public.actor_has_active_security_role(requested_reviewer_id)
  then
    raise exception 'security_reviewer_required' using errcode = 'AS104';
  end if;

  if p_indicator_id is null
    or p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'indicatorId', 'expectedIndicatorVersion', 'decision', 'reasonCode', 'note']
    )
    or pg_catalog.jsonb_typeof(p_command_payload -> 'version') <> 'number'
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'indicatorId')
    or pg_catalog.lower(p_command_payload ->> 'indicatorId') <> p_indicator_id::text
    or not public.security_json_positive_bigint_is_valid(p_command_payload, 'expectedIndicatorVersion')
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
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  requested_decision := p_command_payload ->> 'decision';
  requested_reason := p_command_payload ->> 'reasonCode';
  requested_note := p_command_payload ->> 'note';
  if (requested_decision = 'publish' and requested_reason <> 'safe_for_public_warning')
    or (requested_decision = 'withdraw'
      and requested_reason not in ('sensitive_indicator', 'disclosure_no_longer_needed'))
    or requested_decision not in ('publish', 'withdraw')
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;
  public_safe_value := requested_decision = 'publish';

  input_hash_value := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'set_indicator_disclosure', 'payload', p_command_payload)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'security-command:' || requested_reviewer_id::text || ':' ||
      pg_catalog.char_length(p_idempotency_key)::text || ':' || p_idempotency_key,
      0
    )
  );
  select receipt.* into receipt_record
  from public.security_review_commands as receipt
  where receipt.reviewer_user_id = requested_reviewer_id
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if receipt_record.operation <> 'set_indicator_disclosure'
      or receipt_record.input_hash <> input_hash_value
    then
      raise exception 'security_idempotency_conflict' using errcode = 'AS107';
    end if;
    return query select
      1, receipt_record.id, receipt_record.aggregate_id,
      receipt_record.resulting_indicator_version,
      receipt_record.result_payload ->> 'decision',
      (receipt_record.result_payload ->> 'publicSafe')::boolean,
      true;
    return;
  end if;

  if not exists (select 1 from public.security_indicators as indicator where indicator.id = p_indicator_id) then
    raise exception 'security_indicator_not_found' using errcode = 'AS105';
  end if;

  select incident.target_type, coalesce(incident.project_id, incident.source_id)
  into target_type_value, target_id_value
  from public.security_incident_indicator_links as incident_indicator
  join public.security_incidents as incident on incident.id = incident_indicator.incident_id
  join public.security_incident_decisions as linked_decision
    on linked_decision.id = incident_indicator.linked_by_decision_id
  where incident_indicator.indicator_id = p_indicator_id
  order by linked_decision.created_at desc, linked_decision.id desc
  limit 1;
  if not found then
    raise exception 'security_target_mismatch' using errcode = 'AS109';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    public.security_target_lock_key_v1(target_type_value, target_id_value)
  );

  select coalesce(max(event.aggregate_version), 1)
  into current_indicator_version
  from public.security_events as event
  where event.aggregate_type = 'indicator'
    and event.aggregate_id = p_indicator_id;
  if current_indicator_version <> (p_command_payload ->> 'expectedIndicatorVersion')::bigint then
    raise exception 'security_version_conflict' using errcode = 'AS106';
  end if;
  next_indicator_version := current_indicator_version + 1;
  occurred_at_text := pg_catalog.to_char(
    created_at_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  insert into public.security_events (
    event_type, aggregate_type, aggregate_id, aggregate_version, indicator_id,
    actor_kind, actor_user_id, indicator_public_safe, payload, occurred_at, created_at
  ) values (
    'indicator_disclosure_changed', 'indicator', p_indicator_id, next_indicator_version,
    p_indicator_id, 'reviewer', requested_reviewer_id, public_safe_value,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'security.indicator.disclosure_changed.v1',
      'indicatorId', p_indicator_id,
      'decision', requested_decision
    ),
    created_at_value, created_at_value
  );
  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version, event_type, payload,
    occurred_at, created_at
  ) values (
    'security_indicator', p_indicator_id, next_indicator_version,
    'security.indicator.disclosure_changed.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'security.indicator.disclosure_changed.v1',
      'aggregateId', p_indicator_id,
      'aggregateVersion', next_indicator_version,
      'target', pg_catalog.jsonb_build_object('type', target_type_value, 'id', target_id_value),
      'indicatorId', p_indicator_id,
      'occurredAt', occurred_at_text
    ),
    created_at_value, created_at_value
  );
  insert into public.security_review_commands (
    id, reviewer_user_id, operation, aggregate_type, aggregate_id,
    idempotency_key, input_hash, expected_indicator_version,
    resulting_indicator_version, indicator_id, result_payload, created_at
  ) values (
    command_id_value, requested_reviewer_id, 'set_indicator_disclosure',
    'indicator', p_indicator_id, p_idempotency_key, input_hash_value,
    current_indicator_version, next_indicator_version, p_indicator_id,
    pg_catalog.jsonb_build_object(
      'version', 1, 'commandId', command_id_value, 'indicatorId', p_indicator_id,
      'indicatorVersion', next_indicator_version, 'decision', requested_decision,
      'publicSafe', public_safe_value
    ),
    created_at_value
  );
  return query select
    1, command_id_value, p_indicator_id, next_indicator_version,
    requested_decision, public_safe_value, false;
exception
  when others then
    if SQLSTATE in ('AS104', 'AS105', 'AS106', 'AS107', 'AS108', 'AS109') then
      raise;
    end if;
    raise exception 'security_persistence_failed' using errcode = 'AS199';
end;
$function$;

alter function public.set_security_indicator_disclosure(uuid, jsonb, text) owner to postgres;
revoke all on function public.set_security_indicator_disclosure(uuid, jsonb, text)
from public, anon, service_role, ai_stage_worker, collection_worker,
  collection_queue_worker, collection_schedule_admin, promotion_service;
grant execute on function public.set_security_indicator_disclosure(uuid, jsonb, text)
to authenticated;

create function public.list_security_candidates(
  p_origin text,
  p_state text,
  p_target_type text,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns table (
  version integer,
  "candidateId" uuid,
  origin text,
  state text,
  "stateVersion" bigint,
  target jsonb,
  summary text,
  "createdAt" timestamptz,
  "reviewedAt" timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  requested_reviewer_id uuid;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null
    or not public.actor_has_active_security_role(requested_reviewer_id)
  then
    raise exception 'security_reviewer_required' using errcode = 'AS104';
  end if;
  if p_origin is null or p_origin not in ('all', 'extraction', 'reviewer_manual')
    or p_state is null or p_state not in ('all', 'pending', 'needs_review', 'accepted', 'rejected')
    or p_target_type is null or p_target_type not in ('all', 'project', 'source')
    or (p_cursor_created_at is null) <> (p_cursor_id is null)
    or p_limit is null or p_limit not between 1 and 100
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  return query
  select
    1,
    candidate.id,
    candidate.origin,
    current_state.state,
    current_state.state_version,
    case
      when candidate.origin = 'reviewer_manual'
        and pg_catalog.jsonb_typeof(candidate.payload -> 'target') = 'object'
        and candidate.payload -> 'target' ->> 'type' in ('project', 'source')
        and public.security_json_uuid_is_valid(candidate.payload -> 'target', 'id')
      then candidate.payload -> 'target'
      else null
    end,
    candidate.payload ->> 'summary',
    candidate.created_at,
    current_state.reviewed_at
  from public.security_indicator_candidates as candidate
  cross join lateral public.security_current_candidate_state(candidate.id) as current_state
  where (p_origin = 'all' or candidate.origin = p_origin)
    and (p_state = 'all' or current_state.state = p_state)
    and (
      p_target_type = 'all'
      or (candidate.origin = 'reviewer_manual'
        and candidate.payload -> 'target' ->> 'type' = p_target_type)
      or (candidate.origin = 'extraction' and p_target_type in ('project', 'source'))
    )
    and (
      p_cursor_created_at is null
      or (candidate.created_at, candidate.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by candidate.created_at desc, candidate.id desc
  limit p_limit;
end;
$function$;

create function public.get_security_candidate(p_candidate_id uuid)
returns table (
  version integer,
  "candidateId" uuid,
  origin text,
  state text,
  "stateVersion" bigint,
  target jsonb,
  "targetContext" jsonb,
  indicator jsonb,
  summary text,
  "evidenceId" uuid,
  note text,
  "submittedByUserId" uuid,
  "createdAt" timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  requested_reviewer_id uuid;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null
    or not public.actor_has_active_security_role(requested_reviewer_id)
  then
    raise exception 'security_reviewer_required' using errcode = 'AS104';
  end if;
  if p_candidate_id is null then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  return query
  select
    1,
    candidate.id,
    candidate.origin,
    current_state.state,
    current_state.state_version,
    case when candidate.origin = 'reviewer_manual' then candidate.payload -> 'target' else null end,
    case when candidate.origin = 'extraction' then candidate.payload -> 'targetContext' else null end,
    case when candidate.origin = 'reviewer_manual' then candidate.payload -> 'indicator' else null end,
    candidate.payload ->> 'summary',
    coalesce(
      candidate.manual_evidence_id,
      case when candidate.origin = 'reviewer_manual'
        then (candidate.payload ->> 'evidenceId')::uuid else null end
    ),
    candidate.payload ->> 'note',
    candidate.submitted_by_user_id,
    candidate.created_at
  from public.security_indicator_candidates as candidate
  cross join lateral public.security_current_candidate_state(candidate.id) as current_state
  where candidate.id = p_candidate_id;
  if not found then
    raise exception 'security_candidate_not_found' using errcode = 'AS101';
  end if;
end;
$function$;

create function public.list_security_incidents(
  p_state text,
  p_target_type text,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns table (
  version integer,
  "incidentId" uuid,
  target jsonb,
  category text,
  "currentSeverity" text,
  "publicSummary" text,
  "incidentVersion" bigint,
  "openedAt" timestamptz,
  "lastDecisionAt" timestamptz,
  state text,
  "currentPosture" text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  requested_reviewer_id uuid;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null
    or not public.actor_has_active_security_role(requested_reviewer_id)
  then
    raise exception 'security_reviewer_required' using errcode = 'AS104';
  end if;
  if p_state is null or p_state not in ('all', 'active', 'resolved')
    or p_target_type is null or p_target_type not in ('all', 'project', 'source')
    or (p_cursor_created_at is null) <> (p_cursor_id is null)
    or p_limit is null or p_limit not between 1 and 100
  then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  return query
  select
    1,
    incident.id,
    pg_catalog.jsonb_build_object(
      'type', incident.target_type,
      'id', coalesce(incident.project_id, incident.source_id)
    ),
    incident.category,
    current_decision.resulting_severity,
    current_decision.public_summary,
    current_decision.incident_version,
    incident.opened_at,
    current_decision.created_at,
    case when current_decision.resulting_posture is null then 'resolved' else 'active' end,
    current_decision.resulting_posture
  from public.security_incidents as incident
  cross join lateral public.security_current_incident_decision(incident.id) as current_decision
  where (p_state = 'all'
      or (p_state = 'active' and current_decision.resulting_posture is not null)
      or (p_state = 'resolved' and current_decision.resulting_posture is null))
    and (p_target_type = 'all' or incident.target_type = p_target_type)
    and (
      p_cursor_created_at is null
      or (current_decision.created_at, incident.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by current_decision.created_at desc, incident.id desc
  limit p_limit;
end;
$function$;

create function public.get_security_incident(p_incident_id uuid)
returns table (
  version integer,
  incident jsonb,
  "indicatorIds" uuid[],
  decisions jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  requested_reviewer_id uuid;
begin
  requested_reviewer_id := auth.uid();
  if requested_reviewer_id is null
    or not public.actor_has_active_security_role(requested_reviewer_id)
  then
    raise exception 'security_reviewer_required' using errcode = 'AS104';
  end if;
  if p_incident_id is null then
    raise exception 'security_command_invalid' using errcode = 'AS108';
  end if;

  return query
  select
    1,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'incidentId', incident.id,
      'target', pg_catalog.jsonb_build_object(
        'type', incident.target_type,
        'id', coalesce(incident.project_id, incident.source_id)
      ),
      'category', incident.category,
      'currentSeverity', current_decision.resulting_severity,
      'publicSummary', current_decision.public_summary,
      'incidentVersion', current_decision.incident_version,
      'openedAt', incident.opened_at,
      'lastDecisionAt', current_decision.created_at,
      'state', case when current_decision.resulting_posture is null then 'resolved' else 'active' end,
      'currentPosture', current_decision.resulting_posture
    ),
    coalesce(indicators.indicator_ids, '{}'::uuid[]),
    coalesce(history.decisions, '[]'::jsonb)
  from public.security_incidents as incident
  cross join lateral public.security_current_incident_decision(incident.id) as current_decision
  left join lateral (
    select pg_catalog.array_agg(link.indicator_id order by link.indicator_id) as indicator_ids
    from public.security_incident_indicator_links as link
    where link.incident_id = incident.id
  ) as indicators on true
  left join lateral (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'version', 1,
        'decisionId', decision.id,
        'incidentVersion', decision.incident_version,
        'action', decision.action,
        'reasonCode', decision.reason_code,
        'resultingPosture', decision.resulting_posture,
        'resultingSeverity', decision.resulting_severity,
        'publicSummary', decision.public_summary,
        'note', decision.note,
        'evidenceId', decision.evidence_id,
        'reviewerUserId', decision.reviewer_user_id,
        'createdAt', decision.created_at
      ) order by decision.incident_version asc, decision.id asc
    ) as decisions
    from public.security_incident_decisions as decision
    where decision.incident_id = incident.id
  ) as history on true
  where incident.id = p_incident_id;
  if not found then
    raise exception 'security_incident_not_found' using errcode = 'AS103';
  end if;
end;
$function$;

alter function public.list_security_candidates(text, text, text, timestamptz, uuid, integer) owner to postgres;
alter function public.get_security_candidate(uuid) owner to postgres;
alter function public.list_security_incidents(text, text, timestamptz, uuid, integer) owner to postgres;
alter function public.get_security_incident(uuid) owner to postgres;

revoke all on function public.list_security_candidates(text, text, text, timestamptz, uuid, integer)
from public, anon, service_role, ai_stage_worker, collection_worker,
  collection_queue_worker, collection_schedule_admin, promotion_service;
revoke all on function public.get_security_candidate(uuid)
from public, anon, service_role, ai_stage_worker, collection_worker,
  collection_queue_worker, collection_schedule_admin, promotion_service;
revoke all on function public.list_security_incidents(text, text, timestamptz, uuid, integer)
from public, anon, service_role, ai_stage_worker, collection_worker,
  collection_queue_worker, collection_schedule_admin, promotion_service;
revoke all on function public.get_security_incident(uuid)
from public, anon, service_role, ai_stage_worker, collection_worker,
  collection_queue_worker, collection_schedule_admin, promotion_service;
grant execute on function public.list_security_candidates(text, text, text, timestamptz, uuid, integer)
to authenticated;
grant execute on function public.get_security_candidate(uuid) to authenticated;
grant execute on function public.list_security_incidents(text, text, timestamptz, uuid, integer)
to authenticated;
grant execute on function public.get_security_incident(uuid) to authenticated;

-- Ordinary intelligence keeps its own data and history, but its final review
-- decision observes the shared security target locks. This trigger is inside
-- the existing protected Promotion transaction, so a restriction that commits
-- first fails the ordinary command closed and a promotion that holds the lock
-- remains historical data that predates the restriction.
create function public.enforce_ordinary_promotion_security_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  candidate_record public.extraction_candidates%rowtype;
  project_posture text;
  source_posture text;
begin
  select candidate.* into candidate_record
  from public.extraction_candidates as candidate
  where candidate.id = new.candidate_id;

  if not found
    or candidate_record.project_id is null
    or candidate_record.source_id is null
  then
    raise exception 'security_promotion_blocked' using errcode = 'AS112';
  end if;

  if candidate_record.payload ->> 'claimType' in ('security_risk', 'scam_indicator') then
    raise exception 'security_review_required' using errcode = 'AS111';
  end if;

  -- Restriction posture governs ordinary canonical promotion. Existing
  -- reviewers may still reject or request review for non-security candidates.
  if new.decision <> 'approve' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.security_target_lock_key_v1('project', candidate_record.project_id)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    public.security_target_lock_key_v1('source', candidate_record.source_id)
  );

  project_posture := public.current_security_target_posture('project', candidate_record.project_id);
  source_posture := public.current_security_target_posture('source', candidate_record.source_id);
  if project_posture = 'blocked' or source_posture = 'blocked' then
    raise exception 'security_promotion_blocked' using errcode = 'AS112';
  end if;

  if (project_posture = 'caution' or source_posture = 'caution')
    and not public.actor_has_active_security_role(new.reviewer_user_id)
  then
    raise exception 'security_reviewer_required' using errcode = 'AS104';
  end if;

  return new;
end;
$function$;

alter function public.enforce_ordinary_promotion_security_gate() owner to postgres;
revoke all on function public.enforce_ordinary_promotion_security_gate() from public;

create trigger candidate_review_decisions_enforce_security_gate
before insert on public.candidate_review_decisions
for each row execute function public.enforce_ordinary_promotion_security_gate();

-- A blocked source remains historical Evidence for the Security Ledger, but
-- never counts as ordinary public or scoring Evidence.
create or replace function public.signal_has_valid_evidence(p_signal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.signals as signal
    join public.signal_evidence_links as evidence_link
      on evidence_link.signal_id = signal.id
    join public.evidence as evidence_record
      on evidence_record.id = evidence_link.evidence_id
    join public.raw_items as raw_item
      on raw_item.id = evidence_record.raw_item_id
    left join public.discovered_items as discovered_item
      on discovered_item.id = evidence_record.discovered_item_id
    where signal.id = p_signal_id
      and raw_item.project_id = signal.project_id
      and raw_item.source_id = evidence_record.source_id
      and public.current_security_target_posture('source', evidence_record.source_id) <> 'blocked'
      and (
        evidence_record.discovered_item_id is null
        or (
          discovered_item.project_id = signal.project_id
          and discovered_item.source_id = evidence_record.source_id
          and (
            evidence_record.source_field <> 'discovered_summary'
            or discovered_item.feed_raw_item_id = evidence_record.raw_item_id
          )
        )
      )
  );
$function$;

create or replace function public.current_score_citation_path_is_public(
  p_project_score_id uuid,
  p_signal_id uuid,
  p_evidence_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    (p_project_score_id is not null or p_signal_id is not null or p_evidence_id is not null)
    and exists (
      select 1
      from public.project_scores as score
      join public.projects as project on project.id = score.project_id
      join public.score_signal_links as score_link on score_link.project_score_id = score.id
      join public.signals as signal
        on signal.id = score_link.signal_id and signal.project_id = score.project_id
      join public.signal_evidence_links as evidence_link on evidence_link.signal_id = signal.id
      join public.evidence as evidence_record on evidence_record.id = evidence_link.evidence_id
      join public.raw_items as raw_item
        on raw_item.id = evidence_record.raw_item_id
        and raw_item.project_id = score.project_id
        and raw_item.source_id = evidence_record.source_id
      left join public.discovered_items as discovered_item
        on discovered_item.id = evidence_record.discovered_item_id
      join public.sources as source
        on source.id = evidence_record.source_id and source.status = 'active'
      join public.project_sources as project_source
        on project_source.project_id = score.project_id
        and project_source.source_id = evidence_record.source_id
      where project.lifecycle = 'active'
        and public.current_project_score_is_public(score.id)
        and signal.lifecycle = 'published'
        and public.signal_has_valid_evidence(signal.id)
        and public.current_security_target_posture('source', evidence_record.source_id) <> 'blocked'
        and (
          evidence_record.discovered_item_id is null
          or (
            discovered_item.project_id = signal.project_id
            and discovered_item.source_id = evidence_record.source_id
            and (
              evidence_record.source_field <> 'discovered_summary'
              or discovered_item.feed_raw_item_id = evidence_record.raw_item_id
            )
          )
        )
        and (p_project_score_id is null or score.id = p_project_score_id)
        and (p_signal_id is null or signal.id = p_signal_id)
        and (p_evidence_id is null or evidence_record.id = p_evidence_id)
    );
$function$;

create or replace function public.score_has_complete_evidence(p_project_score_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    exists (
      select 1
      from public.score_signal_links as score_link
      where score_link.project_score_id = p_project_score_id
    )
    and not exists (
      select 1
      from public.score_signal_links as score_link
      where score_link.project_score_id = p_project_score_id
        and not public.signal_has_valid_evidence(score_link.signal_id)
    );
$function$;

alter function public.signal_has_valid_evidence(uuid) owner to postgres;
alter function public.score_has_complete_evidence(uuid) owner to postgres;
revoke all on function public.signal_has_valid_evidence(uuid) from public;
revoke all on function public.score_has_complete_evidence(uuid) from public;
grant execute on function public.signal_has_valid_evidence(uuid)
to anon, authenticated, service_role, ai_stage_worker;
grant execute on function public.score_has_complete_evidence(uuid)
to anon, authenticated, service_role, ai_stage_worker;

create or replace function public.is_source_collection_eligible(project_id uuid, source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
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
      and public.current_security_target_posture('source', source_record.id) <> 'blocked'
  );
$function$;

create or replace function public.load_source_collection_context(
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
as $function$
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
    and source_record.status = 'active'
    and public.current_security_target_posture('source', source_record.id) <> 'blocked';
end;
$function$;

alter function public.is_source_collection_eligible(uuid, uuid) owner to postgres;
alter function public.load_source_collection_context(uuid, uuid) owner to postgres;
revoke all on function public.is_source_collection_eligible(uuid, uuid)
from public, anon, authenticated, service_role, collection_worker,
  collection_queue_worker, collection_schedule_admin;
revoke all on function public.load_source_collection_context(uuid, uuid)
from public, anon, authenticated, service_role, collection_queue_worker,
  collection_schedule_admin;
grant execute on function public.is_source_collection_eligible(uuid, uuid)
to collection_queue_worker;
grant execute on function public.load_source_collection_context(uuid, uuid)
to collection_worker;

-- Public projections stay invoker-safe. Browser roles receive only the exact
-- base columns used by these views, and RLS admits catalog-visible incident
-- rows plus individually approved indicator rows.
create function public.security_indicator_currently_public_safe(p_indicator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select coalesce((
    select event.indicator_public_safe
    from public.security_events as event
    where event.event_type = 'indicator_disclosure_changed'
      and event.aggregate_type = 'indicator'
      and event.aggregate_id = p_indicator_id
      and event.indicator_id = p_indicator_id
    order by event.aggregate_version desc, event.created_at desc, event.id desc
    limit 1
  ), false);
$function$;

alter function public.security_indicator_currently_public_safe(uuid) owner to postgres;
revoke all on function public.security_indicator_currently_public_safe(uuid) from public;
grant execute on function public.security_indicator_currently_public_safe(uuid)
to anon, authenticated;

create policy security_incidents_select_anon
on public.security_incidents
for select
to anon
using (
  (target_type = 'project' and exists (
    select 1 from public.projects as project
    where project.id = security_incidents.project_id
      and project.lifecycle in ('active', 'rumored')
  ))
  or (target_type = 'source' and exists (
    select 1 from public.sources as source
    where source.id = security_incidents.source_id and source.status = 'active'
  ))
);
create policy security_incidents_select_authenticated
on public.security_incidents for select to authenticated
using (
  (target_type = 'project' and exists (
    select 1 from public.projects as project
    where project.id = security_incidents.project_id
      and project.lifecycle in ('active', 'rumored')
  ))
  or (target_type = 'source' and exists (
    select 1 from public.sources as source
    where source.id = security_incidents.source_id and source.status = 'active'
  ))
);

create policy security_incident_decisions_select_anon
on public.security_incident_decisions
for select
to anon
using (exists (
  select 1
  from public.security_incidents as incident
  where incident.id = security_incident_decisions.incident_id
));
create policy security_incident_decisions_select_authenticated
on public.security_incident_decisions for select to authenticated
using (exists (
  select 1 from public.security_incidents as incident
  where incident.id = security_incident_decisions.incident_id
));

create policy security_indicators_select_anon
on public.security_indicators
for select
to anon
using (public.security_indicator_currently_public_safe(id));
create policy security_indicators_select_authenticated
on public.security_indicators for select to authenticated
using (public.security_indicator_currently_public_safe(id));

create policy security_incident_indicator_links_select_anon
on public.security_incident_indicator_links
for select
to anon
using (
  exists (
    select 1 from public.security_incidents as incident
    where incident.id = security_incident_indicator_links.incident_id
  )
  and exists (
    select 1 from public.security_indicators as indicator
    where indicator.id = security_incident_indicator_links.indicator_id
  )
);
create policy security_incident_indicator_links_select_authenticated
on public.security_incident_indicator_links for select to authenticated
using (
  exists (
    select 1 from public.security_incidents as incident
    where incident.id = security_incident_indicator_links.incident_id
  )
  and exists (
    select 1 from public.security_indicators as indicator
    where indicator.id = security_incident_indicator_links.indicator_id
  )
);

comment on policy security_incidents_select_anon on public.security_incidents is
  'Anonymous users may read safe columns for catalog-visible security targets.';
comment on policy security_incidents_select_authenticated on public.security_incidents is
  'Authenticated browser users may read safe columns for catalog-visible security targets.';
comment on policy security_incident_decisions_select_anon on public.security_incident_decisions is
  'Anonymous users may read current/public incident decision columns through visible incidents.';
comment on policy security_incident_decisions_select_authenticated on public.security_incident_decisions is
  'Authenticated browser users may read current/public incident decision columns through visible incidents.';
comment on policy security_indicators_select_anon on public.security_indicators is
  'Anonymous users may read only individually approved public-safe indicator rows.';
comment on policy security_indicators_select_authenticated on public.security_indicators is
  'Authenticated browser users may read only individually approved public-safe indicator rows.';
comment on policy security_incident_indicator_links_select_anon on public.security_incident_indicator_links is
  'Anonymous users may read only links between visible incidents and public-safe indicators.';
comment on policy security_incident_indicator_links_select_authenticated on public.security_incident_indicator_links is
  'Authenticated browser users may read only links between visible incidents and public-safe indicators.';

grant select (id, target_type, project_id, source_id, category, opened_at)
on public.security_incidents to anon, authenticated;
grant select (
  id, incident_id, incident_version, resulting_posture, resulting_severity,
  public_summary, created_at
)
on public.security_incident_decisions to anon, authenticated;
grant select (id, indicator_type, value_text)
on public.security_indicators to anon, authenticated;
grant select (incident_id, indicator_id)
on public.security_incident_indicator_links to anon, authenticated;

create view public.public_safe_security_indicators
with (security_invoker = true, security_barrier = true)
as
select indicator.id, indicator.indicator_type as type, indicator.value_text as value
from public.security_indicators as indicator;

create view public.public_security_incident_summaries
with (security_invoker = true, security_barrier = true)
as
select
  version,
  incident_id,
  target_type,
  target_id,
  category,
  severity,
  state,
  public_summary,
  first_observed_at,
  last_verified_at,
  indicators
from (
  select
    1 as version,
    incident.id as incident_id,
    incident.target_type,
    coalesce(incident.project_id, incident.source_id) as target_id,
    incident.category,
    current_decision.resulting_severity as severity,
    case when current_decision.resulting_posture is null then 'resolved' else 'active' end as state,
    current_decision.public_summary,
    incident.opened_at as first_observed_at,
    current_decision.created_at as last_verified_at,
    coalesce(safe_indicators.indicators, '[]'::jsonb) as indicators
  from public.security_incidents as incident
  join lateral (
    select decision.resulting_posture, decision.resulting_severity,
      decision.public_summary, decision.created_at
    from public.security_incident_decisions as decision
    where decision.incident_id = incident.id
    order by decision.incident_version desc, decision.id desc
    limit 1
  ) as current_decision on true
  left join lateral (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', indicator.id, 'type', indicator.indicator_type, 'value', indicator.value_text
      ) order by indicator.indicator_type asc, indicator.id asc
    ) as indicators
    from public.security_incident_indicator_links as link
    join public.security_indicators as indicator on indicator.id = link.indicator_id
    where link.incident_id = incident.id
  ) as safe_indicators on true
) as public_summary;

create view public.public_project_security_state
with (security_invoker = true, security_barrier = true)
as
select
  1 as version,
  project.id as project_id,
  coalesce(project_posture.posture, 'clear') as posture,
  coalesce(active_incidents.incidents, '[]'::jsonb) as active_incidents
from public.projects as project
left join lateral (
  select case pg_catalog.max(case latest.resulting_posture
    when 'blocked' then 2 when 'caution' then 1 else 0 end)
    when 2 then 'blocked' when 1 then 'caution' else 'clear' end as posture
  from public.security_incidents as incident
  join lateral (
    select decision.resulting_posture
    from public.security_incident_decisions as decision
    where decision.incident_id = incident.id
    order by decision.incident_version desc, decision.id desc
    limit 1
  ) as latest on latest.resulting_posture is not null
  where incident.target_type = 'project' and incident.project_id = project.id
) as project_posture on true
left join lateral (
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'version', summary.version,
      'incidentId', summary.incident_id,
      'target', pg_catalog.jsonb_build_object('type', summary.target_type, 'id', summary.target_id),
      'category', summary.category,
      'severity', summary.severity,
      'state', summary.state,
      'publicSummary', summary.public_summary,
      'firstObservedAt', summary.first_observed_at,
      'lastVerifiedAt', summary.last_verified_at,
      'indicators', summary.indicators
    ) order by summary.last_verified_at desc, summary.incident_id desc
  ) as incidents
  from public.public_security_incident_summaries as summary
  where summary.target_type = 'project'
    and summary.target_id = project.id
    and summary.state = 'active'
) as active_incidents on true;

create view public.public_blocked_projects
with (security_invoker = true, security_barrier = true)
as
with ranked_restrictions as (
  select
    incident.id as incident_id,
    incident.project_id as target_id,
    incident.category,
    latest.resulting_severity as severity,
    latest.public_summary,
    incident.opened_at as first_observed_at,
    latest.created_at as last_verified_at,
    coalesce(safe_indicators.indicators, '[]'::jsonb) as indicators,
    pg_catalog.row_number() over (
      partition by incident.project_id
      order by latest.created_at desc, incident.id desc
    ) as restriction_rank
  from public.security_incidents as incident
  join lateral (
    select decision.resulting_posture, decision.resulting_severity,
      decision.public_summary, decision.created_at
    from public.security_incident_decisions as decision
    where decision.incident_id = incident.id
    order by decision.incident_version desc, decision.id desc
    limit 1
  ) as latest on latest.resulting_posture = 'blocked'
  left join lateral (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', indicator.id, 'type', indicator.indicator_type, 'value', indicator.value_text
      ) order by indicator.indicator_type asc, indicator.id asc
    ) as indicators
    from public.security_incident_indicator_links as link
    join public.security_indicators as indicator on indicator.id = link.indicator_id
    where link.incident_id = incident.id
  ) as safe_indicators on true
  where incident.target_type = 'project'
)
select
  1 as version,
  project.id as project_id,
  project.slug as project_slug,
  project.name as project_name,
  'blocked'::text as posture,
  restricted.category,
  restricted.severity,
  restricted.public_summary,
  restricted.first_observed_at,
  restricted.last_verified_at,
  restricted.last_verified_at as restricted_at,
  'project'::text as target_type,
  project.id as target_id,
  restricted.indicators
from ranked_restrictions as restricted
join public.projects as project
  on project.id = restricted.target_id
where restricted.restriction_rank = 1
  and project.lifecycle in ('active', 'rumored')
order by restricted.last_verified_at desc, project.id desc;

comment on view public.public_safe_security_indicators is
  'Public-safe inert indicator values whose latest disclosure decision is publish.';
comment on view public.public_security_incident_summaries is
  'Public incident history without reviewer identity, Evidence, candidate, or internal-note fields.';
comment on view public.public_project_security_state is
  'Project-only derived posture and public active incident summaries.';
comment on view public.public_blocked_projects is
  'One newest active blocked project restriction per catalog-visible project.';

revoke all on table public.public_safe_security_indicators
from public, anon, authenticated, service_role;
revoke all on table public.public_security_incident_summaries
from public, anon, authenticated, service_role;
revoke all on table public.public_project_security_state
from public, anon, authenticated, service_role;
revoke all on table public.public_blocked_projects
from public, anon, authenticated, service_role;
grant select on table public.public_safe_security_indicators to anon, authenticated;
grant select on table public.public_security_incident_summaries to anon, authenticated;
grant select on table public.public_project_security_state to anon, authenticated;
grant select on table public.public_blocked_projects to anon, authenticated;

-- Keep the immutable score identity and historical score values intact. The
-- new posture is appended so existing current-state column order is stable.
create or replace view public.project_current_state
with (security_invoker = true, security_barrier = true)
as
select
  project.id as project_id,
  project.slug,
  project.name,
  project.summary,
  project.lifecycle,
  project.primary_chain,
  project.version as project_version,
  project.updated_at as project_updated_at,
  latest_score.opportunity_score,
  latest_score.risk_score,
  latest_score.confidence as score_confidence,
  latest_score.recommendation,
  latest_score.calculated_at as score_calculated_at,
  latest_signal.latest_published_signal_at,
  project.official_website_url,
  latest_score.model_version as score_model_version,
  latest_score.input_version as score_input_version,
  latest_score.explanation as score_explanation,
  latest_score.id as project_score_id,
  coalesce(project_posture.posture, 'clear') as security_posture
from public.projects as project
left join lateral (
  select case pg_catalog.max(case latest.resulting_posture
    when 'blocked' then 2 when 'caution' then 1 else 0 end)
    when 2 then 'blocked' when 1 then 'caution' else 'clear' end as posture
  from public.security_incidents as incident
  join lateral (
    select decision.resulting_posture
    from public.security_incident_decisions as decision
    where decision.incident_id = incident.id
    order by decision.incident_version desc, decision.id desc
    limit 1
  ) as latest on latest.resulting_posture is not null
  where incident.target_type = 'project' and incident.project_id = project.id
) as project_posture on true
left join lateral (
  select
    score.id,
    score.opportunity_score,
    score.risk_score,
    score.confidence,
    score.recommendation,
    score.model_version,
    score.input_version,
    score.explanation,
    score.calculated_at
  from public.project_scores as score
  where score.project_id = project.id
    and public.score_has_complete_evidence(score.id)
  order by score.calculated_at desc, score.id desc
  limit 1
) as latest_score on true
left join lateral (
  select pg_catalog.max(signal.published_at) as latest_published_signal_at
  from public.signals as signal
  where signal.project_id = project.id
    and signal.lifecycle = 'published'::public.signal_lifecycle
    and public.signal_has_valid_evidence(signal.id)
) as latest_signal on true;

create or replace view public.opportunity_list
with (security_invoker = true, security_barrier = true)
as
select
  current_state.project_id,
  current_state.slug,
  current_state.name,
  current_state.summary,
  current_state.lifecycle,
  current_state.primary_chain,
  current_state.opportunity_score,
  current_state.risk_score,
  current_state.score_confidence as confidence,
  current_state.recommendation,
  current_state.score_calculated_at as calculated_at,
  current_state.latest_published_signal_at,
  current_state.security_posture
from public.project_current_state as current_state
where current_state.lifecycle in ('active', 'rumored')
  and current_state.opportunity_score is not null
  and current_state.security_posture <> 'blocked'
order by current_state.opportunity_score desc, current_state.project_id asc;

comment on view public.project_current_state is
  'Browser-safe project state with immutable score history and derived project security posture.';
comment on view public.opportunity_list is
  'Evidence-complete scored opportunities excluding blocked project posture before ordering.';

revoke all on table public.project_current_state
from public, anon, authenticated, service_role;
revoke all on table public.opportunity_list
from public, anon, authenticated, service_role;
grant select on table public.project_current_state
to anon, authenticated, service_role;
grant select on table public.opportunity_list to anon, authenticated;
