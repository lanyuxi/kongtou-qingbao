import type {
  AcceptTutorialCandidateCommandV1,
  PublishTutorialVersionCommandV1,
  RejectTutorialCandidateCommandV1,
  RetireTutorialCommandV1,
  TutorialCandidateReviewDetail,
  TutorialCandidateReviewListItem,
  TutorialReviewDetail,
  TutorialReviewListItem,
} from '@airdrop/contracts';
import type { TutorialReviewRepository } from '@airdrop/database/tutorial-review';
import { describe, expect, it } from 'vitest';

import type { AuthenticatedUserVerifier } from '../lib/tutorial-review-handlers.js';
import {
  createTutorialAcceptHandler,
  createTutorialCandidateDetailHandler,
  createTutorialCandidateListHandler,
  createTutorialListHandler,
  createTutorialPublishHandler,
  createTutorialRejectHandler,
  createTutorialRetireHandler,
  createTutorialDetailHandler,
} from '../lib/tutorial-review-handlers.js';

const projectId = 'b1000000-0000-4000-8000-000000000001';
const candidateId = 'b1000000-0000-4000-8000-000000000002';
const tutorialId = 'b1000000-0000-4000-8000-000000000003';
const referenceId = 'b1000000-0000-4000-8000-000000000004';
const accessToken = 'tutorial-review-token';
const requestId = 'b1000000-0000-4000-8000-000000000009';

