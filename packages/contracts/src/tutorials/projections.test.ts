import { describe, expect, it } from 'vitest';

import {
  publicTutorialCursorSchema,
  publicTutorialDetailSchema,
  publicTutorialListQuerySchema,
  tutorialCandidateCursorSchema,
  tutorialCandidateReviewListQuerySchema,
  tutorialCandidateReviewListItemSchema,
  tutorialReviewCursorSchema,
  tutorialReviewDetailSchema,
  tutorialReviewListQuerySchema,
  tutorialReviewListItemSchema,
} from './projections.js';

const tutorialId = '22222222-2222-4222-8222-222222222222';
const candidateId = '11111111-1111-4111-8111-111111111111';
const projectId = '44444444-4444-4444-8444-444444444444';
const referenceId = '33333333-3333-4333-8333-333333333333';

const publishedAt = '2026-09-02T00:00:00.000Z';
const verifiedAt = '2026-09-01T00:00:00.000Z';

const publicDetail = {
  tutorialId,
  projectId,
  kind: 'airdrop_campaign',
  title: 'Ethereum 空投参与教程',
  summary: '从连接钱包到领取的完整参与步骤。',
  version: 3,
  lastVerifiedAt: verifiedAt,
  publishedAt,
  steps: [
    {
      ordinal: 1,
      title: '连接钱包',
      body: '在官方站点连接你的钱包并切换到目标网络。',
      links: [
        {
          referenceId,
          url: 'https://example.com/claim',
          label: '官方领取页',
          lastVerifiedAt: verifiedAt,
          renderable: true,
        },
      ],
    },
    {
      ordinal: 2,
      title: '完成社交任务',
      body: '按官方公告完成转发与加入社区两步。',
      links: [
        {
          referenceId,
          url: null,
          label: null,
          lastVerifiedAt: null,
          renderable: false,
        },
      ],
    },
  ],
};

describe('public tutorial projections', () => {
  it('exposes the exact safe key set on the public detail', () => {
    expect(publicTutorialDetailSchema.safeParse(publicDetail).success).toBe(true);
    expect(Object.keys(publicTutorialDetailSchema.shape)).toEqual([
      'tutorialId',
      'projectId',
      'kind',
      'title',
      'summary',
      'version',
      'lastVerifiedAt',
      'publishedAt',
      'steps',
    ]);
  });

  it('rejects internal fields on the public detail', () => {
    for (const extra of [
      { candidatePayload: {} },
      { note: 'internal' },
      { reviewerUserId: '55555555-5555-4555-8555-555555555555' },
      { sourceSignalIds: [] },
      { status: 'needs_review' },
    ]) {
      expect(
        publicTutorialDetailSchema.safeParse({ ...publicDetail, ...extra }).success,
        JSON.stringify(Object.keys(extra)),
      ).toBe(false);
    }
  });

  it('requires every resolved link to carry renderable and nullable url fields', () => {
    const step = publicDetail.steps[0];
    expect(
      publicTutorialDetailSchema.safeParse({
        ...publicDetail,
        steps: [{ ...step, links: [{ referenceId, url: 'https://ok.example/x', label: 'x' }] }],
      }).success,
    ).toBe(false);
  });

  it('bounds the public list query and validates its cursor', () => {
    const cursor = publicTutorialCursorSchema.parse({ publishedAt, tutorialId });
    expect(publicTutorialListQuerySchema.parse({ projectId, cursor })).toEqual({
      projectId,
      cursor,
      limit: 12,
    });
    for (const invalid of [
      {},
      { projectId, limit: 0 },
      { projectId, limit: 51 },
      { projectId, cursor: 'not-base64url+' },
      { projectId, extra: true },
    ]) {
      expect(
        publicTutorialListQuerySchema.safeParse(invalid).success,
        JSON.stringify(invalid),
      ).toBe(false);
    }
  });
});

