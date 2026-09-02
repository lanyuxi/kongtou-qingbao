import { describe, expect, it } from 'vitest';

import {
  createTutorialReviewRepositoryFromRpc,
  TutorialReviewRepositoryError,
  type TutorialReviewRpc,
  type TutorialReviewRpcCall,
} from '../tutorials/tutorial-review-repository.js';
import type { TutorialErrorCode } from '@airdrop/contracts';

const accessToken = 'reviewer-session-token';
const candidateId = '61000000-0000-4000-8000-000000000001';
const secondCandidateId = '61000000-0000-4000-8000-000000000002';
const tutorialId = '61000000-0000-4000-8000-000000000003';
const secondTutorialId = '61000000-0000-4000-8000-000000000004';
const projectId = '61000000-0000-4000-8000-000000000005';
const referenceId = '61000000-0000-4000-8000-000000000006';
const commandId = '61000000-0000-4000-8000-000000000007';

const acceptCommand = {
  version: 1 as const,
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

function candidateListRow(overrides: Record<string, unknown> = {}) {
  return {
    candidateId,
    projectId,
    kind: 'airdrop_campaign',
    status: 'pending',
    title: 'pgTAP 空投参与教程',
    createdAt: '2026-09-02T04:00:00+00:00',
    ...overrides,
  };
}

function tutorialListRow(overrides: Record<string, unknown> = {}) {
  return {
    tutorialId,
    projectId,
    kind: 'airdrop_campaign',
    status: 'published',
    version: 1,
    title: 'pgTAP 空投参与教程',
    updatedAt: '2026-09-02T05:00:00+00:00',
    ...overrides,
  };
}

function candidateDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    candidateId,
    projectId,
    kind: 'airdrop_campaign',
    status: 'pending',
    title: 'pgTAP 空投参与教程',
    summary: '覆盖从钱包连接到任务领取的完整步骤。',
    payload: {
      title: 'pgTAP 空投参与教程',
      summary: '覆盖从钱包连接到任务领取的完整步骤。',
      steps: acceptCommand.steps,
      sourceSignalIds: ['61000000-0000-4000-8000-000000000008'],
      confidence: 80,
    },
    sourceSignalIds: ['61000000-0000-4000-8000-000000000008'],
    confidence: 80,
    createdAt: '2026-09-02T04:00:00+00:00',
    ...overrides,
  };
}

function tutorialDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    tutorialId,
    projectId,
    kind: 'airdrop_campaign',
    status: 'published',
    version: 1,
    title: 'pgTAP 空投参与教程',
    summary: '覆盖从钱包连接到任务领取的完整步骤。',
    lastVerifiedAt: '2026-09-02T04:30:00+00:00',
    updatedAt: '2026-09-02T05:00:00+00:00',
    steps: acceptCommand.steps,
    stepLinks: [
      {
        ordinal: 2,
        referenceId,
        referenceLabel: '官方领取页',
        renderable: true,
        lastVerifiedAt: '2026-09-02T04:00:00+00:00',
      },
    ],
    decisions: [
      {
        decision: 'accept_candidate',
        reasonCode: null,
        note: null,
        aggregateVersion: 1,
        createdAt: '2026-09-02T04:30:00+00:00',
      },
    ],
    statusEvents: null,
    ...overrides,
  };
}

class RecordingRpc implements TutorialReviewRpc {
  readonly calls: TutorialReviewRpcCall[] = [];

  constructor(private readonly responses: unknown[]) {}

  async invoke(call: TutorialReviewRpcCall): Promise<unknown> {
    this.calls.push(call);
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return response;
  }
}

class CodedError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

