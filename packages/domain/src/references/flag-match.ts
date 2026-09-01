import type { SecurityIndicatorType } from '@airdrop/contracts';

import { normalizeReferenceDomain, normalizeReferenceUrl } from './normalize.js';

export interface ReferenceMatchCandidate {
  readonly referenceId: string;
  readonly url: string;
  readonly domain: string;
}

export interface ReferenceMatchIndicator {
  readonly type: SecurityIndicatorType;
  readonly value: string;
}

// Only indicator types that identify a link may flag a reference. Values that
// fail normalization are ignored rather than substring-matched, so a malformed
// indicator can never flag an unrelated reference.
export function matchIndicatorToReference(
  indicator: ReferenceMatchIndicator,
  candidates: readonly ReferenceMatchCandidate[],
): readonly string[] {
  if (indicator.type === 'url') {
    const normalized = normalizeReferenceUrl(indicator.value);
    if (normalized === null) {
      return [];
    }
    return candidates
      .filter((candidate) => normalizeReferenceUrl(candidate.url) === normalized)
      .map((candidate) => candidate.referenceId);
  }

  if (indicator.type === 'domain') {
    const normalized = normalizeReferenceDomain(indicator.value);
    if (normalized === null) {
      return [];
    }
    return candidates
      .filter((candidate) => normalizeReferenceDomain(candidate.domain) === normalized)
      .map((candidate) => candidate.referenceId);
  }

  return [];
}
