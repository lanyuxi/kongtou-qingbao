begin;

select no_plan();

select results_eq(
  $$
    select enum_type.typname::text collate "C", enum_value.enumlabel::text collate "C"
    from pg_catalog.pg_type as enum_type
    join pg_catalog.pg_enum as enum_value on enum_value.enumtypid = enum_type.oid
    join pg_catalog.pg_namespace as namespace on namespace.oid = enum_type.typnamespace
    where namespace.nspname = 'public'
      and enum_type.typname in (
        'durable_job_state', 'durable_job_event_type', 'source_schedule_command_type',
        'source_schedule_event_type', 'collection_job_trigger', 'source_schedule_origin'
      )
    order by enum_type.typname, enum_value.enumsortorder
  $$,
  $$
    select expected.enum_name collate "C", expected.enum_value collate "C"
    from (
      values
        ('collection_job_trigger'::text, 'scheduled'::text),
        ('collection_job_trigger', 'manual'),
        ('durable_job_event_type', 'enqueued'),
        ('durable_job_event_type', 'claimed'),
        ('durable_job_event_type', 'lease_renewed'),
        ('durable_job_event_type', 'lease_expired'),
        ('durable_job_event_type', 'retry_scheduled'),
        ('durable_job_event_type', 'succeeded'),
        ('durable_job_event_type', 'dead_lettered'),
        ('durable_job_event_type', 'canceled'),
        ('durable_job_state', 'queued'),
        ('durable_job_state', 'leased'),
        ('durable_job_state', 'retry_wait'),
        ('durable_job_state', 'succeeded'),
        ('durable_job_state', 'dead_letter'),
        ('durable_job_state', 'canceled'),
        ('source_schedule_command_type', 'pause'),
        ('source_schedule_command_type', 'resume'),
        ('source_schedule_command_type', 'change_interval'),
        ('source_schedule_command_type', 'collect_now'),
        ('source_schedule_event_type', 'auto_created'),
        ('source_schedule_event_type', 'paused'),
        ('source_schedule_event_type', 'resumed'),
        ('source_schedule_event_type', 'interval_changed'),
        ('source_schedule_origin', 'automatic'),
        ('source_schedule_origin', 'manual')
    ) as expected(enum_name, enum_value)
  $$,
  'queue enums have the exact contract values and order'
);

select has_table('public', expected.table_name, pg_catalog.format('%s exists', expected.table_name))
from (
  values
    ('source_collection_schedules'),
    ('source_schedule_commands'),
    ('source_schedule_events'),
    ('durable_jobs'),
    ('durable_job_events')
) as expected(table_name);

select columns_are(
  'public',
  'source_collection_schedules',
  array[
    'id', 'project_id', 'source_id', 'enabled', 'enablement_origin', 'interval_seconds',
    'next_run_at', 'last_enqueued_at', 'version', 'created_at', 'updated_at'
  ],
  'source collection schedules have the exact aggregate columns'
);

select columns_are(
  'public',
  'source_schedule_commands',
  array[
    'id', 'actor_id', 'schedule_id', 'command_type', 'idempotency_key', 'input_hash',
    'expected_version', 'resulting_version', 'result_enabled', 'result_interval_seconds',
    'result_next_run_at', 'job_id', 'created_at'
  ],
  'schedule commands store bounded replay receipts only'
);

select columns_are(
  'public',
  'source_schedule_events',
  array[
    'id', 'schedule_id', 'event_type', 'schedule_version', 'actor_id', 'command_id',
    'occurred_at'
  ],
  'schedule events have the exact append-only history columns'
);

select columns_are(
  'public',
  'durable_jobs',
  array[
    'id', 'job_type', 'contract_version', 'project_id', 'source_id', 'schedule_id',
    'schedule_version', 'collection_rule_version', 'trigger', 'scheduled_for',
    'idempotency_key', 'payload', 'payload_hash', 'state', 'execution_attempt',
    'delivery_count', 'max_attempts', 'available_at', 'lease_owner', 'lease_epoch',
    'lease_expires_at', 'last_result_code', 'last_error_detail', 'version', 'created_at',
    'updated_at', 'completed_at'
  ],
  'durable jobs expose only normalized identity and bounded payload metadata'
);

select columns_are(
  'public',
  'durable_job_events',
  array[
    'id', 'job_id', 'event_type', 'job_state', 'job_version', 'execution_attempt',
    'lease_epoch', 'worker_id', 'result_code', 'detail', 'occurred_at'
  ],
  'durable job events have the exact append-only history columns'
);

select results_eq(
  $$
    select table_name::text collate "C", column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'source_collection_schedules', 'source_schedule_commands',
        'source_schedule_events', 'durable_jobs', 'durable_job_events'
      )
      and is_nullable = 'YES'
    order by table_name, ordinal_position
  $$,
  $$
    select expected.table_name collate "C", expected.column_name collate "C"
    from (values
      ('durable_job_events'::text, 'execution_attempt'::text),
      ('durable_job_events', 'lease_epoch'),
      ('durable_job_events', 'worker_id'),
      ('durable_job_events', 'result_code'),
      ('durable_job_events', 'detail'),
      ('durable_jobs', 'lease_owner'),
      ('durable_jobs', 'lease_expires_at'),
      ('durable_jobs', 'last_result_code'),
      ('durable_jobs', 'last_error_detail'),
      ('durable_jobs', 'completed_at'),
      ('source_collection_schedules', 'last_enqueued_at'),
      ('source_schedule_commands', 'job_id'),
      ('source_schedule_events', 'actor_id'),
      ('source_schedule_events', 'command_id')
    ) as expected(table_name, column_name)
  $$,
  'only explicitly optional queue fields are nullable'
);

