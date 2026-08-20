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

select plan(135);

select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'sources', 'sources table exists');
select has_table('public', 'project_sources', 'project_sources table exists');

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.projects'::regclass),
  'projects has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.sources'::regclass),
  'sources has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.project_sources'::regclass),
  'project_sources has row-level security enabled'
);

select columns_are(
  'public',
  'projects',
  array[
    'id',
    'slug',
    'name',
    'summary',
    'lifecycle',
    'primary_chain',
    'official_website_url',
    'version',
    'created_at',
    'updated_at'
  ],
  'projects exposes the catalog contract columns in order'
);
select columns_are(
  'public',
  'sources',
  array[
    'id',
    'source_type',
    'name',
    'canonical_url',
    'status',
    'reputation_score',
    'created_at',
    'updated_at'
  ],
  'sources exposes the catalog contract columns in order'
);
select columns_are(
  'public',
  'project_sources',
  array[
    'project_id',
    'source_id',
    'authority_domains',
    'is_official',
    'verified_at',
    'verified_by',
    'created_at'
  ],
  'project_sources exposes the relation contract columns in order'
);

select ok(
  (
    select index_definition.indexdef ~ '\(lifecycle, updated_at DESC\)$'
    from pg_catalog.pg_indexes as index_definition
    where index_definition.schemaname = 'public'
      and index_definition.indexname = 'projects_lifecycle_updated_at_idx'
  ),
  'projects has its lifecycle and descending update-time index'
);
select ok(
  (
    select index_definition.indexdef ~ '\(status, updated_at DESC\)$'
    from pg_catalog.pg_indexes as index_definition
    where index_definition.schemaname = 'public'
      and index_definition.indexname = 'sources_status_updated_at_idx'
  ),
  'sources has its status and descending update-time index'
);
select has_index(
  'public',
  'project_sources',
  'project_sources_source_id_idx',
  'source_id',
  'project_sources has its source lookup index'
);
select ok(
  (
    select index_definition.indexdef ~ 'USING gin \(authority_domains\)'
    from pg_catalog.pg_indexes as index_definition
    where index_definition.schemaname = 'public'
      and index_definition.indexname = 'project_sources_authority_domains_idx'
  ),
  'project_sources has a GIN authority-domain index'
);
select is(
  (
    select foreign_key.confdeltype::text
    from pg_catalog.pg_constraint as foreign_key
    where foreign_key.conname = 'project_sources_verified_by_fkey'
      and foreign_key.conrelid = 'public.project_sources'::regclass
  ),
  'r',
  'verifier deletion is restricted so verification provenance cannot be erased'
);

