create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watchlists_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 1 and 80
  ),
  unique (user_id, name)
);

create table public.watchlist_projects (
  watchlist_id uuid not null references public.watchlists (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (watchlist_id, project_id)
);

create table public.user_projects (
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  participation_status public.participation_status not null default 'interested',
  notes text null,
  started_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id),
  constraint user_projects_notes_valid check (
    notes is null
    or pg_catalog.char_length(notes) <= 4000
  )
);

create table public.user_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid null references public.projects (id) on delete set null,
  title text not null,
  status public.task_status not null default 'backlog',
  priority public.task_priority not null default 'medium',
  due_at timestamptz null,
  completed_at timestamptz null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_tasks_title_valid check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 1 and 200
  ),
  constraint user_tasks_completed_at_matches_status check (
    (status = 'completed') = (completed_at is not null)
  ),
  constraint user_tasks_version_positive check (version > 0)
);

create unique index watchlists_one_default_per_user
on public.watchlists (user_id)
where is_default = true;

create index user_tasks_user_status_due_at_idx
on public.user_tasks (user_id, status, due_at);

create trigger watchlists_set_updated_at
before update on public.watchlists
for each row execute function public.set_updated_at();

create trigger user_projects_set_updated_at
before update on public.user_projects
for each row execute function public.set_updated_at();

alter table public.watchlists enable row level security;
alter table public.watchlist_projects enable row level security;
alter table public.user_projects enable row level security;
alter table public.user_tasks enable row level security;

revoke all on table public.watchlists from public, anon, authenticated, service_role;
revoke all on table public.watchlist_projects from public, anon, authenticated, service_role;
revoke all on table public.user_projects from public, anon, authenticated, service_role;
revoke all on table public.user_tasks from public, anon, authenticated, service_role;

grant select, delete on table public.watchlists to authenticated;
grant insert (user_id, name, is_default) on table public.watchlists to authenticated;
grant update (name, is_default) on table public.watchlists to authenticated;

grant select, delete on table public.watchlist_projects to authenticated;
grant insert (watchlist_id, project_id) on table public.watchlist_projects to authenticated;

grant select, delete on table public.user_projects to authenticated;
grant insert (user_id, project_id, participation_status, notes, started_at)
on table public.user_projects to authenticated;
grant update (participation_status, notes, started_at)
on table public.user_projects to authenticated;

grant select, delete on table public.user_tasks to authenticated;
grant insert (user_id, project_id, title, status, priority, due_at, completed_at)
on table public.user_tasks to authenticated;

create policy watchlists_select_authenticated
on public.watchlists
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy watchlists_insert_authenticated
on public.watchlists
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy watchlists_update_authenticated
on public.watchlists
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy watchlists_delete_authenticated
on public.watchlists
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy watchlist_projects_select_authenticated
on public.watchlist_projects
for select
to authenticated
using (
  exists (
    select 1
    from public.watchlists as watchlist
    where watchlist.id = watchlist_projects.watchlist_id
      and watchlist.user_id = (select auth.uid())
  )
);

create policy watchlist_projects_insert_authenticated
on public.watchlist_projects
for insert
to authenticated
with check (
  exists (
    select 1
    from public.watchlists as watchlist
    where watchlist.id = watchlist_projects.watchlist_id
      and watchlist.user_id = (select auth.uid())
  )
);

create policy watchlist_projects_delete_authenticated
on public.watchlist_projects
for delete
to authenticated
using (
  exists (
    select 1
    from public.watchlists as watchlist
    where watchlist.id = watchlist_projects.watchlist_id
      and watchlist.user_id = (select auth.uid())
  )
);

create policy user_projects_select_authenticated
on public.user_projects
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy user_projects_insert_authenticated
on public.user_projects
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy user_projects_update_authenticated
on public.user_projects
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy user_projects_delete_authenticated
on public.user_projects
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy user_tasks_select_authenticated
on public.user_tasks
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy user_tasks_insert_authenticated
on public.user_tasks
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy user_tasks_delete_authenticated
on public.user_tasks
for delete
to authenticated
using ((select auth.uid()) = user_id);

create function public.update_user_task(
  task_id uuid,
  expected_version bigint,
  patch jsonb
)
returns public.user_tasks
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  current_task public.user_tasks%rowtype;
  patched_task public.user_tasks%rowtype;
  unknown_fields text;
  casting_field text;
  next_updated_at timestamptz;
