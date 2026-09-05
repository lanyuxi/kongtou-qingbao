import type {
  UserProfileRow,
  WalletAddressRow,
} from '@airdrop/contracts';
import { describe, expect, it } from 'vitest';

import {
  createIdentityApiClient,
  type IdentityApiClientDependencies,
  type IdentityProfileUpdateInput,
} from '../lib/identity-api-client.js';

const userId = '71000000-0000-4000-8000-000000000001';
const walletAddressId = '71000000-0000-4000-8000-000000000002';
const requestId = '71000000-0000-4000-8000-000000000003';
const commandId = '71000000-0000-4000-8000-000000000004';
const accessToken = 'identity-settings-token';
const address = '0x1111111111111111111111111111111111111111';

const profile: UserProfileRow = {
  userId,
  displayName: 'Alice',
  avatarUrl: 'https://example.test/alice.png',
  timezone: 'Asia/Shanghai',
  version: 4,
  updatedAt: '2026-09-05T00:00:00.000Z',
};

const wallet: WalletAddressRow = {
  walletAddressId,
  chain: 'evm',
  address,
  label: 'Main',
  visibility: 'hidden',
  version: 3,
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-05T00:00:00.000Z',
};

function envelope(data: unknown) {
  return { ok: true, data, meta: { requestId, nextCursor: null } };
}

