import type {
  AcceptTutorialCandidateCommandV1,
  PublishTutorialVersionCommandV1,
} from '@airdrop/contracts';
import { describe, expect, it } from 'vitest';

import {
  createTutorialReviewApiClient,
  type TutorialCandidateListQueryInput,
  type TutorialListQueryInput,
  type TutorialReviewApiFailure,
} from '../lib/tutorial-review-api-client.js';
import type { ReviewSessionController } from '../lib/review-session.js';

const candidateId = 'c3000000-0000-4000-8000-000000000001';
const tutorialId = 'c3000000-0000-4000-8000-000000000002';
const referenceId = 'c3000000-0000-4000-8000-000000000003';
const token = 'tutorial-review-token';

const steps: { title: string; body: string; links: { referenceId: string }[] }[] = [
  { title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
  { title: '打开领取页', body: '前往官方领取页查看任务。', links: [{ referenceId }] },
];

const acceptCommand: AcceptTutorialCandidateCommandV1 = {
  version: 1,
  candidateId,
  expectedCandidateVersion: 1,
  steps,
};
const publishCommand: PublishTutorialVersionCommandV1 = {
  version: 1,
  tutorialId,
  expectedVersion: 1,
  steps,
};

function sessionStub(tokenValue: string | null, failing = false): ReviewSessionController {
  return {
    signIn: async () => ({ ok: true as const }),
    getAccessToken: async () => {
      if (failing) throw new Error('session unavailable');
      return tokenValue;
    },
    signOut: async () => {},
  };
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status });
}

const candidateItem = {
  candidateId,
  projectId: 'c3000000-0000-4000-8000-000000000004',
  kind: 'airdrop_campaign',
  status: 'pending',
  title: '官方空投参与教程',
  createdAt: '2026-09-02T04:00:00.000Z',
};

function okEnvelope(data: unknown, nextCursor: string | null = null) {
  return {
    ok: true,
    data,
    meta: { requestId: 'c3000000-0000-4000-8000-000000000009', nextCursor },
  };
}

function deps(fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, session?: ReviewSessionController) {
  return {
    session: session ?? sessionStub(token),
    fetch: fetchImpl,
    ids: { generate: () => 'c3000000-0000-4000-8000-000000000008' },
  };
}

describe('TutorialReviewApiClient', () => {
  it('lists candidates with bearer auth and returns the typed page', async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit | undefined }[] = [];
    const client = createTutorialReviewApiClient(deps(async (input, init) => {
      requests.push({ input, init });
      return jsonResponse(200, okEnvelope({ version: 1, items: [candidateItem] }));
    }));
    const query: TutorialCandidateListQueryInput = { status: 'pending', cursor: null, limit: 25 };
    const result = await client.listCandidates(query);
    expect(result).toEqual({
      ok: true,
      data: { version: 1, items: [candidateItem] },
      nextCursor: null,
    });
    expect(requests[0]?.input).toBe('/api/v1/review/tutorials/candidates?status=pending&limit=25');
    expect(requests[0]?.init?.headers).toBeInstanceOf(Headers);
    expect(new Headers(requests[0]?.init?.headers).get('authorization')).toBe(`Bearer ${token}`);
  });

  it('reports sign-in required without a session token and never calls fetch', async () => {
    let called = 0;
    const client = createTutorialReviewApiClient(deps(async () => {
      called += 1;
      return jsonResponse(200, okEnvelope({ version: 1, items: [] }));
    }, sessionStub(null)));
    const result = await client.listTutorials({ status: 'all', cursor: null, limit: 25 } satisfies TutorialListQueryInput);
    expect(result).toEqual({ ok: false, state: 'sign_in_required' });
    expect(called).toBe(0);
  });

  it('maps 403 reviewer-required onto forbidden', async () => {
    const client = createTutorialReviewApiClient(deps(async () => jsonResponse(403, {
      ok: false,
      error: { code: 'tutorial_reviewer_required', message: 'x', requestId: 'c3000000-0000-4000-8000-000000000009', details: null },
    })));
    const result = await client.getCandidate(candidateId);
    expect(result).toEqual({ ok: false, state: 'forbidden' });
  });

  it('maps 404 not-found onto not_found', async () => {
    const client = createTutorialReviewApiClient(deps(async () => jsonResponse(404, {
      ok: false,
      error: { code: 'tutorial_not_found', message: 'x', requestId: 'c3000000-0000-4000-8000-000000000009', details: null },
    })));
    const result = await client.getTutorial(tutorialId);
    expect(result).toEqual({ ok: false, state: 'not_found' });
  });

  it('maps 409 onto a typed conflict that is never retried', async () => {
    const client = createTutorialReviewApiClient(deps(async () => jsonResponse(409, {
      ok: false,
      error: { code: 'tutorial_version_conflict', message: 'x', requestId: 'c3000000-0000-4000-8000-000000000009', details: null },
    })));
    const result = await client.publishVersion(tutorialId, publishCommand);
    expect(result).toEqual({ ok: false, state: 'conflict', code: 'tutorial_version_conflict' });
  });

  it('posts the accept command to the candidate-scoped route with an idempotency key', async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit | undefined }[] = [];
    const client = createTutorialReviewApiClient(deps(async (input, init) => {
      requests.push({ input, init });
      return jsonResponse(200, okEnvelope({
        version: 1,
        commandId: 'c3000000-0000-4000-8000-000000000005',
        candidateId,
        tutorialId,
        tutorialVersion: 1,
        replayed: false,
      }));
    }));
    const result = await client.acceptCandidate(acceptCommand);
    expect(result.ok).toBe(true);
    expect(requests[0]?.input).toBe(`/api/v1/review/tutorials/candidates/${candidateId}/accept`);
    expect(new Headers(requests[0]?.init?.headers).get('idempotency-key')).toBe('c3000000-0000-4000-8000-000000000008');
  });

  it('rejects commands whose identifier disagrees with the route without calling fetch', async () => {
    let called = 0;
    const client = createTutorialReviewApiClient(deps(async () => {
      called += 1;
      return jsonResponse(200, okEnvelope({ version: 1 }));
    }));
    const result = await client.publishVersion(candidateId, publishCommand);
    expect(result.ok).toBe(false);
    expect(called).toBe(0);
  });

  it('rejects a malformed path identifier without calling fetch', async () => {
    let called = 0;
    const client = createTutorialReviewApiClient(deps(async () => {
      called += 1;
      return jsonResponse(200, okEnvelope({ version: 1 }));
    }));
    const result = await client.getTutorial('not-a-uuid');
    expect((result as TutorialReviewApiFailure).state).toBe('request_failed');
    expect(called).toBe(0);
  });

  it('retires via the tutorial-scoped route', async () => {
    const requests: { input: RequestInfo | URL }[] = [];
    const client = createTutorialReviewApiClient(deps(async (input) => {
      requests.push({ input });
      return jsonResponse(200, okEnvelope({
        version: 1,
        commandId: 'c3000000-0000-4000-8000-000000000006',
        tutorialId,
        replayed: false,
      }));
    }));
    const result = await client.retire(tutorialId, {
      version: 1,
      tutorialId,
      expectedVersion: 2,
      reasonCode: 'security_blocked',
      note: null,
    });
    expect(result.ok).toBe(true);
    expect(requests[0]?.input).toBe(`/api/v1/review/tutorials/${tutorialId}/retire`);
  });
});
