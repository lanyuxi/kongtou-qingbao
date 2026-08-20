begin;

delete from public.project_scores
where project_id in ('90000000-0000-4000-8000-000000000010'::uuid, '90000000-0000-4000-8000-000000000011'::uuid, '90000000-0000-4000-8000-000000000012'::uuid);
delete from public.signals
where project_id in ('90000000-0000-4000-8000-000000000010'::uuid, '90000000-0000-4000-8000-000000000011'::uuid, '90000000-0000-4000-8000-000000000012'::uuid);
delete from public.project_sources
where project_id in ('90000000-0000-4000-8000-000000000010'::uuid, '90000000-0000-4000-8000-000000000011'::uuid, '90000000-0000-4000-8000-000000000012'::uuid);
delete from public.sources
where id in ('90000000-0000-4000-8000-000000000020'::uuid, '90000000-0000-4000-8000-000000000021'::uuid);
delete from public.projects
where id in ('90000000-0000-4000-8000-000000000010'::uuid, '90000000-0000-4000-8000-000000000011'::uuid, '90000000-0000-4000-8000-000000000012'::uuid);
delete from auth.users
where id = '90000000-0000-4000-8000-000000000001'::uuid;

select plan(90);

select has_table('public', 'signals', 'signals table exists');
select has_table('public', 'project_scores', 'project_scores table exists');

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.signals'::regclass),
  'signals has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.project_scores'::regclass),
  'project_scores has row-level security enabled'
);

select columns_are(
  'public',
  'signals',
  array[
    'id',
    'project_id',
    'signal_type',
    'title',
    'summary',
    'verification',
    'lifecycle',
    'confidence',
    'occurred_at',
    'published_at',
    'expires_at',
    'supersedes_signal_id',
    'created_at'
  ],
  'signals exposes the intelligence contract columns in order'
);
select columns_are(
  'public',
  'project_scores',
  array[
    'id',
    'project_id',
    'model_version',
    'input_version',
    'opportunity_score',
    'risk_score',
    'confidence',
    'recommendation',
    'explanation',
    'calculated_at',
    'created_at'
  ],
  'project_scores exposes the decision-history contract columns in order'
);

select ok(
  (
    select index_definition.indexdef ~ '\(project_id, created_at DESC\)$'
    from pg_catalog.pg_indexes as index_definition
    where index_definition.schemaname = 'public'
      and index_definition.indexname = 'signals_project_id_created_at_idx'
  ),
  'signals has its project and descending creation-time index'
);
select ok(
  (
    select index_definition.indexdef ~ '\(lifecycle, published_at DESC\)$'
    from pg_catalog.pg_indexes as index_definition
    where index_definition.schemaname = 'public'
      and index_definition.indexname = 'signals_lifecycle_published_at_idx'
  ),
  'signals has its lifecycle and descending publication-time index'
);
select ok(
  (
    select index_definition.indexdef ~ 'UNIQUE.*\(project_id, id\)$'
    from pg_catalog.pg_indexes as index_definition
    where index_definition.schemaname = 'public'
      and index_definition.indexname = 'signals_project_id_id_key'
  ),
  'signals has the same-project reference key required by supersession history'
);
select ok(
  (
    select index_definition.indexdef ~ '\(project_id, calculated_at DESC, id DESC\)$'
    from pg_catalog.pg_indexes as index_definition
    where index_definition.schemaname = 'public'
      and index_definition.indexname = 'project_scores_project_id_calculated_at_id_idx'
  ),
  'project scores has its project and descending calculation history index'
);

with expected(constraint_name, delete_action) as (
  values
    ('signals_project_id_fkey', 'r'),
    ('signals_supersedes_signal_same_project_fkey', 'r'),
    ('project_scores_project_id_fkey', 'r')
)
select is(
  (
    select foreign_key.confdeltype::text
    from pg_catalog.pg_constraint as foreign_key
    where foreign_key.conrelid in ('public.signals'::regclass, 'public.project_scores'::regclass)
      and foreign_key.conname = expected.constraint_name
  ),
  expected.delete_action,
  format('%s restricts deletion to preserve history', expected.constraint_name)
)
from expected;

