begin;
select plan(72);

-- Phase 10 Execution command boundary. This test exercises browser roles and
-- auth.uid() exactly as the Identity domain suite does: every write goes
-- through a receipt-first command, direct table writes are denied, and task
-- history is append-only.

-- ---------------------------------------------------------------------------
-- Shape, RLS, function surface, and ACLs
-- ---------------------------------------------------------------------------

select has_table('public', 'user_task_events', 'task event ledger exists');
select has_table('public', 'execution_command_receipts', 'execution receipts exist');

select results_eq(
  $test$
    select relrowsecurity
    from pg_catalog.pg_class
    where oid in ('public.user_task_events'::regclass, 'public.execution_command_receipts'::regclass)
    order by oid::text
  $test$,
  array[true, true],
  'execution ledger tables have RLS enabled'
);

select col_isnt_null('public', 'watchlists', 'version', 'watchlists gained a version column');
select col_isnt_null('public', 'user_projects', 'version', 'user_projects gained a version column');
select col_type_is('public', 'watchlists', 'version', 'bigint', 'watchlists version is bigint');
select col_type_is('public', 'user_projects', 'version', 'bigint', 'user_projects version is bigint');

select has_function('public', 'submit_create_task', array['jsonb'], 'create task command exists');
select has_function('public', 'submit_update_task', array['jsonb'], 'update task command exists');
select has_function('public', 'submit_delete_task', array['jsonb'], 'delete task command exists');
select has_function('public', 'submit_create_watchlist', array['jsonb'], 'create watchlist command exists');
select has_function('public', 'submit_rename_watchlist', array['jsonb'], 'rename watchlist command exists');
select has_function('public', 'submit_delete_watchlist', array['jsonb'], 'delete watchlist command exists');
select has_function(
  'public', 'submit_add_watchlist_project', array['jsonb'], 'add watchlist project command exists'
);
select has_function(
  'public', 'submit_remove_watchlist_project', array['jsonb'], 'remove watchlist project command exists'
);
select has_function(
  'public', 'submit_set_participation_status', array['jsonb'], 'participation command exists'
);
select has_function(
  'public', 'list_my_execution_tasks', array[]::text[], 'private task read exists'
);
select has_function('public', 'list_my_watchlists', array[]::text[], 'private watchlist read exists');
select has_function(
  'public', 'list_my_watchlist_projects', array['uuid'], 'private membership read exists'
);
select has_function('public', 'get_my_participation', array['uuid'], 'private participation read exists');

select throws_ok(
  $test$
    select public.submit_create_task('{}'::jsonb)
  $test$,
  '42501', null, 'anonymous callers hold no execute grant on execution commands'
);

-- ---------------------------------------------------------------------------
-- Fixtures: two auth users, whose profile bootstrap also creates a default
-- watchlist through the Phase 10 trigger.
-- ---------------------------------------------------------------------------

insert into public.profiles (id, display_name) values
  ('50000000-0000-4000-8000-00000000000a', '执行所有者'),
  ('50000000-0000-4000-8000-00000000000b', '执行旁观者');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'execution-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'execution-other@example.invalid', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), now(),
    '', '', '', ''
  );

select is(
  (select count(*) from public.profiles
   where id in (
     '50000000-0000-4000-8000-000000000001',
     '50000000-0000-4000-8000-000000000002'
   )),
  2::bigint,
  'auth bootstrap creates one profile per user'
);

select is(
  (select count(*) from public.watchlists
   where user_id = '50000000-0000-4000-8000-000000000001'),
  1::bigint,
  'the default watchlist bootstrap ran once for the owner'
);

select is(
  (select bool_and(is_default) from public.watchlists
   where user_id = '50000000-0000-4000-8000-000000000001'),
  true,
  'the bootstrapped watchlist is the default one'
);

-- A second insert of the same user must not duplicate the default list.
insert into public.profiles (id, display_name)
values ('50000000-0000-4000-8000-00000000000a', '执行所有者')
on conflict (id) do update set display_name = excluded.display_name;

