begin;

select plan(83);

select has_function(
  'public',
  'current_project_score_is_public',
  array['uuid']::text[],
  'current project score public-eligibility helper exists'
);
select has_function(
  'public',
  'current_score_citation_path_is_public',
  array['uuid', 'uuid', 'uuid']::text[],
  'current score citation path public-eligibility helper exists'
);
select has_view(
  'public',
  'project_current_score_factors',
  'project current score factors view exists'
);
select has_view(
  'public',
  'project_current_score_evidence_citations',
  'project current score Evidence citations view exists'
);
select has_column(
  'public',
  'project_current_state',
  'project_score_id',
  'project current state carries the immutable score ID'
);

select ok(
  coalesce(
    procedure_info.prosecdef
      and procedure_info.provolatile = 's'
      and pg_catalog.pg_get_userbyid(procedure_info.proowner) = 'postgres'
      and procedure_info.proconfig = array['search_path=pg_catalog, public']::text[],
    false
  ),
  pg_catalog.format(
    '%s is stable, postgres-owned, security definer, and fixed-search-path',
    expected.signature
  )
)
from (values
  ('public.current_project_score_is_public(uuid)'),
  ('public.current_score_citation_path_is_public(uuid,uuid,uuid)')
) as expected(signature)
left join pg_catalog.pg_proc as procedure_info
  on procedure_info.oid = pg_catalog.to_regprocedure(expected.signature);

select results_eq(
  $$
    select routine_info.routine_name::text collate "C",
      privilege_info.grantee::text collate "C"
    from information_schema.routines as routine_info
    join information_schema.routine_privileges as privilege_info
      on privilege_info.specific_schema = routine_info.specific_schema
      and privilege_info.specific_name = routine_info.specific_name
    where routine_info.specific_schema = 'public'
      and routine_info.routine_name in (
        'current_project_score_is_public',
        'current_score_citation_path_is_public'
      )
      and privilege_info.privilege_type = 'EXECUTE'
    order by routine_info.routine_name, privilege_info.grantee
  $$,
  $$
    select expected.routine_name collate "C", expected.grantee collate "C"
    from (values
      ('current_project_score_is_public'::text, 'anon'::text),
      ('current_project_score_is_public', 'authenticated'),
      ('current_project_score_is_public', 'postgres'),
      ('current_score_citation_path_is_public', 'anon'),
      ('current_score_citation_path_is_public', 'authenticated'),
      ('current_score_citation_path_is_public', 'postgres')
    ) as expected(routine_name, grantee)
    order by expected.routine_name, expected.grantee
  $$,
  'score-detail helpers are executable only by their owner and browser roles'
);

select ok(
  pg_catalog.pg_get_userbyid(view_relation.relowner) = 'postgres'
    and coalesce(view_relation.reloptions, '{}'::text[]) @> array[
      'security_invoker=true',
      'security_barrier=true'
    ]::text[],
  pg_catalog.format(
    '%s is postgres-owned, security-invoker, and security-barrier',
    expected.view_name
  )
)
from (values
  ('project_current_state'),
  ('project_current_score_factors'),
  ('project_current_score_evidence_citations')
) as expected(view_name)
join pg_catalog.pg_class as view_relation
  on view_relation.oid = pg_catalog.to_regclass(
    pg_catalog.format('public.%I', expected.view_name)
  );

select columns_are(
  'public',
  'project_current_state',
  array[
    'project_id',
    'slug',
    'name',
    'summary',
    'lifecycle',
    'primary_chain',
    'project_version',
    'project_updated_at',
    'opportunity_score',
    'risk_score',
    'score_confidence',
    'recommendation',
    'score_calculated_at',
    'latest_published_signal_at',
    'official_website_url',
    'score_model_version',
    'score_input_version',
    'score_explanation',
    'project_score_id'
  ],
  'project current state appends only the immutable score ID'
);
select columns_are(
  'public',
  'project_current_score_factors',
  array[
    'project_id',
    'project_score_id',
    'axis',
    'factor_code',
    'contribution',
    'input_value',
    'detail'
  ],
  'factor projection has the exact safe columns'
);
select columns_are(
  'public',
  'project_current_score_evidence_citations',
  array[
    'project_id',
    'project_score_id',
    'signal_id',
    'signal_title',
    'signal_verification',
    'signal_published_at',
    'evidence_id',
    'citation_text',
    'evidence_source_field',
    'evidence_verified_at',
    'source_id',
    'source_name',
    'source_type',
    'source_is_official',
    'source_relation_verified_at'
  ],
  'citation projection has the exact safe no-URL columns'
);

select ok(
  has_table_privilege('anon', pg_catalog.format('public.%I', expected.view_name), 'SELECT')
    and has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.view_name),
      'SELECT'
    )
    and not has_table_privilege(
      'service_role',
      pg_catalog.format('public.%I', expected.view_name),
      'SELECT'
    )
    and not exists (
      select 1
      from pg_catalog.aclexplode(view_relation.relacl) as exploded_acl
      where exploded_acl.grantee = 0
        and exploded_acl.privilege_type = 'SELECT'
    ),
  pg_catalog.format('%s grants SELECT only to browser roles', expected.view_name)
)
from (values
  ('project_current_score_factors'),
  ('project_current_score_evidence_citations')
) as expected(view_name)
join pg_catalog.pg_class as view_relation
  on view_relation.oid = pg_catalog.to_regclass(
    pg_catalog.format('public.%I', expected.view_name)
  );

