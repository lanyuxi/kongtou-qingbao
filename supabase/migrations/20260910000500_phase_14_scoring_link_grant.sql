-- Phase 14: let the AI stage write signal↔evidence links.
--
-- Scoring links a score factor to the evidence supporting it, and that link
-- lives in signal_evidence_links. The table grants access to postgres alone,
-- and its RLS policies cover only anon/authenticated SELECT, so ai_stage_worker
-- could neither be granted nor permitted to insert. Every scoring run therefore
-- died with "permission denied for table signal_evidence_links", which the
-- repository wraps into a generic scoring_persistence_failed — the reason the
-- failure only surfaced once the cause was included in the response.
--
-- This is the same class of gap as the collection roles earlier today: the
-- table was created with its reader policies but never its writer.

grant select, insert on table public.signal_evidence_links to ai_stage_worker;

drop policy if exists signal_evidence_links_ai_stage_worker_read
  on public.signal_evidence_links;
create policy signal_evidence_links_ai_stage_worker_read
on public.signal_evidence_links
for select
to ai_stage_worker
using (true);

drop policy if exists signal_evidence_links_ai_stage_worker_insert
  on public.signal_evidence_links;
create policy signal_evidence_links_ai_stage_worker_insert
on public.signal_evidence_links
for insert
to ai_stage_worker
with check (true);

comment on policy signal_evidence_links_ai_stage_worker_insert
  on public.signal_evidence_links is
  'The scoring stage writes these links. Unrestricted for the worker role: what is publicly readable is decided by the reader policies, not by what the writer was allowed to store.';
