import { z } from 'zod';

import {
  domainAuthorityDecisionSchema,
  domainAuthorityStateSchema,
  referenceDecisionSchema,
  referenceKindSchema,
  referenceReasonCodeSchema,
  referenceStateSchema,
  type DomainAuthorityDecision,
  type ReferenceDecision,
} from './enums.js';

const uuidSchema = z.uuid();
const positiveVersionSchema = z.number().int().safe().positive();
const boundedText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const internalNoteSchema = boundedText(1, 1000).nullable();

const CONTROL_CODE_LIMIT = 0x20;
const DELETE_CODE = 0x7f;

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < CONTROL_CODE_LIMIT || code === DELETE_CODE;
  });
}

// A reference URL is an absolute https URL without control characters or a
// fragment. Normalization (scheme/host case, default port, empty path) belongs
// to the domain layer; the contract only rejects forms that cannot be normalized.
export const referenceUrlSchema = z
  .string()
  .min(11)
  .max(2048)
  .refine((value) => value.startsWith('https://'), {
    message: 'reference url must use https',
  })
  .refine((value) => !hasControlCharacter(value), {
    message: 'reference url must not contain control characters',
  })
  .refine((value) => !value.includes('#'), {
    message: 'reference url must not contain a fragment',
  });

export const referenceDomainSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/, {
    message: 'domain must be a bare host without scheme, port, or path',
  });

export const registerReferenceCommandV1Schema = z.strictObject({
  version: z.literal(1),
  projectId: uuidSchema,
  kind: referenceKindSchema,
  url: referenceUrlSchema,
  label: boundedText(1, 160),
  evidenceId: uuidSchema,
  note: internalNoteSchema,
});

const evidenceRequiredDecisions: readonly ReferenceDecision[] = [
  'verify',
  'reverify',
  'restore',
];

export const decideReferenceCommandV1Schema = z
  .strictObject({
    version: z.literal(1),
    referenceId: uuidSchema,
    expectedVersion: positiveVersionSchema,
    decision: referenceDecisionSchema,
    reasonCode: referenceReasonCodeSchema,
    evidenceId: uuidSchema.nullable(),
    note: internalNoteSchema,
  })
  .refine(
    (value) => !evidenceRequiredDecisions.includes(value.decision) || value.evidenceId !== null,
    { message: 'verify, reverify, and restore require evidence' },
  );

export const registerDomainAuthorityCommandV1Schema = z.strictObject({
  version: z.literal(1),
  projectId: uuidSchema,
  domain: referenceDomainSchema,
  evidenceId: uuidSchema,
  note: internalNoteSchema,
});

const evidenceRequiredAuthorityDecisions: readonly DomainAuthorityDecision[] = ['grant', 'regrant'];

export const decideDomainAuthorityCommandV1Schema = z
  .strictObject({
    version: z.literal(1),
    authorityId: uuidSchema,
    expectedVersion: positiveVersionSchema,
    decision: domainAuthorityDecisionSchema,
    reasonCode: referenceReasonCodeSchema,
    evidenceId: uuidSchema.nullable(),
    note: internalNoteSchema,
  })
  .refine(
    (value) =>
      !evidenceRequiredAuthorityDecisions.includes(value.decision) || value.evidenceId !== null,
    { message: 'grant and regrant require evidence' },
  );

export const domainAuthorityCommandReceiptV1Schema = z.strictObject({
  version: z.literal(1),
  commandId: uuidSchema,
  authorityId: uuidSchema,
  authorityVersion: positiveVersionSchema,
  state: domainAuthorityStateSchema,
  replayed: z.boolean(),
});

export const referenceCommandReceiptV1Schema = z.strictObject({
  version: z.literal(1),
  commandId: uuidSchema,
  referenceId: uuidSchema,
  referenceVersion: positiveVersionSchema,
  state: referenceStateSchema,
  replayed: z.boolean(),
});

export type ReferenceUrl = z.infer<typeof referenceUrlSchema>;
export type ReferenceDomain = z.infer<typeof referenceDomainSchema>;
export type RegisterReferenceCommandV1 = z.infer<typeof registerReferenceCommandV1Schema>;
export type DecideReferenceCommandV1 = z.infer<typeof decideReferenceCommandV1Schema>;
export type RegisterDomainAuthorityCommandV1 = z.infer<
  typeof registerDomainAuthorityCommandV1Schema
>;
export type DecideDomainAuthorityCommandV1 = z.infer<typeof decideDomainAuthorityCommandV1Schema>;
export type DomainAuthorityCommandReceiptV1 = z.infer<
  typeof domainAuthorityCommandReceiptV1Schema
>;
export type ReferenceCommandReceiptV1 = z.infer<typeof referenceCommandReceiptV1Schema>;
