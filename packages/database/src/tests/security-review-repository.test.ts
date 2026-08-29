import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  createSecurityReviewRepositoryFromRpc,
  SecurityReviewRepositoryError,
  type SecurityReviewRpc,
  type SecurityReviewRpcCall,
} from '../security/security-review-repository.js';

const accessToken = 'session-token';
const candidateId = '41000000-0000-4000-8000-000000000001';
const secondCandidateId = '41000000-0000-4000-8000-000000000002';
const commandId = '41000000-0000-4000-8000-000000000101';
const decisionId = '41000000-0000-4000-8000-000000000102';
const indicatorId = '41000000-0000-4000-8000-000000000103';
const incidentId = '41000000-0000-4000-8000-000000000104';
const projectId = '41000000-0000-4000-8000-000000000203';
const sourceId = '41000000-0000-4000-8000-000000000204';
const evidenceId = '41000000-0000-4000-8000-000000000205';
const reviewerUserId = '41000000-0000-4000-8000-000000000210';

const candidateSummary = 'Extraction reported a suspicious claim website.';
const publicSummary = '发现仿冒领取页面，请勿访问该域名并立即停止任何提交。';

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

describe('SecurityReviewRepository', () => {
  it('uses each caller token only for its current list RPC', async () => {
    const rpc = new RecordingRpc([[], []]);
    const repository = createSecurityReviewRepositoryFromRpc(rpc);

    await repository.listCandidates({
      accessToken: 'first-session-token',
      query: { origin: 'all', state: 'pending', targetType: 'all', cursor: null, limit: 25 },
    });
    await repository.listIncidents({
      accessToken: 'second-session-token',
      query: { state: 'active', targetType: 'project', cursor: null, limit: 100 },
    });

    expect(rpc.calls).toEqual([
      {
        accessToken: 'first-session-token',
        functionName: 'list_security_candidates',
        args: {
          p_origin: 'all',
          p_state: 'pending',
          p_target_type: 'all',
          p_cursor_created_at: null,
          p_cursor_id: null,
          p_limit: 26,
        },
      },
      {
        accessToken: 'second-session-token',
        functionName: 'list_security_incidents',
        args: {
          p_state: 'active',
          p_target_type: 'project',
          p_cursor_created_at: null,
          p_cursor_id: null,
          p_limit: 100,
        },
      },
    ]);
  });

  it('returns only the requested rows and continues after the final returned item', async () => {
    const rpc = new RecordingRpc([[
      candidateListItem(candidateId, '2026-08-26T03:00:00.000Z'),
      candidateListItem(secondCandidateId, '2026-08-26T02:00:00.000Z'),
    ]]);
    const repository = createSecurityReviewRepositoryFromRpc(rpc);

    const result = await repository.listCandidates({
      accessToken,
      query: { origin: 'all', state: 'all', targetType: 'all', cursor: null, limit: 1 },
    });

    expect(result).toEqual({
      version: 1,
      items: [candidateListItem(candidateId, '2026-08-26T03:00:00.000Z')],
      nextCursor: base64url(JSON.stringify({
        createdAt: '2026-08-26T03:00:00.000Z',
        id: candidateId,
      })),
    });
  });

  it('derives the incident cursor from the final returned item', async () => {
    const rpc = new RecordingRpc([[
      incidentListItem(incidentId),
      incidentListItem('41000000-0000-4000-8000-000000000099'),
    ]]);
    const repository = createSecurityReviewRepositoryFromRpc(rpc);

    const result = await repository.listIncidents({
      accessToken,
      query: { state: 'all', targetType: 'all', cursor: null, limit: 1 },
    });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe(base64url(JSON.stringify({
      createdAt: '2026-08-26T04:00:00.000Z',
      id: incidentId,
    })));
  });

  it('returns no cursor when the database did not provide an extra row', async () => {
    const rpc = new RecordingRpc([[candidateListItem(candidateId)]]);

    await expect(createSecurityReviewRepositoryFromRpc(rpc).listCandidates({
      accessToken,
      query: { origin: 'all', state: 'all', targetType: 'all', cursor: null, limit: 25 },
    })).resolves.toEqual({
      version: 1,
      items: [candidateListItem(candidateId)],
      nextCursor: null,
    });
    await expect(createSecurityReviewRepositoryFromRpc(new RecordingRpc([[]])).listCandidates({
      accessToken,
      query: { origin: 'all', state: 'all', targetType: 'all', cursor: null, limit: 25 },
    })).resolves.toEqual({ version: 1, items: [], nextCursor: null });
  });

  it('decodes a strict cursor into the exact RPC fields', async () => {
    const rpc = new RecordingRpc([[]]);
    const repository = createSecurityReviewRepositoryFromRpc(rpc);
    const cursor = base64url(JSON.stringify({
      createdAt: '2026-08-26T03:00:00.000Z',
      id: candidateId,
    }));

    await repository.listCandidates({
      accessToken,
      query: { origin: 'reviewer_manual', state: 'needs_review', targetType: 'source', cursor, limit: 25 },
    });

    expect(rpc.calls[0]?.args).toEqual({
      p_origin: 'reviewer_manual',
      p_state: 'needs_review',
      p_target_type: 'source',
      p_cursor_created_at: '2026-08-26T03:00:00.000Z',
      p_cursor_id: candidateId,
      p_limit: 26,
    });
  });

  it.each([
    ['not-a-cursor'],
    [base64url(JSON.stringify({ createdAt: '2026-08-26T03:00:00.000Z' }))],
    [base64url(JSON.stringify({ createdAt: 'nope', id: 'id' }))],
  ])('rejects the malformed cursor %s before invoking the RPC', async (cursor) => {
    const rpc = new RecordingRpc([[]]);

    await expect(createSecurityReviewRepositoryFromRpc(rpc).listCandidates({
      accessToken,
      query: { origin: 'all', state: 'all', targetType: 'all', cursor, limit: 25 },
    })).rejects.toEqual(new SecurityReviewRepositoryError('security_persistence_failed'));
    expect(rpc.calls).toEqual([]);
  });

  it.each([
    ['an extra list key', [[{ ...candidateListItem(candidateId), errorDetail: 'password=secret' }]]],
    ['a malformed list item', [[{ ...candidateListItem(candidateId), stateVersion: '0' }]]],
    ['a non-array list result', [{ ...candidateListItem(candidateId) }]],
  ])('sanitizes %s', async (_caseName, response) => {
    const rpc = new RecordingRpc(response);

    const error = await createSecurityReviewRepositoryFromRpc(rpc).listCandidates({
      accessToken,
      query: { origin: 'all', state: 'all', targetType: 'all', cursor: null, limit: 25 },
    }).catch((cause: unknown) => cause);

    expect(error).toEqual(new SecurityReviewRepositoryError('security_persistence_failed'));
    expect(String(error)).not.toMatch(/password|secret|errorDetail/i);
  });

  it('strictly parses one safe extraction candidate detail row', async () => {
    const rpc = new RecordingRpc([[extractionDetail(candidateId)]]);

    await expect(createSecurityReviewRepositoryFromRpc(rpc).getCandidate({
      accessToken,
      candidateId,
    })).resolves.toEqual(extractionDetail(candidateId));
    expect(rpc.calls).toEqual([{
      accessToken,
      functionName: 'get_security_candidate',
      args: { p_candidate_id: candidateId },
    }]);
  });

  it('strictly parses one safe reviewer-manual candidate detail row', async () => {
    const rpc = new RecordingRpc([[manualDetail(candidateId)]]);

    await expect(createSecurityReviewRepositoryFromRpc(rpc).getCandidate({
      accessToken,
      candidateId,
    })).resolves.toEqual(manualDetail(candidateId));
  });

  it.each([
    ['an extra detail key', [{ ...extractionDetail(candidateId), output: 'secret' }]],
    ['two detail rows', [extractionDetail(candidateId), extractionDetail(candidateId)]],
  ])('sanitizes %s', async (_caseName, response) => {
    const rpc = new RecordingRpc([response]);

    const error = await createSecurityReviewRepositoryFromRpc(rpc).getCandidate({
      accessToken,
      candidateId,
    }).catch((cause: unknown) => cause);

    expect(error).toEqual(new SecurityReviewRepositoryError('security_persistence_failed'));
    expect(String(error)).not.toMatch(/output|secret/i);
  });

  it('strictly parses one safe incident detail row', async () => {
    const detail = incidentDetail();
    const rpc = new RecordingRpc([[detail]]);

    await expect(createSecurityReviewRepositoryFromRpc(rpc).getIncident({
      accessToken,
      incidentId,
    })).resolves.toEqual(detail);
    expect(rpc.calls).toEqual([{
      accessToken,
      functionName: 'get_security_incident',
      args: { p_incident_id: incidentId },
    }]);
  });

  it('forwards exact manual submit fields with canonical payload order', async () => {
    const rpc = new RecordingRpc([[
      {
        version: 1,
        commandId,
        candidateId,
        candidateVersion: 1,
        state: 'pending',
        replayed: false,
      },
    ]]);

    await expect(createSecurityReviewRepositoryFromRpc(rpc).submitManualCandidate({
      accessToken,
      idempotencyKey: 'security-submit-1',
      command: manualCommand(),
    })).resolves.toEqual({
      version: 1,
      commandId,
      candidateId,
      candidateVersion: 1,
      state: 'pending',
      replayed: false,
    });
    expect(rpc.calls).toEqual([{
      accessToken,
      functionName: 'submit_manual_security_candidate',
      args: {
        p_command_payload: '{"evidenceId":"41000000-0000-4000-8000-000000000205",'
          + '"indicator":{"type":"domain","value":"claim.example"},'
          + '"note":null,'
          + '"summary":"Reviewer submitted a manual phishing report.",'
          + '"target":{"id":"41000000-0000-4000-8000-000000000203","type":"project"},'
          + '"version":1}',
        p_idempotency_key: 'security-submit-1',
      },
    }]);
  });

  it('forwards exact review fields with canonical payload order and no injected actor or time', async () => {
    const rpc = new RecordingRpc([[acceptAndOpenReceipt()]]);

    await expect(createSecurityReviewRepositoryFromRpc(rpc).reviewCandidate({
      accessToken,
      candidateId,
      idempotencyKey: 'security-review-1',
      command: acceptAndOpenCommand(),
    })).resolves.toEqual(acceptAndOpenReceipt());
    expect(rpc.calls).toEqual([{
      accessToken,
      functionName: 'execute_security_candidate_review',
      args: {
        p_candidate_id: candidateId,
        p_command_payload: '{"candidateId":"41000000-0000-4000-8000-000000000001",'
          + '"category":"phishing",'
          + '"decision":"accept_and_open",'
          + '"evidenceId":"41000000-0000-4000-8000-000000000205",'
          + '"expectedCandidateVersion":1,'
          + '"indicator":{"type":"domain","value":"claim.example"},'
          + '"note":null,'
          + `"publicSummary":"${publicSummary}",`
          + '"reasonCode":"evidence_verified",'
          + '"resultingPosture":"blocked",'
          + '"resultingSeverity":"critical",'
          + '"target":{"id":"41000000-0000-4000-8000-000000000203","type":"project"},'
          + '"version":1}',
        p_idempotency_key: 'security-review-1',
      },
    }]);
    expect(Object.keys(rpc.calls[0]?.args ?? {})).toEqual([
      'p_candidate_id',
      'p_command_payload',
      'p_idempotency_key',
    ]);
    expect(String(rpc.calls[0]?.args.p_command_payload)).not.toMatch(
      /reviewer|timestamp|submittedAt|actor/i,
    );
  });

  it('parses replayed receipts strictly', async () => {
    const rpc = new RecordingRpc([[{ ...acceptAndOpenReceipt(), replayed: true }]]);

    await expect(createSecurityReviewRepositoryFromRpc(rpc).reviewCandidate({
      accessToken,
      candidateId,
      idempotencyKey: 'security-review-replay',
      command: acceptAndOpenCommand(),
    })).resolves.toEqual({ ...acceptAndOpenReceipt(), replayed: true });
  });

  it('routes open commands to open_security_incident without an incident argument', async () => {
    const rpc = new RecordingRpc([[
      {
        version: 1,
        commandId,
        incidentId,
        incidentVersion: 1,
        decisionId,
        state: 'active',
        posture: 'blocked',
        replayed: false,
      },
    ]]);

    await expect(createSecurityReviewRepositoryFromRpc(rpc).openIncident({
      accessToken,
      idempotencyKey: 'incident-open-1',
      command: {
        version: 1,
        action: 'open',
        target: { type: 'project', id: projectId },
        category: 'phishing',
        indicatorId,
        evidenceId,
        resultingPosture: 'blocked',
        resultingSeverity: 'critical',
        publicSummary,
        reasonCode: 'active_exploitation',
        note: null,
      },
    })).resolves.toEqual({
      version: 1,
      commandId,
      incidentId,
      incidentVersion: 1,
      decisionId,
      state: 'active',
      posture: 'blocked',
      replayed: false,
    });
    expect(rpc.calls).toEqual([{
      accessToken,
      functionName: 'open_security_incident',
      args: {
        p_command_payload: expect.stringContaining('"action":"open"'),
        p_idempotency_key: 'incident-open-1',
      },
    }]);
  });

  it('routes non-open incident commands through execute_security_incident_command', async () => {
    const rpc = new RecordingRpc([[
      {
        version: 1,
        commandId,
        incidentId,
        incidentVersion: 2,
        decisionId,
        state: 'resolved',
        posture: null,
        replayed: false,
      },
    ]]);

    await expect(createSecurityReviewRepositoryFromRpc(rpc).commandIncident({
      accessToken,
      incidentId,
      idempotencyKey: 'incident-resolve-1',
      command: resolveCommand(),
    })).resolves.toEqual({
      version: 1,
      commandId,
      incidentId,
      incidentVersion: 2,
      decisionId,
      state: 'resolved',
      posture: null,
      replayed: false,
    });
    expect(rpc.calls).toEqual([{
      accessToken,
      functionName: 'execute_security_incident_command',
      args: {
        p_incident_id: incidentId,
        p_command_payload: expect.stringContaining('"action":"resolve"'),
        p_idempotency_key: 'incident-resolve-1',
      },
    }]);
  });

  it('forwards disclosure commands with strict receipt parsing', async () => {
    const rpc = new RecordingRpc([[
      {
        version: 1,
        commandId,
        indicatorId,
        indicatorVersion: 2,
        decision: 'publish',
        publicSafe: true,
        replayed: false,
      },
    ]]);

    await expect(createSecurityReviewRepositoryFromRpc(rpc).setIndicatorDisclosure({
      accessToken,
      indicatorId,
      idempotencyKey: 'disclosure-publish-1',
      command: {
        version: 1,
        indicatorId,
        expectedIndicatorVersion: 1,
        decision: 'publish',
        reasonCode: 'safe_for_public_warning',
        note: null,
      },
    })).resolves.toEqual({
      version: 1,
      commandId,
      indicatorId,
      indicatorVersion: 2,
      decision: 'publish',
      publicSafe: true,
      replayed: false,
    });
    expect(rpc.calls).toEqual([{
      accessToken,
      functionName: 'set_security_indicator_disclosure',
      args: {
        p_indicator_id: indicatorId,
        p_command_payload: expect.any(String),
        p_idempotency_key: 'disclosure-publish-1',
      },
    }]);
  });

  it.each([
    ['invalid candidate uuid', (repository: ReturnType<typeof createSecurityReviewRepositoryFromRpc>) =>
      repository.getCandidate({ accessToken, candidateId: 'not-a-uuid' })],
    ['blank access token', (repository: ReturnType<typeof createSecurityReviewRepositoryFromRpc>) =>
      repository.listCandidates({ accessToken: '   ', query: { origin: 'all', state: 'all', targetType: 'all', cursor: null, limit: 25 } })],
    ['whitespace idempotency key', (repository: ReturnType<typeof createSecurityReviewRepositoryFromRpc>) =>
      repository.reviewCandidate({
        accessToken,
        candidateId,
        idempotencyKey: ' padded ',
        command: needsReviewCommand(),
      })],
    ['command not matching candidate', (repository: ReturnType<typeof createSecurityReviewRepositoryFromRpc>) =>
      repository.reviewCandidate({
        accessToken,
        candidateId,
        idempotencyKey: 'mismatched-candidate',
        command: { ...needsReviewCommand(), candidateId: secondCandidateId },
      })],
    ['open command routed through the generic runner', (repository: ReturnType<typeof createSecurityReviewRepositoryFromRpc>) =>
      repository.commandIncident({
        accessToken,
        incidentId,
        idempotencyKey: 'mismatched-action',
        command: asCommand({
          version: 1,
          action: 'open',
          target: { type: 'project', id: projectId },
          category: 'phishing',
          indicatorId,
          evidenceId,
          resultingPosture: 'blocked',
          resultingSeverity: 'critical',
          publicSummary,
          reasonCode: 'active_exploitation',
          note: null,
        }),
      })],
    ['non-open command routed through open', (repository: ReturnType<typeof createSecurityReviewRepositoryFromRpc>) =>
      repository.openIncident({
        accessToken,
        idempotencyKey: 'mismatched-open',
        command: asCommand(resolveCommand()),
      })],
    ['disclosure command not matching indicator', (repository: ReturnType<typeof createSecurityReviewRepositoryFromRpc>) =>
      repository.setIndicatorDisclosure({
        accessToken,
        indicatorId,
        idempotencyKey: 'mismatched-indicator',
        command: {
          version: 1,
          indicatorId: secondCandidateId,
          expectedIndicatorVersion: 1,
          decision: 'publish',
          reasonCode: 'safe_for_public_warning',
          note: null,
        },
      })],
    ['over-long command summary rejected by contracts', (repository: ReturnType<typeof createSecurityReviewRepositoryFromRpc>) =>
      repository.submitManualCandidate({
        accessToken,
        idempotencyKey: 'short-summary',
        command: { ...manualCommand(), summary: 'short' },
      })],
  ])('rejects $name before invoking the RPC', async (_caseName, operation) => {
    const rpc = new RecordingRpc([[]]);

    await expect(operation(createSecurityReviewRepositoryFromRpc(rpc)))
      .rejects.toBeInstanceOf(SecurityReviewRepositoryError);
    expect(rpc.calls).toEqual([]);
  });

  it.each([
    ['AS101', 'security_candidate_not_found'],
    ['AS102', 'security_candidate_not_reviewable'],
    ['AS103', 'security_incident_not_found'],
    ['AS104', 'security_reviewer_required'],
    ['AS105', 'security_indicator_not_found'],
    ['AS106', 'security_version_conflict'],
    ['AS107', 'security_idempotency_conflict'],
    ['AS108', 'security_command_invalid'],
    ['AS109', 'security_target_mismatch'],
    ['AS111', 'security_review_required'],
    ['AS112', 'security_promotion_blocked'],
    ['AS199', 'security_persistence_failed'],
  ] as const)('maps SQLSTATE %s without exposing database details', async (sqlState, code) => {
    const rpc = new RecordingRpc([], Object.assign(
      new Error('postgres://password@database provider body'),
      { code: sqlState },
    ));

    const error = await createSecurityReviewRepositoryFromRpc(rpc).reviewCandidate({
      accessToken,
      candidateId,
      idempotencyKey: 'mapping-test',
      command: needsReviewCommand(),
    }).catch((cause: unknown) => cause);

    expect(error).toEqual(new SecurityReviewRepositoryError(code));
    expect(String(error)).not.toMatch(/postgres|password|database|provider|body|session-token/i);
  });

  it('sanitizes unexpected errors behind the stable persistence code', async () => {
    const rpc = new RecordingRpc([], new Error('token=session-token source body'));

    const error = await createSecurityReviewRepositoryFromRpc(rpc).getIncident({
      accessToken,
      incidentId,
    }).catch((cause: unknown) => cause);

    expect(error).toEqual(new SecurityReviewRepositoryError('security_persistence_failed'));
    expect(String(error)).not.toMatch(/token|session|source|body/i);
  });

  it('rejects the package export under browser module resolution', () => {
    const result = spawnSync(
      process.execPath,
      ['--conditions=browser', '--import=tsx', '--eval', "import('@airdrop/database/security-review')"],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '@airdrop/database/security-review is unavailable in browser code.',
    );
    expect(result.stderr).not.toMatch(/supabase|bearer|token/i);
  });
});

