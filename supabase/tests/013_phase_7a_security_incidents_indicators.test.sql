begin;

select no_plan();

-- Phase 7A starts RED on the catalog boundary.  The later fixtures in this
-- file exercise the command and projection behavior after the migration exists.
select has_table('public', 'security_indicator_candidates', 'security candidate envelopes exist');
select has_table('public', 'security_candidate_review_decisions', 'security candidate decisions exist');
select has_table('public', 'security_indicators', 'canonical security indicators exist');
select has_table('public', 'security_indicator_evidence_links', 'security indicator Evidence links exist');
select has_table('public', 'security_incidents', 'security incident headers exist');
select has_table('public', 'security_incident_indicator_links', 'security incident indicator links exist');
select has_table('public', 'security_incident_decisions', 'security incident decision history exists');
select has_table('public', 'security_events', 'security audit and disclosure events exist');
select has_table('public', 'security_review_commands', 'security command receipts exist');

select has_function('public', 'current_security_target_posture', array['text', 'uuid'],
  'target posture helper exists');
select has_function('public', 'security_target_lock_key_v1', array['text', 'uuid'],
  'shared deterministic target lock helper exists');
select has_function('public', 'actor_has_active_security_role', array['uuid'],
  'security reviewer role helper exists');
select has_function('public', 'route_security_extraction_candidate', array['uuid'],
  'AI-only extraction candidate ingress exists');
select has_function('public', 'submit_manual_security_candidate', array['jsonb', 'text'],
  'bearer-scoped manual candidate command exists');
select has_function('public', 'execute_security_candidate_review', array['uuid', 'jsonb', 'text'],
  'bearer-scoped candidate decision command exists');
select has_function('public', 'open_security_incident', array['jsonb', 'text'],
  'bearer-scoped incident open command exists');
select has_function('public', 'execute_security_incident_command', array['uuid', 'jsonb', 'text'],
  'bearer-scoped incident command exists');
select has_function('public', 'set_security_indicator_disclosure', array['uuid', 'jsonb', 'text'],
  'bearer-scoped disclosure command exists');
select has_function('public', 'list_security_candidates', array['text', 'text', 'text', 'timestamp with time zone', 'uuid', 'integer'],
  'bearer-scoped security candidate list exists');
select has_function('public', 'get_security_candidate', array['uuid'],
  'bearer-scoped security candidate detail exists');
select has_function('public', 'list_security_incidents', array['text', 'text', 'timestamp with time zone', 'uuid', 'integer'],
  'bearer-scoped security incident list exists');
select has_function('public', 'get_security_incident', array['uuid'],
  'bearer-scoped security incident detail exists');

select has_view('public', 'public_project_security_state', 'public project posture view exists');
select has_view('public', 'public_security_incident_summaries', 'public incident summary view exists');
select has_view('public', 'public_safe_security_indicators', 'public safe indicator view exists');
select has_view('public', 'public_blocked_projects', 'public blocked-project view exists');

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'security_indicator_candidates'
    order by ordinal_position
  $$,
  $$ values
    ('id'::text collate "C"), ('origin'), ('extraction_candidate_id'), ('submitted_by_user_id'),
    ('project_id'), ('source_id'), ('manual_evidence_id'), ('payload'), ('created_at')
  $$,
  'security candidate envelopes have the exact immutable columns'
);

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'security_candidate_review_decisions'
    order by ordinal_position
  $$,
  $$ values
    ('id'::text collate "C"), ('candidate_id'), ('candidate_version'), ('reviewer_user_id'),
    ('decision'), ('reason_code'), ('note'), ('indicator_id'), ('incident_id'), ('created_at')
  $$,
  'candidate decision history has exact append-only columns'
);

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'security_indicators'
    order by ordinal_position
  $$,
  $$ values
    ('id'::text collate "C"), ('indicator_type'), ('value_text'), ('normalized_value_sha256'), ('created_at')
  $$,
  'canonical indicators retain the exact value and normalized hash identity'
);

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'security_indicator_evidence_links'
    order by ordinal_position
  $$,
  $$ values ('indicator_id'::text collate "C"), ('evidence_id'), ('created_at') $$,
  'indicator Evidence links retain only the append-only link identity'
);

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'security_incidents'
    order by ordinal_position
  $$,
  $$ values
    ('id'::text collate "C"), ('target_type'), ('project_id'), ('source_id'), ('category'),
    ('opened_at'), ('created_at')
  $$,
  'incident headers have one immutable target/category identity'
);

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'security_incident_indicator_links'
    order by ordinal_position
  $$,
  $$ values ('incident_id'::text collate "C"), ('indicator_id'), ('linked_by_decision_id'), ('created_at') $$,
  'incident indicator links retain the decision that attached them'
);

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'security_incident_decisions'
    order by ordinal_position
  $$,
  $$ values
    ('id'::text collate "C"), ('incident_id'), ('incident_version'), ('reviewer_user_id'),
    ('action'), ('reason_code'), ('resulting_posture'), ('resulting_severity'),
    ('public_summary'), ('note'), ('evidence_id'), ('created_at')
  $$,
  'incident decisions record complete immutable resulting state'
);

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'security_events'
    order by ordinal_position
  $$,
  $$ values
    ('id'::text collate "C"), ('event_type'), ('aggregate_type'), ('aggregate_id'),
    ('aggregate_version'), ('candidate_id'), ('indicator_id'), ('incident_id'),
    ('decision_id'), ('actor_kind'), ('actor_user_id'), ('actor_service_name'),
    ('indicator_public_safe'), ('payload'), ('occurred_at'), ('created_at')
  $$,
  'security events retain safe event identity and internal audit ownership'
);

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'security_review_commands'
    order by ordinal_position
  $$,
  $$ values
    ('id'::text collate "C"), ('reviewer_user_id'), ('operation'), ('aggregate_type'),
    ('aggregate_id'), ('idempotency_key'), ('input_hash'),
    ('expected_candidate_version'), ('resulting_candidate_version'),
    ('expected_incident_version'), ('resulting_incident_version'),
    ('expected_indicator_version'), ('resulting_indicator_version'),
    ('decision_id'), ('indicator_id'), ('incident_id'), ('result_payload'), ('created_at')
  $$,
  'security command receipts retain idempotency/version/result references only'
);

