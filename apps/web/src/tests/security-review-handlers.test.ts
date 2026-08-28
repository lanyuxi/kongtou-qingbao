import type {
  ManualSecurityCandidateCommandV1,
  SecurityCandidateListQuery,
  SecurityCandidateReviewCommandV1,
  SecurityIncidentCommandV1,
  SecurityIncidentListQuery,
  SecurityIndicatorDisclosureCommandV1,
} from '@airdrop/contracts';
import type {
  SecurityCandidateListResult,
  SecurityIncidentListResult,
  SecurityReviewRepository,
} from '@airdrop/database/security-review';
import type { SecurityPublicRepository } from '@airdrop/database';
import { describe, expect, it } from 'vitest';

import {
  createSecurityCandidateDetailHandler,
  createSecurityCandidateListHandler,
  createSecurityCandidateReviewHandler,
  createSecurityIncidentDetailHandler,
  createSecurityIncidentListHandler,
  createSecurityIncidentOpenHandler,
  createSecurityIndicatorDisclosureHandler,
  createSecurityPublicBlockedProjectsHandler,
  type AuthenticatedUserVerifier,
} from '../lib/security-review-handlers.js';

const candidateId = 'a1000000-0000-4000-8000-000000000001';
const incidentId = 'a1000000-0000-4000-8000-000000000002';
const indicatorId = 'a1000000-0000-4000-8000-000000000003';
const evidenceId = 'a1000000-0000-4000-8000-000000000004';
const commandId = 'a1000000-0000-4000-8000-000000000005';
const decisionId = 'a1000000-0000-4000-8000-000000000006';
const requestId = 'a1000000-0000-4000-8000-000000000007';
const accessToken = 'security-review-token';
const cursor = 'eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTI4VDAwOjAwOjAwLjAwMFoiLCJpZCI6ImExMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9';
const publicCursor = 'eyJsYXN0VmVyaWZpZWRBdCI6IjIwMjYtMDgtMjhUMDA6MDA6MDAuMDAwWiIsInByb2plY3RJZCI6ImExMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9';

const candidateCommand: SecurityCandidateReviewCommandV1 = {
  version: 1,
  candidateId,
  expectedCandidateVersion: 1,
  decision: 'reject',
  reasonCode: 'claim_not_supported',
  note: null,
};
const incidentCommand: Extract<SecurityIncidentCommandV1, { action: 'open' }> = {
  version: 1,
  action: 'open',
  target: { type: 'project', id: candidateId },
  category: 'phishing',
  indicatorId,
  evidenceId,
  reasonCode: 'precautionary_evidence',
  resultingPosture: 'blocked',
  resultingSeverity: 'high',
  publicSummary: 'A verified phishing campaign targets this project.',
  note: null,
};
const disclosureCommand: SecurityIndicatorDisclosureCommandV1 = {
  version: 1,
  indicatorId,
  expectedIndicatorVersion: 1,
  decision: 'publish',
  reasonCode: 'safe_for_public_warning',
  note: null,
};

