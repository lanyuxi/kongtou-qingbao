import type { SecurityCandidateReviewCommandV1 } from '@airdrop/contracts';
import { describe, expect, it } from 'vitest';

import { createSecurityReviewApiClient } from '../lib/security-review-api-client.js';
import type { ReviewSessionController } from '../lib/review-session.js';

const candidateId = 'a1000000-0000-4000-8000-000000000001';
const command: SecurityCandidateReviewCommandV1 = { version: 1, candidateId, expectedCandidateVersion: 1, decision: 'reject', reasonCode: 'claim_not_supported', note: null };
const requestId = 'a1000000-0000-4000-8000-000000000002';
const result = { version: 1, commandId: 'a1000000-0000-4000-8000-000000000003', candidateId, candidateVersion: 2, decisionId: 'a1000000-0000-4000-8000-000000000004', state: 'rejected', indicatorId: null, incidentId: null, replayed: false };

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
});
function success(data: unknown) { return Response.json({ ok: true, data, meta: { requestId, nextCursor: null } }); }
function error(status: number, code: string) { return Response.json({ ok: false, error: { code, message: 'secret', requestId, details: null } }, { status }); }
function session(getAccessToken: () => string | null): ReviewSessionController { return { signIn: async () => ({ ok: true }), getAccessToken: async () => getAccessToken(), signOut: async () => undefined }; }