select ok(
  coalesce((
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = pg_catalog.to_regclass('public.' || expected.table_name)
  ), false),
  pg_catalog.format('%s has forced RLS', expected.table_name)
)
from (values
  ('security_indicator_candidates'),
  ('security_candidate_review_decisions'),
  ('security_indicators'),
  ('security_indicator_evidence_links'),
  ('security_incidents'),
  ('security_incident_indicator_links'),
  ('security_incident_decisions'),
  ('security_events'),
  ('security_review_commands')
) as expected(table_name);

select ok(
  coalesce((
    select exists (
      select 1
      from pg_catalog.pg_trigger as trigger_info
      where trigger_info.tgrelid = pg_catalog.to_regclass('public.' || expected.table_name)
        and not trigger_info.tgisinternal
        and trigger_info.tgname = expected.table_name || '_reject_mutation'
    )
  ), false),
  pg_catalog.format('%s has an append-only update/delete rejection trigger', expected.table_name)
)
from (values
  ('security_indicator_candidates'),
  ('security_candidate_review_decisions'),
  ('security_indicators'),
  ('security_indicator_evidence_links'),
  ('security_incidents'),
  ('security_incident_indicator_links'),
  ('security_incident_decisions'),
  ('security_events'),
  ('security_review_commands')
) as expected(table_name);

select ok(
  coalesce((
    select constraint_info.conname = expected.constraint_name
      and constraint_info.contype = expected.constraint_type
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = pg_catalog.to_regclass('public.' || expected.table_name)
      and constraint_info.conname = expected.constraint_name
  ), false),
  pg_catalog.format('%s exposes %s', expected.table_name, expected.constraint_name)
)
from (values
  ('security_indicator_candidates', 'security_indicator_candidates_extraction_candidate_key', 'u'),
  ('security_candidate_review_decisions', 'security_candidate_review_decisions_candidate_version_key', 'u'),
  ('security_indicators', 'security_indicators_type_normalized_key', 'u'),
  ('security_incident_decisions', 'security_incident_decisions_incident_version_key', 'u'),
  ('security_review_commands', 'security_review_commands_reviewer_key', 'u'),
  ('security_indicator_evidence_links', 'security_indicator_evidence_links_pkey', 'p'),
  ('security_incident_indicator_links', 'security_incident_indicator_links_pkey', 'p')
) as expected(table_name, constraint_name, constraint_type);

select ok(
  coalesce((
    select procedure_info.prosecdef
      and pg_catalog.pg_get_userbyid(procedure_info.proowner) = 'postgres'
      and procedure_info.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
    from pg_catalog.pg_proc as procedure_info
    where procedure_info.oid = pg_catalog.to_regprocedure(expected.signature)
  ), false),
  pg_catalog.format('%s is a postgres-owned fixed-search-path security definer', expected.signature)
)
from (values
  ('public.submit_manual_security_candidate(jsonb,text)'),
  ('public.execute_security_candidate_review(uuid,jsonb,text)'),
  ('public.open_security_incident(jsonb,text)'),
  ('public.execute_security_incident_command(uuid,jsonb,text)'),
  ('public.set_security_indicator_disclosure(uuid,jsonb,text)'),
  ('public.list_security_candidates(text,text,text,timestamp with time zone,uuid,integer)'),
  ('public.get_security_candidate(uuid)'),
  ('public.list_security_incidents(text,text,timestamp with time zone,uuid,integer)'),
  ('public.get_security_incident(uuid)')
) as expected(signature);

select ok(
  coalesce((
    select reloptions @> array['security_invoker=true', 'security_barrier=true']::text[]
    from pg_catalog.pg_class
    where oid = pg_catalog.to_regclass('public.' || expected.view_name)
  ), false),
  pg_catalog.format('%s is an invoker/barrier public projection', expected.view_name)
)
from (values
  ('public_project_security_state'),
  ('public_security_incident_summaries'),
  ('public_safe_security_indicators'),
  ('public_blocked_projects')
) as expected(view_name);

select ok(
  coalesce((
    select not has_table_privilege(expected.role_name, pg_catalog.to_regclass('public.' || expected.table_name), 'SELECT')
      and not has_table_privilege(expected.role_name, pg_catalog.to_regclass('public.' || expected.table_name), 'INSERT')
      and not has_table_privilege(expected.role_name, pg_catalog.to_regclass('public.' || expected.table_name), 'UPDATE')
      and not has_table_privilege(expected.role_name, pg_catalog.to_regclass('public.' || expected.table_name), 'DELETE')
    where pg_catalog.to_regclass('public.' || expected.table_name) is not null
  ), false),
  pg_catalog.format('%s has no direct security-ledger DML/read grant on %s', expected.role_name, expected.table_name)
)
from (values
  ('anon'), ('authenticated'), ('service_role'), ('ai_stage_worker'),
  ('collection_worker'), ('collection_queue_worker'), ('collection_schedule_admin'),
  ('promotion_service')
) as expected_role(role_name)
cross join (values
  ('security_indicator_candidates'),
  ('security_candidate_review_decisions'),
  ('security_indicators'),
  ('security_indicator_evidence_links'),
  ('security_incidents'),
  ('security_incident_indicator_links'),
  ('security_incident_decisions'),
  ('security_events'),
  ('security_review_commands')
) as expected_table(table_name)
cross join lateral (
  select expected_role.role_name, expected_table.table_name
) as expected(role_name, table_name);

select ok(
  has_table_privilege('anon', pg_catalog.to_regclass('public.' || expected.view_name), 'SELECT')
    and has_table_privilege('authenticated', pg_catalog.to_regclass('public.' || expected.view_name), 'SELECT')
    and not has_table_privilege('service_role', pg_catalog.to_regclass('public.' || expected.view_name), 'SELECT'),
  pg_catalog.format('%s is readable only through anonymous/authenticated public projection grants', expected.view_name)
)
from (values
  ('public_project_security_state'),
  ('public_security_incident_summaries'),
  ('public_safe_security_indicators'),
  ('public_blocked_projects')
) as expected(view_name);