select results_eq(
  $$
    select table_name::text collate "C", column_name::text collate "C",
      column_default::text collate "C"
    from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (
        ('source_collection_schedules', 'enabled'),
        ('source_collection_schedules', 'enablement_origin'),
        ('source_collection_schedules', 'interval_seconds'),
        ('source_collection_schedules', 'version'),
        ('durable_jobs', 'job_type'),
        ('durable_jobs', 'contract_version'),
        ('durable_jobs', 'collection_rule_version'),
        ('durable_jobs', 'state'),
        ('durable_jobs', 'execution_attempt'),
        ('durable_jobs', 'delivery_count'),
        ('durable_jobs', 'max_attempts'),
        ('durable_jobs', 'lease_epoch'),
        ('durable_jobs', 'version')
      )
    order by table_name, ordinal_position
  $$,
  $$
    select expected.table_name collate "C", expected.column_name collate "C",
      expected.column_default collate "C"
    from (values
      ('durable_jobs'::text, 'job_type'::text, '''collect.source''::text'::text),
      ('durable_jobs', 'contract_version', '1'),
      ('durable_jobs', 'collection_rule_version', '''collection-v1''::text'),
      ('durable_jobs', 'state', '''queued''::durable_job_state'),
      ('durable_jobs', 'execution_attempt', '0'),
      ('durable_jobs', 'delivery_count', '0'),
      ('durable_jobs', 'max_attempts', '5'),
      ('durable_jobs', 'lease_epoch', '0'),
      ('durable_jobs', 'version', '1'),
      ('source_collection_schedules', 'enabled', 'true'),
      ('source_collection_schedules', 'enablement_origin', '''automatic''::source_schedule_origin'),
      ('source_collection_schedules', 'interval_seconds', '1800'),
      ('source_collection_schedules', 'version', '1')
    ) as expected(table_name, column_name, column_default)
  $$,
  'queue aggregate business defaults are exact and deterministic'
);

select results_eq(
  $$
    select constraint_info.conname::text collate "C",
      pg_catalog.pg_get_constraintdef(constraint_info.oid)::text collate "C"
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.connamespace = 'public'::regnamespace
      and constraint_info.conname in (
        'source_collection_schedules_project_source_fkey',
        'source_schedule_commands_actor_id_fkey',
        'source_schedule_commands_schedule_id_fkey',
        'source_schedule_commands_job_id_fkey',
        'source_schedule_events_schedule_id_fkey',
        'source_schedule_events_actor_id_fkey',
        'source_schedule_events_command_id_fkey',
        'durable_jobs_schedule_identity_fkey',
        'durable_job_events_job_id_fkey'
      )
    order by constraint_info.conname
  $$,
  $$
    select expected.constraint_name collate "C", expected.definition collate "C"
    from (values
      ('durable_job_events_job_id_fkey'::text, 'FOREIGN KEY (job_id) REFERENCES durable_jobs(id) ON DELETE RESTRICT'::text),
      ('durable_jobs_schedule_identity_fkey', 'FOREIGN KEY (schedule_id, project_id, source_id) REFERENCES source_collection_schedules(id, project_id, source_id) ON DELETE RESTRICT'),
      ('source_collection_schedules_project_source_fkey', 'FOREIGN KEY (project_id, source_id) REFERENCES project_sources(project_id, source_id) ON DELETE RESTRICT'),
      ('source_schedule_commands_actor_id_fkey', 'FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE RESTRICT'),
      ('source_schedule_commands_job_id_fkey', 'FOREIGN KEY (job_id) REFERENCES durable_jobs(id) ON DELETE RESTRICT'),
      ('source_schedule_commands_schedule_id_fkey', 'FOREIGN KEY (schedule_id) REFERENCES source_collection_schedules(id) ON DELETE RESTRICT'),
      ('source_schedule_events_actor_id_fkey', 'FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE RESTRICT'),
      ('source_schedule_events_command_id_fkey', 'FOREIGN KEY (command_id) REFERENCES source_schedule_commands(id) ON DELETE RESTRICT'),
      ('source_schedule_events_schedule_id_fkey', 'FOREIGN KEY (schedule_id) REFERENCES source_collection_schedules(id) ON DELETE RESTRICT')
    ) as expected(constraint_name, definition)
  $$,
  'queue foreign keys include the required aggregate-identity fences'
);

select results_eq(
  $$
    select constraint_info.conname::text collate "C",
      pg_catalog.pg_get_constraintdef(constraint_info.oid)::text collate "C"
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.connamespace = 'public'::regnamespace
      and constraint_info.contype = 'u'
      and constraint_info.conname in (
        'source_collection_schedules_project_source_key',
        'source_collection_schedules_identity_key',
        'source_schedule_commands_replay_key',
        'durable_jobs_idempotency_key_key',
        'durable_jobs_scheduled_identity_key'
      )
    order by constraint_info.conname
  $$,
  $$
    select expected.constraint_name collate "C", expected.definition collate "C"
    from (values
      ('durable_jobs_idempotency_key_key'::text, 'UNIQUE (idempotency_key)'::text),
      ('durable_jobs_scheduled_identity_key', 'UNIQUE (project_id, source_id, schedule_id, scheduled_for, schedule_version, collection_rule_version, trigger)'),
      ('source_collection_schedules_identity_key', 'UNIQUE (id, project_id, source_id)'),
      ('source_collection_schedules_project_source_key', 'UNIQUE (project_id, source_id)'),
      ('source_schedule_commands_replay_key', 'UNIQUE (actor_id, schedule_id, idempotency_key)')
    ) as expected(constraint_name, definition)
  $$,
  'schedule and durable-job uniqueness constraints enforce aggregate and replay identity'
);

select results_eq(
  $$
    select index_info.indexname::text collate "C"
    from pg_catalog.pg_indexes as index_info
    where index_info.schemaname = 'public'
      and index_info.indexname in (
        'source_collection_schedules_due_idx',
        'source_schedule_commands_schedule_created_idx',
        'source_schedule_events_schedule_occurred_idx',
        'durable_jobs_runnable_idx',
        'durable_jobs_expired_lease_idx',
        'durable_job_events_job_occurred_idx'
      )
    order by index_info.indexname
  $$,
  $$
    select expected.index_name collate "C"
    from (values
      ('durable_job_events_job_occurred_idx'::text),
      ('durable_jobs_expired_lease_idx'),
      ('durable_jobs_runnable_idx'),
      ('source_collection_schedules_due_idx'),
      ('source_schedule_commands_schedule_created_idx'),
      ('source_schedule_events_schedule_occurred_idx')
    ) as expected(index_name)
  $$,
  'queue runnable, lease, command, and history indexes all exist'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = expected.role_name
      and not rolcanlogin
      and not rolinherit
      and not rolbypassrls
      and not rolsuper
      and not rolcreatedb
      and not rolcreaterole
      and not rolreplication
  ),
  pg_catalog.format('%s is a no-login no-inherit no-bypass-RLS role', expected.role_name)
)
from (values ('collection_queue_worker'), ('collection_schedule_admin')) as expected(role_name);

select ok(
  coalesce(table_info.relrowsecurity, false) and coalesce(table_info.relforcerowsecurity, false),
  pg_catalog.format('%s has RLS enabled and forced', expected.table_name)
)
from (
  values
    ('source_collection_schedules'),
    ('source_schedule_commands'),
    ('source_schedule_events'),
    ('durable_jobs'),
    ('durable_job_events')
) as expected(table_name)
left join pg_catalog.pg_class as table_info
  on table_info.oid = pg_catalog.to_regclass(pg_catalog.format('public.%I', expected.table_name));

select ok(
  case
    when exists (select 1 from pg_catalog.pg_roles where rolname = expected_role.role_name)
      and pg_catalog.to_regclass(pg_catalog.format('public.%I', expected_table.table_name)) is not null
    then not has_table_privilege(
      expected_role.role_name,
      pg_catalog.format('public.%I', expected_table.table_name),
      'INSERT,UPDATE,DELETE'
    )
    else false
  end,
  pg_catalog.format('%s has no direct DML on %s', expected_role.role_name, expected_table.table_name)
)
from (
  values
    ('anon'), ('authenticated'), ('service_role'), ('collection_worker'),
    ('collection_queue_worker'), ('collection_schedule_admin')
) as expected_role(role_name)
cross join (
  values
    ('source_collection_schedules'), ('source_schedule_commands'), ('source_schedule_events'),
    ('durable_jobs'), ('durable_job_events')
) as expected_table(table_name);

select ok(
  case
    when exists (select 1 from pg_catalog.pg_roles where rolname = 'collection_queue_worker')
    then not has_table_privilege('collection_queue_worker', pg_catalog.format('public.%I', expected.table_name), 'INSERT,UPDATE,DELETE')
    else false
  end,
  pg_catalog.format('queue role cannot write canonical table %s', expected.table_name)
)
from (values ('projects'), ('sources'), ('project_sources'), ('signals'), ('project_scores')) as expected(table_name);

select ok(
  pg_catalog.to_regprocedure(expected.signature) is not null,
  pg_catalog.format('%s exists', expected.signature)
)
from (
  values
    ('public.reconcile_due_source_schedules(timestamp with time zone,integer)'),
    ('public.claim_collection_jobs(text,timestamp with time zone,integer)'),
    ('public.renew_collection_job_lease(uuid,text,bigint,timestamp with time zone)'),
    ('public.complete_collection_job(uuid,text,bigint,text,timestamp with time zone)'),
    ('public.retry_collection_job(uuid,text,bigint,text,text,timestamp with time zone,timestamp with time zone)'),
    ('public.dead_letter_collection_job(uuid,text,bigint,text,text,timestamp with time zone)'),
    ('public.cancel_collection_job(uuid,text,bigint,text,timestamp with time zone)'),
    ('public.is_source_collection_eligible(uuid,uuid)'),
    ('public.execute_source_schedule_command(uuid,uuid,jsonb,text,text,timestamp with time zone)'),
    ('public.collection_queue_health(timestamp with time zone)')
) as expected(signature);

select ok(
  procedure_info.prosecdef
    and pg_catalog.pg_get_userbyid(procedure_info.proowner) = 'postgres'
    and procedure_info.proconfig = array['search_path=pg_catalog, public']::text[],
  pg_catalog.format('%s is postgres-owned security definer with fixed search_path', expected.signature)
)
from (
  values
    ('public.reconcile_due_source_schedules(timestamp with time zone,integer)'),
    ('public.claim_collection_jobs(text,timestamp with time zone,integer)'),
    ('public.renew_collection_job_lease(uuid,text,bigint,timestamp with time zone)'),
    ('public.complete_collection_job(uuid,text,bigint,text,timestamp with time zone)'),
    ('public.retry_collection_job(uuid,text,bigint,text,text,timestamp with time zone,timestamp with time zone)'),
    ('public.dead_letter_collection_job(uuid,text,bigint,text,text,timestamp with time zone)'),
    ('public.cancel_collection_job(uuid,text,bigint,text,timestamp with time zone)'),
    ('public.is_source_collection_eligible(uuid,uuid)'),
    ('public.execute_source_schedule_command(uuid,uuid,jsonb,text,text,timestamp with time zone)'),
    ('public.collection_queue_health(timestamp with time zone)')
) as expected(signature)
left join pg_catalog.pg_proc as procedure_info
  on procedure_info.oid = pg_catalog.to_regprocedure(expected.signature);

select ok(
  case
    when exists (select 1 from pg_catalog.pg_roles where rolname = 'collection_queue_worker')
      and exists (select 1 from pg_catalog.pg_roles where rolname = 'collection_schedule_admin')
    then
      case
        when expected.allowed_role = 'collection_queue_worker' then
          has_function_privilege('collection_queue_worker', expected.signature, 'EXECUTE')
          and not has_function_privilege('collection_schedule_admin', expected.signature, 'EXECUTE')
        else
          has_function_privilege('collection_schedule_admin', expected.signature, 'EXECUTE')
          and not has_function_privilege('collection_queue_worker', expected.signature, 'EXECUTE')
      end
      and not has_function_privilege('anon', expected.signature, 'EXECUTE')
      and not has_function_privilege('authenticated', expected.signature, 'EXECUTE')
      and not has_function_privilege('service_role', expected.signature, 'EXECUTE')
      and not has_function_privilege('collection_worker', expected.signature, 'EXECUTE')
    else false
  end,
  pg_catalog.format('%s is executable only by %s', expected.signature, expected.allowed_role)
)
from (
  values
    ('public.reconcile_due_source_schedules(timestamp with time zone,integer)', 'collection_queue_worker'),
    ('public.claim_collection_jobs(text,timestamp with time zone,integer)', 'collection_queue_worker'),
    ('public.renew_collection_job_lease(uuid,text,bigint,timestamp with time zone)', 'collection_queue_worker'),
    ('public.complete_collection_job(uuid,text,bigint,text,timestamp with time zone)', 'collection_queue_worker'),
    ('public.retry_collection_job(uuid,text,bigint,text,text,timestamp with time zone,timestamp with time zone)', 'collection_queue_worker'),
    ('public.dead_letter_collection_job(uuid,text,bigint,text,text,timestamp with time zone)', 'collection_queue_worker'),
    ('public.cancel_collection_job(uuid,text,bigint,text,timestamp with time zone)', 'collection_queue_worker'),
    ('public.is_source_collection_eligible(uuid,uuid)', 'collection_queue_worker'),
    ('public.collection_queue_health(timestamp with time zone)', 'collection_queue_worker'),
    ('public.execute_source_schedule_command(uuid,uuid,jsonb,text,text,timestamp with time zone)', 'collection_schedule_admin')
) as expected(signature, allowed_role)
where pg_catalog.to_regprocedure(expected.signature) is not null;

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = pg_catalog.to_regclass(pg_catalog.format('public.%I', expected.table_name))
      and tgname = expected.trigger_name
      and not tgisinternal
  ),
  pg_catalog.format('%s has its append-only trigger', expected.table_name)
)
from (
  values
    ('source_schedule_commands', 'source_schedule_commands_reject_mutation'),
    ('source_schedule_events', 'source_schedule_events_reject_mutation'),
    ('durable_job_events', 'durable_job_events_reject_mutation')
) as expected(table_name, trigger_name);