select ok(
  not has_table_privilege(
    'anon',
    pg_catalog.format('public.%I', expected.view_name),
    'INSERT,UPDATE,DELETE,TRUNCATE'
  )
    and not has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.view_name),
      'INSERT,UPDATE,DELETE,TRUNCATE'
    ),
  pg_catalog.format('%s grants no browser mutation path', expected.view_name)
)
from (values
  ('project_current_score_factors'),
  ('project_current_score_evidence_citations')
) as expected(view_name);

select ok(
  relation.relrowsecurity,
  pg_catalog.format('%s keeps row-level security enabled', expected.table_name)
)
from (values
  ('score_factors'),
  ('score_signal_links'),
  ('signal_evidence_links'),
  ('evidence')
) as expected(table_name)
join pg_catalog.pg_class as relation
  on relation.oid = pg_catalog.to_regclass(
    pg_catalog.format('public.%I', expected.table_name)
  );

select results_eq(
  $$
    select
      policy.tablename::text collate "C",
      policy.policyname::text collate "C",
      policy.roles::text collate "C",
      policy.cmd::text collate "C",
      policy.qual::text collate "C"
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename in (
        'score_factors',
        'score_signal_links',
        'signal_evidence_links',
        'evidence'
      )
      and policy.policyname not like '%ai_stage_worker%'
    order by policy.tablename, policy.policyname
  $$,
  $$
    values
      ('evidence'::text collate "C", 'evidence_select_anon'::text collate "C", '{anon}'::text collate "C", 'SELECT'::text collate "C", 'current_score_citation_path_is_public(NULL::uuid, NULL::uuid, id)'::text collate "C"),
      ('evidence'::text collate "C", 'evidence_select_authenticated'::text collate "C", '{authenticated}'::text collate "C", 'SELECT'::text collate "C", 'current_score_citation_path_is_public(NULL::uuid, NULL::uuid, id)'::text collate "C"),
      ('score_factors'::text collate "C", 'score_factors_select_anon'::text collate "C", '{anon}'::text collate "C", 'SELECT'::text collate "C", 'current_project_score_is_public(project_score_id)'::text collate "C"),
      ('score_factors'::text collate "C", 'score_factors_select_authenticated'::text collate "C", '{authenticated}'::text collate "C", 'SELECT'::text collate "C", 'current_project_score_is_public(project_score_id)'::text collate "C"),
      ('score_signal_links'::text collate "C", 'score_signal_links_select_anon'::text collate "C", '{anon}'::text collate "C", 'SELECT'::text collate "C", 'current_score_citation_path_is_public(project_score_id, signal_id, NULL::uuid)'::text collate "C"),
      ('score_signal_links'::text collate "C", 'score_signal_links_select_authenticated'::text collate "C", '{authenticated}'::text collate "C", 'SELECT'::text collate "C", 'current_score_citation_path_is_public(project_score_id, signal_id, NULL::uuid)'::text collate "C"),
      ('signal_evidence_links'::text collate "C", 'signal_evidence_links_select_anon'::text collate "C", '{anon}'::text collate "C", 'SELECT'::text collate "C", 'current_score_citation_path_is_public(NULL::uuid, signal_id, evidence_id)'::text collate "C"),
      ('signal_evidence_links'::text collate "C", 'signal_evidence_links_select_authenticated'::text collate "C", '{authenticated}'::text collate "C", 'SELECT'::text collate "C", 'current_score_citation_path_is_public(NULL::uuid, signal_id, evidence_id)'::text collate "C")
  $$,
  'citation base tables have only the exact browser SELECT policies'
);

select results_eq(
  $$
    select
      principal.role_name collate "C",
      column_info.table_name::text collate "C",
      column_info.column_name::text collate "C",
      has_column_privilege(
        principal.role_name,
        pg_catalog.format('public.%I', column_info.table_name),
        column_info.column_name,
        'SELECT'
      )
    from (values
      ('anon'::text, 1),
      ('authenticated'::text, 2)
    ) as principal(role_name, role_order)
    cross join information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name in (
        'score_factors',
        'score_signal_links',
        'signal_evidence_links',
        'evidence'
      )
    order by principal.role_order, column_info.table_name, column_info.ordinal_position
  $$,
  $$
    select
      principal.role_name collate "C",
      column_info.table_name::text collate "C",
      column_info.column_name::text collate "C",
      column_info.column_name = any(
        case column_info.table_name
          when 'score_factors' then array[
            'project_score_id', 'axis', 'factor_code', 'contribution',
            'input_value', 'detail'
          ]::text[]
          when 'score_signal_links' then array[
            'project_score_id', 'signal_id'
          ]::text[]
          when 'signal_evidence_links' then array[
            'signal_id', 'evidence_id'
          ]::text[]
          when 'evidence' then array[
            'id', 'source_id', 'source_field', 'quote_text', 'verified_at'
          ]::text[]
        end
      )
    from (values
      ('anon'::text, 1),
      ('authenticated'::text, 2)
    ) as principal(role_name, role_order)
    cross join information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name in (
        'score_factors',
        'score_signal_links',
        'signal_evidence_links',
        'evidence'
      )
    order by principal.role_order, column_info.table_name, column_info.ordinal_position
  $$,
  'browser roles have the exact safe base-table column SELECT matrix'
);

