alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.projects enable row level security;
alter table public.sources enable row level security;
alter table public.project_sources enable row level security;
alter table public.signals enable row level security;
alter table public.project_scores enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_projects enable row level security;
alter table public.user_projects enable row level security;
alter table public.user_tasks enable row level security;

drop policy profiles_select_own on public.profiles;
drop policy profiles_update_own on public.profiles;
drop policy user_roles_select_own on public.user_roles;
drop policy projects_read_active on public.projects;
drop policy sources_read_active on public.sources;
drop policy project_sources_read_active on public.project_sources;
drop policy signals_read_published_active_project on public.signals;
drop policy watchlists_select_authenticated on public.watchlists;
drop policy watchlists_insert_authenticated on public.watchlists;
drop policy watchlists_update_authenticated on public.watchlists;
drop policy watchlists_delete_authenticated on public.watchlists;
drop policy watchlist_projects_select_authenticated on public.watchlist_projects;
drop policy watchlist_projects_insert_authenticated on public.watchlist_projects;
drop policy watchlist_projects_delete_authenticated on public.watchlist_projects;
drop policy user_projects_select_authenticated on public.user_projects;
drop policy user_projects_insert_authenticated on public.user_projects;
drop policy user_projects_update_authenticated on public.user_projects;
drop policy user_projects_delete_authenticated on public.user_projects;
drop policy user_tasks_select_authenticated on public.user_tasks;
drop policy user_tasks_insert_authenticated on public.user_tasks;
drop policy user_tasks_delete_authenticated on public.user_tasks;

grant select (
  id,
  project_id,
  opportunity_score,
  risk_score,
  confidence,
  recommendation,
  calculated_at
)
on public.project_scores to anon, authenticated;

create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

comment on policy profiles_select_authenticated on public.profiles is
  'Authenticated users may read only their own profile.';

create policy profiles_update_authenticated
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

comment on policy profiles_update_authenticated on public.profiles is
  'Authenticated users may update only their own profile without changing ownership.';

create policy user_roles_select_authenticated
on public.user_roles
for select
to authenticated
using ((select auth.uid()) = user_id);

comment on policy user_roles_select_authenticated on public.user_roles is
  'Authenticated users may read only their own role history.';

create policy projects_select_anon
on public.projects
for select
to anon
using (lifecycle in ('active', 'rumored'));

comment on policy projects_select_anon on public.projects is
  'Anonymous users may read safe columns from active or rumored projects.';

create policy projects_select_authenticated
on public.projects
for select
to authenticated
using (lifecycle in ('active', 'rumored'));

comment on policy projects_select_authenticated on public.projects is
  'Authenticated browser users may read safe columns from active or rumored projects.';

create policy sources_select_anon
on public.sources
for select
to anon
using (status = 'active');

comment on policy sources_select_anon on public.sources is
  'Anonymous users may read safe columns from active sources.';

create policy sources_select_authenticated
on public.sources
for select
to authenticated
using (status = 'active');

comment on policy sources_select_authenticated on public.sources is
  'Authenticated browser users may read safe columns from active sources.';

create policy project_sources_select_anon
on public.project_sources
for select
to anon
using (
  exists (
    select 1
    from public.projects as project
    where project.id = project_sources.project_id
      and project.lifecycle = 'active'
  )
  and exists (
    select 1
    from public.sources as source
    where source.id = project_sources.source_id
      and source.status = 'active'
  )
);

comment on policy project_sources_select_anon on public.project_sources is
  'Anonymous users may read safe relation columns only when both catalog parents are active.';

create policy project_sources_select_authenticated
on public.project_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.projects as project
    where project.id = project_sources.project_id
      and project.lifecycle = 'active'
  )
  and exists (
    select 1
    from public.sources as source
    where source.id = project_sources.source_id
      and source.status = 'active'
  )
);

comment on policy project_sources_select_authenticated on public.project_sources is
  'Authenticated browser users may read safe relation columns only when both catalog parents are active.';

create policy signals_select_anon
on public.signals
for select
to anon
using (
  lifecycle = 'published'
  and exists (
    select 1
    from public.projects as project
    where project.id = signals.project_id
      and project.lifecycle = 'active'
  )
);