select ok(
  coalesce(
    (
      select pg_catalog.pg_get_constraintdef(foreign_key.oid)
        ~ '^FOREIGN KEY \(project_id, supersedes_signal_id\) REFERENCES (public\.)?signals\(project_id, id\) ON DELETE RESTRICT$'
      from pg_catalog.pg_constraint as foreign_key
      where foreign_key.conrelid = 'public.signals'::regclass
        and foreign_key.conname = 'signals_supersedes_signal_same_project_fkey'
    ),
    false
  ),
  'signal supersession requires the referenced signal to belong to the same project'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'signals'
      and cmd = 'SELECT'
      and policyname in ('signals_select_anon', 'signals_select_authenticated')
  ),
  2,
  'signals has one published-active-project read policy per browser principal'
);
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'project_scores'
      and cmd = 'SELECT'
      and policyname in ('project_scores_select_anon', 'project_scores_select_authenticated')
  ),
  2,
  'project scores have one active-or-rumored read-model policy per browser principal'
);
select ok(
  has_table_privilege('anon', 'public.signals', 'SELECT')
    and has_table_privilege('authenticated', 'public.signals', 'SELECT')
    and has_table_privilege('service_role', 'public.signals', 'SELECT')
    and has_column_privilege('anon', 'public.project_scores', 'opportunity_score', 'SELECT')
    and has_column_privilege('authenticated', 'public.project_scores', 'calculated_at', 'SELECT')
    and has_column_privilege('anon', 'public.project_scores', 'model_version', 'SELECT')
    and has_column_privilege('authenticated', 'public.project_scores', 'input_version', 'SELECT')
    and has_column_privilege('authenticated', 'public.project_scores', 'explanation', 'SELECT')
    and has_column_privilege('service_role', 'public.project_scores', 'model_version', 'SELECT')
    and has_column_privilege('service_role', 'public.project_scores', 'input_version', 'SELECT')
    and has_column_privilege('service_role', 'public.project_scores', 'explanation', 'SELECT'),
  'browser roles receive the exact score columns required by the project-detail read model'
);
select ok(
  not has_any_column_privilege('anon', 'public.signals', 'INSERT,UPDATE')
    and not has_any_column_privilege('anon', 'public.project_scores', 'INSERT,UPDATE')
    and not has_table_privilege('anon', 'public.signals', 'DELETE,TRUNCATE')
    and not has_table_privilege('anon', 'public.project_scores', 'DELETE,TRUNCATE')
    and not has_any_column_privilege('authenticated', 'public.signals', 'INSERT,UPDATE')
    and not has_any_column_privilege('authenticated', 'public.project_scores', 'INSERT,UPDATE')
    and not has_table_privilege('authenticated', 'public.signals', 'DELETE,TRUNCATE')
    and not has_table_privilege('authenticated', 'public.project_scores', 'DELETE,TRUNCATE')
    and not has_any_column_privilege('service_role', 'public.signals', 'INSERT,UPDATE')
    and not has_any_column_privilege('service_role', 'public.project_scores', 'INSERT,UPDATE')
    and not has_table_privilege('service_role', 'public.signals', 'DELETE,TRUNCATE')
    and not has_table_privilege('service_role', 'public.project_scores', 'DELETE,TRUNCATE'),
  'all exposed roles lack append, rewrite, deletion, and truncation privileges on intelligence history'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'signal-user@example.invalid',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-08-09 00:00:00+00',
    '2026-08-09 00:00:00+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'signal-reviewer@example.invalid',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-08-09 00:00:00+00',
    '2026-08-09 00:00:00+00'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'signal-admin@example.invalid',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-08-09 00:00:00+00',
    '2026-08-09 00:00:00+00'
  );

