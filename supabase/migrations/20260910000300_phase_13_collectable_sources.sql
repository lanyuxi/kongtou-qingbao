-- Phase 13: separate "is this the project's official channel" from "may we collect this source".
--
-- is_source_collection_eligible() used project_sources.is_official as the gate
-- for enqueueing collection work. Those answer two different questions:
--
--   project_sources.is_official  "does this source speak for the project?"
--                                an authority judgement, consumed by scoring,
--                                references and the review workspace.
--   sources.collectable          "may the collector fetch this source?"
--                                an operational decision, which also applies
--                                to media and aggregator feeds.
--
-- Conflating them meant a curated news feed could be registered, given a
-- schedule, and then silently never collected: the schedule existed but the
-- enqueue loop rejected it. That is what happened to the four media feeds and
-- the two airdrop aggregators added in Phase 12.
--
-- The authority requirement is NOT relaxed: a (project, source) pairing still
-- needs verified_at and verified_by, i.e. somebody explicitly vouched for it.
-- Only the operational gate changed.

alter table public.sources
  add column if not exists collectable boolean not null default true;

comment on column public.sources.collectable is
  'Operational gate: may the collector fetch this source. Distinct from project_sources.is_official, which is an authority judgement.';

create or replace function public.is_source_collection_eligible(project_id uuid, source_id uuid)
returns boolean
language sql
stable security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.project_sources as project_source
    join public.projects as project_record on project_record.id = project_source.project_id
    join public.sources as source_record on source_record.id = project_source.source_id
    where project_source.project_id = is_source_collection_eligible.project_id
      and project_source.source_id = is_source_collection_eligible.source_id
      and project_record.lifecycle = 'active'
      and source_record.status = 'active'
      -- Operational gate (replaces the old `project_source.is_official`).
      and source_record.collectable
      -- Authority gate, unchanged: a human verified this pairing.
      and project_source.verified_at is not null
      and project_source.verified_by is not null
      and public.current_security_target_posture('source', source_record.id) <> 'blocked'
  );
$function$;
