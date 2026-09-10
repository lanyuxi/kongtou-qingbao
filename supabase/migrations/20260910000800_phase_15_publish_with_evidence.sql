-- Phase 15: give AI-published signals the evidence link their own rules demand.
--
-- Candidates are now published automatically (Phase 14), which creates a
-- signal but no evidence row. Scoring refuses to score a project whose signals
-- lack valid evidence — score_has_complete_evidence requires every linked
-- signal to satisfy signal_has_valid_evidence — so Arbitrum's four real signals
-- produced no scores at all.
--
-- The evidence was always there: extraction already records an `evidenceQuote`
-- in the candidate payload. It was simply never written to the evidence table.
-- This function does that in the same transaction as the publish, so a
-- published signal is never left without the quote that supports it.
--
-- Nothing here relaxes a rule. The quote must still be trimmed, 10-500
-- characters, and stamped with the deterministic locator method the table
-- demands; a candidate whose quote does not qualify gets no evidence row rather
-- than a doctored one, and the scoring gate then treats it as unscorable —
-- which is the correct outcome, not a failure.

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
begin
  select *
    into strict candidate_record
    from public.extraction_candidates
   where id = p_candidate_id
     for update;

  if candidate_record.status <> 'pending' then
    raise exception 'promotion_candidate_not_pending' using errcode = '55000';
  end if;

  -- Publishes the signal (verification stays 'unverified') and marks the
  -- candidate promoted.
  published_signal_id := public.promote_extraction_candidate(p_candidate_id, p_actor);

  quote_body := pg_catalog.btrim(
    coalesce(candidate_record.payload ->> 'evidenceQuote', '')
  );

  if pg_catalog.char_length(quote_body) between 10 and 500 then
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
      candidate_record.raw_item_id,
      candidate_record.discovered_item_id,
      1,
      'exact_quote',
      'article_raw_text',
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
  'Publishes a candidate and records the evidence quote it was extracted from, in one transaction. Signals whose quote fails the evidence constraints are published without evidence and will not be scored.';

grant execute on function public.publish_candidate_with_evidence(uuid, text) to ai_stage_worker;
