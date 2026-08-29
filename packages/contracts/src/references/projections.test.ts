import { describe, expect, it } from 'vitest';

import {
  publicProjectDomainAuthoritySchema,
  publicProjectReferenceSchema,
  publicProjectReferenceCursorSchema,
  reviewerReferenceDetailSchema,
  reviewerReferenceListItemSchema,
} from './projections.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const referenceId = '22222222-2222-4222-8222-222222222222';

function encodeCursor(payload: unknown): string {
  return globalThis
    .btoa(JSON.stringify(payload))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

describe('reference projections', () => {
  it('exposes only safe fields on the public reference projection', () => {
    const parsed = publicProjectReferenceSchema.safeParse({
      projectId,
      referenceId,
      kind: 'official_site',
      label: '官方领取页',
      url: 'https://example.com/claim',
      lastVerifiedAt: '2026-08-29T00:00:00.000Z',
    });

    expect(parsed.success).toBe(true);
    expect(Object.keys(publicProjectReferenceSchema.shape)).toEqual([
      'projectId',
      'referenceId',
      'kind',
      'label',
      'url',
      'lastVerifiedAt',
    ]);
  });

  it('rejects public projections that carry internal fields', () => {
    for (const extra of [
      { evidenceId: '33333333-3333-4333-8333-333333333333' },
      { locator: 'https://example.com/claim' },
      { note: 'internal reviewer note' },
      { reviewerUserId: '44444444-4444-4444-8444-444444444444' },
      { normalizedDomain: 'example.com' },
      { state: 'verified' },
    ]) {
      expect(
        publicProjectReferenceSchema.safeParse({
          projectId,
          referenceId,
          kind: 'official_site',
          label: '官方领取页',
          url: 'https://example.com/claim',
          lastVerifiedAt: '2026-08-29T00:00:00.000Z',
          ...extra,
        }).success,
        JSON.stringify(extra),
      ).toBe(false);
    }
  });

  it('rejects a public reference that is not https or carries a fragment', () => {
    for (const url of ['http://example.com/claim', 'https://example.com/claim#frag']) {
      expect(
        publicProjectReferenceSchema.safeParse({
          projectId,
          referenceId,
          kind: 'official_site',
          label: '官方领取页',
          url,
          lastVerifiedAt: '2026-08-29T00:00:00.000Z',
        }).success,
        url,
      ).toBe(false);
    }
  });

  it('exposes only safe fields on the public domain authority projection', () => {
    expect(
      publicProjectDomainAuthoritySchema.safeParse({
        projectId,
        authorityId: referenceId,
        domain: 'example.com',
        grantedAt: '2026-08-29T00:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(Object.keys(publicProjectDomainAuthoritySchema.shape)).toEqual([
      'projectId',
      'authorityId',
      'domain',
      'grantedAt',
    ]);
  });

  it('accepts a reviewer list item with derived state and last verified time', () => {
    expect(
      reviewerReferenceListItemSchema.safeParse({
        referenceId,
        projectId,
        kind: 'claim_portal',
        label: '领取页',
        url: 'https://example.com/claim',
        state: 'flagged',
        lastVerifiedAt: null,
        activeIndicatorId: '55555555-5555-4555-8555-555555555555',
        version: 3,
        updatedAt: '2026-08-29T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('accepts a reviewer detail with append-only decision history', () => {
    expect(
      reviewerReferenceDetailSchema.safeParse({
        referenceId,
        projectId,
        kind: 'official_site',
        label: '官网',
        url: 'https://example.com',
        state: 'verified',
        lastVerifiedAt: '2026-08-29T00:00:00.000Z',
        activeIndicatorId: null,
        version: 2,
        updatedAt: '2026-08-29T00:00:00.000Z',
        domainAuthority: {
          authorityId: '66666666-6666-4666-8666-666666666666',
          domain: 'example.com',
          state: 'granted',
          version: 1,
        },
        decisions: [
          {
            decisionId: '77777777-7777-4777-8777-777777777777',
            decision: 'register',
            resultingState: 'candidate',
            reasonCode: 'insufficient_context',
            evidenceId: null,
            createdAt: '2026-08-29T00:00:00.000Z',
          },
          {
            decisionId: '88888888-8888-4888-8888-888888888888',
            decision: 'verify',
            resultingState: 'verified',
            reasonCode: 'evidence_verified',
            evidenceId: '33333333-3333-4333-8333-333333333333',
            createdAt: '2026-08-29T01:00:00.000Z',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects reviewer detail that leaks reviewer identity or notes', () => {
    expect(
      reviewerReferenceDetailSchema.safeParse({
        referenceId,
        projectId,
        kind: 'official_site',
        label: '官网',
        url: 'https://example.com',
        state: 'verified',
        lastVerifiedAt: '2026-08-29T00:00:00.000Z',
        activeIndicatorId: null,
        version: 2,
        updatedAt: '2026-08-29T00:00:00.000Z',
        domainAuthority: null,
        decisions: [
          {
            decisionId: '77777777-7777-4777-8777-777777777777',
            decision: 'verify',
            resultingState: 'verified',
            reasonCode: 'evidence_verified',
            evidenceId: '33333333-3333-4333-8333-333333333333',
            createdAt: '2026-08-29T00:00:00.000Z',
            reviewerUserId: '44444444-4444-4444-8444-444444444444',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts a well-formed cursor and rejects malformed ones', () => {
    const valid = encodeCursor({
      lastVerifiedAt: '2026-08-29T00:00:00.000Z',
      referenceId,
    });
    expect(publicProjectReferenceCursorSchema.safeParse(valid).success).toBe(true);

    for (const invalid of [
      'not-base64!!',
      encodeCursor({ lastVerifiedAt: '2026-08-29T00:00:00.000Z' }),
      encodeCursor({ lastVerifiedAt: 'not-a-timestamp', referenceId }),
      encodeCursor({ lastVerifiedAt: '2026-08-29T00:00:00.000Z', referenceId: 'not-a-uuid' }),
      encodeCursor({ lastVerifiedAt: '2026-08-29T00:00:00.000Z', referenceId, extra: 1 }),
    ]) {
      expect(
        publicProjectReferenceCursorSchema.safeParse(invalid).success,
        invalid,
      ).toBe(false);
    }
  });
});
