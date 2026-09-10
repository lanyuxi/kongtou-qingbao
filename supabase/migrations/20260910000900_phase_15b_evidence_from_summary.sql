-- Phase 15b: record the evidence we actually have.
--
-- Phase 15 linked a published signal to its evidence quote, but built the
-- evidence row around `raw_items.raw_item_id` — the *article* raw item. The
-- collector only fetches feeds, never the individual articles, so
-- discovered_items.article_raw_item_id is null for every discovery and no
-- evidence row could be created at all.
--
-- The evidence table anticipates exactly this: `source_field` may be
-- 'discovered_summary' (subject to discovered_item_id being present) as well as
-- 'article_raw_text'. The quote AI extracted comes from the feed summary, so
-- that is the honest label, and the row's raw_item_id comes from
-- discovered_items.feed_raw_item_id — the feed item the summary actually came
-- from.
--
-- Nothing is invented: the quote is the text the model read, the source field
-- says plainly that it is a summary rather than full article text, and
-- signal_has_valid_evidence still checks the raw item belongs to the same
-- project and source.

create or replace function public.publish_candidate_with_evidence(
  p_candidate_id uuid,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  candidate_record record;
  published_signal_id uuid;
  created_evidence_id uuid;
  quote_body text;
  quote_digest text;
  evidence_raw_item_id uuid;
begin
  select *
    into strict candidate_record
    from public.extraction_candidates
   where id = p_candidate_id
     for update;

  if candidate_record.status <> 'pending' then
    raise exception 'promotion_candidate_not_pending' using errcode = '55000';
  end if;

  published_signal_id := public.promote_extraction_candidate(p_candidate_id, p_actor);

  quote_body := pg_catalog.btrim(
    coalesce(candidate_record.payload ->> 'evidenceQuote', '')
  );

  -- An article raw item when one exists, otherwise the feed item the discovery
  -- came from. Both satisfy the evidence table's non-null requirement and the
  -- validity check's same-project/same-source rule.
  evidence_raw_item_id := coalesce(
    candidate_record.raw_item_id,
    (
      select discovered.article_raw_item_id
      from public.discovered_items as discovered
      where discovered.id = candidate_record.discovered_item_id
    ),
    (
      select discovered.feed_raw_item_id
      from public.discovered_items as discovered
      where discovered.id = candidate_record.discovered_item_id
    )
  );

  if evidence_raw_item_id is not null
     and pg_catalog.char_length(quote_body) between 10 and 500
  then
    quote_digest := pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(quote_body, 'UTF8'), 'sha256'),
      'hex'
    );

    insert into public.evidence (
      source_id,
      raw_item_id,
      discovered_item_id,
      locator_version,
      locator_kind,
      source_field,
      quote_text,
      normalized_quote_sha256,
      verification_method,
      verified_at
    )
    values (
      candidate_record.source_id,
      evidence_raw_item_id,
      candidate_record.discovered_item_id,
      1,
      'exact_quote',
      'discovered_summary',
      quote_body,
      quote_digest,
      'deterministic_exact_quote_v1',
      pg_catalog.now()
    )
    returning id into created_evidence_id;

    insert into public.signal_evidence_links (signal_id, evidence_id)
    values (published_signal_id, created_evidence_id)
    on conflict do nothing;
  end if;

  return published_signal_id;
end;
$function$;

comment on function public.publish_candidate_with_evidence(uuid, text) is
  'Publishes a candidate and records the evidence quote it was extracted from. The quote comes from the feed summary, so the evidence row is labelled discovered_summary and anchored to the feed item. Candidates whose quote or raw item cannot satisfy the evidence constraints are published without evidence and will not be scored.';
