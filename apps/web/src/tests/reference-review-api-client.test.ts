import type {
  DecideDomainAuthorityCommandV1,
  DecideReferenceCommandV1,
  RegisterDomainAuthorityCommandV1,
  RegisterReferenceCommandV1,
} from '@airdrop/contracts';
import { describe, expect, it } from 'vitest';

import { createReferenceReviewApiClient } from '../lib/reference-review-api-client.js';

const projectId = 'b1000000-0000-4000-8000-000000000001';
const referenceId = 'b1000000-0000-4000-8000-000000000011';
const authorityId = 'b1000000-0000-4000-8000-000000000021';
const evidenceId = 'b1000000-0000-4000-8000-000000000031';
const commandId = 'b1000000-0000-4000-8000-000000000041';
const requestId = 'b1000000-0000-4000-8000-000000000061';
const accessToken = 'reference-browser-token';

const registerReference: RegisterReferenceCommandV1 = {
  version: 1, projectId, kind: 'official_site', url: 'https://example.com/claim',
  label: 'Official claim portal', evidenceId, note: null,
};
const decideReference: DecideReferenceCommandV1 = {
  version: 1, referenceId, expectedVersion: 2, decision: 'verify',
  reasonCode: 'evidence_verified', evidenceId, note: null,
};
const registerAuthority: RegisterDomainAuthorityCommandV1 = {
  version: 1, projectId, domain: 'example.com', evidenceId, note: null,
};
const decideAuthority: DecideDomainAuthorityCommandV1 = {
  version: 1, authorityId, expectedVersion: 1, decision: 'grant',
  reasonCode: 'official_announcement', evidenceId, note: null,
};
const referenceListData = { version: 1 as const, items: [] };
const referenceReceipt = {
  version: 1 as const, commandId, referenceId, referenceVersion: 2, state: 'verified' as const, replayed: false,
};

