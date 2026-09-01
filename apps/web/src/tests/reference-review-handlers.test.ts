import type {
  DecideDomainAuthorityCommandV1,
  DecideReferenceCommandV1,
  DomainAuthorityReviewListQuery,
  RegisterDomainAuthorityCommandV1,
  RegisterReferenceCommandV1,
  ReferenceReviewListQuery,
  ReviewerDomainAuthorityDetail,
  ReviewerReferenceDetail,
  ReviewerDomainAuthorityListItem,
  ReviewerReferenceListItem,
} from '@airdrop/contracts';
import type { ReferencePublicRepository } from '@airdrop/database';
import type {
  DomainAuthorityReviewListResult,
  ReferenceReviewListResult,
  ReferenceReviewRepository,
} from '@airdrop/database/reference-review';
import { describe, expect, it } from 'vitest';

import type { AuthenticatedUserVerifier } from '../lib/reference-review-handlers.js';
import {
  createDomainAuthorityDecideHandler,
  createDomainAuthorityDetailHandler,
  createDomainAuthorityListHandler,
  createDomainAuthorityRegisterHandler,
  createPublicReferencesHandler,
  createReferenceDecideHandler,
  createReferenceDetailHandler,
  createReferenceListHandler,
  createReferenceRegisterHandler,
} from '../lib/reference-review-handlers.js';

const projectId = 'b1000000-0000-4000-8000-000000000001';
const referenceId = 'b1000000-0000-4000-8000-000000000011';
const authorityId = 'b1000000-0000-4000-8000-000000000021';
const evidenceId = 'b1000000-0000-4000-8000-000000000031';
const commandId = 'b1000000-0000-4000-8000-000000000041';
const decisionId = 'b1000000-0000-4000-8000-000000000051';
const requestId = 'b1000000-0000-4000-8000-000000000061';
const accessToken = 'reference-review-token';
const updatedAt = '2026-08-30T04:00:00.000Z';
const reviewReferenceCursor =
  'eyJ1cGRhdGVkQXQiOiIyMDI2LTA4LTMwVDA0OjAwOjAwLjAwMFoiLCJyZWZlcmVuY2VJZCI6ImIxMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAxMSJ9';
const reviewAuthorityCursor =
  'eyJ1cGRhdGVkQXQiOiIyMDI2LTA4LTMwVDA0OjAwOjAwLjAwMFoiLCJhdXRob3JpdHlJZCI6ImIxMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAyMSJ9';
const publicCursor =
  'eyJsYXN0VmVyaWZpZWRBdCI6IjIwMjYtMDgtMzBUMDQ6MDA6MDAuMDAwWiIsInJlZmVyZW5jZUlkIjoiYjEwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDExIn0';

const registerReference: RegisterReferenceCommandV1 = {
  version: 1,
  projectId,
  kind: 'official_site',
  url: 'https://example.com/claim',
  label: 'Official claim portal',
  evidenceId,
  note: null,
};
const decideReference: DecideReferenceCommandV1 = {
  version: 1,
  referenceId,
  expectedVersion: 2,
  decision: 'verify',
  reasonCode: 'evidence_verified',
  evidenceId,
  note: null,
};
const registerAuthority: RegisterDomainAuthorityCommandV1 = {
  version: 1,
  projectId,
  domain: 'example.com',
  evidenceId,
  note: null,
};
const decideAuthority: DecideDomainAuthorityCommandV1 = {
  version: 1,
  authorityId,
  expectedVersion: 1,
  decision: 'grant',
  reasonCode: 'official_announcement',
  evidenceId,
  note: null,
};