select ok(
  has_column_privilege(
    expected.role_name,
    'public.project_scores',
    'id',
    'SELECT'
  ),
  pg_catalog.format('%s can read the immutable project score ID', expected.role_name)
)
from (values ('anon'), ('authenticated')) as expected(role_name);

select ok(
  not has_any_column_privilege(
    expected.role_name,
    pg_catalog.format('public.%I', expected_table.table_name),
    'INSERT,UPDATE'
  )
    and not has_table_privilege(
      expected.role_name,
      pg_catalog.format('public.%I', expected_table.table_name),
      'DELETE,TRUNCATE'
    ),
  pg_catalog.format('%s cannot mutate %s', expected.role_name, expected_table.table_name)
)
from (values ('anon'), ('authenticated')) as expected(role_name)
cross join (values
  ('score_factors'),
  ('score_signal_links'),
  ('signal_evidence_links'),
  ('evidence')
) as expected_table(table_name);

select ok(
  not has_table_privilege(
    expected.role_name,
    'public.project_current_score_factors',
    'SELECT'
  )
    and not has_table_privilege(
      expected.role_name,
      'public.project_current_score_evidence_citations',
      'SELECT'
    )
    and not has_function_privilege(
      expected.role_name,
      'public.current_project_score_is_public(uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      expected.role_name,
      'public.current_score_citation_path_is_public(uuid,uuid,uuid)',
      'EXECUTE'
    ),
  pg_catalog.format('%s has no score-detail browser boundary grant', expected.role_name)
)
from (values
  ('service_role'),
  ('ai_stage_worker'),
  ('promotion_service'),
  ('collection_worker'),
  ('collection_queue_worker'),
  ('collection_schedule_admin')
) as expected(role_name);

select ok(
  not has_any_column_privilege(
    expected.role_name,
    pg_catalog.format('public.%I', expected_table.table_name),
    'SELECT'
  ),
  pg_catalog.format('%s cannot read unsafe %s data', expected.role_name, expected_table.table_name)
)
from (values ('anon'), ('authenticated')) as expected(role_name)
cross join (values
  ('raw_items'),
  ('extraction_candidates'),
  ('candidate_review_decisions'),
  ('promotion_commands'),
  ('outbox_events')
) as expected_table(table_name);

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('12000000-0000-4000-8000-000000000090', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'score-detail-owner@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-24 00:00:00+00', '2026-08-24 00:00:00+00'),
  ('12000000-0000-4000-8000-000000000091', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'score-detail-non-owner@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-24 00:00:00+00', '2026-08-24 00:00:00+00'),
  ('12000000-0000-4000-8000-000000000092', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'score-detail-admin@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-24 00:00:00+00', '2026-08-24 00:00:00+00'),
  ('12000000-0000-4000-8000-000000000093', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'score-detail-reviewer@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-24 00:00:00+00', '2026-08-24 00:00:00+00'),
  ('12000000-0000-4000-8000-000000000094', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'score-detail-revoked@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-24 00:00:00+00', '2026-08-24 00:00:00+00');

insert into public.user_roles (user_id, role, granted_at, revoked_at)
values
  ('12000000-0000-4000-8000-000000000090', 'user',
    '2026-08-24 00:00:00+00', null),
  ('12000000-0000-4000-8000-000000000091', 'user',
    '2026-08-24 00:00:00+00', null),
  ('12000000-0000-4000-8000-000000000092', 'admin',
    '2026-08-24 00:00:00+00', null),
  ('12000000-0000-4000-8000-000000000093', 'reviewer',
    '2026-08-24 00:00:00+00', null),
  ('12000000-0000-4000-8000-000000000094', 'reviewer',
    '2026-08-23 00:00:00+00', '2026-08-23 01:00:00+00');

insert into public.projects (
  id, slug, name, lifecycle, created_at, updated_at
)
values
  ('12000000-0000-4000-8000-000000000010', 'score-detail-active',
    'Score Detail Active', 'active',
    '2026-08-24 00:00:00+00', '2026-08-24 00:00:00+00'),
  ('12000000-0000-4000-8000-000000000011', 'score-detail-rumored',
    'Score Detail Rumored', 'rumored',
    '2026-08-24 00:00:00+00', '2026-08-24 00:00:00+00'),
  ('12000000-0000-4000-8000-000000000012', 'score-detail-paused',
    'Score Detail Paused', 'paused',
    '2026-08-24 00:00:00+00', '2026-08-24 00:00:00+00');

insert into public.sources (
  id, source_type, name, canonical_url, status, created_at, updated_at
)
values
  ('12000000-0000-4000-8000-000000000020', 'official_web',
    'Active official source', 'https://score-detail-active.example.invalid/',
    'active', '2026-08-24 00:00:00+00', '2026-08-24 00:00:00+00'),
  ('12000000-0000-4000-8000-000000000021', 'independent_research',
    'Rumored research source', 'https://score-detail-rumored.example.invalid/',
    'active', '2026-08-24 00:00:00+00', '2026-08-24 00:00:00+00'),
  ('12000000-0000-4000-8000-000000000022', 'official_docs',
    'Paused source', 'https://score-detail-paused.example.invalid/',
    'active', '2026-08-24 00:00:00+00', '2026-08-24 00:00:00+00');

