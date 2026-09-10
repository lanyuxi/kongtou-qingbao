-- Close the rest of the AI stage's permission gaps in one go.
--
-- Scoring walks a path that touches several public helper functions (the first
-- one hit was reference_is_publicly_renderable_v1, and the two migrations
-- before this one each fixed a single table). Discovering them one failed
-- deploy at a time is the wrong loop: the role's needs are "whatever the
-- pipeline calls", and enumerating that by trial costs a deploy per guess.
--
-- ai_stage_worker is a database role used only by the worker process — the
-- browser never authenticates as it. Anyone who can act as this role already
-- holds a database connection, so schema-wide EXECUTE does not widen the
-- attack surface the way it would for anon/authenticated.
grant execute on all functions in schema public to ai_stage_worker;

-- And for functions added by later migrations, so this gap cannot reopen.
alter default privileges in schema public
  grant execute on functions to ai_stage_worker;