const referenceItem: ReviewerReferenceListItem = {
  referenceId, projectId, kind: 'official_site', label: 'Official claim portal',
  url: 'https://example.com/claim', state: 'candidate', lastVerifiedAt: null,
  activeIndicatorId: null, version: 1, referenceVersion: 1, updatedAt,
};
const authorityItem: ReviewerDomainAuthorityListItem = {
  authorityId, projectId, domain: 'example.com', state: 'candidate',
  version: 1, authorityVersion: 1, updatedAt,
};
const referenceDetail: ReviewerReferenceDetail = {
  ...referenceItem,
  domainAuthority: {
    authorityId, domain: 'example.com', state: 'granted', authorityVersion: 2,
  },
  decisions: [{
    decisionId, decision: 'register', resultingState: 'candidate',
    reasonCode: 'insufficient_context', evidenceId, note: null, createdAt: updatedAt,
  }],
};
const authorityDetail: ReviewerDomainAuthorityDetail = {
  ...authorityItem,
  decisions: [{
    decisionId, decision: 'register', resultingState: 'candidate',
    reasonCode: 'insufficient_context', evidenceId, note: null, createdAt: updatedAt,
  }],
};
const referenceReceipt = {
  version: 1 as const, commandId, referenceId, referenceVersion: 2, state: 'verified' as const, replayed: false,
};
const authorityReceipt = {
  version: 1 as const, commandId, authorityId, authorityVersion: 2, state: 'granted' as const, replayed: false,
};