select is(
  (select count(*) from public.watchlists
   where user_id = '50000000-0000-4000-8000-000000000001'),
  1::bigint,
  're-running the bootstrap does not create a second default list'
);

create temporary table phase_10_execution_state (
  name text primary key,
  response jsonb null,
  task_id uuid null,
  watchlist_id uuid null
) on commit drop;
grant select, insert, update on table pg_temp.phase_10_execution_state to authenticated;

-- ---------------------------------------------------------------------------
-- Without a session every command fails closed.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{}', true);

select throws_ok(
  $test$select public.submit_create_task(
    '{"idempotencyKey":"no-session-task","expectedVersion":1,"projectId":null,"title":"x","status":"backlog","priority":"medium","dueAt":null}'::jsonb
  )$test$,
  'EX201', 'execution_session_required', 'create task requires auth.uid()'
);
select throws_ok(
  $test$select public.submit_update_task(
    '{"idempotencyKey":"no-session-task","expectedVersion":1,"taskId":"50000000-0000-4000-8000-00000000aaaa","projectId":null,"title":null,"status":null,"priority":null,"dueAt":null,"completedAt":null}'::jsonb
  )$test$,
  'EX201', 'execution_session_required', 'update task requires auth.uid()'
);
select throws_ok(
  $test$select public.submit_set_participation_status(
    '{"idempotencyKey":"no-session-part","expectedVersion":1,"projectId":"50000000-0000-4000-8000-00000000aaaa","participationStatus":"interested","notes":null}'::jsonb
  )$test$,
  'EX201', 'execution_session_required', 'participation requires auth.uid()'
);

-- ---------------------------------------------------------------------------
-- Browser roles can no longer write the execution tables directly.
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $test$
    insert into public.user_tasks (id, user_id, title)
    values (
      '60000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      'direct insert'
    )
  $test$,
  '42501', null, 'authenticated cannot insert a task directly'
);

select throws_ok(
  $test$
    insert into public.watchlists (id, user_id, name)
    values (
      '60000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000001',
      'direct list'
    )
  $test$,
  '42501', null, 'authenticated cannot insert a watchlist directly'
);

select throws_ok(
  $test$
    update public.watchlists set name = 'renamed directly'
    where user_id = '50000000-0000-4000-8000-000000000001'
  $test$,
  '42501', null, 'authenticated cannot update a watchlist directly'
);

select throws_ok(
  $test$
    insert into public.user_task_events (
      task_id, user_id, event_type, task_version, actor_user_id,
      title, status, priority, occurred_at
    ) values (
      '60000000-0000-4000-8000-000000000003',
      '50000000-0000-4000-8000-000000000001',
      'created', 1, '50000000-0000-4000-8000-000000000001',
      'forged', 'backlog', 'low', now()
    )
  $test$,
  '42501', null, 'authenticated cannot append task history directly'
);

-- ---------------------------------------------------------------------------
-- The owner can create a task and the receipt replays exactly.
-- ---------------------------------------------------------------------------

select lives_ok(
  $test$
    insert into pg_temp.phase_10_execution_state (name, response, task_id)
    values (
      'task',
      public.submit_create_task(
        '{"idempotencyKey":"owner-task-create","expectedVersion":1,"projectId":null,"title":"核对快照条件","status":"backlog","priority":"medium","dueAt":null}'::jsonb
      ),
      null
    )
  $test$,
  'the owner can create a task'
);

select is(
  (select response ->> 'taskVersion' from pg_temp.phase_10_execution_state where name = 'task'),
  '1',
  'the create receipt reports version 1'
);
select is(
  (select response ->> 'replayed' from pg_temp.phase_10_execution_state where name = 'task'),
  'false',
  'a fresh command is not a replay'
);

select is(
  (select count(*) from public.user_tasks
   where title = '核对快照条件'),
  1::bigint,
  'the command wrote exactly one task row'
);

select is(
  (select count(*) from public.user_task_events
   where title = '核对快照条件' and event_type = 'created'),
  1::bigint,
  'the command appended exactly one created event'
);

