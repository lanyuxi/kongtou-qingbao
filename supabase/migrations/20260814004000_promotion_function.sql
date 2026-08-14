-- Promotion Service primitive: promote one extraction candidate to a canonical
-- published signal in a single transaction (signal insert + candidate state
-- transition + append-only promotion event). Security definer mirrors the
-- collection context loader boundary; callers act as ai_stage_worker.

create or replace function public.promote_extraction_candidate(
  p_candidate_id uuid,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate record;
  new_signal_id uuid;
begin
  if p_candidate_id is null then
    raise exception 'promotion_candidate_id_required' using errcode = '22004';
  end if;
  if p_actor is null or pg_catalog.btrim(p_actor) = '' then
    raise exception 'promotion_actor_required' using errcode = '22004';
  end if;

  select *
  into strict candidate
  from public.extraction_candidates
  where id = p_candidate_id
  for update;

  if candidate.status <> 'pending' then
    raise exception 'promotion_candidate_not_pending' using errcode = '55000';
  end if;

  insert into public.signals (
    project_id,
    signal_type,
    title,
    summary,
    verification,
    lifecycle,
    confidence,
    occurred_at,
    published_at
  )
  values (
    candidate.project_id,
    candidate.payload->>'signalType',
    candidate.payload->>'title',
    candidate.payload->>'summary',
    'unverified',
    'published',
    (candidate.payload->>'confidence')::numeric,
    nullif(candidate.payload->>'occurredAtIso', '')::timestamptz,
    now()
  )
  returning id into new_signal_id;

  update public.extraction_candidates
  set status = 'promoted',
    signal_id = new_signal_id,
    decided_at = now()
  where id = p_candidate_id;

  insert into public.promotion_events (candidate_id, signal_id, actor)
  values (p_candidate_id, new_signal_id, p_actor);

  return new_signal_id;
end;
$$;

alter function public.promote_extraction_candidate(uuid, text) owner to postgres;

revoke all on function public.promote_extraction_candidate(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function public.promote_extraction_candidate(uuid, text)
to ai_stage_worker;