describe('reference review BFF handlers', () => {
  it('authenticates before reference query validation and never reaches the repository', async () => {
    const reviews = new RecordingReviews();
    const response = await referenceListHandler(new StaticAuth(null), reviews)(
      request('/api/v1/review/references?unknown=value', 'GET'),
    );

    await expectError(response, 401, 'unauthorized', 'Authentication is required.');
    expect(reviews.calls).toEqual([]);
  });

  it.each([
    ['missing authorization', null],
    ['Basic authorization', 'Basic abc'],
    ['lower-case bearer', `bearer ${accessToken}`],
  ])('rejects %s with the shared unauthorized envelope', async (_name, authorization) => {
    const response = await referenceListHandler(new StaticAuth({ userId: projectId }), new RecordingReviews())(
      request('/api/v1/review/references', 'GET', authorization),
    );
    await expectError(response, 401, 'unauthorized', 'Authentication is required.');
  });

  it.each([
    ['unknown reference query', 'foo=bar', 'invalid_request'],
    ['repeated reference query', 'state=candidate&state=verified', 'invalid_request'],
    ['malformed reference cursor', 'cursor=bad', 'invalid_cursor'],
    ['noninteger reference limit', 'limit=1.5', 'invalid_request'],
    ['malformed reference projectId', 'projectId=nope', 'invalid_request'],
  ])('rejects %s after authentication without querying', async (_name, query, code) => {
    const reviews = new RecordingReviews();
    const response = await referenceListHandler(new StaticAuth({ userId: projectId }), reviews)(
      request(`/api/v1/review/references?${query}`, 'GET'),
    );
    await expectError(response, 400, code, code === 'invalid_cursor' ? 'The cursor is invalid.' : 'The request is invalid.');
    expect(reviews.calls).toEqual([]);
  });

  it.each([
    ['unknown authority query', 'foo=bar', 'invalid_request'],
    ['malformed authority cursor', 'cursor=bad', 'invalid_cursor'],
    ['noninteger authority limit', 'limit=0', 'invalid_request'],
  ])('rejects %s after authentication without querying', async (_name, query, code) => {
    const reviews = new RecordingReviews();
    const response = await authorityListHandler(new StaticAuth({ userId: projectId }), reviews)(
      request(`/api/v1/review/references/authorities?${query}`, 'GET'),
    );
    await expectError(response, 400, code, code === 'invalid_cursor' ? 'The cursor is invalid.' : 'The request is invalid.');
    expect(reviews.calls).toEqual([]);
  });

  it('passes the bearer token through and returns strict list envelopes', async () => {
    const reviews = new RecordingReviews();
    const references = await referenceListHandler(new StaticAuth({ userId: projectId }), reviews)(
      request(`/api/v1/review/references?projectId=${projectId}&state=candidate&cursor=${reviewReferenceCursor}&limit=1`, 'GET'),
    );
    const authorities = await authorityListHandler(new StaticAuth({ userId: projectId }), reviews)(
      request(`/api/v1/review/references/authorities?projectId=${projectId}&state=granted&cursor=${reviewAuthorityCursor}&limit=1`, 'GET'),
    );

    expect(await references.json()).toEqual({
      ok: true,
      data: { version: 1, items: [referenceItem] },
      meta: { requestId, nextCursor: null },
    });
    expect(await authorities.json()).toEqual({
      ok: true,
      data: { version: 1, items: [authorityItem] },
      meta: { requestId, nextCursor: null },
    });
    expect(reviews.calls).toEqual([
      {
        operation: 'listReferences',
        input: {
          accessToken,
          query: { projectId, state: 'candidate', cursor: reviewReferenceCursor, limit: 1 },
        },
      },
      {
        operation: 'listDomainAuthorities',
        input: {
          accessToken,
          query: { projectId, state: 'granted', cursor: reviewAuthorityCursor, limit: 1 },
        },
      },
    ]);
  });

  it('returns strict detail envelopes and rejects a non-UUID path parameter', async () => {
    const reviews = new RecordingReviews();
    const reference = await referenceDetailHandler(new StaticAuth({ userId: projectId }), reviews)(request('/x', 'GET'), context(referenceId));
    const authority = await authorityDetailHandler(new StaticAuth({ userId: projectId }), reviews)(request('/x', 'GET'), context(authorityId));

    expect(await reference.json()).toEqual({ ok: true, data: referenceDetail, meta: { requestId, nextCursor: null } });
    expect(await authority.json()).toEqual({ ok: true, data: authorityDetail, meta: { requestId, nextCursor: null } });

    const malformed = await referenceDetailHandler(new StaticAuth({ userId: projectId }), reviews)(request('/x', 'GET'), context('not-a-uuid'));
    await expectError(malformed, 400, 'invalid_request', 'The request is invalid.');
    expect(reviews.calls.map((call) => call.operation)).toEqual(['getReference', 'getDomainAuthority']);
  });

  it('routes register commands once with a fresh idempotency key per request', async () => {
    const reviews = new RecordingReviews();
    const reference = await referenceRegisterHandler(new StaticAuth({ userId: projectId }), reviews)(mutationRequest('/x', registerReference, 'register-reference-1'));
    const authority = await authorityRegisterHandler(new StaticAuth({ userId: projectId }), reviews)(mutationRequest('/x', registerAuthority, 'register-authority-1'));

    expect(await reference.json()).toEqual({ ok: true, data: referenceReceipt, meta: { requestId, nextCursor: null } });
    expect(await authority.json()).toEqual({ ok: true, data: authorityReceipt, meta: { requestId, nextCursor: null } });
    expect(reviews.calls).toEqual([
      { operation: 'registerReference', input: { accessToken, idempotencyKey: 'register-reference-1', command: registerReference } },
      { operation: 'registerDomainAuthority', input: { accessToken, idempotencyKey: 'register-authority-1', command: registerAuthority } },
    ]);
  });

  it('routes decide commands bound to the path identifier', async () => {
    const reviews = new RecordingReviews();
    const reference = await referenceDecideHandler(new StaticAuth({ userId: projectId }), reviews)(mutationRequest('/x', decideReference), context(referenceId));
    const authority = await authorityDecideHandler(new StaticAuth({ userId: projectId }), reviews)(mutationRequest('/x', decideAuthority), context(authorityId));

    expect(await reference.json()).toEqual({ ok: true, data: referenceReceipt, meta: { requestId, nextCursor: null } });
    expect(await authority.json()).toEqual({ ok: true, data: authorityReceipt, meta: { requestId, nextCursor: null } });
    expect(reviews.calls).toEqual([
      { operation: 'decideReference', input: { accessToken, referenceId, idempotencyKey: 'reference-command-1', command: decideReference } },
      { operation: 'decideDomainAuthority', input: { accessToken, authorityId, idempotencyKey: 'reference-command-1', command: decideAuthority } },
    ]);
  });

  it.each([
    ['reference register', (reviews: ReferenceReviewRepository) => referenceRegisterHandler(new StaticAuth({ userId: projectId }), reviews)(invalidMutationRequest('/x', registerReference))],
    ['reference decide', (reviews: ReferenceReviewRepository) => referenceDecideHandler(new StaticAuth({ userId: projectId }), reviews)(invalidMutationRequest('/x', decideReference), context(referenceId))],
    ['authority register', (reviews: ReferenceReviewRepository) => authorityRegisterHandler(new StaticAuth({ userId: projectId }), reviews)(invalidMutationRequest('/x', registerAuthority))],
    ['authority decide', (reviews: ReferenceReviewRepository) => authorityDecideHandler(new StaticAuth({ userId: projectId }), reviews)(invalidMutationRequest('/x', decideAuthority), context(authorityId))],
  ])('requires a valid idempotency key for %s after authentication', async (_name, invoke) => {
    // Mirrors the security precedent: an invalid key is a value the repository
    // boundary rejects, not an absent header.

    const reviews = new RecordingReviews();
    const response = await invoke(reviews);
    await expectError(response, 400, 'invalid_request', 'The request is invalid.');
    expect(reviews.calls).toEqual([]);
  });

  it.each([
    ['reference register', (reviews: ReferenceReviewRepository) => referenceRegisterHandler(new StaticAuth({ userId: projectId }), reviews)(mutationRequest('/x', { malformed: true }))],
    ['reference decide', (reviews: ReferenceReviewRepository) => referenceDecideHandler(new StaticAuth({ userId: projectId }), reviews)(mutationRequest('/x', { malformed: true }), context(referenceId))],
    ['authority register', (reviews: ReferenceReviewRepository) => authorityRegisterHandler(new StaticAuth({ userId: projectId }), reviews)(mutationRequest('/x', { malformed: true }))],
    ['authority decide', (reviews: ReferenceReviewRepository) => authorityDecideHandler(new StaticAuth({ userId: projectId }), reviews)(mutationRequest('/x', { malformed: true }), context(authorityId))],
  ])('rejects a malformed body for %s before repository access', async (_name, invoke) => {
    const reviews = new RecordingReviews();
    const response = await invoke(reviews);
    await expectError(response, 400, 'invalid_request', 'The request is invalid.');
    expect(reviews.calls).toEqual([]);
  });

  it('rejects a decide body whose identifier disagrees with the path', async () => {
    const reviews = new RecordingReviews();
    const response = await referenceDecideHandler(new StaticAuth({ userId: projectId }), reviews)(
      mutationRequest('/x', { ...decideReference, referenceId: authorityId }),
      context(referenceId),
    );
    await expectError(response, 400, 'invalid_request', 'The request is invalid.');
    expect(reviews.calls).toEqual([]);
  });

  it.each([
    ['reference_reviewer_required', 403, 'reference_reviewer_required', 'Reviewer access is required.'],
    ['reference_not_found', 404, 'reference_not_found', 'The requested reference record was not found.'],
    ['domain_authority_not_found', 404, 'domain_authority_not_found', 'The requested reference record was not found.'],
    ['reference_not_decidable', 400, 'invalid_request', 'The request is invalid.'],
    ['reference_command_invalid', 400, 'invalid_request', 'The request is invalid.'],
    ['reference_evidence_required', 400, 'invalid_request', 'The request is invalid.'],
    ['reference_normalization_invalid', 400, 'invalid_request', 'The request is invalid.'],
    ['reference_version_conflict', 409, 'reference_version_conflict', 'The reference record has changed.'],
    ['reference_idempotency_conflict', 409, 'reference_idempotency_conflict', 'The idempotency key conflicts with a prior reference command.'],
    ['reference_persistence_failed', 500, 'reference_persistence_failed', 'Reference review could not be completed.'],
  ])('maps repository code %s to stable HTTP %s', async (code, status, expected, message) => {
    const response = await referenceDecideHandler(
      new StaticAuth({ userId: projectId }),
      new RejectingReviews(code),
    )(mutationRequest('/x', decideReference), context(referenceId));
    await expectError(response, status, expected, message);
  });

  it('maps verifier failure to 500 without validating an invalid body', async () => {
    const response = await referenceDecideHandler(new ThrowingAuth(), new RecordingReviews())(
      mutationRequest('/x', { secret: 'do-not-parse' }),
      context('not-a-uuid'),
    );
    await expectError(response, 500, 'reference_persistence_failed', 'Reference review could not be completed.');
  });

  it('maps a query verifier failure to 500 without leaking the query', async () => {
    const reviews = new RecordingReviews();
    const response = await referenceListHandler(new ThrowingAuth(), reviews)(
      request('/api/v1/review/references?secret=do-not-parse', 'GET'),
    );
    await expectError(response, 500, 'reference_query_failed', 'Reference records could not be loaded.');
    expect(reviews.calls).toEqual([]);
  });
});

