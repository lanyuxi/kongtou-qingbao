import { describe, expect, it } from 'vitest';
import type { AddWalletAddressCommand } from '@airdrop/contracts';

import {
  createIdentityProfileRepositoryFromRpc,
  createIdentityWalletAddressRepositoryFromRpc,
  IdentityRepositoryError,
  type IdentityRpc,
  type IdentityRpcCall,
} from '../identity/index.js';

const userId = '40000000-0000-4000-8000-000000000002';
const walletAddressId = '40000000-0000-4000-8000-000000000001';
const commandId = '40000000-0000-4000-8000-000000000099';
const address = '0x1234567890abcdef1234567890abcdef12345678';

const privateProfile = {
  userId,
  displayName: '羽希',
  avatarUrl: null,
  timezone: 'Asia/Shanghai',
  version: 2,
  updatedAt: '2026-09-03T00:00:00.000Z',
};
const privateWallet = {
  walletAddressId,
  chain: 'evm',
  address,
  label: 'primary',
  visibility: 'hidden',
  version: 1,
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

describe('Identity repositories', () => {
  it('uses the caller bearer and owner-scoped RPC for private reads', async () => {
    const rpc = new RecordingRpc([[privateProfile], [privateWallet]]);
    const profiles = createIdentityProfileRepositoryFromRpc(rpc);
    const wallets = createIdentityWalletAddressRepositoryFromRpc(rpc);

    await expect(profiles.getMine({ accessToken: 'caller-token' })).resolves.toEqual(
      privateProfile,
    );
    await expect(wallets.listMine({ accessToken: 'caller-token' })).resolves.toEqual([
      privateWallet,
    ]);
    expect(rpc.calls).toEqual([
      { accessToken: 'caller-token', functionName: 'get_my_identity_profile', args: {} },
      { accessToken: 'caller-token', functionName: 'list_my_wallet_addresses', args: {} },
    ]);
  });

  it('uses no bearer for D4 public projections and rejects extra fields', async () => {
    const rpc = new RecordingRpc([
      [{ userId, displayName: '羽希', avatarUrl: null }],
      [{ walletAddressId, chain: 'evm', address, label: 'primary' }],
    ]);
    const profiles = createIdentityProfileRepositoryFromRpc(rpc);
    const wallets = createIdentityWalletAddressRepositoryFromRpc(rpc);

    await expect(profiles.getPublic({ userId })).resolves.toEqual({
      userId,
      displayName: '羽希',
      avatarUrl: null,
    });
    await expect(wallets.listPublic({ userId })).resolves.toEqual([
      { walletAddressId, chain: 'evm', address, label: 'primary' },
    ]);
    expect(rpc.calls).toEqual([
      {
        accessToken: null,
        functionName: 'get_public_identity_profile',
        args: { p_user_id: userId },
      },
      {
        accessToken: null,
        functionName: 'list_public_identity_wallet_addresses',
        args: { p_user_id: userId },
      },
    ]);

    await expect(
      createIdentityProfileRepositoryFromRpc(
        new RecordingRpc([
          [{ userId, displayName: '羽希', avatarUrl: null, timezone: 'Asia/Shanghai' }],
        ]),
      ).getPublic({ userId }),
    ).rejects.toMatchObject({ code: 'identity_query_failed' });
  });

  it('forwards each valid command unchanged and parses replayed receipts', async () => {
    const update = {
      idempotencyKey: ' profile-update-1 ',
      expectedVersion: 2,
      displayName: '羽希',
      avatarUrl: null,
      timezone: 'Asia/Shanghai',
    } as const;
    const add = {
      idempotencyKey: 'wallet-add-1',
      expectedVersion: 2,
      chain: 'evm',
      address,
      label: 'primary',
      visibility: 'hidden',
    } as const;
    const visibility = {
      idempotencyKey: 'wallet-visibility-1',
      expectedVersion: 1,
      walletAddressId,
      visibility: 'public',
    } as const;
    const remove = {
      idempotencyKey: 'wallet-remove-1',
      expectedVersion: 2,
      walletAddressId,
    } as const;
    const rpc = new RecordingRpc([
      { version: 1, commandId, profileId: userId, profileVersion: 3, replayed: true },
      {
        version: 1,
        commandId,
        walletAddressId,
        walletAddressVersion: 1,
        profileVersion: 4,
        replayed: true,
      },
      { version: 1, commandId, walletAddressId, walletAddressVersion: 2, replayed: true },
      { version: 1, commandId, walletAddressId, walletAddressVersion: 3, replayed: true },
    ]);
    const profiles = createIdentityProfileRepositoryFromRpc(rpc);
    const wallets = createIdentityWalletAddressRepositoryFromRpc(rpc);

    await expect(
      profiles.update({ accessToken: 'caller-token', command: update }),
    ).resolves.toMatchObject({ replayed: true, profileVersion: 3 });
    await expect(wallets.add({ accessToken: 'caller-token', command: add })).resolves.toMatchObject(
      { replayed: true, profileVersion: 4 },
    );
    await expect(
      wallets.setVisibility({ accessToken: 'caller-token', command: visibility }),
    ).resolves.toMatchObject({ replayed: true, walletAddressVersion: 2 });
    await expect(
      wallets.remove({ accessToken: 'caller-token', command: remove }),
    ).resolves.toMatchObject({ replayed: true, walletAddressVersion: 3 });
    expect(rpc.calls).toEqual([
      {
        accessToken: 'caller-token',
        functionName: 'submit_update_profile',
        args: { p_payload: update },
      },
      {
        accessToken: 'caller-token',
        functionName: 'submit_add_wallet_address',
        args: { p_payload: add },
      },
      {
        accessToken: 'caller-token',
        functionName: 'submit_set_wallet_address_visibility',
        args: { p_payload: visibility },
      },
      {
        accessToken: 'caller-token',
        functionName: 'submit_remove_wallet_address',
        args: { p_payload: remove },
      },
    ]);
  });

  it('rejects blank private reads and secret-like commands before any RPC call', async () => {
    const rpc = new RecordingRpc([]);
    const profiles = createIdentityProfileRepositoryFromRpc(rpc);
    const wallets = createIdentityWalletAddressRepositoryFromRpc(rpc);

    await expect(profiles.getMine({ accessToken: '  ' })).rejects.toMatchObject({
      code: 'identity_session_required',
    });
    const hostileCommand = {
      idempotencyKey: 'wallet-add-1',
      expectedVersion: 1,
      chain: 'evm',
      address,
      label: null,
      visibility: 'hidden',
      privateKey: 'never-forward',
    };
    await expect(
      wallets.add({
        accessToken: 'caller-token',
        command: hostileCommand as unknown as AddWalletAddressCommand,
      }),
    ).rejects.toMatchObject({ code: 'identity_command_invalid' });
    expect(rpc.calls).toEqual([]);
  });

  it.each([
    {
      name: 'update',
      invoke: (rpc: IdentityRpc) => createIdentityProfileRepositoryFromRpc(rpc).update({
        accessToken: '  ',
        command: {
          idempotencyKey: 'profile-update-blank-session',
          expectedVersion: 1,
          displayName: null,
          avatarUrl: null,
          timezone: null,
        },
      }),
    },
    {
      name: 'add',
      invoke: (rpc: IdentityRpc) => createIdentityWalletAddressRepositoryFromRpc(rpc).add({
        accessToken: '  ',
        command: {
          idempotencyKey: 'wallet-add-blank-session',
          expectedVersion: 1,
          chain: 'evm',
          address,
          label: null,
          visibility: 'hidden',
        },
      }),
    },
    {
      name: 'setVisibility',
      invoke: (rpc: IdentityRpc) =>
        createIdentityWalletAddressRepositoryFromRpc(rpc).setVisibility({
          accessToken: '  ',
          command: {
            idempotencyKey: 'wallet-visibility-blank-session',
            expectedVersion: 1,
            walletAddressId,
            visibility: 'public',
          },
        }),
    },
    {
      name: 'remove',
      invoke: (rpc: IdentityRpc) => createIdentityWalletAddressRepositoryFromRpc(rpc).remove({
        accessToken: '  ',
        command: {
          idempotencyKey: 'wallet-remove-blank-session',
          expectedVersion: 1,
          walletAddressId,
        },
      }),
    },
  ])('rejects a blank bearer before the $name mutation RPC', async ({ invoke }) => {
    const rpc = new RecordingRpc([]);

    await expect(invoke(rpc)).rejects.toEqual(
      new IdentityRepositoryError('identity_session_required'),
    );
    expect(rpc.calls).toEqual([]);
  });

  it.each([
    ['ID201', 'identity_session_required'],
    ['ID202', 'identity_profile_not_found'],
    ['ID203', 'identity_address_invalid'],
    ['ID204', 'identity_address_duplicate'],
    ['ID205', 'identity_address_limit_reached'],
    ['ID206', 'identity_version_conflict'],
    ['ID207', 'identity_idempotency_conflict'],
    ['ID208', 'identity_command_invalid'],
    ['ID299', 'identity_persistence_failed'],
  ] as const)('maps SQLSTATE %s to %s without raw error detail', async (sqlState, code) => {
    const repository = createIdentityProfileRepositoryFromRpc(
      new RecordingRpc([{ code: sqlState, message: 'database secret detail' }]),
    );

    await expect(
      repository.update({
        accessToken: 'caller-token',
        command: {
          idempotencyKey: 'profile-update-1',
          expectedVersion: 1,
          displayName: null,
          avatarUrl: null,
          timezone: null,
        },
      }),
    ).rejects.toEqual(new IdentityRepositoryError(code));
  });

  it('maps unknown and malformed read results to query failure and mutation results to persistence failure', async () => {
    await expect(
      createIdentityProfileRepositoryFromRpc(
        new RecordingRpc([{ code: 'XX000', message: 'raw query detail' }]),
      ).getMine({ accessToken: 'caller-token' }),
    ).rejects.toEqual(new IdentityRepositoryError('identity_query_failed'));
    await expect(
      createIdentityWalletAddressRepositoryFromRpc(
        new RecordingRpc([{ invalid: 'receipt' }]),
      ).remove({
        accessToken: 'caller-token',
        command: {
          idempotencyKey: 'wallet-remove-1',
          expectedVersion: 1,
          walletAddressId,
        },
      }),
    ).rejects.toEqual(new IdentityRepositoryError('identity_persistence_failed'));
  });

  it('maps missing profiles to not found and multiple profile rows to a query failure', async () => {
    await expect(
      createIdentityProfileRepositoryFromRpc(new RecordingRpc([[]])).getMine({
        accessToken: 'caller-token',
      }),
    ).rejects.toEqual(new IdentityRepositoryError('identity_profile_not_found'));
    await expect(
      createIdentityProfileRepositoryFromRpc(
        new RecordingRpc([
          [privateProfile, { ...privateProfile, userId: '40000000-0000-4000-8000-000000000003' }],
        ]),
      ).getMine({ accessToken: 'caller-token' }),
    ).rejects.toEqual(new IdentityRepositoryError('identity_query_failed'));
  });

  it.each([
    {
      name: 'malformed private profile',
      result: [[{ ...privateProfile, version: 0 }]],
      query: (rpc: IdentityRpc) =>
        createIdentityProfileRepositoryFromRpc(rpc).getMine({ accessToken: 'caller-token' }),
    },
    {
      name: 'private profile with an extra field',
      result: [[{ ...privateProfile, internalMessage: 'raw private profile detail' }]],
      query: (rpc: IdentityRpc) =>
        createIdentityProfileRepositoryFromRpc(rpc).getMine({ accessToken: 'caller-token' }),
    },
    {
      name: 'malformed private wallet',
      result: [[{ ...privateWallet, chain: 'solana' }]],
      query: (rpc: IdentityRpc) =>
        createIdentityWalletAddressRepositoryFromRpc(rpc).listMine({
          accessToken: 'caller-token',
        }),
    },
    {
      name: 'private wallet with an extra field',
      result: [[{ ...privateWallet, internalMessage: 'raw private wallet detail' }]],
      query: (rpc: IdentityRpc) =>
        createIdentityWalletAddressRepositoryFromRpc(rpc).listMine({
          accessToken: 'caller-token',
        }),
    },
    {
      name: 'public wallet with an extra field',
      result: [[{
        walletAddressId,
        chain: 'evm',
        address,
        label: 'primary',
        internalMessage: 'raw public wallet detail',
      }]],
      query: (rpc: IdentityRpc) =>
        createIdentityWalletAddressRepositoryFromRpc(rpc).listPublic({ userId }),
    },
  ])('sanitizes $name projection failures', async ({ result, query }) => {
    await expect(query(new RecordingRpc(result))).rejects.toEqual(
      new IdentityRepositoryError('identity_query_failed'),
    );
  });
});

class RecordingRpc implements IdentityRpc {
  readonly calls: IdentityRpcCall[] = [];

  constructor(private readonly results: unknown[]) {}

  async invoke(call: IdentityRpcCall): Promise<unknown> {
    this.calls.push(call);
    const result = this.results.shift();
    if (result instanceof Error || isRecordWithCode(result)) throw result;
    return result;
  }
}

function isRecordWithCode(value: unknown): value is { readonly code: string } {
  return typeof value === 'object' && value !== null && 'code' in value;
}