select ok(
  coalesce(has_function_privilege('authenticated', pg_catalog.to_regprocedure(expected.signature), 'EXECUTE'), false)
    and not coalesce(has_function_privilege('anon', pg_catalog.to_regprocedure(expected.signature), 'EXECUTE'), false)
    and not coalesce(has_function_privilege('service_role', pg_catalog.to_regprocedure(expected.signature), 'EXECUTE'), false)
    and not coalesce(has_function_privilege('ai_stage_worker', pg_catalog.to_regprocedure(expected.signature), 'EXECUTE'), false),
  pg_catalog.format('%s is callable only through authenticated bearer sessions', expected.signature)
)
from (values
  ('public.submit_manual_security_candidate(jsonb,text)'),
  ('public.execute_security_candidate_review(uuid,jsonb,text)'),
  ('public.open_security_incident(jsonb,text)'),
  ('public.execute_security_incident_command(uuid,jsonb,text)'),
  ('public.set_security_indicator_disclosure(uuid,jsonb,text)'),
  ('public.list_security_candidates(text,text,text,timestamp with time zone,uuid,integer)'),
  ('public.get_security_candidate(uuid)'),
  ('public.list_security_incidents(text,text,timestamp with time zone,uuid,integer)'),
  ('public.get_security_incident(uuid)')
) as expected(signature);

select ok(
  coalesce(has_function_privilege('ai_stage_worker',
    pg_catalog.to_regprocedure('public.route_security_extraction_candidate(uuid)'), 'EXECUTE'), false)
    and not coalesce(has_function_privilege('authenticated',
      pg_catalog.to_regprocedure('public.route_security_extraction_candidate(uuid)'), 'EXECUTE'), false)
    and not coalesce(has_function_privilege('anon',
      pg_catalog.to_regprocedure('public.route_security_extraction_candidate(uuid)'), 'EXECUTE'), false)
    and not coalesce(has_function_privilege('service_role',
      pg_catalog.to_regprocedure('public.route_security_extraction_candidate(uuid)'), 'EXECUTE'), false),
  'only the AI stage worker can route an extraction-origin security candidate'
);

select ok(
  coalesce((
    select pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%security.candidate.submitted.v1%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%security.candidate.reviewed.v1%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%security.indicator.accepted.v1%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%security.incident.opened.v1%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%security.incident.changed.v1%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%security.indicator.disclosure_changed.v1%'
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.outbox_events'::regclass
      and constraint_info.conname = 'outbox_events_event_type_valid'
  ), false),
  'outbox event-type allowlist includes every version-1 security event'
);

select ok(
  coalesce((
    select pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%indicatorValue%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%reviewerUserId%'
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.outbox_events'::regclass
      and constraint_info.conname = 'outbox_events_payload_valid'
  ), false),
  'outbox payload validation contains explicit security safe-key branches'
);

-- Behavior fixtures exercise bearer identity, deterministic Evidence grounding,
-- canonical append-only state, safe disclosure, and transaction rollback.
insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('73000000-0000-4000-8000-000000000090', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'security-reviewer-013@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-26 00:00:00+00', '2026-08-26 00:00:00+00'),
  ('73000000-0000-4000-8000-000000000091', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'revoked-security-reviewer-013@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-26 00:00:00+00', '2026-08-26 00:00:00+00'),
  ('73000000-0000-4000-8000-000000000092', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'ordinary-user-013@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-26 00:00:00+00', '2026-08-26 00:00:00+00');

insert into public.user_roles (user_id, role, granted_at, revoked_at)
values
  ('73000000-0000-4000-8000-000000000090', 'security_reviewer',
    '2026-08-26 00:00:00+00', null),
  ('73000000-0000-4000-8000-000000000091', 'security_reviewer',
    '2026-08-25 00:00:00+00', '2026-08-25 01:00:00+00'),
  ('73000000-0000-4000-8000-000000000092', 'user',
    '2026-08-26 00:00:00+00', null);

insert into public.projects (id, slug, name, lifecycle, created_at, updated_at)
values (
  '73000000-0000-4000-8000-000000000010', 'phase-7a-security-fixture',
  'Phase 7A Security Fixture', 'active',
  '2026-08-26 00:00:00+00', '2026-08-26 00:00:00+00'
);

insert into public.sources (
  id, source_type, name, canonical_url, status, created_at, updated_at
)
values (
  '73000000-0000-4000-8000-000000000020', 'official_web',
  'Phase 7A Security Fixture Source', 'https://phase-7a-security.example/', 'active',
  '2026-08-26 00:00:00+00', '2026-08-26 00:00:00+00'
);

insert into public.raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at, created_at
)
values (
  '73000000-0000-4000-8000-000000000030',
  '73000000-0000-4000-8000-000000000010',
  '73000000-0000-4000-8000-000000000020',
  'https://phase-7a-security.example/report',
  'https://phase-7a-security.example/report',
  'official_html', 'text/html',
  'The malicious domain phish.example is a confirmed phishing site.',
  repeat('7', 64), '2026-08-26 00:01:00+00', '2026-08-26 00:01:00+00'
);

insert into public.evidence (
  id, source_id, raw_item_id, source_field, quote_text, normalized_quote_sha256,
  verified_at, created_at
)
values (
  '73000000-0000-4000-8000-000000000040',
  '73000000-0000-4000-8000-000000000020',
  '73000000-0000-4000-8000-000000000030',
  'article_raw_text',
  'The malicious domain phish.example is a confirmed phishing site.',
  public.evidence_quote_sha256_v1(
    'The malicious domain phish.example is a confirmed phishing site.'
  ),
  '2026-08-26 00:02:00+00', '2026-08-26 00:02:00+00'
);

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000092', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.submit_manual_security_candidate(
      '{"version":1,"target":{"type":"project","id":"73000000-0000-4000-8000-000000000010"},"evidenceId":"73000000-0000-4000-8000-000000000040","indicator":{"type":"domain","value":"phish.example"},"summary":"A grounded domain requires security review.","note":null}'::jsonb,
      'ordinary-security-command'
    )
  $$,
  'AS104', 'security_reviewer_required',
  'ordinary authenticated users cannot create canonical security candidates'
);
select throws_ok(
  $$
    insert into public.security_indicators (indicator_type, value_text, normalized_value_sha256)
    values ('domain', 'forged.example', repeat('f', 64))
  $$,
  '42501', 'permission denied for table security_indicators',
  'ordinary authenticated users cannot directly write the Security Ledger'
);
reset role;

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000091', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.submit_manual_security_candidate(
      '{"version":1,"target":{"type":"project","id":"73000000-0000-4000-8000-000000000010"},"evidenceId":"73000000-0000-4000-8000-000000000040","indicator":{"type":"domain","value":"phish.example"},"summary":"A grounded domain requires security review.","note":null}'::jsonb,
      'revoked-security-command'
    )
  $$,
  'AS104', 'security_reviewer_required',
  'revoked security reviewers fail closed'
);
reset role;