const candidateItem: TutorialCandidateReviewListItem = {
  candidateId,
  projectId,
  kind: 'airdrop_campaign',
  status: 'pending',
  title: '官方空投参与教程',
  createdAt: '2026-09-02T04:00:00.000Z',
};
const candidateDetail: TutorialCandidateReviewDetail = {
  ...candidateItem,
  summary: '覆盖从钱包连接到任务领取的完整步骤。',
  payload: { confidence: 80 },
  sourceSignalIds: ['b1000000-0000-4000-8000-000000000005'],
  confidence: 80,
};
const tutorialItem: TutorialReviewListItem = {
  tutorialId,
  projectId,
  kind: 'airdrop_campaign',
  status: 'published',
  version: 1,
  title: '官方空投参与教程',
  updatedAt: '2026-09-02T05:00:00.000Z',
};
const tutorialDetail: TutorialReviewDetail = {
  ...tutorialItem,
  summary: '覆盖从钱包连接到任务领取的完整步骤。',
  lastVerifiedAt: '2026-09-02T04:30:00.000Z',
  steps: [
    { ordinal: 1, title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
    {
      ordinal: 2,
      title: '打开领取页',
      body: '前往官方领取页查看任务。',
      links: [{
        referenceId,
        referenceLabel: '官方领取页',
        renderable: true,
        lastVerifiedAt: '2026-09-02T04:00:00.000Z',
      }],
    },
  ],
  decisions: [],
  statusEvents: [],
};
const acceptCommand: AcceptTutorialCandidateCommandV1 = {
  version: 1,
  candidateId,
  expectedCandidateVersion: 1,
  steps: [
    { title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
    {
      title: '打开领取页',
      body: '前往官方领取页查看任务。',
      links: [{ referenceId }],
    },
  ],
};
const rejectCommand: RejectTutorialCandidateCommandV1 = {
  version: 1,
  candidateId,
  expectedCandidateVersion: 1,
  reasonCode: 'duplicate',
  note: null,
};
const publishCommand: PublishTutorialVersionCommandV1 = {
  version: 1,
  tutorialId,
  expectedVersion: 1,
  steps: acceptCommand.steps,
};
const retireCommand: RetireTutorialCommandV1 = {
  version: 1,
  tutorialId,
  expectedVersion: 2,
  reasonCode: 'security_blocked',
  note: null,
};

function authStub(value: { userId: string } | null, failing = false): AuthenticatedUserVerifier {
  return {
    verifyAuthorizationHeader: async () => {
      if (failing) throw new Error('auth unavailable');
      return value;
    },
  };
}

function reviewsStub(overrides: Partial<Record<keyof TutorialReviewRepository, unknown>> = {}) {
  const calls: unknown[] = [];
  const base = {
    listCandidates: async () => ({ version: 1 as const, items: [candidateItem], nextCursor: null }),
    getCandidate: async () => candidateDetail,
    listTutorials: async () => ({ version: 1 as const, items: [tutorialItem], nextCursor: null }),
    getTutorial: async () => tutorialDetail,
    acceptCandidate: async () => ({
      version: 1 as const, commandId: 'b1000000-0000-4000-8000-000000000006',
      candidateId, tutorialId, tutorialVersion: 1, replayed: false,
    }),
    rejectCandidate: async () => ({
      version: 1 as const, commandId: 'b1000000-0000-4000-8000-000000000006',
      candidateId, replayed: false,
    }),
    publishVersion: async () => ({
      version: 1 as const, commandId: 'b1000000-0000-4000-8000-000000000006',
      tutorialId, tutorialVersion: 2, replayed: false,
    }),
    retire: async () => ({
      version: 1 as const, commandId: 'b1000000-0000-4000-8000-000000000006',
      tutorialId, replayed: false,
    }),
  };
  const proxy = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    proxy[key] = value;
  }
  for (const key of Object.keys(proxy)) {
    const original = proxy[key];
    if (typeof original === 'function') {
      proxy[key] = async (...args: unknown[]) => {
        calls.push(args);
        return (original as (...a: unknown[]) => unknown)(...args);
      };
    }
  }
  return { repository: proxy as unknown as TutorialReviewRepository, calls };
}

function deps(
  auth: AuthenticatedUserVerifier,
  repository: TutorialReviewRepository,
) {
  return {
    auth,
    reviews: repository,
    publicTutorials: {} as never,
    ids: { generate: () => requestId },
  };
}

describe('tutorial review handlers', () => {
  it('authenticates before validating the candidate list query', async () => {
    const { repository, calls } = reviewsStub();
    const handler = createTutorialCandidateListHandler(deps(authStub(null), repository));
    const response = await handler(new Request('https://web.test/api/v1/review/tutorials/candidates?status=pending&limit=99999'));
    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'unauthorized',
        message: 'Authentication is required.',
        requestId,
        details: null,
      },
    });
  });

  it('maps a verifier failure to 500 without touching the repository', async () => {
    const { repository, calls } = reviewsStub();
    const handler = createTutorialCandidateListHandler(deps(authStub({ userId: projectId }, true), repository));
    const response = await handler(new Request('https://web.test/api/v1/review/tutorials/candidates'));
    expect(response.status).toBe(500);
    expect(calls).toEqual([]);
  });

  it('rejects an unknown query parameter with invalid_request', async () => {
    const { repository, calls } = reviewsStub();
    const handler = createTutorialCandidateListHandler(deps(authStub({ userId: projectId }), repository));
    const response = await handler(new Request('https://web.test/api/v1/review/tutorials/candidates?extra=1', {
      headers: { authorization: 'Bearer tutorial-review-token' },
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_request');
    expect(calls).toEqual([]);
  });

  it('rejects a malformed cursor as a client paging mistake', async () => {
    const { repository, calls } = reviewsStub();
    const handler = createTutorialCandidateListHandler(deps(authStub({ userId: projectId }), repository));
    const response = await handler(new Request('https://web.test/api/v1/review/tutorials/candidates?cursor=not-base64url+', {
      headers: { authorization: 'Bearer tutorial-review-token' },
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_cursor');
    expect(calls).toEqual([]);
  });

  it('returns strict candidate list envelopes with an encoded next cursor', async () => {
    const nextCursor = { createdAt: '2026-09-02T04:00:00.000Z', candidateId };
    const { repository } = reviewsStub({
      listCandidates: async () => ({
        version: 1 as const,
        items: [candidateItem],
        nextCursor,
      }),
    });
    const handler = createTutorialCandidateListHandler(deps(authStub({ userId: projectId }), repository));
    const response = await handler(new Request('https://web.test/api/v1/review/tutorials/candidates?status=pending', {
      headers: { authorization: 'Bearer tutorial-review-token' },
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ version: 1, items: [candidateItem] });
    expect(body.meta.requestId).toBe(requestId);
    expect(typeof body.meta.nextCursor).toBe('string');
    expect(decodeCursor(body.meta.nextCursor)).toEqual(nextCursor);
  });

  it('rejects a non-UUID candidate path parameter before the repository', async () => {
    const { repository, calls } = reviewsStub();
    const handler = createTutorialCandidateDetailHandler(deps(authStub({ userId: projectId }), repository));
    const response = await handler(
      new Request('https://web.test/api/v1/review/tutorials/candidates/not-a-uuid', {
        headers: { authorization: 'Bearer tutorial-review-token' },
      }),
      { params: Promise.resolve({ candidateId: 'not-a-uuid' }) },
    );
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('routes the accept command bound to the path candidate and requires the idempotency key', async () => {
    const { repository, calls } = reviewsStub();
    const handler = createTutorialAcceptHandler(deps(authStub({ userId: projectId }), repository));
    const request = new Request('https://web.test/api/v1/review/tutorials/candidates/x/accept', {
      method: 'POST',
      headers: {
        'idempotency-key': 'accept-0001',
        'content-type': 'application/json',
        authorization: 'Bearer tutorial-review-token',
      },
      body: JSON.stringify(acceptCommand),
    });
    const response = await handler(request, { params: Promise.resolve({ candidateId }) });
    expect(response.status).toBe(200);
    expect(calls[0]).toEqual([{
      accessToken,
      idempotencyKey: 'accept-0001',
      command: acceptCommand,
    }]);
    const body = await response.json();
    expect(body.data).toMatchObject({ candidateId, tutorialId, replayed: false });
  });

  it('rejects an accept command whose candidateId disagrees with the path', async () => {
    const { repository, calls } = reviewsStub();
    const handler = createTutorialAcceptHandler(deps(authStub({ userId: projectId }), repository));
    const request = new Request('https://web.test/api/v1/review/tutorials/candidates/x/accept', {
      method: 'POST',
      headers: {
        'idempotency-key': 'accept-0002',
        'content-type': 'application/json',
        authorization: 'Bearer tutorial-review-token',
      },
      body: JSON.stringify({ ...acceptCommand, candidateId: tutorialId }),
    });
    const response = await handler(request, { params: Promise.resolve({ candidateId }) });
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('requires the idempotency key on mutations', async () => {
    const { repository, calls } = reviewsStub();
    const handler = createTutorialRejectHandler(deps(authStub({ userId: projectId }), repository));
    const request = new Request('https://web.test/api/v1/review/tutorials/candidates/x/reject', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer tutorial-review-token',
      },
      body: JSON.stringify(rejectCommand),
    });
    const response = await handler(request, { params: Promise.resolve({ candidateId }) });
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('maps repository error codes onto http statuses', async () => {
    const cases: readonly [string, number, string][] = [
      ['tutorial_reviewer_required', 403, 'tutorial_reviewer_required'],
      ['tutorial_not_found', 404, 'tutorial_not_found'],
      ['tutorial_idempotency_conflict', 409, 'tutorial_idempotency_conflict'],
      ['tutorial_not_decidable', 400, 'invalid_request'],
      ['tutorial_steps_invalid', 400, 'invalid_request'],
    ];
    for (const [code, status, expected] of cases) {
      const failure = Object.assign(new Error(code), { code });
      const { repository } = reviewsStub({ publishVersion: async () => { throw failure; } });
      const handler = createTutorialPublishHandler(deps(authStub({ userId: projectId }), repository));
      const request = new Request('https://web.test/api/v1/review/tutorials/x/publish', {
        method: 'POST',
        headers: {
          'idempotency-key': 'publish-0001',
          'content-type': 'application/json',
          authorization: 'Bearer tutorial-review-token',
        },
        body: JSON.stringify(publishCommand),
      });
      const response = await handler(request, { params: Promise.resolve({ tutorialId }) });
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(expected);
    }
  });

  it('retires with the path identifier binding', async () => {
    const { repository, calls } = reviewsStub();
    const handler = createTutorialRetireHandler(deps(authStub({ userId: projectId }), repository));
    const request = new Request('https://web.test/api/v1/review/tutorials/x/retire', {
      method: 'POST',
      headers: {
        'idempotency-key': 'retire-0001',
        'content-type': 'application/json',
        authorization: 'Bearer tutorial-review-token',
      },
      body: JSON.stringify(retireCommand),
    });
    const response = await handler(request, { params: Promise.resolve({ tutorialId }) });
    expect(response.status).toBe(200);
    expect(calls[0]).toEqual([{
      accessToken,
      idempotencyKey: 'retire-0001',
      command: retireCommand,
    }]);
  });

  it('serves the tutorial review list with strict envelopes', async () => {
    const { repository } = reviewsStub();
    const handler = createTutorialListHandler(deps(authStub({ userId: projectId }), repository));
    const response = await handler(new Request('https://web.test/api/v1/review/tutorials?status=published', {
      headers: { authorization: 'Bearer tutorial-review-token' },
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({ version: 1, items: [tutorialItem] });
    expect(body.meta).toEqual({ requestId, nextCursor: null });
  });

  it('serves the tutorial review detail envelope', async () => {
    const { repository } = reviewsStub();
    const handler = createTutorialDetailHandler(deps(authStub({ userId: projectId }), repository));
    const response = await handler(
      new Request(`https://web.test/api/v1/review/tutorials/${tutorialId}`, {
        headers: { authorization: 'Bearer tutorial-review-token' },
      }),
      { params: Promise.resolve({ tutorialId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual(tutorialDetail);
  });
});

function decodeCursor(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}
