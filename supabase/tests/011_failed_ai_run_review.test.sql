begin;

select no_plan();

select has_table('public', 'ai_run_review_decisions');
select has_table('public', 'ai_run_review_commands');
select has_function('public', 'list_failed_ai_runs');
select has_function('public', 'get_failed_ai_run');
select has_function('public', 'execute_failed_ai_run_review');

select columns_are(
  'public',
  'ai_run_review_decisions',
  array[
    'id', 'ai_run_id', 'review_version', 'reviewer_user_id', 'decision',
    'reason_code', 'note', 'created_at'
  ],
  'failed AI run decisions have the exact append-only audit columns'
);

select columns_are(
  'public',
  'ai_run_review_commands',
  array[
    'id', 'reviewer_user_id', 'ai_run_id', 'idempotency_key',
    'expected_review_version', 'decision', 'reason_code', 'note',
    'resulting_review_version', 'decision_id', 'created_at'
  ],
  'failed AI run command receipts retain every validated command field'
);

select results_eq(
  $$
    select constraint_info.conname::text collate "C",
      constraint_info.contype::text collate "C"
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.connamespace = 'public'::regnamespace
      and constraint_info.conrelid in (
        'public.ai_run_review_decisions'::regclass,
        'public.ai_run_review_commands'::regclass
      )
    order by constraint_info.conname
  $$,
  $$
    select expected.constraint_name collate "C", expected.constraint_type collate "C"
    from (values
      ('ai_run_review_commands_ai_run_id_fkey'::text, 'f'::text),
      ('ai_run_review_commands_decision_id_fkey', 'f'),
      ('ai_run_review_commands_expected_version_valid', 'c'),
      ('ai_run_review_commands_idempotency_key_valid', 'c'),
      ('ai_run_review_commands_pkey', 'p'),
      ('ai_run_review_commands_resulting_version_valid', 'c'),
      ('ai_run_review_commands_reviewer_key', 'u'),
      ('ai_run_review_commands_reviewer_user_id_fkey', 'f'),
      ('ai_run_review_commands_shape', 'c'),
      ('ai_run_review_decisions_ai_run_id_fkey', 'f'),
      ('ai_run_review_decisions_note_valid', 'c'),
      ('ai_run_review_decisions_pkey', 'p'),
      ('ai_run_review_decisions_reviewer_user_id_fkey', 'f'),
      ('ai_run_review_decisions_run_version_key', 'u'),
      ('ai_run_review_decisions_shape', 'c'),
      ('ai_run_review_decisions_version_positive', 'c')
    ) as expected(constraint_name, constraint_type)
    order by expected.constraint_name
  $$,
  'review tables have the exact named primary, unique, foreign-key, and shape constraints'
);

select results_eq(
  $$
    select constraint_info.conname::text collate "C",
      pg_catalog.pg_get_constraintdef(constraint_info.oid)::text collate "C"
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.connamespace = 'public'::regnamespace
      and constraint_info.conname in (
        'ai_run_review_decisions_ai_run_id_fkey',
        'ai_run_review_decisions_reviewer_user_id_fkey',
        'ai_run_review_commands_reviewer_user_id_fkey',
        'ai_run_review_commands_ai_run_id_fkey',
        'ai_run_review_commands_decision_id_fkey'
      )
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) not like '%ON DELETE RESTRICT%'
  $$,
  $$ select null::text, null::text where false $$,
  'every failed-run review historical foreign key uses ON DELETE RESTRICT'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.ai_run_review_decisions'::regclass),
  'failed AI run decisions have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.ai_run_review_commands'::regclass),
  'failed AI run command receipts have RLS enabled'
);

select ok(
  not has_table_privilege(expected_role.role_name, expected_table.table_name, 'SELECT')
    and not has_table_privilege(expected_role.role_name, expected_table.table_name, 'INSERT')
    and not has_table_privilege(expected_role.role_name, expected_table.table_name, 'UPDATE')
    and not has_table_privilege(expected_role.role_name, expected_table.table_name, 'DELETE')
    and not has_table_privilege(expected_role.role_name, expected_table.table_name, 'TRUNCATE'),
  pg_catalog.format('%s has no direct access to %s', expected_role.role_name, expected_table.table_name)
)
from (values
  ('anon'), ('authenticated'), ('service_role'), ('ai_stage_worker'),
  ('collection_worker'), ('collection_queue_worker'), ('collection_schedule_admin'),
  ('promotion_service')
) as expected_role(role_name)
cross join (values
  ('public.ai_run_review_decisions'),
  ('public.ai_run_review_commands')
) as expected_table(table_name);

