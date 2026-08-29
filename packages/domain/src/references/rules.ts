import type {
  DomainAuthorityDecision,
  DomainAuthorityState,
  ReferenceDecision,
  ReferenceState,
} from '@airdrop/contracts';

// Pure derivation rules. Current state is always derived from append-only
// decisions; the database never stores a mutable current-state column.

export interface ReferenceDecisionRecord {
  readonly decision: ReferenceDecision;
  readonly resultingState: ReferenceState;
  readonly createdAt: string;
  readonly evidenceId?: string | null;
}

export interface DomainAuthorityDecisionRecord {
  readonly decision: DomainAuthorityDecision;
  readonly resultingState: DomainAuthorityState;
}

const resultingStateByDecision: Readonly<Record<ReferenceDecision, ReferenceState>> = {
  register: 'candidate',
  verify: 'verified',
  reverify: 'verified',
  restore: 'verified',
  withdraw: 'withdrawn',
};

const resultingAuthorityStateByDecision: Readonly<
  Record<DomainAuthorityDecision, DomainAuthorityState>
> = {
  register: 'candidate',
  grant: 'granted',
  revoke: 'revoked',
  regrant: 'granted',
};

export function resultingReferenceState(decision: ReferenceDecision): ReferenceState {
  return resultingStateByDecision[decision];
}

export function resultingDomainAuthorityState(
  decision: DomainAuthorityDecision,
): DomainAuthorityState {
  return resultingAuthorityStateByDecision[decision];
}

export function deriveReferenceState(
  decisions: readonly ReferenceDecisionRecord[],
): ReferenceState {
  return decisions.at(-1)?.resultingState ?? 'candidate';
}

export function deriveDomainAuthorityState(
  decisions: readonly DomainAuthorityDecisionRecord[],
): DomainAuthorityState {
  return decisions.at(-1)?.resultingState ?? 'candidate';
}

export function deriveLastVerifiedAt(
  decisions: readonly ReferenceDecisionRecord[],
): string | null {
  const verified = decisions.filter((entry) => entry.resultingState === 'verified');
  return verified.at(-1)?.createdAt ?? null;
}

const referenceTransitions: Readonly<
  Record<ReferenceState, Readonly<Record<ReferenceDecision, boolean>>>
> = {
  candidate: { register: false, verify: true, reverify: false, restore: false, withdraw: true },
  verified: { register: false, verify: false, reverify: true, restore: false, withdraw: true },
  flagged: { register: false, verify: false, reverify: false, restore: true, withdraw: true },
  withdrawn: { register: false, verify: false, reverify: false, restore: false, withdraw: false },
};

// Verification always requires a granted domain authority, so a verified domain
// can never by itself verify a URL beneath it.
const authorityGatedDecisions: readonly ReferenceDecision[] = ['verify', 'reverify', 'restore'];

export function canDecideReference(
  currentState: ReferenceState,
  decision: ReferenceDecision,
  domainAuthorityState: DomainAuthorityState,
): boolean {
  if (!referenceTransitions[currentState][decision]) {
    return false;
  }
  if (authorityGatedDecisions.includes(decision)) {
    return domainAuthorityState === 'granted';
  }
  return true;
}

const authorityTransitions: Readonly<
  Record<DomainAuthorityState, Readonly<Record<DomainAuthorityDecision, boolean>>>
> = {
  candidate: { register: false, grant: true, revoke: false, regrant: false },
  granted: { register: false, grant: false, revoke: true, regrant: false },
  revoked: { register: false, grant: false, revoke: false, regrant: true },
};

export function canDecideDomainAuthority(
  currentState: DomainAuthorityState,
  decision: DomainAuthorityDecision,
): boolean {
  return authorityTransitions[currentState][decision];
}
