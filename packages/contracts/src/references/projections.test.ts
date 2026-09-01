import { describe, expect, it } from 'vitest';

import {
  domainAuthorityReviewListCursorSchema,
  domainAuthorityReviewListQuerySchema,
  publicProjectDomainAuthorityListQuerySchema,
  publicProjectDomainAuthorityListSchema,
  publicProjectDomainAuthoritySchema,
  publicProjectReferenceSchema,
  publicProjectReferenceCursorSchema,
  publicProjectReferenceListQuerySchema,
  publicProjectReferencePageSchema,
  referenceReviewListCursorSchema,
  referenceReviewListQuerySchema,
  reviewerDomainAuthorityDetailSchema,
  reviewerDomainAuthorityListItemSchema,
  reviewerReferenceDetailSchema,
  reviewerReferenceListItemSchema,
} from './projections.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const referenceId = '22222222-2222-4222-8222-222222222222';
const authorityId = '66666666-6666-4666-8666-666666666666';
const evidenceId = '33333333-3333-4333-8333-333333333333';

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

  it('requires a project scope and bounds the public reference list query', () => {
    const cursor = encodeCursor({
      lastVerifiedAt: '2026-08-29T02:00:00.000Z',
      referenceId,
    });

    expect(publicProjectReferenceListQuerySchema.parse({ projectId, cursor })).toEqual({
      projectId,
      cursor,
      limit: 25,
    });
    expect(publicProjectReferenceListQuerySchema.parse({ projectId })).toEqual({
      projectId,
      cursor: null,
      limit: 25,
    });

    for (const invalid of [
      {},
      { projectId, limit: 0 },
      { projectId, limit: 101 },
      { projectId, cursor: 'not-base64url+' },
      { projectId, extra: true },
    ]) {
      expect(
        publicProjectReferenceListQuerySchema.safeParse(invalid).success,
        JSON.stringify(invalid),
      ).toBe(false);
    }
  });

  it('rejects a public reference page that leaks internal fields or a foreign cursor', () => {
    const item = {
      projectId,
      referenceId,
      kind: 'official_site' as const,
      label: '官方领取页',
      url: 'https://example.com/claim',
      lastVerifiedAt: '2026-08-29T00:00:00.000Z',
    };
    const cursor = encodeCursor({
      lastVerifiedAt: '2026-08-29T00:00:00.000Z',
      referenceId,
    });

    expect(publicProjectReferencePageSchema.parse({ items: [item], nextCursor: cursor })).toEqual({
      items: [item],
      nextCursor: cursor,
    });
    expect(publicProjectReferencePageSchema.parse({ items: [], nextCursor: null })).toEqual({
      items: [],
      nextCursor: null,
    });

    for (const invalid of [
      { items: [{ ...item, normalizedDomain: 'example.com' }], nextCursor: null },
      { items: [{ ...item, evidenceId }], nextCursor: null },
      { items: [item], nextCursor: 'not-base64url+' },
      { items: [item], nextCursor: cursor, extra: true },
      { items: [item] },
    ]) {
      expect(publicProjectReferencePageSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('requires a project scope and bounds the public domain authority list query', () => {
    expect(publicProjectDomainAuthorityListQuerySchema.parse({ projectId })).toEqual({
      projectId,
      limit: 25,
    });
    expect(publicProjectDomainAuthorityListQuerySchema.parse({ projectId, limit: 100 })).toEqual({
      projectId,
      limit: 100,
    });

    for (const invalid of [{}, { projectId, limit: 0 }, { projectId, limit: 101 }, { projectId, extra: true }]) {
      expect(
        publicProjectDomainAuthorityListQuerySchema.safeParse(invalid).success,
        JSON.stringify(invalid),
      ).toBe(false);
    }
    expect(
      publicProjectDomainAuthorityListSchema.parse({
        items: [
          {
            projectId,
            authorityId,
            domain: 'example.com',
            grantedAt: '2026-08-29T00:00:00.000Z',
          },
        ],
      }).items,
    ).toHaveLength(1);
    expect(
      publicProjectDomainAuthorityListSchema.safeParse({
        items: [{ projectId, authorityId, domain: 'example.com', grantedAt: '2026-08-29T00:00:00.000Z', note: 'x' }],
      }).success,
    ).toBe(false);
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
        version: 1,
        referenceVersion: 3,
        updatedAt: '2026-08-29T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('parses a strict reference reviewer query and its updated-at cursor', () => {
    const cursor = encodeCursor({
      updatedAt: '2026-08-29T02:00:00.000Z',
      referenceId,
    });

    expect(referenceReviewListQuerySchema.parse({ cursor })).toEqual({
      projectId: null,
      state: 'all',
      cursor,
      limit: 25,
    });
    expect(referenceReviewListCursorSchema.safeParse(cursor).success).toBe(true);

    for (const invalid of [
      encodeCursor({ updatedAt: '2026-08-29T02:00:00.000Z' }),
      encodeCursor({ updatedAt: 'invalid', referenceId }),
      encodeCursor({ updatedAt: '2026-08-29T02:00:00.000Z', referenceId, extra: true }),
    ]) {
      expect(referenceReviewListCursorSchema.safeParse(invalid).success, invalid).toBe(false);
    }
    expect(referenceReviewListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(referenceReviewListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(referenceReviewListQuerySchema.safeParse({ extra: true }).success).toBe(false);
  });

  it('parses a strict domain-authority reviewer query and its updated-at cursor', () => {
    const cursor = encodeCursor({
      updatedAt: '2026-08-29T02:00:00.000Z',
      authorityId,
    });

    expect(
      domainAuthorityReviewListQuerySchema.parse({
        projectId,
        state: 'revoked',
        cursor,
        limit: 50,
      }),
    ).toEqual({ projectId, state: 'revoked', cursor, limit: 50 });
    expect(domainAuthorityReviewListCursorSchema.safeParse(cursor).success).toBe(true);

    for (const invalid of [
      encodeCursor({ updatedAt: '2026-08-29T02:00:00.000Z' }),
      encodeCursor({ updatedAt: 'invalid', authorityId }),
      encodeCursor({ updatedAt: '2026-08-29T02:00:00.000Z', authorityId, extra: true }),
    ]) {
      expect(domainAuthorityReviewListCursorSchema.safeParse(invalid).success, invalid).toBe(false);
    }
    expect(domainAuthorityReviewListQuerySchema.safeParse({ state: 'verified' }).success).toBe(false);
    expect(domainAuthorityReviewListQuerySchema.safeParse({ extra: true }).success).toBe(false);
  });

  it('accepts strict domain-authority list and detail projections with inert notes', () => {
    const item = {
      authorityId,
      projectId,
      domain: 'example.com',
      state: 'granted' as const,
      version: 1 as const,
      authorityVersion: 2,
      updatedAt: '2026-08-29T01:00:00.000Z',
    };
    const detail = {
      ...item,
      decisions: [
        {
          decisionId: '77777777-7777-4777-8777-777777777777',
          decision: 'grant' as const,
          resultingState: 'granted' as const,
          reasonCode: 'official_announcement' as const,
          evidenceId,
          note: '公告中明确列出此域名',
          createdAt: '2026-08-29T01:00:00.000Z',
        },
      ],
    };

    expect(reviewerDomainAuthorityListItemSchema.parse(item)).toEqual(item);
    expect(reviewerDomainAuthorityDetailSchema.parse(detail)).toEqual(detail);
    for (const extra of [
      { reviewerUserId: '44444444-4444-4444-8444-444444444444' },
      { locator: 'article.body' },
      { quote: 'untrusted source text' },
    ]) {
      expect(
        reviewerDomainAuthorityDetailSchema.safeParse({
          ...detail,
          decisions: [{ ...detail.decisions[0], ...extra }],
        }).success,
        JSON.stringify(extra),
      ).toBe(false);
    }
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
        version: 1,
        referenceVersion: 2,
        updatedAt: '2026-08-29T00:00:00.000Z',
        domainAuthority: {
          authorityId: '66666666-6666-4666-8666-666666666666',
          domain: 'example.com',
          state: 'granted',
          authorityVersion: 1,
        },
        decisions: [
          {
            decisionId: '77777777-7777-4777-8777-777777777777',
            decision: 'register',
            resultingState: 'candidate',
            reasonCode: 'insufficient_context',
            evidenceId: null,
            note: null,
            createdAt: '2026-08-29T00:00:00.000Z',
          },
          {
            decisionId: '88888888-8888-4888-8888-888888888888',
            decision: 'verify',
            resultingState: 'verified',
            reasonCode: 'evidence_verified',
            evidenceId,
            note: '已与公告正文交叉核验',
            createdAt: '2026-08-29T01:00:00.000Z',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('keeps inert reviewer notes but rejects actor identity and Evidence locators', () => {
    const detail = {
      referenceId,
      projectId,
      kind: 'official_site' as const,
      label: '官网',
      url: 'https://example.com',
      state: 'verified' as const,
      lastVerifiedAt: '2026-08-29T00:00:00.000Z',
      activeIndicatorId: null,
      version: 1 as const,
      referenceVersion: 2,
      updatedAt: '2026-08-29T00:00:00.000Z',
      domainAuthority: null,
      decisions: [
        {
          decisionId: '77777777-7777-4777-8777-777777777777',
          decision: 'verify' as const,
          resultingState: 'verified' as const,
          reasonCode: 'evidence_verified' as const,
          evidenceId,
          note: '内部核验备注，只能惰性显示',
          createdAt: '2026-08-29T00:00:00.000Z',
        },
      ],
    };

    expect(reviewerReferenceDetailSchema.parse(detail)).toEqual(detail);
    for (const extra of [
      { reviewerUserId: '44444444-4444-4444-8444-444444444444' },
      { locator: 'article.body' },
      { quote: 'untrusted source text' },
    ]) {
      expect(
        reviewerReferenceDetailSchema.safeParse({
          ...detail,
          decisions: [{ ...detail.decisions[0], ...extra }],
        }).success,
        JSON.stringify(extra),
      ).toBe(false);
    }
  });

  it('rejects unsupported decision and reason values in reviewer history', () => {
    const base = {
        referenceId,
        projectId,
        kind: 'official_site',
        label: '官网',
        url: 'https://example.com',
        state: 'verified',
        lastVerifiedAt: '2026-08-29T00:00:00.000Z',
        activeIndicatorId: null,
        version: 1,
        referenceVersion: 2,
        updatedAt: '2026-08-29T00:00:00.000Z',
        domainAuthority: null,
        decisions: [{
          decisionId: '77777777-7777-4777-8777-777777777777',
          decision: 'verify',
          resultingState: 'verified',
          reasonCode: 'evidence_verified',
          evidenceId,
          note: null,
          createdAt: '2026-08-29T00:00:00.000Z',
        }],
      };

    expect(
      reviewerReferenceDetailSchema.safeParse({
        ...base,
        decisions: [{ ...base.decisions[0], decision: 'release_flag' }],
      }).success,
    ).toBe(false);
    expect(
      reviewerReferenceDetailSchema.safeParse({
        ...base,
        decisions: [{ ...base.decisions[0], reasonCode: 'made_up_reason' }],
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