function apiError(code: string, message: string) {
  return {
    ok: false,
    error: { code, message, requestId, details: null },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function dependencies(
  fetchImpl: IdentityApiClientDependencies['fetch'],
  options: { token?: string | null; keys?: readonly string[] } = {},
): IdentityApiClientDependencies {
  let index = 0;
  const keys = options.keys ?? ['identity-command-key'];
  return {
    session: { getAccessToken: async () => options.token === undefined ? accessToken : options.token },
    fetch: fetchImpl,
    ids: { generate: () => keys[index++] ?? 'identity-fallback-key' },
  };
}

describe('IdentityApiClient', () => {
  it('loads strict private projections with the active bearer', async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const client = createIdentityApiClient(dependencies(async (input, init) => {
      requests.push({ input, ...(init === undefined ? {} : { init }) });
      return jsonResponse(200, envelope(profile));
    }));

    await expect(client.getProfile()).resolves.toEqual({ ok: true, data: profile });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe('/api/v1/identity/profile');
    expect(new Headers(requests[0]?.init?.headers).get('authorization')).toBe(`Bearer ${accessToken}`);
  });

  it('requires a session without making a request', async () => {
    let requests = 0;
    const client = createIdentityApiClient(dependencies(async () => {
      requests += 1;
      return jsonResponse(200, envelope(profile));
    }, { token: null }));

    await expect(client.getProfile()).resolves.toEqual({ ok: false, code: 'identity_session_required' });
    expect(requests).toBe(0);
  });

  it('rejects malformed success projections as a bounded query failure', async () => {
    const client = createIdentityApiClient(dependencies(async () => jsonResponse(200, envelope({
      ...profile,
      email: 'must-not-leave-the-boundary@example.test',
    }))));

    await expect(client.getProfile()).resolves.toEqual({ ok: false, code: 'identity_query_failed' });
  });

  it('uses one generated idempotency key in the validated profile body and header', async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const client = createIdentityApiClient(dependencies(async (input, init) => {
      requests.push({ input, ...(init === undefined ? {} : { init }) });
      return jsonResponse(200, envelope({
        version: 1,
        commandId,
        replayed: false,
        profileId: userId,
        profileVersion: 5,
      }));
    }, { keys: ['profile-command-key'] }));

    const result = await client.updateProfile({
      expectedVersion: profile.version,
      displayName: 'Alice Updated',
      avatarUrl: null,
      timezone: 'UTC',
    });

    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe('/api/v1/identity/profile');
    expect(requests[0]?.init?.method).toBe('PATCH');
    expect(new Headers(requests[0]?.init?.headers).get('idempotency-key')).toBe('profile-command-key');
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      idempotencyKey: 'profile-command-key',
      expectedVersion: 4,
      displayName: 'Alice Updated',
      avatarUrl: null,
      timezone: 'UTC',
    });
  });

  it.each([
    ['secret-like field', { expectedVersion: 4, displayName: 'Alice', avatarUrl: null, timezone: null, privateKey: 'never' }],
    ['unknown field', { expectedVersion: 4, displayName: 'Alice', avatarUrl: null, timezone: null, role: 'admin' }],
  ])('rejects a %s before fetch', async (_label, unsafeInput) => {
    let requests = 0;
    const client = createIdentityApiClient(dependencies(async () => {
      requests += 1;
      return jsonResponse(200, envelope({}));
    }));

    const result = await client.updateProfile(unsafeInput as unknown as IdentityProfileUpdateInput);

    expect(result).toEqual({ ok: false, code: 'identity_command_invalid' });
    expect(requests).toBe(0);
  });

  it.each([
    ['profile idempotency key', (client: ReturnType<typeof createIdentityApiClient>) => client.updateProfile({
      expectedVersion: 4, displayName: 'Alice', avatarUrl: null, timezone: null, idempotencyKey: 'caller-key',
    } as unknown as IdentityProfileUpdateInput)],
    ['wallet add idempotency key', (client: ReturnType<typeof createIdentityApiClient>) => client.addWalletAddress({
      expectedVersion: 4, address, label: null, idempotencyKey: 'caller-key',
    } as never)],
    ['wallet add chain', (client: ReturnType<typeof createIdentityApiClient>) => client.addWalletAddress({
      expectedVersion: 4, address, label: null, chain: 'evm',
    } as never)],
    ['wallet add visibility', (client: ReturnType<typeof createIdentityApiClient>) => client.addWalletAddress({
      expectedVersion: 4, address, label: null, visibility: 'public',
    } as never)],
    ['wallet visibility idempotency key', (client: ReturnType<typeof createIdentityApiClient>) => client.setWalletAddressVisibility({
      walletAddressId, expectedVersion: 3, visibility: 'public', idempotencyKey: 'caller-key',
    } as never)],
    ['wallet removal idempotency key', (client: ReturnType<typeof createIdentityApiClient>) => client.removeWalletAddress({
      walletAddressId, expectedVersion: 3, idempotencyKey: 'caller-key',
    } as never)],
  ])('rejects raw %s before enrichment without fetching', async (_label, invoke) => {
    let requests = 0;
    const client = createIdentityApiClient(dependencies(async () => {
      requests += 1;
      return jsonResponse(200, envelope({}));
    }));

    await expect(invoke(client)).resolves.toEqual({ ok: false, code: 'identity_command_invalid' });
    expect(requests).toBe(0);
  });

  it('adds an EVM address hidden by default against the displayed profile version', async () => {
    const requests: { init?: RequestInit }[] = [];
    const client = createIdentityApiClient(dependencies(async (_input, init) => {
      requests.push(init === undefined ? {} : { init });
      return jsonResponse(200, envelope({
        version: 1,
        commandId,
        replayed: false,
        walletAddressId,
        walletAddressVersion: 1,
        profileVersion: 5,
      }));
    }, { keys: ['wallet-add-key'] }));

    await expect(client.addWalletAddress({
      expectedVersion: profile.version,
      address,
      label: 'Main',
    })).resolves.toMatchObject({ ok: true });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      idempotencyKey: 'wallet-add-key',
      expectedVersion: 4,
      chain: 'evm',
      address,
      label: 'Main',
      visibility: 'hidden',
    });
  });

  it('rejects an invalid address before fetch with its stable code', async () => {
    let requests = 0;
    const client = createIdentityApiClient(dependencies(async () => {
      requests += 1;
      return jsonResponse(200, envelope({}));
    }));

    await expect(client.addWalletAddress({
      expectedVersion: 4,
      address: 'not-an-address',
      label: null,
    })).resolves.toEqual({ ok: false, code: 'identity_address_invalid' });
    expect(requests).toBe(0);
  });

  it.each([
    ['identity_address_duplicate', 'a duplicate with unrelated prose'],
    ['identity_address_limit_reached', 'a limit with different prose'],
    ['identity_version_conflict', 'stale but no wording dependency'],
    ['identity_idempotency_conflict', 'reused key with arbitrary prose'],
  ] as const)('maps %s by stable code and never retries', async (code, message) => {
    let requests = 0;
    const client = createIdentityApiClient(dependencies(async () => {
      requests += 1;
      return jsonResponse(409, apiError(code, message));
    }));

    await expect(client.addWalletAddress({
      expectedVersion: 4,
      address,
      label: null,
    })).resolves.toEqual({ ok: false, code });
    expect(requests).toBe(1);
  });

  it('binds visibility and removal to the displayed wallet row version', async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const keys = ['visibility-command-key', 'removal-command-key'];
    const client = createIdentityApiClient(dependencies(async (input, init) => {
      requests.push({ input, ...(init === undefined ? {} : { init }) });
      return jsonResponse(200, envelope({
        version: 1,
        commandId,
        replayed: false,
        walletAddressId,
        walletAddressVersion: 4,
      }));
    }, { keys }));

    await client.setWalletAddressVisibility({
      walletAddressId,
      expectedVersion: wallet.version,
      visibility: 'public',
    });
    await client.removeWalletAddress({ walletAddressId, expectedVersion: wallet.version });

    expect(requests).toHaveLength(2);
    expect(requests.map((entry) => JSON.parse(String(entry.init?.body)))).toEqual([
      {
        idempotencyKey: keys[0], walletAddressId,
        expectedVersion: 3, visibility: 'public',
      },
      {
        idempotencyKey: keys[1], walletAddressId,
        expectedVersion: 3,
      },
    ]);
    expect(requests.map((entry) => new Headers(entry.init?.headers).get('idempotency-key'))).toEqual(keys);
  });

  it('turns malformed receipts and unknown server errors into bounded persistence failures', async () => {
    const malformed = createIdentityApiClient(dependencies(async () => jsonResponse(200, envelope({
      version: 1,
      commandId,
      replayed: false,
    }))));
    const unknown = createIdentityApiClient(dependencies(async () => jsonResponse(500, apiError(
      'provider_secret_error',
      'postgres password leaked in provider prose',
    ))));

    await expect(malformed.updateProfile({
      expectedVersion: 4, displayName: 'Alice', avatarUrl: null, timezone: null,
    })).resolves.toEqual({ ok: false, code: 'identity_persistence_failed' });
    await expect(unknown.removeWalletAddress({
      walletAddressId, expectedVersion: 3,
    })).resolves.toEqual({ ok: false, code: 'identity_persistence_failed' });
  });

  it.each([
    ['a 201 envelope', 201, envelope(profile)],
    ['a 500 version conflict', 500, apiError('identity_version_conflict', 'wrong status')],
    ['a 401 version conflict', 401, apiError('identity_version_conflict', 'wrong pairing')],
    ['a 409 session failure', 409, apiError('identity_session_required', 'wrong pairing')],
    ['a malformed 409 error', 409, { ok: false, error: { code: 'identity_version_conflict' } }],
  ])('maps %s to the bounded query fallback', async (_label, status, body) => {
    const client = createIdentityApiClient(dependencies(async () => jsonResponse(status, body)));

    await expect(client.getProfile()).resolves.toEqual({ ok: false, code: 'identity_query_failed' });
  });

  it('rejects a command-invalid error on the profile query route', async () => {
    const client = createIdentityApiClient(dependencies(async () => jsonResponse(
      404,
      apiError('identity_command_invalid', 'valid only for a wallet item route'),
    )));

    await expect(client.getProfile()).resolves.toEqual({ ok: false, code: 'identity_query_failed' });
  });

  it('rejects a wallet conflict on the wallet-list query route', async () => {
    const client = createIdentityApiClient(dependencies(async () => jsonResponse(
      409,
      apiError('identity_version_conflict', 'valid only for a mutation route'),
    )));

    await expect(client.listWalletAddresses())
      .resolves.toEqual({ ok: false, code: 'identity_query_failed' });
  });

  it('rejects an address-invalid error on the profile update route', async () => {
    const client = createIdentityApiClient(dependencies(async () => jsonResponse(
      400,
      apiError('identity_address_invalid', 'valid only for wallet address handling'),
    )));

    await expect(client.updateProfile({
      expectedVersion: 4, displayName: 'Alice', avatarUrl: null, timezone: null,
    })).resolves.toEqual({ ok: false, code: 'identity_persistence_failed' });
  });

  it.each([
    ['profile update', (client: ReturnType<typeof createIdentityApiClient>) => client.updateProfile({
      expectedVersion: 4, displayName: 'Alice', avatarUrl: null, timezone: null,
    })],
    ['wallet add', (client: ReturnType<typeof createIdentityApiClient>) => client.addWalletAddress({
      expectedVersion: 4, address, label: null,
    })],
  ] as const)('accepts a profile-not-found error for %s when its SQL command has no profile row', async (_operation, invoke) => {
    const client = createIdentityApiClient(dependencies(async () => jsonResponse(
      404,
      apiError('identity_profile_not_found', 'the command profile row was deleted'),
    )));

    await expect(invoke(client)).resolves.toEqual({ ok: false, code: 'identity_profile_not_found' });
  });

  it('rejects a command-invalid error on the wallet-add route', async () => {
    const client = createIdentityApiClient(dependencies(async () => jsonResponse(
      404,
      apiError('identity_command_invalid', 'valid only for wallet item mutations'),
    )));

    await expect(client.addWalletAddress({ expectedVersion: 4, address, label: null }))
      .resolves.toEqual({ ok: false, code: 'identity_persistence_failed' });
  });

  it.each([
    ['profile query', 404, 'identity_profile_not_found', (client: ReturnType<typeof createIdentityApiClient>) => client.getProfile()],
    ['wallet item', 404, 'identity_command_invalid', (client: ReturnType<typeof createIdentityApiClient>) => client.removeWalletAddress({ walletAddressId, expectedVersion: 3 })],
    ['private operation', 401, 'identity_session_required', (client: ReturnType<typeof createIdentityApiClient>) => client.listWalletAddresses()],
  ] as const)('accepts the operation-specific %s %i/%s error pair', async (_operation, status, code, invoke) => {
    const client = createIdentityApiClient(dependencies(async () => jsonResponse(
      status,
      apiError(code, 'untrusted prose does not control this result'),
    )));

    await expect(invoke(client)).resolves.toEqual({ ok: false, code });
  });

  it('maps a non-200 success envelope to the bounded persistence fallback', async () => {
    const client = createIdentityApiClient(dependencies(async () => jsonResponse(201, envelope({
      version: 1,
      commandId,
      replayed: false,
      profileId: userId,
      profileVersion: 5,
    }))));

    await expect(client.updateProfile({
      expectedVersion: 4, displayName: 'Alice', avatarUrl: null, timezone: null,
    })).resolves.toEqual({ ok: false, code: 'identity_persistence_failed' });
  });
});