create temporary table phase_7a_manual_result (
  version integer not null,
  "commandId" uuid not null,
  "candidateId" uuid not null,
  "candidateVersion" bigint not null,
  state text not null,
  replayed boolean not null
) on commit drop;
grant select, insert on table pg_temp.phase_7a_manual_result to authenticated;

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.phase_7a_manual_result
select * from public.submit_manual_security_candidate(
  '{"version":1,"target":{"type":"project","id":"73000000-0000-4000-8000-000000000010"},"evidenceId":"73000000-0000-4000-8000-000000000040","indicator":{"type":"domain","value":"phish.example"},"summary":"A grounded domain requires security review.","note":null}'::jsonb,
  'phase-7a-manual-candidate'
);
reset role;

select results_eq(
  $$ select "candidateVersion", state, replayed from pg_temp.phase_7a_manual_result $$,
  $$ values (1::bigint, 'pending'::text, false) $$,
  'an active bearer security reviewer creates only a pending grounded candidate'
);

create temporary table phase_7a_candidate_result (
  version integer not null,
  "commandId" uuid not null,
  "candidateId" uuid not null,
  "candidateVersion" bigint not null,
  "decisionId" uuid not null,
  state text not null,
  "indicatorId" uuid null,
  "incidentId" uuid null,
  replayed boolean not null
) on commit drop;
grant select, insert on table pg_temp.phase_7a_candidate_result to authenticated;
grant select on table pg_temp.phase_7a_candidate_result to anon;

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.phase_7a_candidate_result
select * from public.execute_security_candidate_review(
  (select "candidateId" from pg_temp.phase_7a_manual_result),
  pg_catalog.jsonb_build_object(
    'version', 1,
    'candidateId', (select "candidateId"::text from pg_temp.phase_7a_manual_result),
    'expectedCandidateVersion', 1,
    'decision', 'accept_and_open',
    'reasonCode', 'evidence_verified',
    'evidenceId', '73000000-0000-4000-8000-000000000040',
    'indicator', pg_catalog.jsonb_build_object('type', 'domain', 'value', 'phish.example'),
    'category', 'phishing',
    'resultingPosture', 'blocked',
    'resultingSeverity', 'critical',
    'publicSummary', 'A grounded phishing domain requires a protective block.',
    'note', null
  ),
  'phase-7a-accept-and-open'
);
reset role;

select results_eq(
  $$
    select "candidateVersion", state, "indicatorId" is not null, "incidentId" is not null, replayed
    from pg_temp.phase_7a_candidate_result
  $$,
  $$ values (2::bigint, 'accepted'::text, true, true, false) $$,
  'accept-and-open atomically appends candidate, indicator, and incident state'
);

select is(
  public.current_security_target_posture(
    'project', '73000000-0000-4000-8000-000000000010'
  ),
  'blocked',
  'a blocked project incident derives blocked posture without lifecycle mutation'
);
select is(
  (select lifecycle::text from public.projects
   where id = '73000000-0000-4000-8000-000000000010'),
  'active',
  'security posture does not mutate the catalog lifecycle'
);

create temporary table phase_7a_disclosure_result (
  version integer not null,
  "commandId" uuid not null,
  "indicatorId" uuid not null,
  "indicatorVersion" bigint not null,
  decision text not null,
  "publicSafe" boolean not null,
  replayed boolean not null
) on commit drop;
grant select, insert on table pg_temp.phase_7a_disclosure_result to authenticated;

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.phase_7a_disclosure_result
select * from public.set_security_indicator_disclosure(
  (select "indicatorId" from pg_temp.phase_7a_candidate_result),
  pg_catalog.jsonb_build_object(
    'version', 1,
    'indicatorId', (select "indicatorId"::text from pg_temp.phase_7a_candidate_result),
    'expectedIndicatorVersion', 1,
    'decision', 'publish',
    'reasonCode', 'safe_for_public_warning',
    'note', null
  ),
  'phase-7a-publish-indicator'
);
reset role;

select results_eq(
  $$ select "indicatorVersion", decision, "publicSafe", replayed from pg_temp.phase_7a_disclosure_result $$,
  $$ values (2::bigint, 'publish'::text, true, false) $$,
  'only a separate disclosure command makes an indicator public-safe'
);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select results_eq(
  $$
    select posture
    from public.public_project_security_state
    where project_id = '73000000-0000-4000-8000-000000000010'
  $$,
  $$ values ('blocked'::text) $$,
  'anonymous users can read the derived blocked project posture only through the safe view'
);
select results_eq(
  $$
    select id, type, value
    from public.public_safe_security_indicators
    where id = (select "indicatorId" from pg_temp.phase_7a_candidate_result)
  $$,
  $$
    select "indicatorId", 'domain'::text, 'phish.example'::text
    from pg_temp.phase_7a_candidate_result
  $$,
  'anonymous users receive the separately approved inert indicator value'
);
select ok(
  not exists (
    select 1
    from public.public_security_incident_summaries as summary
    cross join lateral pg_catalog.jsonb_object_keys(pg_catalog.to_jsonb(summary)) as keys(key_name)
    where summary.incident_id = (select "incidentId" from pg_temp.phase_7a_candidate_result)
      and keys.key_name in ('reviewer_user_id', 'evidence_id', 'note', 'payload')
  ),
  'public incident rows expose no reviewer, Evidence, note, or payload column'
);
select results_eq(
  $$
    select project_id, project_slug, posture, target_type, target_id
    from public.public_blocked_projects
    where project_id = '73000000-0000-4000-8000-000000000010'
  $$,
  $$ values (
    '73000000-0000-4000-8000-000000000010'::uuid,
    'phase-7a-security-fixture'::text,
    'blocked'::text,
    'project'::text,
    '73000000-0000-4000-8000-000000000010'::uuid
  ) $$,
  'blocked-project projection is catalog-visible, scoped, and does not expose score advice'
);
reset role;

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.phase_7a_disclosure_result
select * from public.set_security_indicator_disclosure(
  (select "indicatorId" from pg_temp.phase_7a_candidate_result),
  pg_catalog.jsonb_build_object(
    'version', 1,
    'indicatorId', (select "indicatorId"::text from pg_temp.phase_7a_candidate_result),
    'expectedIndicatorVersion', 2,
    'decision', 'withdraw',
    'reasonCode', 'sensitive_indicator',
    'note', null
  ),
  'phase-7a-withdraw-indicator'
);
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is(
  (select count(*)::integer from public.public_safe_security_indicators
   where id = (select "indicatorId" from pg_temp.phase_7a_candidate_result)),
  0,
  'withdrawing disclosure immediately removes the indicator from all public projections'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.outbox_events
    where aggregate_id in (
      (select "candidateId" from pg_temp.phase_7a_candidate_result),
      (select "indicatorId" from pg_temp.phase_7a_candidate_result),
      (select "incidentId" from pg_temp.phase_7a_candidate_result)
    )
      and event_type like 'security.%'
  ),
  6,
  'canonical candidate, incident, and disclosure changes each commit their safe outbox event'
);
select is(
  (
    select count(*)::integer
    from public.security_review_commands
    where reviewer_user_id = '73000000-0000-4000-8000-000000000090'
  ),
  4,
  'every successful reviewer command has exactly one append-only receipt'
);

