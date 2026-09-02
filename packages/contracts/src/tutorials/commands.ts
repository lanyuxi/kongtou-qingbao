import { z } from 'zod';

import { tutorialReasonCodeSchema } from './enums.js';

const uuidSchema = z.uuid();
const positiveVersionSchema = z.number().int().safe().positive();

// Step text may not embed URLs. Every user-visible link must come from the
// Phase 7B reference ledger via a referenceId, so a URL typed into prose would
// either stay inert text (misleading) or tempt renderers into auto-linkifying
// (unsafe). The guard keeps bodies ledger-only by construction.
function containsRawUrl(value: string): boolean {
  const lowered = value.toLowerCase();
  return (
    lowered.includes('http://') || lowered.includes('https://') || lowered.includes('www.')
  );
}

export const tutorialStepSchema = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .refine((value) => !containsRawUrl(value), {
        message: 'tutorial step title must not contain a url',
      }),
    body: z
      .string()
      .trim()
      .min(10)
      .max(1000)
      .refine((value) => !containsRawUrl(value), {
        message: 'tutorial step body must not contain a url',
      }),
    links: z.array(z.strictObject({ referenceId: uuidSchema })).max(5),
  });

export const tutorialStepsSchema = z.array(tutorialStepSchema).min(2).max(20);

export const internalNoteSchema = z.string().trim().min(1).max(1000).nullable();

// Accept promotes an AI/human candidate into a published tutorial version. The
// reviewer may edit the steps before accepting; the candidate payload itself is
// never published verbatim.
export const acceptTutorialCandidateCommandV1Schema = z.strictObject({
  version: z.literal(1),
  candidateId: uuidSchema,
  expectedCandidateVersion: positiveVersionSchema,
  steps: tutorialStepsSchema,
});

export const rejectTutorialCandidateCommandV1Schema = z.strictObject({
  version: z.literal(1),
  candidateId: uuidSchema,
  expectedCandidateVersion: positiveVersionSchema,
  reasonCode: tutorialReasonCodeSchema,
  note: internalNoteSchema,
});

// Re-approval path for needs_review/blocked recovery: publishing always forms
// a new immutable version; there is no in-place edit of published content.
export const publishTutorialVersionCommandV1Schema = z.strictObject({
  version: z.literal(1),
  tutorialId: uuidSchema,
  expectedVersion: positiveVersionSchema,
  steps: tutorialStepsSchema,
});

// The model's structured output. A candidate carries no URL anywhere: links
// are reference ids chosen from the allowlist passed in the prompt, and the
// step text guard rejects raw urls at the schema layer as well.
export const tutorialCandidatePayloadSchema = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(5)
      .max(200)
      .refine((value) => !containsRawUrl(value), {
        message: 'tutorial candidate title must not contain a url',
      }),
    summary: z
      .string()
      .trim()
      .min(10)
      .max(2000)
      .refine((value) => !containsRawUrl(value), {
        message: 'tutorial candidate summary must not contain a url',
      }),
    steps: tutorialStepsSchema,
    sourceSignalIds: z.array(uuidSchema).min(1).max(10),
    confidence: z.number().min(0).max(100),
  });

export const retireTutorialCommandV1Schema = z.strictObject({
  version: z.literal(1),
  tutorialId: uuidSchema,
  expectedVersion: positiveVersionSchema,
  reasonCode: tutorialReasonCodeSchema,
  note: internalNoteSchema,
});

// Command receipts. The `version` column is the command schema version, not
// the aggregate version; replayed receipts echo the original result.
export const tutorialAcceptReceiptSchema = z.strictObject({
  version: z.literal(1),
  commandId: uuidSchema,
  candidateId: uuidSchema,
  tutorialId: uuidSchema,
  tutorialVersion: positiveVersionSchema,
  replayed: z.boolean(),
});

export const tutorialRejectReceiptSchema = z.strictObject({
  version: z.literal(1),
  commandId: uuidSchema,
  candidateId: uuidSchema,
  replayed: z.boolean(),
});

export const tutorialPublishReceiptSchema = z.strictObject({
  version: z.literal(1),
  commandId: uuidSchema,
  tutorialId: uuidSchema,
  tutorialVersion: positiveVersionSchema,
  replayed: z.boolean(),
});

export const tutorialRetireReceiptSchema = z.strictObject({
  version: z.literal(1),
  commandId: uuidSchema,
  tutorialId: uuidSchema,
  replayed: z.boolean(),
});

export type TutorialStep = z.infer<typeof tutorialStepSchema>;
export type TutorialSteps = z.infer<typeof tutorialStepsSchema>;
export type AcceptTutorialCandidateCommandV1 = z.infer<
  typeof acceptTutorialCandidateCommandV1Schema
>;
export type RejectTutorialCandidateCommandV1 = z.infer<
  typeof rejectTutorialCandidateCommandV1Schema
>;
export type PublishTutorialVersionCommandV1 = z.infer<
  typeof publishTutorialVersionCommandV1Schema
>;
export type RetireTutorialCommandV1 = z.infer<typeof retireTutorialCommandV1Schema>;
export type TutorialCandidatePayload = z.infer<typeof tutorialCandidatePayloadSchema>;
export type TutorialAcceptReceipt = z.infer<typeof tutorialAcceptReceiptSchema>;
export type TutorialRejectReceipt = z.infer<typeof tutorialRejectReceiptSchema>;
export type TutorialPublishReceipt = z.infer<typeof tutorialPublishReceiptSchema>;
export type TutorialRetireReceipt = z.infer<typeof tutorialRetireReceiptSchema>;