describe('public reference handler', () => {
  it('serves verified references without authentication using only the public repository', async () => {
    const publicReferences = new RecordingPublicReferences();
    const response = await createPublicReferencesHandler({
      publicReferences,
      ids: { generate: () => requestId },
    })(new Request(`http://local/api/v1/references?projectId=${projectId}&cursor=${publicCursor}&limit=1`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { items: [], nextCursor: null },
      meta: { requestId, nextCursor: null },
    });
    expect(publicReferences.calls).toEqual([{ projectId, cursor: publicCursor, limit: 1 }]);
  });

  it.each([
    ['malformed cursor', 'cursor=bad', 'invalid_cursor'],
    ['unknown query', 'foo=bar', 'invalid_request'],
    ['repeated query', 'limit=1&limit=2', 'invalid_request'],
    ['noninteger limit', 'limit=1.5', 'invalid_request'],
    ['malformed project scope', 'projectId=nope', 'invalid_request'],
  ])('rejects %s at the public boundary without repository access', async (_name, query, code) => {
    const publicReferences = new RecordingPublicReferences();
    const response = await createPublicReferencesHandler({
      publicReferences,
      ids: { generate: () => requestId },
    })(new Request(`http://local/api/v1/references?projectId=${projectId}&${query}`));

    await expectError(response, 400, code, code === 'invalid_cursor' ? 'The cursor is invalid.' : 'The request is invalid.');
    expect(publicReferences.calls).toEqual([]);
  });

  it('rejects a public read with no project scope at all', async () => {
    const publicReferences = new RecordingPublicReferences();
    const response = await createPublicReferencesHandler({
      publicReferences,
      ids: { generate: () => requestId },
    })(new Request('http://local/api/v1/references'));

    await expectError(response, 400, 'invalid_request', 'The request is invalid.');
    expect(publicReferences.calls).toEqual([]);
  });
});