insert into public.user_roles (user_id, role, granted_by, granted_at)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'user',
    '33333333-3333-4333-8333-333333333333',
    '2026-08-09 00:00:00+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'reviewer',
    '33333333-3333-4333-8333-333333333333',
    '2026-08-09 00:00:00+00'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'admin',
    '33333333-3333-4333-8333-333333333333',
    '2026-08-09 00:00:00+00'
  );

insert into public.projects (id, slug, name, lifecycle, created_at, updated_at)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'active-intelligence-project',
    'Active Intelligence Project',
    'active',
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'inactive-intelligence-project',
    'Inactive Intelligence Project',
    'paused',
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    'score-history-project',
    'Score History Project',
    'archived',
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  );

insert into public.sources (
  id, source_type, name, canonical_url, status, created_at, updated_at
)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee0',
  'official_web', 'Intelligence Evidence Fixture',
  'https://intelligence-evidence.example.invalid/', 'active',
  '2026-08-09 01:00:00+00', '2026-08-09 01:00:00+00'
);

insert into public.raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at
)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee0',
  'https://intelligence-evidence.example.invalid/article',
  'https://intelligence-evidence.example.invalid/article',
  'feed_article_html', 'text/html',
  'Published active signal Evidence fixture quote.',
  repeat('e', 64), '2026-08-09 01:01:00+00'
);

select lives_ok(
  $$
    insert into public.signals (
      id,
      project_id,
      signal_type,
      title,
      summary,
      confidence,
      occurred_at,
      expires_at,
      created_at
    )
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      repeat('t', 100),
      repeat('h', 200),
      repeat('s', 2000),
      0,
      '2026-08-09 02:00:00+00',
      '2026-08-09 02:00:00.000001+00',
      '2026-08-09 02:00:00+00'
    )
  $$,
  'signal text and confidence boundaries are accepted'
);
select is(
  (
    select pg_catalog.format('%s|%s|%s', verification::text, lifecycle::text, confidence)
    from public.signals
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  ),
  'unverified|detected|0.00',
  'signal defaults and zero confidence are stored independently'
);
select lives_ok(
  $$
    insert into public.signals (
      id, project_id, signal_type, title, summary, confidence, created_at
    )
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'maximum-confidence',
      'Maximum confidence',
      'Confidence one hundred is valid.',
      100,
      '2026-08-09 02:01:00+00'
    )
  $$,
  'signal confidence one hundred is accepted'
);
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', ' padded', 'Title', 'Summary', 50)
  $$,
  '%signals_signal_type_valid%',
  'signal types must already be trimmed'
);
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', repeat('t', 101), 'Title', 'Summary', 50)
  $$,
  '%signals_signal_type_valid%',
  'signal types reject values longer than 100 characters'
);
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'type', ' Padded', 'Summary', 50)
  $$,
  '%signals_title_valid%',
  'signal titles must already be trimmed'
);
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'type', repeat('t', 201), 'Summary', 50)
  $$,
  '%signals_title_valid%',
  'signal titles reject values longer than 200 characters'
);
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'type', 'Title', ' Padded', 50)
  $$,
  '%signals_summary_valid%',
  'signal summaries must already be trimmed'
);
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'type', 'Title', repeat('s', 2001), 50)
  $$,
  '%signals_summary_valid%',
  'signal summaries reject values longer than 2000 characters'
);
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'type', 'Title', 'Summary', -0.01)
  $$,
  '%signals_confidence_bounds%',
  'signal confidence rejects values below zero'
);
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'type', 'Title', 'Summary', 100.01)
  $$,
  '%signals_confidence_bounds%',
  'signal confidence rejects values above one hundred'
);
select throws_like(
  $$
    insert into public.signals (
      project_id, signal_type, title, summary, confidence, occurred_at, expires_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'expiry',
      'Invalid expiry',
      'Expiry equals occurrence.',
      50,
      '2026-08-09 03:00:00+00',
      '2026-08-09 03:00:00+00'
    )
  $$,
  '%signals_expiry_after_occurrence%',
  'signal expiry must be strictly later than occurrence'
);
select throws_like(
  $$
    insert into public.signals (
      id, project_id, signal_type, title, summary, confidence, supersedes_signal_id
    )
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'correction',
      'Self reference',
      'A signal cannot supersede itself.',
      50,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9'
    )
  $$,
  '%signals_not_self_superseding%',
  'a signal cannot supersede itself'
);
select throws_like(
  $$
    insert into public.signals (
      id, project_id, signal_type, title, summary, lifecycle, confidence
    )
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'published-without-time',
      'Published without time',
      'A published signal must record its publication time.',
      'published',
      50
    )
  $$,
  '%signals_published_at_required_for_published%',
  'published signals require a publication timestamp'
);
select lives_ok(
  $$
    insert into public.signals (
      id, project_id, signal_type, title, summary, lifecycle, confidence, published_at
    )
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb8',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'superseded-history',
      'Superseded publication history',
      'A non-published lifecycle may retain its prior publication time.',
      'superseded',
      50,
      '2026-08-09 03:00:00+00'
    )
  $$,
  'non-published signal history may retain a publication timestamp'
);

