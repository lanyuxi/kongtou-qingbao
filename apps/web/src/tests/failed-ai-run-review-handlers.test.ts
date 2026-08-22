import type {
  FailedAiRunDecisionCommand,
  FailedAiRunDecisionResult,
  FailedAiRunDetail,
  FailedAiRunListQuery,
} from '@airdrop/contracts';
import type {
  FailedAiRunListResult,
  FailedAiRunReviewRepository,
} from '@airdrop/database/failed-ai-run-review';
import { describe, expect, it } from 'vitest';

import {
  createFailedAiRunDecisionHandler,
  createFailedAiRunDetailHandler,
  createFailedAiRunListHandler,
  type AuthenticatedUserVerifier,
} from '../lib/failed-ai-run-review-handlers.js';

const runId = 'a1000000-0000-4000-8000-000000000001';
const inputId = 'a1000000-0000-4000-8000-000000000002';
const commandId = 'a1000000-0000-4000-8000-000000000003';
const decisionId = 'a1000000-0000-4000-8000-000000000004';
const reviewerUserId = 'a1000000-0000-4000-8000-000000000005';
const requestId = 'a1000000-0000-4000-8000-000000000006';
const accessToken = 'local-review-session-token';
const cursor =
  'eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTIyVDAwOjAwOjAwLjAwMFoiLCJpZCI6ImExMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9';
const nextCursor =
  'eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTIyVDAxOjAwOjAwLjAwMFoiLCJpZCI6ImExMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9';

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
    note: 'Check provider health.',
    reviewerUserId,
    createdAt: '2026-08-22T01:00:00.000Z',
  }],
};

const command: FailedAiRunDecisionCommand = {
  version: 1,
  expectedReviewVersion: 0,
  decision: 'needs_investigation',
  reasonCode: 'provider_instability',
  note: 'Check provider health.',
};

const decisionResult: FailedAiRunDecisionResult = {
  version: 1,
  commandId,
  runId,
  decisionId,
  reviewVersion: 1,
  reviewState: 'needs_investigation',
  replayed: false,
};