select ok(
  pg_catalog.to_regprocedure(expected.signature) is not null,
  pg_catalog.format('%s exists', expected.signature)
)
from (values
  ('public.list_failed_ai_runs(text,text,timestamp with time zone,uuid,integer)'),
  ('public.get_failed_ai_run(uuid)'),
  ('public.execute_failed_ai_run_review(uuid,jsonb,text,timestamp with time zone)')
) as expected(signature);

select ok(
  coalesce(
    procedure_info.prosecdef
      and pg_catalog.pg_get_userbyid(procedure_info.proowner) = 'postgres'
      and procedure_info.proconfig = array['search_path=pg_catalog, public, extensions']::text[],
    false
  ),
  pg_catalog.format('%s is postgres-owned security definer with fixed search_path', expected.signature)
)
from (values
  ('public.list_failed_ai_runs(text,text,timestamp with time zone,uuid,integer)'),
  ('public.get_failed_ai_run(uuid)'),
  ('public.execute_failed_ai_run_review(uuid,jsonb,text,timestamp with time zone)')
) as expected(signature)
left join pg_catalog.pg_proc as procedure_info
  on procedure_info.oid = pg_catalog.to_regprocedure(expected.signature);

select ok(
  has_function_privilege('authenticated', expected.signature, 'EXECUTE')
    and not has_function_privilege('anon', expected.signature, 'EXECUTE')
    and not has_function_privilege('service_role', expected.signature, 'EXECUTE')
    and not has_function_privilege('ai_stage_worker', expected.signature, 'EXECUTE')
    and not has_function_privilege('collection_worker', expected.signature, 'EXECUTE')
    and not has_function_privilege('collection_queue_worker', expected.signature, 'EXECUTE')
    and not has_function_privilege('collection_schedule_admin', expected.signature, 'EXECUTE')
    and not has_function_privilege('promotion_service', expected.signature, 'EXECUTE'),
  pg_catalog.format('%s is executable only by authenticated browser sessions', expected.signature)
)
from (values
  ('public.list_failed_ai_runs(text,text,timestamp with time zone,uuid,integer)'),
  ('public.get_failed_ai_run(uuid)'),
  ('public.execute_failed_ai_run_review(uuid,jsonb,text,timestamp with time zone)')
) as expected(signature);

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('22000000-0000-4000-8000-000000000090', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'failed-run-active@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-22 00:00:00+00', '2026-08-22 00:00:00+00'),
  ('22000000-0000-4000-8000-000000000091', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'failed-run-revoked@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-22 00:00:00+00', '2026-08-22 00:00:00+00'),
  ('22000000-0000-4000-8000-000000000092', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'failed-run-ordinary@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-22 00:00:00+00', '2026-08-22 00:00:00+00');

insert into public.user_roles (user_id, role, granted_at, revoked_at)
values
  ('22000000-0000-4000-8000-000000000090', 'reviewer',
    '2026-08-22 00:00:00+00', null),
  ('22000000-0000-4000-8000-000000000091', 'reviewer',
    '2026-08-21 00:00:00+00', '2026-08-21 01:00:00+00');

insert into public.projects (id, slug, name, lifecycle, created_at, updated_at)
values (
  '22000000-0000-4000-8000-000000000010', 'failed-run-review-project',
  'Failed Run Review Project', 'active',
  '2026-08-22 00:00:00+00', '2026-08-22 00:00:00+00'
);

insert into public.sources (
  id, source_type, name, canonical_url, status, created_at, updated_at
)
values (
  '22000000-0000-4000-8000-000000000020', 'official_web',
  'Failed Run Review Source', 'https://failed-run-review.example/', 'active',
  '2026-08-22 00:00:00+00', '2026-08-22 00:00:00+00'
);