insert into public.signals (
  id,
  project_id,
  signal_type,
  title,
  summary,
  verification,
  lifecycle,
  confidence,
  occurred_at,
  published_at,
  supersedes_signal_id,
  created_at
)
values
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'claim-window',
    'Published verified signal',
    'A published signal for an active project.',
    'verified',
    'published',
    91,
    '2026-08-09 03:00:00+00',
    '2026-08-09 03:10:00+00',
    null,
    '2026-08-09 03:10:00+00'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'internal-candidate',
    'Unpublished candidate',
    'This detected signal is not public.',
    'corroborated',
    'detected',
    70,
    '2026-08-09 03:00:00+00',
    null,
    null,
    '2026-08-09 03:30:00+00'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc4',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'inactive-project-signal',
    'Published signal on inactive project',
    'Project lifecycle prevents public exposure.',
    'verified',
    'published',
    80,
    '2026-08-09 03:00:00+00',
    '2026-08-09 03:40:00+00',
    null,
    '2026-08-09 03:40:00+00'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc5',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'retracted-claim-history',
    'Published retracted claim',
    'A published retraction remains visible as contradictory history.',
    'retracted',
    'published',
    100,
    '2026-08-09 03:00:00+00',
    '2026-08-09 03:50:00+00',
    null,
    '2026-08-09 03:50:00+00'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc7',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'unevidenced-publication',
    'Unevidenced published signal',
    'An otherwise-public signal remains hidden without Evidence.',
    'unverified',
    'published',
    60,
    '2026-08-09 03:00:00+00',
    '2026-08-09 03:55:00+00',
    null,
    '2026-08-09 03:55:00+00'
  );

select lives_ok(
  $$
    insert into public.signals (
      id,
      project_id,
      signal_type,
      title,
      summary,
      verification,
      lifecycle,
      confidence,
      occurred_at,
      published_at,
      supersedes_signal_id,
      created_at
    )
    values (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'claim-window-correction',
      'Published disputed correction',
      'Disputed evidence remains visible when the correction is published.',
      'disputed',
      'published',
      25,
      '2026-08-09 03:05:00+00',
      '2026-08-09 03:20:00+00',
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      '2026-08-09 03:20:00+00'
    )
  $$,
  'a signal can supersede earlier history from the same project'
);
select throws_like(
  $$
    insert into public.signals (
      id,
      project_id,
      signal_type,
      title,
      summary,
      confidence,
      supersedes_signal_id
    )
    values (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc6',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'cross-project-correction',
      'Cross-project correction',
      'A signal cannot supersede history owned by another project.',
      50,
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
    )
  $$,
  '%signals_supersedes_signal_same_project_fkey%',
  'a signal cannot supersede history from another project'
);