describe('security review BFF handlers', () => {
  it('authenticates before candidate query validation and calls only listCandidates', async () => {
    const events: string[] = [];
    const reviews = new RecordingSecurityReviews(events);
    const response = await candidateListHandler(new StaticAuth(null, events), reviews)(
      request('/api/v1/review/security/candidates?unknown=value', 'GET', null),
    );

    await expectError(response, 401, 'unauthorized', 'Authentication is required.');
    expect(events).toEqual(['auth']);
    expect(reviews.calls).toEqual([]);
  });

  it.each([
    ['missing authorization', null],
    ['Basic authorization', 'Basic abc'],
    ['lower-case bearer', `bearer ${accessToken}`],
  ])('rejects %s with the shared unauthorized envelope', async (_name, authorization) => {
    const response = await candidateListHandler(new StaticAuth({ userId: candidateId }), new RecordingSecurityReviews())(
      request('/api/v1/review/security/candidates', 'GET', authorization),
    );
    await expectError(response, 401, 'unauthorized', 'Authentication is required.');
  });

  it.each([
    ['unknown candidate query', 'foo=bar', 'invalid_request'],
    ['repeated candidate query', 'state=pending&state=accepted', 'invalid_request'],
    ['malformed candidate cursor', 'cursor=bad', 'invalid_cursor'],
    ['noninteger candidate limit', 'limit=1.5', 'invalid_request'],
  ])('rejects %s after authentication without querying', async (_name, query, code) => {
    const reviews = new RecordingSecurityReviews();
    const response = await candidateListHandler(new StaticAuth({ userId: candidateId }), reviews)(
      request(`/api/v1/review/security/candidates?${query}`, 'GET'),
    );
    await expectError(response, 400, code, code === 'invalid_cursor' ? 'The cursor is invalid.' : 'The request is invalid.');
    expect(reviews.calls).toEqual([]);
  });

  it('returns strict candidate and incident list envelopes with exact queries', async () => {
    const reviews = new RecordingSecurityReviews();
    const candidates = await candidateListHandler(new StaticAuth({ userId: candidateId }), reviews)(
      request(`/api/v1/review/security/candidates?origin=all&state=pending&targetType=project&cursor=${cursor}&limit=1`, 'GET'),
    );
    const incidents = await incidentListHandler(new StaticAuth({ userId: candidateId }), reviews)(
      request(`/api/v1/review/security/incidents?state=active&targetType=source&cursor=${cursor}&limit=1`, 'GET'),
    );

    expect(await candidates.json()).toEqual({ ok: true, data: { version: 1, items: [] }, meta: { requestId, nextCursor: null } });
    expect(await incidents.json()).toEqual({ ok: true, data: { version: 1, items: [] }, meta: { requestId, nextCursor: null } });
    expect(reviews.calls).toEqual([
      { operation: 'listCandidates', input: { accessToken, query: { origin: 'all', state: 'pending', targetType: 'project', cursor, limit: 1 } } },
      { operation: 'listIncidents', input: { accessToken, query: { state: 'active', targetType: 'source', cursor, limit: 1 } } },
    ]);
  });

  it.each([
    ['candidate detail', () => candidateDetailHandler(new StaticAuth({ userId: candidateId }), new RejectingSecurityReviews('security_candidate_not_found'))(request('/x', 'GET'), context('not-a-uuid')), 400, 'invalid_request'],
    ['incident detail', () => incidentDetailHandler(new StaticAuth({ userId: candidateId }), new RejectingSecurityReviews('security_incident_not_found'))(request('/x', 'GET'), context('not-a-uuid')), 400, 'invalid_request'],
    ['candidate missing', () => candidateDetailHandler(new StaticAuth({ userId: candidateId }), new RejectingSecurityReviews('security_candidate_not_found'))(request('/x', 'GET'), context(candidateId)), 404, 'security_candidate_not_found'],
    ['incident missing', () => incidentDetailHandler(new StaticAuth({ userId: candidateId }), new RejectingSecurityReviews('security_incident_not_found'))(request('/x', 'GET'), context(incidentId)), 404, 'security_incident_not_found'],
  ])('maps %s safely', async (_name, invoke, status, code) => {
    const response = await invoke();
    await expectError(response, status, code, status === 404 ? 'The requested security record was not found.' : 'The request is invalid.');
  });

  it.each([
    ['candidate review', (reviews: SecurityReviewRepository) => candidateReviewHandler(new StaticAuth({ userId: candidateId }), reviews)(invalidMutationRequest('/x', candidateCommand), context(candidateId))],
    ['incident open', (reviews: SecurityReviewRepository) => incidentOpenHandler(new StaticAuth({ userId: candidateId }), reviews)(invalidMutationRequest('/x', incidentCommand))],
    ['indicator disclosure', (reviews: SecurityReviewRepository) => indicatorDisclosureHandler(new StaticAuth({ userId: candidateId }), reviews)(invalidMutationRequest('/x', disclosureCommand), context(indicatorId))],
  ])('requires a valid idempotency key for %s after authentication', async (_name, invoke) => {
    const reviews = new RecordingSecurityReviews();
    const response = await invoke(reviews);
    await expectError(response, 400, 'invalid_request', 'The request is invalid.');
    expect(reviews.calls).toEqual([]);
  });

  it('routes each mutation once with caller supplied expected versions and literal envelopes', async () => {
    const reviews = new RecordingSecurityReviews();
    const candidate = await candidateReviewHandler(new StaticAuth({ userId: candidateId }), reviews)(mutationRequest('/x', candidateCommand), context(candidateId));
    const incident = await incidentOpenHandler(new StaticAuth({ userId: candidateId }), reviews)(mutationRequest('/x', incidentCommand));
    const disclosure = await indicatorDisclosureHandler(new StaticAuth({ userId: candidateId }), reviews)(mutationRequest('/x', disclosureCommand), context(indicatorId));

    expect(candidate.status).toBe(200);
    expect(incident.status).toBe(200);
    expect(disclosure.status).toBe(200);
    expect(await candidate.json()).toEqual({ ok: true, data: candidateReceipt, meta: { requestId, nextCursor: null } });
    expect(await incident.json()).toEqual({ ok: true, data: incidentReceipt, meta: { requestId, nextCursor: null } });
    expect(await disclosure.json()).toEqual({ ok: true, data: disclosureReceipt, meta: { requestId, nextCursor: null } });
    expect(reviews.calls.map((call) => call.operation)).toEqual(['reviewCandidate', 'openIncident', 'setIndicatorDisclosure']);
  });

  it.each([
    ['security_reviewer_required', 403, 'security_reviewer_required'],
    ['security_candidate_not_reviewable', 400, 'invalid_request'],
    ['security_version_conflict', 409, 'security_version_conflict'],
    ['security_idempotency_conflict', 409, 'security_idempotency_conflict'],
    ['security_persistence_failed', 500, 'security_persistence_failed'],
  ])('maps mutation repository code %s to stable HTTP %s', async (repositoryCode, status, code) => {
    const response = await candidateReviewHandler(new StaticAuth({ userId: candidateId }), new RejectingSecurityReviews(repositoryCode))(
      mutationRequest('/x', candidateCommand), context(candidateId),
    );
    await expectError(response, status, code, code === 'invalid_request' ? 'The request is invalid.' : messageFor(code));
  });

  it('maps verifier failure to 500 without validating an invalid body', async () => {
    const response = await candidateReviewHandler(new ThrowingAuth(), new RecordingSecurityReviews())(
      mutationRequest('/x', { secret: 'do-not-parse' }), context('not-a-uuid'),
    );
    await expectError(response, 500, 'security_persistence_failed', 'Security review could not be completed.');
  });

  it('serves public blocked projects without authentication using only the anon-safe repository', async () => {
    const publicSecurity = new RecordingPublicSecurity();
    const response = await createSecurityPublicBlockedProjectsHandler({
      publicSecurity, ids: { generate: () => requestId },
    })(new Request(`http://local/api/v1/security/blocked-projects?cursor=${publicCursor}&limit=1`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { items: [], nextCursor: null }, meta: { requestId, nextCursor: null } });
    expect(publicSecurity.calls).toEqual([{ cursor: publicCursor, limit: 1 }]);
  });
});

