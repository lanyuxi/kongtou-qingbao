begin;

select plan(45);

select has_table('public', 'collection_attempts', 'collection attempts table exists');
select has_table('public', 'raw_items', 'raw items table exists');
select has_table('public', 'discovered_items', 'discovered items table exists');

select ok(
  exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'collection_worker'
      and not rolcanlogin
      and not rolinherit
      and not rolbypassrls
      and not rolsuper
      and not rolcreatedb
      and not rolcreaterole
      and not rolreplication
  ),
  'collection_worker is a non-login least-privilege effective role'
);

select ok(
  pg_catalog.pg_has_role('postgres', 'collection_worker', 'SET')
    and not pg_catalog.pg_has_role('service_role', 'collection_worker', 'SET')
    and not pg_catalog.pg_has_role('anon', 'collection_worker', 'SET')
    and not pg_catalog.pg_has_role('authenticated', 'collection_worker', 'SET'),
  'only the repository connection can explicitly assume collection_worker'
);

select results_eq(
  $$
    select enum_type.typname::text collate "C", enum_value.enumlabel::text collate "C"
    from pg_catalog.pg_type as enum_type
    join pg_catalog.pg_enum as enum_value on enum_value.enumtypid = enum_type.oid
    join pg_catalog.pg_namespace as namespace on namespace.oid = enum_type.typnamespace
    where namespace.nspname = 'public'
      and enum_type.typname in ('collection_outcome', 'collection_content_kind', 'discovery_disposition')
    order by enum_type.typname, enum_value.enumsortorder
  $$,
  $$
    select expected.enum_name collate "C", expected.enum_value collate "C"
    from (
      values
      ('collection_content_kind'::text, 'official_html'::text),
      ('collection_content_kind', 'rss_feed'),
      ('collection_content_kind', 'atom_feed'),
      ('collection_content_kind', 'feed_article_html'),
      ('collection_outcome', 'stored_new_content'),
      ('collection_outcome', 'not_modified'),
      ('collection_outcome', 'unchanged_content'),
      ('collection_outcome', 'discovered_only'),
      ('collection_outcome', 'body_fetch_budget_exhausted'),
      ('collection_outcome', 'rejected_url'),
      ('collection_outcome', 'rejected_dns_target'),
      ('collection_outcome', 'redirect_rejected'),
      ('collection_outcome', 'unsupported_content_type'),
      ('collection_outcome', 'invalid_text_encoding'),
      ('collection_outcome', 'response_too_large'),
      ('collection_outcome', 'timeout'),
      ('collection_outcome', 'http_error'),
      ('collection_outcome', 'invalid_feed'),
      ('collection_outcome', 'persistence_failed'),
      ('discovery_disposition', 'eligible'),
      ('discovery_disposition', 'discovered_only'),
      ('discovery_disposition', 'body_fetch_budget_exhausted'),
      ('discovery_disposition', 'fetched'),
      ('discovery_disposition', 'fetch_failed')
    ) as expected(enum_name, enum_value)
  $$,
  'collection enums have the exact ordered values'
);

select results_eq(
  $$
    select fixture.case_name::text collate "C",
      public.valid_collection_redirect_chain(fixture.candidate)
    from (
      values
        ('exact redirect hop'::text, '[{"hop":0,"status":302,"url":"https://collection.example/"}]'::jsonb),
        ('empty redirect hop', '[{}]'::jsonb),
        ('missing hop', '[{"status":302,"url":"https://collection.example/"}]'::jsonb),
        ('missing status', '[{"hop":0,"url":"https://collection.example/"}]'::jsonb),
        ('missing url', '[{"hop":0,"status":302}]'::jsonb)
    ) as fixture(case_name, candidate)
    order by fixture.case_name
  $$,
  $$
    select expected.case_name collate "C", expected.is_valid
    from (
      values
        ('empty redirect hop'::text, false),
        ('exact redirect hop', true),
        ('missing hop', false),
        ('missing status', false),
        ('missing url', false)
    ) as expected(case_name, is_valid)
  $$,
  'redirect hops require the exact complete hop status and URL key set'
);