insert into public.evidence (
  id, source_id, raw_item_id, source_field, quote_text,
  normalized_quote_sha256, verified_at, created_at
)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee0',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  'article_raw_text', 'Published active signal Evidence fixture quote.',
  public.evidence_quote_sha256_v1('Published active signal Evidence fixture quote.'),
  '2026-08-09 03:56:00+00', '2026-08-09 03:56:00+00'
);

insert into public.signal_evidence_links (signal_id, evidence_id, created_at)
values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '2026-08-09 03:56:00+00'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '2026-08-09 03:56:00+00'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc5', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '2026-08-09 03:56:00+00');

select lives_ok(
  $$
    insert into public.project_scores (
      id,
      project_id,
      model_version,
      input_version,
      opportunity_score,
      risk_score,
      confidence,
      recommendation,
      explanation,
      calculated_at,
      created_at
    )
    values (
      'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      repeat('m', 80),
      repeat('i', 128),
      100,
      100,
      0,
      'research',
      repeat('e', 4000),
      '2026-08-09 04:00:00+00',
      '2026-08-09 04:00:00+00'
    )
  $$,
  'score text and numeric boundaries are accepted independently'
);
select is(
  (
    select pg_catalog.format(
      '%s|%s|%s|%s',
      opportunity_score,
      risk_score,
      confidence,
      recommendation::text
    )
    from public.project_scores
    where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
  ),
  '100.00|100.00|0.00|research',
  'high opportunity does not reduce risk and confidence remains separate'
);
select lives_ok(
  $$
    insert into public.project_scores (
      id,
      project_id,
      model_version,
      input_version,
      opportunity_score,
      risk_score,
      confidence,
      recommendation,
      explanation,
      calculated_at,
      created_at
    )
    values (
      'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'model-v1',
      'input-v2',
      0,
      0,
      100,
      'watch',
      'A new input version appends a correction.',
      '2026-08-09 04:10:00+00',
      '2026-08-09 04:10:00+00'
    )
  $$,
  'a new score input version appends independent zero and one-hundred boundaries'
);

insert into public.score_signal_links (project_score_id, signal_id)
values (
  'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
);

