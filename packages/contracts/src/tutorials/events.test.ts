import { describe, expect, it } from 'vitest';

import { tutorialOutboxEventV1Schema } from './events.js';

const tutorialId = '22222222-2222-4222-8222-222222222222';
const projectId = '44444444-4444-4444-8444-444444444444';
const occurredAt = '2026-09-02T00:00:00.000Z';

describe('tutorial outbox events', () => {
  it('accepts the published event with only safe keys', () => {
    expect(
      tutorialOutboxEventV1Schema.safeParse({
        version: 1,
        eventType: 'tutorial.published.v1',
        aggregateId: tutorialId,
        aggregateVersion: 3,
        occurredAt,
        projectId,
        kind: 'airdrop_campaign',
      }).success,
    ).toBe(true);
  });

  it('accepts the status-changed event with an optional trigger', () => {
    expect(
      tutorialOutboxEventV1Schema.safeParse({
        version: 1,
        eventType: 'tutorial.status_changed.v1',
        aggregateId: tutorialId,
        aggregateVersion: 4,
        occurredAt,
        projectId,
        fromStatus: 'published',
        toStatus: 'needs_review',
        trigger: 'reference_unrenderable',
      }).success,
    ).toBe(true);
    expect(
      tutorialOutboxEventV1Schema.safeParse({
        version: 1,
        eventType: 'tutorial.status_changed.v1',
        aggregateId: tutorialId,
        aggregateVersion: 4,
        occurredAt,
        projectId,
        fromStatus: 'needs_review',
        toStatus: 'published',
        trigger: null,
      }).success,
    ).toBe(true);
  });

  it('never carries unsafe payloads', () => {
    for (const unsafe of [
      { steps: [] },
      { note: 'internal' },
      { reviewerUserId: '55555555-5555-4555-8555-555555555555' },
      { sourceSignalIds: [] },
      { summary: '全文不应进事件' },
    ]) {
      expect(
        tutorialOutboxEventV1Schema.safeParse({
          version: 1,
          eventType: 'tutorial.published.v1',
          aggregateId: tutorialId,
          aggregateVersion: 3,
          occurredAt,
          projectId,
          kind: 'airdrop_campaign',
          ...unsafe,
        }).success,
        JSON.stringify(Object.keys(unsafe)),
      ).toBe(false);
    }
  });

  it('rejects unknown event types and malformed versions', () => {
    expect(
      tutorialOutboxEventV1Schema.safeParse({
        version: 1,
        eventType: 'tutorial.deleted.v1',
        aggregateId: tutorialId,
        aggregateVersion: 1,
        occurredAt,
      }).success,
    ).toBe(false);
    expect(
      tutorialOutboxEventV1Schema.safeParse({
        version: 2,
        eventType: 'tutorial.published.v1',
        aggregateId: tutorialId,
        aggregateVersion: 3,
        occurredAt,
        projectId,
        kind: 'airdrop_campaign',
      }).success,
    ).toBe(false);
  });
});
