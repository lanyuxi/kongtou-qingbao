import { z } from 'zod';

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const nonNegativeVersionSchema = z.number().int().nonnegative();
const positiveVersionSchema = z.number().int().positive();

const boundedText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(isPostgresText, 'value must be valid PostgreSQL UTF-8 text');

export const failedAiRunStatusSchema = z.enum([
  'provider_error',
  'schema_invalid_after_repair',
  'grounding_failed',
]);

export const failedAiRunReviewStateSchema = z.enum([
  'unreviewed',
  'needs_investigation',
  'dismissed',
]);

export const failedAiRunDecisionSchema = z.enum(['needs_investigation', 'dismiss']);

export const failedAiRunReasonCodeSchema = z.enum([
  'provider_instability',
  'schema_regression',
  'grounding_regression',
  'source_data_problem',
  'suspected_prompt_injection',
  'transient_failure',
  'duplicate_or_superseded',
  'expected_invalid_input',
  'no_action_needed',
  'other',
]);

const cursorPayloadSchema = z
  .strictObject({
    createdAt: timestampSchema,
    id: uuidSchema,
  });

const cursorSchema = z.string().superRefine((value, context) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    context.addIssue({ code: 'custom', message: 'cursor must be base64url encoded' });
    return;
  }

  try {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const binary = globalThis.atob(`${value}${padding}`);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    const parsed = cursorPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
  }
});

export const failedAiRunListQuerySchema = z
  .strictObject({
    reviewState: z.union([z.literal('all'), failedAiRunReviewStateSchema]).default('all'),
    status: z.union([z.literal('all'), failedAiRunStatusSchema]).default('all'),
    cursor: cursorSchema.nullable().default(null),
    limit: z.number().int().min(1).max(100).default(25),
  });

const projectProjectionSchema = z.strictObject({
  id: uuidSchema,
  slug: boundedText(120),
  name: boundedText(120),
});

const sourceProjectionSchema = z.strictObject({
  id: uuidSchema,
  name: boundedText(160),
  sourceType: boundedText(60),
});

const boundedNoteSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => Array.from(value).length <= 1000,
    'note must contain at most 1000 Unicode code points',
  )
  .refine(isPostgresText, 'note must be valid PostgreSQL UTF-8 text')
  .nullable();

export const failedAiRunListItemSchema = z
  .strictObject({
    version: z.literal(1),
    runId: uuidSchema,
    status: failedAiRunStatusSchema,
    safeFailureCode: failedAiRunStatusSchema,
    stage: boundedText(60),
    inputKind: z.enum(['discovered_item', 'raw_item']),
    modelId: boundedText(120),
    promptVersion: boundedText(60),
    schemaVersion: boundedText(60),
    pipelineVersion: boundedText(60),
    project: projectProjectionSchema.nullable(),
    source: sourceProjectionSchema.nullable(),
    createdAt: timestampSchema,
    reviewState: failedAiRunReviewStateSchema,
    reviewVersion: nonNegativeVersionSchema,
    latestDecisionAt: timestampSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (value.safeFailureCode !== value.status) {
      context.addIssue({
        code: 'custom',
        path: ['safeFailureCode'],
        message: 'safeFailureCode must match status',
      });
    }
  });

export const failedAiRunReviewDecisionRecordSchema = z.strictObject({
  version: z.literal(1),
  decisionId: uuidSchema,
  reviewVersion: positiveVersionSchema,
  decision: failedAiRunDecisionSchema,
  reasonCode: failedAiRunReasonCodeSchema,
  note: boundedNoteSchema,
  reviewerUserId: uuidSchema,
  createdAt: timestampSchema,
});

const failedAiRunInputSchema = z.strictObject({
  kind: z.enum(['discovered_item', 'raw_item']),
  id: uuidSchema,
  collectedAt: timestampSchema.nullable(),
});

export const failedAiRunDetailSchema = z.strictObject({
  version: z.literal(1),
  run: failedAiRunListItemSchema,
  input: failedAiRunInputSchema,
  decisions: z.array(failedAiRunReviewDecisionRecordSchema),
});

const investigationReasons = new Set([
  'provider_instability',
  'schema_regression',
  'grounding_regression',
  'source_data_problem',
  'suspected_prompt_injection',
  'other',
]);

const dismissalReasons = new Set([
  'transient_failure',
  'duplicate_or_superseded',
  'expected_invalid_input',
  'no_action_needed',
  'other',
]);

export const failedAiRunDecisionCommandSchema = z
  .strictObject({
    version: z.literal(1),
    expectedReviewVersion: nonNegativeVersionSchema,
    decision: failedAiRunDecisionSchema,
    reasonCode: failedAiRunReasonCodeSchema,
    note: boundedNoteSchema,
  })
  .superRefine((value, context) => {
    const validReasons = value.decision === 'needs_investigation'
      ? investigationReasons
      : dismissalReasons;
    if (!validReasons.has(value.reasonCode)) {
      context.addIssue({
        code: 'custom',
        path: ['reasonCode'],
        message: `reasonCode is not compatible with ${value.decision}`,
      });
    }
  });

export const failedAiRunDecisionResultSchema = z.strictObject({
  version: z.literal(1),
  commandId: uuidSchema,
  runId: uuidSchema,
  decisionId: uuidSchema,
  reviewVersion: positiveVersionSchema,
  reviewState: z.enum(['needs_investigation', 'dismissed']),
  replayed: z.boolean(),
});

export type FailedAiRunStatus = z.infer<typeof failedAiRunStatusSchema>;
export type FailedAiRunReviewState = z.infer<typeof failedAiRunReviewStateSchema>;
export type FailedAiRunDecision = z.infer<typeof failedAiRunDecisionSchema>;
export type FailedAiRunReasonCode = z.infer<typeof failedAiRunReasonCodeSchema>;
export type FailedAiRunListQuery = z.infer<typeof failedAiRunListQuerySchema>;
export type FailedAiRunListItem = z.infer<typeof failedAiRunListItemSchema>;
export type FailedAiRunReviewDecisionRecord = z.infer<typeof failedAiRunReviewDecisionRecordSchema>;
export type FailedAiRunDetail = z.infer<typeof failedAiRunDetailSchema>;
export type FailedAiRunDecisionCommand = z.infer<typeof failedAiRunDecisionCommandSchema>;
export type FailedAiRunDecisionResult = z.infer<typeof failedAiRunDecisionResultSchema>;

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
