import { z } from 'zod';

import { domainAuthorityStateSchema, referenceKindSchema, referenceStateSchema } from './enums.js';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const positiveVersionSchema = z.number().int().safe().positive();
const referenceUrlSchema = z
  .string()
  .min(11)
  .max(2048)
  .refine((value) => value.startsWith('https://'), {
    message: 'reference url must use https',
  })
  .refine((value) => !value.includes('#'), {
    message: 'reference url must not contain a fragment',
  });

const cursorPayloadSchema = z.strictObject({
  lastVerifiedAt: timestampSchema,
  referenceId: uuidSchema,
});

function decodeCursor(value: string): unknown {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = globalThis.atob(`${value}${padding}`);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export const publicProjectReferenceCursorSchema = z.string().superRefine((value, context) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    context.addIssue({ code: 'custom', message: 'cursor must be base64url encoded' });
    return;
  }
  try {
    if (!cursorPayloadSchema.safeParse(decodeCursor(value)).success) {
      context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
  }
});

// Public projection: verified references only. It deliberately omits Evidence
// ids, locators, notes, actor identity, candidate rows, and normalization
// diagnostics so no internal field can reach a public consumer.
export const publicProjectReferenceSchema = z.strictObject({
  projectId: uuidSchema,
  referenceId: uuidSchema,
  kind: referenceKindSchema,
  label: z.string().min(1).max(160),
  url: referenceUrlSchema,
  lastVerifiedAt: timestampSchema,
});

export const publicProjectDomainAuthoritySchema = z.strictObject({
  projectId: uuidSchema,
  authorityId: uuidSchema,
  domain: z.string().min(1).max(253),
  grantedAt: timestampSchema,
});

export const reviewerReferenceListItemSchema = z.strictObject({
  referenceId: uuidSchema,
  projectId: uuidSchema,
  kind: referenceKindSchema,
  label: z.string().min(1).max(160),
  url: referenceUrlSchema,
  state: referenceStateSchema,
  lastVerifiedAt: timestampSchema.nullable(),
  activeIndicatorId: uuidSchema.nullable(),
  version: positiveVersionSchema,
  updatedAt: timestampSchema,
});

const reviewerDecisionSchema = z.strictObject({
  decisionId: uuidSchema,
  decision: z.union([
    z.literal('register'),
    z.literal('verify'),
    z.literal('reverify'),
    z.literal('restore'),
    z.literal('withdraw'),
    z.literal('release_flag'),
  ]),
  resultingState: referenceStateSchema,
  reasonCode: z.string().min(1).max(64),
  evidenceId: uuidSchema.nullable(),
  createdAt: timestampSchema,
});

export const reviewerReferenceDetailSchema = z.strictObject({
  referenceId: uuidSchema,
  projectId: uuidSchema,
  kind: referenceKindSchema,
  label: z.string().min(1).max(160),
  url: referenceUrlSchema,
  state: referenceStateSchema,
  lastVerifiedAt: timestampSchema.nullable(),
  activeIndicatorId: uuidSchema.nullable(),
  version: positiveVersionSchema,
  updatedAt: timestampSchema,
  domainAuthority: z
    .strictObject({
      authorityId: uuidSchema,
      domain: z.string().min(1).max(253),
      state: domainAuthorityStateSchema,
      version: positiveVersionSchema,
    })
    .nullable(),
  decisions: z.array(reviewerDecisionSchema),
});

export type PublicProjectReference = z.infer<typeof publicProjectReferenceSchema>;
export type PublicProjectDomainAuthority = z.infer<typeof publicProjectDomainAuthoritySchema>;
export type PublicProjectReferenceCursor = z.infer<typeof publicProjectReferenceCursorSchema>;
export type ReviewerReferenceListItem = z.infer<typeof reviewerReferenceListItemSchema>;
export type ReviewerReferenceDetail = z.infer<typeof reviewerReferenceDetailSchema>;
export type ReviewerReferenceDecision = z.infer<typeof reviewerDecisionSchema>;
