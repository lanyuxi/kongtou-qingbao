-- Same gap as 20260910000500, one table further along the scoring path:
-- scoring reads `evidence` in order to cite it, and the role had no privilege
-- on that table at all.
--
-- Grant and policy are both handled, and the policy is created only when RLS is
-- actually enabled on the table: a GRANT alone does nothing behind RLS, and a
-- policy on a table without RLS is dead weight.

grant select on table public.evidence to ai_stage_worker;

do $$
begin
  if exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'evidence'
      and relation.relrowsecurity
  ) then
    drop policy if exists evidence_ai_stage_worker_read on public.evidence;
    create policy evidence_ai_stage_worker_read
    on public.evidence
    for select
    to ai_stage_worker
    using (true);
  end if;
end
$$;
