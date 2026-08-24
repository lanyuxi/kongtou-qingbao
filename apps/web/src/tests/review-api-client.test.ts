import type {
  FailedAiRunDecisionCommand,
  FailedAiRunDetail,
  FailedAiRunListQuery,
} from '@airdrop/contracts';
import { describe, expect, it } from 'vitest';

import { createReviewApiClient } from '../lib/review-api-client.js';
import type { ReviewSessionController } from '../lib/review-session.js';

const runId = 'a1000000-0000-4000-8000-000000000001';
const inputId = 'a1000000-0000-4000-8000-000000000002';
const commandId = 'a2000000-0000-4000-8000-000000000001';
const decisionId = 'a3000000-0000-4000-8000-000000000001';
const reviewerUserId = 'a4000000-0000-4000-8000-000000000001';
const requestId = 'a5000000-0000-4000-8000-000000000001';
const nextCursor = 'eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTIyVDAwOjAwOjAwLjAwMFoiLCJpZCI6ImExMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9';

const listItem = {
  version: 1,
  runId,
  status: 'provider_error',
  safeFailureCode: 'provider_error',
  stage: 'extract_discovered_item',
  inputKind: 'discovered_item',
  modelId: 'review-test-model',
  promptVersion: 'extract-v1',
  schemaVersion: 'candidate-v1',
  pipelineVersion: 'pipeline-v1',
  project: null,
  source: null,
  createdAt: '2026-08-22T00:00:00.000Z',
  reviewState: 'unreviewed',
  reviewVersion: 0,
  latestDecisionAt: null,
} as const;

const detail: FailedAiRunDetail = {
  version: 1,
  run: listItem,
  input: { kind: 'discovered_item', id: inputId, collectedAt: null },
  decisions: [{
    version: 1,
    decisionId,
    reviewVersion: 1,
    decision: 'needs_investigation',
    reasonCode: 'provider_instability',
    note: null,
    reviewerUserId,
    createdAt: '2026-08-22T01:00:00.000Z',
  }],
};

const query: FailedAiRunListQuery = {
  reviewState: 'unreviewed',
  status: 'provider_error',
  cursor: nextCursor,
  limit: 25,
};

const command: FailedAiRunDecisionCommand = {
  version: 1,
  expectedReviewVersion: 0,
  decision: 'needs_investigation',
  reasonCode: 'provider_instability',
  note: null,
};