describe('reviewer projections', () => {
  it('exposes the candidate list item without the payload body', () => {
    const item = {
      candidateId,
      projectId,
      kind: 'points_program',
      status: 'pending',
      title: '积分计划参与教程（候选）',
      createdAt: publishedAt,
    };
    expect(tutorialCandidateReviewListItemSchema.safeParse(item).success).toBe(true);
    expect(Object.keys(tutorialCandidateReviewListItemSchema.shape)).toEqual([
      'candidateId',
      'projectId',
      'kind',
      'status',
      'title',
      'createdAt',
    ]);
    expect(
      tutorialCandidateReviewListItemSchema.safeParse({ ...item, payload: { steps: [] } }).success,
    ).toBe(false);
  });

  it('bounds the candidate list query and validates its cursor', () => {
    const cursor = tutorialCandidateCursorSchema.parse({ createdAt: publishedAt, candidateId });
    expect(tutorialCandidateReviewListQuerySchema.parse({})).toEqual({
      status: 'pending',
      cursor: null,
      limit: 25,
    });
    expect(
      tutorialCandidateReviewListQuerySchema.parse({ status: 'all', cursor, limit: 100 }).limit,
    ).toBe(100);
    expect(
      tutorialCandidateReviewListQuerySchema.safeParse({ status: 'published' }).success,
    ).toBe(false);
  });

  it('exposes the tutorial review list item with status and version', () => {
    const item = {
      tutorialId,
      projectId,
      kind: 'airdrop_campaign',
      status: 'needs_review',
      version: 3,
      title: 'Ethereum 空投参与教程',
      updatedAt: publishedAt,
    };
    expect(tutorialReviewListItemSchema.safeParse(item).success).toBe(true);
    expect(Object.keys(tutorialReviewListItemSchema.shape)).toEqual([
      'tutorialId',
      'projectId',
      'kind',
      'status',
      'version',
      'title',
      'updatedAt',
    ]);
  });

  it('bounds the tutorial review list query statuses', () => {
    const cursor = tutorialReviewCursorSchema.parse({ updatedAt: publishedAt, tutorialId });
    expect(tutorialReviewListQuerySchema.parse({})).toEqual({
      status: 'all',
      cursor: null,
      limit: 25,
    });
    expect(tutorialReviewListQuerySchema.parse({ status: 'blocked', cursor, limit: 1 }).limit).toBe(
      1,
    );
    expect(tutorialReviewListQuerySchema.safeParse({ status: 'draft' }).success).toBe(false);
    expect(tutorialReviewListQuerySchema.safeParse({ status: 'in_review' }).success).toBe(false);
  });

  it('exposes the review detail with steps, decisions, and status events, keeping notes internal', () => {
    const detail = {
      tutorialId,
      projectId,
      kind: 'airdrop_campaign',
      status: 'published',
      version: 3,
      title: 'Ethereum 空投参与教程',
      summary: '从连接钱包到领取的完整参与步骤。',
      lastVerifiedAt: verifiedAt,
      updatedAt: publishedAt,
      steps: [
        {
          ordinal: 1,
          title: '连接钱包',
          body: '在官方站点连接你的钱包并切换到目标网络。',
          links: [
            {
              referenceId,
              referenceLabel: '官方领取页',
              renderable: true,
              lastVerifiedAt: verifiedAt,
            },
          ],
        },
        {
          ordinal: 2,
          title: '完成社交任务',
          body: '按官方公告完成转发与加入社区两步。',
          links: [
            {
              referenceId,
              referenceLabel: null,
              renderable: false,
              lastVerifiedAt: null,
            },
          ],
        },
      ],
      decisions: [
        {
          decision: 'publish_version',
          reasonCode: null,
          note: '内部核验备注，仅审核侧可见',
          aggregateVersion: 3,
          createdAt: publishedAt,
        },
      ],
      statusEvents: [
        {
          trigger: 'reference_unrenderable',
          fromStatus: 'published',
          toStatus: 'needs_review',
          createdAt: publishedAt,
        },
      ],
    };
    expect(tutorialReviewDetailSchema.safeParse(detail).success).toBe(true);
    for (const extra of [
      { candidatePayload: {} },
      { reviewerUserId: '55555555-5555-4555-8555-555555555555' },
      { idempotencyKey: 'secret' },
    ]) {
      expect(
        tutorialReviewDetailSchema.safeParse({ ...detail, ...extra }).success,
        JSON.stringify(Object.keys(extra)),
      ).toBe(false);
    }
  });
});
