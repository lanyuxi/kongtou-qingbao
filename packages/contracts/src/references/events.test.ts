import { describe, expect, it } from 'vitest';

import { referenceOutboxEventV1Schema } from './events.js';

const referenceId = '11111111-1111-4111-8111-111111111111';
const authorityId = '22222222-2222-4222-8222-222222222222';
const decisionId = '33333333-3333-4333-8333-333333333333';
const indicatorId = '44444444-4444-4444-8444-444444444444';

const base = {
  version: 1 as const,
  aggregateId: referenceId,
  aggregateVersion: 2,
  occurredAt: '2026-08-29T00:00:00.000Z',
};

describe('reference outbox events', () => {
  it('accepts every version-1 reference event with exact keys', () => {
    expect(
      referenceOutboxEventV1Schema.safeParse({
        ...base,
        eventType: 'reference.registered.v1',
        projectId: '55555555-5555-4555-8555-555555555555',
      }).success,
    ).toBe(true);

    expect(
      referenceOutboxEventV1Schema.safeParse({
        ...base,
        eventType: 'reference.decided.v1',
        decisionId,
        resultingState: 'verified',
      }).success,
    ).toBe(true);

    expect(
      referenceOutboxEventV1Schema.safeParse({
        ...base,
        aggregateId: authorityId,
        eventType: 'domain_authority.decided.v1',
        decisionId,
        resultingState: 'granted',
      }).success,
    ).toBe(true);

    expect(
      referenceOutboxEventV1Schema.safeParse({
        ...base,
        eventType: 'reference.security_flagged.v1',
        indicatorId,
      }).success,
    ).toBe(true);
  });

  it('rejects unsafe outbox keys', () => {
    for (const extra of [
      { reviewerUserId: '66666666-6666-4666-8666-666666666666' },
      { note: 'internal note' },
      { locator: 'https://example.com/claim' },
      { quote: 'quoted source text' },
      { payload: { anything: true } },
    ]) {
      expect(
        referenceOutboxEventV1Schema.safeParse({
          ...base,
          eventType: 'reference.decided.v1',
          decisionId,
          resultingState: 'verified',
          ...extra,
        }).success,
        JSON.stringify(extra),
      ).toBe(false);
    }
  });

  it('rejects an unsupported event type and an unsupported version', () => {
    expect(
      referenceOutboxEventV1Schema.safeParse({
        ...base,
        eventType: 'reference.published.v1',
      }).success,
    ).toBe(false);
    expect(
      referenceOutboxEventV1Schema.safeParse({
        ...base,
        version: 2,
        eventType: 'reference.decided.v1',
        decisionId,
        resultingState: 'verified',
      }).success,
    ).toBe(false);
  });

  it('rejects a non-positive aggregate version', () => {
    expect(
      referenceOutboxEventV1Schema.safeParse({
        ...base,
        aggregateVersion: 0,
        eventType: 'reference.decided.v1',
        decisionId,
        resultingState: 'verified',
      }).success,
    ).toBe(false);
  });
});