select is(
  (select count(*) from public.outbox_events
   where event_type = 'execution.task.created.v1'),
  1::bigint,
  'the command inserted exactly one outbox event'
);

-- Exact replay: same key and same body returns the original receipt and writes
-- nothing new.
select is(
  (public.submit_create_task(
    '{"idempotencyKey":"owner-task-create","expectedVersion":1,"projectId":null,"title":"核对快照条件","status":"backlog","priority":"medium","dueAt":null}'::jsonb
  ) ->> 'replayed'),
  'true',
  'a repeated identical command reports replayed'
);

select is(
  (select count(*) from public.user_tasks where title = '核对快照条件'),
  1::bigint,
  'an exact replay writes no additional task row'
);

select is(
  (select count(*) from public.outbox_events where event_type = 'execution.task.created.v1'),
  1::bigint,
  'an exact replay writes no additional outbox event'
);

select throws_ok(
  $test$
    select public.submit_create_task(
      '{"idempotencyKey":"owner-task-create","expectedVersion":1,"projectId":null,"title":"不同的任务","status":"backlog","priority":"medium","dueAt":null}'::jsonb
    )
  $test$,
  'EX210', 'execution_idempotency_conflict',
  'a repeated key with a different body is rejected'
);

-- ---------------------------------------------------------------------------
-- Version conflict, not-found, and command validation.
-- ---------------------------------------------------------------------------

update pg_temp.phase_10_execution_state
set task_id = (response ->> 'taskId')::uuid
where name = 'task';

select throws_ok(
  $test$
    select public.submit_update_task(
      pg_catalog.jsonb_build_object(
        'idempotencyKey', 'owner-task-stale',
        'expectedVersion', 99,
        'taskId', (select task_id from pg_temp.phase_10_execution_state where name = 'task'),
        'projectId', null, 'title', '过期版本', 'status', 'planned',
        'priority', null, 'dueAt', null, 'completedAt', null
      )
    )
  $test$,
  'EX209', 'execution_version_conflict',
  'a stale expected version is rejected'
);

select throws_ok(
  $test$
    select public.submit_update_task(
      pg_catalog.jsonb_build_object(
        'idempotencyKey', 'owner-task-missing',
        'expectedVersion', 1,
        'taskId', '60000000-0000-4000-8000-0000000000ff',
        'projectId', null, 'title', '不存在', 'status', 'planned',
        'priority', null, 'dueAt', null, 'completedAt', null
      )
    )
  $test$,
  'EX202', 'execution_task_not_found',
  'another user''s or an unknown task is not found for this session'
);

select throws_ok(
  $test$
    select public.submit_create_task(
      '{"idempotencyKey":"owner-task-forge","expectedVersion":1,"projectId":null,"title":"越权字段","status":"backlog","priority":"medium","dueAt":null,"privateKey":"0xdeadbeef"}'::jsonb
    )
  $test$,
  'EX211', 'execution_command_invalid',
  'an unknown field in the payload is rejected'
);

select throws_ok(
  $test$
    select public.submit_update_task(
      pg_catalog.jsonb_build_object(
        'idempotencyKey', 'owner-task-half-done',
        'expectedVersion', 1,
        'taskId', (select task_id from pg_temp.phase_10_execution_state where name = 'task'),
        'projectId', null, 'title', null, 'status', 'completed',
        'priority', null, 'dueAt', null, 'completedAt', null
      )
    )
  $test$,
  'EX211', 'execution_command_invalid',
  'a completion without completedAt is rejected'
);

-- ---------------------------------------------------------------------------
-- A material update bumps the version once, appends history, and emits an
-- event; a no-op update does none of that.
-- ---------------------------------------------------------------------------

select lives_ok(
  $test$
    select public.submit_update_task(
      pg_catalog.jsonb_build_object(
        'idempotencyKey', 'owner-task-progress',
        'expectedVersion', 1,
        'taskId', (select task_id from pg_temp.phase_10_execution_state where name = 'task'),
        'projectId', null, 'title', null, 'status', 'in_progress',
        'priority', 'high', 'dueAt', null, 'completedAt', null
      )
    )
  $test$,
  'the owner can move a task forward'
);