insert into public.raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at, created_at
)
values
  ('22000000-0000-4000-8000-000000000030',
    '22000000-0000-4000-8000-000000000010',
    '22000000-0000-4000-8000-000000000020',
    'https://failed-run-review.example/feed', 'https://failed-run-review.example/feed',
    'rss_feed', 'application/rss+xml', '<rss>fixture feed body</rss>', repeat('1', 64),
    '2026-08-22 00:01:00+00', '2026-08-22 00:01:00+00'),
  ('22000000-0000-4000-8000-000000000031',
    '22000000-0000-4000-8000-000000000010',
    '22000000-0000-4000-8000-000000000020',
    'https://failed-run-review.example/a', 'https://failed-run-review.example/a',
    'feed_article_html', 'text/html', 'secret provider body A', repeat('2', 64),
    '2026-08-22 00:02:00+00', '2026-08-22 00:02:00+00'),
  ('22000000-0000-4000-8000-000000000032',
    '22000000-0000-4000-8000-000000000010',
    '22000000-0000-4000-8000-000000000020',
    'https://failed-run-review.example/b', 'https://failed-run-review.example/b',
    'feed_article_html', 'text/html', 'secret provider body B', repeat('3', 64),
    '2026-08-22 00:03:00+00', '2026-08-22 00:03:00+00'),
  ('22000000-0000-4000-8000-000000000033',
    '22000000-0000-4000-8000-000000000010',
    '22000000-0000-4000-8000-000000000020',
    'https://failed-run-review.example/c', 'https://failed-run-review.example/c',
    'feed_article_html', 'text/html', 'secret provider body C', repeat('4', 64),
    '2026-08-22 00:04:00+00', '2026-08-22 00:04:00+00');

insert into public.discovered_items (
  id, project_id, source_id, feed_raw_item_id, stable_entry_key, version,
  entry_url, summary, is_authority_domain, disposition, created_at
)
values (
  '22000000-0000-4000-8000-000000000040',
  '22000000-0000-4000-8000-000000000010',
  '22000000-0000-4000-8000-000000000020',
  '22000000-0000-4000-8000-000000000030',
  'failed-run-discovered-fixture', 1,
  'https://failed-run-review.example/discovered',
  'Unsafe discovered source body must never appear in review projections.',
  true, 'eligible', '2026-08-22 00:05:00+00'
);