select ok(
  coalesce(
    (
      select pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
        and procedure.provolatile = 'i'
        and procedure.proconfig @> array['search_path=pg_catalog, public']::text[]
        and not procedure.prosecdef
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure('public.valid_authority_domains(text[])')
    ),
    false
  ),
  'authority-domain validation has the controlled owner and immutable invoker-safe configuration'
);
select ok(
  coalesce(
    (
      select pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
        and procedure.provolatile = 'i'
        and procedure.proconfig @> array['search_path=pg_catalog, public']::text[]
        and not procedure.prosecdef
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure('public.valid_https_url(text)')
    ),
    false
  ),
  'HTTPS validation has the controlled owner and immutable invoker-safe configuration'
);
select ok(
  coalesce(
    (
      select pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
        and procedure.provolatile = 'v'
        and procedure.proconfig @> array['search_path=pg_catalog, public']::text[]
        and not procedure.prosecdef
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure('public.apply_project_material_update()')
    ),
    false
  ),
  'project versioning has the controlled owner and volatile invoker-safe configuration'
);
select ok(
  coalesce(
    (
      select pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
        and procedure.provolatile = 'v'
        and procedure.proconfig @> array['search_path=pg_catalog, public']::text[]
        and not procedure.prosecdef
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure('public.apply_source_material_update()')
    ),
    false
  ),
  'source timestamping has the controlled owner and volatile invoker-safe configuration'
);
select ok(
  not coalesce(
    has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.valid_authority_domains(text[])'),
      'EXECUTE'
    ),
    true
  )
    and not coalesce(
      has_function_privilege(
        'anon',
        pg_catalog.to_regprocedure('public.valid_https_url(text)'),
        'EXECUTE'
      ),
      true
    )
    and not coalesce(
      has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure('public.valid_authority_domains(text[])'),
        'EXECUTE'
      ),
      true
    )
    and not coalesce(
      has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure('public.valid_https_url(text)'),
        'EXECUTE'
      ),
      true
    )
    and not coalesce(
      has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure('public.valid_authority_domains(text[])'),
        'EXECUTE'
      ),
      true
    )
    and not coalesce(
      has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure('public.valid_https_url(text)'),
        'EXECUTE'
      ),
      true
    )
    and not has_function_privilege('anon', 'public.apply_project_material_update()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.apply_source_material_update()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.apply_project_material_update()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.apply_source_material_update()', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.apply_project_material_update()', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.apply_source_material_update()', 'EXECUTE'),
  'exposed roles cannot invoke catalog validators or trigger functions directly'
);
select ok(
  has_column_privilege('anon', 'public.projects', 'slug', 'SELECT')
    and has_column_privilege('anon', 'public.projects', 'official_website_url', 'SELECT')
    and has_column_privilege('anon', 'public.sources', 'name', 'SELECT')
    and not has_column_privilege('anon', 'public.sources', 'canonical_url', 'SELECT')
    and has_column_privilege('anon', 'public.project_sources', 'verified_at', 'SELECT')
    and not has_column_privilege('anon', 'public.project_sources', 'verified_by', 'SELECT')
    and has_column_privilege('authenticated', 'public.projects', 'slug', 'SELECT')
    and has_column_privilege(
      'authenticated',
      'public.projects',
      'official_website_url',
      'SELECT'
    )
    and has_column_privilege('authenticated', 'public.sources', 'name', 'SELECT')
    and not has_column_privilege(
      'authenticated',
      'public.sources',
      'canonical_url',
      'SELECT'
    )
    and has_column_privilege('authenticated', 'public.project_sources', 'verified_at', 'SELECT')
    and not has_column_privilege(
      'authenticated',
      'public.project_sources',
      'verified_by',
      'SELECT'
    )
    and has_column_privilege(
      'service_role',
      'public.projects',
      'official_website_url',
      'SELECT'
    )
    and has_column_privilege('service_role', 'public.sources', 'canonical_url', 'SELECT')
    and has_column_privilege('service_role', 'public.project_sources', 'verified_by', 'SELECT'),
  'column privileges expose project-detail links while reserving source links and verifier identity for backend reads'
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
    'catalog-owner@example.invalid',
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
    'catalog-other@example.invalid',
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
    'catalog-admin@example.invalid',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-08-09 00:00:00+00',
    '2026-08-09 00:00:00+00'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'catalog-verifier@example.invalid',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-08-09 00:00:00+00',
    '2026-08-09 00:00:00+00'
  );

insert into public.user_roles (user_id, role, granted_by, granted_at)
values (
  '33333333-3333-4333-8333-333333333333',
  'admin',
  '33333333-3333-4333-8333-333333333333',
  '2026-08-09 00:00:00+00'
);

insert into public.projects (
  id,
  slug,
  name,
  summary,
  lifecycle,
  primary_chain,
  official_website_url,
  created_at,
  updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'active-project',
    'Active Project',
    'Public active catalog fixture',
    'active',
    'Ethereum',
    'https://active.example.invalid',
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  );

insert into public.projects (id, slug, name, created_at, updated_at)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  'rumored-project',
  'Rumored Project',
  '2026-08-09 01:00:00+00',
  '2026-08-09 01:00:00+00'
);

insert into public.sources (
  id,
  source_type,
  name,
  canonical_url,
  status,
  reputation_score,
  created_at,
  updated_at
)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'independent_research',
    'Suspended Research Source',
    'https://research.example.invalid/report',
    'suspended',
    40,
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  );

insert into public.sources (id, source_type, name, canonical_url, created_at, updated_at)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  'official_web',
  'Active Official Website',
  'https://docs.active.example.invalid/start',
  '2026-08-09 01:00:00+00',
  '2026-08-09 01:00:00+00'
);

select is(
  (
    select pg_catalog.format('%s|%s', lifecycle::text, version)
    from public.projects
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
  ),
  'rumored|1',
  'project defaults begin at the rumored lifecycle and version one'
);
select is(
  (
    select pg_catalog.format('%s|%s', status::text, reputation_score)
    from public.sources
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  ),
  'active|50.00',
  'source defaults use active status and reputation fifty'
);

select lives_ok(
  $$
    insert into public.sources (source_type, name, canonical_url, status, reputation_score)
    values ('news', 'Zero Reputation', 'https://zero.example.invalid', 'retired', 0)
  $$,
  'reputation zero is accepted'
);
select lives_ok(
  $$
    insert into public.sources (source_type, name, canonical_url, status, reputation_score)
    values ('news', 'Maximum Reputation', 'https://maximum.example.invalid', 'retired', 100)
  $$,
  'reputation one hundred is accepted'
);

