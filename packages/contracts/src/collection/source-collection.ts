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
]);

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
    discoveredCount: z.number().int().min(0).max(100),
    bodyFetchCount: z.number().int().min(0).max(20),
  })
  .strict();

export type CollectionOutcome = z.infer<typeof collectionOutcomeSchema>;
export type CollectionContentKind = z.infer<typeof collectionContentKindSchema>;
export type CollectSourcePayload = z.infer<typeof collectSourcePayloadSchema>;
export type CollectSourceJob = z.infer<typeof collectSourceJobSchema>;
export type CollectSourceResult = z.infer<typeof collectSourceResultSchema>;