select (
  pg_catalog.to_regprocedure(
    'public.collection_schedule_jitter_seconds(uuid,uuid,timestamp with time zone,integer)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.reconcile_due_source_schedules(timestamp with time zone,integer)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.claim_collection_jobs(text,timestamp with time zone,integer)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.execute_source_schedule_command(uuid,uuid,jsonb,text,text,timestamp with time zone)'
  ) is not null
)::integer as queue_migration_ready \gset

\if :queue_migration_ready

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  '81000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'queue-admin@example.invalid',
  '{"provider":"email","providers":["email"]}', '{}',
  '2026-08-13 10:00:00+00', '2026-08-13 10:00:00+00'
);

insert into public.user_roles (user_id, role, granted_at)
values ('81000000-0000-4000-8000-000000000001', 'admin', '2026-08-13 10:00:00+00');

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  '81000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'queue-non-admin@example.invalid',
  '{"provider":"email","providers":["email"]}', '{}',
  '2026-08-13 10:00:00+00', '2026-08-13 10:00:00+00'
);

insert into public.projects (id, slug, name, lifecycle)
values
  ('11111111-1111-4111-8111-111111111111', 'queue-active-one', 'Queue Active One', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'queue-active-two', 'Queue Active Two', 'active');

insert into public.sources (id, source_type, name, canonical_url, status)
values
  ('22222222-2222-4222-8222-222222222222', 'official_web', 'Queue Source One', 'https://queue-one.example.invalid/', 'active'),
  ('44444444-4444-4444-8444-444444444444', 'official_web', 'Queue Source Two', 'https://queue-two.example.invalid/', 'active');