insert into public.ai_runs (
  id, stage, input_kind, input_id, input_hash, model_id, prompt_version,
  schema_version, pipeline_version, status, output, usage, error_detail, created_at
)
values
  ('22000000-0000-4000-8000-000000000051', 'extract.v1', 'raw_item',
    '22000000-0000-4000-8000-000000000031', repeat('a', 64), 'safe-test-model',
    'prompt-v1', 'schema-v1', 'pipeline-v1', 'provider_error', null,
    '{"secretUsage":999}', 'provider failed at https://secret.example/token',
    '2026-08-22 00:10:00+00'),
  ('22000000-0000-4000-8000-000000000052', 'extract.v1', 'discovered_item',
    '22000000-0000-4000-8000-000000000040', repeat('b', 64), 'safe-test-model',
    'prompt-v1', 'schema-v1', 'pipeline-v1', 'schema_invalid_after_repair', null,
    '{"secretUsage":998}', 'schema dump must remain private',
    '2026-08-22 00:09:00+00'),
  ('22000000-0000-4000-8000-000000000053', 'extract.v1', 'raw_item',
    '22000000-0000-4000-8000-000000000032', repeat('c', 64), 'safe-test-model',
    'prompt-v1', 'schema-v1', 'pipeline-v1', 'grounding_failed', null,
    '{"secretUsage":997}', 'grounding quote must remain private',
    '2026-08-22 00:08:00+00'),
  ('22000000-0000-4000-8000-000000000054', 'extract.v1', 'raw_item',
    '22000000-0000-4000-8000-000000000033', repeat('d', 64), 'safe-test-model',
    'prompt-v1', 'schema-v1', 'pipeline-v1', 'succeeded', '{"secret":"output"}',
    '{"secretUsage":996}', null, '2026-08-22 00:07:00+00'),
  ('22000000-0000-4000-8000-000000000055', 'extract.v1', 'raw_item',
    '22000000-0000-4000-8000-000000000033', repeat('e', 64), 'safe-test-model',
    'prompt-v1', 'schema-v1', 'pipeline-v2', 'skipped_no_content', null,
    null, null, '2026-08-22 00:06:00+00');

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;
select throws_ok(
  $$ select * from public.list_failed_ai_runs('all', 'all', null, null, 25) $$,
  'AR104', 'reviewer_required',
  'anonymous sessions cannot list failed AI runs'
);
reset role;

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000092', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.list_failed_ai_runs('all', 'all', null, null, 25) $$,
  'AR104', 'reviewer_required',
  'ordinary authenticated users cannot list failed AI runs'
);
select throws_ok(
  $$ select * from public.get_failed_ai_run('22000000-0000-4000-8000-000000000051') $$,
  'AR104', 'reviewer_required',
  'ordinary authenticated users cannot read failed AI run detail'
);
select throws_ok(
  $$
    select * from public.execute_failed_ai_run_review(
      '22000000-0000-4000-8000-000000000051',
      '{"version":1,"expectedReviewVersion":0,"decision":"needs_investigation","reasonCode":"provider_instability","note":null}'::jsonb,
      'ordinary-user-command', '2026-08-22 00:20:00+00'
    )
  $$,
  'AR104', 'reviewer_required',
  'ordinary authenticated users cannot append failed-run decisions'
);
reset role;

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000091', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.list_failed_ai_runs('all', 'all', null, null, 25) $$,
  'AR104', 'reviewer_required',
  'revoked reviewers cannot list failed AI runs'
);
select throws_ok(
  $$ select * from public.get_failed_ai_run('22000000-0000-4000-8000-000000000051') $$,
  'AR104', 'reviewer_required',
  'revoked reviewers cannot read failed AI run detail'
);
select throws_ok(
  $$
    select * from public.execute_failed_ai_run_review(
      '22000000-0000-4000-8000-000000000051',
      '{"version":1,"expectedReviewVersion":0,"decision":"needs_investigation","reasonCode":"provider_instability","note":null}'::jsonb,
      'revoked-reviewer-command', '2026-08-22 00:20:00+00'
    )
  $$,
  'AR104', 'reviewer_required',
  'revoked reviewers cannot append failed-run decisions'
);
reset role;

create temporary table failed_run_list_result (
  version integer not null,
  "runId" uuid not null,
  status text not null,
  "safeFailureCode" text not null,
  stage text not null,
  "inputKind" text not null,
  "modelId" text not null,
  "promptVersion" text not null,
  "schemaVersion" text not null,
  "pipelineVersion" text not null,
  project jsonb null,
  source jsonb null,
  "createdAt" timestamptz not null,
  "reviewState" text not null,
  "reviewVersion" bigint not null,
  "latestDecisionAt" timestamptz null
) on commit drop;
grant insert on table pg_temp.failed_run_list_result to authenticated;

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select lives_ok(
  $$ select * from public.list_failed_ai_runs('all', 'all', null, null, 25) $$,
  'active reviewer can list failures'
);
insert into pg_temp.failed_run_list_result
select * from public.list_failed_ai_runs('all', 'all', null, null, 25);
reset role;

select results_eq(
  $$ select "runId" from pg_temp.failed_run_list_result order by "createdAt" desc, "runId" desc $$,
  $$ values
    ('22000000-0000-4000-8000-000000000051'::uuid),
    ('22000000-0000-4000-8000-000000000052'::uuid),
    ('22000000-0000-4000-8000-000000000053'::uuid)
  $$,
  'list returns only the three reviewable failure statuses in stable descending order'
);

select results_eq(
  $$
    select key_name
    from pg_temp.failed_run_list_result as result
    cross join lateral pg_catalog.jsonb_object_keys(pg_catalog.to_jsonb(result)) as keys(key_name)
    where result."runId" = '22000000-0000-4000-8000-000000000051'
    order by key_name
  $$,
  $$
    select expected.key_name
    from (values
      ('createdAt'::text), ('inputKind'), ('latestDecisionAt'), ('modelId'),
      ('pipelineVersion'), ('project'), ('promptVersion'), ('reviewState'),
      ('reviewVersion'), ('runId'), ('safeFailureCode'), ('schemaVersion'),
      ('source'), ('stage'), ('status'), ('version')
    ) as expected(key_name)
    order by expected.key_name
  $$,
  'list projection has only the safe contract keys'
);

