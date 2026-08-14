-- Extend the project_current_state read model with fields the project detail
-- page renders: the official website link plus the latest score's model,
-- input version, and explanation. Read models stay the only anon-facing
-- surface; base table column grants are unchanged.
-- New columns must be appended after the existing ones for CREATE OR REPLACE.

create or replace view public.project_current_state
with (security_invoker = true, security_barrier = true)
as
select project.id as project_id,
    project.slug,
    project.name,
    project.summary,
    project.lifecycle,
    project.primary_chain,
    project.version as project_version,
    project.updated_at as project_updated_at,
    latest_score.opportunity_score,
    latest_score.risk_score,
    latest_score.confidence as score_confidence,
    latest_score.recommendation,
    latest_score.calculated_at as score_calculated_at,
    latest_signal.latest_published_signal_at,
    project.official_website_url,
    latest_score.model_version as score_model_version,
    latest_score.input_version as score_input_version,
    latest_score.explanation as score_explanation
from projects project
  left join lateral (
    select score.opportunity_score,
      score.risk_score,
      score.confidence,
      score.recommendation,
      score.model_version,
      score.input_version,
      score.explanation,
      score.calculated_at
    from project_scores score
    where score.project_id = project.id
    order by score.calculated_at desc, score.id desc
    limit 1
  ) latest_score on true
  left join lateral (
    select max(signal.published_at) as latest_published_signal_at
    from signals signal
    where signal.project_id = project.id
      and signal.lifecycle = 'published'::signal_lifecycle
  ) latest_signal on true;

-- Keep the anon-facing read grant explicit in case ACLs were rebuilt.
revoke all on table public.project_current_state from public, anon, authenticated, service_role;
grant select on table public.project_current_state to anon, authenticated;
grant select on table public.project_current_state to service_role;