select columns_are(
  'public',
  'collection_attempts',
  array[
    'id', 'project_id', 'source_id', 'parent_discovered_item_id', 'idempotency_key',
    'requested_url', 'final_url', 'redirect_chain', 'started_at', 'completed_at',
    'collected_at', 'http_status', 'media_type', 'etag', 'last_modified',
    'decompressed_bytes', 'outcome', 'error_code', 'error_detail', 'raw_item_id',
    'discovered_count', 'body_fetch_count', 'created_at'
  ],
  'collection attempts expose only bounded outcome metadata and no request headers or body'
);

select columns_are(
  'public',
  'raw_items',
  array[
    'id', 'project_id', 'source_id', 'parent_discovered_item_id', 'logical_url',
    'final_url', 'content_kind', 'media_type', 'raw_text', 'sha256', 'published_at',
    'collected_at', 'created_at'
  ],
  'raw items have the exact immutable payload columns'
);

select columns_are(
  'public',
  'discovered_items',
  array[
    'id', 'project_id', 'source_id', 'feed_raw_item_id', 'stable_entry_key', 'version',
    'supersedes_discovered_item_id', 'entry_url', 'title', 'summary', 'author',
    'external_entry_id', 'published_at', 'updated_at', 'is_authority_domain',
    'disposition', 'article_collection_attempt_id', 'article_raw_item_id', 'created_at'
  ],
  'discovered items have the exact versioned discovery columns'
);