describe('review API client', () => {
  it('parses the exact shared list envelope and sends literal filters with the current token', async () => {
    const requests: Request[] = [];
    const client = createReviewApiClient({
      session: sessionWithTokens('current-list-token'),
      fetch: recordingFetch(requests, success({ version: 1, items: [listItem] }, nextCursor)),
      ids: ids('unused-id'),
    });

    const result = await client.list(query);

    expect(result).toEqual({ ok: true, data: { version: 1, items: [listItem] }, nextCursor });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `http://local/api/v1/review/ai-runs?reviewState=unreviewed&status=provider_error&cursor=${nextCursor}&limit=25`,
    );
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer current-list-token');
  });

  it('parses the exact shared detail envelope', async () => {
    const requests: Request[] = [];
    const client = createReviewApiClient({
      session: sessionWithTokens('current-detail-token'),
      fetch: recordingFetch(requests, success(detail, null)),
      ids: ids('unused-id'),
    });

    const result = await client.get(runId);

    expect(result).toEqual({ ok: true, data: detail, nextCursor: null });
    expect(requests[0]?.url).toBe(`http://local/api/v1/review/ai-runs/${runId}`);
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer current-detail-token');
  });

  it('adds the current token, fresh idempotency key, and exact JSON to every decision request', async () => {
    const requests: Request[] = [];
    let id = 0;
    const client = createReviewApiClient({
      session: sessionWithTokens('access-token-1', 'access-token-2'),
      fetch: recordingFetch(requests, success(decisionResult(), null)),
      ids: { generate: () => `review-run-${++id}` },
    });

    await client.decide(runId, command);
    await client.decide(runId, command);

    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.headers.get('authorization')))
      .toEqual(['Bearer access-token-1', 'Bearer access-token-2']);
    expect(requests.map((request) => request.headers.get('idempotency-key')))
      .toEqual(['review-run-1', 'review-run-2']);
    expect(requests[0]?.headers.get('content-type')).toBe('application/json');
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.url).toBe(`http://local/api/v1/review/ai-runs/${runId}/decisions`);
    await expect(requests[0]?.json()).resolves.toEqual(command);
  });

  it.each([
    ['list', (client: ReturnType<typeof createReviewApiClient>) => client.list(query)],
    ['detail', (client: ReturnType<typeof createReviewApiClient>) => client.get(runId)],
    ['decision', (client: ReturnType<typeof createReviewApiClient>) => client.decide(runId, command)],
  ])('returns a sign-in redirect signal for a missing session before %s fetch', async (
    _name,
    invoke,
  ) => {
    let fetchCalls = 0;
    const client = createReviewApiClient({
      session: sessionWithTokens(null),
      fetch: async () => {
        fetchCalls += 1;
        throw new Error('fetch must not run');
      },
      ids: ids('review-run-1'),
    });

    await expect(invoke(client)).resolves.toEqual({ ok: false, state: 'sign_in_required' });
    expect(fetchCalls).toBe(0);
  });

  it('returns a sign-in redirect signal when session resolution fails', async () => {
    const client = createReviewApiClient({
      session: sessionWithFailure('provider refresh token=secret'),
      fetch: async () => { throw new Error('fetch must not run'); },
      ids: ids('unused-id'),
    });

    const result = await client.list(query);

    expect(result).toEqual({ ok: false, state: 'sign_in_required' });
    expect(JSON.stringify(result)).not.toMatch(/provider|token|secret/i);
  });

  it.each([
    [401, 'unauthorized', { ok: false, state: 'sign_in_required' }],
    [403, 'reviewer_required', { ok: false, state: 'forbidden' }],
    [404, 'review_run_not_found', { ok: false, state: 'not_found' }],
    [409, 'review_version_conflict', {
      ok: false,
      state: 'conflict',
      code: 'review_version_conflict',
    }],
    [409, 'review_idempotency_conflict', {
      ok: false,
      state: 'conflict',
      code: 'review_idempotency_conflict',
    }],
  ])('maps HTTP %s %s to a bounded state', async (status, code, expected) => {
    const client = createReviewApiClient({
      session: sessionWithTokens('access-token'),
      fetch: async () => errorResponse(status, code),
      ids: ids('review-run-1'),
    });

    const result = await client.decide(runId, command);

    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toMatch(/password|postgres|source body|provider detail/i);
  });

  it.each([
    ['malformed JSON', async () => new Response('{not-json', { status: 200 })],
    ['malformed success envelope', async () => Response.json({ ok: true, data: detail })],
    ['success payload with unsafe extra data', async () => success({ ...detail, errorDetail: 'password=secret' }, null)],
    ['malformed error envelope', async () => Response.json({ ok: false, error: { code: 'reviewer_required', message: 'provider detail' } }, { status: 403 })],
    ['network failure', async () => { throw new Error('postgres://password provider detail'); }],
  ])('returns only a bounded failure for %s', async (_name, fetch) => {
    const client = createReviewApiClient({
      session: sessionWithTokens('access-token'),
      fetch,
      ids: ids('review-run-1'),
    });

    const result = await client.get(runId);

    expect(result).toEqual({ ok: false, state: 'request_failed' });
    expect(JSON.stringify(result)).not.toMatch(/password|postgres|provider|detail/i);
  });

  it('does not reuse a token across list, detail, and decision calls', async () => {
    const requests: Request[] = [];
    const responses = [
      success({ version: 1, items: [] }, null),
      success(detail, null),
      success(decisionResult(), null),
    ];
    const client = createReviewApiClient({
      session: sessionWithTokens('list-token', 'detail-token', 'decision-token'),
      fetch: async (input, init) => {
        const resolvedInput = typeof input === 'string' ? new URL(input, 'http://local') : input;
        requests.push(new Request(resolvedInput, init));
        const response = responses.shift();
        if (response === undefined) throw new Error('unexpected request');
        return response;
      },
      ids: ids('review-run-1'),
    });

    await client.list({ reviewState: 'all', status: 'all', cursor: null, limit: 25 });
    await client.get(runId);
    await client.decide(runId, command);

    expect(requests.map((request) => request.headers.get('authorization')))
      .toEqual(['Bearer list-token', 'Bearer detail-token', 'Bearer decision-token']);
  });
});

function success(data: unknown, cursor: string | null): Response {
  return Response.json({
    ok: true,
    data,
    meta: { requestId, nextCursor: cursor },
  });
}

function errorResponse(status: number, code: string): Response {
  return Response.json({
    ok: false,
    error: {
      code,
      message: 'provider detail password=secret postgres source body',
      requestId,
      details: null,
    },
  }, { status });
}

function decisionResult() {
  return {
    version: 1,
    commandId,
    runId,
    decisionId,
    reviewVersion: 1,
    reviewState: 'needs_investigation',
    replayed: false,
  } as const;
}

function ids(value: string) {
  return { generate: () => value };
}

function sessionWithTokens(...tokens: Array<string | null>): ReviewSessionController {
  let index = 0;
  return {
    signIn: async () => ({ ok: true }),
    getAccessToken: async () => tokens[Math.min(index++, tokens.length - 1)] ?? null,
    signOut: async () => undefined,
  };
}

function sessionWithFailure(message: string): ReviewSessionController {
  return {
    signIn: async () => ({ ok: true }),
    getAccessToken: async () => { throw new Error(message); },
    signOut: async () => undefined,
  };
}

function recordingFetch(requests: Request[], response: Response) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const resolvedInput = typeof input === 'string' ? new URL(input, 'http://local') : input;
    requests.push(new Request(resolvedInput, init));
    return response.clone();
  };
}