insert into public.project_scores (
  id,
  project_id,
  model_version,
  input_version,
  opportunity_score,
  risk_score,
  confidence,
  recommendation,
  explanation,
  calculated_at,
  created_at
)
values (
  'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  'model-v1',
  'input-v1',
  40,
  60,
  70,
  'research',
  'Dedicated score-history foreign-key fixture.',
  '2026-08-09 04:20:00+00',
  '2026-08-09 04:20:00+00'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      ' padded',
      'input',
      50,
      50,
      50,
      'watch',
      'Explanation',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_model_version_valid%',
  'score model versions must already be trimmed'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      repeat('m', 81),
      'input',
      50,
      50,
      50,
      'watch',
      'Explanation',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_model_version_valid%',
  'score model versions reject values longer than 80 characters'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'model',
      ' padded',
      50,
      50,
      50,
      'watch',
      'Explanation',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_input_version_valid%',
  'score input versions must already be trimmed'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'model',
      repeat('i', 129),
      50,
      50,
      50,
      'watch',
      'Explanation',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_input_version_valid%',
  'score input versions reject values longer than 128 characters'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'model',
      'input',
      50,
      50,
      50,
      'watch',
      ' Padded',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_explanation_valid%',
  'score explanations must already be trimmed'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'model',
      'input',
      50,
      50,
      50,
      'watch',
      repeat('e', 4001),
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_explanation_valid%',
  'score explanations reject values longer than 4000 characters'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'model-v1',
      'opportunity-low',
      -0.01,
      50,
      50,
      'watch',
      'Below opportunity minimum.',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_opportunity_bounds%',
  'opportunity score rejects values below zero'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'model-v1',
      'opportunity-high',
      100.01,
      50,
      50,
      'watch',
      'Above opportunity maximum.',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_opportunity_bounds%',
  'opportunity score rejects values above one hundred'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'model-v1',
      'risk-low',
      50,
      -0.01,
      50,
      'watch',
      'Below risk minimum.',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_risk_bounds%',
  'risk score rejects values below zero'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'model-v1',
      'risk-high',
      50,
      100.01,
      50,
      'watch',
      'Above risk maximum.',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_risk_bounds%',
  'risk score rejects values above one hundred'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'model-v1',
      'confidence-low',
      50,
      50,
      -0.01,
      'watch',
      'Below confidence minimum.',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_confidence_bounds%',
  'score confidence rejects values below zero'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'model-v1',
      'confidence-high',
      50,
      50,
      100.01,
      'watch',
      'Above confidence maximum.',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%project_scores_confidence_bounds%',
  'score confidence rejects values above one hundred'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      repeat('m', 80),
      repeat('i', 128),
      10,
      20,
      30,
      'watch',
      'Duplicate deterministic score input.',
      '2026-08-09 05:00:00+00'
    )
  $$,
  '%duplicate key value violates unique constraint "project_scores_project_id_model_version_input_version_key"%',
  'the same project model and input version cannot be scored twice'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select id from public.signals order by id$$,
  $$
    values
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2'::uuid),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc5'::uuid)
  $$,
  'anonymous users see published signals for active projects including disputed evidence'
);
select is(
  (select count(*)::integer from public.signals
   where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc7'),
  0,
  'anonymous users cannot see an otherwise-public signal without Evidence'
);
select results_eq(
  $$select id from public.project_scores where model_version is not null order by id$$,
  $$values ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid)$$,
  'anonymous model-version reads require complete Evidence and public project lifecycle'
);
select results_eq(
  $$select id from public.project_scores order by id$$,
  $$values ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid)$$,
  'anonymous users can read only Evidence-complete scores for active or rumored projects'
);
select is(
  (select count(*)::integer from public.project_scores
   where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'),
  0,
  'anonymous users cannot read a preserved zero-link score'
);
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'anon', 'Anonymous', 'Blocked write.', 50)
  $$,
  'permission denied for table signals',
  'anonymous users cannot append signals'
);
select throws_like(
  $$update public.signals set title = 'Anonymous rewrite' where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$$,
  'permission denied for table signals',
  'anonymous users cannot rewrite signals'
);
select throws_like(
  $$delete from public.project_scores where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'$$,
  'permission denied for table project_scores',
  'anonymous users cannot delete score history'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select results_eq(
  $$select id from public.signals order by id$$,
  $$
    values
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2'::uuid),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc5'::uuid)
  $$,
  'an ordinary user sees only published signals for active projects'
);
select results_eq(
  $$select id from public.project_scores where explanation is not null order by id$$,
  $$values ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid)$$,
  'an ordinary user explanation reads require complete Evidence and public project lifecycle'
);
select results_eq(
  $$select id from public.project_scores order by id$$,
  $$values ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid)$$,
  'an ordinary user can read only Evidence-complete scores for active or rumored projects'
);
select results_eq(
  $$select id from public.project_scores where input_version is not null order by id$$,
  $$values ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid)$$,
  'an ordinary user input-version reads require complete Evidence and public project lifecycle'
);
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'user', 'Ordinary user', 'Blocked write.', 50)
  $$,
  'permission denied for table signals',
  'an ordinary user cannot append signals'
);
select throws_like(
  $$update public.signals set title = 'Ordinary rewrite' where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$$,
  'permission denied for table signals',
  'an ordinary user cannot rewrite signals'
);
select throws_like(
  $$delete from public.signals where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$$,
  'permission denied for table signals',
  'an ordinary user cannot delete signals'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'user', 'user', 50, 50, 50,
      'watch', 'Blocked score write.', '2026-08-09 06:00:00+00'
    )
  $$,
  'permission denied for table project_scores',
  'an ordinary user cannot append scores'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select ok(public.has_active_role('reviewer'), 'the browser principal has an active reviewer grant');