select results_eq(
  $$
    select column_info.table_name::text collate "C", column_info.column_name::text collate "C",
      column_info.data_type::text collate "C", column_info.udt_name::text collate "C"
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name in ('collection_attempts', 'raw_items', 'discovered_items')
    order by column_info.table_name, column_info.ordinal_position
  $$,
  $$
    select expected.table_name collate "C", expected.column_name collate "C",
      expected.data_type collate "C", expected.udt_name collate "C"
    from (
      values
      ('collection_attempts'::text, 'id'::text, 'uuid'::text, 'uuid'::text),
      ('collection_attempts', 'project_id', 'uuid', 'uuid'),
      ('collection_attempts', 'source_id', 'uuid', 'uuid'),
      ('collection_attempts', 'parent_discovered_item_id', 'uuid', 'uuid'),
      ('collection_attempts', 'idempotency_key', 'text', 'text'),
      ('collection_attempts', 'requested_url', 'text', 'text'),
      ('collection_attempts', 'final_url', 'text', 'text'),
      ('collection_attempts', 'redirect_chain', 'jsonb', 'jsonb'),
      ('collection_attempts', 'started_at', 'timestamp with time zone', 'timestamptz'),
      ('collection_attempts', 'completed_at', 'timestamp with time zone', 'timestamptz'),
      ('collection_attempts', 'collected_at', 'timestamp with time zone', 'timestamptz'),
      ('collection_attempts', 'http_status', 'integer', 'int4'),
      ('collection_attempts', 'media_type', 'text', 'text'),
      ('collection_attempts', 'etag', 'text', 'text'),
      ('collection_attempts', 'last_modified', 'text', 'text'),
      ('collection_attempts', 'decompressed_bytes', 'integer', 'int4'),
      ('collection_attempts', 'outcome', 'USER-DEFINED', 'collection_outcome'),
      ('collection_attempts', 'error_code', 'text', 'text'),
      ('collection_attempts', 'error_detail', 'text', 'text'),
      ('collection_attempts', 'raw_item_id', 'uuid', 'uuid'),
      ('collection_attempts', 'discovered_count', 'integer', 'int4'),
      ('collection_attempts', 'body_fetch_count', 'integer', 'int4'),
      ('collection_attempts', 'created_at', 'timestamp with time zone', 'timestamptz'),
      ('discovered_items', 'id', 'uuid', 'uuid'),
      ('discovered_items', 'project_id', 'uuid', 'uuid'),
      ('discovered_items', 'source_id', 'uuid', 'uuid'),
      ('discovered_items', 'feed_raw_item_id', 'uuid', 'uuid'),
      ('discovered_items', 'stable_entry_key', 'text', 'text'),
      ('discovered_items', 'version', 'integer', 'int4'),
      ('discovered_items', 'supersedes_discovered_item_id', 'uuid', 'uuid'),
      ('discovered_items', 'entry_url', 'text', 'text'),
      ('discovered_items', 'title', 'text', 'text'),
      ('discovered_items', 'summary', 'text', 'text'),
      ('discovered_items', 'author', 'text', 'text'),
      ('discovered_items', 'external_entry_id', 'text', 'text'),
      ('discovered_items', 'published_at', 'timestamp with time zone', 'timestamptz'),
      ('discovered_items', 'updated_at', 'timestamp with time zone', 'timestamptz'),
      ('discovered_items', 'is_authority_domain', 'boolean', 'bool'),
      ('discovered_items', 'disposition', 'USER-DEFINED', 'discovery_disposition'),
      ('discovered_items', 'article_collection_attempt_id', 'uuid', 'uuid'),
      ('discovered_items', 'article_raw_item_id', 'uuid', 'uuid'),
      ('discovered_items', 'created_at', 'timestamp with time zone', 'timestamptz'),
      ('raw_items', 'id', 'uuid', 'uuid'),
      ('raw_items', 'project_id', 'uuid', 'uuid'),
      ('raw_items', 'source_id', 'uuid', 'uuid'),
      ('raw_items', 'parent_discovered_item_id', 'uuid', 'uuid'),
      ('raw_items', 'logical_url', 'text', 'text'),
      ('raw_items', 'final_url', 'text', 'text'),
      ('raw_items', 'content_kind', 'USER-DEFINED', 'collection_content_kind'),
      ('raw_items', 'media_type', 'text', 'text'),
      ('raw_items', 'raw_text', 'text', 'text'),
      ('raw_items', 'sha256', 'text', 'text'),
      ('raw_items', 'published_at', 'timestamp with time zone', 'timestamptz'),
      ('raw_items', 'collected_at', 'timestamp with time zone', 'timestamptz'),
      ('raw_items', 'created_at', 'timestamp with time zone', 'timestamptz')
    ) as expected(table_name, column_name, data_type, udt_name)
  $$,
  'collection columns have exact SQL types'
);

select results_eq(
  $$
    select table_name::text collate "C", column_name::text collate "C", is_nullable::text collate "C"
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('collection_attempts', 'raw_items', 'discovered_items')
      and is_nullable = 'YES'
    order by table_name, ordinal_position
  $$,
  $$
    select expected.table_name collate "C", expected.column_name collate "C",
      expected.is_nullable collate "C"
    from (
      values
      ('collection_attempts'::text, 'parent_discovered_item_id'::text, 'YES'::text),
      ('collection_attempts', 'final_url', 'YES'),
      ('collection_attempts', 'http_status', 'YES'),
      ('collection_attempts', 'media_type', 'YES'),
      ('collection_attempts', 'etag', 'YES'),
      ('collection_attempts', 'last_modified', 'YES'),
      ('collection_attempts', 'decompressed_bytes', 'YES'),
      ('collection_attempts', 'error_code', 'YES'),
      ('collection_attempts', 'error_detail', 'YES'),
      ('collection_attempts', 'raw_item_id', 'YES'),
      ('discovered_items', 'supersedes_discovered_item_id', 'YES'),
      ('discovered_items', 'entry_url', 'YES'),
      ('discovered_items', 'title', 'YES'),
      ('discovered_items', 'summary', 'YES'),
      ('discovered_items', 'author', 'YES'),
      ('discovered_items', 'external_entry_id', 'YES'),
      ('discovered_items', 'published_at', 'YES'),
      ('discovered_items', 'updated_at', 'YES'),
      ('discovered_items', 'article_collection_attempt_id', 'YES'),
      ('discovered_items', 'article_raw_item_id', 'YES'),
      ('raw_items', 'parent_discovered_item_id', 'YES'),
      ('raw_items', 'published_at', 'YES')
    ) as expected(table_name, column_name, is_nullable)
  $$,
  'collection columns have exact nullability'
);

