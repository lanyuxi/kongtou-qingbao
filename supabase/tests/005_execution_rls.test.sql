begin;

select plan(228);

select has_table('public', 'watchlists', 'watchlists table exists');
select has_table('public', 'watchlist_projects', 'watchlist_projects table exists');
select has_table('public', 'user_projects', 'user_projects table exists');
select has_table('public', 'user_tasks', 'user_tasks table exists');

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.watchlists'::regclass),
  'watchlists has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.watchlist_projects'::regclass),
  'watchlist_projects has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.user_projects'::regclass),
  'user_projects has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.user_tasks'::regclass),
  'user_tasks has row-level security enabled'
);

select columns_are(
  'public',
  'watchlists',
  array['id', 'user_id', 'name', 'is_default', 'created_at', 'updated_at', 'version'],
  'watchlists exposes the private execution contract columns in order'
);
select columns_are(
  'public',
  'watchlist_projects',
  array['watchlist_id', 'project_id', 'added_at'],
  'watchlist_projects exposes the private execution contract columns in order'
);
select columns_are(
  'public',
  'user_projects',
  array['user_id', 'project_id', 'participation_status', 'notes', 'started_at', 'updated_at', 'version'],
  'user_projects exposes the private execution contract columns in order'
);
select columns_are(
  'public',
  'user_tasks',
  array[
    'id',
    'user_id',
    'project_id',
    'title',
    'status',
    'priority',
    'due_at',
    'completed_at',
    'version',
    'created_at',
    'updated_at'
  ],
  'user_tasks exposes the private execution contract columns in order'
);