insert into public.project_sources (
  project_id, source_id, authority_domains, is_official,
  verified_at, verified_by, created_at
)
values
  ('12000000-0000-4000-8000-000000000010',
    '12000000-0000-4000-8000-000000000020',
    array['score-detail-active.example.invalid'], true,
    '2026-08-23 12:00:00+00', '12000000-0000-4000-8000-000000000093',
    '2026-08-23 12:00:00+00'),
  ('12000000-0000-4000-8000-000000000011',
    '12000000-0000-4000-8000-000000000021',
    '{}'::text[], false, null, null, '2026-08-23 12:00:00+00'),
  ('12000000-0000-4000-8000-000000000012',
    '12000000-0000-4000-8000-000000000022',
    '{}'::text[], false, null, null, '2026-08-23 12:00:00+00');

insert into public.raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at
)
values
  ('12000000-0000-4000-8000-000000000030',
    '12000000-0000-4000-8000-000000000010',
    '12000000-0000-4000-8000-000000000020',
    'https://score-detail-active.example.invalid/article',
    'https://score-detail-active.example.invalid/article',
    'feed_article_html', 'text/html',
    'First active score citation. Second active score citation.',
    repeat('a', 64), '2026-08-24 00:10:00+00'),
  ('12000000-0000-4000-8000-000000000031',
    '12000000-0000-4000-8000-000000000011',
    '12000000-0000-4000-8000-000000000021',
    'https://score-detail-rumored.example.invalid/article',
    'https://score-detail-rumored.example.invalid/article',
    'feed_article_html', 'text/html',
    'Rumored score citation remains private until the project is active.',
    repeat('b', 64), '2026-08-24 00:10:00+00'),
  ('12000000-0000-4000-8000-000000000032',
    '12000000-0000-4000-8000-000000000012',
    '12000000-0000-4000-8000-000000000022',
    'https://score-detail-paused.example.invalid/article',
    'https://score-detail-paused.example.invalid/article',
    'feed_article_html', 'text/html',
    'Paused project score citation remains private.',
    repeat('c', 64), '2026-08-24 00:10:00+00'),
  ('12000000-0000-4000-8000-000000000033',
    '12000000-0000-4000-8000-000000000010',
    '12000000-0000-4000-8000-000000000020',
    'https://score-detail-active.example.invalid/private',
    'https://score-detail-active.example.invalid/private',
    'feed_article_html', 'text/html',
    'Unrelated private Evidence is not consumed by the current score.',
    repeat('d', 64), '2026-08-24 00:10:00+00');

insert into public.signals (
  id, project_id, signal_type, title, summary, verification, lifecycle,
  confidence, published_at, created_at
)
values
  ('12000000-0000-4000-8000-000000000080',
    '12000000-0000-4000-8000-000000000010', 'active_score_signal',
    'Active score signal', 'A published signal with two reviewed Evidence records.',
    'verified', 'published', 90,
    '2026-08-24 00:20:00+00', '2026-08-24 00:20:00+00'),
  ('12000000-0000-4000-8000-000000000081',
    '12000000-0000-4000-8000-000000000010', 'unevidenced_score_signal',
    'Unevidenced score signal', 'A published signal without reviewed Evidence.',
    'unverified', 'published', 50,
    '2026-08-24 00:21:00+00', '2026-08-24 00:21:00+00'),
  ('12000000-0000-4000-8000-000000000082',
    '12000000-0000-4000-8000-000000000011', 'rumored_score_signal',
    'Rumored score signal', 'A rumored-project signal stays outside citations.',
    'corroborated', 'published', 70,
    '2026-08-24 00:22:00+00', '2026-08-24 00:22:00+00'),
  ('12000000-0000-4000-8000-000000000083',
    '12000000-0000-4000-8000-000000000012', 'paused_score_signal',
    'Paused score signal', 'A paused-project signal stays private.',
    'verified', 'published', 80,
    '2026-08-24 00:23:00+00', '2026-08-24 00:23:00+00'),
  ('12000000-0000-4000-8000-000000000084',
    '12000000-0000-4000-8000-000000000010', 'unrelated_private_signal',
    'Unrelated private signal', 'A detected signal is not public or score-linked.',
    'unverified', 'detected', 30, null, '2026-08-24 00:24:00+00');