select is(
  (select version from public.user_tasks
   where id = (select task_id from pg_temp.phase_10_execution_state where name = 'task')),
  2::bigint,
  'a material update increments the version exactly once'
);

select is(
  (select event_type from public.user_task_events
   where task_id = (select task_id from pg_temp.phase_10_execution_state where name = 'task')
   order by occurred_at desc, id desc limit 1),
  'status_changed',
  'a status change is recorded as a status change event'
);

select is(
  (select count(*) from public.outbox_events
   where event_type = 'execution.task.updated.v1'),
  1::bigint,
  'a material update emits exactly one outbox event'
);

select lives_ok(
  $test$
    select public.submit_update_task(
      pg_catalog.jsonb_build_object(
        'idempotencyKey', 'owner-task-noop',
        'expectedVersion', 2,
        'taskId', (select task_id from pg_temp.phase_10_execution_state where name = 'task'),
        'projectId', null, 'title', null, 'status', 'in_progress',
        'priority', 'high', 'dueAt', null, 'completedAt', null
      )
    )
  $test$,
  'a no-op update is accepted'
);

select is(
  (select version from public.user_tasks
   where id = (select task_id from pg_temp.phase_10_execution_state where name = 'task')),
  2::bigint,
  'a no-op update leaves the version untouched'
);

select is(
  (select count(*) from public.user_task_events
   where task_id = (select task_id from pg_temp.phase_10_execution_state where name = 'task')),
  2::bigint,
  'a no-op update appends no history row'
);

-- ---------------------------------------------------------------------------
-- Watchlists: rename conflict, default list protection, and the D4 limit.
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $test$
    insert into pg_temp.phase_10_execution_state (name, response, watchlist_id)
    values (
      'list',
      public.submit_create_watchlist(
        '{"idempotencyKey":"owner-list-create","expectedVersion":1,"name":"长期观察"}'::jsonb
      ),
      null
    )
  $test$,
  'the owner can create a second watchlist'
);

update pg_temp.phase_10_execution_state
set watchlist_id = (response ->> 'watchlistId')::uuid
where name = 'list';

select throws_ok(
  $test$
    select public.submit_rename_watchlist(
      pg_catalog.jsonb_build_object(
        'idempotencyKey', 'owner-list-clash',
        'expectedVersion', 1,
        'watchlistId', (select watchlist_id from pg_temp.phase_10_execution_state where name = 'list'),
        'name', '默认关注'
      )
    )
  $test$,
  'EX208', 'execution_name_conflict',
  'renaming onto the default list''s name is rejected'
);

select throws_ok(
  $test$
    select public.submit_delete_watchlist(
      pg_catalog.jsonb_build_object(
        'idempotencyKey', 'owner-list-delete-default',
        'expectedVersion', 1,
        'watchlistId', (
          select id from public.watchlists
          where user_id = '50000000-0000-4000-8000-000000000001' and is_default
        )
      )
    )
  $test$,
  'EX211', 'execution_command_invalid',
  'the default watchlist cannot be deleted'
);

-- The other user cannot touch the owner's list at all.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select throws_ok(
  $test$
    select public.submit_rename_watchlist(
      pg_catalog.jsonb_build_object(
        'idempotencyKey', 'other-list-rename',
        'expectedVersion', 1,
        'watchlistId', (select watchlist_id from pg_temp.phase_10_execution_state where name = 'list'),
        'name', '别人的列表'
      )
    )
  $test$,
  'EX203', 'execution_watchlist_not_found',
  'another user''s watchlist is not found for this session'
);