select ok(
  not pg_catalog.to_jsonb(result)::text ~* '(error_detail|raw_text|canonical_url|entry_url|"output"|"usage")'
    and result."safeFailureCode" = result.status
    and result."reviewState" = 'unreviewed'
    and result."reviewVersion" = 0
    and result."latestDecisionAt" is null,
  'list projection excludes unsafe provider, source-body, URL, output, and usage fields'
)
from pg_temp.failed_run_list_result as result;

select results_eq(
  $$
    select project, source
    from pg_temp.failed_run_list_result
    where "runId" = '22000000-0000-4000-8000-000000000051'
  $$,
  $$
    values (
      '{"id":"22000000-0000-4000-8000-000000000010","slug":"failed-run-review-project","name":"Failed Run Review Project"}'::jsonb,
      '{"id":"22000000-0000-4000-8000-000000000020","name":"Failed Run Review Source","sourceType":"official_web"}'::jsonb
    )
  $$,
  'list resolves only bounded project and source metadata'
);

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select results_eq(
  $$
    select "runId"
    from public.list_failed_ai_runs(
      'all', 'all', '2026-08-22 00:09:00+00',
      '22000000-0000-4000-8000-000000000052', 25
    )
  $$,
  $$ values ('22000000-0000-4000-8000-000000000053'::uuid) $$,
  'list cursor is strict on created_at descending then id descending'
);
select throws_ok(
  $$ select * from public.list_failed_ai_runs('all', 'succeeded', null, null, 25) $$,
  'AR105', 'invalid_review_command',
  'list rejects non-reviewable status filters'
);
select throws_ok(
  $$ select * from public.list_failed_ai_runs('all', 'all', null, null, 102) $$,
  'AR105', 'invalid_review_command',
  'list rejects unbounded limits while allowing the repository limit-plus-one contract'
);
select throws_ok(
  $$ select * from public.get_failed_ai_run('22000000-0000-4000-8000-000000000054') $$,
  'AR103', 'review_run_not_found',
  'successful AI runs remain hidden from review detail'
);
select throws_ok(
  $$ select * from public.get_failed_ai_run('22000000-0000-4000-8000-000000000055') $$,
  'AR103', 'review_run_not_found',
  'skipped AI runs remain hidden from review detail'
);
reset role;

create temporary table failed_run_detail_result (
  version integer not null,
  run jsonb not null,
  input jsonb not null,
  decisions jsonb not null
) on commit drop;
grant insert on table pg_temp.failed_run_detail_result to authenticated;

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.failed_run_detail_result
select * from public.get_failed_ai_run('22000000-0000-4000-8000-000000000051');
insert into pg_temp.failed_run_detail_result
select * from public.get_failed_ai_run('22000000-0000-4000-8000-000000000052');
reset role;

select results_eq(
  $$
    select input, decisions
    from pg_temp.failed_run_detail_result
    where run ->> 'runId' = '22000000-0000-4000-8000-000000000051'
  $$,
  $$
    values (
      '{"kind":"raw_item","id":"22000000-0000-4000-8000-000000000031","collectedAt":"2026-08-22T00:02:00+00:00"}'::jsonb,
      '[]'::jsonb
    )
  $$,
  'raw-item detail exposes only the bounded input reference and collection time'
);

select results_eq(
  $$
    select input -> 'collectedAt'
    from pg_temp.failed_run_detail_result
    where run ->> 'runId' = '22000000-0000-4000-8000-000000000052'
  $$,
  $$ values ('null'::jsonb) $$,
  'discovered-item detail does not infer a collection time'
);

