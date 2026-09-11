import { z } from 'zod';

/**
 * The six "participable" signal kinds the tutorial pipeline already treats as
 * "how to participate". Curated intake may only produce these.
 */
export const participableSignalTypeSchema = z.enum([
  'airdrop_campaign',
  'points_program',
  'snapshot_notice',
  'task_launch',
  'token_launch',
  'eligibility_rule',
]);
export type ParticipableSignalType = z.infer<typeof participableSignalTypeSchema>;

/**
 * The verification level the curator is willing to certify.
 *
 *   - `verified`     — only when the (project, source) pair is marked official
 *                      and already vouched for by a human.
 *   - `corroborated` — when the source is not official but the curator is
 *                      willing to attest to it. An attestation note is required
 *                      and is recorded in the command receipt.
 */
export const curatedSignalVerificationSchema = z.enum(['verified', 'corroborated']);
export type CuratedSignalVerification = z.infer<typeof curatedSignalVerificationSchema>;

/**
 * High-level outcome the database command returns. Distinct from the error
 * codes so the same field is useful for both the happy path and the rejection
 * path, mirroring the existing `CuratedSignalCommand` pattern.
 */
export const curatedSignalOutcomeSchema = z.enum(['created', 'rejected']);
export type CuratedSignalOutcome = z.infer<typeof curatedSignalOutcomeSchema>;

/**
 * Stable CU2xx error codes. Mirrors the existing per-domain error code
 * conventions (AR/ID/EX/SE). Every value is exposed for tests and the
 * reviewer UI; the database function must use the exact strings.
 */
export const curatedSignalErrorCodeSchema = z.enum([
  'CU201_unauthorized', // no auth.uid() or caller is not a reviewer
  'CU202_role_inactive', // role has been revoked
  'CU203_idempotency_conflict', // same key, different request body
  'CU204_version_conflict', // expectedVersion mismatch
  'CU205_fetch_failed', // the safe collector could not retrieve the URL
  'CU206_evidence_missing', // the raw_item was not retrievable for the receipt
  'CU207_quote_not_in_text', // exact-substring check against raw_text failed
  'CU208_invalid_url', // validateConfiguredCollectionUrl rejected it
  'CU209_attestation_required', // corroborated without an attestation note
  'CU210_source_not_paired', // source not paired with this project (or stale)
]);
export type CuratedSignalErrorCode = z.infer<typeof curatedSignalErrorCodeSchema>;