comment on policy signals_select_anon on public.signals is
  'Anonymous users may read published signals whose parent project is active.';

create policy signals_select_authenticated
on public.signals
for select
to authenticated
using (
  lifecycle = 'published'
  and exists (
    select 1
    from public.projects as project
    where project.id = signals.project_id
      and project.lifecycle = 'active'
  )
);

comment on policy signals_select_authenticated on public.signals is
  'Authenticated browser users may read published signals whose parent project is active.';

create policy project_scores_select_anon
on public.project_scores
for select
to anon
using (
  exists (
    select 1
    from public.projects as project
    where project.id = project_scores.project_id
      and project.lifecycle in ('active', 'rumored')
  )
);

comment on policy project_scores_select_anon on public.project_scores is
  'Anonymous users may read safe score columns for active or rumored projects.';

create policy project_scores_select_authenticated
on public.project_scores
for select
to authenticated
using (
  exists (
    select 1
    from public.projects as project
    where project.id = project_scores.project_id
      and project.lifecycle in ('active', 'rumored')
  )
);

comment on policy project_scores_select_authenticated on public.project_scores is
  'Authenticated browser users may read safe score columns for active or rumored projects.';

create policy watchlists_select_authenticated
on public.watchlists
for select
to authenticated
using ((select auth.uid()) = user_id);

comment on policy watchlists_select_authenticated on public.watchlists is
  'Authenticated users may read only their own watchlists.';

create policy watchlists_insert_authenticated
on public.watchlists
for insert
to authenticated
with check ((select auth.uid()) = user_id);

comment on policy watchlists_insert_authenticated on public.watchlists is
  'Authenticated users may create only watchlists they own.';

create policy watchlists_update_authenticated
on public.watchlists
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

comment on policy watchlists_update_authenticated on public.watchlists is
  'Authenticated users may update only their own watchlists without changing ownership.';

create policy watchlists_delete_authenticated
on public.watchlists
for delete
to authenticated
using ((select auth.uid()) = user_id);

comment on policy watchlists_delete_authenticated on public.watchlists is
  'Authenticated users may delete only their own watchlists.';

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

comment on policy watchlist_projects_select_authenticated on public.watchlist_projects is
  'Authenticated users may read projects attached to their own watchlists.';

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

comment on policy watchlist_projects_insert_authenticated on public.watchlist_projects is
  'Authenticated users may attach projects only to their own watchlists.';

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

comment on policy watchlist_projects_delete_authenticated on public.watchlist_projects is
  'Authenticated users may remove projects only from their own watchlists.';

create policy user_projects_select_authenticated
on public.user_projects
for select
to authenticated
using ((select auth.uid()) = user_id);

comment on policy user_projects_select_authenticated on public.user_projects is
  'Authenticated users may read only their own project tracking records.';

create policy user_projects_insert_authenticated
on public.user_projects
for insert
to authenticated
with check ((select auth.uid()) = user_id);

comment on policy user_projects_insert_authenticated on public.user_projects is
  'Authenticated users may create only project tracking records they own.';

create policy user_projects_update_authenticated
on public.user_projects
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

comment on policy user_projects_update_authenticated on public.user_projects is
  'Authenticated users may update only their own project tracking records without changing ownership.';

create policy user_projects_delete_authenticated
on public.user_projects
for delete
to authenticated
using ((select auth.uid()) = user_id);

comment on policy user_projects_delete_authenticated on public.user_projects is
  'Authenticated users may delete only their own project tracking records.';

create policy user_tasks_select_authenticated
on public.user_tasks
for select
to authenticated
using ((select auth.uid()) = user_id);

comment on policy user_tasks_select_authenticated on public.user_tasks is
  'Authenticated users may read only their own tasks.';

create policy user_tasks_insert_authenticated
on public.user_tasks
for insert
to authenticated
with check ((select auth.uid()) = user_id);

comment on policy user_tasks_insert_authenticated on public.user_tasks is
  'Authenticated users may create only tasks they own.';

create policy user_tasks_delete_authenticated
on public.user_tasks
for delete
to authenticated
using ((select auth.uid()) = user_id);

comment on policy user_tasks_delete_authenticated on public.user_tasks is
  'Authenticated users may delete only their own tasks.';
