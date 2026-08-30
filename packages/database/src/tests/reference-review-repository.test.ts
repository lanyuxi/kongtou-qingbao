import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  createReferenceReviewRepositoryFromRpc,
  ReferenceReviewRepositoryError,
  type ReferenceReviewRpc,
  type ReferenceReviewRpcCall,
} from '../references/reference-review-repository.js';

const accessToken = 'reviewer-session-token';
const referenceId = '51000000-0000-4000-8000-000000000001';
const secondReferenceId = '51000000-0000-4000-8000-000000000002';
const authorityId = '51000000-0000-4000-8000-000000000003';
const secondAuthorityId = '51000000-0000-4000-8000-000000000004';
const projectId = '51000000-0000-4000-8000-000000000005';
const evidenceId = '51000000-0000-4000-8000-000000000006';
const commandId = '51000000-0000-4000-8000-000000000007';
const decisionId = '51000000-0000-4000-8000-000000000008';

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

describe('ReferenceReviewRepository', () => {
  it('uses each caller bearer only for its current list RPC', async () => {
    const rpc = new RecordingRpc([[], []]);
    const repository = createReferenceReviewRepositoryFromRpc(rpc);

    await repository.listReferences({
      accessToken: 'first-session-token',
      query: { projectId, state: 'candidate', cursor: null, limit: 25 },
    });
    await repository.listDomainAuthorities({
      accessToken: 'second-session-token',
      query: { projectId: null, state: 'granted', cursor: null, limit: 100 },
    });

    expect(rpc.calls).toEqual([
      {
        accessToken: 'first-session-token',
        functionName: 'list_reference_review_items',
        args: {
          p_project_id: projectId,
          p_state: 'candidate',
          p_cursor_updated_at: null,
          p_cursor_id: null,
          p_limit: 26,
        },
      },
      {
        accessToken: 'second-session-token',
        functionName: 'list_domain_authority_review_items',
        args: {
          p_project_id: null,
          p_state: 'granted',
          p_cursor_updated_at: null,
          p_cursor_id: null,
          p_limit: 100,
        },
      },
    ]);
  });

  it('returns only the requested reference rows and continues after the final returned item', async () => {
    const rpc = new RecordingRpc([[
      referenceListItem(referenceId, '2026-08-30T04:00:00.000Z'),
      referenceListItem(secondReferenceId, '2026-08-30T03:00:00.000Z'),
    ]]);

    await expect(createReferenceReviewRepositoryFromRpc(rpc).listReferences({
      accessToken,
      query: { projectId: null, state: 'all', cursor: null, limit: 1 },
    })).resolves.toEqual({
      version: 1,
      items: [referenceListItem(referenceId, '2026-08-30T04:00:00.000Z')],
      nextCursor: base64url(JSON.stringify({
        updatedAt: '2026-08-30T04:00:00.000Z',
        referenceId,
      })),
    });
  });

  it('derives the authority cursor from the final returned item', async () => {
    const rpc = new RecordingRpc([[
      authorityListItem(authorityId, '2026-08-30T04:00:00.000Z'),
      authorityListItem(secondAuthorityId, '2026-08-30T03:00:00.000Z'),
    ]]);

    const result = await createReferenceReviewRepositoryFromRpc(rpc).listDomainAuthorities({
      accessToken,
      query: { projectId: null, state: 'all', cursor: null, limit: 1 },
    });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe(base64url(JSON.stringify({
      updatedAt: '2026-08-30T04:00:00.000Z',
      authorityId,
    })));
  });

  it('keeps a continuation cursor when the RPC returns a full maximum-size page', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => referenceListItem(
      `51000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      '2026-08-30T04:00:00.000Z',
    ));
    const finalReferenceId = rows.at(-1)?.referenceId;

    const result = await createReferenceReviewRepositoryFromRpc(new RecordingRpc([rows]))
      .listReferences({
        accessToken,
        query: { projectId: null, state: 'all', cursor: null, limit: 100 },
      });

    expect(result.items).toHaveLength(100);
    expect(result.nextCursor).toBe(base64url(JSON.stringify({
      updatedAt: '2026-08-30T04:00:00.000Z',
      referenceId: finalReferenceId,
    })));
  });

  it('returns empty pages without a cursor', async () => {
    const repository = createReferenceReviewRepositoryFromRpc(new RecordingRpc([[], []]));

    await expect(repository.listReferences({
      accessToken,
      query: { projectId: null, state: 'all', cursor: null, limit: 25 },
    })).resolves.toEqual({ version: 1, items: [], nextCursor: null });
    await expect(repository.listDomainAuthorities({
      accessToken,
      query: { projectId: null, state: 'all', cursor: null, limit: 25 },
    })).resolves.toEqual({ version: 1, items: [], nextCursor: null });
  });

  it('decodes both strict cursors into exact RPC fields', async () => {
    const rpc = new RecordingRpc([[], []]);
    const repository = createReferenceReviewRepositoryFromRpc(rpc);

    await repository.listReferences({
      accessToken,
      query: {
        projectId,
        state: 'flagged',
        cursor: base64url(JSON.stringify({
          updatedAt: '2026-08-30T04:00:00.000Z',
          referenceId,
        })),
        limit: 25,
      },
    });
    await repository.listDomainAuthorities({
      accessToken,
      query: {
        projectId,
        state: 'revoked',
        cursor: base64url(JSON.stringify({
          updatedAt: '2026-08-30T03:00:00.000Z',
          authorityId,
        })),
        limit: 25,
      },
    });

    expect(rpc.calls.map((call) => call.args)).toEqual([
      {
        p_project_id: projectId,
        p_state: 'flagged',
        p_cursor_updated_at: '2026-08-30T04:00:00.000Z',
        p_cursor_id: referenceId,
        p_limit: 26,
      },
      {
        p_project_id: projectId,
        p_state: 'revoked',
        p_cursor_updated_at: '2026-08-30T03:00:00.000Z',
        p_cursor_id: authorityId,
        p_limit: 26,
      },
    ]);
  });

  it('rejects malformed queries and cursors before invoking an RPC', async () => {
    const rpc = new RecordingRpc([]);
    const repository = createReferenceReviewRepositoryFromRpc(rpc);

    await expect(repository.listReferences({
      accessToken,
      query: { projectId: null, state: 'all', cursor: 'not-a-cursor', limit: 25 },
    })).rejects.toEqual(new ReferenceReviewRepositoryError('reference_persistence_failed'));
    await expect(repository.listDomainAuthorities({
      accessToken,
      query: { projectId: null, state: 'all', cursor: null, limit: 101 },
    })).rejects.toEqual(new ReferenceReviewRepositoryError('reference_persistence_failed'));
    expect(rpc.calls).toEqual([]);
  });

  it.each([
    ['an extra reference list key', [[{ ...referenceListItem(referenceId), actorUserId: evidenceId }]]],
    ['a malformed reference list row', [[{ ...referenceListItem(referenceId), version: 0 }]]],
    ['a non-array reference list response', [referenceListItem(referenceId)]],
  ])('fails closed for %s without leaking unsafe values', async (_caseName, responses) => {
    const error = await createReferenceReviewRepositoryFromRpc(new RecordingRpc(responses))
      .listReferences({
        accessToken,
        query: { projectId: null, state: 'all', cursor: null, limit: 25 },
      }).catch((cause: unknown) => cause);

    expect(error).toEqual(new ReferenceReviewRepositoryError('reference_persistence_failed'));
    expect(String(error)).not.toMatch(/actorUserId|51000000/i);
  });

  it('strictly parses one reference detail and one authority detail', async () => {
    const rpc = new RecordingRpc([[referenceDetail()], [authorityDetail()]]);
    const repository = createReferenceReviewRepositoryFromRpc(rpc);

    await expect(repository.getReference({ accessToken, referenceId }))
      .resolves.toEqual(referenceDetail());
    await expect(repository.getDomainAuthority({ accessToken, authorityId }))
      .resolves.toEqual(authorityDetail());
    expect(rpc.calls).toEqual([
      {
        accessToken,
        functionName: 'get_reference_review_detail',
        args: { p_reference_id: referenceId },
      },
      {
        accessToken,
        functionName: 'get_domain_authority_review_detail',
        args: { p_authority_id: authorityId },
      },
    ]);
  });

  it.each([
    ['an extra reference detail key', [{ ...referenceDetail(), rawLocator: 'secret' }], 'reference'],
    ['two authority detail rows', [authorityDetail(), authorityDetail()], 'authority'],
  ] as const)('fails closed for %s', async (_caseName, response, aggregate) => {
    const rows = Array.isArray(response) ? response : [response];
    const repository = createReferenceReviewRepositoryFromRpc(new RecordingRpc([rows]));
    const promise = aggregate === 'reference'
      ? repository.getReference({ accessToken, referenceId })
      : repository.getDomainAuthority({ accessToken, authorityId });

    await expect(promise).rejects.toEqual(
      new ReferenceReviewRepositoryError('reference_persistence_failed'),
    );
  });

  it('forwards register commands with exact canonical payloads and caller keys', async () => {
    const rpc = new RecordingRpc([
      [referenceReceipt()],
      [authorityReceipt()],
    ]);
    const repository = createReferenceReviewRepositoryFromRpc(rpc);

    await expect(repository.registerReference({
      accessToken,
      idempotencyKey: 'reference-register-1',
      command: registerReferenceCommand(),
    })).resolves.toEqual(referenceReceipt());
    await expect(repository.registerDomainAuthority({
      accessToken,
      idempotencyKey: 'authority-register-1',
      command: registerAuthorityCommand(),
    })).resolves.toEqual(authorityReceipt());

    expect(rpc.calls).toEqual([
      {
        accessToken,
        functionName: 'submit_register_reference',
        args: {
          p_command_payload: '{"evidenceId":"51000000-0000-4000-8000-000000000006",'
            + '"kind":"official_site","label":"Official site","note":"registered by reviewer",'
            + '"projectId":"51000000-0000-4000-8000-000000000005",'
            + '"url":"https://example.com/","version":1}',
          p_idempotency_key: 'reference-register-1',
        },
      },
      {
        accessToken,
        functionName: 'submit_register_domain_authority',
        args: {
          p_command_payload: '{"domain":"example.com",'
            + '"evidenceId":"51000000-0000-4000-8000-000000000006",'
            + '"note":"authority evidence",'
            + '"projectId":"51000000-0000-4000-8000-000000000005","version":1}',
          p_idempotency_key: 'authority-register-1',
        },
      },
    ]);
  });

  it('forwards decision commands without dropping their notes', async () => {
    const rpc = new RecordingRpc([
      [referenceReceipt({ referenceVersion: 2, state: 'verified' })],
      [authorityReceipt({ authorityVersion: 2, state: 'granted' })],
    ]);
    const repository = createReferenceReviewRepositoryFromRpc(rpc);

    await repository.decideReference({
      accessToken,
      referenceId,
      idempotencyKey: 'reference-decide-1',
      command: decideReferenceCommand(),
    });
    await repository.decideDomainAuthority({
      accessToken,
      authorityId,
      idempotencyKey: 'authority-decide-1',
      command: decideAuthorityCommand(),
    });

    expect(rpc.calls).toEqual([
      {
        accessToken,
        functionName: 'submit_decide_reference',
        args: {
          p_reference_id: referenceId,
          p_command_payload: '{"decision":"verify",'
            + '"evidenceId":"51000000-0000-4000-8000-000000000006",'
            + '"expectedVersion":1,"note":"verified by reviewer",'
            + '"reasonCode":"evidence_verified",'
            + '"referenceId":"51000000-0000-4000-8000-000000000001","version":1}',
          p_idempotency_key: 'reference-decide-1',
        },
      },
      {
        accessToken,
        functionName: 'submit_decide_domain_authority',
        args: {
          p_authority_id: authorityId,
          p_command_payload: '{"authorityId":"51000000-0000-4000-8000-000000000003",'
            + '"decision":"grant",'
            + '"evidenceId":"51000000-0000-4000-8000-000000000006",'
            + '"expectedVersion":1,"note":"domain ownership verified",'
            + '"reasonCode":"evidence_verified","version":1}',
          p_idempotency_key: 'authority-decide-1',
        },
      },
    ]);
  });

  it('rejects aggregate mismatches and invalid idempotency keys before invoking RPCs', async () => {
    const rpc = new RecordingRpc([]);
    const repository = createReferenceReviewRepositoryFromRpc(rpc);

    await expect(repository.decideReference({
      accessToken,
      referenceId: secondReferenceId,
      idempotencyKey: 'reference-decide-1',
      command: decideReferenceCommand(),
    })).rejects.toEqual(new ReferenceReviewRepositoryError('reference_command_invalid'));
    await expect(repository.registerDomainAuthority({
      accessToken,
      idempotencyKey: ' invalid ',
      command: registerAuthorityCommand(),
    })).rejects.toEqual(new ReferenceReviewRepositoryError('reference_command_invalid'));
    expect(rpc.calls).toEqual([]);
  });

  it.each([
    ['AR201', 'reference_not_found'],
    ['AR202', 'reference_not_decidable'],
    ['AR203', 'domain_authority_not_found'],
    ['AR204', 'reference_reviewer_required'],
    ['AR206', 'reference_version_conflict'],
    ['AR207', 'reference_idempotency_conflict'],
    ['AR208', 'reference_command_invalid'],
    ['AR209', 'reference_evidence_required'],
    ['AR210', 'reference_normalization_invalid'],
    ['AR299', 'reference_persistence_failed'],
    ['23505', 'reference_persistence_failed'],
  ] as const)('maps SQLSTATE %s to %s without leaking details', async (code, expectedCode) => {
    const repository = createReferenceReviewRepositoryFromRpc(new RecordingRpc([
      new ErrorResponse(code, 'password=secret'),
    ]));

    const error = await repository.registerReference({
      accessToken,
      idempotencyKey: 'reference-register-1',
      command: registerReferenceCommand(),
    }).catch((cause: unknown) => cause);

    expect(error).toEqual(new ReferenceReviewRepositoryError(expectedCode));
    expect(String(error)).not.toMatch(/password|secret/i);
  });

  it('strictly parses every mutation receipt', async () => {
    const repository = createReferenceReviewRepositoryFromRpc(new RecordingRpc([[
      { ...referenceReceipt(), actorUserId: projectId },
    ]]));

    await expect(repository.registerReference({
      accessToken,
      idempotencyKey: 'reference-register-1',
      command: registerReferenceCommand(),
    })).rejects.toEqual(new ReferenceReviewRepositoryError('reference_persistence_failed'));
  });

  it('keeps the package reviewer export unavailable under browser resolution', () => {
    const result = spawnSync(
      process.execPath,
      ['--conditions=browser', '--import=tsx', '--eval', "import('@airdrop/database/reference-review')"],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '@airdrop/database/reference-review is unavailable in browser code.',
    );
    expect(result.stderr).not.toMatch(/supabase|bearer|token|service.role/i);
  });
});

class RecordingRpc implements ReferenceReviewRpc {
  readonly calls: ReferenceReviewRpcCall[] = [];

  constructor(private readonly responses: unknown[]) {}

  async invoke(call: ReferenceReviewRpcCall): Promise<unknown> {
    this.calls.push(call);
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return response;
  }
}

class ErrorResponse extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function referenceListItem(id = referenceId, updatedAt = '2026-08-30T04:00:00.000Z') {
  return {
    version: 1 as const,
    referenceId: id,
    projectId,
    kind: 'official_site' as const,
    label: 'Official site',
    url: 'https://example.com/',
    state: 'verified' as const,
    referenceVersion: 1,
    lastVerifiedAt: '2026-08-30T03:00:00.000Z',
    activeIndicatorId: null,
    updatedAt,
  };
}

function authorityListItem(id = authorityId, updatedAt = '2026-08-30T04:00:00.000Z') {
  return {
    version: 1 as const,
    authorityId: id,
    projectId,
    domain: 'example.com',
    state: 'granted' as const,
    authorityVersion: 1,
    updatedAt,
  };
}

function referenceDetail() {
  return {
    ...referenceListItem(),
    domainAuthority: {
      authorityId,
      domain: 'example.com',
      state: 'granted' as const,
      authorityVersion: 2,
    },
    decisions: [{
      decisionId,
      decision: 'verify' as const,
      resultingState: 'verified' as const,
      reasonCode: 'evidence_verified' as const,
      evidenceId,
      note: 'verified by reviewer',
      createdAt: '2026-08-30T03:00:00.000Z',
    }],
  };
}

function authorityDetail() {
  return {
    ...authorityListItem(),
    decisions: [{
      decisionId,
      decision: 'grant' as const,
      resultingState: 'granted' as const,
      reasonCode: 'evidence_verified' as const,
      evidenceId,
      note: 'domain ownership verified',
      createdAt: '2026-08-30T03:00:00.000Z',
    }],
  };
}

function registerReferenceCommand() {
  return {
    version: 1 as const,
    projectId,
    kind: 'official_site' as const,
    url: 'https://example.com/',
    label: 'Official site',
    evidenceId,
    note: 'registered by reviewer',
  };
}

function decideReferenceCommand() {
  return {
    version: 1 as const,
    referenceId,
    expectedVersion: 1,
    decision: 'verify' as const,
    reasonCode: 'evidence_verified' as const,
    evidenceId,
    note: 'verified by reviewer',
  };
}

function registerAuthorityCommand() {
  return {
    version: 1 as const,
    projectId,
    domain: 'example.com',
    evidenceId,
    note: 'authority evidence',
  };
}

function decideAuthorityCommand() {
  return {
    version: 1 as const,
    authorityId,
    expectedVersion: 1,
    decision: 'grant' as const,
    reasonCode: 'evidence_verified' as const,
    evidenceId,
    note: 'domain ownership verified',
  };
}

function referenceReceipt(overrides: {
  referenceVersion?: number;
  state?: 'candidate' | 'verified' | 'flagged' | 'withdrawn';
} = {}) {
  return {
    version: 1 as const,
    commandId,
    referenceId,
    referenceVersion: 1,
    state: 'candidate' as 'candidate' | 'verified' | 'flagged' | 'withdrawn',
    replayed: false,
    ...overrides,
  };
}

function authorityReceipt(overrides: {
  authorityVersion?: number;
  state?: 'candidate' | 'granted' | 'revoked';
} = {}) {
  return {
    version: 1 as const,
    commandId,
    authorityId,
    authorityVersion: 1,
    state: 'candidate' as 'candidate' | 'granted' | 'revoked',
    replayed: false,
    ...overrides,
  };
}