select throws_ok(
  $test$
    select public.submit_update_task(
      pg_catalog.jsonb_build_object(
        'idempotencyKey', 'other-task-update',
        'expectedVersion', 2,
        'taskId', (select task_id from pg_temp.phase_10_execution_state where name = 'task'),
        'projectId', null, 'title', '偷改', 'status', 'planned',
        'priority', null, 'dueAt', null, 'completedAt', null
      )
    )
  $test$,
  'EX202', 'execution_task_not_found',
  'another user''s task is not found for this session'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- Fill up to the D4 watchlist limit and confirm the next create is rejected.
select lives_ok(
  $test$
    do $block$
    declare
      v_existing bigint;
      v_index bigint;
    begin
      select count(*) into v_existing from public.watchlists
      where user_id = '50000000-0000-4000-8000-000000000001';
      for v_index in 1 .. (20 - v_existing) loop
        perform public.submit_create_watchlist(
          pg_catalog.jsonb_build_object(
            'idempotencyKey', 'owner-list-fill-' || v_index,
            'expectedVersion', 1,
            'name', '填充列表 ' || v_index
          )
        );
      end loop;
    end;
    $block$
  $test$,
  'the owner can fill the watchlist limit'
);

select throws_ok(
  $test$
    select public.submit_create_watchlist(
      '{"idempotencyKey":"owner-list-over","expectedVersion":1,"name":"超出上限"}'::jsonb
    )
  $test$,
  'EX206', 'execution_watchlist_limit_reached',
  'the twenty-first watchlist is rejected'
);

-- ---------------------------------------------------------------------------
-- Private reads stay private and carry the owned rows only.
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.list_my_execution_tasks()),
  1::bigint,
  'the owner reads exactly their own tasks'
);

select is(
  (select count(*) from public.list_my_watchlists()),
  20::bigint,
  'the owner reads exactly their own watchlists'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.list_my_execution_tasks()),
  0::bigint,
  'another user reads none of the owner''s tasks'
);

select is(
  (select count(*) from public.list_my_watchlists()),
  1::bigint,
  'another user reads only their own bootstrapped default list'
);

-- ---------------------------------------------------------------------------
-- Receipts and history are append-only at the table level.
-- ---------------------------------------------------------------------------

select throws_ok(
  $test$
    update public.user_task_events set title = '篡改'
    where user_id = '50000000-0000-4000-8000-000000000001'
  $test$,
  '55000', null, 'task history cannot be updated'
);

select throws_ok(
  $test$
    delete from public.user_task_events
    where user_id = '50000000-0000-4000-8000-000000000001'
  $test$,
  '55000', null, 'task history cannot be deleted'
);

select throws_ok(
  $test$
    update public.execution_command_receipts set response = '{}'::jsonb
  $test$,
  '55000', null, 'execution receipts cannot be updated'
);

select throws_ok(
  $test$
    delete from public.execution_command_receipts
  $test$,
  '55000', null, 'execution receipts cannot be deleted'
);

-- ---------------------------------------------------------------------------
-- Clean up only this suite's own fixture aggregates.
-- ---------------------------------------------------------------------------

select lives_ok(
  $test$
    do $block$
    begin
      delete from public.outbox_events
      where event_type like 'execution.%';
      delete from public.execution_command_receipts
      where user_id in (
        '50000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000002'
      );
      delete from public.user_task_events
      where user_id in (
        '50000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000002'
      );
      delete from public.user_tasks
      where user_id in (
        '50000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000002'
      );
      delete from public.watchlist_projects
      where watchlist_id in (
        select id from public.watchlists
        where user_id in (
          '50000000-0000-4000-8000-000000000001',
          '50000000-0000-4000-8000-000000000002'
        )
      );
      delete from public.watchlists
      where user_id in (
        '50000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000002'
      );
      delete from public.profiles
      where id in (
        '50000000-0000-4000-8000-00000000000a',
        '50000000-0000-4000-8000-00000000000b'
      );
      delete from auth.users
      where id in (
        '50000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000002'
      );
    end;
    $block$
  $test$,
  'this suite cleans up its own fixtures after asserting'
);

select is(
  (select count(*) from public.watchlists),
  0::bigint,
  'no watchlist fixture remains'
);

select is(
  (select count(*) from public.user_tasks),
  0::bigint,
  'no task fixture remains'
);

select is(
  (select count(*) from public.outbox_events where event_type like 'execution.%'),
  0::bigint,
  'no execution outbox fixture remains'
);

select * from finish();
rollback;