describe('TutorialReviewRepository', () => {
  it('sends bearer-scoped candidate list RPC args with the parsed query', async () => {
    const rpc = new RecordingRpc([[], []]);
    const repository = createTutorialReviewRepositoryFromRpc(rpc);

    await repository.listCandidates({
      accessToken: 'first-session-token',
      query: { status: 'pending', cursor: null, limit: 25 },
    });
    await repository.listCandidates({
      accessToken: 'second-session-token',
      query: {
        status: 'all',
        cursor: { createdAt: '2026-09-02T04:00:00+00:00', candidateId },
        limit: 100,
      },
    });

    expect(rpc.calls).toEqual([
      {
        accessToken: 'first-session-token',
        functionName: 'list_tutorial_review_candidates',
        args: {
          p_status: 'pending',
          p_cursor_created: null,
          p_cursor_id: null,
          p_limit: 26,
        },
      },
      {
        accessToken: 'second-session-token',
        functionName: 'list_tutorial_review_candidates',
        args: {
          p_status: 'all',
          p_cursor_created: '2026-09-02T04:00:00+00:00',
          p_cursor_id: candidateId,
          p_limit: 100,
        },
      },
    ]);
  });

  it('returns only the requested candidate rows and continues after the final item', async () => {
    const rpc = new RecordingRpc([[
      candidateListRow(),
      candidateListRow({
        candidateId: secondCandidateId,
        createdAt: '2026-09-02T03:00:00+00:00',
      }),
    ]]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).listCandidates({
      accessToken,
      query: { status: 'pending', cursor: null, limit: 1 },
    })).resolves.toEqual({
      version: 1,
      items: [candidateListRow()],
      nextCursor: { createdAt: '2026-09-02T04:00:00+00:00', candidateId },
    });
  });

  it('omits the candidate next cursor when the page is not full', async () => {
    const rpc = new RecordingRpc([[candidateListRow()]]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).listCandidates({
      accessToken,
      query: { status: 'pending', cursor: null, limit: 25 },
    })).resolves.toEqual({
      version: 1,
      items: [candidateListRow()],
      nextCursor: null,
    });
  });

  it('rejects candidate list rows that carry unexpected fields', async () => {
    const rpc = new RecordingRpc([[{ ...candidateListRow(), payload: {} }]]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).listCandidates({
      accessToken,
      query: { status: 'pending', cursor: null, limit: 25 },
    })).rejects.toThrow(TutorialReviewRepositoryError);
  });

  it('fetches the candidate detail with a parsed uuid', async () => {
    const rpc = new RecordingRpc([[candidateDetailRow()]]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).getCandidate({
      accessToken,
      candidateId,
    })).resolves.toEqual(candidateDetailRow());
    expect(rpc.calls).toEqual([{
      accessToken,
      functionName: 'get_tutorial_review_candidate',
      args: { p_candidate_id: candidateId },
    }]);
  });

  it('rejects a malformed candidate detail payload shape', async () => {
    const rpc = new RecordingRpc([[candidateDetailRow({ confidence: 180 })]]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).getCandidate({
      accessToken,
      candidateId,
    })).rejects.toThrow(TutorialReviewRepositoryError);
  });

  it('sends bearer-scoped tutorial list RPC args and pages the result', async () => {
    const rpc = new RecordingRpc([[
      tutorialListRow(),
      tutorialListRow({
        tutorialId: secondTutorialId,
        updatedAt: '2026-09-02T04:00:00+00:00',
        status: 'needs_review',
      }),
    ]]);
    const repository = createTutorialReviewRepositoryFromRpc(rpc);

    await expect(repository.listTutorials({
      accessToken,
      query: { status: 'all', cursor: null, limit: 1 },
    })).resolves.toEqual({
      version: 1,
      items: [tutorialListRow()],
      nextCursor: { updatedAt: '2026-09-02T05:00:00+00:00', tutorialId },
    });
    expect(rpc.calls).toEqual([{
      accessToken,
      functionName: 'list_tutorial_review_items',
      args: {
        p_status: 'all',
        p_cursor_updated: null,
        p_cursor_id: null,
        p_limit: 2,
      },
    }]);
  });

  it('folds detail steps and step links into the review detail contract', async () => {
    const rpc = new RecordingRpc([[tutorialDetailRow()]]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).getTutorial({
      accessToken,
      tutorialId,
    })).resolves.toEqual({
      tutorialId,
      projectId,
      kind: 'airdrop_campaign',
      status: 'published',
      version: 1,
      title: 'pgTAP 空投参与教程',
      summary: '覆盖从钱包连接到任务领取的完整步骤。',
      lastVerifiedAt: '2026-09-02T04:30:00+00:00',
      updatedAt: '2026-09-02T05:00:00+00:00',
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
            lastVerifiedAt: '2026-09-02T04:00:00+00:00',
          }],
        },
      ],
      decisions: [{
        decision: 'accept_candidate',
        reasonCode: null,
        note: null,
        aggregateVersion: 1,
        createdAt: '2026-09-02T04:30:00+00:00',
      }],
      statusEvents: [],
    });
  });

  it('accepts the candidate command and parses the receipt', async () => {
    const rpc = new RecordingRpc([[
      {
        version: 1,
        commandId,
        candidateId,
        tutorialId,
        tutorialVersion: 1,
        replayed: false,
      },
    ]]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).acceptCandidate({
      accessToken,
      idempotencyKey: 'accept-0001',
      command: acceptCommand,
    })).resolves.toEqual({
      version: 1,
      commandId,
      candidateId,
      tutorialId,
      tutorialVersion: 1,
      replayed: false,
    });
    expect(rpc.calls).toEqual([{
      accessToken,
      functionName: 'submit_accept_tutorial_candidate',
      args: {
        p_command_payload: expect.any(String),
        p_idempotency_key: 'accept-0001',
      },
    }]);
    const payload = JSON.parse(
      (rpc.calls[0]?.args.p_command_payload ?? '') as string,
    ) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'candidateId',
      'expectedCandidateVersion',
      'steps',
      'version',
    ]);
    expect(payload.steps).toEqual(acceptCommand.steps);
  });

  it('rejects a command that fails the contract schema without calling the rpc', async () => {
    const rpc = new RecordingRpc([]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).acceptCandidate({
      accessToken,
      idempotencyKey: 'accept-0002',
      command: { ...acceptCommand, steps: acceptCommand.steps.slice(0, 1) },
    })).rejects.toThrow(new TutorialReviewRepositoryError('tutorial_command_invalid'));
    expect(rpc.calls).toEqual([]);
  });

  it('rejects an idempotency key with surrounding whitespace without calling the rpc', async () => {
    const rpc = new RecordingRpc([]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).rejectCandidate({
      accessToken,
      idempotencyKey: ' padded ',
      command: {
        version: 1,
        candidateId,
        expectedCandidateVersion: 1,
        reasonCode: 'out_of_scope',
        note: null,
      },
    })).rejects.toThrow(new TutorialReviewRepositoryError('tutorial_command_invalid'));
    expect(rpc.calls).toEqual([]);
  });

  it('parses the publish receipt and sends the canonical command payload', async () => {
    const rpc = new RecordingRpc([[
      { version: 1, commandId, tutorialId, tutorialVersion: 2, replayed: true },
    ]]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).publishVersion({
      accessToken,
      idempotencyKey: 'publish-0001',
      command: {
        version: 1,
        tutorialId,
        expectedVersion: 1,
        steps: acceptCommand.steps,
      },
    })).resolves.toEqual({
      version: 1,
      commandId,
      tutorialId,
      tutorialVersion: 2,
      replayed: true,
    });
  });

  it('parses the retire receipt without extra fields', async () => {
    const rpc = new RecordingRpc([[
      {
        version: 1,
        commandId,
        tutorialId,
        replayed: false,
        extra: 'leak',
      },
    ]]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).retire({
      accessToken,
      idempotencyKey: 'retire-0001',
      command: {
        version: 1,
        tutorialId,
        expectedVersion: 2,
        reasonCode: 'security_blocked',
        note: null,
      },
    })).rejects.toThrow(TutorialReviewRepositoryError);
  });

  it('maps sqlstate codes onto tutorial error codes', async () => {
    const cases: readonly [string, TutorialErrorCode][] = [
      ['AT201', 'tutorial_reviewer_required'],
      ['AT202', 'tutorial_not_found'],
      ['AT203', 'tutorial_not_decidable'],
      ['AT207', 'tutorial_idempotency_conflict'],
      ['AT208', 'tutorial_command_invalid'],
      ['AT210', 'tutorial_reference_not_renderable'],
      ['AT211', 'tutorial_steps_invalid'],
    ];
    for (const [sqlstate, expected] of cases) {
      const rpc = new RecordingRpc([[candidateListRow()], new CodedError(sqlstate)]);
      const repository = createTutorialReviewRepositoryFromRpc(rpc);
      await repository.listCandidates({
        accessToken,
        query: { status: 'pending', cursor: null, limit: 25 },
      }).catch(() => undefined);
      await expect(repository.listCandidates({
        accessToken,
        query: { status: 'pending', cursor: null, limit: 25 },
      })).rejects.toThrow(new TutorialReviewRepositoryError(expected));
    }
  });

  it('falls back to persistence_failed for unknown sqlstate codes', async () => {
    const rpc = new RecordingRpc([new CodedError('XX999')]);

    await expect(createTutorialReviewRepositoryFromRpc(rpc).listCandidates({
      accessToken,
      query: { status: 'pending', cursor: null, limit: 25 },
    })).rejects.toThrow(new TutorialReviewRepositoryError('tutorial_persistence_failed'));
  });
});