insert into public.evidence (
  id, source_id, raw_item_id, source_field, quote_text,
  normalized_quote_sha256, verified_at, created_at
)
values
  ('12000000-0000-4000-8000-000000000070',
    '12000000-0000-4000-8000-000000000020',
    '12000000-0000-4000-8000-000000000030', 'article_raw_text',
    'First active score citation.',
    public.evidence_quote_sha256_v1('First active score citation.'),
    '2026-08-24 00:30:00+00', '2026-08-24 00:30:00+00'),
  ('12000000-0000-4000-8000-000000000071',
    '12000000-0000-4000-8000-000000000020',
    '12000000-0000-4000-8000-000000000030', 'article_raw_text',
    'Second active score citation.',
    public.evidence_quote_sha256_v1('Second active score citation.'),
    '2026-08-24 00:31:00+00', '2026-08-24 00:31:00+00'),
  ('12000000-0000-4000-8000-000000000072',
    '12000000-0000-4000-8000-000000000021',
    '12000000-0000-4000-8000-000000000031', 'article_raw_text',
    'Rumored score citation remains private until the project is active.',
    public.evidence_quote_sha256_v1(
      'Rumored score citation remains private until the project is active.'
    ),
    '2026-08-24 00:32:00+00', '2026-08-24 00:32:00+00'),
  ('12000000-0000-4000-8000-000000000073',
    '12000000-0000-4000-8000-000000000022',
    '12000000-0000-4000-8000-000000000032', 'article_raw_text',
    'Paused project score citation remains private.',
    public.evidence_quote_sha256_v1('Paused project score citation remains private.'),
    '2026-08-24 00:33:00+00', '2026-08-24 00:33:00+00'),
  ('12000000-0000-4000-8000-000000000074',
    '12000000-0000-4000-8000-000000000020',
    '12000000-0000-4000-8000-000000000033', 'article_raw_text',
    'Unrelated private Evidence is not consumed by the current score.',
    public.evidence_quote_sha256_v1(
      'Unrelated private Evidence is not consumed by the current score.'
    ),
    '2026-08-24 00:34:00+00', '2026-08-24 00:34:00+00');

insert into public.signal_evidence_links (signal_id, evidence_id, created_at)
values
  ('12000000-0000-4000-8000-000000000080',
    '12000000-0000-4000-8000-000000000070', '2026-08-24 00:30:00+00'),
  ('12000000-0000-4000-8000-000000000080',
    '12000000-0000-4000-8000-000000000071', '2026-08-24 00:31:00+00'),
  ('12000000-0000-4000-8000-000000000082',
    '12000000-0000-4000-8000-000000000072', '2026-08-24 00:32:00+00'),
  ('12000000-0000-4000-8000-000000000083',
    '12000000-0000-4000-8000-000000000073', '2026-08-24 00:33:00+00'),
  ('12000000-0000-4000-8000-000000000084',
    '12000000-0000-4000-8000-000000000074', '2026-08-24 00:34:00+00');

insert into public.project_scores (
  id, project_id, model_version, input_version, opportunity_score, risk_score,
  confidence, recommendation, explanation, calculated_at, created_at
)
values
  ('12000000-0000-4000-8000-000000000090',
    '12000000-0000-4000-8000-000000000010', 'score-detail-v1',
    'active-historical', 40, 70, 60, 'research', 'Historical complete score.',
    '2026-08-24 01:00:00+00', '2026-08-24 01:00:00+00'),
  ('12000000-0000-4000-8000-000000000091',
    '12000000-0000-4000-8000-000000000010', 'score-detail-v1',
    'active-current', 80, 30, 90, 'act_now', 'Current complete score.',
    '2026-08-24 01:01:00+00', '2026-08-24 01:01:00+00'),
  ('12000000-0000-4000-8000-000000000092',
    '12000000-0000-4000-8000-000000000010', 'score-detail-v1',
    'active-unevidenced-newer', 99, 1, 99, 'act_now',
    'Newer score with one unevidenced signal.',
    '2026-08-24 01:02:00+00', '2026-08-24 01:02:00+00'),
  ('12000000-0000-4000-8000-000000000093',
    '12000000-0000-4000-8000-000000000010', 'score-detail-v1',
    'active-zero-link-newest', 100, 0, 100, 'act_now',
    'Newest zero-link score.',
    '2026-08-24 01:03:00+00', '2026-08-24 01:03:00+00'),
  ('12000000-0000-4000-8000-000000000094',
    '12000000-0000-4000-8000-000000000011', 'score-detail-v1',
    'rumored-current', 70, 50, 65, 'watch', 'Rumored complete score.',
    '2026-08-24 01:04:00+00', '2026-08-24 01:04:00+00'),
  ('12000000-0000-4000-8000-000000000095',
    '12000000-0000-4000-8000-000000000012', 'score-detail-v1',
    'paused-current', 90, 10, 80, 'act_now', 'Paused complete score.',
    '2026-08-24 01:05:00+00', '2026-08-24 01:05:00+00');

insert into public.score_signal_links (project_score_id, signal_id, created_at)
values
  ('12000000-0000-4000-8000-000000000090',
    '12000000-0000-4000-8000-000000000080', '2026-08-24 01:00:00+00'),
  ('12000000-0000-4000-8000-000000000091',
    '12000000-0000-4000-8000-000000000080', '2026-08-24 01:01:00+00'),
  ('12000000-0000-4000-8000-000000000092',
    '12000000-0000-4000-8000-000000000080', '2026-08-24 01:02:00+00'),
  ('12000000-0000-4000-8000-000000000092',
    '12000000-0000-4000-8000-000000000081', '2026-08-24 01:02:00+00'),
  ('12000000-0000-4000-8000-000000000094',
    '12000000-0000-4000-8000-000000000082', '2026-08-24 01:04:00+00'),
  ('12000000-0000-4000-8000-000000000095',
    '12000000-0000-4000-8000-000000000083', '2026-08-24 01:05:00+00');