describe('failed AI run review BFF handlers', () => {
  describe('GET /api/v1/review/ai-runs', () => {
    it('does not call the repository when bearer authentication fails', async () => {
      const reviews = new RecordingReviewRepository();
      const auth = new StaticAuth(null);

      const response = await listHandler(auth, reviews)(listRequest({ authorization: null }));

      await expectExactError(response, 401, 'unauthorized', 'Authentication is required.');
      expect(auth.headers).toEqual([null]);
      expect(reviews.calls).toEqual([]);
    });

    it.each([
      ['missing', null],
      ['malformed', 'Basic local-review-session-token'],
      ['blank bearer', 'Bearer '],
    ])('fails closed for a %s raw authorization header after verifier success', async (
      _caseName,
      authorization,
    ) => {
      const reviews = new RecordingReviewRepository();
      const auth = new StaticAuth({ userId: reviewerUserId });

      const response = await listHandler(auth, reviews)(listRequest({ authorization }));

      await expectExactError(response, 401, 'unauthorized', 'Authentication is required.');
      expect(auth.headers).toEqual([authorization === 'Bearer ' ? 'Bearer' : authorization]);
      expect(reviews.calls).toEqual([]);
    });

    it('returns literal shared metadata and passes only the verified request token and strict filters', async () => {
      const events: string[] = [];
      const reviews = new RecordingReviewRepository(events);
      reviews.listResult = { version: 1, items: [listItem], nextCursor };
      const auth = new StaticAuth({ userId: reviewerUserId }, events);
      const response = await listHandler(auth, reviews)(listRequest({
        query: `reviewState=unreviewed&status=provider_error&cursor=${cursor}&limit=100`,
      }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        data: { version: 1, items: [listItem] },
        meta: { requestId, nextCursor },
      });
      expect(auth.headers).toEqual([`Bearer ${accessToken}`]);
      expect(reviews.calls).toEqual([{
        operation: 'list',
        input: {
          accessToken,
          query: {
            reviewState: 'unreviewed',
            status: 'provider_error',
            cursor,
            limit: 100,
          },
        },
      }]);
      expect(events).toEqual(['auth', 'repository']);
    });

    it('uses the shared query defaults', async () => {
      const reviews = new RecordingReviewRepository();

      await listHandler(new StaticAuth({ userId: reviewerUserId }), reviews)(listRequest());

      expect(reviews.calls).toEqual([{
        operation: 'list',
        input: {
          accessToken,
          query: { reviewState: 'all', status: 'all', cursor: null, limit: 25 },
        },
      }]);
    });

    it.each([
      ['an unknown query key', 'sort=createdAt', 'invalid_request', 'The request is invalid.'],
      ['a duplicate filter', 'status=provider_error&status=grounding_failed', 'invalid_request', 'The request is invalid.'],
      ['a non-integer limit', 'limit=1.5', 'invalid_request', 'The request is invalid.'],
      ['a zero limit', 'limit=0', 'invalid_request', 'The request is invalid.'],
      ['an over-limit value', 'limit=101', 'invalid_request', 'The request is invalid.'],
      ['an unsupported status', 'status=succeeded', 'invalid_request', 'The request is invalid.'],
      ['a malformed cursor', 'cursor=not-a-cursor', 'invalid_cursor', 'The cursor is invalid.'],
    ])('rejects %s before repository access', async (_caseName, query, code, message) => {
      const reviews = new RecordingReviewRepository();

      const response = await listHandler(
        new StaticAuth({ userId: reviewerUserId }),
        reviews,
      )(listRequest({ query }));

      await expectExactError(response, 400, code, message);
      expect(reviews.calls).toEqual([]);
    });

    it.each([
      ['reviewer_required', 403, 'reviewer_required', 'Reviewer access is required.'],
      ['review_query_failed', 500, 'review_query_failed', 'Failed AI runs could not be loaded.'],
    ])('maps %s to a bounded response', async (
      repositoryCode,
      status,
      responseCode,
      message,
    ) => {
      const response = await listHandler(
        new StaticAuth({ userId: reviewerUserId }),
        new RejectingReviewRepository('list', repositoryCode),
      )(listRequest());

      await expectExactError(response, status, responseCode, message);
    });

    it.each(['review_persistence_failed', 'unknown_review_code'])(
      'sanitizes wrong-operation or unknown list code %s to the query fallback',
      async (repositoryCode) => {
        const response = await listHandler(
          new StaticAuth({ userId: reviewerUserId }),
          new RejectingReviewRepository('list', repositoryCode),
        )(listRequest());

        await expectExactError(
          response,
          500,
          'review_query_failed',
          'Failed AI runs could not be loaded.',
        );
      },
    );

    it('sanitizes verifier and unexpected list failures', async () => {
      const secret = sensitiveText();
      const verifierResponse = await listHandler(
        new ThrowingAuth(secret),
        new RecordingReviewRepository(),
      )(listRequest());
      const repositoryResponse = await listHandler(
        new StaticAuth({ userId: reviewerUserId }),
        new RejectingReviewRepository('list', undefined, secret),
      )(listRequest());

      await expectExactError(
        verifierResponse,
        500,
        'review_query_failed',
        'Failed AI runs could not be loaded.',
      );
      await expectExactError(
        repositoryResponse,
        500,
        'review_query_failed',
        'Failed AI runs could not be loaded.',
      );
    });
  });

  describe('GET /api/v1/review/ai-runs/:runId', () => {
    it.each([
      ['missing', null],
      ['malformed', 'Basic local-review-session-token'],
    ])('fails closed for a %s raw authorization header after verifier success', async (
      _caseName,
      authorization,
    ) => {
      const reviews = new RecordingReviewRepository();
      const response = await detailHandler(
        new StaticAuth({ userId: reviewerUserId }),
        reviews,
      )(detailRequest(runId, authorization), routeContext(runId));

      await expectExactError(response, 401, 'unauthorized', 'Authentication is required.');
      expect(reviews.calls).toEqual([]);
    });

    it.each(['not-a-uuid', 'a1000000-0000-0000-8000-000000000001'])(
      'rejects invalid run UUID %s before repository access',
      async (requestedRunId) => {
        const reviews = new RecordingReviewRepository();
        const response = await detailHandler(
          new StaticAuth({ userId: reviewerUserId }),
          reviews,
        )(detailRequest(requestedRunId), routeContext(requestedRunId));

        await expectExactError(response, 400, 'invalid_request', 'The request is invalid.');
        expect(reviews.calls).toEqual([]);
      },
    );

    it('returns a strict detail envelope and forwards the request-local token', async () => {
      const reviews = new RecordingReviewRepository();
      const response = await detailHandler(
        new StaticAuth({ userId: reviewerUserId }),
        reviews,
      )(detailRequest(), routeContext(runId));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        data: detail,
        meta: { requestId, nextCursor: null },
      });
      expect(reviews.calls).toEqual([{
        operation: 'get',
        input: { accessToken, runId },
      }]);
    });

    it.each([
      ['reviewer_required', 403, 'reviewer_required', 'Reviewer access is required.'],
      ['review_run_not_found', 404, 'review_run_not_found', 'The failed AI run was not found.'],
      ['review_query_failed', 500, 'review_query_failed', 'Failed AI runs could not be loaded.'],
    ])('maps %s to HTTP %s', async (repositoryCode, status, responseCode, message) => {
      const response = await detailHandler(
        new StaticAuth({ userId: reviewerUserId }),
        new RejectingReviewRepository('get', repositoryCode),
      )(detailRequest(), routeContext(runId));

      await expectExactError(response, status, responseCode, message);
    });

    it.each(['review_persistence_failed', 'unknown_review_code'])(
      'sanitizes wrong-operation or unknown detail code %s to the query fallback',
      async (repositoryCode) => {
        const response = await detailHandler(
          new StaticAuth({ userId: reviewerUserId }),
          new RejectingReviewRepository('get', repositoryCode),
        )(detailRequest(), routeContext(runId));

        await expectExactError(
          response,
          500,
          'review_query_failed',
          'Failed AI runs could not be loaded.',
        );
      },
    );

    it('sanitizes unexpected detail failures', async () => {
      const response = await detailHandler(
        new StaticAuth({ userId: reviewerUserId }),
        new RejectingReviewRepository('get', undefined, sensitiveText()),
      )(detailRequest(), routeContext(runId));

      await expectExactError(
        response,
        500,
        'review_query_failed',
        'Failed AI runs could not be loaded.',
      );
    });
  });

  describe('POST /api/v1/review/ai-runs/:runId/decisions', () => {
    it('does not parse or persist a decision when bearer authentication fails', async () => {
      const reviews = new RecordingReviewRepository();
      const response = await decisionHandler(new StaticAuth(null), reviews)(
        decisionRequest(),
        routeContext(runId),
      );

      await expectExactError(response, 401, 'unauthorized', 'Authentication is required.');
      expect(reviews.calls).toEqual([]);
    });

    it.each([
      ['missing', null],
      ['malformed', 'Basic local-review-session-token'],
    ])('fails closed for a %s raw authorization header after verifier success', async (
      _caseName,
      authorization,
    ) => {
      const reviews = new RecordingReviewRepository();
      const response = await decisionHandler(
        new StaticAuth({ userId: reviewerUserId }),
        reviews,
      )(
        decisionRequest({ authorization }),
        routeContext(runId),
      );

      await expectExactError(response, 401, 'unauthorized', 'Authentication is required.');
      expect(reviews.calls).toEqual([]);
    });

    it.each([
      ['missing', null],
      ['blank', ''],
      ['whitespace-only', '   '],
      ['over 255 Unicode characters', 'é'.repeat(256)],
    ])('rejects a %s Idempotency-Key before repository access', async (_caseName, idempotencyKey) => {
      const reviews = new RecordingReviewRepository();
      const response = await decisionHandler(
        new StaticAuth({ userId: reviewerUserId }),
        reviews,
      )(decisionRequest({ idempotencyKey }), routeContext(runId));

      await expectExactError(response, 400, 'invalid_request', 'The request is invalid.');
      expect(reviews.calls).toEqual([]);
    });

    it.each([
      ['invalid route UUID', 'not-a-uuid', command, undefined],
      ['malformed JSON', runId, undefined, '{'],
      ['an array body', runId, [], undefined],
      ['an unknown body field', runId, { ...command, rawOutput: 'secret' }, undefined],
      ['an invalid expected version', runId, { ...command, expectedReviewVersion: -1 }, undefined],
      ['an incompatible reason', runId, { ...command, reasonCode: 'no_action_needed' }, undefined],
    ])('rejects %s before repository access', async (
      _caseName,
      requestedRunId,
      body,
      rawBody,
    ) => {
      const reviews = new RecordingReviewRepository();
      const response = await decisionHandler(
        new StaticAuth({ userId: reviewerUserId }),
        reviews,
      )(
        decisionRequest({ requestedRunId, body, rawBody }),
        routeContext(requestedRunId),
      );

      await expectExactError(response, 400, 'invalid_request', 'The request is invalid.');
      expect(reviews.calls).toEqual([]);
    });

    it('accepts a 255-code-point key and returns the literal shared success envelope', async () => {
      const reviews = new RecordingReviewRepository();
      const idempotencyKey = 'é'.repeat(255);
      const response = await decisionHandler(
        new StaticAuth({ userId: reviewerUserId }),
        reviews,
      )(decisionRequest({ idempotencyKey }), routeContext(runId));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        data: decisionResult,
        meta: { requestId, nextCursor: null },
      });
      expect(reviews.calls).toEqual([{
        operation: 'decide',
        input: { accessToken, runId, idempotencyKey, command },
      }]);
    });

    it.each([
      ['reviewer_required', 403, 'reviewer_required', 'Reviewer access is required.'],
      ['review_run_not_found', 404, 'review_run_not_found', 'The failed AI run was not found.'],
      ['review_version_conflict', 409, 'review_version_conflict', 'The review has changed.'],
      [
        'review_idempotency_conflict',
        409,
        'review_idempotency_conflict',
        'The idempotency key conflicts with a prior review command.',
      ],
      ['invalid_review_command', 400, 'invalid_request', 'The request is invalid.'],
      [
        'review_persistence_failed',
        500,
        'review_persistence_failed',
        'The review decision could not be persisted.',
      ],
    ])('maps %s to HTTP %s', async (repositoryCode, status, responseCode, message) => {
      const response = await decisionHandler(
        new StaticAuth({ userId: reviewerUserId }),
        new RejectingReviewRepository('decide', repositoryCode),
      )(decisionRequest(), routeContext(runId));

      await expectExactError(response, status, responseCode, message);
    });

    it.each(['review_query_failed', 'unknown_review_code'])(
      'sanitizes wrong-operation or unknown decision code %s to the persistence fallback',
      async (repositoryCode) => {
        const response = await decisionHandler(
          new StaticAuth({ userId: reviewerUserId }),
          new RejectingReviewRepository('decide', repositoryCode),
        )(decisionRequest(), routeContext(runId));

        await expectExactError(
          response,
          500,
          'review_persistence_failed',
          'The review decision could not be persisted.',
        );
      },
    );

    it('sanitizes verifier and unexpected persistence failures', async () => {
      const secret = sensitiveText();
      const verifierResponse = await decisionHandler(
        new ThrowingAuth(secret),
        new RecordingReviewRepository(),
      )(decisionRequest(), routeContext(runId));
      const repositoryResponse = await decisionHandler(
        new StaticAuth({ userId: reviewerUserId }),
        new RejectingReviewRepository('decide', undefined, secret),
      )(decisionRequest(), routeContext(runId));

      await expectExactError(
        verifierResponse,
        500,
        'review_persistence_failed',
        'The review decision could not be persisted.',
      );
      await expectExactError(
        repositoryResponse,
        500,
        'review_persistence_failed',
        'The review decision could not be persisted.',
      );
    });
  });
});