create function public.test_phase_7a_fail_outbox()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.event_type = 'security.candidate.submitted.v1' then
    raise exception 'phase_7a_test_outbox_failure' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create trigger test_phase_7a_fail_outbox
before insert on public.outbox_events
for each row execute function public.test_phase_7a_fail_outbox();

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.submit_manual_security_candidate(
      '{"version":1,"target":{"type":"project","id":"73000000-0000-4000-8000-000000000010"},"evidenceId":"73000000-0000-4000-8000-000000000040","indicator":{"type":"domain","value":"phish.example"},"summary":"A second grounded candidate must roll back completely.","note":null}'::jsonb,
      'phase-7a-forced-outbox-failure'
    )
  $$,
  'AS199', 'security_persistence_failed',
  'a forced outbox failure returns only the sanitized persistence error'
);
reset role;

drop trigger test_phase_7a_fail_outbox on public.outbox_events;
drop function public.test_phase_7a_fail_outbox();

select is(
  (
    select count(*)::integer
    from public.security_indicator_candidates
    where submitted_by_user_id = '73000000-0000-4000-8000-000000000090'
  ),
  1,
  'forced outbox failure rolls back the candidate envelope'
);
select is(
  (
    select count(*)::integer
    from public.security_review_commands
    where reviewer_user_id = '73000000-0000-4000-8000-000000000090'
      and idempotency_key = 'phase-7a-forced-outbox-failure'
  ),
  0,
  'forced outbox failure rolls back the command receipt'
);

-- Step 6 acceptance matrix: concurrent active incidents, independent resolve,
-- blocked-source Evidence behavior, ordinary Promotion gates, database-owned
-- timestamps, and failures before receipt persistence.
insert into public.sources (
  id, source_type, name, canonical_url, status, created_at, updated_at
)
values (
  '73000000-0000-4000-8000-000000000021', 'official_web',
  'Phase 7A Alternative Evidence Source', 'https://phase-7a-alternative.example/', 'active',
  '2026-08-26 00:00:00+00', '2026-08-26 00:00:00+00'
);

insert into public.raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at, created_at
)
values (
  '73000000-0000-4000-8000-000000000031',
  '73000000-0000-4000-8000-000000000010',
  '73000000-0000-4000-8000-000000000021',
  'https://phase-7a-alternative.example/report',
  'https://phase-7a-alternative.example/report',
  'official_html', 'text/html',
  'An independent source preserves an ordinary signal after one source is blocked.',
  repeat('8', 64), '2026-08-26 00:03:00+00', '2026-08-26 00:03:00+00'
);

insert into public.evidence (
  id, source_id, raw_item_id, source_field, quote_text, normalized_quote_sha256,
  verified_at, created_at
)
values (
  '73000000-0000-4000-8000-000000000041',
  '73000000-0000-4000-8000-000000000021',
  '73000000-0000-4000-8000-000000000031',
  'article_raw_text',
  'An independent source preserves an ordinary signal after one source is blocked.',
  public.evidence_quote_sha256_v1(
    'An independent source preserves an ordinary signal after one source is blocked.'
  ),
  '2026-08-26 00:04:00+00', '2026-08-26 00:04:00+00'
);

insert into public.signals (
  id, project_id, signal_type, title, summary, verification, lifecycle,
  confidence, published_at, created_at
)
values
  (
    '73000000-0000-4000-8000-000000000080',
    '73000000-0000-4000-8000-000000000010',
    'blocked_source_only', 'Blocked source only signal',
    'This ordinary signal relies only on Evidence from the source that becomes blocked.',
    'unverified', 'published', 60,
    '2026-08-26 00:05:00+00', '2026-08-26 00:05:00+00'
  ),
  (
    '73000000-0000-4000-8000-000000000081',
    '73000000-0000-4000-8000-000000000010',
    'alternative_source', 'Alternative source signal',
    'This ordinary signal retains independent Evidence when another source becomes blocked.',
    'unverified', 'published', 70,
    '2026-08-26 00:05:00+00', '2026-08-26 00:05:00+00'
  );

insert into public.signal_evidence_links (signal_id, evidence_id, created_at)
values
  (
    '73000000-0000-4000-8000-000000000080',
    '73000000-0000-4000-8000-000000000040',
    '2026-08-26 00:05:00+00'
  ),
  (
    '73000000-0000-4000-8000-000000000081',
    '73000000-0000-4000-8000-000000000040',
    '2026-08-26 00:05:00+00'
  ),
  (
    '73000000-0000-4000-8000-000000000081',
    '73000000-0000-4000-8000-000000000041',
    '2026-08-26 00:05:00+00'
  );