create temporary table failed_run_command_result (
  case_name text primary key,
  version integer not null,
  "commandId" uuid not null,
  "runId" uuid not null,
  "decisionId" uuid not null,
  "reviewVersion" bigint not null,
  "reviewState" text not null,
  replayed boolean not null
) on commit drop;
grant insert on table pg_temp.failed_run_command_result to authenticated;

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.failed_run_command_result
select 'first', result.*
from public.execute_failed_ai_run_review(
  '22000000-0000-4000-8000-000000000051',
  '{"version":1,"expectedReviewVersion":0,"decision":"needs_investigation","reasonCode":"provider_instability","note":"Investigate provider stability."}'::jsonb,
  'failed-run-first-command', '2026-08-22 00:20:00+00'
) as result;

insert into pg_temp.failed_run_command_result
select 'replay', result.*
from public.execute_failed_ai_run_review(
  '22000000-0000-4000-8000-000000000051',
  '{"version":1,"expectedReviewVersion":0,"decision":"needs_investigation","reasonCode":"provider_instability","note":"Investigate provider stability."}'::jsonb,
  'failed-run-first-command', '2026-08-22 00:21:00+00'
) as result;

select throws_ok(
  $$
    select * from public.execute_failed_ai_run_review(
      '22000000-0000-4000-8000-000000000051',
      '{"version":1,"expectedReviewVersion":0,"decision":"needs_investigation","reasonCode":"provider_instability","note":"Changed note."}'::jsonb,
      'failed-run-first-command', '2026-08-22 00:22:00+00'
    )
  $$,
  'AR102', 'review_idempotency_conflict',
  'changed input under the same key rejects without replaying'
);

select throws_ok(
  $$
    select * from public.execute_failed_ai_run_review(
      '22000000-0000-4000-8000-000000000051',
      '{"version":1,"expectedReviewVersion":0,"decision":"dismiss","reasonCode":"no_action_needed","note":null}'::jsonb,
      'failed-run-stale-command', '2026-08-22 00:23:00+00'
    )
  $$,
  'AR101', 'review_version_conflict',
  'stale expected review version rejects without mutation'
);

select throws_ok(
  $$
    select * from public.execute_failed_ai_run_review(
      '22000000-0000-4000-8000-000000000052',
      '{"version":1,"expectedReviewVersion":0,"decision":"dismiss","reasonCode":"provider_instability","note":null}'::jsonb,
      'failed-run-invalid-command', '2026-08-22 00:24:00+00'
    )
  $$,
  'AR105', 'invalid_review_command',
  'incompatible decision and reason rejects without mutation'
);

select throws_ok(
  $$
    select * from public.execute_failed_ai_run_review(
      '22000000-0000-4000-8000-000000000052',
      '{"version":1,"expectedReviewVersion":0,"decision":"dismiss","reasonCode":"transient_failure","note":null,"extra":true}'::jsonb,
      'failed-run-extra-key-command', '2026-08-22 00:24:30+00'
    )
  $$,
  'AR105', 'invalid_review_command',
  'review command rejects non-exact JSON keys without mutation'
);

select throws_ok(
  $$
    select * from public.execute_failed_ai_run_review(
      '22000000-0000-4000-8000-000000000052',
      '{"version":1,"expectedReviewVersion":"zero","decision":"dismiss","reasonCode":"transient_failure","note":null}'::jsonb,
      'failed-run-invalid-type-command', '2026-08-22 00:24:45+00'
    )
  $$,
  'AR105', 'invalid_review_command',
  'review command maps malformed scalar types to the stable validation code'
);

insert into pg_temp.failed_run_command_result
select 'dismiss', result.*
from public.execute_failed_ai_run_review(
  '22000000-0000-4000-8000-000000000052',
  '{"version":1,"expectedReviewVersion":0,"decision":"dismiss","reasonCode":"transient_failure","note":null}'::jsonb,
  'failed-run-dismiss-command', '2026-08-22 00:25:00+00'
) as result;
reset role;

select results_eq(
  $$
    select replay.replayed, replay."commandId", replay."decisionId", replay."reviewVersion", replay."reviewState"
    from pg_temp.failed_run_command_result as replay
    where replay.case_name = 'replay'
  $$,
  $$
    select true, original."commandId", original."decisionId", 1::bigint, 'needs_investigation'::text
    from pg_temp.failed_run_command_result as original
    where original.case_name = 'first'
  $$,
  'exact idempotent replay returns the original identifiers and review result'
);