function referenceListHandler(auth: AuthenticatedUserVerifier, reviews: ReferenceReviewRepository) {
  return createReferenceListHandler({ auth, reviews, publicReferences: new RecordingPublicReferences(), ids: { generate: () => requestId } });
}
function referenceDetailHandler(auth: AuthenticatedUserVerifier, reviews: ReferenceReviewRepository) {
  return createReferenceDetailHandler({ auth, reviews, publicReferences: new RecordingPublicReferences(), ids: { generate: () => requestId } });
}
function referenceRegisterHandler(auth: AuthenticatedUserVerifier, reviews: ReferenceReviewRepository) {
  return createReferenceRegisterHandler({ auth, reviews, publicReferences: new RecordingPublicReferences(), ids: { generate: () => requestId } });
}
function referenceDecideHandler(auth: AuthenticatedUserVerifier, reviews: ReferenceReviewRepository) {
  return createReferenceDecideHandler({ auth, reviews, publicReferences: new RecordingPublicReferences(), ids: { generate: () => requestId } });
}
function authorityListHandler(auth: AuthenticatedUserVerifier, reviews: ReferenceReviewRepository) {
  return createDomainAuthorityListHandler({ auth, reviews, publicReferences: new RecordingPublicReferences(), ids: { generate: () => requestId } });
}
function authorityDetailHandler(auth: AuthenticatedUserVerifier, reviews: ReferenceReviewRepository) {
  return createDomainAuthorityDetailHandler({ auth, reviews, publicReferences: new RecordingPublicReferences(), ids: { generate: () => requestId } });
}
function authorityRegisterHandler(auth: AuthenticatedUserVerifier, reviews: ReferenceReviewRepository) {
  return createDomainAuthorityRegisterHandler({ auth, reviews, publicReferences: new RecordingPublicReferences(), ids: { generate: () => requestId } });
}
function authorityDecideHandler(auth: AuthenticatedUserVerifier, reviews: ReferenceReviewRepository) {
  return createDomainAuthorityDecideHandler({ auth, reviews, publicReferences: new RecordingPublicReferences(), ids: { generate: () => requestId } });
}
function request(path: string, method: string, authorization: string | null = `Bearer ${accessToken}`) {
  const headers = new Headers();
  if (authorization !== null) headers.set('authorization', authorization);
  return new Request(`http://local${path}`, { method, headers });
}
function mutationRequest(path: string, body: unknown, idempotencyKey = 'reference-command-1') {
  const result = request(path, 'POST');
  result.headers.set('content-type', 'application/json');
  result.headers.set('idempotency-key', idempotencyKey);
  return new Request(result, { body: JSON.stringify(body) });
}
function invalidMutationRequest(path: string, body: unknown) {
  return mutationRequest(path, body, ' ');
}
function context(value: string) {
  return { params: Promise.resolve({ referenceId: value, authorityId: value }) };
}
async function expectError(response: Response, status: number, code: string, message: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ ok: false, error: { code, message, requestId, details: null } });
}

