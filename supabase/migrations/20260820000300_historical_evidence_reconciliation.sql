-- Protected bounded scan for server-only historical Evidence reconciliation.

create function public.list_historical_extraction_candidates(
  p_after_candidate_id uuid,
  p_limit integer
)
returns table (
  candidate_id uuid,
  candidate_version bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'promotion_command_invalid' using errcode = 'AI106';
  end if;

  return query
  select candidate.id, candidate.version
  from public.extraction_candidates as candidate
  where candidate.status = 'promoted'
    and candidate.signal_id is not null
    and exists (
      select 1
      from public.signals as signal
      where signal.id = candidate.signal_id
    )
    and not exists (
      select 1
      from public.signal_evidence_links as evidence_link
      where evidence_link.signal_id = candidate.signal_id
    )
    and (p_after_candidate_id is null or candidate.id > p_after_candidate_id)
  order by candidate.id
  limit p_limit;
end;
$$;

alter function public.list_historical_extraction_candidates(uuid, integer)
owner to postgres;

revoke all on function public.list_historical_extraction_candidates(uuid, integer)
from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, promotion_service;

grant execute on function public.list_historical_extraction_candidates(uuid, integer)
to promotion_service;
