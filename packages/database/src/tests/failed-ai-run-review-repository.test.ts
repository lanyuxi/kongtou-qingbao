import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createFailedAiRunReviewRepositoryFromRpc,
  FailedAiRunReviewRepositoryError,
  type FailedAiRunReviewRpc,
  type FailedAiRunReviewRpcCall,
} from '../review/failed-ai-run-review-repository.js';

const runId = 'a1000000-0000-4000-8000-000000000001';
const secondRunId = 'a1000000-0000-4000-8000-000000000002';
const commandId = 'a1000000-0000-4000-8000-000000000101';
const decisionId = 'a1000000-0000-4000-8000-000000000102';

afterEach(() => {
  vi.useRealTimers();
});

describe('FailedAiRunReviewRepository', () => {
  it('uses each caller token only for its current list RPC', async () => {
    const rpc = new RecordingRpc([[], []]);
    const repository = createFailedAiRunReviewRepositoryFromRpc(rpc);

    await repository.list({
      accessToken: 'first-session-token',
      query: { reviewState: 'all', status: 'all', cursor: null, limit: 25 },
    });
    await repository.list({
      accessToken: 'second-session-token',
      query: { reviewState: 'dismissed', status: 'provider_error', cursor: null, limit: 100 },
    });

    expect(rpc.calls).toEqual([
      {
        accessToken: 'first-session-token',
        functionName: 'list_failed_ai_runs',
        args: {
          p_review_state: 'all',
          p_status: 'all',
          p_cursor_created_at: null,
          p_cursor_id: null,
          p_limit: 26,
        },
      },
      {
        accessToken: 'second-session-token',
        functionName: 'list_failed_ai_runs',
        args: {
          p_review_state: 'dismissed',
          p_status: 'provider_error',
          p_cursor_created_at: null,
          p_cursor_id: null,
          p_limit: 101,
        },
      },
    ]);
  });

  it('returns only the requested rows and continues after the final returned item', async () => {
    const rpc = new RecordingRpc([[
      listItem(runId, '2026-08-22T03:00:00.000Z'),
      listItem(secondRunId, '2026-08-22T02:00:00.000Z'),
    ]]);
    const repository = createFailedAiRunReviewRepositoryFromRpc(rpc);

    const result = await repository.list({
      accessToken: 'session-token',
      query: { reviewState: 'all', status: 'all', cursor: null, limit: 1 },
    });

    expect(result).toEqual({
      version: 1,
      items: [listItem(runId, '2026-08-22T03:00:00.000Z')],
      nextCursor: 'eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTIyVDAzOjAwOjAwLjAwMFoiLCJpZCI6ImExMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9',
    });
  });

  it('returns no cursor when the database did not provide an extra row', async () => {
    const rpc = new RecordingRpc([[
      listItem(runId, '2026-08-22T03:00:00.000Z'),
    ]]);

    await expect(createFailedAiRunReviewRepositoryFromRpc(rpc).list({
      accessToken: 'session-token',
      query: { reviewState: 'all', status: 'all', cursor: null, limit: 1 },
    })).resolves.toEqual({
      version: 1,
      items: [listItem(runId, '2026-08-22T03:00:00.000Z')],
      nextCursor: null,
    });
  });

  it('decodes a strict cursor into the exact RPC fields', async () => {
    const rpc = new RecordingRpc([[]]);
    const repository = createFailedAiRunReviewRepositoryFromRpc(rpc);

    await repository.list({
      accessToken: 'session-token',
      query: {
        reviewState: 'unreviewed',
        status: 'grounding_failed',
        cursor: 'eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTIyVDAzOjAwOjAwLjAwMFoiLCJpZCI6ImExMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9',
        limit: 25,
      },
    });

    expect(rpc.calls[0]?.args).toEqual({
      p_review_state: 'unreviewed',
      p_status: 'grounding_failed',
      p_cursor_created_at: '2026-08-22T03:00:00.000Z',
      p_cursor_id: runId,
      p_limit: 26,
    });
  });

  it('rejects a malformed cursor before invoking the RPC', async () => {
    const rpc = new RecordingRpc([[]]);

    await expect(createFailedAiRunReviewRepositoryFromRpc(rpc).list({
      accessToken: 'session-token',
      query: { reviewState: 'all', status: 'all', cursor: 'not-a-cursor', limit: 25 },
    })).rejects.toEqual(new FailedAiRunReviewRepositoryError('review_query_failed'));
    expect(rpc.calls).toEqual([]);
  });

  it.each([
    ['an extra list key', [[{ ...listItem(runId), errorDetail: 'password=secret' }]]],
    ['a malformed list item', [[{ ...listItem(runId), reviewVersion: '0' }]]],
    ['a non-array list result', [{ ...listItem(runId) }]],
  ])('sanitizes %s', async (_caseName, response) => {
    const rpc = new RecordingRpc(response);

    const error = await createFailedAiRunReviewRepositoryFromRpc(rpc).list({
      accessToken: 'session-token',
      query: { reviewState: 'all', status: 'all', cursor: null, limit: 25 },
    }).catch((cause: unknown) => cause);

    expect(error).toEqual(new FailedAiRunReviewRepositoryError('review_query_failed'));
    expect(String(error)).not.toMatch(/password|secret|errorDetail/i);
  });

  it('strictly parses one safe detail row', async () => {
    const rpc = new RecordingRpc([[
      {
        version: 1,
        run: listItem(runId),
        input: { kind: 'discovered_item', id: secondRunId, collectedAt: null },
        decisions: [{
          version: 1,
          decisionId,
          reviewVersion: 1,
          decision: 'needs_investigation',
          reasonCode: 'provider_instability',
          note: 'Check provider health.',
          reviewerUserId: 'a1000000-0000-4000-8000-000000000090',
          createdAt: '2026-08-22T04:00:00.000Z',
        }],
      },
    ]]);

    await expect(createFailedAiRunReviewRepositoryFromRpc(rpc).get({
      accessToken: 'session-token',
      runId,
    })).resolves.toEqual({
      version: 1,
      run: listItem(runId),
      input: { kind: 'discovered_item', id: secondRunId, collectedAt: null },
      decisions: [{
        version: 1,
        decisionId,
        reviewVersion: 1,
        decision: 'needs_investigation',
        reasonCode: 'provider_instability',
        note: 'Check provider health.',
        reviewerUserId: 'a1000000-0000-4000-8000-000000000090',
        createdAt: '2026-08-22T04:00:00.000Z',
      }],
    });
    expect(rpc.calls).toEqual([{
      accessToken: 'session-token',
      functionName: 'get_failed_ai_run',
      args: { p_ai_run_id: runId },
    }]);
  });

  it.each([
    ['an extra detail key', [{ version: 1, run: listItem(runId), input: { kind: 'discovered_item', id: secondRunId, collectedAt: null }, decisions: [], output: 'secret' }]],
    ['two detail rows', [{ version: 1, run: listItem(runId), input: { kind: 'discovered_item', id: secondRunId, collectedAt: null }, decisions: [] }, { version: 1, run: listItem(runId), input: { kind: 'discovered_item', id: secondRunId, collectedAt: null }, decisions: [] }]],
  ])('sanitizes %s', async (_caseName, response) => {
    const rpc = new RecordingRpc([response]);

    const error = await createFailedAiRunReviewRepositoryFromRpc(rpc).get({
      accessToken: 'session-token',
      runId,
    }).catch((cause: unknown) => cause);

    expect(error).toEqual(new FailedAiRunReviewRepositoryError('review_query_failed'));
    expect(String(error)).not.toMatch(/output|secret/i);
  });

  it('forwards exact command fields and strictly parses a replay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T05:06:07.890Z'));
    const rpc = new RecordingRpc([[
      {
        version: 1,
        commandId,
        runId,
        decisionId,
        reviewVersion: 2,
        reviewState: 'dismissed',
        replayed: true,
      },
    ]]);

    await expect(createFailedAiRunReviewRepositoryFromRpc(rpc).decide({
      accessToken: 'session-token',
      runId,
      idempotencyKey: 'review-run-1',
      command: {
        version: 1,
        expectedReviewVersion: 1,
        decision: 'dismiss',
        reasonCode: 'no_action_needed',
        note: null,
      },
    })).resolves.toEqual({
      version: 1,
      commandId,
      runId,
      decisionId,
      reviewVersion: 2,
      reviewState: 'dismissed',
      replayed: true,
    });
    expect(rpc.calls).toEqual([{
      accessToken: 'session-token',
      functionName: 'execute_failed_ai_run_review',
      args: {
        p_ai_run_id: runId,
        p_command_payload: '{"decision":"dismiss","expectedReviewVersion":1,"note":null,"reasonCode":"no_action_needed","version":1}',
        p_idempotency_key: 'review-run-1',
        p_now: '2026-08-22T05:06:07.890Z',
      },
    }]);
  });

  it('rejects invalid command input before invoking the RPC', async () => {
    const rpc = new RecordingRpc([[]]);

    await expect(createFailedAiRunReviewRepositoryFromRpc(rpc).decide({
      accessToken: 'session-token',
      runId,
      idempotencyKey: ' ',
      command: {
        version: 1,
        expectedReviewVersion: 0,
        decision: 'dismiss',
        reasonCode: 'provider_instability',
        note: null,
      },
    })).rejects.toEqual(new FailedAiRunReviewRepositoryError('invalid_review_command'));
    expect(rpc.calls).toEqual([]);
  });

  it.each([
    ['AR101', 'review_version_conflict'],
    ['AR102', 'review_idempotency_conflict'],
    ['AR103', 'review_run_not_found'],
    ['AR104', 'reviewer_required'],
    ['AR105', 'invalid_review_command'],
  ] as const)('maps SQLSTATE %s without exposing database details', async (sqlState, code) => {
    const rpc = new RecordingRpc([], Object.assign(
      new Error('postgres://password@database provider body'),
      { code: sqlState },
    ));

    const error = await createFailedAiRunReviewRepositoryFromRpc(rpc).decide({
      accessToken: 'session-token',
      runId,
      idempotencyKey: 'mapping-test',
      command: {
        version: 1,
        expectedReviewVersion: 0,
        decision: 'dismiss',
        reasonCode: 'no_action_needed',
        note: null,
      },
    }).catch((cause: unknown) => cause);

    expect(error).toEqual(new FailedAiRunReviewRepositoryError(code));
    expect(String(error)).not.toMatch(/postgres|password|database|provider|body|session-token/i);
  });

  it('sanitizes unexpected query and persistence errors by operation', async () => {
    const queryRpc = new RecordingRpc([], new Error('token=session-token source body'));
    const commandRpc = new RecordingRpc([], new Error('token=session-token source body'));

    const queryError = await createFailedAiRunReviewRepositoryFromRpc(queryRpc).get({
      accessToken: 'session-token', runId,
    }).catch((cause: unknown) => cause);
    const commandError = await createFailedAiRunReviewRepositoryFromRpc(commandRpc).decide({
      accessToken: 'session-token',
      runId,
      idempotencyKey: 'unexpected-error',
      command: {
        version: 1,
        expectedReviewVersion: 0,
        decision: 'dismiss',
        reasonCode: 'no_action_needed',
        note: null,
      },
    }).catch((cause: unknown) => cause);

    expect(queryError).toEqual(new FailedAiRunReviewRepositoryError('review_query_failed'));
    expect(commandError).toEqual(new FailedAiRunReviewRepositoryError('review_persistence_failed'));
    expect(`${String(queryError)} ${String(commandError)}`).not.toMatch(/token|session|source|body/i);
  });

  it('rejects the package export under browser module resolution', () => {
    const result = spawnSync(
      process.execPath,
      ['--conditions=browser', '--import=tsx', '--eval', "import('@airdrop/database/failed-ai-run-review')"],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '@airdrop/database/failed-ai-run-review is unavailable in browser code.',
    );
    expect(result.stderr).not.toMatch(/supabase|bearer|token/i);
  });
});

class RecordingRpc implements FailedAiRunReviewRpc {
  readonly calls: FailedAiRunReviewRpcCall[] = [];
  readonly #responses: unknown[];
  readonly #error: unknown;

  constructor(responses: unknown[], error?: unknown) {
    this.#responses = [...responses];
    this.#error = error;
  }

  async invoke(call: FailedAiRunReviewRpcCall): Promise<unknown> {
    this.calls.push(call);
    if (this.#error !== undefined) throw this.#error;
    return this.#responses.shift();
  }
}

function listItem(id: string, createdAt = '2026-08-22T03:00:00.000Z') {
  return {
    version: 1,
    runId: id,
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
    createdAt,
    reviewState: 'unreviewed',
    reviewVersion: 0,
    latestDecisionAt: null,
  } as const;
}