insert into public.project_sources (
  project_id, source_id, authority_domains, is_official, verified_at, verified_by
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    array['queue-one.example.invalid'], true,
    '2026-08-13 10:00:00+00', '81000000-0000-4000-8000-000000000001'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    array['queue-two.example.invalid'], true,
    '2026-08-13 10:00:00+00', '81000000-0000-4000-8000-000000000001'
  );

select is(
  public.collection_schedule_jitter_seconds(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '2026-08-13 12:00:00+00',
    1800
  ),
  32,
  'SQL FNV-1a matches the frozen TypeScript conformance vector'
);

select ok(
  public.valid_collection_job_payload(
    '{"projectId":"11111111-1111-4111-8111-111111111111","sourceId":"22222222-2222-4222-8222-222222222222","scheduleId":"55555555-5555-4555-8555-555555555555","scheduleVersion":2,"collectionRuleVersion":"collection-v1","trigger":"scheduled","scheduledFor":"2026-08-13T12:00:00.000Z"}'::jsonb,
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '55555555-5555-4555-8555-555555555555',
    2,
    'collection-v1',
    'scheduled',
    '2026-08-13 12:00:00+00'
  ),
  'strict payload validator accepts the normalized frozen job payload'
);

select ok(
  not public.valid_collection_job_payload(
    '{"projectId":"11111111-1111-4111-8111-111111111111","sourceId":"22222222-2222-4222-8222-222222222222","scheduleId":"55555555-5555-4555-8555-555555555555","scheduleVersion":2,"collectionRuleVersion":"collection-v1","trigger":"scheduled","scheduledFor":"2026-08-13T12:00:00.000Z","rawText":"forbidden"}'::jsonb,
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '55555555-5555-4555-8555-555555555555',
    2,
    'collection-v1',
    'scheduled',
    '2026-08-13 12:00:00+00'
  ),
  'strict payload validator rejects source content and every unknown key'
);

select results_eq(
  $$
    select fixture.case_name::text collate "C",
      public.valid_source_schedule_command_payload(fixture.payload)
    from (
      values
        ('numeric version and expected version'::text, '{"version":1,"command":"pause","expectedVersion":2,"intervalSeconds":null}'::jsonb),
        ('string version', '{"version":"1","command":"pause","expectedVersion":2,"intervalSeconds":null}'::jsonb),
        ('boolean version', '{"version":true,"command":"pause","expectedVersion":2,"intervalSeconds":null}'::jsonb),
        ('null version', '{"version":null,"command":"pause","expectedVersion":2,"intervalSeconds":null}'::jsonb),
        ('fractional version', '{"version":1.5,"command":"pause","expectedVersion":2,"intervalSeconds":null}'::jsonb),
        ('string expected version', '{"version":1,"command":"pause","expectedVersion":"2","intervalSeconds":null}'::jsonb),
        ('boolean expected version', '{"version":1,"command":"pause","expectedVersion":true,"intervalSeconds":null}'::jsonb),
        ('null expected version', '{"version":1,"command":"pause","expectedVersion":null,"intervalSeconds":null}'::jsonb),
        ('fractional expected version', '{"version":1,"command":"pause","expectedVersion":2.5,"intervalSeconds":null}'::jsonb)
    ) as fixture(case_name, payload)
    order by fixture.case_name
  $$,
  $$
    select expected.case_name collate "C", expected.is_valid
    from (values
      ('boolean expected version'::text, false),
      ('boolean version', false),
      ('fractional expected version', false),
      ('fractional version', false),
      ('null expected version', false),
      ('null version', false),
      ('numeric version and expected version', true),
      ('string expected version', false),
      ('string version', false)
    ) as expected(case_name, is_valid)
  $$,
  'schedule command versions require JSON integer numbers and reject coercible scalar types'
);

select throws_ok(
  $$ select * from public.reconcile_due_source_schedules('2026-08-13 12:00:00+00', 0) $$,
  '22023',
  'invalid_collection_queue_batch_limit',
  'reconciliation rejects a zero batch limit'
);

set local role collection_queue_worker;

create temporary table first_reconcile_result on commit drop as
select * from public.reconcile_due_source_schedules('2026-08-13 12:00:00+00', 100);

create temporary table duplicate_reconcile_result on commit drop as
select * from public.reconcile_due_source_schedules('2026-08-13 12:00:00+00', 100);

