-- ---------------------------------------------------------------------------
-- Phase 8 deployment fix: public authority projection function grant
-- (migration 28)
--
-- First real deployment of the web app exposed a Phase 7B gap: the
-- `public_project_domain_authorities` view is `security_invoker`, and it calls
-- `domain_authority_current_state_v1` for every row. That function was revoked
-- from `public` when the reference boundary landed, and every sibling helper
-- used by the public projections was re-granted to `anon`/`authenticated` —
-- except this one. Anonymous reads of the authority projection therefore fail
-- with 42501, which takes the whole project detail page down (the loader reads
-- references and authorities in parallel).
--
-- The function only derives whether an authority is currently `granted`; it is
-- a read-model dependency of a public projection, so granting EXECUTE to
-- anonymous and authenticated readers matches the design intent of the 7B
-- grant block exactly.
-- ---------------------------------------------------------------------------

grant execute on function public.domain_authority_current_state_v1(uuid)
  to anon, authenticated;

comment on function public.domain_authority_current_state_v1(uuid) is
  'Read-model dependency of the public authority projection; EXECUTE granted to public readers (Phase 8 deployment fix).';