select results_eq(
  $$select id from public.signals order by id$$,
  $$
    values
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2'::uuid),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc5'::uuid)
  $$,
  'a browser reviewer still sees only published signals for active projects'
);
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'reviewer', 'Reviewer', 'Blocked write.', 50)
  $$,
  'permission denied for table signals',
  'a browser reviewer cannot append signals'
);
select throws_like(
  $$update public.project_scores set risk_score = 1 where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'$$,
  'permission denied for table project_scores',
  'a browser reviewer cannot rewrite score history'
);
select throws_like(
  $$delete from public.signals where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$$,
  'permission denied for table signals',
  'a browser reviewer cannot delete signals'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);

select ok(public.has_active_role('admin'), 'the browser principal has an active admin grant');
select results_eq(
  $$select id from public.signals order by id$$,
  $$
    values
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2'::uuid),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccc5'::uuid)
  $$,
  'a browser admin still sees only published signals for active projects'
);
select results_eq(
  $$select id from public.project_scores where explanation is not null order by id$$,
  $$values ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid)$$,
  'a browser admin explanation reads require complete Evidence and public project lifecycle'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'admin', 'admin', 50, 50, 50,
      'watch', 'Blocked score write.', '2026-08-09 06:00:00+00'
    )
  $$,
  'permission denied for table project_scores',
  'a browser admin cannot append scores'
);
select throws_like(
  $$update public.signals set summary = 'Admin rewrite' where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$$,
  'permission denied for table signals',
  'a browser admin cannot rewrite signals'
);
select throws_like(
  $$delete from public.project_scores where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'$$,
  'permission denied for table project_scores',
  'a browser admin cannot delete score history'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is((select count(*)::integer from public.signals), 9, 'service role can read all signal history');
select is((select count(*)::integer from public.project_scores), 3, 'service role can read all score history');
select throws_like(
  $$
    insert into public.signals (project_id, signal_type, title, summary, confidence)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'service', 'Service role', 'Blocked write.', 50)
  $$,
  'permission denied for table signals',
  'service role cannot append canonical signals before Promotion Service exists'
);
select throws_like(
  $$
    insert into public.project_scores (
      project_id, model_version, input_version, opportunity_score, risk_score,
      confidence, recommendation, explanation, calculated_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'service', 'service', 50, 50, 50,
      'watch', 'Blocked score write.', '2026-08-09 06:00:00+00'
    )
  $$,
  'permission denied for table project_scores',
  'service role cannot append canonical scores before Promotion Service exists'
);
select throws_like(
  $$update public.signals set lifecycle = 'superseded' where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$$,
  'permission denied for table signals',
  'service role cannot overwrite signal history'
);
select throws_like(
  $$update public.project_scores set confidence = 1 where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'$$,
  'permission denied for table project_scores',
  'service role cannot overwrite score history'
);
select throws_like(
  $$delete from public.signals where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$$,
  'permission denied for table signals',
  'service role cannot delete signal history'
);
select throws_like(
  $$delete from public.project_scores where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'$$,
  'permission denied for table project_scores',
  'service role cannot delete score history'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

select throws_like(
  $$delete from public.signals where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$$,
  '%signals_supersedes_signal_same_project_fkey%',
  'same-project supersession prevents deletion of referenced signal history'
);
select throws_like(
  $$delete from public.projects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  '%signals_project_id_fkey%',
  'a project with signal history cannot be deleted'
);
select throws_like(
  $$delete from public.projects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'$$,
  '%signals_project_id_fkey%',
  'an inactive project with published signal history cannot be deleted'
);
select throws_like(
  $$delete from public.projects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'$$,
  '%project_scores_project_id_fkey%',
  'a project with score history cannot be deleted'
);

select * from finish();

rollback;
