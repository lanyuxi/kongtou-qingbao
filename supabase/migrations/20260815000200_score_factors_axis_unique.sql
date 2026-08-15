-- Fix score_factors uniqueness: factor codes are scoped per axis, not globally.
-- The original constraint rejected legitimate rows such as signal_volume
-- appearing on both the opportunity and confidence axes.

alter table public.score_factors drop constraint score_factors_code_unique_per_score;

alter table public.score_factors
  add constraint score_factors_code_unique_per_score unique (project_score_id, axis, factor_code);