select throws_like(
  $$insert into public.projects (slug, name) values ('Upper-Case', 'Uppercase Slug')$$,
  '%projects_slug_valid%',
  'project slugs reject uppercase characters'
);
select throws_like(
  $$insert into public.projects (slug, name) values ('-leading', 'Leading Hyphen')$$,
  '%projects_slug_valid%',
  'project slugs reject a leading hyphen'
);
select throws_like(
  $$insert into public.projects (slug, name) values ('trailing-', 'Trailing Hyphen')$$,
  '%projects_slug_valid%',
  'project slugs reject a trailing hyphen'
);
select throws_like(
  $$insert into public.projects (slug, name) values ('two--hyphens', 'Consecutive Hyphens')$$,
  '%projects_slug_valid%',
  'project slugs reject consecutive hyphens'
);
select throws_like(
  $$insert into public.projects (slug, name) values (repeat('a', 121), 'Overlong Slug')$$,
  '%projects_slug_valid%',
  'project slugs reject values longer than 120 characters'
);
select throws_like(
  $$insert into public.projects (slug, name) values ('blank-name', '')$$,
  '%projects_name_valid%',
  'project names reject an empty value'
);
select throws_like(
  $$insert into public.projects (slug, name) values ('padded-name', ' Padded')$$,
  '%projects_name_valid%',
  'project names must already be trimmed'
);
select throws_like(
  $$insert into public.projects (slug, name) values ('long-name', repeat('n', 121))$$,
  '%projects_name_valid%',
  'project names reject values longer than 120 characters'
);
select throws_like(
  $$insert into public.projects (slug, name, summary) values ('long-summary', 'Long Summary', repeat('s', 1001))$$,
  '%projects_summary_valid%',
  'project summaries reject values longer than 1000 characters'
);
select throws_like(
  $$insert into public.projects (slug, name, primary_chain) values ('blank-chain', 'Blank Chain', '')$$,
  '%projects_primary_chain_valid%',
  'primary chains reject an empty value'
);
select throws_like(
  $$insert into public.projects (slug, name, primary_chain) values ('padded-chain', 'Padded Chain', ' Ethereum ')$$,
  '%projects_primary_chain_valid%',
  'primary chains must already be trimmed'
);
select throws_like(
  $$insert into public.projects (slug, name, official_website_url) values ('http-project', 'HTTP Project', 'http://example.invalid')$$,
  '%projects_official_website_url_https%',
  'official project URLs reject HTTP'
);
select throws_like(
  $$insert into public.projects (slug, name, official_website_url) values ('fake-https-project', 'Fake HTTPS Project', 'https://')$$,
  '%projects_official_website_url_https%',
  'official project URLs reject an empty HTTPS prefix'
);
select lives_ok(
  $$
    insert into public.projects (slug, name, official_website_url)
    values ('minimum-port-project', 'Minimum Port Project', 'https://project.example.invalid:1/path')
  $$,
  'official project URLs accept the minimum explicit port'
);
insert into public.projects (
  id, slug, name, lifecycle, official_website_url, created_at, updated_at
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  'paused-link-project',
  'Paused Link Project',
  'paused',
  'https://paused.example.invalid',
  '2026-08-09 01:00:00+00',
  '2026-08-09 01:00:00+00'
);
select throws_like(
  $$
    insert into public.projects (slug, name, official_website_url)
    values ('empty-label-project', 'Empty Label Project', 'https://project..example.invalid')
  $$,
  '%projects_official_website_url_https%',
  'official project URLs reject empty DNS labels'
);