class RecordingRpc implements SecurityReviewRpc {
  readonly calls: SecurityReviewRpcCall[] = [];
  readonly #responses: unknown[];
  readonly #error: unknown;

  constructor(responses: unknown[], error?: unknown) {
    this.#responses = [...responses];
    this.#error = error;
  }

  async invoke(call: SecurityReviewRpcCall): Promise<unknown> {
    this.calls.push(call);
    if (this.#error !== undefined) throw this.#error;
    return this.#responses.shift();
  }
}

function asCommand<T>(value: object): T {
  return value as T;
}

function candidateListItem(id: string, createdAt = '2026-08-26T03:00:00.000Z') {
  return {
    version: 1,
    candidateId: id,
    origin: 'extraction',
    state: 'pending',
    stateVersion: 0,
    target: null,
    summary: candidateSummary,
    createdAt,
    reviewedAt: null,
  } as const;
}

function extractionDetail(id: string) {
  return {
    version: 1,
    candidateId: id,
    origin: 'extraction',
    state: 'pending',
    stateVersion: 0,
    summary: candidateSummary,
    note: null,
    submittedByUserId: null,
    createdAt: '2026-08-26T03:00:00.000Z',
    target: null,
    targetContext: { projectId, sourceId },
    indicator: null,
    evidenceId: null,
  };
}

function manualDetail(id: string) {
  return {
    version: 1,
    candidateId: id,
    origin: 'reviewer_manual',
    state: 'needs_review',
    stateVersion: 0,
    summary: 'Reviewer reported a suspicious claim page.',
    note: null,
    submittedByUserId: reviewerUserId,
    createdAt: '2026-08-26T05:00:00.000Z',
    target: { type: 'project', id: projectId },
    targetContext: null,
    indicator: { type: 'domain', value: 'claim.example' },
    evidenceId,
  };
}

function incidentListItem(
  id: string,
  lastDecisionAt = '2026-08-26T04:00:00.000Z',
) {
  return {
    version: 1,
    incidentId: id,
    target: { type: 'project', id: projectId },
    category: 'phishing',
    currentSeverity: 'critical',
    publicSummary,
    incidentVersion: 1,
    openedAt: '2026-08-26T01:00:00.000Z',
    lastDecisionAt,
    state: 'active',
    currentPosture: 'blocked',
  } as const;
}

function incidentDecision() {
  return {
    version: 1,
    decisionId,
    incidentVersion: 1,
    action: 'open',
    reasonCode: 'active_exploitation',
    resultingPosture: 'blocked',
    resultingSeverity: 'critical',
    publicSummary,
    note: null,
    evidenceId,
    reviewerUserId,
    createdAt: '2026-08-26T04:00:00.000Z',
  } as const;
}

function incidentDetail() {
  return {
    version: 1,
    incident: incidentListItem(incidentId),
    indicatorIds: [indicatorId],
    decisions: [incidentDecision()],
  };
}

function manualCommand() {
  return {
    version: 1 as const,
    target: { type: 'project' as const, id: projectId },
    evidenceId,
    indicator: { type: 'domain' as const, value: 'claim.example' },
    summary: 'Reviewer submitted a manual phishing report.',
    note: null,
  };
}

function acceptAndOpenCommand() {
  return {
    version: 1 as const,
    candidateId,
    expectedCandidateVersion: 1,
    decision: 'accept_and_open' as const,
    target: { type: 'project' as const, id: projectId },
    indicator: { type: 'domain' as const, value: 'claim.example' },
    category: 'phishing' as const,
    resultingPosture: 'blocked' as const,
    resultingSeverity: 'critical' as const,
    publicSummary,
    evidenceId,
    reasonCode: 'evidence_verified' as const,
    note: null,
  };
}

function needsReviewCommand() {
  return {
    version: 1 as const,
    candidateId,
    expectedCandidateVersion: 1,
    decision: 'needs_review' as const,
    reasonCode: 'insufficient_context' as const,
    note: null,
  };
}

function resolveCommand() {
  return {
    version: 1 as const,
    action: 'resolve' as const,
    incidentId,
    expectedIncidentVersion: 1,
    evidenceId,
    resultingSeverity: 'high' as const,
    publicSummary,
    reasonCode: 'mitigation_verified' as const,
    note: null,
  };
}

function acceptAndOpenReceipt() {
  return {
    version: 1,
    commandId,
    candidateId,
    candidateVersion: 2,
    decisionId,
    state: 'accepted',
    indicatorId,
    incidentId,
    replayed: false,
  } as const;
}
