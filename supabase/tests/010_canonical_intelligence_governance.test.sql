begin;

select no_plan();

select has_table('public', expected.table_name, pg_catalog.format('%s exists', expected.table_name))
from (values
  ('evidence'),
  ('signal_evidence_links'),
  ('candidate_review_decisions'),
  ('promotion_commands'),
  ('outbox_events')
) as expected(table_name);

select columns_are(
  'public',
  'evidence',
  array[
    'id', 'source_id', 'raw_item_id', 'discovered_item_id', 'locator_version',
    'locator_kind', 'source_field', 'quote_text', 'normalized_quote_sha256',
    'verification_method', 'verified_at', 'created_at'
  ],
  'evidence has the exact governance columns'
);

select columns_are(
  'public',
  'signal_evidence_links',
  array['signal_id', 'evidence_id', 'created_at'],
  'signal Evidence links have the exact governance columns'
);

select columns_are(
  'public',
  'candidate_review_decisions',
  array[
    'id', 'candidate_id', 'candidate_version', 'reviewer_user_id', 'decision',
    'reason_code', 'note', 'evidence_id', 'signal_id', 'created_at'
  ],
  'candidate review decisions have the exact governance columns'
);

select columns_are(
  'public',
  'promotion_commands',
  array[
    'id', 'reviewer_user_id', 'candidate_id', 'idempotency_key', 'input_hash',
    'expected_candidate_version', 'resulting_candidate_version', 'decision_id',
    'outcome', 'signal_id', 'evidence_id', 'created_at'
  ],
  'Promotion command receipts have the exact governance columns'
);

select columns_are(
  'public',
  'outbox_events',
  array[
    'id', 'aggregate_type', 'aggregate_id', 'aggregate_version', 'event_type',
    'event_version', 'payload', 'occurred_at', 'created_at', 'published_at',
    'delivery_attempts', 'last_error_code'
  ],
  'outbox events have the exact bounded columns'
);

select col_type_is('public', 'extraction_candidates', 'version', 'bigint', 'candidate version is bigint');
select col_not_null('public', 'extraction_candidates', 'version', 'candidate version is required');
select col_default_is('public', 'extraction_candidates', 'version', '1', 'candidate version defaults to one');
select col_type_is('public', 'extraction_candidates', 'review_status', 'text', 'candidate review status is text');
select col_not_null('public', 'extraction_candidates', 'review_status', 'candidate review status is required');
select col_default_is('public', 'extraction_candidates', 'review_status', 'pending', 'candidate review status defaults to pending');
select col_is_fk('public', 'promotion_events', 'review_decision_id', 'promotion audit references its review decision');
select col_is_fk('public', 'promotion_events', 'reviewer_user_id', 'promotion audit references its reviewer');