select throws_like(
  $$insert into public.sources (source_type, name, canonical_url) values ('news', '', 'https://blank-source.example.invalid')$$,
  '%sources_name_valid%',
  'source names reject an empty value'
);
select throws_like(
  $$insert into public.sources (source_type, name, canonical_url) values ('news', ' Padded', 'https://padded-source.example.invalid')$$,
  '%sources_name_valid%',
  'source names must already be trimmed'
);
select throws_like(
  $$insert into public.sources (source_type, name, canonical_url) values ('news', repeat('n', 161), 'https://long-source.example.invalid')$$,
  '%sources_name_valid%',
  'source names reject values longer than 160 characters'
);
select throws_like(
  $$insert into public.sources (source_type, name, canonical_url) values ('news', 'HTTP Source', 'http://source.example.invalid')$$,
  '%sources_canonical_url_https%',
  'canonical source URLs reject HTTP'
);
select throws_like(
  $$insert into public.sources (source_type, name, canonical_url) values ('news', 'Fake HTTPS Source', 'https://')$$,
  '%sources_canonical_url_https%',
  'canonical source URLs reject an empty HTTPS prefix'
);
select lives_ok(
  $$
    insert into public.sources (source_type, name, canonical_url, status)
    values (
      'news',
      'Maximum Port Source',
      'https://maximum-port.example.invalid:65535/report',
      'retired'
    )
  $$,
  'canonical source URLs accept the maximum explicit port'
);
select lives_ok(
  $$
    insert into public.sources (source_type, name, canonical_url, status)
    values (
      'news',
      'Maximum Label Source',
      pg_catalog.format('https://%s.example.invalid', pg_catalog.repeat('a', 63)),
      'retired'
    )
  $$,
  'canonical source URLs accept a 63-character DNS label'
);
select lives_ok(
  $$
    insert into public.sources (source_type, name, canonical_url, status)
    values (
      'news',
      'Maximum Host Source',
      pg_catalog.format(
        'https://%s.%s.%s.%s/path',
        pg_catalog.repeat('a', 63),
        pg_catalog.repeat('b', 63),
        pg_catalog.repeat('c', 63),
        pg_catalog.repeat('d', 61)
      ),
      'retired'
    )
  $$,
  'canonical source URLs accept a 253-character DNS host'
);
select throws_like(
  $$
    insert into public.sources (source_type, name, canonical_url)
    values ('news', 'Leading Hyphen Host', 'https://-bad.example.invalid')
  $$,
  '%sources_canonical_url_https%',
  'canonical source URLs reject labels with a leading hyphen'
);
select throws_like(
  $$
    insert into public.sources (source_type, name, canonical_url)
    values ('news', 'Trailing Hyphen Host', 'https://bad-.example.invalid')
  $$,
  '%sources_canonical_url_https%',
  'canonical source URLs reject labels with a trailing hyphen'
);
select throws_like(
  $$
    insert into public.sources (source_type, name, canonical_url)
    values (
      'news',
      'Overlong Label Source',
      pg_catalog.format('https://%s.example.invalid', pg_catalog.repeat('a', 64))
    )
  $$,
  '%sources_canonical_url_https%',
  'canonical source URLs reject DNS labels longer than 63 characters'
);
select throws_like(
  $$
    insert into public.sources (source_type, name, canonical_url)
    values (
      'news',
      'Overlong Host Source',
      pg_catalog.format(
        'https://%s.%s.%s.%s',
        pg_catalog.repeat('a', 63),
        pg_catalog.repeat('b', 63),
        pg_catalog.repeat('c', 63),
        pg_catalog.repeat('d', 62)
      )
    )
  $$,
  '%sources_canonical_url_https%',
  'canonical source URLs reject DNS hosts longer than 253 characters'
);
select throws_like(
  $$
    insert into public.sources (source_type, name, canonical_url)
    values ('news', 'Userinfo Source', 'https://user@example.invalid')
  $$,
  '%sources_canonical_url_https%',
  'canonical source URLs reject userinfo authorities'
);
select throws_like(
  $$
    insert into public.sources (source_type, name, canonical_url)
    values ('news', 'Zero Port Source', 'https://zero-port.example.invalid:0')
  $$,
  '%sources_canonical_url_https%',
  'canonical source URLs reject explicit port zero'
);
select throws_like(
  $$
    insert into public.sources (source_type, name, canonical_url)
    values ('news', 'High Port Source', 'https://high-port.example.invalid:65536')
  $$,
  '%sources_canonical_url_https%',
  'canonical source URLs reject explicit ports above 65535'
);
select throws_like(
  $$
    insert into public.sources (source_type, name, canonical_url)
    values ('news', 'IPv4 Source', 'https://127.0.0.1/path')
  $$,
  '%sources_canonical_url_https%',
  'canonical source URLs reject IP literals in this DNS-only catalog phase'
);
select throws_like(
  $$
    insert into public.sources (source_type, name, canonical_url)
    values ('news', 'Uppercase Host Source', 'https://Uppercase.example.invalid')
  $$,
  '%sources_canonical_url_https%',
  'canonical source URLs require lowercase canonical DNS hosts'
);
select throws_like(
  $$insert into public.sources (source_type, name, canonical_url, reputation_score) values ('news', 'Below Minimum', 'https://below.example.invalid', -0.01)$$,
  '%sources_reputation_score_bounds%',
  'source reputation rejects values below zero'
);
select throws_like(
  $$insert into public.sources (source_type, name, canonical_url, reputation_score) values ('news', 'Above Maximum', 'https://above.example.invalid', 100.01)$$,
  '%sources_reputation_score_bounds%',
  'source reputation rejects values above one hundred'
);