with expected(
  table_name,
  column_name,
  ordinal_position,
  sql_type,
  nullable,
  default_expression
) as (
  values
    ('watchlists', 'id', 1, 'pg_catalog.uuid', 'NO', 'gen_random_uuid()'),
    ('watchlists', 'user_id', 2, 'pg_catalog.uuid', 'NO', '<none>'),
    ('watchlists', 'name', 3, 'pg_catalog.text', 'NO', '<none>'),
    ('watchlists', 'is_default', 4, 'pg_catalog.bool', 'NO', 'false'),
    ('watchlists', 'created_at', 5, 'pg_catalog.timestamptz', 'NO', 'now()'),
    ('watchlists', 'updated_at', 6, 'pg_catalog.timestamptz', 'NO', 'now()'),
    ('watchlist_projects', 'watchlist_id', 1, 'pg_catalog.uuid', 'NO', '<none>'),
    ('watchlist_projects', 'project_id', 2, 'pg_catalog.uuid', 'NO', '<none>'),
    ('watchlist_projects', 'added_at', 3, 'pg_catalog.timestamptz', 'NO', 'now()'),
    ('user_projects', 'user_id', 1, 'pg_catalog.uuid', 'NO', '<none>'),
    ('user_projects', 'project_id', 2, 'pg_catalog.uuid', 'NO', '<none>'),
    (
      'user_projects',
      'participation_status',
      3,
      'public.participation_status',
      'NO',
      '''interested''::participation_status'
    ),
    ('user_projects', 'notes', 4, 'pg_catalog.text', 'YES', '<none>'),
    ('user_projects', 'started_at', 5, 'pg_catalog.timestamptz', 'YES', '<none>'),
    ('user_projects', 'updated_at', 6, 'pg_catalog.timestamptz', 'NO', 'now()'),
    ('user_tasks', 'id', 1, 'pg_catalog.uuid', 'NO', 'gen_random_uuid()'),
    ('user_tasks', 'user_id', 2, 'pg_catalog.uuid', 'NO', '<none>'),
    ('user_tasks', 'project_id', 3, 'pg_catalog.uuid', 'YES', '<none>'),
    ('user_tasks', 'title', 4, 'pg_catalog.text', 'NO', '<none>'),
    (
      'user_tasks',
      'status',
      5,
      'public.task_status',
      'NO',
      '''backlog''::task_status'
    ),
    (
      'user_tasks',
      'priority',
      6,
      'public.task_priority',
      'NO',
      '''medium''::task_priority'
    ),
    ('user_tasks', 'due_at', 7, 'pg_catalog.timestamptz', 'YES', '<none>'),
    ('user_tasks', 'completed_at', 8, 'pg_catalog.timestamptz', 'YES', '<none>'),
    ('user_tasks', 'version', 9, 'pg_catalog.int8', 'NO', '1'),
    ('user_tasks', 'created_at', 10, 'pg_catalog.timestamptz', 'NO', 'now()'),
    ('user_tasks', 'updated_at', 11, 'pg_catalog.timestamptz', 'NO', 'now()')
)
select is(
  (
    select pg_catalog.format(
      '%s|%s.%s|%s|%s',
      actual.ordinal_position,
      actual.udt_schema,
      actual.udt_name,
      actual.is_nullable,
      coalesce(actual.column_default::text, '<none>')
    )
    from information_schema.columns as actual
    where actual.table_schema = 'public'
      and actual.table_name = expected.table_name
      and actual.column_name = expected.column_name
  ),
  pg_catalog.format(
    '%s|%s|%s|%s',
    expected.ordinal_position,
    expected.sql_type,
    expected.nullable,
    expected.default_expression
  ),
  pg_catalog.format(
    '%s.%s has the exact ordinal, type, nullability, and default contract',
    expected.table_name,
    expected.column_name
  )
)
from expected;

with expected(table_name, constraint_name, key_columns) as (
  values
    ('watchlists', 'watchlists_pkey', array['id']::text[]),
    (
      'watchlist_projects',
      'watchlist_projects_pkey',
      array['watchlist_id', 'project_id']::text[]
    ),
    ('user_projects', 'user_projects_pkey', array['user_id', 'project_id']::text[]),
    ('user_tasks', 'user_tasks_pkey', array['id']::text[])
)
select is(
  (
    select pg_catalog.array_agg(key_attribute.attname order by key_position.ordinality)::text[]
    from pg_catalog.pg_constraint as primary_key
    cross join lateral pg_catalog.unnest(primary_key.conkey)
      with ordinality as key_position(attnum, ordinality)
    join pg_catalog.pg_attribute as key_attribute
      on key_attribute.attrelid = primary_key.conrelid
      and key_attribute.attnum = key_position.attnum
    where primary_key.conrelid = pg_catalog.to_regclass(
      pg_catalog.format('public.%I', expected.table_name)
    )
      and primary_key.conname = expected.constraint_name
      and primary_key.contype = 'p'
  ),
  expected.key_columns,
  pg_catalog.format('%s has the exact primary key columns', expected.table_name)
)
from expected;

select is(
  (
    select pg_catalog.array_agg(key_attribute.attname order by key_position.ordinality)::text[]
    from pg_catalog.pg_constraint as unique_constraint
    cross join lateral pg_catalog.unnest(unique_constraint.conkey)
      with ordinality as key_position(attnum, ordinality)
    join pg_catalog.pg_attribute as key_attribute
      on key_attribute.attrelid = unique_constraint.conrelid
      and key_attribute.attnum = key_position.attnum
    where unique_constraint.conrelid = 'public.watchlists'::regclass
      and unique_constraint.conname = 'watchlists_user_id_name_key'
      and unique_constraint.contype = 'u'
  ),
  array['user_id', 'name']::text[],
  'watchlist names have the exact per-owner unique key'
);

with expected(table_name, constraint_name) as (
  values
    ('watchlists', 'watchlists_name_valid'),
    ('user_projects', 'user_projects_notes_valid'),
    ('user_tasks', 'user_tasks_title_valid'),
    ('user_tasks', 'user_tasks_completed_at_matches_status'),
    ('user_tasks', 'user_tasks_version_positive')
)
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as check_constraint
    where check_constraint.conrelid = pg_catalog.to_regclass(
      pg_catalog.format('public.%I', expected.table_name)
    )
      and check_constraint.conname = expected.constraint_name
      and check_constraint.contype = 'c'
  ),
  pg_catalog.format('%s.%s is an enforced check constraint', expected.table_name, expected.constraint_name)
)
from expected;

with expected(
  table_name,
  constraint_name,
  local_column,
  target_table,
  target_column,
  delete_action
) as (
  values
    (
      'watchlists',
      'watchlists_user_id_fkey',
      'user_id',
      'public.profiles',
      'id',
      'c'
    ),
    (
      'watchlist_projects',
      'watchlist_projects_watchlist_id_fkey',
      'watchlist_id',
      'public.watchlists',
      'id',
      'c'
    ),
    (
      'watchlist_projects',
      'watchlist_projects_project_id_fkey',
      'project_id',
      'public.projects',
      'id',
      'c'
    ),
    (
      'user_projects',
      'user_projects_user_id_fkey',
      'user_id',
      'public.profiles',
      'id',
      'c'
    ),
    (
      'user_projects',
      'user_projects_project_id_fkey',
      'project_id',
      'public.projects',
      'id',
      'c'
    ),
    (
      'user_tasks',
      'user_tasks_user_id_fkey',
      'user_id',
      'public.profiles',
      'id',
      'c'
    ),
    (
      'user_tasks',
      'user_tasks_project_id_fkey',
      'project_id',
      'public.projects',
      'id',
      'n'
    )
)
select is(
  (
    select pg_catalog.format(
      '%s|%s.%s|%s',
      local_attribute.attname,
      target_namespace.nspname,
      target_relation.relname,
      foreign_key.confdeltype
    )
    from pg_catalog.pg_constraint as foreign_key
    join pg_catalog.pg_attribute as local_attribute
      on local_attribute.attrelid = foreign_key.conrelid
      and local_attribute.attnum = foreign_key.conkey[1]
    join pg_catalog.pg_class as target_relation on target_relation.oid = foreign_key.confrelid
    join pg_catalog.pg_namespace as target_namespace
      on target_namespace.oid = target_relation.relnamespace
    join pg_catalog.pg_attribute as target_attribute
      on target_attribute.attrelid = foreign_key.confrelid
      and target_attribute.attnum = foreign_key.confkey[1]
    where foreign_key.conrelid = pg_catalog.to_regclass(
      pg_catalog.format('public.%I', expected.table_name)
    )
      and foreign_key.conname = expected.constraint_name
      and foreign_key.contype = 'f'
      and target_attribute.attname = expected.target_column
  ),
  pg_catalog.format(
    '%s|%s|%s',
    expected.local_column,
    expected.target_table,
    expected.delete_action
  ),
  pg_catalog.format(
    '%s.%s references %s.%s with the exact delete action',
    expected.table_name,
    expected.local_column,
    expected.target_table,
    expected.target_column
  )
)
from expected;

select ok(
  (
    select index_definition.indexdef ~
      'UNIQUE.*\(user_id\) WHERE \(is_default = true\)$'
    from pg_catalog.pg_indexes as index_definition
    where index_definition.schemaname = 'public'
      and index_definition.indexname = 'watchlists_one_default_per_user'
  ),
  'watchlists has one default row per user through a partial unique index'
);
select ok(
  (
    select index_definition.indexdef ~ '\(user_id, status, due_at\)$'
    from pg_catalog.pg_indexes as index_definition
    where index_definition.schemaname = 'public'
      and index_definition.indexname = 'user_tasks_user_status_due_at_idx'
  ),
  'user_tasks has the required owner, status, and due-time index'
);
select ok(
  (
    select count(*) = 7
      and count(*) filter (where foreign_key.confdeltype = 'c') = 6
      and count(*) filter (
        where foreign_key.confdeltype = 'n'
          and foreign_key.conrelid = 'public.user_tasks'::regclass
          and foreign_key.confrelid = 'public.projects'::regclass
      ) = 1
    from pg_catalog.pg_constraint as foreign_key
    where foreign_key.contype = 'f'
      and foreign_key.conrelid = any(
        array[
          'public.watchlists'::regclass,
          'public.watchlist_projects'::regclass,
          'public.user_projects'::regclass,
          'public.user_tasks'::regclass
        ]
      )
  ),
  'execution foreign keys cascade private ownership and attachments while task project deletion sets null'
);

select ok(
  coalesce(
    (
      select pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
        and procedure.prosecdef
        and procedure.provolatile = 'v'
        and procedure.proconfig @> array['search_path=pg_catalog, public']::text[]
        and procedure.prorettype = 'public.user_tasks'::regtype
        and procedure.proargnames = array['task_id', 'expected_version', 'patch']::text[]
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'public.update_user_task(uuid,bigint,jsonb)'
      )
    ),
    false
  ),
  'update_user_task has the controlled owner, fixed search path, signature, return type, and security mode'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.update_user_task(uuid,bigint,jsonb)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'public.update_user_task(uuid,bigint,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'service_role',
      'public.update_user_task(uuid,bigint,jsonb)',
      'EXECUTE'
    ),
  'only authenticated browser users can execute the versioned task command'
);
select ok(
  has_table_privilege('authenticated', 'public.watchlists', 'SELECT')
    and has_table_privilege('authenticated', 'public.watchlist_projects', 'SELECT')
    and has_table_privilege('authenticated', 'public.user_projects', 'SELECT')
    and has_table_privilege('authenticated', 'public.user_tasks', 'SELECT')
    and not has_table_privilege('anon', 'public.watchlists', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon', 'public.watchlist_projects', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon', 'public.user_projects', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon', 'public.user_tasks', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('service_role', 'public.watchlists', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('service_role', 'public.watchlist_projects', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('service_role', 'public.user_projects', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('service_role', 'public.user_tasks', 'SELECT,INSERT,UPDATE,DELETE'),
  'table grants expose private execution records only to authenticated owners subject to RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.watchlists', 'SELECT')
    and not has_any_column_privilege('authenticated', 'public.watchlists', 'INSERT,UPDATE')
    and not has_any_column_privilege('authenticated', 'public.user_projects', 'INSERT,UPDATE')
    and not has_any_column_privilege('authenticated', 'public.user_tasks', 'INSERT,UPDATE')
    and not has_any_column_privilege('authenticated', 'public.watchlist_projects', 'INSERT,UPDATE'),
  'commands own every write, so authenticated holds read-only grants on execution tables'
);

with expected(table_name, privilege_vector) as (
  values
    ('watchlists', 't|f|f|f|f|f|f'),
    ('watchlist_projects', 't|f|f|f|f|f|f'),
    ('user_projects', 't|f|f|f|f|f|f'),
    ('user_tasks', 't|f|f|f|f|f|f')
)
select is(
  pg_catalog.format(
    '%s|%s|%s|%s|%s|%s|%s',
    has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.table_name),
      'SELECT'
    ),
    has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.table_name),
      'INSERT'
    ),
    has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.table_name),
      'UPDATE'
    ),
    has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.table_name),
      'DELETE'
    ),
    has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.table_name),
      'TRUNCATE'
    ),
    has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.table_name),
      'REFERENCES'
    ),
    has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.table_name),
      'TRIGGER'
    )
  ),
  expected.privilege_vector,
  pg_catalog.format(
    'authenticated has the exact table ACL on public.%s',
    expected.table_name
  )
)
from expected;

with expected(table_name, column_name, privilege_vector) as (
  values
    ('watchlists', 'id', 't|f|f|f'),
    ('watchlists', 'user_id', 't|t|f|f'),
    ('watchlists', 'name', 't|t|t|f'),
    ('watchlists', 'is_default', 't|t|t|f'),
    ('watchlists', 'created_at', 't|f|f|f'),
    ('watchlists', 'updated_at', 't|f|f|f'),
    ('watchlist_projects', 'watchlist_id', 't|t|f|f'),
    ('watchlist_projects', 'project_id', 't|t|f|f'),
    ('watchlist_projects', 'added_at', 't|f|f|f'),
    ('user_projects', 'user_id', 't|t|f|f'),
    ('user_projects', 'project_id', 't|t|f|f'),
    ('user_projects', 'participation_status', 't|t|t|f'),
    ('user_projects', 'notes', 't|t|t|f'),
    ('user_projects', 'started_at', 't|t|t|f'),
    ('user_projects', 'updated_at', 't|f|f|f'),
    ('user_tasks', 'id', 't|f|f|f'),
    ('user_tasks', 'user_id', 't|t|f|f'),
    ('user_tasks', 'project_id', 't|t|f|f'),
    ('user_tasks', 'title', 't|t|f|f'),
    ('user_tasks', 'status', 't|t|f|f'),
    ('user_tasks', 'priority', 't|t|f|f'),
    ('user_tasks', 'due_at', 't|t|f|f'),
    ('user_tasks', 'completed_at', 't|t|f|f'),
    ('user_tasks', 'version', 't|f|f|f'),
    ('user_tasks', 'created_at', 't|f|f|f'),
    ('user_tasks', 'updated_at', 't|f|f|f')
)
select is(
  pg_catalog.format(
    '%s|%s|%s|%s',
    has_column_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.table_name),
      expected.column_name,
      'SELECT'
    ),
    has_column_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.table_name),
      expected.column_name,
      'INSERT'
    ),
    has_column_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.table_name),
      expected.column_name,
      'UPDATE'
    ),
    has_column_privilege(
      'authenticated',
      pg_catalog.format('public.%I', expected.table_name),
      expected.column_name,
      'REFERENCES'
    )
  ),
  expected.privilege_vector,
  pg_catalog.format(
    'authenticated has the exact column ACL on public.%s.%s',
    expected.table_name,
    expected.column_name
  )
)
from expected;
select ok(
  (
    select count(*) = 4
      and pg_catalog.bool_and(
        case policy.polcmd
          when 'r' then policy.polqual is not null and policy.polwithcheck is null
          when 'a' then policy.polqual is null and policy.polwithcheck is not null
          when 'w' then policy.polqual is not null and policy.polwithcheck is not null
          when 'd' then policy.polqual is not null and policy.polwithcheck is null
          else false
        end
      )
    from pg_catalog.pg_policy as policy
    where policy.polrelid = 'public.watchlists'::regclass
  ),
  'watchlists has operation-specific owner policies with USING and WITH CHECK where applicable'
);
select ok(
  (
    select count(*) = 3
      and pg_catalog.bool_and(
        case policy.polcmd
          when 'r' then policy.polqual is not null and policy.polwithcheck is null
          when 'a' then policy.polqual is null and policy.polwithcheck is not null
          when 'd' then policy.polqual is not null and policy.polwithcheck is null
          else false
        end
      )
    from pg_catalog.pg_policy as policy
    where policy.polrelid = 'public.watchlist_projects'::regclass
  ),
  'watchlist_projects resolves owner policies through its parent and exposes no update path'
);
select ok(
  (
    select count(*) = 4
      and pg_catalog.bool_and(
        case policy.polcmd
          when 'r' then policy.polqual is not null and policy.polwithcheck is null
          when 'a' then policy.polqual is null and policy.polwithcheck is not null
          when 'w' then policy.polqual is not null and policy.polwithcheck is not null
          when 'd' then policy.polqual is not null and policy.polwithcheck is null
          else false
        end
      )
    from pg_catalog.pg_policy as policy
    where policy.polrelid = 'public.user_projects'::regclass
  ),
  'user_projects has operation-specific owner policies with USING and WITH CHECK where applicable'
);
select ok(
  (
    select count(*) = 3
      and pg_catalog.bool_and(
        case policy.polcmd
          when 'r' then policy.polqual is not null and policy.polwithcheck is null
          when 'a' then policy.polqual is null and policy.polwithcheck is not null
          when 'd' then policy.polqual is not null and policy.polwithcheck is null
          else false
        end
      )
    from pg_catalog.pg_policy as policy
    where policy.polrelid = 'public.user_tasks'::regclass
  ),
  'user_tasks has owner read, create, and delete policies while updates use the versioned command'
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
    'execution-owner@example.invalid',
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
    'execution-other@example.invalid',
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
    'execution-admin@example.invalid',
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

insert into public.projects (id, slug, name, lifecycle)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'execution-one', 'Execution One', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'execution-two', 'Execution Two', 'active');

insert into public.watchlists (id, user_id, name, is_default, created_at, updated_at)
values
  (
    'aaaaaaaa-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'Owner Default',
    true,
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  ),
  (
    'bbbbbbbb-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    'Other Default',
    true,
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  ),
  (
    'cccccccc-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    'Admin Default',
    true,
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  );

insert into public.watchlist_projects (watchlist_id, project_id, added_at)
values
  (
    'aaaaaaaa-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-08-09 01:00:00+00'
  ),
  (
    'bbbbbbbb-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-08-09 01:00:00+00'
  ),
  (
    'cccccccc-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-08-09 01:00:00+00'
  );

insert into public.user_projects (
  user_id,
  project_id,
  participation_status,
  notes,
  started_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'researching',
    'Owner private notes',
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'participating',
    'Other private notes',
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'paused',
    'Admin private notes',
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  );

insert into public.user_tasks (
  id,
  user_id,
  project_id,
  title,
  status,
  priority,
  due_at,
  completed_at,
  version,
  created_at,
  updated_at
)
values
  (
    'dddddddd-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'Owner task',
    'in_progress',
    'high',
    '2026-08-10 00:00:00+00',
    null,
    1,
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  ),
  (
    'dddddddd-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    null,
    'Other task',
    'backlog',
    'medium',
    null,
    null,
    1,
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  ),
  (
    'dddddddd-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    null,
    'Admin task',
    'backlog',
    'low',
    null,
    null,
    1,
    '2026-08-09 01:00:00+00',
    '2026-08-09 01:00:00+00'
  );

create temporary table task_update_snapshot (
  updated_at timestamptz not null
) on commit drop;

create temporary table captured_task_error (
  sqlstate text not null,
  message text not null,
  detail text null
) on commit drop;

grant select, insert on table task_update_snapshot, captured_task_error to authenticated;

select is(
  (
    select pg_catalog.format('%s|%s', is_default, created_at = updated_at)
    from public.watchlists
    where id = 'aaaaaaaa-1111-4111-8111-111111111111'
  ),
  't|t',
  'watchlists retain explicit defaults and timestamps'
);
select is(
  (
    select pg_catalog.format(
      '%s|%s|%s',
      participation_status::text,
      notes,
      updated_at is not null
    )
    from public.user_projects
    where user_id = '11111111-1111-4111-8111-111111111111'
      and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'researching|Owner private notes|t',
  'user projects retain tracking state, private notes, and timestamps'
);
select is(
  (
    select pg_catalog.format('%s|%s|%s', status::text, priority::text, version)
    from public.user_tasks
    where id = 'dddddddd-1111-4111-8111-111111111111'
  ),
  'in_progress|high|1',
  'user tasks retain contract enums and begin at a positive version'
);

select throws_like(
  $sql$insert into public.watchlists (user_id, name) values ('11111111-1111-4111-8111-111111111111', '')$sql$,
  '%watchlists_name_valid%',
  'watchlist names reject empty text'
);
select throws_like(
  $sql$insert into public.watchlists (user_id, name) values ('11111111-1111-4111-8111-111111111111', ' Padded')$sql$,
  '%watchlists_name_valid%',
  'watchlist names must already be trimmed'
);
select throws_like(
  $sql$insert into public.watchlists (user_id, name) values ('11111111-1111-4111-8111-111111111111', repeat('n', 81))$sql$,
  '%watchlists_name_valid%',
  'watchlist names reject values longer than 80 characters'
);
select throws_like(
  $sql$insert into public.watchlists (user_id, name) values ('11111111-1111-4111-8111-111111111111', 'Owner Default')$sql$,
  '%watchlists_user_id_name_key%',
  'watchlist names are unique per owner'
);
select throws_like(
  $sql$insert into public.watchlists (user_id, name, is_default) values ('11111111-1111-4111-8111-111111111111', 'Second Default', true)$sql$,
  '%watchlists_one_default_per_user%',
  'an owner cannot create a second default watchlist'
);
select lives_ok(
  $sql$insert into public.watchlists (user_id, name, is_default) values ('11111111-1111-4111-8111-111111111111', 'Not Default', false)$sql$,
  'an owner can create additional non-default watchlists'
);

select throws_like(
  $sql$insert into public.user_projects (user_id, project_id, notes) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', repeat('n', 4001))$sql$,
  '%user_projects_notes_valid%',
  'user project notes reject values longer than 4000 characters'
);
select throws_like(
  $sql$insert into public.user_tasks (user_id, title) values ('11111111-1111-4111-8111-111111111111', '')$sql$,
  '%user_tasks_title_valid%',
  'task titles reject empty text'
);
select throws_like(
  $sql$insert into public.user_tasks (user_id, title) values ('11111111-1111-4111-8111-111111111111', ' Padded')$sql$,
  '%user_tasks_title_valid%',
  'task titles must already be trimmed'
);
select throws_like(
  $sql$insert into public.user_tasks (user_id, title) values ('11111111-1111-4111-8111-111111111111', repeat('t', 201))$sql$,
  '%user_tasks_title_valid%',
  'task titles reject values longer than 200 characters'
);
select throws_like(
  $sql$insert into public.user_tasks (user_id, title, version) values ('11111111-1111-4111-8111-111111111111', 'Invalid version', 0)$sql$,
  '%user_tasks_version_positive%',
  'task versions must be positive'
);
select throws_like(
  $sql$insert into public.user_tasks (user_id, title, status) values ('11111111-1111-4111-8111-111111111111', 'Missing completion time', 'completed')$sql$,
  '%user_tasks_completed_at_matches_status%',
  'completed tasks require completed_at'
);
select throws_like(
  $sql$insert into public.user_tasks (user_id, title, status, completed_at) values ('11111111-1111-4111-8111-111111111111', 'Unexpected completion time', 'planned', '2026-08-09 02:00:00+00')$sql$,
  '%user_tasks_completed_at_matches_status%',
  'non-completed tasks reject completed_at'
);
select lives_ok(
  $sql$insert into public.user_tasks (user_id, title, status, completed_at) values ('11111111-1111-4111-8111-111111111111', 'Completed correctly', 'completed', '2026-08-09 02:00:00+00')$sql$,
  'completed tasks accept a completion timestamp'
);
select lives_ok(
  $sql$insert into public.user_tasks (user_id, title, status) values ('11111111-1111-4111-8111-111111111111', 'Incomplete correctly', 'planned')$sql$,
  'non-completed tasks accept a null completion timestamp'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_like(
  $$select * from public.watchlists$$,
  'permission denied for table watchlists',
  'anonymous users cannot read watchlists'
);
select throws_like(
  $$select * from public.watchlist_projects$$,
  'permission denied for table watchlist_projects',
  'anonymous users cannot read watchlist projects'
);
select throws_like(
  $$select * from public.user_projects$$,
  'permission denied for table user_projects',
  'anonymous users cannot read user project tracking or notes'
);
select throws_like(
  $$select * from public.user_tasks$$,
  'permission denied for table user_tasks',
  'anonymous users cannot read user tasks'
);
select throws_like(
  $$select public.update_user_task('dddddddd-1111-4111-8111-111111111111', 1, '{}'::jsonb)$$,
  'permission denied for function update_user_task',
  'anonymous users cannot execute the task update command'
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
  $$select name from public.watchlists order by name$$,
  $$values ('Not Default'::text), ('Owner Default'::text)$$,
  'an owner reads only their watchlists'
);
select lives_ok(
  $$insert into public.watchlists (user_id, name) values ('11111111-1111-4111-8111-111111111111', 'Temporary Watchlist')$$,
  'an owner can create a watchlist'
);
select lives_ok(
  $$update public.watchlists set name = 'Renamed Watchlist' where name = 'Temporary Watchlist'$$,
  'an owner can update a watchlist'
);
select lives_ok(
  $$delete from public.watchlists where name = 'Renamed Watchlist'$$,
  'an owner can delete a watchlist'
);
select throws_like(
  $$insert into public.watchlists (user_id, name) values ('22222222-2222-4222-8222-222222222222', 'Cross-owner Watchlist')$$,
  '%new row violates row-level security policy for table "watchlists"%',
  'an owner cannot create a watchlist for another user'
);
select throws_like(
  $$update public.watchlists set user_id = '22222222-2222-4222-8222-222222222222' where id = 'aaaaaaaa-1111-4111-8111-111111111111'$$,
  'permission denied for table watchlists',
  'watchlist ownership is immutable'
);
select results_eq(
  $sql$
    with changed as (
      update public.watchlists
      set name = 'Hidden rewrite'
      where id = 'bbbbbbbb-2222-4222-8222-222222222222'
      returning 1
    )
    select count(*)::bigint from changed
  $sql$,
  $$values (0::bigint)$$,
  'an owner cannot update another user watchlist'
);

select results_eq(
  $$select watchlist_id, project_id from public.watchlist_projects order by watchlist_id, project_id$$,
  $sql$
    values (
      'aaaaaaaa-1111-4111-8111-111111111111'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
    )
  $sql$,
  'an owner reads only projects in their watchlists'
);
select lives_ok(
  $sql$
    insert into public.watchlist_projects (watchlist_id, project_id)
    values (
      'aaaaaaaa-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    )
  $sql$,
  'an owner can attach a project to their watchlist'
);
select lives_ok(
  $sql$
    delete from public.watchlist_projects
    where watchlist_id = 'aaaaaaaa-1111-4111-8111-111111111111'
      and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
  $sql$,
  'an owner can remove a project from their watchlist'
);
select throws_like(
  $sql$
    insert into public.watchlist_projects (watchlist_id, project_id)
    values (
      'bbbbbbbb-2222-4222-8222-222222222222',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    )
  $sql$,
  '%new row violates row-level security policy for table "watchlist_projects"%',
  'an owner cannot attach a project to another user watchlist'
);
select throws_like(
  $$update public.watchlist_projects set watchlist_id = 'bbbbbbbb-2222-4222-8222-222222222222' where watchlist_id = 'aaaaaaaa-1111-4111-8111-111111111111'$$,
  'permission denied for table watchlist_projects',
  'watchlist project ownership cannot be moved through a direct update'
);
select results_eq(
  $sql$
    with deleted as (
      delete from public.watchlist_projects
      where watchlist_id = 'bbbbbbbb-2222-4222-8222-222222222222'
        and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      returning 1
    )
    select count(*)::bigint from deleted
  $sql$,
  $$values (0::bigint)$$,
  'an owner cannot delete another user watchlist child'
);

select results_eq(
  $$select project_id, notes from public.user_projects order by project_id$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 'Owner private notes'::text)$$,
  'an owner reads only their project tracking and private notes'
);
select lives_ok(
  $sql$
    insert into public.user_projects (user_id, project_id, participation_status, notes)
    values (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'interested',
      'Temporary notes'
    )
  $sql$,
  'an owner can create user project tracking'
);
select lives_ok(
  $sql$
    update public.user_projects
    set participation_status = 'participating', notes = 'Updated notes'
    where user_id = '11111111-1111-4111-8111-111111111111'
      and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
  $sql$,
  'an owner can update user project tracking'
);
select lives_ok(
  $sql$
    delete from public.user_projects
    where user_id = '11111111-1111-4111-8111-111111111111'
      and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
  $sql$,
  'an owner can delete user project tracking'
);
select throws_like(
  $sql$
    insert into public.user_projects (user_id, project_id)
    values (
      '22222222-2222-4222-8222-222222222222',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    )
  $sql$,
  '%new row violates row-level security policy for table "user_projects"%',
  'an owner cannot create project tracking for another user'
);
select throws_like(
  $$update public.user_projects set user_id = '22222222-2222-4222-8222-222222222222' where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  'permission denied for table user_projects',
  'user project ownership is immutable'
);
select throws_like(
  $$update public.user_projects set project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  'permission denied for table user_projects',
  'user project identity cannot be moved to another project'
);
select results_eq(
  $sql$
    with changed as (
      update public.user_projects
      set notes = 'Hidden rewrite'
      where user_id = '22222222-2222-4222-8222-222222222222'
      returning 1
    )
    select count(*)::bigint from changed
  $sql$,
  $$values (0::bigint)$$,
  'an owner cannot update another user project or its notes'
);

select results_eq(
  $$select title from public.user_tasks order by title$$,
  $$values ('Completed correctly'::text), ('Incomplete correctly'::text), ('Owner task'::text)$$,
  'an owner reads only their tasks'
);
select lives_ok(
  $$insert into public.user_tasks (user_id, title) values ('11111111-1111-4111-8111-111111111111', 'Temporary task')$$,
  'an owner can create a task'
);
select lives_ok(
  $$delete from public.user_tasks where title = 'Temporary task'$$,
  'an owner can delete a task'
);
select throws_like(
  $$insert into public.user_tasks (user_id, title) values ('22222222-2222-4222-8222-222222222222', 'Cross-owner task')$$,
  '%new row violates row-level security policy for table "user_tasks"%',
  'an owner cannot create a task for another user'
);
select throws_like(
  $$update public.user_tasks set title = 'Direct rewrite' where id = 'dddddddd-1111-4111-8111-111111111111'$$,
  'permission denied for table user_tasks',
  'direct task updates are closed in favor of the versioned command'
);

select lives_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      1,
      '{"project_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","title":"Owner task completed","status":"completed","priority":"urgent","due_at":null,"completed_at":"2026-08-09T03:00:00Z"}'::jsonb
    )
  $sql$,
  'the owner can atomically update every allowed task field with the expected version'
);
select is(
  (
    select pg_catalog.format(
      '%s|%s|%s|%s|%s|%s',
      project_id,
      title,
      status::text,
      priority::text,
      due_at is null,
      completed_at
    )
    from public.user_tasks
    where id = 'dddddddd-1111-4111-8111-111111111111'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2|Owner task completed|completed|urgent|t|2026-08-09 03:00:00+00',
  'the task update command persists exactly the allowed patch fields'
);
select is(
  (
    select version
    from public.user_tasks
    where id = 'dddddddd-1111-4111-8111-111111111111'
  ),
  2::bigint,
  'a material task update increments version exactly once'
);
select ok(
  (
    select updated_at > '2026-08-09 01:00:00+00'::timestamptz
    from public.user_tasks
    where id = 'dddddddd-1111-4111-8111-111111111111'
  ),
  'a material task update advances updated_at'
);

insert into task_update_snapshot (updated_at)
select updated_at
from public.user_tasks
where id = 'dddddddd-1111-4111-8111-111111111111';

do $capture$
declare
  captured_sqlstate text;
  captured_message text;
  captured_detail text;
begin
  begin
    perform public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      1,
      '{"title":"Stale rewrite"}'::jsonb
    );
  exception
    when others then
      get stacked diagnostics
        captured_sqlstate = returned_sqlstate,
        captured_message = message_text,
        captured_detail = pg_exception_detail;

      insert into captured_task_error (sqlstate, message, detail)
      values (captured_sqlstate, captured_message, captured_detail);
  end;
end
$capture$;

select is(
  (select sqlstate from captured_task_error),
  'PT409',
  'a stale task update returns the stable HTTP-conflict SQLSTATE'
);
select is(
  (select message from captured_task_error),
  'user_task_version_conflict',
  'a stale task update returns the stable conflict message'
);
select is(
  (select detail from captured_task_error),
  'expected_version=1,current_version=2',
  'a stale task update returns stable expected and current version detail'
);
select is(
  (
    select title
    from public.user_tasks
    where id = 'dddddddd-1111-4111-8111-111111111111'
  ),
  'Owner task completed',
  'a stale task update leaves task state unchanged'
);

select lives_ok(
  $$select public.update_user_task('dddddddd-1111-4111-8111-111111111111', 2, '{}'::jsonb)$$,
  'an empty patch is an accepted no-op'
);
select is(
  (
    select version
    from public.user_tasks
    where id = 'dddddddd-1111-4111-8111-111111111111'
  ),
  2::bigint,
  'an empty patch does not increment task version'
);
select lives_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      2,
      '{"title":"Owner task completed"}'::jsonb
    )
  $sql$,
  'a patch equal to stored values is an accepted no-op'
);
select is(
  (
    select version
    from public.user_tasks
    where id = 'dddddddd-1111-4111-8111-111111111111'
  ),
  2::bigint,
  'a value-equivalent patch does not increment task version'
);
select is(
  (
    select updated_at
    from public.user_tasks
    where id = 'dddddddd-1111-4111-8111-111111111111'
  ),
  (
    select updated_at from task_update_snapshot
  ),
  'no-op task patches retain the stored update timestamp'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

create temporary table invalid_patch_cases (
  case_order integer generated by default as identity primary key,
  task_id uuid not null default gen_random_uuid(),
  patch jsonb not null,
  description text not null
) on commit drop;

insert into invalid_patch_cases (patch, description)
values
  ('{"title":null}', 'title rejects JSON null'),
  ('{"title":0}', 'title rejects JSON numbers'),
  ('{"title":true}', 'title rejects JSON booleans'),
  ('{"title":{}}', 'title rejects JSON objects'),
  ('{"title":[]}', 'title rejects JSON arrays'),
  ('{"status":null}', 'status rejects JSON null'),
  ('{"status":0}', 'status rejects JSON numbers'),
  ('{"status":true}', 'status rejects JSON booleans'),
  ('{"status":{}}', 'status rejects JSON objects'),
  ('{"status":[]}', 'status rejects JSON arrays'),
  ('{"priority":null}', 'priority rejects JSON null'),
  ('{"priority":0}', 'priority rejects JSON numbers'),
  ('{"priority":true}', 'priority rejects JSON booleans'),
  ('{"priority":{}}', 'priority rejects JSON objects'),
  ('{"priority":[]}', 'priority rejects JSON arrays'),
  ('{"project_id":0}', 'project_id rejects JSON numbers'),
  ('{"project_id":true}', 'project_id rejects JSON booleans'),
  ('{"project_id":{}}', 'project_id rejects JSON objects'),
  ('{"project_id":[]}', 'project_id rejects JSON arrays'),
  ('{"due_at":0}', 'due_at rejects JSON numbers'),
  ('{"due_at":true}', 'due_at rejects JSON booleans'),
  ('{"due_at":{}}', 'due_at rejects JSON objects'),
  ('{"due_at":[]}', 'due_at rejects JSON arrays'),
  ('{"completed_at":0}', 'completed_at rejects JSON numbers'),
  ('{"completed_at":true}', 'completed_at rejects JSON booleans'),
  ('{"completed_at":{}}', 'completed_at rejects JSON objects'),
  ('{"completed_at":[]}', 'completed_at rejects JSON arrays'),
  ('{"project_id":"not-a-uuid"}', 'project_id normalizes invalid UUID strings'),
  ('{"status":"not-a-status"}', 'status normalizes invalid enum strings'),
  ('{"priority":"not-a-priority"}', 'priority normalizes invalid enum strings'),
  ('{"due_at":"not-a-timestamp"}', 'due_at normalizes invalid timestamp strings'),
  (
    '{"completed_at":"not-a-timestamp"}',
    'completed_at normalizes invalid timestamp strings'
  );

insert into public.user_tasks (id, user_id, title)
select
  invalid_case.task_id,
  '11111111-1111-4111-8111-111111111111',
  pg_catalog.format('Patch contract case %s', invalid_case.case_order)
from invalid_patch_cases as invalid_case;

insert into public.user_tasks (
  id,
  user_id,
  project_id,
  title,
  due_at,
  status,
  completed_at,
  version,
  created_at,
  updated_at
)
values
  (
    'eeeeeeee-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'Clear nullable project',
    null,
    'backlog',
    null,
    1,
    '2026-08-09 04:00:00+00',
    '2026-08-09 04:00:00+00'
  ),
  (
    'eeeeeeee-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    null,
    'Clear nullable due time',
    '2026-08-11 00:00:00+00',
    'planned',
    null,
    1,
    '2026-08-09 04:00:00+00',
    '2026-08-09 04:00:00+00'
  ),
  (
    'eeeeeeee-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111',
    null,
    'Clear completion transition',
    null,
    'completed',
    '2026-08-09 04:00:00+00',
    1,
    '2026-08-09 04:00:00+00',
    '2026-08-09 04:00:00+00'
  ),
  (
    'eeeeeeee-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    null,
    'Maximum version task',
    null,
    'backlog',
    null,
    9223372036854775807,
    '2026-08-09 04:00:00+00',
    '2026-08-09 04:00:00+00'
  );

create temporary table not_found_error_capture (
  case_name text primary key,
  sqlstate text not null,
  message text not null,
  detail text null
) on commit drop;

grant select on table invalid_patch_cases to authenticated;
grant select, insert on table not_found_error_capture to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select throws_ok(
  pg_catalog.format(
    'select public.update_user_task(%L::uuid, 1, %L::jsonb)',
    invalid_case.task_id,
    invalid_case.patch::text
  ),
  '22023',
  'user_task_patch_invalid',
  invalid_case.description
)
from invalid_patch_cases as invalid_case
order by invalid_case.case_order;

select lives_ok(
  $sql$
    select public.update_user_task(
      'eeeeeeee-1111-4111-8111-111111111111',
      1,
      '{"project_id":null}'::jsonb
    )
  $sql$,
  'project_id accepts JSON null to clear a nullable reference'
);
select is(
  (
    select pg_catalog.format('%s|%s', project_id is null, version)
    from public.user_tasks
    where id = 'eeeeeeee-1111-4111-8111-111111111111'
  ),
  't|2',
  'clearing project_id persists null and increments version once'
);
select lives_ok(
  $sql$
    select public.update_user_task(
      'eeeeeeee-2222-4222-8222-222222222222',
      1,
      '{"due_at":null}'::jsonb
    )
  $sql$,
  'due_at accepts JSON null to clear a nullable timestamp'
);
select is(
  (
    select pg_catalog.format('%s|%s', due_at is null, version)
    from public.user_tasks
    where id = 'eeeeeeee-2222-4222-8222-222222222222'
  ),
  't|2',
  'clearing due_at persists null and increments version once'
);
select lives_ok(
  $sql$
    select public.update_user_task(
      'eeeeeeee-3333-4333-8333-333333333333',
      1,
      '{"status":"planned","completed_at":null}'::jsonb
    )
  $sql$,
  'completed_at accepts JSON null when leaving completed status'
);
select is(
  (
    select pg_catalog.format('%s|%s|%s', status::text, completed_at is null, version)
    from public.user_tasks
    where id = 'eeeeeeee-3333-4333-8333-333333333333'
  ),
  'planned|t|2',
  'completed to non-completed transition clears completed_at atomically'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'eeeeeeee-4444-4444-8444-444444444444',
      9223372036854775807,
      '{"title":"Overflow rewrite"}'::jsonb
    )
  $sql$,
  '22003',
  'bigint out of range',
  'a material update at maximum bigint version fails closed'
);
select is(
  (
    select pg_catalog.format('%s|%s|%s', title, version, updated_at)
    from public.user_tasks
    where id = 'eeeeeeee-4444-4444-8444-444444444444'
  ),
  'Maximum version task|9223372036854775807|2026-08-09 04:00:00+00',
  'version overflow rolls back business fields, version, and updated_at'
);

select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      2,
      '{"notes":"not allowed"}'::jsonb
    )
  $sql$,
  '22023',
  'user_task_patch_invalid',
  'the task update command rejects unknown patch fields with a stable error'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      2,
      '{"user_id":"22222222-2222-4222-8222-222222222222"}'::jsonb
    )
  $sql$,
  '22023',
  'user_task_patch_invalid',
  'the task update command rejects ownership fields'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      2,
      '{"id":"dddddddd-9999-4999-8999-999999999999"}'::jsonb
    )
  $sql$,
  '22023',
  'user_task_patch_invalid',
  'the task update command rejects identity fields'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      2,
      '{"version":99}'::jsonb
    )
  $sql$,
  '22023',
  'user_task_patch_invalid',
  'the task update command rejects version fields'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      2,
      '{"updated_at":"2099-01-01T00:00:00Z"}'::jsonb
    )
  $sql$,
  '22023',
  'user_task_patch_invalid',
  'the task update command rejects system timestamp fields'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      2,
      '[]'::jsonb
    )
  $sql$,
  '22023',
  'user_task_patch_invalid',
  'the task update command rejects non-object patches'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      2,
      null::jsonb
    )
  $sql$,
  '22023',
  'user_task_patch_invalid',
  'the task update command rejects a SQL NULL patch'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      null,
      '{}'::jsonb
    )
  $sql$,
  '22023',
  'user_task_expected_version_invalid',
  'the task update command rejects a null expected version'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      0,
      '{}'::jsonb
    )
  $sql$,
  '22023',
  'user_task_expected_version_invalid',
  'the task update command rejects expected version zero'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      -1,
      '{}'::jsonb
    )
  $sql$,
  '22023',
  'user_task_expected_version_invalid',
  'the task update command rejects negative expected versions'
);
select throws_like(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      2,
      '{"status":"planned"}'::jsonb
    )
  $sql$,
  '%user_tasks_completed_at_matches_status%',
  'the task update command preserves the completed timestamp invariant on transition'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-2222-4222-8222-222222222222',
      1,
      '{"title":"Cross-owner rewrite"}'::jsonb
    )
  $sql$,
  'PT404',
  'user_task_not_found',
  'the task update command cannot update another owner task'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-9999-4999-8999-999999999999',
      1,
      '{"title":"Missing rewrite"}'::jsonb
    )
  $sql$,
  'PT404',
  'user_task_not_found',
  'the task update command returns the same not-found error for a missing task'
);

do $capture_not_found$
declare
  captured_sqlstate text;
  captured_message text;
  captured_detail text;
begin
  begin
    perform public.update_user_task(
      'dddddddd-2222-4222-8222-222222222222',
      1,
      '{"title":"Cross-owner detail probe"}'::jsonb
    );
  exception
    when others then
      get stacked diagnostics
        captured_sqlstate = returned_sqlstate,
        captured_message = message_text,
        captured_detail = pg_exception_detail;

      insert into not_found_error_capture (case_name, sqlstate, message, detail)
      values ('cross_owner', captured_sqlstate, captured_message, captured_detail);
  end;

  begin
    perform public.update_user_task(
      'dddddddd-9999-4999-8999-999999999999',
      1,
      '{"title":"Missing detail probe"}'::jsonb
    );
  exception
    when others then
      get stacked diagnostics
        captured_sqlstate = returned_sqlstate,
        captured_message = message_text,
        captured_detail = pg_exception_detail;

      insert into not_found_error_capture (case_name, sqlstate, message, detail)
      values ('missing', captured_sqlstate, captured_message, captured_detail);
  end;
end
$capture_not_found$;

select is(
  (select pg_catalog.array_agg(sqlstate order by case_name) from not_found_error_capture),
  array['PT404', 'PT404']::text[],
  'cross-owner and missing tasks return the same not-found SQLSTATE'
);
select is(
  (select pg_catalog.array_agg(message order by case_name) from not_found_error_capture),
  array['user_task_not_found', 'user_task_not_found']::text[],
  'cross-owner and missing tasks return the same not-found message'
);
select is(
  (select pg_catalog.array_agg(detail order by case_name) from not_found_error_capture),
  array['task_not_found_or_not_owned', 'task_not_found_or_not_owned']::text[],
  'cross-owner and missing tasks return the same non-enumerating detail'
);

select results_eq(
  $sql$
    with deleted as (
      delete from public.user_tasks
      where id = 'dddddddd-2222-4222-8222-222222222222'
      returning 1
    )
    select count(*)::bigint from deleted
  $sql$,
  $$values (0::bigint)$$,
  'an owner cannot delete another user task'
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
  $$select name from public.watchlists order by name$$,
  $$values ('Admin Default'::text)$$,
  'a browser admin reads only their own watchlists'
);
select results_eq(
  $$select watchlist_id from public.watchlist_projects order by watchlist_id$$,
  $$values ('cccccccc-3333-4333-8333-333333333333'::uuid)$$,
  'a browser admin reads only their own watchlist projects'
);
select results_eq(
  $$select notes from public.user_projects order by notes$$,
  $$values ('Admin private notes'::text)$$,
  'a browser admin cannot read another user private notes'
);
select results_eq(
  $$select title from public.user_tasks order by title$$,
  $$values ('Admin task'::text)$$,
  'a browser admin reads only their own tasks'
);
select throws_like(
  $$insert into public.user_projects (user_id, project_id, notes) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Admin support read is not approved')$$,
  '%new row violates row-level security policy for table "user_projects"%',
  'a browser admin grant does not permit writing another user private records'
);
select throws_ok(
  $sql$
    select public.update_user_task(
      'dddddddd-1111-4111-8111-111111111111',
      2,
      '{"title":"Admin rewrite"}'::jsonb
    )
  $sql$,
  'PT404',
  'user_task_not_found',
  'a browser admin cannot update another user task'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_like(
  $$select * from public.watchlists$$,
  'permission denied for table watchlists',
  'service role has no unapproved support read of watchlists'
);
select throws_like(
  $$select * from public.watchlist_projects$$,
  'permission denied for table watchlist_projects',
  'service role has no unapproved support read of watchlist projects'
);
select throws_like(
  $$select * from public.user_projects$$,
  'permission denied for table user_projects',
  'service role has no unapproved support read of private notes'
);
select throws_like(
  $$select * from public.user_tasks$$,
  'permission denied for table user_tasks',
  'service role has no unapproved support read of tasks'
);
select throws_like(
  $$insert into public.watchlists (user_id, name) values ('11111111-1111-4111-8111-111111111111', 'Service write')$$,
  'permission denied for table watchlists',
  'service role cannot write private execution records'
);
select throws_like(
  $$select public.update_user_task('dddddddd-1111-4111-8111-111111111111', 2, '{}'::jsonb)$$,
  'permission denied for function update_user_task',
  'service role cannot execute the private task update command'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

select * from finish();

rollback;