select results_eq(
  $$
    select table_info.relname::text collate "C",
      constraint_info.conname::text collate "C",
      constraint_info.contype::text collate "C"
    from pg_catalog.pg_constraint as constraint_info
    join pg_catalog.pg_class as table_info on table_info.oid = constraint_info.conrelid
    where constraint_info.connamespace = 'public'::regnamespace
      and table_info.relname in (
        'evidence', 'signal_evidence_links', 'candidate_review_decisions',
        'promotion_commands', 'outbox_events'
      )
    order by table_info.relname, constraint_info.conname
  $$,
  $$
    select expected.table_name collate "C", expected.constraint_name collate "C",
      expected.constraint_type collate "C"
    from (values
      ('candidate_review_decisions'::text, 'candidate_review_decisions_candidate_id_fkey'::text, 'f'::text),
      ('candidate_review_decisions', 'candidate_review_decisions_decision_valid', 'c'),
      ('candidate_review_decisions', 'candidate_review_decisions_evidence_id_fkey', 'f'),
      ('candidate_review_decisions', 'candidate_review_decisions_note_valid', 'c'),
      ('candidate_review_decisions', 'candidate_review_decisions_pkey', 'p'),
      ('candidate_review_decisions', 'candidate_review_decisions_reason_code_valid', 'c'),
      ('candidate_review_decisions', 'candidate_review_decisions_reviewer_user_id_fkey', 'f'),
      ('candidate_review_decisions', 'candidate_review_decisions_shape', 'c'),
      ('candidate_review_decisions', 'candidate_review_decisions_signal_id_fkey', 'f'),
      ('candidate_review_decisions', 'candidate_review_decisions_version_positive', 'c'),
      ('evidence', 'evidence_discovered_item_id_fkey', 'f'),
      ('evidence', 'evidence_discovered_shape', 'c'),
      ('evidence', 'evidence_locator_kind_valid', 'c'),
      ('evidence', 'evidence_locator_version_valid', 'c'),
      ('evidence', 'evidence_normalized_quote_sha256_valid', 'c'),
      ('evidence', 'evidence_pkey', 'p'),
      ('evidence', 'evidence_quote_text_valid', 'c'),
      ('evidence', 'evidence_raw_item_id_fkey', 'f'),
      ('evidence', 'evidence_source_field_valid', 'c'),
      ('evidence', 'evidence_source_id_fkey', 'f'),
      ('evidence', 'evidence_verification_method_valid', 'c'),
      ('outbox_events', 'outbox_events_aggregate_type_valid', 'c'),
      ('outbox_events', 'outbox_events_aggregate_version_positive', 'c'),
      ('outbox_events', 'outbox_events_delivery_attempts_valid', 'c'),
      ('outbox_events', 'outbox_events_event_type_valid', 'c'),
      ('outbox_events', 'outbox_events_event_version_valid', 'c'),
      ('outbox_events', 'outbox_events_identity_key', 'u'),
      ('outbox_events', 'outbox_events_last_error_code_valid', 'c'),
      ('outbox_events', 'outbox_events_payload_valid', 'c'),
      ('outbox_events', 'outbox_events_pkey', 'p'),
      ('promotion_commands', 'promotion_commands_candidate_id_fkey', 'f'),
      ('promotion_commands', 'promotion_commands_decision_id_fkey', 'f'),
      ('promotion_commands', 'promotion_commands_evidence_id_fkey', 'f'),
      ('promotion_commands', 'promotion_commands_idempotency_key_valid', 'c'),
      ('promotion_commands', 'promotion_commands_input_hash_valid', 'c'),
      ('promotion_commands', 'promotion_commands_outcome_valid', 'c'),
      ('promotion_commands', 'promotion_commands_pkey', 'p'),
      ('promotion_commands', 'promotion_commands_result_shape', 'c'),
      ('promotion_commands', 'promotion_commands_reviewer_key', 'u'),
      ('promotion_commands', 'promotion_commands_reviewer_user_id_fkey', 'f'),
      ('promotion_commands', 'promotion_commands_signal_id_fkey', 'f'),
      ('promotion_commands', 'promotion_commands_versions_positive', 'c'),
      ('signal_evidence_links', 'signal_evidence_links_evidence_id_fkey', 'f'),
      ('signal_evidence_links', 'signal_evidence_links_pkey', 'p'),
      ('signal_evidence_links', 'signal_evidence_links_signal_id_fkey', 'f')
    ) as expected(table_name, constraint_name, constraint_type)
    order by expected.table_name, expected.constraint_name
  $$,
  'governance tables have the exact named primary, unique, foreign-key, and check constraints'
);

select results_eq(
  $$
    select table_info.relname::text collate "C", index_info.relname::text collate "C"
    from pg_catalog.pg_index as catalog_index
    join pg_catalog.pg_class as table_info on table_info.oid = catalog_index.indrelid
    join pg_catalog.pg_class as index_info on index_info.oid = catalog_index.indexrelid
    join pg_catalog.pg_namespace as namespace_info on namespace_info.oid = table_info.relnamespace
    where namespace_info.nspname = 'public'
      and table_info.relname in (
        'evidence', 'signal_evidence_links', 'candidate_review_decisions',
        'promotion_commands', 'outbox_events'
      )
    order by table_info.relname, index_info.relname
  $$,
  $$
    select expected.table_name collate "C", expected.index_name collate "C"
    from (values
      ('candidate_review_decisions'::text, 'candidate_review_decisions_candidate_latest_idx'::text),
      ('candidate_review_decisions', 'candidate_review_decisions_pkey'),
      ('candidate_review_decisions', 'candidate_review_decisions_reviewer_created_idx'),
      ('evidence', 'evidence_deterministic_key'),
      ('evidence', 'evidence_discovered_item_idx'),
      ('evidence', 'evidence_pkey'),
      ('evidence', 'evidence_source_created_idx'),
      ('outbox_events', 'outbox_events_identity_key'),
      ('outbox_events', 'outbox_events_pkey'),
      ('outbox_events', 'outbox_events_unpublished_idx'),
      ('promotion_commands', 'promotion_commands_candidate_created_idx'),
      ('promotion_commands', 'promotion_commands_pkey'),
      ('promotion_commands', 'promotion_commands_reviewer_key'),
      ('signal_evidence_links', 'signal_evidence_links_evidence_idx'),
      ('signal_evidence_links', 'signal_evidence_links_pkey')
    ) as expected(table_name, index_name)
    order by expected.table_name, expected.index_name
  $$,
  'governance tables have the exact deterministic index sets'
);