const candidateReceipt = { version: 1, commandId, candidateId, candidateVersion: 2, decisionId, state: 'rejected', indicatorId: null, incidentId: null, replayed: false } as const;
const incidentReceipt = { version: 1, commandId, incidentId, incidentVersion: 1, decisionId, state: 'active', posture: 'blocked', replayed: false } as const;
const disclosureReceipt = { version: 1, commandId, indicatorId, indicatorVersion: 2, decision: 'publish', publicSafe: true, replayed: false } as const;

function candidateListHandler(auth: AuthenticatedUserVerifier, reviews: SecurityReviewRepository) { return createSecurityCandidateListHandler({ auth, reviews, publicSecurity: new RecordingPublicSecurity(), ids: { generate: () => requestId } }); }
function candidateDetailHandler(auth: AuthenticatedUserVerifier, reviews: SecurityReviewRepository) { return createSecurityCandidateDetailHandler({ auth, reviews, publicSecurity: new RecordingPublicSecurity(), ids: { generate: () => requestId } }); }
function candidateReviewHandler(auth: AuthenticatedUserVerifier, reviews: SecurityReviewRepository) { return createSecurityCandidateReviewHandler({ auth, reviews, publicSecurity: new RecordingPublicSecurity(), ids: { generate: () => requestId } }); }
function incidentListHandler(auth: AuthenticatedUserVerifier, reviews: SecurityReviewRepository) { return createSecurityIncidentListHandler({ auth, reviews, publicSecurity: new RecordingPublicSecurity(), ids: { generate: () => requestId } }); }
function incidentOpenHandler(auth: AuthenticatedUserVerifier, reviews: SecurityReviewRepository) { return createSecurityIncidentOpenHandler({ auth, reviews, publicSecurity: new RecordingPublicSecurity(), ids: { generate: () => requestId } }); }
function incidentDetailHandler(auth: AuthenticatedUserVerifier, reviews: SecurityReviewRepository) { return createSecurityIncidentDetailHandler({ auth, reviews, publicSecurity: new RecordingPublicSecurity(), ids: { generate: () => requestId } }); }
function indicatorDisclosureHandler(auth: AuthenticatedUserVerifier, reviews: SecurityReviewRepository) { return createSecurityIndicatorDisclosureHandler({ auth, reviews, publicSecurity: new RecordingPublicSecurity(), ids: { generate: () => requestId } }); }
function request(path: string, method: string, authorization: string | null = `Bearer ${accessToken}`) { const headers = new Headers(); if (authorization !== null) headers.set('authorization', authorization); return new Request(`http://local${path}`, { method, headers }); }
function mutationRequest(path: string, body: unknown) { const result = request(path, 'POST'); result.headers.set('content-type', 'application/json'); result.headers.set('idempotency-key', 'security-command-1'); return new Request(result, { body: JSON.stringify(body) }); }
function invalidMutationRequest(path: string, body: unknown) { const result = request(path, 'POST'); result.headers.set('content-type', 'application/json'); result.headers.set('idempotency-key', ' '); return new Request(result, { body: JSON.stringify(body) }); }
function context(value: string) { return { params: Promise.resolve({ candidateId: value, incidentId: value, indicatorId: value }) }; }
async function expectError(response: Response, status: number, code: string, message: string) { expect(response.status).toBe(status); expect(await response.json()).toEqual({ ok: false, error: { code, message, requestId, details: null } }); }
function messageFor(code: string) { if (code === 'security_reviewer_required') return 'Reviewer access is required.'; if (code === 'security_version_conflict') return 'The security record has changed.'; if (code === 'security_idempotency_conflict') return 'The idempotency key conflicts with a prior security command.'; return 'Security review could not be completed.'; }

