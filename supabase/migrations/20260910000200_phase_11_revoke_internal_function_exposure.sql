-- Phase 11a: stop exposing internal SECURITY DEFINER helpers to the API roles.
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default. Supabase's
-- PostgREST turns every public-schema function reachable by the request role
-- into an RPC endpoint, so any helper that was never explicitly revoked became
-- an anonymous write path. Three helpers were affected:
--
--   1. queue_tutorials_for_review / block_tutorials_for_project
--      Internal status-coupling helpers. Every caller is another SECURITY
--      DEFINER function in this schema ("perform public.xxx(...)"), and no
--      application code calls them. Exposed, an anonymous POST to
--      /rest/v1/rpc/block_tutorials_for_project could flip any project's
--      published tutorials to `blocked` and forge tutorial_status_events —
--      a write to authoritative state with no authentication at all.
--      Verified before the fix: the call returned HTTP 204 from anon.
--
--   2. actor_has_active_reference_role(uuid)
--      Takes a user id and answers whether that user holds a review role.
--      Only called from inside other SECURITY DEFINER functions, to check the
--      *caller's own* id (always `v_actor` or `auth.uid()`). Exposed, it was a
--      role-membership oracle for any uuid an attacker cared to test.
--
-- Their owners stay postgres, and the internal callers run as postgres, so
-- revoking the API roles does not affect them. service_role keeps EXECUTE for
-- operational use.

revoke all on function public.queue_tutorials_for_review(uuid[], text)
  from public, anon, authenticated;
grant execute on function public.queue_tutorials_for_review(uuid[], text)
  to service_role;

revoke all on function public.block_tutorials_for_project(uuid)
  from public, anon, authenticated;
grant execute on function public.block_tutorials_for_project(uuid)
  to service_role;

revoke all on function public.actor_has_active_reference_role(uuid)
  from public, anon, authenticated;
grant execute on function public.actor_has_active_reference_role(uuid)
  to service_role;