reset role;

select results_eq(
  $$
    select created_schedule_count, enqueued_count, canceled_count, lock_acquired
    from pg_temp.first_reconcile_result
  $$,
  $$ values (3, 3, 0, true) $$,
  'one reconciliation creates schedules for the seeded relation and two test relations, then enqueues all due windows atomically'
);

select results_eq(
  $$
    select created_schedule_count, enqueued_count, canceled_count, lock_acquired
    from pg_temp.duplicate_reconcile_result
  $$,
  $$ values (0, 0, 0, true) $$,
  'a duplicate scan creates no duplicate schedule or job'
);

select results_eq(
  $$
    select interval_seconds, next_run_at, version
    from public.source_collection_schedules
    where project_id = '11111111-1111-4111-8111-111111111111'
      and source_id = '22222222-2222-4222-8222-222222222222'
  $$,
  $$ values (1800, '2026-08-13 12:30:00+00'::timestamptz, 2::bigint) $$,
  'automatic schedule uses 1800 seconds and advances exactly from scheduler time'
);

select results_eq(
  $$
    select scheduled_for, available_at
    from public.durable_jobs
    where project_id = '11111111-1111-4111-8111-111111111111'
      and source_id = '22222222-2222-4222-8222-222222222222'
  $$,
  $$
    values (
      '2026-08-13 12:00:00+00'::timestamptz,
      '2026-08-13 12:00:32+00'::timestamptz
    )
  $$,
  'scheduled job is available at scheduler time plus deterministic jitter'
);

insert into public.projects (id, slug, name, lifecycle)
values ('55555555-5555-4555-8555-555555555555', 'queue-microsecond-scheduled', 'Queue Microsecond Scheduled', 'active');

insert into public.sources (id, source_type, name, canonical_url, status)
values ('66666666-6666-4666-8666-666666666666', 'official_web', 'Queue Microsecond Scheduled', 'https://queue-microsecond.example.invalid/', 'active');

insert into public.project_sources (
  project_id, source_id, authority_domains, is_official, verified_at, verified_by
)
values (
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  array['queue-microsecond.example.invalid'], true,
  '2026-08-13 10:00:00+00', '81000000-0000-4000-8000-000000000001'
);

insert into public.source_collection_schedules (
  id, project_id, source_id, next_run_at, created_at, updated_at
)
values (
  '77777777-7777-4777-8777-777777777777',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '2026-08-13 12:00:00.654321+00',
  '2026-08-13 10:00:00+00', '2026-08-13 10:00:00+00'
);

set local role collection_queue_worker;

create temporary table microsecond_scheduled_reconcile_result on commit drop as
select * from public.reconcile_due_source_schedules('2026-08-13 12:00:00.654321+00', 100);

reset role;

select results_eq(
  $$
    select created_schedule_count, enqueued_count, canceled_count, lock_acquired
    from pg_temp.microsecond_scheduled_reconcile_result
  $$,
  $$ values (0, 1, 0, true) $$,
  'an isolated scheduled microsecond fixture enqueues exactly its already-created schedule'
);

select results_eq(
  $$
    select
      job.payload ->> 'scheduledFor',
      job.scheduled_for,
      (job.payload ->> 'scheduledFor')::timestamptz = job.scheduled_for
    from public.durable_jobs as job
    where job.schedule_id = '77777777-7777-4777-8777-777777777777'
  $$,
  $$ values ('2026-08-13T12:00:00.654321Z'::text, '2026-08-13 12:00:00.654321+00'::timestamptz, true) $$,
  'scheduled microsecond payload scheduledFor round-trips exactly to normalized scheduled_for'
);

create temporary table queue_test_ids (
  key text primary key,
  value uuid not null
) on commit drop;

insert into queue_test_ids (key, value)
select 'schedule_one', id
from public.source_collection_schedules
where project_id = '11111111-1111-4111-8111-111111111111';

create temporary table queue_command_inputs (
  key text primary key,
  payload jsonb not null,
  input_hash text not null
) on commit drop;

create temporary table queue_role_observations (
  key text primary key,
  sqlstate text not null,
  message text not null
) on commit drop;

insert into queue_command_inputs (key, payload, input_hash)
select fixture.key, fixture.payload,
  pg_catalog.encode(extensions.digest(pg_catalog.convert_to(fixture.payload::text, 'UTF8'), 'sha256'), 'hex')
from (
  values
    ('pause'::text, '{"version":1,"command":"pause","expectedVersion":2,"intervalSeconds":null}'::jsonb),
    ('pause_conflict', '{"version":1,"command":"pause","expectedVersion":1,"intervalSeconds":null}'::jsonb),
    ('resume', '{"version":1,"command":"resume","expectedVersion":3,"intervalSeconds":null}'::jsonb),
    ('resume_noop', '{"version":1,"command":"resume","expectedVersion":4,"intervalSeconds":null}'::jsonb),
    ('interval_min', '{"version":1,"command":"change_interval","expectedVersion":5,"intervalSeconds":300}'::jsonb),
    ('interval_max', '{"version":1,"command":"change_interval","expectedVersion":6,"intervalSeconds":604800}'::jsonb),
    ('collect_now', '{"version":1,"command":"collect_now","expectedVersion":7,"intervalSeconds":null}'::jsonb),
    ('version_conflict', '{"version":1,"command":"pause","expectedVersion":6,"intervalSeconds":null}'::jsonb)
) as fixture(key, payload);

grant select on pg_temp.queue_test_ids, pg_temp.queue_command_inputs
to collection_schedule_admin, collection_queue_worker;

grant insert on pg_temp.queue_role_observations
to collection_schedule_admin, collection_queue_worker;

set local role collection_schedule_admin;

do $body$
declare
  error_state text;
  error_message text;
begin
  begin
    perform *
    from public.execute_source_schedule_command(
      '81000000-0000-4000-8000-000000000001',
      '88888888-8888-4888-8888-888888888888',
      (select payload from pg_temp.queue_command_inputs where key = 'pause'),
      'missing-queue-schedule-1',
      (select input_hash from pg_temp.queue_command_inputs where key = 'pause'),
      '2026-08-13 12:04:58+00'
    );
  exception
    when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
      insert into pg_temp.queue_role_observations (key, sqlstate, message)
      values ('schedule_not_found', error_state, error_message);
  end;

  begin
    perform *
    from public.execute_source_schedule_command(
      '81000000-0000-4000-8000-000000000002',
      (select value from pg_temp.queue_test_ids where key = 'schedule_one'),
      (select payload from pg_temp.queue_command_inputs where key = 'pause'),
      'non-admin-queue-schedule-1',
      (select input_hash from pg_temp.queue_command_inputs where key = 'pause'),
      '2026-08-13 12:04:59+00'
    );
  exception
    when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
      insert into pg_temp.queue_role_observations (key, sqlstate, message)
      values ('admin_required', error_state, error_message);
  end;