create temporary table phase_7a_source_incident_results (
  case_name text primary key,
  version integer not null,
  "commandId" uuid not null,
  "incidentId" uuid not null,
  "incidentVersion" bigint not null,
  "decisionId" uuid not null,
  state text not null,
  posture text null,
  replayed boolean not null
) on commit drop;
grant select, insert on table pg_temp.phase_7a_source_incident_results to authenticated;

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.phase_7a_source_incident_results
select 'first', result.*
from public.open_security_incident(
  pg_catalog.jsonb_build_object(
    'version', 1,
    'action', 'open',
    'target', pg_catalog.jsonb_build_object(
      'type', 'source', 'id', '73000000-0000-4000-8000-000000000020'
    ),
    'category', 'source_compromise',
    'indicatorId', (select "indicatorId"::text from pg_temp.phase_7a_candidate_result),
    'evidenceId', '73000000-0000-4000-8000-000000000040',
    'resultingPosture', 'blocked',
    'resultingSeverity', 'critical',
    'publicSummary', 'A grounded source compromise requires a protective block.',
    'note', null,
    'reasonCode', 'active_exploitation'
  ),
  'phase-7a-source-incident-first'
) as result;

insert into pg_temp.phase_7a_source_incident_results
select 'second', result.*
from public.open_security_incident(
  pg_catalog.jsonb_build_object(
    'version', 1,
    'action', 'open',
    'target', pg_catalog.jsonb_build_object(
      'type', 'source', 'id', '73000000-0000-4000-8000-000000000020'
    ),
    'category', 'phishing',
    'indicatorId', (select "indicatorId"::text from pg_temp.phase_7a_candidate_result),
    'evidenceId', '73000000-0000-4000-8000-000000000040',
    'resultingPosture', 'blocked',
    'resultingSeverity', 'critical',
    'publicSummary', 'A second grounded incident remains independently active.',
    'note', null,
    'reasonCode', 'precautionary_evidence'
  ),
  'phase-7a-source-incident-second'
) as result;
reset role;

select results_eq(
  $$
    select case_name, state, posture, replayed
    from pg_temp.phase_7a_source_incident_results
    order by case_name
  $$,
  $$ values
    ('first'::text, 'active'::text, 'blocked'::text, false),
    ('second'::text, 'active'::text, 'blocked'::text, false)
  $$,
  'two incidents can remain simultaneously active for one protected source'
);

select is(
  (select count(*)::integer from pg_temp.phase_7a_source_incident_results),
  2,
  'a second incident can reuse already-grounded Evidence after the source is blocked'
);

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.phase_7a_source_incident_results
select 'first-resolved', result.*
from public.execute_security_incident_command(
  (select "incidentId" from pg_temp.phase_7a_source_incident_results where case_name = 'first'),
  pg_catalog.jsonb_build_object(
    'version', 1,
    'action', 'resolve',
    'incidentId', (
      select "incidentId"::text
      from pg_temp.phase_7a_source_incident_results
      where case_name = 'first'
    ),
    'expectedIncidentVersion', 1,
    'evidenceId', '73000000-0000-4000-8000-000000000040',
    'resultingSeverity', 'critical',
    'publicSummary', 'A grounded source compromise requires a protective block.',
    'note', null,
    'reasonCode', 'mitigation_verified'
  ),
  'phase-7a-source-incident-first-resolve'
) as result;
reset role;

select results_eq(
  $$
    select "incidentVersion", state, posture, replayed
    from pg_temp.phase_7a_source_incident_results
    where case_name = 'first-resolved'
  $$,
  $$ values (2::bigint, 'resolved'::text, null::text, false) $$,
  'one incident resolves independently'
);

select is(
  public.current_security_target_posture(
    'source', '73000000-0000-4000-8000-000000000020'
  ),
  'blocked',
  'resolving one incident leaves the second source block active'
);

select is(
  public.signal_has_valid_evidence('73000000-0000-4000-8000-000000000080'),
  false,
  'the last ordinary Evidence from a blocked source no longer validates a signal'
);

select is(
  public.signal_has_valid_evidence('73000000-0000-4000-8000-000000000081'),
  true,
  'independent alternative Evidence keeps an ordinary signal valid'
);

select ok(
  not exists (
    select 1
    from public.security_incidents as incident
    join pg_temp.phase_7a_source_incident_results as result
      on result."incidentId" = incident.id
    where result.case_name in ('first', 'second')
      and (
        incident.opened_at <> pg_catalog.transaction_timestamp()
        or incident.created_at <> pg_catalog.transaction_timestamp()
      )
  )
  and not exists (
    select 1
    from public.security_incident_decisions as decision
    join pg_temp.phase_7a_source_incident_results as result
      on result."incidentId" = decision.incident_id
    where result.case_name in ('first', 'second')
      and decision.created_at <> pg_catalog.transaction_timestamp()
  ),
  'incident headers and decisions use database transaction timestamps'
);

create temporary table phase_7a_before_invalid_open on commit drop as
select
  (select count(*) from public.security_indicator_candidates)::bigint as candidates,
  (select count(*) from public.security_candidate_review_decisions)::bigint as candidate_decisions,
  (select count(*) from public.security_indicators)::bigint as indicators,
  (select count(*) from public.security_indicator_evidence_links)::bigint as indicator_links,
  (select count(*) from public.security_incidents)::bigint as incidents,
  (select count(*) from public.security_incident_indicator_links)::bigint as incident_links,
  (select count(*) from public.security_incident_decisions)::bigint as incident_decisions,
  (select count(*) from public.security_events)::bigint as security_events,
  (select count(*) from public.security_review_commands)::bigint as receipts,
  (select count(*) from public.outbox_events)::bigint as outbox_events;

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.open_security_incident(
      '{"version":1,"action":"open","target":{"type":"source","id":"73000000-0000-4000-8000-000000000020"},"category":"phishing","indicatorId":"73000000-0000-4000-8000-000000000099","evidenceId":"73000000-0000-4000-8000-000000000040","resultingPosture":"blocked","resultingSeverity":"critical","publicSummary":"A missing indicator must fail before canonical persistence.","note":null,"reasonCode":"precautionary_evidence"}'::jsonb,
      'phase-7a-missing-indicator'
    )
  $$,
  'AS105', 'security_indicator_not_found',
  'incident open requires an existing grounded indicator'
);
select throws_ok(
  $$
    select * from public.open_security_incident(
      '{"version":1,"action":"open","target":{"type":"source","id":"73000000-0000-4000-8000-000000000020"},"category":"phishing","indicatorId":"73000000-0000-4000-8000-000000000099","evidenceId":"73000000-0000-4000-8000-000000000040","resultingPosture":"blocked","resultingSeverity":"critical","publicSummary":"Caller timestamps must never enter the canonical ledger.","note":null,"reasonCode":"precautionary_evidence","createdAt":"2000-01-01T00:00:00.000Z"}'::jsonb,
      'phase-7a-forged-created-at'
    )
  $$,
  'AS108', 'security_command_invalid',
  'incident commands reject caller-forged timestamps'
);
reset role;

