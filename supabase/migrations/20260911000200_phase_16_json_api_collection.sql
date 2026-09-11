-- Phase 16: collect JSON APIs as a first-class content kind.
--
-- The collector now understands `application/json` responses, but only for
-- sources whose configured URL matches a registered adapter (see
-- `selectJsonApiAdapter` in packages/domain). The raw response body is still
-- stored verbatim in `raw_items` as the evidence base; the entries the adapter
-- derives from it are discoveries, exactly like Feed entries, and are always
-- `discovered_only` because a JSON entry has no article body of its own.
--
-- This migration only extends the enum. It is purely additive: existing rows are
-- untouched, and code that does not know the new value is unaffected.
--
-- Note on execution: `ALTER TYPE ... ADD VALUE` may run inside a transaction on
-- PostgreSQL 12+, but the new value cannot be *used* until that transaction
-- commits. This migration therefore only adds the value — nothing in this file
-- reads or writes `json_api`, so it is safe either way. Do not add statements
-- that use the new value here; put those in a later migration.

alter type public.collection_content_kind add value if not exists 'json_api';
