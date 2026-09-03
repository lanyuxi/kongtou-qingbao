-- ---------------------------------------------------------------------------
-- Phase 8 follow-up: score-evidence read paths as definer RPCs
-- (migration 29)
--
-- The two public score projections are `security_invoker` views whose rows are
-- gated by `current_score_citation_path_is_public` / the sibling factor check.
-- Because that helper is a SECURITY DEFINER SQL function Postgres cannot inline
-- it, and because anon also carries RLS policies on the underlying tables that
-- call the same helper with partially-NULL arguments, a single anonymous read
-- executed the helper's 8-table EXISTS subquery per row: ~1.9s per request on
-- the 2GB production host (measured), which is why the project detail page had
-- to degrade those two sections to their empty state.
--
-- These two RPCs keep the views — and therefore the security logic — exactly as
-- they are. They only change *who executes the view*: a SECURITY DEFINER
-- wrapper runs the view with the view owner's rights, so the per-row RLS
-- evaluation of the underlying tables disappears while the view's own WHERE
-- clause still decides every row that is returned. Same rows, one execution.
--
-- Both functions are read-only, take the two identifiers the page already
-- filters on, and are granted to the same public readers the views were.
-- ---------------------------------------------------------------------------

create function public.list_public_score_factors(
  p_project_id uuid,
  p_project_score_id uuid
)
returns setof public.project_current_score_factors
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select factor_row.*
  from public.project_current_score_factors as factor_row
  where factor_row.project_id = p_project_id
    and factor_row.project_score_id = p_project_score_id
  limit 5000
$function$;

create function public.list_public_score_evidence_citations(
  p_project_id uuid,
  p_project_score_id uuid
)
returns setof public.project_current_score_evidence_citations
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select citation_row.*
  from public.project_current_score_evidence_citations as citation_row
  where citation_row.project_id = p_project_id
    and citation_row.project_score_id = p_project_score_id
  order by citation_row.signal_published_at desc nulls last,
    citation_row.signal_id asc,
    citation_row.evidence_verified_at desc,
    citation_row.evidence_id asc
  limit 5000
$function$;

comment on function public.list_public_score_factors(uuid, uuid) is
  'Read-only definer wrapper over the public score-factor projection; keeps the view gate and removes per-row RLS evaluation for public readers.';
comment on function public.list_public_score_evidence_citations(uuid, uuid) is
  'Read-only definer wrapper over the public score-Evidence citation projection; keeps the view gate and removes per-row RLS evaluation for public readers.';

alter function public.list_public_score_factors(uuid, uuid) owner to postgres;
alter function public.list_public_score_evidence_citations(uuid, uuid) owner to postgres;

revoke all on function public.list_public_score_factors(uuid, uuid)
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke all on function public.list_public_score_evidence_citations(uuid, uuid)
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;

grant execute on function public.list_public_score_factors(uuid, uuid)
to anon, authenticated;
grant execute on function public.list_public_score_evidence_citations(uuid, uuid)
to anon, authenticated;
