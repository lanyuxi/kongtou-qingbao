import { describe, expect, it } from 'vitest';

import type {
  AddWalletAddressCommand,
  RemoveWalletAddressCommand,
  SetWalletAddressVisibilityCommand,
  UpdateProfileCommand,
} from '@airdrop/contracts';
import type {
  IdentityProfileRepository,
  IdentityWalletAddressRepository,
} from '@airdrop/database';

import {
  createIdentityProfileHandler,
  createIdentityPublicProfileHandler,
  createIdentityWalletAddressHandler,
  createIdentityWalletAddressItemHandler,
} from '../lib/identity-handlers.js';
import type { AuthenticatedUserVerifier } from '../lib/authenticated-user.js';

const userId = '70000000-0000-4000-8000-000000000001';
const walletAddressId = '70000000-0000-4000-8000-000000000002';
const requestId = '70000000-0000-4000-8000-000000000003';
const accessToken = 'local-test-token';

describe('Identity BFF handlers', () => {
  it('returns ID201 before parsing a malformed private request', async () => {
    const profiles = new RecordingProfiles();
    const response = await createIdentityProfileHandler(dependencies(null, profiles))(
      new Request('http://localhost/api/v1/identity/profile?unexpected=yes', {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'idempotency-key': 'different-key',
          'content-type': 'application/json',
        },
        body: '{',
      }),
    );

    await expectError(response, 401, 'identity_session_required');
    expect(profiles.calls).toEqual([]);
  });

  it('forwards only the authenticated request bearer to private reads', async () => {
    const profiles = new RecordingProfiles();
    const response = await createIdentityProfileHandler(dependencies({ userId }, profiles))(
      request('/api/v1/identity/profile'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(success(profile));
    expect(profiles.calls).toEqual([{ method: 'getMine', accessToken }]);
  });

  it('rejects query parameters after authenticating private reads', async () => {
    const profiles = new RecordingProfiles();
    const response = await createIdentityProfileHandler(dependencies({ userId }, profiles))(
      request('/api/v1/identity/profile?cursor=not-supported'),
    );

    await expectError(response, 400, 'invalid_request');
    expect(profiles.calls).toEqual([]);
  });

  it('returns ID201 when the repository sees an expired bearer', async () => {
    const profiles = new RejectingProfiles('identity_session_required');
    const response = await createIdentityProfileHandler(dependencies({ userId }, profiles))(
      request('/api/v1/identity/profile'),
    );

    await expectError(response, 401, 'identity_session_required');
  });

  it.each([
    ['GET', undefined, 'identity_query_failed'],
    ['PATCH', updateProfileCommand(), 'identity_persistence_failed'],
  ] as const)('sanitizes verifier failures as a %s private failure', async (method, body, code) => {
    const profiles = new RecordingProfiles();
    const response = await createIdentityProfileHandler({
      ...dependencies({ userId }, profiles),
      auth: new ThrowingAuth(),
    })(request('/api/v1/identity/profile', { method, body }));

    const responseBody = await response.clone().json();
    await expectError(response, 500, code);
    expect(profiles.calls).toEqual([]);
    expect(JSON.stringify(responseBody)).not.toMatch(/password|secret/i);
  });

  it.each([
    ['identity_profile_not_found', 404],
    ['unknown', 500],
  ])('sanitizes private profile read %s failures', async (code, status) => {
    const response = await createIdentityProfileHandler(
      dependencies({ userId }, new RejectingProfiles(code)),
    )(request('/api/v1/identity/profile'));

    const body = await response.clone().json();
    await expectError(response, status, status === 404 ? 'identity_profile_not_found' : 'identity_query_failed');
    expect(JSON.stringify(body)).not.toMatch(/postgres|password|secret/i);
  });

  it('requires an exactly matching idempotency key before profile persistence', async () => {
    const profiles = new RecordingProfiles();
    const response = await createIdentityProfileHandler(dependencies({ userId }, profiles))(
      request('/api/v1/identity/profile', {
        method: 'PATCH',
        headers: { 'idempotency-key': 'other-command-key' },
        body: updateProfileCommand(),
      }),
    );

    await expectError(response, 400, 'invalid_request');
    expect(profiles.calls).toEqual([]);
  });

  it.each([
    ['unknown key', { ...updateProfileCommand(), ignored: true }],
    ['secret-like key', { ...updateProfileCommand(), mnemonic: 'never accepted' }],
    ['malformed command', { ...updateProfileCommand(), expectedVersion: 0 }],
  ])('rejects %s before profile persistence', async (_name, body) => {
    const profiles = new RecordingProfiles();
    const response = await createIdentityProfileHandler(dependencies({ userId }, profiles))(
      request('/api/v1/identity/profile', { method: 'PATCH', body }),
    );

    await expectError(response, 400, 'invalid_request');
    expect(profiles.calls).toEqual([]);
  });

  it.each([
    ['identity_version_conflict', 409],
    ['identity_idempotency_conflict', 409],
    ['unknown', 500],
  ])('maps profile mutation %s without exposing repository details', async (code, status) => {
    const response = await createIdentityProfileHandler(
      dependencies({ userId }, new RejectingProfiles(code)),
    )(request('/api/v1/identity/profile', { method: 'PATCH', body: updateProfileCommand() }));

    await expectError(response, status, status === 500 ? 'identity_persistence_failed' : code);
  });

  it('updates the profile with the request bearer and complete command', async () => {
    const profiles = new RecordingProfiles();
    const command = updateProfileCommand();
    const response = await createIdentityProfileHandler(dependencies({ userId }, profiles))(
      request('/api/v1/identity/profile', { method: 'PATCH', body: command }),
    );

    expect(await response.json()).toEqual(success(updateProfileReceipt));
    expect(profiles.calls).toEqual([{ method: 'update', accessToken, command }]);
  });

  it('lists the bounded private wallet projection with no cursor protocol', async () => {
    const wallets = new RecordingWallets();
    const response = await createIdentityWalletAddressHandler(dependencies({ userId }, new RecordingProfiles(), wallets))(
      request('/api/v1/identity/wallet-addresses'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(success([wallet]));
    expect(wallets.calls).toEqual([{ method: 'listMine', accessToken }]);
  });

  it.each([
    ['identity_address_duplicate', 409],
    ['identity_address_limit_reached', 409],
    ['identity_version_conflict', 409],
    ['identity_idempotency_conflict', 409],
  ])('maps wallet add %s to its stable conflict response', async (code, status) => {
    const response = await createIdentityWalletAddressHandler(
      dependencies({ userId }, new RecordingProfiles(), new RejectingWallets(code)),
    )(request('/api/v1/identity/wallet-addresses', { method: 'POST', body: addWalletCommand() }));

    await expectError(response, status, code);
  });

  it('adds a wallet with the request bearer and complete command', async () => {
    const wallets = new RecordingWallets();
    const command = addWalletCommand();
    const response = await createIdentityWalletAddressHandler(dependencies({ userId }, new RecordingProfiles(), wallets))(
      request('/api/v1/identity/wallet-addresses', { method: 'POST', body: command }),
    );

    expect(await response.json()).toEqual(success(addWalletReceipt));
    expect(wallets.calls).toEqual([{ method: 'add', accessToken, command }]);
  });

  it.each([
    ['query', '/api/v1/identity/wallet-addresses?unexpected=yes', {}, addWalletCommand()],
    ['idempotency header', '/api/v1/identity/wallet-addresses', { 'idempotency-key': 'wrong-key' }, addWalletCommand()],
    ['body', '/api/v1/identity/wallet-addresses', {}, { private_key: 'never accepted' }],
  ])('returns ID201 before validating a malformed wallet collection %s', async (_kind, path, headers, body) => {
    const wallets = new RecordingWallets();
    const response = await createIdentityWalletAddressHandler(dependencies(null, new RecordingProfiles(), wallets))(
      request(path, {
        method: 'POST',
        headers,
        body,
      }),
    );

    await expectError(response, 401, 'identity_session_required');
    expect(wallets.calls).toEqual([]);
  });

  it('rejects a malformed wallet path before persistence', async () => {
    const wallets = new RecordingWallets();
    const response = await invokeWalletItem(
      createIdentityWalletAddressItemHandler(dependencies({ userId }, new RecordingProfiles(), wallets)),
      request('/api/v1/identity/wallet-addresses/not-a-uuid', { method: 'PATCH', body: visibilityCommand() }),
      'not-a-uuid',
    );

    await expectError(response, 400, 'invalid_request');
    expect(wallets.calls).toEqual([]);
  });

  it('requires a wallet command ID to exactly match the authenticated path', async () => {
    const wallets = new RecordingWallets();
    const response = await invokeWalletItem(
      createIdentityWalletAddressItemHandler(dependencies({ userId }, new RecordingProfiles(), wallets)),
      request('/api/v1/identity/wallet-addresses/' + walletAddressId, {
        method: 'PATCH',
        body: { ...visibilityCommand(), walletAddressId: userId },
      }),
    );

    await expectError(response, 400, 'invalid_request');
    expect(wallets.calls).toEqual([]);
  });

  it.each([
    ['PATCH', visibilityCommand()],
    ['DELETE', removeWalletCommand()],
  ] as const)('maps post-validation wallet %s command-invalid to opaque 404', async (method, body) => {
    const response = await invokeWalletItem(
      createIdentityWalletAddressItemHandler(
        dependencies({ userId }, new RecordingProfiles(), new RejectingWallets('identity_command_invalid')),
      ),
      request('/api/v1/identity/wallet-addresses/' + walletAddressId, { method, body }),
    );

    await expectError(response, 404, 'identity_command_invalid');
  });

  it('sets wallet visibility with the request bearer and complete command', async () => {
    const wallets = new RecordingWallets();
    const command = visibilityCommand();
    const response = await invokeWalletItem(
      createIdentityWalletAddressItemHandler(dependencies({ userId }, new RecordingProfiles(), wallets)),
      request('/api/v1/identity/wallet-addresses/' + walletAddressId, { method: 'PATCH', body: command }),
    );

    expect(await response.json()).toEqual(success(setVisibilityReceipt));
    expect(wallets.calls).toEqual([{ method: 'setVisibility', accessToken, command }]);
  });

  it('removes a wallet with the request bearer and complete command', async () => {
    const wallets = new RecordingWallets();
    const command = removeWalletCommand();
    const response = await invokeWalletItem(
      createIdentityWalletAddressItemHandler(dependencies({ userId }, new RecordingProfiles(), wallets)),
      request('/api/v1/identity/wallet-addresses/' + walletAddressId, { method: 'DELETE', body: command }),
    );

    expect(await response.json()).toEqual(success(removeWalletReceipt));
    expect(wallets.calls).toEqual([{ method: 'remove', accessToken, command }]);
  });

  it.each([
    ['query', '/api/v1/identity/wallet-addresses/' + walletAddressId + '?unexpected=yes', {}, visibilityCommand(), walletAddressId],
    ['path', '/api/v1/identity/wallet-addresses/not-a-uuid', {}, visibilityCommand(), 'not-a-uuid'],
    ['idempotency header', '/api/v1/identity/wallet-addresses/' + walletAddressId, { 'idempotency-key': 'wrong-key' }, visibilityCommand(), walletAddressId],
    ['body', '/api/v1/identity/wallet-addresses/' + walletAddressId, {}, { mnemonic: 'never accepted' }, walletAddressId],
  ])('returns ID201 before validating a malformed wallet item %s', async (_kind, path, headers, body, id) => {
    const wallets = new RecordingWallets();
    const response = await invokeWalletItem(
      createIdentityWalletAddressItemHandler(dependencies(null, new RecordingProfiles(), wallets)),
      request(path, {
        method: 'PATCH',
        headers,
        body,
      }),
      id,
    );

    await expectError(response, 401, 'identity_session_required');
    expect(wallets.calls).toEqual([]);
  });

  it('composes only anonymous-safe public projections', async () => {
    const profiles = new RecordingProfiles();
    const wallets = new RecordingWallets();
    const response = await invokePublic(
      createIdentityPublicProfileHandler(dependencies(null, profiles, wallets)),
      request('/api/v1/identity/public-profile/' + userId),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(success({ profile: publicProfile, walletAddresses: [publicWallet] }));
    expect(profiles.calls).toEqual([{ method: 'getPublic', userId }]);
    expect(wallets.calls).toEqual([{ method: 'listPublic', userId }]);
  });

  it('rejects malformed public IDs and public query parameters without repository access', async () => {
    const profiles = new RecordingProfiles();
    const wallets = new RecordingWallets();
    const handler = createIdentityPublicProfileHandler(dependencies(null, profiles, wallets));

    await expectError(await invokePublic(handler, request('/api/v1/identity/public-profile/not-a-uuid'), 'not-a-uuid'), 400, 'invalid_request');
    await expectError(await invokePublic(handler, request('/api/v1/identity/public-profile/' + userId + '?cursor=x')), 400, 'invalid_request');
    expect(profiles.calls).toEqual([]);
    expect(wallets.calls).toEqual([]);
  });

  it('sanitizes public projection failures as query failures', async () => {
    const response = await invokePublic(
      createIdentityPublicProfileHandler(dependencies(null, new RejectingProfiles('unknown'), new RecordingWallets())),
      request('/api/v1/identity/public-profile/' + userId),
    );

    await expectError(response, 500, 'identity_query_failed');
  });
});

function dependencies(
  authenticated: { userId: string } | null,
  profiles: IdentityProfileRepository = new RecordingProfiles(),
  wallets: IdentityWalletAddressRepository = new RecordingWallets(),
) {
  return {
    auth: new StaticAuth(authenticated),
    profiles,
    wallets,
    ids: { generate: () => requestId },
  };
}

function request(path: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
} = {}) {
  const headers = new Headers({ authorization: `Bearer ${accessToken}` });
  for (const [key, value] of Object.entries(options.headers ?? {})) headers.set(key, value);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.method === 'PATCH' || options.method === 'POST' || options.method === 'DELETE') {
    if (!headers.has('idempotency-key')) headers.set('idempotency-key', 'identity-command-key');
  }
  return new Request('http://localhost' + path, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

function invokeWalletItem(
  handler: ReturnType<typeof createIdentityWalletAddressItemHandler>,
  identityRequest: Request,
  id = walletAddressId,
) {
  return handler(identityRequest, { params: Promise.resolve({ id }) });
}

function invokePublic(
  handler: ReturnType<typeof createIdentityPublicProfileHandler>,
  identityRequest: Request,
  userIdParam = userId,
) {
  return handler(identityRequest, { params: Promise.resolve({ userId: userIdParam }) });
}

function success(data: unknown) {
  return { ok: true, data, meta: { requestId, nextCursor: null } };
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ ok: false, error: { code, requestId, details: null } });
}

function updateProfileCommand() {
  return { idempotencyKey: 'identity-command-key', expectedVersion: 1, displayName: 'Alice', avatarUrl: null, timezone: 'UTC' };
}

function addWalletCommand() {
  return { idempotencyKey: 'identity-command-key', expectedVersion: 1, chain: 'evm', address: '0x1111111111111111111111111111111111111111', label: 'Main', visibility: 'hidden' };
}

function visibilityCommand() {
  return { idempotencyKey: 'identity-command-key', expectedVersion: 1, walletAddressId, visibility: 'public' };
}

function removeWalletCommand() {
  return { idempotencyKey: 'identity-command-key', expectedVersion: 1, walletAddressId };
}

const profile = { userId, displayName: 'Alice', avatarUrl: null, timezone: 'UTC', version: 1, updatedAt: '2026-09-05T00:00:00.000Z' };
const wallet = { walletAddressId, chain: 'evm' as const, address: '0x1111111111111111111111111111111111111111', label: 'Main', visibility: 'hidden' as const, version: 1, createdAt: '2026-09-05T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z' };
const publicProfile = { userId, displayName: 'Alice', avatarUrl: null };
const publicWallet = { walletAddressId, chain: 'evm' as const, address: '0x1111111111111111111111111111111111111111', label: 'Main' };
const updateProfileReceipt = { version: 1 as const, commandId: userId, replayed: false, profileId: userId, profileVersion: 2 };
const addWalletReceipt = { version: 1 as const, commandId: userId, replayed: false, walletAddressId, walletAddressVersion: 1, profileVersion: 2 };
const setVisibilityReceipt = { version: 1 as const, commandId: userId, replayed: false, walletAddressId, walletAddressVersion: 2 };
const removeWalletReceipt = { version: 1 as const, commandId: userId, replayed: false, walletAddressId, walletAddressVersion: 3 };

class StaticAuth implements AuthenticatedUserVerifier {
  constructor(private readonly result: { userId: string } | null) {}
  async verifyAuthorizationHeader(): Promise<{ userId: string } | null> { return this.result; }
}

class ThrowingAuth implements AuthenticatedUserVerifier {
  async verifyAuthorizationHeader(): Promise<never> {
    throw new Error('auth infrastructure password=secret');
  }
}

class RecordingProfiles implements IdentityProfileRepository {
  readonly calls: unknown[] = [];
  async getMine(input: { accessToken: string }) { this.calls.push({ method: 'getMine', ...input }); return profile; }
  async getPublic(input: { userId: string }) { this.calls.push({ method: 'getPublic', ...input }); return publicProfile; }
  async update(input: { accessToken: string; command: UpdateProfileCommand }) { this.calls.push({ method: 'update', ...input }); return updateProfileReceipt; }
}

class RejectingProfiles extends RecordingProfiles {
  constructor(private readonly code: string) { super(); }
  override async getMine(): Promise<never> { throw { code: this.code, database: 'postgres://password=secret' }; }
  override async getPublic(): Promise<never> { throw { code: this.code, database: 'postgres://password=secret' }; }
  override async update(): Promise<never> { throw { code: this.code, database: 'postgres://password=secret' }; }
}

class RecordingWallets implements IdentityWalletAddressRepository {
  readonly calls: unknown[] = [];
  async listMine(input: { accessToken: string }) { this.calls.push({ method: 'listMine', ...input }); return [wallet]; }
  async listPublic(input: { userId: string }) { this.calls.push({ method: 'listPublic', ...input }); return [publicWallet]; }
  async add(input: { accessToken: string; command: AddWalletAddressCommand }) { this.calls.push({ method: 'add', ...input }); return addWalletReceipt; }
  async setVisibility(input: { accessToken: string; command: SetWalletAddressVisibilityCommand }) { this.calls.push({ method: 'setVisibility', ...input }); return setVisibilityReceipt; }
  async remove(input: { accessToken: string; command: RemoveWalletAddressCommand }) { this.calls.push({ method: 'remove', ...input }); return removeWalletReceipt; }
}

class RejectingWallets extends RecordingWallets {
  constructor(private readonly code: string) { super(); }
  override async listMine(): Promise<never> { throw { code: this.code, database: 'postgres://password=secret' }; }
  override async listPublic(): Promise<never> { throw { code: this.code, database: 'postgres://password=secret' }; }
  override async add(): Promise<never> { throw { code: this.code, database: 'postgres://password=secret' }; }
  override async setVisibility(): Promise<never> { throw { code: this.code, database: 'postgres://password=secret' }; }
  override async remove(): Promise<never> { throw { code: this.code, database: 'postgres://password=secret' }; }
}