insert into public.score_factors (
  id, project_score_id, axis, factor_code, contribution, input_value, detail,
  created_at
)
values
  ('12000000-0000-4000-8000-000000000100',
    '12000000-0000-4000-8000-000000000091', 'opportunity',
    'signal_strength', 42.50, 80.0000, 'Active opportunity factor.',
    '2026-08-24 01:10:00+00'),
  ('12000000-0000-4000-8000-000000000101',
    '12000000-0000-4000-8000-000000000091', 'risk',
    'security_risk', 30.00, 30.0000, 'Active risk factor.',
    '2026-08-24 01:10:00+00'),
  ('12000000-0000-4000-8000-000000000102',
    '12000000-0000-4000-8000-000000000091', 'confidence',
    'evidence_coverage', 90.00, 90.0000, 'Active confidence factor.',
    '2026-08-24 01:10:00+00'),
  ('12000000-0000-4000-8000-000000000103',
    '12000000-0000-4000-8000-000000000090', 'opportunity',
    'historical_factor', 40.00, 40.0000, 'Historical factor.',
    '2026-08-24 01:10:00+00'),
  ('12000000-0000-4000-8000-000000000104',
    '12000000-0000-4000-8000-000000000092', 'opportunity',
    'unevidenced_factor', 99.00, 99.0000, 'Unevidenced factor.',
    '2026-08-24 01:10:00+00'),
  ('12000000-0000-4000-8000-000000000105',
    '12000000-0000-4000-8000-000000000093', 'opportunity',
    'zero_link_factor', 100.00, 100.0000, 'Zero-link factor.',
    '2026-08-24 01:10:00+00'),
  ('12000000-0000-4000-8000-000000000106',
    '12000000-0000-4000-8000-000000000094', 'opportunity',
    'rumored_factor', 70.00, 70.0000, 'Rumored factor.',
    '2026-08-24 01:10:00+00'),
  ('12000000-0000-4000-8000-000000000107',
    '12000000-0000-4000-8000-000000000095', 'opportunity',
    'paused_factor', 90.00, 90.0000, 'Paused factor.',
    '2026-08-24 01:10:00+00');

insert into public.user_tasks (
  id, user_id, project_id, title, status, priority, version,
  created_at, updated_at
)
values (
  '12000000-0000-4000-8000-000000000110',
  '12000000-0000-4000-8000-000000000090',
  '12000000-0000-4000-8000-000000000010',
  'Unrelated private score-detail task', 'backlog', 'medium', 1,
  '2026-08-24 01:20:00+00', '2026-08-24 01:20:00+00'
);

select results_eq(
  $$
    select score_id, public.current_project_score_is_public(score_id)
    from (values
      (null::uuid),
      ('12000000-0000-4000-8000-000000000090'::uuid),
      ('12000000-0000-4000-8000-000000000091'::uuid),
      ('12000000-0000-4000-8000-000000000092'::uuid),
      ('12000000-0000-4000-8000-000000000093'::uuid),
      ('12000000-0000-4000-8000-000000000094'::uuid),
      ('12000000-0000-4000-8000-000000000095'::uuid),
      ('12000000-0000-4000-8000-000000000999'::uuid)
    ) as score(score_id)
  $$,
  $$
    values
      (null::uuid, false),
      ('12000000-0000-4000-8000-000000000090'::uuid, false),
      ('12000000-0000-4000-8000-000000000091'::uuid, true),
      ('12000000-0000-4000-8000-000000000092'::uuid, false),
      ('12000000-0000-4000-8000-000000000093'::uuid, false),
      ('12000000-0000-4000-8000-000000000094'::uuid, true),
      ('12000000-0000-4000-8000-000000000095'::uuid, false),
      ('12000000-0000-4000-8000-000000000999'::uuid, false)
  $$,
  'current score helper admits only the latest complete active or rumored score'
);

select results_eq(
  $$
    select case_name, public.current_score_citation_path_is_public(
      score_id, signal_id, evidence_id
    )
    from (values
      ('all-null'::text, null::uuid, null::uuid, null::uuid),
      ('score-only', '12000000-0000-4000-8000-000000000091'::uuid,
        null::uuid, null::uuid),
      ('signal-only', null::uuid,
        '12000000-0000-4000-8000-000000000080'::uuid, null::uuid),
      ('evidence-only', null::uuid, null::uuid,
        '12000000-0000-4000-8000-000000000070'::uuid),
      ('exact-path', '12000000-0000-4000-8000-000000000091'::uuid,
        '12000000-0000-4000-8000-000000000080'::uuid,
        '12000000-0000-4000-8000-000000000070'::uuid),
      ('historical', '12000000-0000-4000-8000-000000000090'::uuid,
        '12000000-0000-4000-8000-000000000080'::uuid,
        '12000000-0000-4000-8000-000000000070'::uuid),
      ('unevidenced', '12000000-0000-4000-8000-000000000092'::uuid,
        '12000000-0000-4000-8000-000000000081'::uuid, null::uuid),
      ('zero-link', '12000000-0000-4000-8000-000000000093'::uuid,
        null::uuid, null::uuid),
      ('rumored', '12000000-0000-4000-8000-000000000094'::uuid,
        '12000000-0000-4000-8000-000000000082'::uuid,
        '12000000-0000-4000-8000-000000000072'::uuid),
      ('paused', '12000000-0000-4000-8000-000000000095'::uuid,
        '12000000-0000-4000-8000-000000000083'::uuid,
        '12000000-0000-4000-8000-000000000073'::uuid),
      ('mismatched-evidence', '12000000-0000-4000-8000-000000000091'::uuid,
        '12000000-0000-4000-8000-000000000080'::uuid,
        '12000000-0000-4000-8000-000000000074'::uuid),
      ('unrelated-private', null::uuid,
        '12000000-0000-4000-8000-000000000084'::uuid,
        '12000000-0000-4000-8000-000000000074'::uuid)
    ) as paths(case_name, score_id, signal_id, evidence_id)
    order by case_name
  $$,
  $$
    values
      ('all-null'::text, false),
      ('evidence-only', true),
      ('exact-path', true),
      ('historical', false),
      ('mismatched-evidence', false),
      ('paused', false),
      ('rumored', false),
      ('score-only', true),
      ('signal-only', true),
      ('unevidenced', false),
      ('unrelated-private', false),
      ('zero-link', false)
  $$,
  'citation helper accepts nullable filters but requires one complete active path'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$
    select project_id, project_score_id
    from public.project_current_state
    where project_id between
      '12000000-0000-4000-8000-000000000010'::uuid
      and '12000000-0000-4000-8000-000000000012'::uuid
    order by project_id
  $$,
  $$
    values
      ('12000000-0000-4000-8000-000000000010'::uuid,
        '12000000-0000-4000-8000-000000000091'::uuid),
      ('12000000-0000-4000-8000-000000000011'::uuid,
        '12000000-0000-4000-8000-000000000094'::uuid)
  $$,
  'anonymous project state binds active and rumored metrics to exact current scores'
);