select results_eq(
  $$
    select
      (select count(*) from public.ai_run_review_decisions
       where ai_run_id = '22000000-0000-4000-8000-000000000051')::bigint,
      (select count(*) from public.ai_run_review_commands
       where ai_run_id = '22000000-0000-4000-8000-000000000051')::bigint,
      (select count(*) from public.outbox_events
       where aggregate_id = '22000000-0000-4000-8000-000000000051'
         and event_type = 'intelligence.ai_run.reviewed.v1')::bigint
  $$,
  $$ values (1::bigint, 1::bigint, 1::bigint) $$,
  'first decision and exact replay leave exactly one decision, receipt, and outbox event'
);

select is(
  (select count(*) from public.ai_run_review_commands
   where idempotency_key in (
     'failed-run-stale-command', 'failed-run-invalid-command',
     'failed-run-extra-key-command', 'failed-run-invalid-type-command',
     'ordinary-user-command',
     'revoked-reviewer-command'
   )),
  0::bigint,
  'authorization, invalid-command, and stale-version failures write no receipt'
);

select results_eq(
  $$
    select "reviewState", "reviewVersion", replayed
    from pg_temp.failed_run_command_result
    where case_name in ('first', 'dismiss')
    order by case_name
  $$,
  $$ values
    ('dismissed'::text, 1::bigint, false),
    ('needs_investigation'::text, 1::bigint, false)
  $$,
  'both supported decisions return the exact review-state mapping'
);

select results_eq(
  $$
    select key_name
    from public.outbox_events as outbox
    cross join lateral pg_catalog.jsonb_object_keys(outbox.payload) as keys(key_name)
    where outbox.aggregate_id = '22000000-0000-4000-8000-000000000051'
      and outbox.event_type = 'intelligence.ai_run.reviewed.v1'
    order by key_name
  $$,
  $$
    select expected.key_name
    from (values
      ('decision'::text), ('decisionId'), ('occurredAt'), ('reasonCode'),
      ('reviewVersion'), ('runId'), ('version')
    ) as expected(key_name)
    order by expected.key_name
  $$,
  'review outbox payload contains only the seven bounded event fields'
);

select results_eq(
  $$
    select aggregate_type, aggregate_id, aggregate_version, event_type, event_version,
      payload ->> 'decision', payload ->> 'reasonCode', payload ->> 'occurredAt'
    from public.outbox_events
    where aggregate_id = '22000000-0000-4000-8000-000000000051'
      and event_type = 'intelligence.ai_run.reviewed.v1'
  $$,
  $$
    values (
      'ai_run'::text, '22000000-0000-4000-8000-000000000051'::uuid, 1::bigint,
      'intelligence.ai_run.reviewed.v1'::text, 1::smallint,
      'needs_investigation'::text, 'provider_instability'::text,
      '2026-08-22T00:20:00+00:00'::text
    )
  $$,
  'review outbox envelope and bounded payload match the committed decision'
);

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.failed_run_command_result
select 'second', result.*
from public.execute_failed_ai_run_review(
  '22000000-0000-4000-8000-000000000051',
  '{"version":1,"expectedReviewVersion":1,"decision":"needs_investigation","reasonCode":"schema_regression","note":null}'::jsonb,
  'failed-run-second-command', '2026-08-22 00:26:00+00'
) as result;
reset role;

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select results_eq(
  $$
    select "runId", "reviewState", "reviewVersion"
    from public.list_failed_ai_runs('dismissed', 'all', null, null, 25)
  $$,
  $$ values ('22000000-0000-4000-8000-000000000052'::uuid, 'dismissed'::text, 1::bigint) $$,
  'list review-state filter derives the latest appended decision'
);
reset role;

truncate pg_temp.failed_run_detail_result;
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into pg_temp.failed_run_detail_result
select * from public.get_failed_ai_run('22000000-0000-4000-8000-000000000051');
reset role;

-- Compare the generated decision ID independently because it is intentionally random.
select is(
  (select decisions -> 0 ->> 'decisionId' from pg_temp.failed_run_detail_result),
  (select "decisionId"::text from pg_temp.failed_run_command_result where case_name = 'first'),
  'detail decision history returns the committed decision ID'
);

