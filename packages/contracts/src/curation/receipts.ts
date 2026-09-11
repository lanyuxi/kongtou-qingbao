import { z } from 'zod';

import { collectionContentKindSchema } from '../collection/source-collection.js';
import {
  curatedSignalOutcomeSchema,
  curatedSignalVerificationSchema,
} from './enums.js';

const uuidSchema = z.uuid();
const isoTimestampSchema = z.iso.datetime({ offset: true });
const hex64Schema = z.string().regex(/^[0-9a-f]{64}$/);

const boundedText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

/**
 * The prepare step returns enough of the fetched page for the reviewer to
 * pick a quote. The excerpt is bounded so the UI never holds a multi-megabyte
 * payload; the publish step re-reads the full raw_item for the exact-substring
 * check, so the excerpt never has to be lossless.
 */
export const preparedSourceV1Schema = z.strictObject({
  version: z.literal(1),
  sourceId: uuidSchema,
  rawItemId: uuidSchema,
  contentKind: collectionContentKindSchema,
  mediaType: boundedText(1, 100),
  finalUrl: boundedText(8, 2048),
  byteLength: z.number().int().min(0).max(2_097_152),
  rawTextExcerpt: boundedText(1, 50_000),
  sha256: hex64Schema,
  /** True when the excerpt was truncated for transport; the quote must still come from this excerpt. */
  truncated: z.boolean(),
});
export type PreparedSourceV1 = z.infer<typeof preparedSourceV1Schema>;

/**
 * The publish step's outcome, replay-safe. `replayed` is true when the
 * idempotency key matched an existing command; the rest of the fields are
 * exactly what the original command produced.
 */
export const curatedSignalReceiptV1Schema = z
  .strictObject({
    version: z.literal(1),
    commandId: uuidSchema,
    replayed: z.boolean(),
    outcome: curatedSignalOutcomeSchema,
    verification: curatedSignalVerificationSchema,
    projectId: uuidSchema,
    signalId: uuidSchema.nullable(),
    sourceId: uuidSchema,
    rawItemId: uuidSchema,
    evidenceId: uuidSchema.nullable(),
    completedAt: isoTimestampSchema,
  })
  .refine(
    (value) =>
      value.outcome !== 'created' ||
      (value.signalId !== null && value.evidenceId !== null),
    {
      message: 'a created outcome must carry both a signal id and an evidence id',
      path: ['signalId'],
    },
  )
  .refine(
    (value) => value.outcome !== 'rejected' || value.signalId === null,
    {
      message: 'a rejected outcome must not carry a signal id',
      path: ['signalId'],
    },
  );
export type CuratedSignalReceiptV1 = z.infer<typeof curatedSignalReceiptV1Schema>;