select results_eq(
  $$
    select project_score_id, axis, factor_code, contribution, input_value
    from public.project_current_score_factors
    where project_id between
      '12000000-0000-4000-8000-000000000010'::uuid
      and '12000000-0000-4000-8000-000000000012'::uuid
    order by project_score_id, axis, factor_code
  $$,
  $$
    values
      ('12000000-0000-4000-8000-000000000091'::uuid,
        'confidence'::text, 'evidence_coverage'::text, 90.00::numeric, 90.0000::numeric),
      ('12000000-0000-4000-8000-000000000091'::uuid,
        'opportunity'::text, 'signal_strength'::text, 42.50::numeric, 80.0000::numeric),
      ('12000000-0000-4000-8000-000000000091'::uuid,
        'risk'::text, 'security_risk'::text, 30.00::numeric, 30.0000::numeric),
      ('12000000-0000-4000-8000-000000000094'::uuid,
        'opportunity'::text, 'rumored_factor'::text, 70.00::numeric, 70.0000::numeric)
  $$,
  'anonymous factors preserve independent axes and hide historical incomplete zero-link and paused scores'
);

select results_eq(
  $$
    select
      project_score_id, signal_id, evidence_id, citation_text,
      source_name, source_type, source_is_official,
      source_relation_verified_at
    from public.project_current_score_evidence_citations
    where project_id between
      '12000000-0000-4000-8000-000000000010'::uuid
      and '12000000-0000-4000-8000-000000000012'::uuid
    order by evidence_id
  $$,
  $$
    values
      ('12000000-0000-4000-8000-000000000091'::uuid,
        '12000000-0000-4000-8000-000000000080'::uuid,
        '12000000-0000-4000-8000-000000000070'::uuid,
        'First active score citation.'::text, 'Active official source'::text,
        'official_web'::public.source_type, true,
        '2026-08-23 12:00:00+00'::timestamptz),
      ('12000000-0000-4000-8000-000000000091'::uuid,
        '12000000-0000-4000-8000-000000000080'::uuid,
        '12000000-0000-4000-8000-000000000071'::uuid,
        'Second active score citation.'::text, 'Active official source'::text,
        'official_web'::public.source_type, true,
        '2026-08-23 12:00:00+00'::timestamptz)
  $$,
  'anonymous citations preserve two distinct Evidence records and hide rumored paused and unrelated rows'
);

select results_eq(
  $$
    select
      (select count(*) from public.score_factors
       where project_score_id::text like '12000000-%')::bigint,
      (select count(*) from public.score_signal_links
       where project_score_id::text like '12000000-%')::bigint,
      (select count(*) from public.signal_evidence_links
       where signal_id::text like '12000000-%')::bigint,
      (select count(*) from public.evidence
       where id::text like '12000000-%')::bigint
  $$,
  $$ values (4::bigint, 1::bigint, 2::bigint, 2::bigint) $$,
  'anonymous direct base-table reads are restricted to the same public paths'
);

select throws_like(
  $$select id from public.score_factors limit 1$$,
  '%permission denied%',
  'anonymous users cannot read score factor row identifiers'
);
select throws_like(
  $$select normalized_quote_sha256 from public.evidence limit 1$$,
  '%permission denied%',
  'anonymous users cannot read Evidence hashes'
);
select throws_like(
  $$select canonical_url from public.sources limit 1$$,
  '%permission denied%',
  'anonymous users cannot read source URLs'
);
select throws_like(
  $$select raw_text from public.raw_items limit 1$$,
  '%permission denied%',
  'anonymous users cannot read Raw Item bodies'
);
select throws_like(
  $$select payload from public.extraction_candidates limit 1$$,
  '%permission denied%',
  'anonymous users cannot read candidate payloads'
);
select throws_like(
  $$select note from public.candidate_review_decisions limit 1$$,
  '%permission denied%',
  'anonymous users cannot read review notes'
);
select throws_like(
  $$select error_detail from public.ai_runs limit 1$$,
  '%permission denied%',
  'anonymous users cannot read provider error detail'
);
select throws_like(
  $$select payload from public.outbox_events limit 1$$,
  '%permission denied%',
  'anonymous users cannot read outbox payloads'
);