function listHandler(auth: AuthenticatedUserVerifier, reviews: FailedAiRunReviewRepository) {
  return createFailedAiRunListHandler({ auth, reviews, ids: { generate: () => requestId } });
}

function detailHandler(auth: AuthenticatedUserVerifier, reviews: FailedAiRunReviewRepository) {
  return createFailedAiRunDetailHandler({ auth, reviews, ids: { generate: () => requestId } });
}

function decisionHandler(auth: AuthenticatedUserVerifier, reviews: FailedAiRunReviewRepository) {
  return createFailedAiRunDecisionHandler({ auth, reviews, ids: { generate: () => requestId } });
}

function listRequest(options: { authorization?: string | null; query?: string } = {}): Request {
  const headers = authorizationHeaders(options.authorization);
  const suffix = options.query === undefined ? '' : `?${options.query}`;
  return new Request(`http://local/api/v1/review/ai-runs${suffix}`, { headers });
}

function detailRequest(
  requestedRunId = runId,
  authorization: string | null = `Bearer ${accessToken}`,
): Request {
  return new Request(`http://local/api/v1/review/ai-runs/${requestedRunId}`, {
    headers: authorizationHeaders(authorization),
  });
}

function decisionRequest(options: {
  authorization?: string | null;
  idempotencyKey?: string | null;
  requestedRunId?: string;
  body?: unknown;
  rawBody?: string | undefined;
} = {}): Request {
  const headers = authorizationHeaders(options.authorization);
  headers.set('content-type', 'application/json');
  if (options.idempotencyKey === undefined) headers.set('idempotency-key', 'review-command-1');
  else if (options.idempotencyKey !== null) headers.set('idempotency-key', options.idempotencyKey);
  return new Request(
    `http://local/api/v1/review/ai-runs/${options.requestedRunId ?? runId}/decisions`,
    {
      method: 'POST',
      headers,
      body: options.rawBody ?? JSON.stringify(options.body ?? command),
    },
  );
}

