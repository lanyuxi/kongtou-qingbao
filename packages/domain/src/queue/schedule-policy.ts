import type { ProjectLifecycle, SourceStatus } from '@airdrop/contracts';

import { fnv1a32 } from './fnv1a.js';

export const DEFAULT_COLLECTION_INTERVAL_SECONDS = 1_800;
export const MIN_COLLECTION_INTERVAL_SECONDS = 300;
export const MAX_COLLECTION_INTERVAL_SECONDS = 604_800;

const MAX_JITTER_SECONDS = 300;

export interface EligibilityInput {
  readonly enabled: boolean;
  readonly projectLifecycle: ProjectLifecycle;
  readonly sourceStatus: SourceStatus;
  readonly isOfficial: boolean;
  readonly verifiedAt: string | null;
  readonly verifiedBy: string | null;
}

export interface JitterInput {
  readonly projectId: string;
  readonly sourceId: string;
  readonly scheduledFor: string;
  readonly intervalSeconds: number;
}

export interface NextRunInput {
  readonly now: Date;
  readonly intervalSeconds: number;
}

export class CollectionIntervalError extends Error {
  readonly code = 'invalid_collection_interval' as const;

  constructor(readonly seconds: number) {
    super('Collection interval must be an integer from 300 through 604800 seconds');
    this.name = 'CollectionIntervalError';
  }
}

export function isAutomaticCollectionEligible(input: EligibilityInput): boolean {
  return (
    input.enabled &&
    input.projectLifecycle === 'active' &&
    input.sourceStatus === 'active' &&
    input.isOfficial &&
    input.verifiedAt !== null &&
    input.verifiedBy !== null
  );
}

export function assertCollectionInterval(seconds: number): number {
  if (
    !Number.isInteger(seconds) ||
    seconds < MIN_COLLECTION_INTERVAL_SECONDS ||
    seconds > MAX_COLLECTION_INTERVAL_SECONDS
  ) {
    throw new CollectionIntervalError(seconds);
  }

  return seconds;
}

export function deterministicJitterSeconds(input: JitterInput): number {
  const intervalSeconds = assertCollectionInterval(input.intervalSeconds);
  const bound = Math.min(MAX_JITTER_SECONDS, Math.floor(intervalSeconds / 10));
  const hash = fnv1a32(`${input.projectId}|${input.sourceId}|${input.scheduledFor}`);
  return hash % (bound + 1);
}

export function calculateNextRunAt(input: NextRunInput): Date {
  const intervalSeconds = assertCollectionInterval(input.intervalSeconds);
  return new Date(input.now.getTime() + intervalSeconds * 1_000);
}