select results_eq(
  $$
    select constraint_info.conname::text collate "C",
      pg_catalog.pg_get_constraintdef(constraint_info.oid)::text collate "C"
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.connamespace = 'public'::regnamespace
      and constraint_info.conname in (
        'evidence_source_id_fkey', 'evidence_raw_item_id_fkey',
        'evidence_discovered_item_id_fkey', 'signal_evidence_links_signal_id_fkey',
        'signal_evidence_links_evidence_id_fkey',
        'candidate_review_decisions_candidate_id_fkey',
        'candidate_review_decisions_reviewer_user_id_fkey',
        'candidate_review_decisions_evidence_id_fkey',
        'candidate_review_decisions_signal_id_fkey',
        'promotion_commands_reviewer_user_id_fkey',
        'promotion_commands_candidate_id_fkey',
        'promotion_commands_decision_id_fkey',
        'promotion_commands_signal_id_fkey',
        'promotion_commands_evidence_id_fkey',
        'promotion_events_review_decision_id_fkey',
        'promotion_events_reviewer_user_id_fkey'
      )
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) not like '%ON DELETE RESTRICT%'
  $$,
  $$ select null::text, null::text where false $$,
  'every governance historical foreign key uses ON DELETE RESTRICT'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.evidence'::regclass),
  'Evidence has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.signal_evidence_links'::regclass),
  'signal Evidence links have row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.candidate_review_decisions'::regclass),
  'review decisions have row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.promotion_commands'::regclass),
  'Promotion command receipts have row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.outbox_events'::regclass),
  'outbox events have row-level security enabled'
);

select is(
  (select rolcanlogin from pg_roles where rolname = 'promotion_service'),
  false,
  'promotion_service cannot login directly'
);

select ok(
  coalesce((
    select not rolcanlogin and not rolinherit and not rolbypassrls and not rolsuper
      and not rolcreatedb and not rolcreaterole and not rolreplication
    from pg_catalog.pg_roles where rolname = 'promotion_service'
  ), false),
  'promotion_service has no privileged role attributes'
);

select ok(
  not has_table_privilege('ai_stage_worker', 'public.signals', 'INSERT'),
  'ai_stage_worker cannot insert canonical signals'
);

select ok(
  not has_any_column_privilege('ai_stage_worker', 'public.extraction_candidates', 'UPDATE')
    and not has_table_privilege('ai_stage_worker', 'public.promotion_events', 'INSERT'),
  'ai_stage_worker cannot mutate candidate review state or append Promotion audit history directly'
);

select function_privs_are(
  'public', 'promote_extraction_candidate', array['uuid', 'text'],
  'ai_stage_worker', array[]::text[],
  'ai_stage_worker cannot execute the legacy Promotion primitive'
);

select ok(
  not has_table_privilege(
    expected_role.role_name,
    pg_catalog.format('public.%I', expected_table.table_name),
    'INSERT,UPDATE,DELETE,TRUNCATE'
  ),
  pg_catalog.format('%s has no direct DML on %s', expected_role.role_name, expected_table.table_name)
)
from (values
  ('anon'), ('authenticated'), ('service_role'), ('ai_stage_worker'),
  ('collection_worker'), ('collection_queue_worker'), ('promotion_service')
) as expected_role(role_name)
cross join (values
  ('evidence'), ('signal_evidence_links'), ('candidate_review_decisions'),
  ('promotion_commands'), ('outbox_events')
) as expected_table(table_name);

select ok(
  pg_catalog.to_regprocedure(expected.signature) is not null,
  pg_catalog.format('%s exists', expected.signature)
)
from (values
  ('public.normalize_evidence_text_v1(text)'),
  ('public.evidence_quote_sha256_v1(text)'),
  ('public.execute_extraction_candidate_review(uuid,jsonb,text,text,timestamp with time zone)'),
  ('public.reconcile_extraction_candidate_evidence(uuid,uuid,bigint,text,timestamp with time zone)')
) as expected(signature);

select ok(
  procedure_info.prosecdef
    and pg_catalog.pg_get_userbyid(procedure_info.proowner) = 'postgres'
    and procedure_info.proconfig = array['search_path=pg_catalog, public, extensions']::text[],
  pg_catalog.format('%s is a postgres-owned security definer with fixed search_path', expected.signature)
)
from (values
  ('public.execute_extraction_candidate_review(uuid,jsonb,text,text,timestamp with time zone)'),
  ('public.reconcile_extraction_candidate_evidence(uuid,uuid,bigint,text,timestamp with time zone)')
) as expected(signature)
left join pg_catalog.pg_proc as procedure_info
  on procedure_info.oid = pg_catalog.to_regprocedure(expected.signature);

select ok(
  has_function_privilege('promotion_service', expected.signature, 'EXECUTE')
    and not has_function_privilege('anon', expected.signature, 'EXECUTE')
    and not has_function_privilege('authenticated', expected.signature, 'EXECUTE')
    and not has_function_privilege('service_role', expected.signature, 'EXECUTE')
    and not has_function_privilege('ai_stage_worker', expected.signature, 'EXECUTE')
    and not has_function_privilege('collection_worker', expected.signature, 'EXECUTE')
    and not has_function_privilege('collection_queue_worker', expected.signature, 'EXECUTE'),
  pg_catalog.format('%s is executable only by promotion_service', expected.signature)
)
from (values
  ('public.execute_extraction_candidate_review(uuid,jsonb,text,text,timestamp with time zone)'),
  ('public.reconcile_extraction_candidate_evidence(uuid,uuid,bigint,text,timestamp with time zone)')
) as expected(signature);