class StaticAuth implements AuthenticatedUserVerifier { constructor(private readonly result: { userId: string } | null, private readonly events?: string[]) {} async verifyAuthorizationHeader() { this.events?.push('auth'); return this.result; } }
class ThrowingAuth implements AuthenticatedUserVerifier { async verifyAuthorizationHeader(): Promise<never> { throw new Error('secret'); } }
class RecordingPublicSecurity implements SecurityPublicRepository { readonly calls: Array<{ cursor: string | null; limit: number }> = []; async listBlockedProjects(input: { cursor: string | null; limit: number }) { this.calls.push(input); return { items: [], nextCursor: null }; } async getProjectSecurity(): Promise<never> { throw new Error('not used'); } }
class RecordingSecurityReviews implements SecurityReviewRepository {
  readonly calls: Array<{ operation: string; input: unknown }> = []; constructor(private readonly events?: string[]) {}
  async listCandidates(input: { accessToken: string; query: SecurityCandidateListQuery }): Promise<SecurityCandidateListResult> { this.events?.push('repository'); this.calls.push({ operation: 'listCandidates', input }); return { version: 1, items: [], nextCursor: null }; }
  async getCandidate(input: { accessToken: string; candidateId: string }): Promise<never> { this.calls.push({ operation: 'getCandidate', input }); throw new Error('not configured'); }
  async submitManualCandidate(input: { accessToken: string; idempotencyKey: string; command: ManualSecurityCandidateCommandV1 }) { this.calls.push({ operation: 'submitManualCandidate', input }); return candidateReceipt; }
  async reviewCandidate(input: { accessToken: string; candidateId: string; idempotencyKey: string; command: SecurityCandidateReviewCommandV1 }) { this.calls.push({ operation: 'reviewCandidate', input }); return candidateReceipt; }
  async listIncidents(input: { accessToken: string; query: SecurityIncidentListQuery }): Promise<SecurityIncidentListResult> { this.calls.push({ operation: 'listIncidents', input }); return { version: 1, items: [], nextCursor: null }; }
  async getIncident(input: { accessToken: string; incidentId: string }): Promise<never> { this.calls.push({ operation: 'getIncident', input }); throw new Error('not configured'); }
  async openIncident(input: { accessToken: string; idempotencyKey: string; command: Extract<SecurityIncidentCommandV1, { action: 'open' }> }) { this.calls.push({ operation: 'openIncident', input }); return incidentReceipt; }
  async commandIncident(input: { accessToken: string; incidentId: string; idempotencyKey: string; command: Exclude<SecurityIncidentCommandV1, { action: 'open' }> }) { this.calls.push({ operation: 'commandIncident', input }); return incidentReceipt; }
  async setIndicatorDisclosure(input: { accessToken: string; indicatorId: string; idempotencyKey: string; command: SecurityIndicatorDisclosureCommandV1 }) { this.calls.push({ operation: 'setIndicatorDisclosure', input }); return disclosureReceipt; }
}
class RejectingSecurityReviews extends RecordingSecurityReviews { constructor(private readonly code: string) { super(); } override async reviewCandidate(): Promise<never> { throw { code: this.code }; } override async getCandidate(): Promise<never> { throw { code: this.code }; } override async getIncident(): Promise<never> { throw { code: this.code }; } }
