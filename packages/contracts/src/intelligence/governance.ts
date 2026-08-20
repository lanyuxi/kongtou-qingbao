import { z } from 'zod';

const uuidSchema = z.string().uuid();
const positiveVersionSchema = z.number().int().safe().positive();
const occurredAtSchema = z.string().datetime({ offset: true });
const postgresTextSchema = z.string().refine(
  isPostgresText,
  'value must be valid PostgreSQL UTF-8 text',
);

export const evidenceLocatorV1Schema = z
  .object({
    version: z.literal(1),
    kind: z.literal('exact_quote'),
    sourceField: z.enum(['article_raw_text', 'discovered_summary']),
    quote: z
      .string()
      .min(10)
      .max(500)
      .refine((value) => value.trim().length > 0, 'quote must contain non-whitespace content'),
  })
  .strict();

export const candidateReviewDecisionSchema = z.enum(['approve', 'reject', 'needs_review']);

export const candidateReviewReasonCodeSchema = z.enum([
  'evidence_verified',
  'claim_not_supported',
  'source_mismatch',
  'grounding_failed',
  'insufficient_context',
  'historical_reconciliation_failed',
]);

const commandBase = z.object({
  version: z.literal(1),
  candidateId: uuidSchema,
  reviewerUserId: uuidSchema,
  expectedCandidateVersion: positiveVersionSchema,
  note: postgresTextSchema
    .trim()
    .min(1)
    .refine(
      (value) => Array.from(value).length <= 1000,
      'note must contain at most 1000 Unicode code points',
    )
    .nullable(),
});

export const candidateReviewCommandV1Schema = z.discriminatedUnion('decision', [
  commandBase
    .extend({
      decision: z.literal('approve'),
      reasonCode: z.literal('evidence_verified'),
    })
    .strict(),
  commandBase
    .extend({
      decision: z.literal('reject'),
      reasonCode: z.enum(['claim_not_supported', 'source_mismatch']),
    })
    .strict(),
  commandBase
    .extend({
      decision: z.literal('needs_review'),
      reasonCode: z.enum([
        'source_mismatch',
        'grounding_failed',
        'insufficient_context',
        'historical_reconciliation_failed',
      ]),
    })
    .strict(),
]);

const resultBase = z.object({
  version: z.literal(1),
  commandId: uuidSchema,
  candidateId: uuidSchema,
  candidateVersion: positiveVersionSchema,
  decisionId: uuidSchema,
  replayed: z.boolean(),
});

export const candidateReviewResultV1Schema = z.discriminatedUnion('outcome', [
  resultBase
    .extend({
      outcome: z.literal('promoted'),
      signalId: uuidSchema,
      evidenceId: uuidSchema,
    })
    .strict(),
  resultBase
    .extend({
      outcome: z.literal('rejected'),
      signalId: z.null(),
      evidenceId: z.null(),
    })
    .strict(),
  resultBase
    .extend({
      outcome: z.literal('needs_review'),
      signalId: z.null(),
      evidenceId: z.null(),
    })
    .strict(),
]);

const outboxBase = z.object({
  version: z.literal(1),
  candidateId: uuidSchema,
  candidateVersion: positiveVersionSchema,
  decisionId: uuidSchema,
  occurredAt: occurredAtSchema,
});

export const governanceOutboxEventV1Schema = z.discriminatedUnion('eventType', [
  outboxBase
    .extend({
      eventType: z.literal('intelligence.signal.promoted.v1'),
      signalId: uuidSchema,
      evidenceId: uuidSchema,
    })
    .strict(),
  outboxBase
    .extend({
      eventType: z.literal('intelligence.candidate.reviewed.v1'),
      outcome: z.enum(['promoted', 'rejected', 'needs_review']),
    })
    .strict(),
]);

export type EvidenceLocatorV1 = z.infer<typeof evidenceLocatorV1Schema>;
export type CandidateReviewDecision = z.infer<typeof candidateReviewDecisionSchema>;
export type CandidateReviewReasonCode = z.infer<typeof candidateReviewReasonCodeSchema>;
export type CandidateReviewCommandV1 = z.infer<typeof candidateReviewCommandV1Schema>;
export type CandidateReviewResultV1 = z.infer<typeof candidateReviewResultV1Schema>;
export type GovernanceOutboxEventV1 = z.infer<typeof governanceOutboxEventV1Schema>;

function isPostgresText(value: string): boolean {
  if (value.includes('\u0000')) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}