function authorizationHeaders(value: string | null | undefined = `Bearer ${accessToken}`): Headers {
  const headers = new Headers();
  if (value !== null) headers.set('authorization', value);
  return headers;
}

function routeContext(requestedRunId: string) {
  return { params: Promise.resolve({ runId: requestedRunId }) };
}

async function expectExactError(
  response: Response,
  status: number,
  code: string,
  message: string,
): Promise<void> {
  const body = await response.json() as unknown;
  expect(response.status).toBe(status);
  expect(body).toEqual({
    ok: false,
    error: { code, message, requestId, details: null },
  });
  expect(body).not.toHaveProperty('meta');
  expect(JSON.stringify(body)).not.toMatch(
    /local-review-session-token|postgres|database-password|source-body|raw-output|error-detail/i,
  );
}

function sensitiveText(): string {
  return 'Bearer local-review-session-token postgres://database-password source-body raw-output error-detail';
}

class StaticAuth implements AuthenticatedUserVerifier {
  readonly headers: Array<string | null> = [];

  constructor(
    private readonly user: { userId: string } | null,
    private readonly events?: string[],
  ) {}

  async verifyAuthorizationHeader(value: string | null): Promise<{ userId: string } | null> {
    this.headers.push(value);
    this.events?.push('auth');
    return this.user;
  }
}