select results_eq(
  $$
    select
      pg_catalog.jsonb_array_length(decisions),
      (decisions -> 0 ->> 'reviewVersion')::bigint,
      (decisions -> 1 ->> 'reviewVersion')::bigint,
      (decisions -> 1 ->> 'decisionId')::uuid,
      (run ->> 'reviewVersion')::bigint,
      run ->> 'reviewState'
    from pg_temp.failed_run_detail_result
  $$,
  $$
    select
      2, 1::bigint, 2::bigint, second."decisionId", 2::bigint,
      'needs_investigation'::text
    from pg_temp.failed_run_command_result as second
    where second.case_name = 'second'
  $$,
  'detail returns every decision in review-version order and derives the latest review state'
);

select results_eq(
  $$
    select (decisions -> 0) - 'decisionId'
    from pg_temp.failed_run_detail_result
  $$,
  $$
    values (
      '{"version":1,"reviewVersion":1,"decision":"needs_investigation","reasonCode":"provider_instability","note":"Investigate provider stability.","reviewerUserId":"22000000-0000-4000-8000-000000000090","createdAt":"2026-08-22T00:20:00+00:00"}'::jsonb
    )
  $$,
  'detail decision history is chronological and contains only the strict contract fields'
);

create function public.test_fail_failed_run_review_outbox()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.aggregate_id = '22000000-0000-4000-8000-000000000053'::uuid
    and new.event_type = 'intelligence.ai_run.reviewed.v1'
  then
    raise exception 'forced_failed_run_review_outbox_failure' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger test_fail_failed_run_review_outbox
before insert on public.outbox_events
for each row execute function public.test_fail_failed_run_review_outbox();

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.execute_failed_ai_run_review(
      '22000000-0000-4000-8000-000000000053',
      '{"version":1,"expectedReviewVersion":0,"decision":"needs_investigation","reasonCode":"grounding_regression","note":null}'::jsonb,
      'failed-run-forced-outbox-command', '2026-08-22 00:30:00+00'
    )
  $$,
  '55000', 'forced_failed_run_review_outbox_failure',
  'forced outbox failure aborts the transactional review command'
);
reset role;

select results_eq(
  $$
    select
      (select count(*) from public.ai_run_review_decisions
       where ai_run_id = '22000000-0000-4000-8000-000000000053')::bigint,
      (select count(*) from public.ai_run_review_commands
       where ai_run_id = '22000000-0000-4000-8000-000000000053')::bigint,
      (select count(*) from public.outbox_events
       where aggregate_id = '22000000-0000-4000-8000-000000000053'
         and event_type = 'intelligence.ai_run.reviewed.v1')::bigint
  $$,
  $$ values (0::bigint, 0::bigint, 0::bigint) $$,
  'forced outbox failure rolls back the decision and command receipt'
);

select throws_ok(
  $$ update public.ai_run_review_decisions set note = note $$,
  '55000', 'failed_ai_run_review_history_append_only',
  'failed AI run decisions reject UPDATE'
);
select throws_ok(
  $$ delete from public.ai_run_review_decisions $$,
  '55000', 'failed_ai_run_review_history_append_only',
  'failed AI run decisions reject DELETE'
);
select throws_ok(
  $$ update public.ai_run_review_commands set note = note $$,
  '55000', 'failed_ai_run_review_history_append_only',
  'failed AI run command receipts reject UPDATE'
);
select throws_ok(
  $$ delete from public.ai_run_review_commands $$,
  '55000', 'failed_ai_run_review_history_append_only',
  'failed AI run command receipts reject DELETE'
);
select throws_ok(
  $$ update public.ai_runs set error_detail = error_detail where id = '22000000-0000-4000-8000-000000000051' $$,
  '55000', 'ai_history_append_only',
  'AI runs reject UPDATE as append-only history'
);
select throws_ok(
  $$ delete from public.ai_runs where id = '22000000-0000-4000-8000-000000000055' $$,
  '55000', 'ai_history_append_only',
  'AI runs reject DELETE as append-only history'
);

select * from finish();
rollback;
