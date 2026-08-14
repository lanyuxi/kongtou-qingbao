import { z } from 'zod';

// Structured-output contract for the extraction stage (extract.v1).
// The model may only propose candidates; every candidate carries a grounded
// evidence quote that must exist verbatim (whitespace-normalized) in the
// source text before the candidate can be stored.

export const extractionClaimTypeSchema = z.enum([
  'airdrop_campaign',
  'points_program',
  'snapshot_notice',
  'task_launch',
  'token_launch',
  'eligibility_rule',
  'security_risk',
  'scam_indicator',
  'other_intelligence',
]);

export const extractionCandidatePayloadSchema = z
  .object({
    claimType: extractionClaimTypeSchema,
    signalType: z
      .string()
      .min(3)
      .max(100)
      .regex(/^[a-z0-9_]+$/, 'signal_type must be snake_case ascii'),
    title: z.string().min(5).max(200),
    summary: z.string().min(10).max(2000),
    confidence: z.number().min(0).max(100),
    evidenceQuote: z.string().min(10).max(500),
    occurredAtIso: z.string().datetime().nullable(),
  })
  .strict();

export const extractionRunOutputSchema = z
  .object({
    candidates: z.array(extractionCandidatePayloadSchema).max(10),
  })
  .strict();

export const extractionRunStatusSchema = z.enum([
  'succeeded',
  'schema_invalid_after_repair',
  'grounding_failed',
  'provider_error',
  'skipped_no_content',
]);

export const extractionStageConstants = {
  stage: 'extract.v1',
  promptVersion: 'extract-prompt-v1',
  schemaVersion: 'extract-schema-v1',
  pipelineVersion: 'extract-pipeline-v1',
} as const;

export type ExtractionClaimType = z.infer<typeof extractionClaimTypeSchema>;
export type ExtractionCandidatePayload = z.infer<typeof extractionCandidatePayloadSchema>;
export type ExtractionRunOutput = z.infer<typeof extractionRunOutputSchema>;
export type ExtractionRunStatus = z.infer<typeof extractionRunStatusSchema>;
