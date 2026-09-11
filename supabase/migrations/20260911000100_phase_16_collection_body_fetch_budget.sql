-- Phase 16: align the body-fetch budget end to end.
--
-- The collector raised its per-pass article budget from 20 to 35
-- (`MAX_ARTICLE_FETCHES`, now sourced from the contract constant
-- `MAX_COLLECTION_BODY_FETCHES`) so a busy feed could clear a whole cycle's
-- worth of items instead of leaving the tail permanently behind.
--
-- Two bounds were not raised with it:
--
--   packages/contracts/.../source-collection.ts  bodyFetchCount max(20)
--   collection_attempts_body_fetch_count_valid   between 0 and 20
--
-- The effect was not a cosmetic mismatch. A pass with more than 20 eligible
-- entries produced bodyFetchCount = 35, which failed strict result parsing and,
-- before that, the check constraint — so the commitFeed transaction rolled back
-- and the entire batch of raw items and discoveries was lost, with the attempt
-- recorded as persistence_failed. Every source publishing more than 20 new
-- items in one cycle was affected.
--
-- The contract bound is now a single exported constant. This migration brings
-- the database in line with it. Existing rows are all <= 20, so the added
-- validation passes without touching a single row.
--
-- The authority/eligibility gates are untouched: this only widens a numeric
-- bound that was already enforced by the collector.

alter table public.collection_attempts
  drop constraint if exists collection_attempts_body_fetch_count_valid;

alter table public.collection_attempts
  add constraint collection_attempts_body_fetch_count_valid check (
    body_fetch_count between 0 and 35
  );

comment on constraint collection_attempts_body_fetch_count_valid on public.collection_attempts is
  'Ceiling for one collection pass''s article fetches. Must equal the contract constant MAX_COLLECTION_BODY_FETCHES; raising the collector budget alone caused whole-batch rollbacks.';
