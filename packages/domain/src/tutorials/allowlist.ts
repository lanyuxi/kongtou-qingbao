import type { TutorialCandidatePayload } from '@airdrop/contracts';

export interface TutorialReferenceAllowlistEntry {
  readonly referenceId: string;
}

/**
 * Collect the candidate's step link reference ids that are absent from the
 * allowlist the generator was prompted with. An empty result means every link
 * resolves to a ledger entry; a non-empty result names the hallucinated or
 * cross-project ids in first-seen order, and the candidate must not be stored
 * as acceptable until they are removed.
 */
export function findUnallowlistedTutorialReferences(
  payload: TutorialCandidatePayload,
  allowlist: readonly TutorialReferenceAllowlistEntry[],
): readonly string[] {
  const allowed = new Set(allowlist.map((entry) => entry.referenceId));
  const offenders: string[] = [];
  for (const step of payload.steps) {
    for (const link of step.links) {
      if (!allowed.has(link.referenceId) && !offenders.includes(link.referenceId)) {
        offenders.push(link.referenceId);
      }
    }
  }
  return offenders;
}