select throws_like(
  $$
    insert into public.project_sources (project_id, source_id, is_official)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      true
    )
  $$,
  '%project_sources_official_verification_complete%',
  'official relations require authority domains, verification time, and verifier'
);
select throws_like(
  $$
    insert into public.project_sources (
      project_id,
      source_id,
      authority_domains,
      is_official,
      verified_by
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      array['active.example.invalid'],
      true,
      '44444444-4444-4444-8444-444444444444'
    )
  $$,
  '%project_sources_official_verification_complete%',
  'official relations require a verification timestamp'
);
select throws_like(
  $$
    insert into public.project_sources (
      project_id,
      source_id,
      authority_domains,
      is_official,
      verified_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      array['active.example.invalid'],
      true,
      '2026-08-09 02:00:00+00'
    )
  $$,
  '%project_sources_official_verification_complete%',
  'official relations require a verifier'
);
select throws_like(
  $$
    insert into public.project_sources (
      project_id,
      source_id,
      authority_domains,
      is_official,
      verified_at,
      verified_by
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      '{}',
      true,
      '2026-08-09 02:00:00+00',
      '44444444-4444-4444-8444-444444444444'
    )
  $$,
  '%project_sources_official_verification_complete%',
  'official relations require at least one authority domain'
);
select throws_like(
  $$
    insert into public.project_sources (
      project_id, source_id, authority_domains, is_official, verified_at, verified_by
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      array[' active.example.invalid'],
      true,
      '2026-08-09 02:00:00+00',
      '44444444-4444-4444-8444-444444444444'
    )
  $$,
  '%project_sources_authority_domains_valid%',
  'authority domains reject surrounding whitespace'
);
select throws_like(
  $$
    insert into public.project_sources (
      project_id, source_id, authority_domains, is_official, verified_at, verified_by
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      array['active.example.invalid', 'active.example.invalid'],
      true,
      '2026-08-09 02:00:00+00',
      '44444444-4444-4444-8444-444444444444'
    )
  $$,
  '%project_sources_authority_domains_valid%',
  'authority domains reject duplicates'
);
select throws_like(
  $$
    insert into public.project_sources (
      project_id, source_id, authority_domains, is_official, verified_at, verified_by
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      array['Active.Example.Invalid'],
      true,
      '2026-08-09 02:00:00+00',
      '44444444-4444-4444-8444-444444444444'
    )
  $$,
  '%project_sources_authority_domains_valid%',
  'authority domains must use canonical lowercase form'
);
select throws_like(
  $$
    insert into public.project_sources (
      project_id, source_id, authority_domains, is_official, verified_at, verified_by
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      array['https://active.example.invalid'],
      true,
      '2026-08-09 02:00:00+00',
      '44444444-4444-4444-8444-444444444444'
    )
  $$,
  '%project_sources_authority_domains_valid%',
  'authority domains reject URL schemes'
);
select throws_like(
  $$
    insert into public.project_sources (
      project_id, source_id, authority_domains, is_official, verified_at, verified_by
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      array['active..example.invalid'],
      true,
      '2026-08-09 02:00:00+00',
      '44444444-4444-4444-8444-444444444444'
    )
  $$,
  '%project_sources_authority_domains_valid%',
  'authority domains reject empty DNS labels'
);
select throws_like(
  $$
    insert into public.project_sources (project_id, source_id, authority_domains)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      array['not a domain']
    )
  $$,
  '%project_sources_authority_domains_valid%',
  'non-official relations cannot store malformed authority domains'
);
select lives_ok(
  $$
    insert into public.project_sources (
      project_id, source_id, authority_domains, is_official, verified_at, verified_by
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      array['active.example.invalid', 'docs.active.example.invalid'],
      true,
      '2026-08-09 02:00:00+00',
      '44444444-4444-4444-8444-444444444444'
    )
  $$,
  'a complete official relation is accepted'
);

insert into public.project_sources (project_id, source_id)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  );

select throws_like(
  $$delete from public.profiles where id = '44444444-4444-4444-8444-444444444444'$$,
  '%project_sources_verified_by_fkey%',
  'deleting a verifier cannot silently null catalog verification provenance'
);
select is(
  (
    select verified_by
    from public.project_sources
    where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and source_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  ),
  '44444444-4444-4444-8444-444444444444'::uuid,
  'failed verifier deletion leaves verification provenance intact'
);

alter table public.projects disable trigger projects_apply_material_update;
update public.projects
set updated_at = '2100-01-01 00:00:00+00'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
alter table public.projects enable trigger projects_apply_material_update;