end;
$body$;

create temporary table pause_command_result on commit drop as
select *
from public.execute_source_schedule_command(
  '81000000-0000-4000-8000-000000000001',
  (select value from pg_temp.queue_test_ids where key = 'schedule_one'),
  (select payload from pg_temp.queue_command_inputs where key = 'pause'),
  'pause-queue-schedule-1',
  (select input_hash from pg_temp.queue_command_inputs where key = 'pause'),
  '2026-08-13 12:05:00+00'
);

create temporary table pause_replay_result on commit drop as
select *
from public.execute_source_schedule_command(
  '81000000-0000-4000-8000-000000000001',
  (select value from pg_temp.queue_test_ids where key = 'schedule_one'),
  (select payload from pg_temp.queue_command_inputs where key = 'pause'),
  'pause-queue-schedule-1',
  (select input_hash from pg_temp.queue_command_inputs where key = 'pause'),
  '2026-08-13 12:05:01+00'
);

reset role;

select results_eq(
  $$ select command::text, schedule_version, enabled, replayed from pg_temp.pause_command_result $$,
  $$ values ('pause'::text, 3::bigint, false, false) $$,
  'pause advances the aggregate, disables it, and returns a first-write receipt'
);

select results_eq(
  $$ select schedule_version, enabled, replayed from pg_temp.pause_replay_result $$,
  $$ values (3::bigint, false, true) $$,
  'an identical command replay returns the committed receipt without another mutation'
);

select is(
  (select state::text from public.durable_jobs where project_id = '11111111-1111-4111-8111-111111111111'),
  'canceled',
  'pause atomically cancels queued work'
);

set local role collection_schedule_admin;

do $body$
declare
  error_state text;
  error_message text;
begin
  begin
    perform *
    from public.execute_source_schedule_command(
      '81000000-0000-4000-8000-000000000001',
      (select value from pg_temp.queue_test_ids where key = 'schedule_one'),
      (select payload from pg_temp.queue_command_inputs where key = 'pause_conflict'),
      'pause-queue-schedule-1',
      (select input_hash from pg_temp.queue_command_inputs where key = 'pause_conflict'),
      '2026-08-13 12:05:02+00'
    );
  exception
    when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
      insert into pg_temp.queue_role_observations (key, sqlstate, message)
      values ('idempotency_conflict', error_state, error_message);
  end;
end;
$body$;

create temporary table resume_command_result on commit drop as
select *
from public.execute_source_schedule_command(
  '81000000-0000-4000-8000-000000000001',
  (select value from pg_temp.queue_test_ids where key = 'schedule_one'),
  (select payload from pg_temp.queue_command_inputs where key = 'resume'),
  'resume-queue-schedule-1',
  (select input_hash from pg_temp.queue_command_inputs where key = 'resume'),
  '2026-08-13 12:06:00+00'
);

reset role;

select results_eq(
  $$ select sqlstate, message from pg_temp.queue_role_observations where key = 'idempotency_conflict' $$,
  $$ values ('AQ102'::text, 'idempotency_conflict'::text) $$,
  'a reused key with different input is rejected with the stable conflict error'
);

select results_eq(
  $$ select sqlstate, message from pg_temp.queue_role_observations where key = 'schedule_not_found' $$,
  $$ values ('AQ103'::text, 'schedule_not_found'::text) $$,
  'a missing schedule uses its dedicated stable SQLSTATE'
);

select results_eq(
  $$ select sqlstate, message from pg_temp.queue_role_observations where key = 'admin_required' $$,
  $$ values ('AQ104'::text, 'admin_required'::text) $$,
  'a non-admin actor uses its dedicated stable SQLSTATE'
);

select results_eq(
  $$ select schedule_version, enabled, next_run_at, replayed from pg_temp.resume_command_result $$,
  $$ values (4::bigint, true, '2026-08-13 12:06:00+00'::timestamptz, false) $$,
  'resume enables the sticky pause and makes the schedule promptly due'
);

set local role collection_schedule_admin;

create temporary table noop_resume_result on commit drop as
select *
from public.execute_source_schedule_command(
  '81000000-0000-4000-8000-000000000001',
  (select value from pg_temp.queue_test_ids where key = 'schedule_one'),
  (select payload from pg_temp.queue_command_inputs where key = 'resume_noop'),
  'resume-noop-queue-schedule-1',
  (select input_hash from pg_temp.queue_command_inputs where key = 'resume_noop'),
  '2026-08-13 12:06:01+00'
);

reset role;

select results_eq(
  $$ select schedule_version, enabled, next_run_at from pg_temp.noop_resume_result $$,
  $$ values (4::bigint, true, '2026-08-13 12:06:00+00'::timestamptz) $$,
  'a no-op resume preserves aggregate version and recurring cursor'
);

set local role collection_queue_worker;

create temporary table resumed_reconcile_result on commit drop as
select * from public.reconcile_due_source_schedules('2026-08-13 12:06:00+00', 100);

create temporary table initial_claims on commit drop as
select * from public.claim_collection_jobs('queue-worker-a', '2026-08-13 12:10:00+00', 2);

reset role;

select is((select count(*)::integer from pg_temp.initial_claims), 2, 'one claimant leases two distinct due jobs');

select results_eq(
  $$
    select execution_attempt, delivery_count, lease_epoch, lease_expires_at
    from pg_temp.initial_claims
    order by job_id
    limit 1
  $$,
  $$ values (1, 1, 1::bigint, '2026-08-13 12:12:00+00'::timestamptz) $$,
  'initial delivery consumes one execution attempt and receives a 120-second fenced lease'
);

insert into queue_test_ids (key, value)
select 'claimed_one', job_id from pg_temp.initial_claims order by job_id limit 1;

set local role collection_queue_worker;

create temporary table renewed_lease on commit drop as
select * from public.renew_collection_job_lease(
  (select value from pg_temp.queue_test_ids where key = 'claimed_one'),
  'queue-worker-a', 1, '2026-08-13 12:11:00+00'
);

do $body$
declare
  error_state text;
  error_message text;
