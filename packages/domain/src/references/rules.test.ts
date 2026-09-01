import type {
  DomainAuthorityDecision,
  DomainAuthorityState,
  ReferenceDecision,
  ReferenceState,
} from '@airdrop/contracts';
import { describe, expect, it } from 'vitest';

import {
  canDecideDomainAuthority,
  canDecideReference,
  deriveDomainAuthorityState,
  deriveEffectiveReferenceState,
  deriveLastVerifiedAt,
  deriveReferenceState,
  resultingReferenceState,
} from './rules.js';

const decision = (
  decisionName: ReferenceDecision,
  resultingState: ReferenceState,
  createdAt: string,
  evidenceId: string | null = null,
) => ({ decision: decisionName, resultingState, createdAt, evidenceId });

describe('deriveReferenceState', () => {
  it('derives the current state from the latest decision', () => {
    expect(
      deriveReferenceState([
        decision('register', 'candidate', '2026-08-29T00:00:00.000Z'),
        decision('verify', 'verified', '2026-08-29T01:00:00.000Z', 'evidence-1'),
      ]),
    ).toBe('verified');

    expect(
      deriveReferenceState([
        decision('register', 'candidate', '2026-08-29T00:00:00.000Z'),
        decision('verify', 'verified', '2026-08-29T01:00:00.000Z', 'evidence-1'),
        decision('withdraw', 'withdrawn', '2026-08-29T02:00:00.000Z'),
      ]),
    ).toBe('withdrawn');
  });

  it('starts as candidate with no history', () => {
    expect(deriveReferenceState([])).toBe('candidate');
  });

  it('maps every decision to its resulting state', () => {
    expect(resultingReferenceState('register')).toBe('candidate');
    expect(resultingReferenceState('verify')).toBe('verified');
    expect(resultingReferenceState('reverify')).toBe('verified');
    expect(resultingReferenceState('restore')).toBe('verified');
    expect(resultingReferenceState('withdraw')).toBe('withdrawn');
  });
});

describe('deriveLastVerifiedAt', () => {
  it('uses the latest successful verification, never the registration time', () => {
    const decisions = [
      decision('register', 'candidate', '2026-08-29T00:00:00.000Z'),
      decision('verify', 'verified', '2026-08-29T01:00:00.000Z', 'evidence-1'),
      decision('withdraw', 'withdrawn', '2026-08-29T02:00:00.000Z'),
    ];
    expect(deriveLastVerifiedAt(decisions)).toBe('2026-08-29T01:00:00.000Z');
  });

  it('advances on reverify and is null while never verified', () => {
    expect(
      deriveLastVerifiedAt([
        decision('register', 'candidate', '2026-08-29T00:00:00.000Z'),
        decision('verify', 'verified', '2026-08-29T01:00:00.000Z', 'evidence-1'),
        decision('reverify', 'verified', '2026-08-29T03:00:00.000Z', 'evidence-2'),
      ]),
    ).toBe('2026-08-29T03:00:00.000Z');
    expect(deriveLastVerifiedAt([])).toBeNull();
    expect(
      deriveLastVerifiedAt([decision('register', 'candidate', '2026-08-29T00:00:00.000Z')]),
    ).toBeNull();
  });
});

describe('canDecideReference', () => {
  it('refuses verification without a granted domain authority', () => {
    expect(canDecideReference('candidate', 'verify', 'candidate')).toBe(false);
    expect(canDecideReference('candidate', 'verify', 'granted')).toBe(true);
    expect(canDecideReference('candidate', 'verify', 'revoked')).toBe(false);
  });

  it('refuses to verify an already verified or withdrawn reference without moving through a legal decision', () => {
    expect(canDecideReference('verified', 'verify', 'granted')).toBe(false);
    expect(canDecideReference('verified', 'reverify', 'granted')).toBe(true);
    expect(canDecideReference('withdrawn', 'reverify', 'granted')).toBe(false);
    expect(canDecideReference('withdrawn', 'withdraw', 'granted')).toBe(false);
  });

  it('allows withdrawal and flag restoration from the states where they are meaningful', () => {
    expect(canDecideReference('verified', 'withdraw', 'granted')).toBe(true);
    expect(canDecideReference('candidate', 'withdraw', 'granted')).toBe(true);
    expect(canDecideReference('flagged', 'restore', 'granted')).toBe(true);
    expect(canDecideReference('verified', 'restore', 'granted')).toBe(false);
    expect(canDecideReference('candidate', 'register', 'granted')).toBe(false);
  });
});

describe('deriveDomainAuthorityState', () => {
  it('derives the authority state from the latest decision', () => {
    const authorityDecisions: ReadonlyArray<{
      readonly decision: DomainAuthorityDecision;
      readonly resultingState: DomainAuthorityState;
    }> = [
      { decision: 'register', resultingState: 'candidate' },
      { decision: 'grant', resultingState: 'granted' },
    ];
    expect(deriveDomainAuthorityState(authorityDecisions)).toBe('granted');
    expect(deriveDomainAuthorityState([])).toBe('candidate');
  });

  it('allows regrant only after a revocation', () => {
    expect(canDecideDomainAuthority('candidate', 'grant')).toBe(true);
    expect(canDecideDomainAuthority('granted', 'grant')).toBe(false);
    expect(canDecideDomainAuthority('granted', 'revoke')).toBe(true);
    expect(canDecideDomainAuthority('revoked', 'regrant')).toBe(true);
    expect(canDecideDomainAuthority('candidate', 'regrant')).toBe(false);
  });
});

describe('deriveEffectiveReferenceState', () => {
  it('lets an unreleased security flag win over a later verification', () => {
    const decisions = [
      decision('register', 'candidate', '2026-08-29T00:00:00.000Z'),
      decision('verify', 'verified', '2026-08-29T01:00:00.000Z', 'evidence-1'),
    ];
    expect(deriveEffectiveReferenceState(decisions, false)).toBe('verified');
    expect(deriveEffectiveReferenceState(decisions, true)).toBe('flagged');
  });

  it('returns flagged even with no decision history', () => {
    expect(deriveEffectiveReferenceState([], true)).toBe('flagged');
    expect(deriveEffectiveReferenceState([], false)).toBe('candidate');
  });
});