describe('reference review browser client', () => {
  it('requests a fresh access token and a fresh idempotency key on every call', async () => {
    const harness = new Harness();
    const client = createReferenceReviewApiClient(harness.dependencies());

    await client.listReferences({ projectId, state: 'candidate', cursor: null, limit: 25 });
    await client.registerReference(registerReference);
    await client.decideReference(referenceId, decideReference);

    expect(harness.sessionCalls).toBe(3);
    expect(harness.idempotencyKeys).toEqual(['key-1', 'key-2']);
    expect(harness.requests.map((entry) => entry.authorization)).toEqual([
      `Bearer ${accessToken}`,
      `Bearer ${accessToken}`,
      `Bearer ${accessToken}`,
    ]);
    expect(harness.requests.map((entry) => entry.idempotencyKey)).toEqual([null, 'key-1', 'key-2']);
  });

  it('never retries a version conflict and reports it as a typed conflict', async () => {
    const harness = new Harness(() => errorResponse(409, 'reference_version_conflict'));
    const client = createReferenceReviewApiClient(harness.dependencies());

    const result = await client.decideReference(referenceId, decideReference);

    expect(result).toEqual({ ok: false, state: 'conflict', code: 'reference_version_conflict' });
    expect(harness.fetchCalls).toBe(1);
  });

  it('never retries an idempotency conflict and reports it as a typed conflict', async () => {
    const harness = new Harness(() => errorResponse(409, 'reference_idempotency_conflict'));
    const client = createReferenceReviewApiClient(harness.dependencies());

    const result = await client.registerDomainAuthority(registerAuthority);

    expect(result).toEqual({ ok: false, state: 'conflict', code: 'reference_idempotency_conflict' });
    expect(harness.fetchCalls).toBe(1);
  });

  it.each([
    [401, 'unauthorized', { ok: false, state: 'sign_in_required' }],
    [403, 'reference_reviewer_required', { ok: false, state: 'forbidden' }],
    [404, 'reference_not_found', { ok: false, state: 'not_found' }],
    [404, 'domain_authority_not_found', { ok: false, state: 'not_found' }],
    [400, 'invalid_request', { ok: false, state: 'request_failed' }],
    [500, 'reference_persistence_failed', { ok: false, state: 'request_failed' }],
    [409, 'unexpected_code', { ok: false, state: 'request_failed' }],
  ])('maps HTTP %s with %s to a stable failure state', async (status, code, expected) => {
    const harness = new Harness(() => errorResponse(status, code));
    const client = createReferenceReviewApiClient(harness.dependencies());

    expect(await client.decideDomainAuthority(authorityId, decideAuthority)).toEqual(expected);
  });

  it('returns the parsed reference list payload with its cursor', async () => {
    const harness = new Harness(() =>
      Response.json({
        ok: true,
        data: referenceListData,
        meta: { requestId, nextCursor: 'next-page-cursor' },
      }),
    );
    const client = createReferenceReviewApiClient(harness.dependencies());

    const result = await client.listReferences({ projectId, state: 'all', cursor: null, limit: 25 });

    expect(result).toEqual({ ok: true, data: referenceListData, nextCursor: 'next-page-cursor' });
    expect(harness.requests[0]?.url).toBe(
      '/api/v1/review/references?projectId=b1000000-0000-4000-8000-000000000001&state=all&limit=25',
    );
  });

  it('returns the parsed receipt for a successful decide', async () => {
    const harness = new Harness(() =>
      Response.json({ ok: true, data: referenceReceipt, meta: { requestId, nextCursor: null } }),
    );
    const client = createReferenceReviewApiClient(harness.dependencies());

    expect(await client.decideReference(referenceId, decideReference)).toEqual({
      ok: true,
      data: referenceReceipt,
      nextCursor: null,
    });
    expect(harness.requests[0]?.url).toBe(`/api/v1/review/references/${referenceId}/decisions`);
  });

  it('omits null query values instead of sending them as text', async () => {
    const harness = new Harness();
    const client = createReferenceReviewApiClient(harness.dependencies());

    await client.listDomainAuthorities({ projectId: null, state: 'granted', cursor: null, limit: 50 });

    expect(harness.requests[0]?.url).toBe(
      '/api/v1/review/references/authorities?state=granted&limit=50',
    );
  });

  it.each([
    ['list references', (client: ReturnType<typeof createReferenceReviewApiClient>) => client.listReferences({ projectId: 'not-a-uuid', state: 'all', cursor: null, limit: 25 })],
    ['get reference', (client: ReturnType<typeof createReferenceReviewApiClient>) => client.getReference('not-a-uuid')],
    ['get authority', (client: ReturnType<typeof createReferenceReviewApiClient>) => client.getDomainAuthority('not-a-uuid')],
    ['decide reference', (client: ReturnType<typeof createReferenceReviewApiClient>) => client.decideReference('not-a-uuid', decideReference)],
    ['decide authority', (client: ReturnType<typeof createReferenceReviewApiClient>) => client.decideDomainAuthority('not-a-uuid', decideAuthority)],
    ['register reference', (client: ReturnType<typeof createReferenceReviewApiClient>) => client.registerReference({ ...registerReference, url: 'http://example.com' })],
    ['register authority', (client: ReturnType<typeof createReferenceReviewApiClient>) => client.registerDomainAuthority({ ...registerAuthority, domain: 'https://example.com' })],
  ])('never sends %s with an invalid input', async (_name, invoke) => {
    const harness = new Harness();
    const result = await invoke(createReferenceReviewApiClient(harness.dependencies()));

    expect(result).toEqual({ ok: false, state: 'request_failed' });
    expect(harness.fetchCalls).toBe(0);
  });

  it('rejects a decide command whose identifier disagrees with the path', async () => {
    const harness = new Harness();
    const client = createReferenceReviewApiClient(harness.dependencies());

    expect(
      await client.decideReference(authorityId, decideReference),
    ).toEqual({ ok: false, state: 'request_failed' });
    expect(
      await client.decideDomainAuthority(referenceId, decideAuthority),
    ).toEqual({ ok: false, state: 'request_failed' });
    expect(harness.fetchCalls).toBe(0);
  });

  it('reports a missing session as sign-in required without any request', async () => {
    const harness = new Harness(undefined, null);
    const client = createReferenceReviewApiClient(harness.dependencies());

    expect(await client.listReferences({ projectId, state: 'all', cursor: null, limit: 25 })).toEqual({
      ok: false,
      state: 'sign_in_required',
    });
    expect(harness.fetchCalls).toBe(0);
  });

  it('fails closed when the idempotency key source throws', async () => {
    const harness = new Harness();
    harness.ids = { generate() { throw new Error('no entropy'); } };
    const client = createReferenceReviewApiClient(harness.dependencies());

    expect(await client.registerReference(registerReference)).toEqual({
      ok: false,
      state: 'request_failed',
    });
    expect(harness.fetchCalls).toBe(0);
  });

  it('fails closed on a non-JSON or malformed success payload', async () => {
    const invalidJson = new Harness(() => new Response('not json', { status: 200 }));
    expect(
      await createReferenceReviewApiClient(invalidJson.dependencies()).getReference(referenceId),
    ).toEqual({ ok: false, state: 'request_failed' });

    const wrongShape = new Harness(() => Response.json({ ok: true, data: { unexpected: true }, meta: { requestId, nextCursor: null } }));
    expect(
      await createReferenceReviewApiClient(wrongShape.dependencies()).getReference(referenceId),
    ).toEqual({ ok: false, state: 'request_failed' });

    const notAnError = new Harness(() => Response.json({ ok: false, error: { code: '' } }, { status: 400 }));
    expect(
      await createReferenceReviewApiClient(notAnError.dependencies()).getReference(referenceId),
    ).toEqual({ ok: false, state: 'request_failed' });
  });
});

function errorResponse(status: number, code: string): Response {
  return Response.json(
    { ok: false, error: { code, message: 'Fixture failure.', requestId, details: null } },
    { status },
  );
}

class Harness {
  sessionCalls = 0;
  fetchCalls = 0;
  idempotencyKeys: string[] = [];
  requests: Array<{ url: string; authorization: string | null; idempotencyKey: string | null }> = [];
  ids: { generate(): string } = { generate: () => `key-${this.idempotencyKeys.length + 1}` };

  constructor(
    private readonly respond: () => Response = () =>
      Response.json({
        ok: true,
        data: referenceListData,
        meta: { requestId, nextCursor: null },
      }),
    private readonly token: string | null = accessToken,
  ) {}

  dependencies() {
    return {
      session: {
        getAccessToken: async () => {
          this.sessionCalls += 1;
          return this.token;
        },
      },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        this.fetchCalls += 1;
        const headers = new Headers(init?.headers);
        const key = headers.get('idempotency-key');
        if (key !== null) this.idempotencyKeys.push(key);
        this.requests.push({
          url: String(input),
          authorization: headers.get('authorization'),
          idempotencyKey: key,
        });
        return this.respond();
      },
      ids: { generate: () => this.ids.generate() },
    } as unknown as Parameters<typeof createReferenceReviewApiClient>[0];
  }
}