begin
  begin
    perform *
    from public.complete_collection_job(
      (select value from pg_temp.queue_test_ids where key = 'claimed_one'),
      'stale-worker', 1, 'not_modified', '2026-08-13 12:11:01+00'
    );
  exception
    when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
      insert into pg_temp.queue_role_observations (key, sqlstate, message)
      values ('lease_fence_lost', error_state, error_message);
  end;
end;
$body$;

create temporary table recovered_claims on commit drop as
select * from public.claim_collection_jobs('queue-worker-b', '2026-08-13 12:14:00+00', 100);

reset role;

select results_eq(
  $$ select sqlstate, message from pg_temp.queue_role_observations where key = 'lease_fence_lost' $$,
  $$ values ('AQL01'::text, 'lease_fence_lost'::text) $$,
  'a stale owner cannot complete another worker lease'
);

select results_eq(
  $$
    select execution_attempt, delivery_count
    from pg_temp.recovered_claims
    where job_id = (select value from pg_temp.queue_test_ids where key = 'claimed_one')
  $$,
  $$ values (1, 2) $$,
  'expired-lease redelivery preserves execution attempt while incrementing delivery count'
);

select results_eq(
  $$
    select event_type::text
    from public.durable_job_events
    where job_id = (select value from pg_temp.queue_test_ids where key = 'claimed_one')
    order by job_version
  $$,
  $$ values ('enqueued'::text), ('claimed'), ('lease_renewed'), ('lease_expired'), ('claimed') $$,
  'lease recovery preserves an explicit append-only event trail'
);

insert into queue_test_ids (key, value)
select 'cancel_one', job_id
from pg_temp.recovered_claims
where job_id <> (select value from pg_temp.queue_test_ids where key = 'claimed_one')
order by job_id
limit 1;

insert into queue_test_ids (key, value)
select 'cancel_remaining', job_id
from pg_temp.recovered_claims
where job_id not in (
  (select value from pg_temp.queue_test_ids where key = 'claimed_one'),
  (select value from pg_temp.queue_test_ids where key = 'cancel_one')
)
order by job_id
limit 1;

set local role collection_queue_worker;

create temporary table retry_result on commit drop as
select *
from public.retry_collection_job(
  (select value from pg_temp.queue_test_ids where key = 'claimed_one'),
  'queue-worker-b',
  (select lease_epoch from pg_temp.recovered_claims where job_id = (select value from pg_temp.queue_test_ids where key = 'claimed_one')),
  'http_error', 'bounded transient detail',
  '2026-08-13 12:15:00+00', '2026-08-13 12:14:10+00'
);

create temporary table cancel_result on commit drop as
select *
from public.cancel_collection_job(
  (select value from pg_temp.queue_test_ids where key = 'cancel_one'),
  'queue-worker-b',
  (select lease_epoch from pg_temp.recovered_claims where job_id = (select value from pg_temp.queue_test_ids where key = 'cancel_one')),
  'source_ineligible', '2026-08-13 12:14:10+00'
);

create temporary table remaining_cancel_result on commit drop as
select *
from public.cancel_collection_job(
  (select value from pg_temp.queue_test_ids where key = 'cancel_remaining'),
  'queue-worker-b',
  (select lease_epoch from pg_temp.recovered_claims where job_id = (select value from pg_temp.queue_test_ids where key = 'cancel_remaining')),
  'source_ineligible',
  '2026-08-13 12:14:10+00'
);

create temporary table retry_claim on commit drop as
select *
from public.claim_collection_jobs('queue-worker-c', '2026-08-13 12:15:00+00', 1);

create temporary table dead_letter_result on commit drop as
select *
from public.dead_letter_collection_job(
  (select value from pg_temp.queue_test_ids where key = 'claimed_one'),
  'queue-worker-c',
  (select lease_epoch from pg_temp.retry_claim where job_id = (select value from pg_temp.queue_test_ids where key = 'claimed_one')),
  'invalid_feed', 'bounded terminal detail', '2026-08-13 12:15:10+00'
);

reset role;

select results_eq(
  $$
    select execution_attempt, delivery_count
    from pg_temp.retry_claim
    where job_id = (select value from pg_temp.queue_test_ids where key = 'claimed_one')
  $$,
  $$ values (2, 3) $$,
  'an intentional retry advances execution attempt and every delivery advances delivery count'
);

select results_eq(
  $$
    select state::text, last_result_code
    from public.durable_jobs
    where id in (
      (select value from pg_temp.queue_test_ids where key = 'claimed_one'),
      (select value from pg_temp.queue_test_ids where key = 'cancel_one')
    )
    order by state::text
  $$,
  $$ values ('canceled'::text, 'source_ineligible'::text), ('dead_letter', 'invalid_feed') $$,
  'cancel and dead-letter functions persist distinct terminal outcomes'
);

set local role collection_schedule_admin;

create temporary table interval_min_result on commit drop as
select * from public.execute_source_schedule_command(
  '81000000-0000-4000-8000-000000000001',
  (select value from pg_temp.queue_test_ids where key = 'schedule_one'),
  (select payload from pg_temp.queue_command_inputs where key = 'interval_min'),
  'interval-min-queue-schedule-1',
  (select input_hash from pg_temp.queue_command_inputs where key = 'interval_min'),
  '2026-08-13 12:20:00+00'
);

create temporary table interval_max_result on commit drop as
select * from public.execute_source_schedule_command(
  '81000000-0000-4000-8000-000000000001',
  (select value from pg_temp.queue_test_ids where key = 'schedule_one'),
  (select payload from pg_temp.queue_command_inputs where key = 'interval_max'),
  'interval-max-queue-schedule-1',
  (select input_hash from pg_temp.queue_command_inputs where key = 'interval_max'),
  '2026-08-13 12:21:00+00'
);

create temporary table collect_now_result on commit drop as
select * from public.execute_source_schedule_command(
  '81000000-0000-4000-8000-000000000001',
  (select value from pg_temp.queue_test_ids where key = 'schedule_one'),
  (select payload from pg_temp.queue_command_inputs where key = 'collect_now'),
  'collect-now-queue-schedule-1',
  (select input_hash from pg_temp.queue_command_inputs where key = 'collect_now'),
  '2026-08-13 12:22:00+00'
);

do $body$
declare
  error_state text;
  error_message text;
