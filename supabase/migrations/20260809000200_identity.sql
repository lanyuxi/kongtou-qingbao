create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text null,
  avatar_url text null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_valid check (
    display_name is null
    or (
      display_name = pg_catalog.btrim(display_name)
      and pg_catalog.char_length(display_name) between 1 and 80
    )
  ),
  constraint profiles_avatar_url_https check (
    avatar_url is null
    or avatar_url ~ '^https://'
  )
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete restrict,
  role public.app_role not null,
  granted_by uuid null references public.profiles (id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz null,
  primary key (user_id, role, granted_at),
  constraint user_roles_revoked_after_granted check (
    revoked_at is null
    or revoked_at > granted_at
  )
);

create unique index user_roles_one_active_grant
on public.user_roles (user_id, role)
where revoked_at is null;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id)
  values (new.id);

  return new;
end;
$$;

create function public.has_active_role(requested_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.user_roles as role_grant
    where role_grant.user_id = auth.uid()
      and role_grant.role = requested_role
      and role_grant.revoked_at is null
  );
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create function public.enforce_user_role_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.role is distinct from old.role
    or new.granted_by is distinct from old.granted_by
    or new.granted_at is distinct from old.granted_at
    or (
      old.revoked_at is not null
      and new.revoked_at is distinct from old.revoked_at
    )
  then
    raise exception 'user_role_history_immutable'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id)
select auth_user.id
from auth.users as auth_user
on conflict (id) do nothing;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger user_roles_enforce_history
before update on public.user_roles
for each row execute function public.enforce_user_role_history();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

revoke all on table public.profiles from public, anon, authenticated, service_role;
revoke all on table public.user_roles from public, anon, authenticated, service_role;

grant select on table public.profiles to authenticated, service_role;
grant update (display_name, avatar_url, timezone) on table public.profiles to authenticated;

grant select on table public.user_roles to authenticated, service_role;
grant insert on table public.user_roles to service_role;
grant update (revoked_at) on table public.user_roles to service_role;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy user_roles_select_own
on public.user_roles
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.has_active_role(public.app_role) from public, anon, authenticated, service_role;
revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.enforce_user_role_history() from public, anon, authenticated, service_role;

grant execute on function public.has_active_role(public.app_role) to authenticated, service_role;