begin
  if expected_version is null or expected_version <= 0 then
    raise exception 'user_task_expected_version_invalid'
      using
        errcode = '22023',
        detail = 'expected_version_must_be_positive';
  end if;

  if patch is null or pg_catalog.jsonb_typeof(patch) <> 'object' then
    raise exception 'user_task_patch_invalid'
      using
        errcode = '22023',
        detail = 'patch_must_be_an_object';
  end if;

  select pg_catalog.string_agg(supplied_field.field_name, ',' order by supplied_field.field_name)
  into unknown_fields
  from pg_catalog.jsonb_object_keys(patch) as supplied_field(field_name)
  where supplied_field.field_name not in (
    'project_id',
    'title',
    'status',
    'priority',
    'due_at',
    'completed_at'
  );

  if unknown_fields is not null then
    raise exception 'user_task_patch_invalid'
      using
        errcode = '22023',
        detail = pg_catalog.format('unknown_fields=%s', unknown_fields);
  end if;

  if patch ? 'title' and pg_catalog.jsonb_typeof(patch -> 'title') <> 'string' then
    raise exception 'user_task_patch_invalid'
      using
        errcode = '22023',
        detail = 'field=title,expected=string';
  end if;

  if patch ? 'status' and pg_catalog.jsonb_typeof(patch -> 'status') <> 'string' then
    raise exception 'user_task_patch_invalid'
      using
        errcode = '22023',
        detail = 'field=status,expected=string';
  end if;

  if patch ? 'priority' and pg_catalog.jsonb_typeof(patch -> 'priority') <> 'string' then
    raise exception 'user_task_patch_invalid'
      using
        errcode = '22023',
        detail = 'field=priority,expected=string';
  end if;

  if patch ? 'project_id'
    and pg_catalog.jsonb_typeof(patch -> 'project_id') not in ('string', 'null')
  then
    raise exception 'user_task_patch_invalid'
      using
        errcode = '22023',
        detail = 'field=project_id,expected=string_or_null';
  end if;

  if patch ? 'due_at'
    and pg_catalog.jsonb_typeof(patch -> 'due_at') not in ('string', 'null')
  then
    raise exception 'user_task_patch_invalid'
      using
        errcode = '22023',
        detail = 'field=due_at,expected=string_or_null';
  end if;

  if patch ? 'completed_at'
    and pg_catalog.jsonb_typeof(patch -> 'completed_at') not in ('string', 'null')
  then
    raise exception 'user_task_patch_invalid'
      using
        errcode = '22023',
        detail = 'field=completed_at,expected=string_or_null';
  end if;

  select task.*
  into current_task
  from public.user_tasks as task
  where task.id = $1
    and task.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'user_task_not_found'
      using
        errcode = 'PT404',
        detail = 'task_not_found_or_not_owned';
  end if;

  if current_task.version <> expected_version then
    raise exception 'user_task_version_conflict'
      using
        errcode = 'PT409',
        detail = pg_catalog.format(
          'expected_version=%s,current_version=%s',
          expected_version,
          current_task.version
        );
  end if;

  patched_task := current_task;

  begin
    if patch ? 'project_id' then
      casting_field := 'project_id';
      patched_task.project_id := (patch ->> 'project_id')::uuid;
    end if;

    if patch ? 'title' then
      patched_task.title := patch ->> 'title';
    end if;

    if patch ? 'status' then
      casting_field := 'status';
      patched_task.status := (patch ->> 'status')::public.task_status;
    end if;

    if patch ? 'priority' then
      casting_field := 'priority';
      patched_task.priority := (patch ->> 'priority')::public.task_priority;
    end if;

    if patch ? 'due_at' then
      casting_field := 'due_at';
      patched_task.due_at := (patch ->> 'due_at')::timestamptz;
    end if;

    if patch ? 'completed_at' then
      casting_field := 'completed_at';
      patched_task.completed_at := (patch ->> 'completed_at')::timestamptz;
    end if;
  exception
    when data_exception then
      raise exception 'user_task_patch_invalid'
        using
          errcode = '22023',
          detail = pg_catalog.format('field=%s,expected=valid_string_value', casting_field);
  end;

  if row(
    patched_task.project_id,
    patched_task.title,
    patched_task.status,
    patched_task.priority,
    patched_task.due_at,
    patched_task.completed_at
  ) is not distinct from row(
    current_task.project_id,
    current_task.title,
    current_task.status,
    current_task.priority,
    current_task.due_at,
    current_task.completed_at
  ) then
    return current_task;
  end if;

  if not pg_catalog.isfinite(current_task.updated_at) then
    raise exception 'user_task_updated_at_exhausted'
      using errcode = 'datetime_field_overflow';
  end if;

  begin
    next_updated_at := greatest(
      pg_catalog.clock_timestamp(),
      current_task.updated_at + interval '1 microsecond'
    );
  exception
    when datetime_field_overflow then
      raise exception 'user_task_updated_at_exhausted'
        using errcode = 'datetime_field_overflow';
  end;

  update public.user_tasks as task
  set
    project_id = patched_task.project_id,
    title = patched_task.title,
    status = patched_task.status,
    priority = patched_task.priority,
    due_at = patched_task.due_at,
    completed_at = patched_task.completed_at,
    version = task.version + 1,
    updated_at = next_updated_at
  where task.id = current_task.id
    and task.user_id = current_task.user_id
    and task.version = expected_version
  returning task.* into current_task;

  if not found then
    raise exception 'user_task_version_conflict'
      using
        errcode = 'PT409',
        detail = pg_catalog.format('expected_version=%s,current_version=changed', expected_version);
  end if;

  return current_task;
end;
$$;

revoke all on function public.update_user_task(uuid, bigint, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.update_user_task(uuid, bigint, jsonb)
to authenticated;