begin
  begin
    perform * from public.execute_source_schedule_command(
      '81000000-0000-4000-8000-000000000001',
      (select value from pg_temp.queue_test_ids where key = 'schedule_one'),
      (select payload from pg_temp.queue_command_inputs where key = 'version_conflict'),
      'version-conflict-queue-schedule-1',
      (select input_hash from pg_temp.queue_command_inputs where key = 'version_conflict'),
      '2026-08-13 12:22:01+00'
    );
  exception
    when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
      insert into pg_temp.queue_role_observations (key, sqlstate, message)
      values ('version_conflict', error_state, error_message);
  end;
end;
$body$;

reset role;

select results_eq(
  $$ select interval_seconds, next_run_at from pg_temp.interval_min_result $$,
  $$ values (300, '2026-08-13 12:25:00+00'::timestamptz) $$,
  'administrator commands accept the inclusive five-minute interval minimum'
);

select results_eq(
  $$ select schedule_version, interval_seconds, next_run_at from pg_temp.interval_max_result $$,
  $$ values (7::bigint, 604800, '2026-08-20 12:21:00+00'::timestamptz) $$,
  'administrator commands accept the inclusive seven-day interval maximum'
);

select results_eq(
  $$ select schedule_version, next_run_at, job_id is not null from pg_temp.collect_now_result $$,
  $$ values (8::bigint, '2026-08-20 12:21:00+00'::timestamptz, true) $$,
  'collect-now creates one manual job while preserving the recurring cursor'
);

insert into pg_temp.queue_command_inputs (key, payload, input_hash)
select
  'collect_now_microseconds',
  command_payload,
  pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(command_payload::text, 'UTF8'), 'sha256'),
    'hex'
  )
from (
  select pg_catalog.jsonb_build_object(
    'version', 1,
    'command', 'collect_now',
    'expectedVersion', 8,
    'intervalSeconds', null
  ) as command_payload
) as microsecond_command;

set local role collection_schedule_admin;

create temporary table collect_now_microseconds_result on commit drop as
select * from public.execute_source_schedule_command(
  '81000000-0000-4000-8000-000000000001',
  (select value from pg_temp.queue_test_ids where key = 'schedule_one'),
  (select payload from pg_temp.queue_command_inputs where key = 'collect_now_microseconds'),
  'collect-now-microseconds-queue-schedule-1',
  (select input_hash from pg_temp.queue_command_inputs where key = 'collect_now_microseconds'),
  '2026-08-13 12:22:00.123456+00'
);

reset role;

select results_eq(
  $$ select schedule_version, next_run_at, job_id is not null from pg_temp.collect_now_microseconds_result $$,
  $$ values (9::bigint, '2026-08-20 12:21:00+00'::timestamptz, true) $$,
  'microsecond collect-now advances the schedule version while preserving the recurring cursor'
);

select results_eq(
  $$
    select
      job.payload ->> 'scheduledFor',
      job.scheduled_for,
      (job.payload ->> 'scheduledFor')::timestamptz = job.scheduled_for
    from public.durable_jobs as job
    where job.id = (select job_id from pg_temp.collect_now_microseconds_result)
  $$,
  $$ values ('2026-08-13T12:22:00.123456Z'::text, '2026-08-13 12:22:00.123456+00'::timestamptz, true) $$,
  'microsecond collect-now payload scheduledFor round-trips exactly to normalized scheduled_for'
);

insert into queue_test_ids (key, value)
select 'manual_job', job_id from pg_temp.collect_now_result;

set local role collection_queue_worker;

create temporary table manual_claim on commit drop as
select * from public.claim_collection_jobs('queue-worker-d', '2026-08-13 12:22:00+00', 100);

create temporary table completed_result on commit drop as
select * from public.complete_collection_job(
  (select value from pg_temp.queue_test_ids where key = 'manual_job'),
  'queue-worker-d',
  (select lease_epoch from pg_temp.manual_claim where job_id = (select value from pg_temp.queue_test_ids where key = 'manual_job')),
  'not_modified', '2026-08-13 12:22:10+00'
);

reset role;

select results_eq(
  $$
    select state::text, last_result_code, completed_at
    from public.durable_jobs
    where id = (select value from pg_temp.queue_test_ids where key = 'manual_job')
  $$,
  $$ values ('succeeded'::text, 'not_modified'::text, '2026-08-13 12:22:10+00'::timestamptz) $$,
  'successful completion clears its lease and persists a terminal success outcome'
);

select results_eq(
  $$ select sqlstate, message from pg_temp.queue_role_observations where key = 'version_conflict' $$,
  $$ values ('AQ101'::text, 'schedule_version_conflict'::text) $$,
  'stale administrator commands fail closed with the stable version conflict'
);

select results_eq(
  $$
    select expired_lease_count, dead_letter_count
    from public.collection_queue_health('2026-08-13 12:22:00+00')
  $$,
  $$ values (0::bigint, 1::bigint) $$,
  'health snapshot exposes aggregate counts without payloads or error details'
);

select throws_ok(
  $$ update public.source_schedule_commands set input_hash = repeat('0', 64) $$,
  '55000',
  'collection_queue_history_append_only',
  'schedule command receipts are immutable even to the database owner'
);

select throws_ok(
  $$ delete from public.source_schedule_events $$,
  '55000',
  'collection_queue_history_append_only',
  'schedule events are append-only even to the database owner'
);

select throws_ok(
  $$ delete from public.durable_job_events $$,
  '55000',
  'collection_queue_history_append_only',
  'job events are append-only even to the database owner'
);

select ok(
  (
    with function_definition as (
      select pg_catalog.regexp_replace(
        pg_catalog.pg_get_functiondef(
          'public.execute_source_schedule_command(uuid,uuid,jsonb,text,text,timestamptz)'::regprocedure
        ),
        '[[:space:]]+',
        ' ',
        'g'
      ) as source_text
    ),
    source_locations as (
      select
        pg_catalog.strpos(source_text, 'for update;') as lock_position,
        pg_catalog.strpos(
          pg_catalog.substr(
            source_text,
            pg_catalog.strpos(source_text, 'for update;') + 11
          ),
          'from public.source_schedule_commands as receipt'
        ) as receipt_after_lock_position,
        pg_catalog.strpos(
          pg_catalog.substr(
            source_text,
            pg_catalog.strpos(source_text, 'for update;') + 11
          ),
          'if schedule_record.version <> expected_version'
        ) as version_after_lock_position
      from function_definition
    )
    select lock_position > 0
      and receipt_after_lock_position > 0
      and version_after_lock_position > receipt_after_lock_position
    from source_locations
  ),
  'schedule command rechecks its receipt after the aggregate lock and before expected version validation'
);

\else

select fail('queue behavior requires migration 009 functions');

\endif

select * from finish();

rollback;
