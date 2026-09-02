import type { TutorialDecision } from '@airdrop/contracts';

export interface TutorialDecisionRecord {
  readonly decision: TutorialDecision;
  readonly createdAt: string;
}

export interface TutorialPublicationState {
  /**
   * Number of version-producing decisions (candidate acceptance counts as the
   * first publication). Zero means the tutorial was never published.
   */
  readonly version: number;
  /**
   * Creation time of the latest version-producing decision — the human
   * verification instant the public page must expose as last_verified_at.
   * Coupling triggers and rejections never advance it.
   */
  readonly lastVerifiedAt: string | null;
}

const VERSION_PRODUCING_DECISIONS: ReadonlySet<TutorialDecision> = new Set([
  'accept_candidate',
  'publish_version',
]);

/**
 * Derive the published version and last_verified_at from the append-only
 * decision history. Decisions must be passed in ledger (append) order: the
 * fold advances the version per version-producing decision and moves the
 * verification instant to the latest such decision.
 */
export function deriveTutorialPublicationState(
  decisions: readonly TutorialDecisionRecord[],
): TutorialPublicationState {
  let version = 0;
  let lastVerifiedAt: string | null = null;
  for (const record of decisions) {
    if (VERSION_PRODUCING_DECISIONS.has(record.decision)) {
      version += 1;
      lastVerifiedAt = record.createdAt;
    }
  }
  return { version, lastVerifiedAt };
}