select throws_like(
  pg_catalog.format('delete from public.%I', expected.table_name),
  case
    when expected.table_name like 'project_current_score_%'
      then '%cannot delete from view%'
    else '%permission denied%'
  end,
  pg_catalog.format('anonymous users cannot delete from %s', expected.table_name)
)
from (values
  ('score_factors'),
  ('score_signal_links'),
  ('signal_evidence_links'),
  ('evidence'),
  ('project_current_score_factors'),
  ('project_current_score_evidence_citations')
) as expected(table_name);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000090","role":"authenticated"}',
  true
);
select results_eq(
  $$
    select
      (select count(*) from public.project_current_score_factors
       where project_id::text like '12000000-%')::bigint,
      (select count(*) from public.project_current_score_evidence_citations
       where project_id::text like '12000000-%')::bigint,
      (select count(*) from public.user_tasks
       where id = '12000000-0000-4000-8000-000000000110')::bigint
  $$,
  $$ values (4::bigint, 2::bigint, 1::bigint) $$,
  'authenticated owner sees public score detail plus only their private task'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000091","role":"authenticated"}',
  true
);
select results_eq(
  $$
    select
      (select count(*) from public.project_current_score_factors
       where project_id::text like '12000000-%')::bigint,
      (select count(*) from public.project_current_score_evidence_citations
       where project_id::text like '12000000-%')::bigint,
      (select count(*) from public.user_tasks
       where id = '12000000-0000-4000-8000-000000000110')::bigint
  $$,
  $$ values (4::bigint, 2::bigint, 0::bigint) $$,
  'authenticated non-owner sees the same public detail but no unrelated private task'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000092","role":"authenticated"}',
  true
);
select results_eq(
  $$
    select
      (select count(*) from public.project_current_score_factors
       where project_id::text like '12000000-%')::bigint,
      (select count(*) from public.project_current_score_evidence_citations
       where project_id::text like '12000000-%')::bigint,
      (select count(*) from public.user_tasks
       where id = '12000000-0000-4000-8000-000000000110')::bigint
  $$,
  $$ values (4::bigint, 2::bigint, 0::bigint) $$,
  'browser admin receives no score-detail or private-row bypass'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000093","role":"authenticated"}',
  true
);
select results_eq(
  $$
    select
      (select count(*) from public.project_current_score_factors
       where project_id::text like '12000000-%')::bigint,
      (select count(*) from public.project_current_score_evidence_citations
       where project_id::text like '12000000-%')::bigint
  $$,
  $$ values (4::bigint, 2::bigint) $$,
  'active reviewer receives only the normal public score-detail boundary'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000094","role":"authenticated"}',
  true
);
select results_eq(
  $$
    select
      (select count(*) from public.project_current_score_factors
       where project_id::text like '12000000-%')::bigint,
      (select count(*) from public.project_current_score_evidence_citations
       where project_id::text like '12000000-%')::bigint
  $$,
  $$ values (4::bigint, 2::bigint) $$,
  'revoked reviewer retains no privilege beyond the normal public boundary'
);

select throws_like(
  pg_catalog.format('delete from public.%I', expected.table_name),
  case
    when expected.table_name like 'project_current_score_%'
      then '%cannot delete from view%'
    else '%permission denied%'
  end,
  pg_catalog.format('authenticated users cannot delete from %s', expected.table_name)
)
from (values
  ('score_factors'),
  ('score_signal_links'),
  ('signal_evidence_links'),
  ('evidence'),
  ('project_current_score_factors'),
  ('project_current_score_evidence_citations')
) as expected(table_name);

reset role;
select set_config('request.jwt.claims', '{}', true);

select results_eq(
  $$
    select
      (select count(*) from public.score_factors
       where project_score_id::text like '12000000-%')::bigint,
      (select count(*) from public.score_signal_links
       where project_score_id::text like '12000000-%')::bigint,
      (select count(*) from public.signal_evidence_links
       where signal_id::text like '12000000-%')::bigint,
      (select count(*) from public.evidence
       where id::text like '12000000-%')::bigint,
      (select count(*) from public.user_tasks
       where id = '12000000-0000-4000-8000-000000000110')::bigint
  $$,
  $$ values (8::bigint, 6::bigint, 5::bigint, 5::bigint, 1::bigint) $$,
  'public projections preserve all factor Evidence link and private fixture history'
);

select ok(
  not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name in (
        'project_current_score_factors',
        'project_current_score_evidence_citations'
      )
      and (
        column_info.column_name like '%url%'
        or column_info.column_name in (
          'raw_text', 'payload', 'note', 'normalized_quote_sha256',
          'error_detail', 'reviewer_user_id', 'verified_by'
        )
      )
  ),
  'score-detail views contain no URL raw governance hash provider-error or reviewer columns'
);

select * from finish();

rollback;
