import { z } from 'zod';

import {
  curatedSignalVerificationSchema,
  participableSignalTypeSchema,
} from './enums.js';

const uuidSchema = z.uuid();
const positiveVersionSchema = z.number().int().safe().positive();
const boundedText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

/**
 * A canonical URL is what the existing safe collector accepts: HTTPS, no
 * credentials, no IP literal, no explicit port, no userinfo. This is the
 * same constraint the database enforces via `valid_https_url`; the contract
 * mirrors it so the error surfaces at the boundary, not inside a transaction.
 */
const canonicalSourceUrlSchema = z
  .string()
  .trim()
  .min(8)
  .max(2048)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        // Mirrors `validateConfiguredCollectionUrl` and `valid_https_url`:
        //  - protocol must be https with no creds, no explicit port
        //  - the hostname must not be a literal IP (v4 or v6) — that is the
        //    network policy's job to reject, and a leaked IP literal URL would
        //    bypass DNS checks and point straight at the box.
        if (url.protocol !== 'https:') return false;
        if (url.username !== '' || url.password !== '' || url.port !== '') return false;
        if (url.hostname === '' || url.hostname !== url.hostname.toLowerCase()) return false;
        if (url.hostname.startsWith('[')) return false;
        if (!/[a-z]/.test(url.hostname)) return false;
        return true;
      } catch {
        return false;
      }
    },
    { message: 'sourceUrl must be a canonical https url with a non-IP hostname' },
  );

/**
 * Slug pattern mirrors the existing `projects_slug_valid` database constraint so
 * the curator gets a clean 400 before the database rejects it. The DB remains
 * the final guard; this is an early check.
 */
const projectSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug must be lowercase alphanumeric with single hyphens' });

/**
 * Either reuse an existing project (id only) or declare the fields needed to
 * create one in the same transaction. Slug must match the existing
 * `projects_slug_valid` constraint; URL must satisfy `valid_https_url`.
 */
const newProjectFieldsSchema = z.strictObject({
  slug: projectSlugSchema,
  name: boundedText(1, 120),
  summary: boundedText(1, 1000).nullable().default(null),
  primaryChain: boundedText(1, 80).nullable().default(null),
  officialWebsiteUrl: canonicalSourceUrlSchema.nullable().default(null),
});

export const curatedSignalTargetProjectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('existing'), projectId: uuidSchema }),
  z.strictObject({ kind: z.literal('new'), project: newProjectFieldsSchema }),
]);
export type CuratedSignalTargetProject = z.infer<typeof curatedSignalTargetProjectSchema>;

/**
 * The two-step intake:
 *
 *   1. `prepareSourceCommandSchema` — the reviewer submits a URL. The BFF
 *      calls the existing safe collector, persists a raw_item, and returns a
 *      bounded text excerpt plus the ids the publish step needs. This is the
 *      only call that touches the network; it must not hold a transaction.
 *
 *   2. `curatedSignalCommandSchema` — the reviewer picks a quote from the
 *      excerpt and submits. The BFF opens a single transaction that writes
 *      the project (if new), the signal, the evidence and the receipt.
 *      Idempotency-Key + expectedVersion are mandatory; replaying the same
 *      key returns the original receipt.
 */
export const prepareSourceCommandV1Schema = z.strictObject({
  version: z.literal(1),
  project: curatedSignalTargetProjectSchema,
  sourceUrl: canonicalSourceUrlSchema,
});
export type PrepareSourceCommandV1 = z.infer<typeof prepareSourceCommandV1Schema>;

export const curatedSignalCommandV1Schema = z
  .strictObject({
    version: z.literal(1),
    project: curatedSignalTargetProjectSchema,
    sourceId: uuidSchema,
    rawItemId: uuidSchema,
    signalType: participableSignalTypeSchema,
    title: boundedText(1, 200),
    summary: boundedText(1, 1000),
    quote: boundedText(10, 500),
    verification: curatedSignalVerificationSchema,
    attestation: boundedText(1, 1000).nullable().default(null),
    expectedVersion: positiveVersionSchema,
    idempotencyKey: z.uuid(),
  })
  .refine(
    (value) =>
      value.verification !== 'corroborated' ||
      (value.attestation !== null && value.attestation.length > 0),
    {
      message: 'corroborated verification requires a non-empty attestation',
      path: ['attestation'],
    },
  );
export type CuratedSignalCommandV1 = z.infer<typeof curatedSignalCommandV1Schema>;