select is(
  public.normalize_evidence_text_v1(
    E'alpha\t\n\v\f\r ' || chr(133) || chr(160) || chr(5760) ||
    chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) ||
    chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) ||
    chr(8233) || chr(8239) || chr(8287) || chr(12288) || 'beta'
  ),
  'alpha beta',
  'database normalization matches the explicit Unicode whitespace vector'
);

select is(
  public.normalize_evidence_text_v1(chr(65279) || 'alpha' || chr(65279)),
  chr(65279) || 'alpha' || chr(65279),
  'database normalization preserves U+FEFF'
);

select is(
  public.evidence_quote_sha256_v1('Case, punctuation!'),
  '5762bcef2d4e2810b7a6ccff1ebbfe76f54f3cf0761a49c7ee5f41f16657de4f',
  'database quote hashing matches the TypeScript UTF-8 SHA-256 vector'
);

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('10000000-0000-4000-8000-000000000090', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'governance-reviewer@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}', '2026-08-20 00:00:00+00', '2026-08-20 00:00:00+00'),
  ('10000000-0000-4000-8000-000000000091', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'governance-revoked@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}', '2026-08-20 00:00:00+00', '2026-08-20 00:00:00+00'),
  ('10000000-0000-4000-8000-000000000092', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'governance-unauthorized@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}', '2026-08-20 00:00:00+00', '2026-08-20 00:00:00+00');

insert into public.user_roles (user_id, role, granted_at, revoked_at)
values
  ('10000000-0000-4000-8000-000000000090', 'reviewer', '2026-08-20 00:00:00+00', null),
  ('10000000-0000-4000-8000-000000000091', 'reviewer', '2026-08-19 00:00:00+00', '2026-08-19 01:00:00+00');

insert into public.projects (id, slug, name, lifecycle, created_at, updated_at)
values ('10000000-0000-4000-8000-000000000010', 'governance-project', 'Governance Project',
  'active', '2026-08-20 00:00:00+00', '2026-08-20 00:00:00+00');

insert into public.sources (id, source_type, name, canonical_url, status, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000020', 'official_web', 'Governance Source',
    'https://governance.example/', 'active', '2026-08-20 00:00:00+00', '2026-08-20 00:00:00+00'),
  ('10000000-0000-4000-8000-000000000021', 'official_web', 'Mismatched Source',
    'https://mismatch.example/', 'active', '2026-08-20 00:00:00+00', '2026-08-20 00:00:00+00');

insert into public.raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at
)
values
  ('10000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000020', 'https://governance.example/feed',
    'https://governance.example/feed', 'rss_feed', 'application/rss+xml', '<rss>feed</rss>',
    repeat('a', 64), '2026-08-20 00:00:00+00'),
  ('10000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000020', 'https://governance.example/article',
    'https://governance.example/article', 'feed_article_html', 'text/html',
    'Prefix Case, punctuation! and a grounded article quote for promotion. Suffix',
    repeat('b', 64), '2026-08-20 00:01:00+00'),
  ('10000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000021', 'https://mismatch.example/article',
    'https://mismatch.example/article', 'feed_article_html', 'text/html',
    'A grounded article quote exists but its source identity is wrong.',
    repeat('c', 64), '2026-08-20 00:02:00+00');

