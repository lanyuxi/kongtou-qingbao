import { z } from 'zod';

import { signalVerificationSchema, sourceTypeSchema } from '../enums.js';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const factorCodeSchema = z.string().trim().min(3).max(80).regex(/^[a-z][a-z0-9_]{2,79}$/);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const scoringAxisSchema = z.enum(['opportunity', 'risk', 'confidence']);
export type ScoringAxis = z.infer<typeof scoringAxisSchema>;

export const publicProjectScoreFactorRowSchema = z.strictObject({
  project_id: uuidSchema,
  project_score_id: uuidSchema,
  axis: scoringAxisSchema,
  factor_code: factorCodeSchema,
  contribution: z.number().min(0).max(100),
  input_value: z.number().min(0).max(100),
  detail: boundedText(500),
});

export const publicProjectEvidenceCitationRowSchema = z
  .strictObject({
    project_id: uuidSchema,
    project_score_id: uuidSchema,
    signal_id: uuidSchema,
    signal_title: boundedText(200),
    signal_verification: signalVerificationSchema,
    signal_published_at: timestampSchema.nullable(),
    evidence_id: uuidSchema,
    citation_text: z.string().trim().min(10).max(500),
    evidence_source_field: z.enum(['article_raw_text', 'discovered_summary']),
    evidence_verified_at: timestampSchema,
    source_id: uuidSchema,
    source_name: boundedText(160),
    source_type: sourceTypeSchema,
    source_is_official: z.boolean(),
    source_relation_verified_at: timestampSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (value.source_is_official && value.source_relation_verified_at === null) {
      context.addIssue({
        code: 'custom',
        path: ['source_relation_verified_at'],
        message: 'official sources require a verified project-source relation',
      });
    }
  });

export type PublicProjectScoreFactorRow = z.infer<typeof publicProjectScoreFactorRowSchema>;
export type PublicProjectEvidenceCitationRow = z.infer<typeof publicProjectEvidenceCitationRowSchema>;