class ThrowingAuth implements AuthenticatedUserVerifier {
  constructor(private readonly message: string) {}

  async verifyAuthorizationHeader(): Promise<never> {
    throw new Error(this.message);
  }
}

type ReviewCall =
  | { operation: 'list'; input: { accessToken: string; query: FailedAiRunListQuery } }
  | { operation: 'get'; input: { accessToken: string; runId: string } }
  | {
      operation: 'decide';
      input: {
        accessToken: string;
        runId: string;
        idempotencyKey: string;
        command: FailedAiRunDecisionCommand;
      };
    };

class RecordingReviewRepository implements FailedAiRunReviewRepository {
  readonly calls: ReviewCall[] = [];
  listResult: FailedAiRunListResult = { version: 1, items: [], nextCursor: null };

  constructor(private readonly events?: string[]) {}

  async list(input: { accessToken: string; query: FailedAiRunListQuery }) {
    this.events?.push('repository');
    this.calls.push({ operation: 'list', input });
    return this.listResult;
  }

  async get(input: { accessToken: string; runId: string }) {
    this.calls.push({ operation: 'get', input });
    return detail;
  }

  async decide(input: {
    accessToken: string;
    runId: string;
    idempotencyKey: string;
    command: FailedAiRunDecisionCommand;
  }) {
    this.calls.push({ operation: 'decide', input });
    return decisionResult;
  }
}

class RejectingReviewRepository implements FailedAiRunReviewRepository {
  constructor(
    private readonly operation: 'list' | 'get' | 'decide',
    private readonly code?: string,
    private readonly message = 'repository rejected',
  ) {}

  async list(): Promise<never> {
    return this.reject('list');
  }

  async get(): Promise<never> {
    return this.reject('get');
  }

  async decide(): Promise<never> {
    return this.reject('decide');
  }

  private reject(operation: 'list' | 'get' | 'decide'): never {
    if (operation !== this.operation) throw new Error('wrong test operation');
    if (this.code === undefined) throw new Error(this.message);
    throw {
      code: this.code,
      message: sensitiveText(),
      token: 'local-review-session-token',
      database: 'postgres://database-password',
      password: 'database-password',
      sourceBody: 'source-body',
      rawOutput: 'raw-output',
      errorDetail: 'error-detail',
    };
  }
}