select results_eq(
  $$
    select table_name::text collate "C", column_name::text collate "C", column_default::text collate "C"
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('collection_attempts', 'raw_items', 'discovered_items')
      and column_default is not null
    order by table_name, ordinal_position
  $$,
  $$
    select expected.table_name collate "C", expected.column_name collate "C",
      expected.column_default collate "C"
    from (
      values
      ('collection_attempts'::text, 'redirect_chain'::text, '''[]''::jsonb'::text),
      ('collection_attempts', 'discovered_count', '0'),
      ('collection_attempts', 'body_fetch_count', '0'),
      ('collection_attempts', 'created_at', 'now()'),
      ('discovered_items', 'created_at', 'now()'),
      ('raw_items', 'created_at', 'now()')
    ) as expected(table_name, column_name, column_default)
  $$,
  'collection columns have exact defaults'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'collection_attempts'
      and column_name in ('headers', 'request_headers', 'response_headers', 'body', 'request_body', 'response_body')
  ),
  'collection attempts persist no arbitrary headers or body'
);

select has_pk('public', 'collection_attempts', 'collection attempts have a primary key');
select has_pk('public', 'raw_items', 'raw items have a primary key');
select has_pk('public', 'discovered_items', 'discovered items have a primary key');

select results_eq(
  $$
    select relation.relname::text collate "C", constraint_info.conname::text collate "C"
    from pg_catalog.pg_constraint as constraint_info
    join pg_catalog.pg_class as relation on relation.oid = constraint_info.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('collection_attempts', 'raw_items', 'discovered_items')
      and constraint_info.contype = 'u'
    order by relation.relname, constraint_info.conname
  $$,
  $$
    select expected.table_name collate "C", expected.constraint_name collate "C"
    from (
      values
      ('collection_attempts'::text, 'collection_attempts_id_project_source_key'::text),
      ('collection_attempts', 'collection_attempts_idempotency_key_key'),
      ('discovered_items', 'discovered_items_feed_entry_version_key'),
      ('discovered_items', 'discovered_items_id_project_source_key'),
      ('discovered_items', 'discovered_items_identity_key'),
      ('raw_items', 'raw_items_id_project_source_key'),
      ('raw_items', 'raw_items_project_source_logical_sha_key')
    ) as expected(table_name, constraint_name)
  $$,
  'collection uniqueness covers commands, endpoint hashes, versions, and composite identity'
);

select results_eq(
  $$
    select constraint_info.conname::text collate "C",
      pg_catalog.pg_get_constraintdef(constraint_info.oid)::text collate "C"
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid in (
      'public.collection_attempts'::regclass,
      'public.raw_items'::regclass,
      'public.discovered_items'::regclass
    )
      and constraint_info.contype = 'f'
    order by constraint_info.conname
  $$,
  $$
    select expected.constraint_name collate "C", expected.definition collate "C"
    from (
      values
      ('collection_attempts_parent_identity_fkey'::text, 'FOREIGN KEY (parent_discovered_item_id, project_id, source_id) REFERENCES discovered_items(id, project_id, source_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'::text),
      ('collection_attempts_project_id_fkey', 'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT'),
      ('collection_attempts_raw_item_identity_fkey', 'FOREIGN KEY (raw_item_id, project_id, source_id) REFERENCES raw_items(id, project_id, source_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'),
      ('collection_attempts_source_id_fkey', 'FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE RESTRICT'),
      ('discovered_items_article_attempt_identity_fkey', 'FOREIGN KEY (article_collection_attempt_id, project_id, source_id) REFERENCES collection_attempts(id, project_id, source_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'),
      ('discovered_items_article_raw_identity_fkey', 'FOREIGN KEY (article_raw_item_id, project_id, source_id) REFERENCES raw_items(id, project_id, source_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'),
      ('discovered_items_feed_raw_identity_fkey', 'FOREIGN KEY (feed_raw_item_id, project_id, source_id) REFERENCES raw_items(id, project_id, source_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'),
      ('discovered_items_project_id_fkey', 'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT'),
      ('discovered_items_source_id_fkey', 'FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE RESTRICT'),
      ('discovered_items_supersedes_identity_fkey', 'FOREIGN KEY (supersedes_discovered_item_id, project_id, source_id, stable_entry_key) REFERENCES discovered_items(id, project_id, source_id, stable_entry_key) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'),
      ('raw_items_parent_identity_fkey', 'FOREIGN KEY (parent_discovered_item_id, project_id, source_id) REFERENCES discovered_items(id, project_id, source_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'),
      ('raw_items_project_id_fkey', 'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT'),
      ('raw_items_source_id_fkey', 'FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE RESTRICT')
    ) as expected(constraint_name, definition)
  $$,
  'collection foreign keys preserve project source and stable discovery identity'
);

select results_eq(
  $$
    select index_info.tablename::text collate "C", index_info.indexname::text collate "C"
    from pg_catalog.pg_indexes as index_info
    where index_info.schemaname = 'public'
      and index_info.tablename in ('collection_attempts', 'raw_items', 'discovered_items')
      and index_info.indexname not like '%_pkey'
    order by index_info.tablename, index_info.indexname
  $$,
  $$
    select expected.table_name collate "C", expected.index_name collate "C"
    from (
      values
      ('collection_attempts'::text, 'collection_attempts_id_project_source_key'::text),
      ('collection_attempts', 'collection_attempts_idempotency_key_key'),
      ('collection_attempts', 'collection_attempts_source_collected_idx'),
      ('discovered_items', 'discovered_items_feed_entry_version_key'),
      ('discovered_items', 'discovered_items_id_project_source_key'),
      ('discovered_items', 'discovered_items_identity_key'),
      ('discovered_items', 'discovered_items_source_created_idx'),
      ('raw_items', 'raw_items_id_project_source_key'),
      ('raw_items', 'raw_items_project_source_logical_sha_key'),
      ('raw_items', 'raw_items_source_collected_idx')
    ) as expected(table_name, index_name)
  $$,
  'collection tables have exact uniqueness and retrieval indexes'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid in (
      'public.collection_attempts'::regclass,
      'public.raw_items'::regclass,
      'public.discovered_items'::regclass
    )
      and constraint_info.contype = 'f'
      and constraint_info.confdeltype <> 'r'
  ),
  'all collection foreign keys restrict deletion'
);

select ok(
  relation.relrowsecurity and relation.relforcerowsecurity,
  pg_catalog.format('%s enables and forces row-level security', relation.relname)
)
from pg_catalog.pg_class as relation
where relation.oid in (
  'public.collection_attempts'::regclass,
  'public.raw_items'::regclass,
  'public.discovered_items'::regclass
)
order by relation.relname;

select results_eq(
  $$
    select policy.tablename::text collate "C", policy.policyname::text collate "C",
      policy.cmd::text collate "C", policy.roles::text collate "C"
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename in ('collection_attempts', 'raw_items', 'discovered_items')
    order by policy.tablename, policy.policyname
  $$,
  $$
    select expected.table_name collate "C", expected.policy_name collate "C",
      expected.command collate "C", expected.roles collate "C"
    from (
      values
      ('collection_attempts'::text, 'collection_attempts_insert_collection_worker'::text, 'INSERT'::text, '{collection_worker}'::text),
      ('collection_attempts', 'collection_attempts_select_collection_worker', 'SELECT', '{collection_worker}'),
      ('discovered_items', 'discovered_items_insert_collection_worker', 'INSERT', '{collection_worker}'),
      ('discovered_items', 'discovered_items_select_ai_stage_worker', 'SELECT', '{ai_stage_worker}'),
      ('discovered_items', 'discovered_items_select_collection_worker', 'SELECT', '{collection_worker}'),
      ('raw_items', 'raw_items_insert_collection_worker', 'INSERT', '{collection_worker}'),
      ('raw_items', 'raw_items_select_ai_stage_worker', 'SELECT', '{ai_stage_worker}'),
      ('raw_items', 'raw_items_select_collection_worker', 'SELECT', '{collection_worker}')
    ) as expected(table_name, policy_name, command, roles)
  $$,
  'collection history has the exact collection-worker policies plus AI-stage input reads'
);

select ok(
  not has_table_privilege('anon', 'public.raw_items', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.raw_items', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('service_role', 'public.raw_items', 'SELECT,INSERT,UPDATE,DELETE'),
  'browser and generic service identities have no raw item access'
);

select ok(
  has_table_privilege('collection_worker', pg_catalog.format('public.%I', expected.table_name), 'SELECT,INSERT')
    and not has_table_privilege('collection_worker', pg_catalog.format('public.%I', expected.table_name), 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  pg_catalog.format('collection_worker has only select and insert on %s', expected.table_name)
)
from (
  values ('collection_attempts'), ('raw_items'), ('discovered_items')
) as expected(table_name);

select ok(
  procedure_info.prosecdef
    and pg_catalog.pg_get_userbyid(procedure_info.proowner) = 'postgres'
    and procedure_info.proconfig = array['search_path=pg_catalog, public']::text[],
  'collection context is postgres-owned security definer with fixed search path'
)
from pg_catalog.pg_proc as procedure_info
where procedure_info.oid = 'public.load_source_collection_context(uuid,uuid)'::regprocedure;

select ok(
  has_function_privilege('collection_worker', 'public.load_source_collection_context(uuid,uuid)', 'EXECUTE')
    and not exists (
      select 1
      from pg_catalog.pg_proc as procedure_info
      cross join lateral pg_catalog.aclexplode(procedure_info.proacl) as exploded_acl
      where procedure_info.oid = 'public.load_source_collection_context(uuid,uuid)'::regprocedure
        and exploded_acl.grantee = 0
        and exploded_acl.privilege_type = 'EXECUTE'
    )
    and not has_function_privilege('anon', 'public.load_source_collection_context(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.load_source_collection_context(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.load_source_collection_context(uuid,uuid)', 'EXECUTE'),
  'only collection_worker can execute collection context'
);

select ok(
  has_function_privilege('collection_worker', 'public.valid_collection_redirect_chain(jsonb)', 'EXECUTE')
    and not exists (
      select 1
      from pg_catalog.pg_proc as procedure_info
      cross join lateral pg_catalog.aclexplode(procedure_info.proacl) as exploded_acl
      where procedure_info.oid = 'public.valid_collection_redirect_chain(jsonb)'::regprocedure
        and exploded_acl.grantee = 0
        and exploded_acl.privilege_type = 'EXECUTE'
    )
    and not has_function_privilege('anon', 'public.valid_collection_redirect_chain(jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.valid_collection_redirect_chain(jsonb)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.valid_collection_redirect_chain(jsonb)', 'EXECUTE'),
  'only collection_worker can execute the collection check helper'
);

select ok(
  procedure_info.proretset
    and procedure_info.prorettype = 'record'::regtype
    and procedure_info.proargmodes = array['i', 'i', 't', 't', 't', 't']::"char"[]
    and procedure_info.proallargtypes = array[
      'uuid'::regtype,
      'uuid'::regtype,
      'uuid'::regtype,
      'uuid'::regtype,
      'text'::regtype,
      'text[]'::regtype
    ]::oid[]
    and procedure_info.proargnames = array[
      'requested_project_id',
      'requested_source_id',
      'project_id',
      'source_id',
      'canonical_url',
      'authority_domains'
    ]::text[],
  'collection context returns only the bounded project source URL and authority-domain rowset'
)
from pg_catalog.pg_proc as procedure_info
where procedure_info.oid = 'public.load_source_collection_context(uuid,uuid)'::regprocedure;

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '80000000-0000-4000-8000-000000000090',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'collection-reviewer@example.invalid',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.projects (id, slug, name, lifecycle)
values
  ('80000000-0000-4000-8000-000000000010', 'collection-active', 'Collection Active', 'active'),
  ('80000000-0000-4000-8000-000000000011', 'collection-other', 'Collection Other', 'active');

insert into public.sources (id, source_type, name, canonical_url, status)
values
  ('80000000-0000-4000-8000-000000000020', 'official_web', 'Collection Source', 'https://collection.example/', 'active'),
  ('80000000-0000-4000-8000-000000000021', 'official_web', 'Inactive Source', 'https://inactive.example/', 'retired');

insert into public.project_sources (
  project_id, source_id, authority_domains, is_official, verified_at, verified_by
)
values
  ('80000000-0000-4000-8000-000000000010', '80000000-0000-4000-8000-000000000020', array['collection.example'], true, now(), '80000000-0000-4000-8000-000000000090'),
  ('80000000-0000-4000-8000-000000000010', '80000000-0000-4000-8000-000000000021', array['inactive.example'], true, now(), '80000000-0000-4000-8000-000000000090');

set local role collection_worker;

create temporary table collection_worker_context_result
on commit drop
as
select project_id, source_id, canonical_url, authority_domains
from public.load_source_collection_context(
  '80000000-0000-4000-8000-000000000010',
  '80000000-0000-4000-8000-000000000020'
);

create temporary table collection_worker_observations (
  observation_name text primary key,
  observation_value text not null
) on commit drop;

insert into collection_worker_observations (observation_name, observation_value)
values (
  'inactive_context_count',
  (
    select count(*)::text
    from public.load_source_collection_context(
      '80000000-0000-4000-8000-000000000010',
      '80000000-0000-4000-8000-000000000021'
    )
  )
);

insert into public.raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at
)
values (
  '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000010',
  '80000000-0000-4000-8000-000000000020',
  'https://collection.example/feed', 'https://collection.example/feed',
  'rss_feed', 'application/rss+xml', '<rss/>', repeat('a', 64), now()
);

insert into public.discovered_items (
  id, project_id, source_id, feed_raw_item_id, stable_entry_key, version,
  entry_url, is_authority_domain, disposition
)
values (
  '80000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000010',
  '80000000-0000-4000-8000-000000000020',
  '80000000-0000-4000-8000-000000000001', 'entry-1', 1,
  'https://collection.example/article', true, 'eligible'
);

insert into public.collection_attempts (
  id, project_id, source_id, parent_discovered_item_id, idempotency_key,
  requested_url, started_at, completed_at, collected_at, outcome
)
values (
  '80000000-0000-4000-8000-000000000003',
  '80000000-0000-4000-8000-000000000010',
  '80000000-0000-4000-8000-000000000020',
  '80000000-0000-4000-8000-000000000002', 'collection-command-1',
  'https://collection.example/article', now(), now(), now(), 'not_modified'
);

insert into collection_worker_observations (observation_name, observation_value)
values (
  'raw_item_count',
  (select count(*)::text from public.raw_items
   where id = '80000000-0000-4000-8000-000000000001'::uuid)
);

reset role;

select results_eq(
  $$
    select project_id, source_id, canonical_url, authority_domains
    from pg_temp.collection_worker_context_result
  $$,
  $$
    values (
      '80000000-0000-4000-8000-000000000010'::uuid,
      '80000000-0000-4000-8000-000000000020'::uuid,
      'https://collection.example/'::text,
      array['collection.example']::text[]
    )
  $$,
  'worker loads only the verified active official source context'
);

select is(
  (select observation_value from pg_temp.collection_worker_observations where observation_name = 'inactive_context_count'),
  '0',
  'inactive source has no collection context'
);

select is(
  (select observation_value from pg_temp.collection_worker_observations where observation_name = 'raw_item_count'),
  '1',
  'collection_worker can select inserted history'
);

select throws_ok(
  $$ update public.raw_items set raw_text = 'changed' where id = '80000000-0000-4000-8000-000000000001' $$,
  '55000',
  'collection_history_append_only'
);
select throws_ok(
  $$ delete from public.raw_items where id = '80000000-0000-4000-8000-000000000001' $$,
  '55000',
  'collection_history_append_only'
);
select throws_ok(
  $$ update public.discovered_items set title = 'changed' where id = '80000000-0000-4000-8000-000000000002' $$,
  '55000',
  'collection_history_append_only'
);
select throws_ok(
  $$ delete from public.discovered_items where id = '80000000-0000-4000-8000-000000000002' $$,
  '55000',
  'collection_history_append_only'
);
select throws_ok(
  $$ update public.collection_attempts set error_detail = 'changed' where id = '80000000-0000-4000-8000-000000000003' $$,
  '55000',
  'collection_history_append_only'
);
select throws_ok(
  $$ delete from public.collection_attempts where id = '80000000-0000-4000-8000-000000000003' $$,
  '55000',
  'collection_history_append_only'
);

set local role collection_worker;

do $body$
begin
  begin
    insert into public.raw_items (
      id, project_id, source_id, logical_url, final_url, content_kind, media_type,
      raw_text, sha256, collected_at
    ) values (
      '80000000-0000-4000-8000-000000000004',
      '80000000-0000-4000-8000-000000000011',
      '80000000-0000-4000-8000-000000000020',
      'https://collection.example/bad', 'https://collection.example/bad',
      'official_html', 'text/html', 'bad', repeat('b', 64), now()
    );
  exception
    when others then
      insert into pg_temp.collection_worker_observations (observation_name, observation_value)
      values ('unauthorized_insert_error', sqlstate || ':' || sqlerrm);
  end;

  begin
    insert into public.collection_attempts (
      id, project_id, source_id, idempotency_key, requested_url,
      redirect_chain, started_at, completed_at, collected_at, outcome
    ) values (
      '80000000-0000-4000-8000-000000000005',
      '80000000-0000-4000-8000-000000000010',
      '80000000-0000-4000-8000-000000000020', 'invalid-chain',
      'https://collection.example/', '[{"hop":0,"status":302,"url":"https://collection.example/","extra":true}]',
      now(), now(), now(), 'not_modified'
    );
  exception
    when others then
      insert into pg_temp.collection_worker_observations (observation_name, observation_value)
      values ('invalid_redirect_error', sqlstate || ':' || sqlerrm);
  end;
end
$body$;

reset role;

select ok(
  (
    select observation_value
    from pg_temp.collection_worker_observations
    where observation_name = 'unauthorized_insert_error'
  ) like '42501:%violates row-level security policy%',
  'worker cannot insert outside verified project source context'
);

select ok(
  (
    select observation_value
    from pg_temp.collection_worker_observations
    where observation_name = 'invalid_redirect_error'
  ) like '23514:%collection_attempts_redirect_chain_valid%',
  'redirect metadata rejects non-strict hop objects'
);

select throws_like(
  $test$
    do $body$
    begin
      insert into public.discovered_items (
        id, project_id, source_id, feed_raw_item_id, stable_entry_key, version,
        is_authority_domain, disposition
      ) values (
        '80000000-0000-4000-8000-000000000006',
        '80000000-0000-4000-8000-000000000011',
        '80000000-0000-4000-8000-000000000020',
        '80000000-0000-4000-8000-000000000001', 'entry-1', 2, false, 'eligible'
      );
      execute 'set constraints all immediate';
    end
    $body$
  $test$,
  '%discovered_items_feed_raw_identity_fkey%',
  'feed discovery cannot cross project source identity'
);

select * from finish();

rollback;