insert into public.discovered_items (
  id, project_id, source_id, feed_raw_item_id, stable_entry_key, version,
  entry_url, summary, is_authority_domain, disposition
)
select
  ('10000000-0000-4000-8000-' || pg_catalog.lpad(item_number::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000010'::uuid,
  '10000000-0000-4000-8000-000000000020'::uuid,
  '10000000-0000-4000-8000-000000000030'::uuid,
  'entry-' || item_number,
  1,
  'https://governance.example/article-' || item_number,
  'A grounded discovered summary quote for governance review number ' || item_number || '.',
  true,
  'eligible'::public.discovery_disposition
from pg_catalog.generate_series(40, 49) as item_number;

insert into public.ai_runs (
  id, stage, input_kind, input_id, input_hash, model_id, prompt_version,
  schema_version, pipeline_version, status, output, created_at
)
values (
  '10000000-0000-4000-8000-000000000050', 'extract.v1', 'discovered_item',
  '10000000-0000-4000-8000-000000000040', repeat('d', 64), 'test-model',
  'extract-prompt-v1', 'extract-schema-v1', 'extract-pipeline-v1', 'succeeded',
  '{"candidates":[]}', '2026-08-20 00:03:00+00'
);

insert into public.extraction_candidates (
  id, ai_run_id, project_id, source_id, discovered_item_id, raw_item_id,
  payload, payload_sha256, status, signal_id, decided_at, created_at
)
select
  ('10000000-0000-4000-8000-' || pg_catalog.lpad(candidate_number::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000050'::uuid,
  '10000000-0000-4000-8000-000000000010'::uuid,
  '10000000-0000-4000-8000-000000000020'::uuid,
  ('10000000-0000-4000-8000-' || pg_catalog.lpad((candidate_number - 20)::text, 12, '0'))::uuid,
  case
    when candidate_number = 64 then '10000000-0000-4000-8000-000000000032'::uuid
    when candidate_number = 65 then null
    else '10000000-0000-4000-8000-000000000031'::uuid
  end,
  pg_catalog.jsonb_build_object(
    'claimType', 'points_program', 'signalType', 'points_program',
    'title', 'Governance candidate ' || candidate_number,
    'summary', 'A sufficiently long canonical signal summary for governance.',
    'confidence', 75,
    'evidenceQuote', case
      when candidate_number = 64 then 'A grounded article quote exists'
      when candidate_number = 65 then 'grounded discovered summary quote'
      else 'Case, punctuation!'
    end,
    'occurredAtIso', null
  ),
  pg_catalog.md5(candidate_number::text) || pg_catalog.md5('candidate-' || candidate_number),
  'pending', null, null, '2026-08-20 00:04:00+00'
from pg_catalog.generate_series(60, 68) as candidate_number;

insert into public.signals (
  id, project_id, signal_type, title, summary, verification, lifecycle,
  confidence, published_at, created_at
)
values
  ('10000000-0000-4000-8000-000000000080', '10000000-0000-4000-8000-000000000010',
    'historical_grounded', 'Historical grounded signal',
    'A historical signal awaiting deterministic Evidence reconciliation.',
    'unverified', 'published', 70, '2026-08-20 00:05:00+00', '2026-08-20 00:05:00+00'),
  ('10000000-0000-4000-8000-000000000081', '10000000-0000-4000-8000-000000000010',
    'historical_ungrounded', 'Historical ungrounded signal',
    'A historical signal whose stored quote cannot be reconciled.',
    'unverified', 'published', 60, '2026-08-20 00:05:00+00', '2026-08-20 00:05:00+00');

update public.extraction_candidates
set status = 'promoted', signal_id = '10000000-0000-4000-8000-000000000080',
  decided_at = '2026-08-20 00:05:00+00'
where id = '10000000-0000-4000-8000-000000000068';

update public.extraction_candidates
set payload = pg_catalog.jsonb_set(
    payload,
    '{evidenceQuote}',
    '"This quote is absent from the stored source"'::jsonb
  ),
  status = 'promoted',
  signal_id = '10000000-0000-4000-8000-000000000081',
  decided_at = '2026-08-20 00:05:00+00'
where id = '10000000-0000-4000-8000-000000000063';

create temporary table governance_command_results (
  case_name text primary key,
  command_id uuid,
  candidate_id uuid,
  candidate_version bigint,
  decision_id uuid,
  outcome text,
  signal_id uuid,
  evidence_id uuid,
  replayed boolean
) on commit drop;

create function pg_temp.governance_input_hash(payload jsonb)
returns text
language sql
immutable
strict
security definer
set search_path = pg_catalog, extensions
as $$
  select pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

grant select, insert on table pg_temp.governance_command_results to promotion_service;

set local role promotion_service;

with command as (
  select '{"version":1,"candidateId":"10000000-0000-4000-8000-000000000060","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":1,"decision":"approve","reasonCode":"evidence_verified","note":null}'::jsonb as payload
)
insert into pg_temp.governance_command_results
select 'approve', result.*
from command
cross join lateral public.execute_extraction_candidate_review(
  '10000000-0000-4000-8000-000000000090', command.payload, 'approve-1',
  pg_temp.governance_input_hash(command.payload),
  '2026-08-20 00:10:00+00'
) as result;

with command as (
  select '{"version":1,"candidateId":"10000000-0000-4000-8000-000000000060","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":1,"decision":"approve","reasonCode":"evidence_verified","note":null}'::jsonb as payload
)
insert into pg_temp.governance_command_results
select 'approve-replay', result.*
from command
cross join lateral public.execute_extraction_candidate_review(
  '10000000-0000-4000-8000-000000000090', command.payload, 'approve-1',
  pg_temp.governance_input_hash(command.payload),
  '2026-08-20 00:11:00+00'
) as result;

reset role;

select is(
  (select pg_catalog.format('%s|%s|%s|%s', outcome, candidate_version, signal_id is not null, evidence_id is not null)
   from pg_temp.governance_command_results where case_name = 'approve'),
  'promoted|2|t|t',
  'approve returns a promoted result with Evidence and signal IDs'
);

select results_eq(
  $$
    select replayed, command_id, decision_id, signal_id, evidence_id
    from pg_temp.governance_command_results where case_name = 'approve-replay'
  $$,
  $$
    select true, command_id, decision_id, signal_id, evidence_id
    from pg_temp.governance_command_results where case_name = 'approve'
  $$,
  'exact replay returns the same stable IDs with replayed true'
);

select results_eq(
  $$
    select
      (select count(*) from public.evidence)::bigint,
      (select count(*) from public.signals where id = result.signal_id)::bigint,
      (select count(*) from public.signal_evidence_links where signal_id = result.signal_id)::bigint,
      (select count(*) from public.candidate_review_decisions where id = result.decision_id)::bigint,
      (select count(*) from public.promotion_events where review_decision_id = result.decision_id)::bigint,
      (select count(*) from public.promotion_commands where id = result.command_id)::bigint,
      (select count(*) from public.outbox_events where aggregate_id = result.candidate_id)::bigint
    from pg_temp.governance_command_results as result where case_name = 'approve'
  $$,
  $$ values (1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint) $$,
  'approve atomically creates exactly one Evidence, signal, link, decision, audit, receipt, and outbox event'
);

select is(
  (select payload from public.outbox_events where aggregate_id = '10000000-0000-4000-8000-000000000060'),
  (select pg_catalog.jsonb_build_object(
    'version', 1,
    'eventType', 'intelligence.signal.promoted.v1',
    'candidateId', candidate_id,
    'candidateVersion', candidate_version,
    'decisionId', decision_id,
    'signalId', signal_id,
    'evidenceId', evidence_id,
    'occurredAt', '2026-08-20T00:10:00.000Z'
  ) from pg_temp.governance_command_results where case_name = 'approve'),
  'approve outbox payload contains only constructed identifiers, version, type, and time'
);

select throws_ok(
  $$
    select * from public.execute_extraction_candidate_review(
      '10000000-0000-4000-8000-000000000090',
      '{"version":1,"candidateId":"10000000-0000-4000-8000-000000000061","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":1,"decision":"reject","reasonCode":"claim_not_supported","note":null}'::jsonb,
      'approve-1',
      pg_temp.governance_input_hash('{"version":1,"candidateId":"10000000-0000-4000-8000-000000000061","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":1,"decision":"reject","reasonCode":"claim_not_supported","note":null}'::jsonb),
      '2026-08-20 00:12:00+00'
    )
  $$,
  'AI104', 'promotion_idempotency_conflict',
  'same reviewer key with a different canonical input hash is rejected'
);

select throws_ok(
  $$
    select * from public.execute_extraction_candidate_review(
      '10000000-0000-4000-8000-000000000090',
      '{"version":1,"candidateId":"10000000-0000-4000-8000-000000000061","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":2,"decision":"reject","reasonCode":"claim_not_supported","note":null}'::jsonb,
      'stale-1',
      pg_temp.governance_input_hash('{"version":1,"candidateId":"10000000-0000-4000-8000-000000000061","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":2,"decision":"reject","reasonCode":"claim_not_supported","note":null}'::jsonb),
      '2026-08-20 00:12:00+00'
    )
  $$,
  'AI103', 'promotion_version_conflict',
  'stale candidate version is rejected'
);

select is((select count(*) from public.promotion_commands where idempotency_key = 'stale-1'), 0::bigint, 'stale version writes no receipt');

select throws_ok(
  $$
    select * from public.execute_extraction_candidate_review(
      '10000000-0000-4000-8000-000000000092',
      '{"version":1,"candidateId":"10000000-0000-4000-8000-000000000066","reviewerUserId":"10000000-0000-4000-8000-000000000092","expectedCandidateVersion":1,"decision":"reject","reasonCode":"claim_not_supported","note":null}'::jsonb,
      'unauthorized-1',
      pg_temp.governance_input_hash('{"version":1,"candidateId":"10000000-0000-4000-8000-000000000066","reviewerUserId":"10000000-0000-4000-8000-000000000092","expectedCandidateVersion":1,"decision":"reject","reasonCode":"claim_not_supported","note":null}'::jsonb),
      '2026-08-20 00:12:00+00'
    )
  $$,
  'AI105', 'promotion_reviewer_not_authorized',
  'a user without an active reviewer role is rejected'
);

select throws_ok(
  $$
    select * from public.execute_extraction_candidate_review(
      '10000000-0000-4000-8000-000000000091',
      '{"version":1,"candidateId":"10000000-0000-4000-8000-000000000067","reviewerUserId":"10000000-0000-4000-8000-000000000091","expectedCandidateVersion":1,"decision":"reject","reasonCode":"claim_not_supported","note":null}'::jsonb,
      'revoked-1',
      pg_temp.governance_input_hash('{"version":1,"candidateId":"10000000-0000-4000-8000-000000000067","reviewerUserId":"10000000-0000-4000-8000-000000000091","expectedCandidateVersion":1,"decision":"reject","reasonCode":"claim_not_supported","note":null}'::jsonb),
      '2026-08-20 00:12:00+00'
    )
  $$,
  'AI105', 'promotion_reviewer_not_authorized',
  'a revoked reviewer role is rejected'
);

set local role promotion_service;

with command as (
  select '{"version":1,"candidateId":"10000000-0000-4000-8000-000000000061","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":1,"decision":"reject","reasonCode":"claim_not_supported","note":"unsupported claim"}'::jsonb as payload
)
insert into pg_temp.governance_command_results
select 'reject', result.* from command
cross join lateral public.execute_extraction_candidate_review(
  '10000000-0000-4000-8000-000000000090', command.payload, 'reject-1',
  pg_temp.governance_input_hash(command.payload),
  '2026-08-20 00:13:00+00'
) as result;

with command as (
  select '{"version":1,"candidateId":"10000000-0000-4000-8000-000000000062","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":1,"decision":"needs_review","reasonCode":"insufficient_context","note":null}'::jsonb as payload
)
insert into pg_temp.governance_command_results
select 'needs-review', result.* from command
cross join lateral public.execute_extraction_candidate_review(
  '10000000-0000-4000-8000-000000000090', command.payload, 'needs-review-1',
  pg_temp.governance_input_hash(command.payload),
  '2026-08-20 00:14:00+00'
) as result;

with command as (
  select '{"version":1,"candidateId":"10000000-0000-4000-8000-000000000064","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":1,"decision":"approve","reasonCode":"evidence_verified","note":null}'::jsonb as payload
)
insert into pg_temp.governance_command_results
select 'source-mismatch', result.* from command
cross join lateral public.execute_extraction_candidate_review(
  '10000000-0000-4000-8000-000000000090', command.payload, 'source-mismatch-1',
  pg_temp.governance_input_hash(command.payload),
  '2026-08-20 00:15:00+00'
) as result;

with command as (
  select '{"version":1,"candidateId":"10000000-0000-4000-8000-000000000065","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":1,"decision":"approve","reasonCode":"evidence_verified","note":null}'::jsonb as payload
)
insert into pg_temp.governance_command_results
select 'summary', result.* from command
cross join lateral public.execute_extraction_candidate_review(
  '10000000-0000-4000-8000-000000000090', command.payload, 'summary-1',
  pg_temp.governance_input_hash(command.payload),
  '2026-08-20 00:16:00+00'
) as result;

insert into pg_temp.governance_command_results
select 'reconcile-grounded', result.*
from public.reconcile_extraction_candidate_evidence(
  '10000000-0000-4000-8000-000000000090',
  '10000000-0000-4000-8000-000000000068',
  1,
  'reconcile-grounded-1',
  '2026-08-20 00:17:00+00'
) as result;

insert into pg_temp.governance_command_results
select 'reconcile-grounded-replay', result.*
from public.reconcile_extraction_candidate_evidence(
  '10000000-0000-4000-8000-000000000090',
  '10000000-0000-4000-8000-000000000068',
  1,
  'reconcile-grounded-1',
  '2026-08-20 00:18:00+00'
) as result;

insert into pg_temp.governance_command_results
select 'reconcile-ungrounded', result.*
from public.reconcile_extraction_candidate_evidence(
  '10000000-0000-4000-8000-000000000090',
  '10000000-0000-4000-8000-000000000063',
  1,
  'reconcile-ungrounded-1',
  '2026-08-20 00:19:00+00'
) as result;

insert into pg_temp.governance_command_results
select 'reconcile-ungrounded-replay', result.*
from public.reconcile_extraction_candidate_evidence(
  '10000000-0000-4000-8000-000000000090',
  '10000000-0000-4000-8000-000000000063',
  1,
  'reconcile-ungrounded-1',
  '2026-08-20 00:20:00+00'
) as result;

reset role;

select results_eq(
  $$
    select result.outcome, candidate.status, candidate.review_status, result.signal_id, result.evidence_id
    from pg_temp.governance_command_results as result
    join public.extraction_candidates as candidate on candidate.id = result.candidate_id
    where result.case_name = 'reject'
  $$,
  $$ values ('rejected'::text, 'rejected'::text, 'decided'::text, null::uuid, null::uuid) $$,
  'reject creates no Evidence or signal and records a decided candidate'
);

select results_eq(
  $$
    select result.outcome, candidate.status, candidate.review_status, candidate.decided_at, result.signal_id
    from pg_temp.governance_command_results as result
    join public.extraction_candidates as candidate on candidate.id = result.candidate_id
    where result.case_name = 'needs-review'
  $$,
  $$ values ('needs_review'::text, 'pending'::text, 'needs_review'::text, null::timestamptz, null::uuid) $$,
  'explicit needs-review keeps canonical status pending'
);

select results_eq(
  $$
    select result.outcome, decision.reason_code, result.signal_id, result.evidence_id
    from pg_temp.governance_command_results as result
    join public.candidate_review_decisions as decision on decision.id = result.decision_id
    where result.case_name = 'source-mismatch'
  $$,
  $$ values ('needs_review'::text, 'source_mismatch'::text, null::uuid, null::uuid) $$,
  'article and candidate source mismatch commits needs-review without canonical data'
);

select is(
  (select evidence.raw_item_id
   from pg_temp.governance_command_results as result
   join public.evidence as evidence on evidence.id = result.evidence_id
   where result.case_name = 'summary'),
  '10000000-0000-4000-8000-000000000030'::uuid,
  'summary grounding records the discovered item Feed Raw Item'
);

select results_eq(
  $$
    select result.outcome, result.candidate_version, result.signal_id,
      result.evidence_id is not null, candidate.status, candidate.review_status,
      candidate.version
    from pg_temp.governance_command_results as result
    join public.extraction_candidates as candidate on candidate.id = result.candidate_id
    where result.case_name = 'reconcile-grounded'
  $$,
  $$
    values (
      'promoted'::text, 2::bigint,
      '10000000-0000-4000-8000-000000000080'::uuid,
      true, 'promoted'::text, 'decided'::text, 2::bigint
    )
  $$,
  'grounded historical reconciliation links Evidence without changing canonical status'
);

select results_eq(
  $$
    select replay.replayed, replay.command_id, replay.decision_id,
      replay.signal_id, replay.evidence_id
    from pg_temp.governance_command_results as replay
    where replay.case_name = 'reconcile-grounded-replay'
  $$,
  $$
    select true, original.command_id, original.decision_id,
      original.signal_id, original.evidence_id
    from pg_temp.governance_command_results as original
    where original.case_name = 'reconcile-grounded'
  $$,
  'grounded reconciliation exact replay returns the original receipt IDs'
);

select results_eq(
  $$
    select result.outcome, result.candidate_version, result.signal_id,
      result.evidence_id, candidate.status, candidate.signal_id,
      candidate.review_status, decision.reason_code
    from pg_temp.governance_command_results as result
    join public.extraction_candidates as candidate on candidate.id = result.candidate_id
    join public.candidate_review_decisions as decision on decision.id = result.decision_id
    where result.case_name = 'reconcile-ungrounded'
  $$,
  $$
    values (
      'needs_review'::text, 2::bigint, null::uuid, null::uuid,
      'promoted'::text, '10000000-0000-4000-8000-000000000081'::uuid,
      'needs_review'::text, 'historical_reconciliation_failed'::text
    )
  $$,
  'ungrounded history remains promoted but appends a reconciliation needs-review decision'
);

select results_eq(
  $$
    select
      (select count(*) from public.signal_evidence_links where signal_id = result.signal_id)::bigint,
      (select count(*) from public.promotion_events where review_decision_id = result.decision_id)::bigint,
      (select count(*) from public.outbox_events where aggregate_id = result.candidate_id)::bigint,
      (select count(*) from public.promotion_commands where id = result.command_id)::bigint
    from pg_temp.governance_command_results as result
    where result.case_name = 'reconcile-grounded'
  $$,
  $$ values (1::bigint, 1::bigint, 1::bigint, 1::bigint) $$,
  'grounded reconciliation appends one link, hardened audit, reviewed outbox event, and receipt'
);

select throws_ok(
  $$
    select * from public.execute_extraction_candidate_review(
      '10000000-0000-4000-8000-000000000090',
      '{"version":1,"candidateId":"not-a-uuid","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":0,"decision":"approve","reasonCode":"claim_not_supported","note":null}'::jsonb,
      'invalid-1',
      pg_temp.governance_input_hash('{"version":1,"candidateId":"not-a-uuid","reviewerUserId":"10000000-0000-4000-8000-000000000090","expectedCandidateVersion":0,"decision":"approve","reasonCode":"claim_not_supported","note":null}'::jsonb),
      '2026-08-20 00:17:00+00'
    )
  $$,
  'AI106', 'promotion_command_invalid',
  'malformed UUID, version, and decision reason inputs fail with the stable invalid-command code'
);

select throws_ok($$ update public.evidence set quote_text = quote_text $$, '55000', 'governance_history_append_only', 'Evidence is append-only');
select throws_ok($$ delete from public.signal_evidence_links $$, '55000', 'governance_history_append_only', 'signal Evidence links are append-only');
select throws_ok($$ update public.candidate_review_decisions set note = note $$, '55000', 'governance_history_append_only', 'review decisions are append-only');
select throws_ok($$ delete from public.promotion_commands $$, '55000', 'governance_history_append_only', 'Promotion receipts are append-only');
select throws_ok($$ update public.promotion_events set actor = actor $$, '55000', 'ai_history_append_only', 'Promotion audit history remains append-only');

select * from finish();
rollback;
