import type {
  ManualSecurityCandidateCommandV1,
  SecurityCandidateReviewCommandV1,
  SecurityIncidentCommandV1,
  SecurityIndicatorDisclosureCommandV1,
} from '@airdrop/contracts';
import { describe, expect, it } from 'vitest';

import { createSecurityReviewApiClient } from '../lib/security-review-api-client.js';
import type { ReviewSessionController } from '../lib/review-session.js';

const candidateId = 'a1000000-0000-4000-8000-000000000001';
const command: SecurityCandidateReviewCommandV1 = { version: 1, candidateId, expectedCandidateVersion: 1, decision: 'reject', reasonCode: 'claim_not_supported', note: null };
const requestId = 'a1000000-0000-4000-8000-000000000002';
const result = { version: 1, commandId: 'a1000000-0000-4000-8000-000000000003', candidateId, candidateVersion: 2, decisionId: 'a1000000-0000-4000-8000-000000000004', state: 'rejected', indicatorId: null, incidentId: null, replayed: false };
const manualCommand: ManualSecurityCandidateCommandV1 = { version: 1, target: { type: 'project', id: candidateId }, evidenceId: 'a1000000-0000-4000-8000-000000000005', indicator: { type: 'domain', value: 'unsafe.example' }, summary: 'Verified unsafe project domain.', note: null };
const manualResult = { version: 1, commandId: 'a1000000-0000-4000-8000-000000000006', candidateId, candidateVersion: 1, state: 'pending', replayed: false };
const incidentId = 'a1000000-0000-4000-8000-000000000007';
const indicatorId = 'a1000000-0000-4000-8000-000000000008';
const evidenceId = 'a1000000-0000-4000-8000-000000000009';
const incidentOpen: Extract<SecurityIncidentCommandV1, { action: 'open' }> = { version: 1, action: 'open', target: { type: 'project', id: candidateId }, category: 'phishing', indicatorId, evidenceId, reasonCode: 'precautionary_evidence', resultingPosture: 'blocked', resultingSeverity: 'high', publicSummary: 'A verified phishing campaign targets this project.', note: null };
const incidentCommand: Exclude<SecurityIncidentCommandV1, { action: 'open' }> = { version: 1, action: 'adjust', incidentId, expectedIncidentVersion: 1, evidenceId, reasonCode: 'evidence_escalated', resultingPosture: 'blocked', resultingSeverity: 'critical', publicSummary: 'A verified phishing campaign targets this project.', note: null };
const disclosure: SecurityIndicatorDisclosureCommandV1 = { version: 1, indicatorId, expectedIndicatorVersion: 1, decision: 'publish', reasonCode: 'safe_for_public_warning', note: null };
const incidentResult = { version: 1, commandId: 'a1000000-0000-4000-8000-000000000010', incidentId, incidentVersion: 2, decisionId: 'a1000000-0000-4000-8000-000000000011', state: 'active', posture: 'blocked', replayed: false };
const disclosureResult = { version: 1, commandId: 'a1000000-0000-4000-8000-000000000012', indicatorId, indicatorVersion: 2, decision: 'publish', publicSafe: true, replayed: false };

