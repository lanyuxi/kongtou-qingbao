import { describe, expect, it } from 'vitest';

import * as contracts from '../index.js';

const candidateId = 'a4000000-0000-4000-8000-000000000001';
const projectId = 'a4000000-0000-4000-8000-000000000002';

describe('security outbox contracts', () => {
  it('accepts an exact safe candidate-submitted event payload', () => {
    const event = {
      version: 1,
      eventType: 'security.candidate.submitted.v1',
      aggregateId: candidateId,
      aggregateVersion: 1,
      candidateId,
      target: { type: 'project', id: projectId },
      occurredAt: '2026-08-26T00:00:00.000Z',
    } as const;
    expect(contracts.securityOutboxEventV1Schema.parse(event)).toEqual(event);
  });

  it.each(['reviewerUserId', 'note', 'locator', 'quote', 'payload', 'indicatorValue'])(
    'rejects sensitive outbox field %s',
    (key) => {
    expect(contracts.securityOutboxEventV1Schema.safeParse({
      version: 1,
      eventType: 'security.candidate.submitted.v1',
      aggregateId: candidateId,
      aggregateVersion: 1,
      candidateId,
      target: { type: 'project', id: projectId },
      occurredAt: '2026-08-26T00:00:00.000Z',
      [key]: 'secret',
    }).success).toBe(false);
    },
  );

  it('rejects malformed timestamps and aggregate versions', () => {
    expect(contracts.securityOutboxEventV1Schema.safeParse({
      version: 1,
      eventType: 'security.candidate.submitted.v1',
      aggregateId: candidateId,
      aggregateVersion: 0,
      candidateId,
      target: { type: 'project', id: projectId },
      occurredAt: 'not-a-timestamp',
    }).success).toBe(false);
  });

  it('accepts only compatible indicator disclosure decisions and reasons', () => {
    const command = {
      version: 1,
      indicatorId: candidateId,
      expectedIndicatorVersion: 1,
      decision: 'publish',
      reasonCode: 'safe_for_public_warning',
      note: null,
    } as const;
    expect(contracts.securityIndicatorDisclosureCommandV1Schema.parse(command)).toEqual(command);
    expect(contracts.securityIndicatorDisclosureCommandV1Schema.safeParse({
      ...command,
      decision: 'withdraw',
    }).success).toBe(false);
  });
});