select results_eq(
  $$
    select
      (select count(*) from public.security_indicator_candidates)::bigint,
      (select count(*) from public.security_candidate_review_decisions)::bigint,
      (select count(*) from public.security_indicators)::bigint,
      (select count(*) from public.security_indicator_evidence_links)::bigint,
      (select count(*) from public.security_incidents)::bigint,
      (select count(*) from public.security_incident_indicator_links)::bigint,
      (select count(*) from public.security_incident_decisions)::bigint,
      (select count(*) from public.security_events)::bigint,
      (select count(*) from public.security_review_commands)::bigint,
      (select count(*) from public.outbox_events)::bigint
  $$,
  $$
    select candidates, candidate_decisions, indicators, indicator_links,
      incidents, incident_links, incident_decisions, security_events, receipts, outbox_events
    from pg_temp.phase_7a_before_invalid_open
  $$,
  'failures before receipt insertion leave every canonical, history, receipt, and outbox count unchanged'
);

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  '73000000-0000-4000-8000-000000000093', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ordinary-reviewer-013@example.invalid',
  '{"provider":"email","providers":["email"]}', '{}',
  '2026-08-26 00:00:00+00', '2026-08-26 00:00:00+00'
);

insert into public.user_roles (user_id, role, granted_at, revoked_at)
values (
  '73000000-0000-4000-8000-000000000093', 'reviewer',
  '2026-08-26 00:00:00+00', null
);

insert into public.projects (id, slug, name, lifecycle, created_at, updated_at)
values (
  '73000000-0000-4000-8000-000000000011', 'phase-7a-promotion-fixture',
  'Phase 7A Promotion Fixture', 'active',
  '2026-08-26 00:00:00+00', '2026-08-26 00:00:00+00'
);

insert into public.sources (
  id, source_type, name, canonical_url, status, created_at, updated_at
)
values (
  '73000000-0000-4000-8000-000000000022', 'official_web',
  'Phase 7A Promotion Source', 'https://phase-7a-promotion.example/', 'active',
  '2026-08-26 00:00:00+00', '2026-08-26 00:00:00+00'
);

insert into public.raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at, created_at
)
values (
  '73000000-0000-4000-8000-000000000032',
  '73000000-0000-4000-8000-000000000011',
  '73000000-0000-4000-8000-000000000022',
  'https://phase-7a-promotion.example/feed',
  'https://phase-7a-promotion.example/feed',
  'rss_feed', 'application/rss+xml',
  'The domain promotion-risk.example requires a grounded promotion security fixture.',
  repeat('9', 64), '2026-08-26 00:10:00+00', '2026-08-26 00:10:00+00'
);

insert into public.discovered_items (
  id, project_id, source_id, feed_raw_item_id, stable_entry_key, version,
  entry_url, summary, is_authority_domain, disposition, created_at
)
values (
  '73000000-0000-4000-8000-000000000042',
  '73000000-0000-4000-8000-000000000011',
  '73000000-0000-4000-8000-000000000022',
  '73000000-0000-4000-8000-000000000032',
  'phase-7a-promotion-fixture', 1,
  'https://phase-7a-promotion.example/entry',
  'A grounded ordinary Promotion fixture.', true, 'eligible',
  '2026-08-26 00:11:00+00'
);

insert into public.ai_runs (
  id, stage, input_kind, input_id, input_hash, model_id, prompt_version,
  schema_version, pipeline_version, status, output, created_at
)
values (
  '73000000-0000-4000-8000-000000000052', 'extract.v1', 'discovered_item',
  '73000000-0000-4000-8000-000000000042', repeat('a', 64), 'test-model',
  'extract-prompt-v1', 'extract-schema-v1', 'extract-pipeline-v1', 'succeeded',
  '{"candidates":[]}', '2026-08-26 00:12:00+00'
);

insert into public.extraction_candidates (
  id, ai_run_id, project_id, source_id, discovered_item_id, raw_item_id,
  payload, payload_sha256, created_at
)
select
  ('73000000-0000-4000-8000-' || pg_catalog.lpad(candidate_number::text, 12, '0'))::uuid,
  '73000000-0000-4000-8000-000000000052'::uuid,
  '73000000-0000-4000-8000-000000000011'::uuid,
  '73000000-0000-4000-8000-000000000022'::uuid,
  '73000000-0000-4000-8000-000000000042'::uuid,
  '73000000-0000-4000-8000-000000000032'::uuid,
  pg_catalog.jsonb_build_object(
    'claimType', 'points_program', 'signalType', 'points_program',
    'title', 'Phase 7A Promotion candidate ' || candidate_number,
    'summary', 'A sufficiently long ordinary Promotion fixture summary.',
    'confidence', 75,
    'evidenceQuote', 'promotion security fixture',
    'occurredAtIso', null
  ),
  pg_catalog.md5(candidate_number::text) || pg_catalog.md5('phase-7a-' || candidate_number),
  '2026-08-26 00:13:00+00'
from pg_catalog.generate_series(60, 62) as candidate_number;

insert into public.signals (
  id, project_id, signal_type, title, summary, verification, lifecycle,
  confidence, published_at, created_at
)
values (
  '73000000-0000-4000-8000-000000000082',
  '73000000-0000-4000-8000-000000000011',
  'promotion_fixture', 'Promotion fixture signal',
  'A canonical signal used only to exercise ordinary Promotion security gates.',
  'unverified', 'published', 70,
  '2026-08-26 00:14:00+00', '2026-08-26 00:14:00+00'
);

