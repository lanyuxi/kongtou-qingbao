-- Phase 10 Execution, forward-only follow-up: the participation read must
-- hand back the optimistic-lock version.
--
-- `submit_set_participation_status` rejects a command whose expectedVersion
-- does not match the stored row version (fresh rows must send 1), but the
-- original `get_my_participation` projection did not return the version, so a
-- client could never build a second update. Function bodies are replaceable
-- without touching migration history, so this repair redefines the read alone;
-- no table, policy, or command changes.
--
-- The projection gains a column, which changes its row type. `create or
-- replace` refuses to change an existing function's return type, so the read
-- is dropped first; the drop and create run inside one migration transaction,
-- so the function is never absent for a committed statement.

drop function if exists public.get_my_participation(uuid);

create function public.get_my_participation(p_project_id uuid)
returns table (
  "projectId" uuid,
  "participationStatus" public.participation_status,
  notes text,
  "startedAt" timestamptz,
  "updatedAt" timestamptz,
  "version" bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    participation.project_id,
    participation.participation_status,
    participation.notes,
    participation.started_at,
    participation.updated_at,
    participation.version
  from public.user_projects as participation
  where participation.user_id = auth.uid()
    and participation.project_id = p_project_id
$function$;

alter function public.get_my_participation(uuid) owner to postgres;
revoke all on function public.get_my_participation(uuid) from public, anon;
grant execute on function public.get_my_participation(uuid) to authenticated;