select lives_ok(
  $$
    update public.projects
    set summary = 'Materially updated summary'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  $$,
  'a material project update is accepted'
);
select is(
  (
    select version
    from public.projects
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  2::bigint,
  'a material project update increments version exactly once'
);
select is(
  (
    select updated_at
    from public.projects
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  '2100-01-01 00:00:00.000001+00'::timestamptz,
  'a material project update advances a future timestamp by one microsecond'
);

create temporary table project_update_snapshot as
select version, updated_at
from public.projects
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select lives_ok(
  $$
    update public.projects
    set summary = summary
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  $$,
  'a no-op project update is accepted'
);
select is(
  (
    select version
    from public.projects
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  (select version from project_update_snapshot),
  'a no-op project update does not increment version'
);
select is(
  (
    select updated_at
    from public.projects
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  (select updated_at from project_update_snapshot),
  'a no-op project update does not advance updated_at'
);
select throws_like(
  $$
    update public.projects
    set version = 999
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  $$,
  '%project_system_fields_immutable%',
  'the owner-side trigger rejects direct project version forgery'
);
select throws_like(
  $$
    update public.projects
    set id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  $$,
  '%project_system_fields_immutable%',
  'the owner-side trigger rejects direct project identity rewrites'
);
select throws_like(
  $$
    update public.projects
    set created_at = '2099-01-01 00:00:00+00'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  $$,
  '%project_system_fields_immutable%',
  'the owner-side trigger rejects direct project creation-time rewrites'
);
select throws_like(
  $$
    update public.projects
    set updated_at = '2099-01-01 00:00:00+00'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  $$,
  '%project_system_fields_immutable%',
  'the owner-side trigger rejects direct project update-time rewrites'
);

alter table public.projects disable trigger projects_apply_material_update;
update public.projects
set updated_at = 'infinity'::timestamptz
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
alter table public.projects enable trigger projects_apply_material_update;

select throws_like(
  $$
    update public.projects
    set summary = 'Timestamp exhaustion must fail closed'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  $$,
  '%catalog_updated_at_exhausted%',
  'project updates fail closed when no strictly later timestamp exists'
);

alter table public.projects disable trigger projects_apply_material_update;
update public.projects
set updated_at = '2100-01-01 00:00:00.000001+00'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
alter table public.projects enable trigger projects_apply_material_update;

alter table public.sources disable trigger sources_apply_material_update;
update public.sources
set updated_at = '2100-01-01 00:00:00+00'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
alter table public.sources enable trigger sources_apply_material_update;

select lives_ok(
  $$
    update public.sources
    set reputation_score = 75
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  $$,
  'a material source update is accepted'
);
select is(
  (
    select updated_at
    from public.sources
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  ),
  '2100-01-01 00:00:00.000001+00'::timestamptz,
  'a material source update advances a future timestamp by one microsecond'
);

create temporary table source_update_snapshot as
select updated_at
from public.sources
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

select lives_ok(
  $$
    update public.sources
    set reputation_score = reputation_score
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  $$,
  'a no-op source update is accepted'
);
select is(
  (
    select updated_at
    from public.sources
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  ),
  (select updated_at from source_update_snapshot),
  'a no-op source update does not advance updated_at'
);
select throws_like(
  $$
    update public.sources
    set id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb99'
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  $$,
  '%source_system_fields_immutable%',
  'the owner-side trigger rejects direct source identity rewrites'
);
select throws_like(
  $$
    update public.sources
    set created_at = '2099-01-01 00:00:00+00'
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  $$,
  '%source_system_fields_immutable%',
  'the owner-side trigger rejects direct source creation-time rewrites'
);
select throws_like(
  $$
    update public.sources
    set updated_at = '2099-01-01 00:00:00+00'
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  $$,
  '%source_system_fields_immutable%',
  'the owner-side trigger rejects direct source update-time rewrites'
);

alter table public.sources disable trigger sources_apply_material_update;
update public.sources
set updated_at = 'infinity'::timestamptz
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
alter table public.sources enable trigger sources_apply_material_update;

select throws_like(
  $$
    update public.sources
    set reputation_score = 76
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  $$,
  '%catalog_updated_at_exhausted%',
  'source updates fail closed when no strictly later timestamp exists'
);

alter table public.sources disable trigger sources_apply_material_update;
update public.sources
set updated_at = '2100-01-01 00:00:00.000001+00'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
alter table public.sources enable trigger sources_apply_material_update;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select slug from public.projects order by slug$$,
  $$values ('active-project'::text), ('minimum-port-project'::text), ('rumored-project'::text)$$,
  'anonymous users see active and rumored safe project rows'
);
select results_eq(
  $$select name from public.sources order by name$$,
  $$values ('Active Official Website'::text)$$,
  'anonymous users see only active sources'
);
select results_eq(
  $$select project_id, source_id from public.project_sources order by project_id, source_id$$,
  $$
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid
    )
  $$,
  'anonymous users see relations only when both catalog parents are active'
);
select results_eq(
  $$select slug, official_website_url from public.projects where official_website_url is not null order by slug$$,
  $$values ('active-project'::text, 'https://active.example.invalid'::text), ('minimum-port-project'::text, 'https://project.example.invalid:1/path'::text)$$,
  'anonymous users read intended project links while RLS hides the paused project link'
);
select throws_like(
  $$select canonical_url from public.sources$$,
  'permission denied for table sources',
  'anonymous users cannot read unpromoted canonical source links'
);
select throws_like(
  $$select verified_by from public.project_sources$$,
  'permission denied for table project_sources',
  'anonymous users cannot read verifier identities'
);
select ok(
  not has_any_column_privilege('anon', 'public.projects', 'INSERT,UPDATE')
    and not has_any_column_privilege('anon', 'public.sources', 'INSERT,UPDATE')
    and not has_any_column_privilege('anon', 'public.project_sources', 'INSERT,UPDATE')
    and not has_table_privilege('anon', 'public.projects', 'DELETE,TRUNCATE')
    and not has_table_privilege('anon', 'public.sources', 'DELETE,TRUNCATE')
    and not has_table_privilege('anon', 'public.project_sources', 'DELETE,TRUNCATE'),
  'anonymous users have no catalog mutation privileges'
);
select throws_like(
  $$insert into public.projects (slug, name) values ('anon-write', 'Anonymous Write')$$,
  'permission denied for table projects',
  'anonymous users cannot insert canonical projects'
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
  $$select slug from public.projects order by slug$$,
  $$values ('active-project'::text), ('minimum-port-project'::text), ('rumored-project'::text)$$,
  'an authenticated owner sees active and rumored safe project rows'
);
select results_eq(
  $$select name from public.sources order by name$$,
  $$values ('Active Official Website'::text)$$,
  'an authenticated owner sees only active sources'
);
select results_eq(
  $$select project_id, source_id from public.project_sources order by project_id, source_id$$,
  $$
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid
    )
  $$,
  'an authenticated owner sees relations only when both catalog parents are active'
);
select results_eq(
  $$select slug, official_website_url from public.projects where official_website_url is not null order by slug$$,
  $$values ('active-project'::text, 'https://active.example.invalid'::text), ('minimum-port-project'::text, 'https://project.example.invalid:1/path'::text)$$,
  'an authenticated owner reads intended project links while RLS hides the paused project link'
);
select throws_like(
  $$select canonical_url from public.sources$$,
  'permission denied for table sources',
  'an authenticated owner cannot read unpromoted canonical source links'
);
select throws_like(
  $$select verified_by from public.project_sources$$,
  'permission denied for table project_sources',
  'an authenticated owner cannot read verifier identities'
);
select ok(
  not has_any_column_privilege('authenticated', 'public.projects', 'INSERT,UPDATE')
    and not has_any_column_privilege('authenticated', 'public.sources', 'INSERT,UPDATE')
    and not has_any_column_privilege('authenticated', 'public.project_sources', 'INSERT,UPDATE')
    and not has_table_privilege('authenticated', 'public.projects', 'DELETE,TRUNCATE')
    and not has_table_privilege('authenticated', 'public.sources', 'DELETE,TRUNCATE')
    and not has_table_privilege('authenticated', 'public.project_sources', 'DELETE,TRUNCATE'),
  'authenticated users have no catalog mutation privileges'
);
select throws_like(
  $$update public.sources set status = 'active'$$,
  'permission denied for table sources',
  'an authenticated owner cannot update canonical sources'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select results_eq(
  $$select slug from public.projects order by slug$$,
  $$values ('active-project'::text), ('minimum-port-project'::text), ('rumored-project'::text)$$,
  'an authenticated non-owner sees the same active and rumored public projects'
);
select results_eq(
  $$select name from public.sources order by name$$,
  $$values ('Active Official Website'::text)$$,
  'an authenticated non-owner sees the same active public sources'
);
select results_eq(
  $$select project_id, source_id from public.project_sources order by project_id, source_id$$,
  $$
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid
    )
  $$,
  'an authenticated non-owner sees the same active public relations'
);
select throws_like(
  $$delete from public.project_sources$$,
  'permission denied for table project_sources',
  'an authenticated non-owner cannot delete canonical relations'
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
  $$select slug from public.projects order by slug$$,
  $$values ('active-project'::text), ('minimum-port-project'::text), ('rumored-project'::text)$$,
  'a browser admin still sees only active and rumored safe project rows'
);
select results_eq(
  $$select name from public.sources order by name$$,
  $$values ('Active Official Website'::text)$$,
  'a browser admin still sees only active sources'
);
select results_eq(
  $$select project_id, source_id from public.project_sources order by project_id, source_id$$,
  $$
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid
    )
  $$,
  'a browser admin still sees only active catalog relations'
);
select results_eq(
  $$select slug, official_website_url from public.projects where official_website_url is not null order by slug$$,
  $$values ('active-project'::text, 'https://active.example.invalid'::text), ('minimum-port-project'::text, 'https://project.example.invalid:1/path'::text)$$,
  'a browser admin reads intended project links while RLS hides the paused project link'
);
select throws_like(
  $$select canonical_url from public.sources$$,
  'permission denied for table sources',
  'a browser admin cannot read unpromoted canonical source links'
);
select throws_like(
  $$select verified_by from public.project_sources$$,
  'permission denied for table project_sources',
  'a browser admin cannot read verifier identities'
);
select ok(
  not has_any_column_privilege('authenticated', 'public.projects', 'INSERT,UPDATE')
    and not has_any_column_privilege('authenticated', 'public.sources', 'INSERT,UPDATE')
    and not has_any_column_privilege('authenticated', 'public.project_sources', 'INSERT,UPDATE')
    and not has_table_privilege('authenticated', 'public.projects', 'DELETE,TRUNCATE')
    and not has_table_privilege('authenticated', 'public.sources', 'DELETE,TRUNCATE')
    and not has_table_privilege('authenticated', 'public.project_sources', 'DELETE,TRUNCATE'),
  'an active admin grant does not create browser catalog mutation privileges'
);
select throws_like(
  $$insert into public.sources (source_type, name, canonical_url) values ('news', 'Admin Write', 'https://admin-write.example.invalid')$$,
  'permission denied for table sources',
  'a browser admin cannot insert canonical sources'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is((select count(*)::integer from public.projects), 5, 'service role can read every project lifecycle and the disposable seed marker');
select is((select count(*)::integer from public.sources), 7, 'service role can read every source status');
select is((select count(*)::integer from public.project_sources), 3, 'service role can read every catalog relation');
select is(
  (
    select official_website_url
    from public.projects
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'https://active.example.invalid',
  'service role can read official project-link candidates'
);
select is(
  (
    select canonical_url
    from public.sources
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  ),
  'https://docs.active.example.invalid/start',
  'service role can read canonical source-link candidates'
);
select is(
  (
    select verified_by
    from public.project_sources
    where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and source_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  ),
  '44444444-4444-4444-8444-444444444444'::uuid,
  'service role can read verifier provenance'
);
select throws_like(
  $$
    insert into public.projects (slug, name, lifecycle)
    values ('blocked-service-project', 'Blocked Service Project', 'active')
  $$,
  'permission denied for table projects',
  'service role cannot insert canonical projects before Promotion Service exists'
);
select throws_like(
  $$
    insert into public.sources (source_type, name, canonical_url)
    values ('official_docs', 'Blocked Service Source', 'https://blocked-service.example.invalid')
  $$,
  'permission denied for table sources',
  'service role cannot insert canonical sources before Promotion Service exists'
);
select throws_like(
  $$
    insert into public.project_sources (project_id, source_id)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    )
  $$,
  'permission denied for table project_sources',
  'service role cannot insert canonical relations before Promotion Service exists'
);
select throws_like(
  $$
    update public.projects
    set summary = 'Blocked service rewrite'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  $$,
  'permission denied for table projects',
  'service role cannot update canonical projects before Promotion Service exists'
);
select throws_like(
  $$
    update public.sources
    set reputation_score = 80
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  $$,
  'permission denied for table sources',
  'service role cannot update canonical sources before Promotion Service exists'
);
select throws_like(
  $$
    update public.project_sources
    set verified_by = null
    where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and source_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  $$,
  'permission denied for table project_sources',
  'service role cannot overwrite official relation provenance before Promotion Service exists'
);
select throws_like(
  $$delete from public.projects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'$$,
  'permission denied for table projects',
  'service role cannot physically delete canonical projects'
);
select throws_like(
  $$delete from public.sources where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  'permission denied for table sources',
  'service role cannot physically delete canonical sources'
);
select throws_like(
  $$
    delete from public.project_sources
    where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  $$,
  'permission denied for table project_sources',
  'service role cannot physically delete canonical relations'
);
select ok(
  not has_any_column_privilege('service_role', 'public.projects', 'INSERT,UPDATE')
    and not has_any_column_privilege('service_role', 'public.sources', 'INSERT,UPDATE')
    and not has_any_column_privilege('service_role', 'public.project_sources', 'INSERT,UPDATE')
    and not has_table_privilege('service_role', 'public.projects', 'DELETE,TRUNCATE')
    and not has_table_privilege('service_role', 'public.sources', 'DELETE,TRUNCATE')
    and not has_table_privilege('service_role', 'public.project_sources', 'DELETE,TRUNCATE'),
  'service role receives read only and no catalog mutation privilege'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

select * from finish();

rollback;
