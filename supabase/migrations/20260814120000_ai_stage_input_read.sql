-- Grant the AI stage worker read access to collection intelligence inputs.
-- discovered_items and raw_items currently only allow collection_worker reads;
-- the extraction stage must list pending discovered items and join article text.

create policy discovered_items_select_ai_stage_worker
  on public.discovered_items
  for select
  to ai_stage_worker
  using (true);

create policy raw_items_select_ai_stage_worker
  on public.raw_items
  for select
  to ai_stage_worker
  using (true);