insert into public.evidence (
  id, source_id, raw_item_id, source_field, quote_text, normalized_quote_sha256,
  verified_at, created_at
)
values (
  '73000000-0000-4000-8000-000000000042',
  '73000000-0000-4000-8000-000000000022',
  '73000000-0000-4000-8000-000000000032',
  'article_raw_text',
  'The domain promotion-risk.example requires a grounded promotion security fixture.',
  public.evidence_quote_sha256_v1(
    'The domain promotion-risk.example requires a grounded promotion security fixture.'
  ),
  '2026-08-26 00:15:00+00', '2026-08-26 00:15:00+00'
);

insert into public.candidate_review_decisions (
  candidate_id, candidate_version, reviewer_user_id, decision, reason_code,
  evidence_id, signal_id
)
values (
  '73000000-0000-4000-8000-000000000060', 2,
  '73000000-0000-4000-8000-000000000093', 'approve', 'evidence_verified',
  '73000000-0000-4000-8000-000000000042',
  '73000000-0000-4000-8000-000000000082'
);

select is(
  (select count(*)::integer from public.candidate_review_decisions
   where candidate_id = '73000000-0000-4000-8000-000000000060'),
  1,
  'ordinary Promotion remains available to an ordinary reviewer at clear posture'
);

create temporary table phase_7a_promotion_security_candidate (
  version integer not null,
  "commandId" uuid not null,
  "candidateId" uuid not null,
  "candidateVersion" bigint not null,
  state text not null,
  replayed boolean not null
) on commit drop;
grant select, insert on table pg_temp.phase_7a_promotion_security_candidate to authenticated;

create temporary table phase_7a_promotion_incident (
  version integer not null,
  "commandId" uuid not null,
  "candidateId" uuid not null,
  "candidateVersion" bigint not null,
  "decisionId" uuid not null,
  state text not null,
  "indicatorId" uuid null,
  "incidentId" uuid null,
  replayed boolean not null
) on commit drop;
grant select, insert on table pg_temp.phase_7a_promotion_incident to authenticated;

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.phase_7a_promotion_security_candidate
select * from public.submit_manual_security_candidate(
  '{"version":1,"target":{"type":"project","id":"73000000-0000-4000-8000-000000000011"},"evidenceId":"73000000-0000-4000-8000-000000000042","indicator":{"type":"domain","value":"promotion-risk.example"},"summary":"A grounded domain requires promotion security review.","note":null}'::jsonb,
  'phase-7a-promotion-security-candidate'
);

insert into pg_temp.phase_7a_promotion_incident
select * from public.execute_security_candidate_review(
  (select "candidateId" from pg_temp.phase_7a_promotion_security_candidate),
  pg_catalog.jsonb_build_object(
    'version', 1,
    'candidateId', (
      select "candidateId"::text from pg_temp.phase_7a_promotion_security_candidate
    ),
    'expectedCandidateVersion', 1,
    'decision', 'accept_and_open',
    'reasonCode', 'evidence_verified',
    'evidenceId', '73000000-0000-4000-8000-000000000042',
    'indicator', pg_catalog.jsonb_build_object(
      'type', 'domain', 'value', 'promotion-risk.example'
    ),
    'category', 'phishing',
    'resultingPosture', 'caution',
    'resultingSeverity', 'high',
    'publicSummary', 'A grounded promotion risk requires security reviewer oversight.',
    'note', null
  ),
  'phase-7a-promotion-caution-open'
);
reset role;

select throws_ok(
  $$
    insert into public.candidate_review_decisions (
      candidate_id, candidate_version, reviewer_user_id, decision, reason_code,
      evidence_id, signal_id
    ) values (
      '73000000-0000-4000-8000-000000000061', 2,
      '73000000-0000-4000-8000-000000000093', 'approve', 'evidence_verified',
      '73000000-0000-4000-8000-000000000042',
      '73000000-0000-4000-8000-000000000082'
    )
  $$,
  'AS104', 'security_reviewer_required',
  'ordinary Promotion at caution posture requires an active security reviewer'
);

insert into public.candidate_review_decisions (
  candidate_id, candidate_version, reviewer_user_id, decision, reason_code,
  evidence_id, signal_id
)
values (
  '73000000-0000-4000-8000-000000000061', 2,
  '73000000-0000-4000-8000-000000000090', 'approve', 'evidence_verified',
  '73000000-0000-4000-8000-000000000042',
  '73000000-0000-4000-8000-000000000082'
);

select is(
  (select count(*)::integer from public.candidate_review_decisions
   where candidate_id = '73000000-0000-4000-8000-000000000061'),
  1,
  'ordinary Promotion at caution posture permits an active security reviewer'
);

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.phase_7a_source_incident_results
select 'promotion-blocked-adjust', result.*
from public.execute_security_incident_command(
  (select "incidentId" from pg_temp.phase_7a_promotion_incident),
  pg_catalog.jsonb_build_object(
    'version', 1,
    'action', 'adjust',
    'incidentId', (select "incidentId"::text from pg_temp.phase_7a_promotion_incident),
    'expectedIncidentVersion', 1,
    'evidenceId', '73000000-0000-4000-8000-000000000042',
    'resultingPosture', 'blocked',
    'resultingSeverity', 'critical',
    'publicSummary', 'Escalated grounded evidence now requires a protective promotion block.',
    'note', null,
    'reasonCode', 'evidence_escalated'
  ),
  'phase-7a-promotion-blocked-adjust'
) as result;
reset role;

select throws_ok(
  $$
    insert into public.candidate_review_decisions (
      candidate_id, candidate_version, reviewer_user_id, decision, reason_code,
      evidence_id, signal_id
    ) values (
      '73000000-0000-4000-8000-000000000062', 2,
      '73000000-0000-4000-8000-000000000090', 'approve', 'evidence_verified',
      '73000000-0000-4000-8000-000000000042',
      '73000000-0000-4000-8000-000000000082'
    )
  $$,
  'AS112', 'security_promotion_blocked',
  'ordinary Promotion is denied for every actor at blocked posture'
);

select * from finish();

rollback;