class StaticAuth implements AuthenticatedUserVerifier {
  constructor(private readonly result: { userId: string } | null) {}
  async verifyAuthorizationHeader() { return this.result; }
}
class ThrowingAuth implements AuthenticatedUserVerifier {
  async verifyAuthorizationHeader(): Promise<never> { throw new Error('secret'); }
}
class RecordingPublicReferences implements ReferencePublicRepository {
  readonly calls: Array<{ projectId: string; cursor: string | null; limit: number }> = [];
  async listVerifiedReferences(input: { projectId: string; cursor: string | null; limit: number }) {
    this.calls.push({ projectId: input.projectId, cursor: input.cursor, limit: input.limit });
    return { version: 1 as const, items: [], nextCursor: null };
  }
  async listGrantedDomainAuthorities(): Promise<never> { throw new Error('not used'); }
}
class RecordingReviews implements ReferenceReviewRepository {
  readonly calls: Array<{ operation: string; input: unknown }> = [];
  async listReferences(input: { accessToken: string; query: ReferenceReviewListQuery }): Promise<ReferenceReviewListResult> {
    this.calls.push({ operation: 'listReferences', input });
    return { version: 1, items: [referenceItem], nextCursor: null };
  }
  async listDomainAuthorities(input: { accessToken: string; query: DomainAuthorityReviewListQuery }): Promise<DomainAuthorityReviewListResult> {
    this.calls.push({ operation: 'listDomainAuthorities', input });
    return { version: 1, items: [authorityItem], nextCursor: null };
  }
  async getReference(input: { accessToken: string; referenceId: string }): Promise<ReviewerReferenceDetail> {
    this.calls.push({ operation: 'getReference', input });
    return referenceDetail;
  }
  async getDomainAuthority(input: { accessToken: string; authorityId: string }): Promise<ReviewerDomainAuthorityDetail> {
    this.calls.push({ operation: 'getDomainAuthority', input });
    return authorityDetail;
  }
  async registerReference(input: { accessToken: string; idempotencyKey: string; command: RegisterReferenceCommandV1 }) {
    this.calls.push({ operation: 'registerReference', input });
    return referenceReceipt;
  }
  async registerDomainAuthority(input: { accessToken: string; idempotencyKey: string; command: RegisterDomainAuthorityCommandV1 }) {
    this.calls.push({ operation: 'registerDomainAuthority', input });
    return authorityReceipt;
  }
  async decideReference(input: { accessToken: string; referenceId: string; idempotencyKey: string; command: DecideReferenceCommandV1 }) {
    this.calls.push({ operation: 'decideReference', input });
    return referenceReceipt;
  }
  async decideDomainAuthority(input: { accessToken: string; authorityId: string; idempotencyKey: string; command: DecideDomainAuthorityCommandV1 }) {
    this.calls.push({ operation: 'decideDomainAuthority', input });
    return authorityReceipt;
  }
}
class RejectingReviews extends RecordingReviews {
  constructor(private readonly code: string) { super(); }
  override async decideReference(): Promise<never> { throw { code: this.code }; }
}
