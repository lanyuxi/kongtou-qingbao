import { z } from 'zod';

import { createJobEnvelopeSchema } from '../jobs/envelope.js';

export const collectionOutcomeSchema = z.enum([
  'stored_new_content',
  'not_modified',
  'unchanged_content',
  'discovered_only',
  'body_fetch_budget_exhausted',
  'rejected_url',
  'rejected_dns_target',
  'redirect_rejected',
  'unsupported_content_type',
  'invalid_text_encoding',
  'response_too_large',
  'timeout',
  'http_error',
  'invalid_feed',
  'security_blocked',
  'persistence_failed',
]);

export const collectionContentKindSchema = z.enum([
  'official_html',
  'rss_feed',
  'atom_feed',
  'feed_article_html',
  // A structured JSON API response (for example a DeFiLlama endpoint). The raw
  // body is still stored verbatim as the evidence base; the entries the adapter
  // derives from it are discoveries, exactly like Feed entries.
  'json_api',
]);

/**
 * How many Feed entries one collection pass may turn into discoveries.
 *
 * This is the schema bound for `discoveredCount`, and it must stay equal to the
 * collector's own `MAX_FEED_ENTRIES`. It is declared here, in the contract, so
 * the two can never drift: a pass that exceeded this bound would fail strict
 * result parsing *after* the rows were committed.
 */
export const MAX_COLLECTION_DISCOVERIES = 100;

/**
 * How many article bodies one collection pass may fetch.
 *
 * The schema bound for `bodyFetchCount`, and therefore also the ceiling for the
 * database's `collection_attempts_body_fetch_count_valid` check. The collector
 * decides the real budget (`MAX_ARTICLE_FETCHES`) and imports this constant
 * rather than redefining it.
 *
 * History: the collector raised its budget from 20 to 35 but the schema bound
 * and the check constraint stayed at 20, so any feed with more than 20 new
 * eligible entries failed validation and lost its whole batch. Keep the three
 * in one place.
 */
export const MAX_COLLECTION_BODY_FETCHES = 35;

export const collectSourcePayloadSchema = z
  .object({
    projectId: z.string().uuid(),
    sourceId: z.string().uuid(),
  })
  .strict();

export const collectSourceJobSchema = createJobEnvelopeSchema(
  'collect.source',
  collectSourcePayloadSchema,
);

export const collectSourceResultSchema = z
  .object({
    attemptId: z.string().uuid(),
    projectId: z.string().uuid(),
    sourceId: z.string().uuid(),
    outcome: collectionOutcomeSchema,
    rawItemId: z.string().uuid().nullable(),
    discoveredCount: z.number().int().min(0).max(MAX_COLLECTION_DISCOVERIES),
    bodyFetchCount: z.number().int().min(0).max(MAX_COLLECTION_BODY_FETCHES),
  })
  .strict();

export type CollectionOutcome = z.infer<typeof collectionOutcomeSchema>;
export type CollectionContentKind = z.infer<typeof collectionContentKindSchema>;
export type CollectSourcePayload = z.infer<typeof collectSourcePayloadSchema>;
export type CollectSourceJob = z.infer<typeof collectSourceJobSchema>;
export type CollectSourceResult = z.infer<typeof collectSourceResultSchema>;
