-- ---------------------------------------------------------------------------
-- Phase 8 Task 8: tutorial candidate generation boundary (migration 27)
--
-- The tutorial ledger from migration 26 is reviewer-facing only: it exposes
-- the candidate table to no role at all (row level security is enabled and
-- every read goes through the protected submit/list RPCs). A worker stage that
-- turns verified participation signals into `tutorial_candidates` therefore
-- needs an explicit write boundary. It is added forward-only here rather than
-- by editing migration 26, which is already applied on the disposable stack.
--
-- Granted to `ai_stage_worker` only:
--  * select + insert on `tutorial_candidates`, with matching RLS policies, so
--    the generator can write candidates and detect its own idempotent
--    duplicates (project_id, kind, content_hash) without reading or mutating
--    anything the reviewer commands own.
--  * read access to the verified-reference projection the generator is
--    prompted with (`public_project_references` plus the underlying ledger
--    table, because the view is security_invoker and resolves its caller).
--
-- `ai_runs.input_kind` gains `tutorial_material`: a generation run is keyed by
-- a project and its deterministic material hash, not by a discovered or raw
-- item, and the existing check constraint would reject the row outright.
-- ---------------------------------------------------------------------------

alter table public.ai_runs drop constraint ai_runs_input_kind_valid;

alter table public.ai_runs
  add constraint ai_runs_input_kind_valid check (
    input_kind in ('discovered_item', 'raw_item', 'tutorial_material')
  );

comment on constraint ai_runs_input_kind_valid on public.ai_runs is
  'Generation stages may key a run by tutorial material (project + material hash) as well as by a collected item.';

-- ---------------------------------------------------------------------------
-- Candidate write boundary
-- ---------------------------------------------------------------------------

revoke all on table public.tutorial_candidates from public, anon, authenticated;

grant select, insert on table public.tutorial_candidates to ai_stage_worker;

drop policy if exists tutorial_candidates_ai_stage_worker_read on public.tutorial_candidates;
create policy tutorial_candidates_ai_stage_worker_read
on public.tutorial_candidates
for select
to ai_stage_worker
using (true);

drop policy if exists tutorial_candidates_ai_stage_worker_insert on public.tutorial_candidates;
create policy tutorial_candidates_ai_stage_worker_insert
on public.tutorial_candidates
for insert
to ai_stage_worker
with check (
  status = 'pending'
  and version = 1
  and content_hash ~ '^[0-9a-f]{64}$'
  and pg_catalog.array_length(source_signal_ids, 1) between 1 and 10
  and kind in (
    'airdrop_campaign',
    'points_program',
    'snapshot_notice',
    'task_launch',
    'token_launch',
    'eligibility_rule'
  )
);

comment on policy tutorial_candidates_ai_stage_worker_insert on public.tutorial_candidates is
  'The generator may only append fresh pending candidates; promotion, rejection and publication stay behind the reviewer commands.';

-- ---------------------------------------------------------------------------
-- Verified-reference allowlist read boundary
-- ---------------------------------------------------------------------------

grant select on table public.public_project_references to ai_stage_worker;
grant select on table public.project_references to ai_stage_worker;

drop policy if exists project_references_ai_stage_worker_read on public.project_references;
create policy project_references_ai_stage_worker_read
on public.project_references
for select
to ai_stage_worker
using (true);

comment on policy project_references_ai_stage_worker_read on public.project_references is
  'Required by the security-invoker reference projection: the generator reads verified, renderable references to build its link allowlist.';