describe('security review browser API client', () => {
  it('gets a fresh bearer token and idempotency key for each candidate review without rewriting the expected version', async () => {
    const requests: Request[] = [];
    let token = 0; let key = 0;
    const client = createSecurityReviewApiClient({ session: session(() => `token-${++token}`), ids: { generate: () => `key-${++key}` }, fetch: async (input, init) => { requests.push(new Request(new URL(String(input), 'http://local'), init)); return success(result); } });

    await client.reviewCandidate(candidateId, command);
    await client.reviewCandidate(candidateId, command);

    expect(requests.map((request) => request.headers.get('authorization'))).toEqual(['Bearer token-1', 'Bearer token-2']);
    expect(requests.map((request) => request.headers.get('idempotency-key'))).toEqual(['key-1', 'key-2']);
    await expect(requests[0]?.json()).resolves.toEqual(command);
  });

  it('returns a typed conflict without retrying or changing the caller command', async () => {
    let calls = 0;
    const client = createSecurityReviewApiClient({ session: session(() => 'token'), ids: { generate: () => 'key' }, fetch: async () => { calls += 1; return error(409, 'security_version_conflict'); } });
    await expect(client.reviewCandidate(candidateId, command)).resolves.toEqual({ ok: false, state: 'conflict', code: 'security_version_conflict' });
    expect(calls).toBe(1);
  });

  it('rejects missing sessions and malformed shared envelopes without exposing server data', async () => {
    const unauthenticated = createSecurityReviewApiClient({ session: session(() => null), ids: { generate: () => 'key' }, fetch: async () => { throw new Error('must not fetch'); } });
    const malformed = createSecurityReviewApiClient({ session: session(() => 'token'), ids: { generate: () => 'key' }, fetch: async () => Response.json({ ok: true, data: { ...result, internalNote: 'secret' } }) });
    await expect(unauthenticated.reviewCandidate(candidateId, command)).resolves.toEqual({ ok: false, state: 'sign_in_required' });
    await expect(malformed.reviewCandidate(candidateId, command)).resolves.toEqual({ ok: false, state: 'request_failed' });
  });

  it('rejects cross-kind candidate receipts and a non-contract manual state', async () => {
    const manual = createSecurityReviewApiClient({ session: session(() => 'token'), ids: { generate: () => 'manual-key' }, fetch: async () => success(result) });
    const review = createSecurityReviewApiClient({ session: session(() => 'token'), ids: { generate: () => 'review-key' }, fetch: async () => success(manualResult) });
    const state = createSecurityReviewApiClient({ session: session(() => 'token'), ids: { generate: () => 'state-key' }, fetch: async () => success({ ...manualResult, state: 'unsafe' }) });
    await expect(manual.submitManualCandidate(manualCommand)).resolves.toEqual({ ok: false, state: 'request_failed' });
    await expect(review.reviewCandidate(candidateId, command)).resolves.toEqual({ ok: false, state: 'request_failed' });
    await expect(state.submitManualCandidate(manualCommand)).resolves.toEqual({ ok: false, state: 'request_failed' });
  });

  it('uses a fresh token for every operation and fresh idempotency keys for all mutations', async () => {
    const requests: Request[] = []; let token = 0; let key = 0;
    const outputs = [{ version: 1, items: [] }, candidateDetail(), manualResult, result, { version: 1, items: [] }, incidentDetail(), incidentResult, incidentResult, disclosureResult];
    const client = createSecurityReviewApiClient({ session: session(() => `token-${++token}`), ids: { generate: () => `key-${++key}` }, fetch: async (input, init) => { requests.push(new Request(new URL(String(input), 'http://local'), init)); return success(outputs.shift()); } });
    await client.listCandidates({ origin: 'all', state: 'all', targetType: 'all', cursor: null, limit: 25 });
    await client.getCandidate(candidateId); await client.submitManualCandidate(manualCommand); await client.reviewCandidate(candidateId, command);
    await client.listIncidents({ state: 'all', targetType: 'all', cursor: null, limit: 25 }); await client.getIncident(incidentId);
    await client.openIncident(incidentOpen); await client.commandIncident(incidentId, incidentCommand); await client.setIndicatorDisclosure(indicatorId, disclosure);
    expect(requests.map((request) => request.headers.get('authorization'))).toEqual(['Bearer token-1', 'Bearer token-2', 'Bearer token-3', 'Bearer token-4', 'Bearer token-5', 'Bearer token-6', 'Bearer token-7', 'Bearer token-8', 'Bearer token-9']);
    expect(requests.map((request) => request.headers.get('idempotency-key'))).toEqual([null, null, 'key-1', 'key-2', null, null, 'key-3', 'key-4', 'key-5']);
    await expect(requests[3]?.json()).resolves.toEqual(command);
    await expect(requests[7]?.json()).resolves.toEqual(incidentCommand);
    await expect(requests[8]?.json()).resolves.toEqual(disclosure);
  });

  it.each([
    ['manual candidate', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.submitManualCandidate(manualCommand)],
    ['candidate review', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.reviewCandidate(candidateId, command)],
    ['incident open', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.openIncident(incidentOpen)],
    ['incident command', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.commandIncident(incidentId, incidentCommand)],
    ['indicator disclosure', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.setIndicatorDisclosure(indicatorId, disclosure)],
  ])('returns a typed 409 conflict for %s without retrying', async (_name, invoke) => {
    let calls = 0;
    const client = createSecurityReviewApiClient({ session: session(() => 'token'), ids: { generate: () => 'key' }, fetch: async () => { calls += 1; return error(409, 'security_version_conflict'); } });
    await expect(invoke(client)).resolves.toEqual({ ok: false, state: 'conflict', code: 'security_version_conflict' });
    expect(calls).toBe(1);
  });

  it.each([
    ['candidate list', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.listCandidates({ origin: 'all', state: 'all', targetType: 'all', cursor: null, limit: 25 })],
    ['candidate detail', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.getCandidate(candidateId)],
    ['manual candidate', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.submitManualCandidate(manualCommand)],
    ['candidate review', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.reviewCandidate(candidateId, command)],
    ['incident list', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.listIncidents({ state: 'all', targetType: 'all', cursor: null, limit: 25 })],
    ['incident detail', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.getIncident(incidentId)],
    ['incident open', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.openIncident(incidentOpen)],
    ['incident command', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.commandIncident(incidentId, incidentCommand)],
    ['indicator disclosure', (client: ReturnType<typeof createSecurityReviewApiClient>) => client.setIndicatorDisclosure(indicatorId, disclosure)],
  ])('strictly rejects a malformed success envelope for %s', async (_name, invoke) => {
    const client = createSecurityReviewApiClient({ session: session(() => 'token'), ids: { generate: () => 'key' }, fetch: async () => Response.json({ ok: true, data: { secret: 'unsafe' } }) });
    await expect(invoke(client)).resolves.toEqual({ ok: false, state: 'request_failed' });
  });
});
function success(data: unknown) { return Response.json({ ok: true, data, meta: { requestId, nextCursor: null } }); }
function error(status: number, code: string) { return Response.json({ ok: false, error: { code, message: 'secret', requestId, details: null } }, { status }); }
function session(getAccessToken: () => string | null): ReviewSessionController { return { signIn: async () => ({ ok: true }), getAccessToken: async () => getAccessToken(), signOut: async () => undefined }; }
function candidateDetail() { return { version: 1, candidateId, origin: 'extraction', state: 'pending', stateVersion: 0, summary: 'Extraction candidate summary.', note: null, submittedByUserId: null, createdAt: '2026-08-28T00:00:00.000Z', target: null, targetContext: { projectId: candidateId, sourceId: incidentId }, indicator: null, evidenceId: null }; }
function incidentDetail() { return { version: 1, incident: { version: 1, incidentId, target: { type: 'project', id: candidateId }, category: 'phishing', currentSeverity: 'high', publicSummary: 'A verified phishing campaign targets this project.', incidentVersion: 1, openedAt: '2026-08-28T00:00:00.000Z', lastDecisionAt: '2026-08-28T00:00:00.000Z', state: 'active', currentPosture: 'blocked' }, indicatorIds: [], decisions: [] }; }
