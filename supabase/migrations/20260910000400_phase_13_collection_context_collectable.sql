-- Phase 13b: the same conflation, in the second place it appears.
--
-- 20260910000300 fixed is_source_collection_eligible(), which decides whether a
-- scheduled source gets *enqueued*. But load_source_collection_context() gated
-- on project_sources.is_official too, and the collector maps a null context to
-- the `rejected_url` outcome. So fixing only the eligibility check did not make
-- media sources collectable — it just moved the blocker one step later, which
-- showed up as all six feeds dead-lettering with `rejected_url`.
--
-- Both gates now ask the operational question (`sources.collectable`) while the
-- authority requirement (verified_at / verified_by) stays exactly as it was.

create or replace function public.load_source_collection_context(
  requested_project_id uuid,
  requested_source_id uuid
)
returns table(project_id uuid, source_id uuid, canonical_url text, authority_domains text[])
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if requested_project_id is null or requested_source_id is null then
    raise exception 'source_collection_context_ids_required' using errcode = '22004';
  end if;

  return query
  select
    project_source.project_id,
    project_source.source_id,
    source_record.canonical_url,
    project_source.authority_domains
  from public.project_sources as project_source
  join public.projects as project_record
    on project_record.id = project_source.project_id
  join public.sources as source_record
    on source_record.id = project_source.source_id
  where project_source.project_id = requested_project_id
    and project_source.source_id = requested_source_id
    -- Operational gate (replaces the old `project_source.is_official`).
    and source_record.collectable
    -- Authority gate, unchanged.
    and project_source.verified_at is not null
    and project_source.verified_by is not null
    and project_record.lifecycle = 'active'
    and source_record.status = 'active'
    and public.current_security_target_posture('source', source_record.id) <> 'blocked';
end;
$function$;
