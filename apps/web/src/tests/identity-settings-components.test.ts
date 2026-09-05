import type { UserProfileRow, WalletAddressRow } from '@airdrop/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  IdentitySafetyNotice,
  identityErrorMessage,
} from '../components/identity/identity-settings-elements.js';
import {
  ProfileSettings,
  buildProfileUpdateInput,
  submitProfileUpdate,
  submitProfileUpdateOnce,
} from '../components/identity/profile-settings.js';
import {
  WalletSettings,
  addWalletAddress,
  addWalletAddressOnce,
  changeWalletVisibility,
  removeWalletAddress,
  removeWalletAddressOnce,
} from '../components/identity/wallet-settings.js';
import type {
  IdentityApiClient,
  IdentityApiFailure,
  IdentityApiResult,
} from '../lib/identity-api-client.js';
import { createPendingActionGate } from '../lib/review-pending-action.js';
import { PublicShellBoundary } from '../components/app-shell.js';

const userId = '72000000-0000-4000-8000-000000000001';
const walletAddressId = '72000000-0000-4000-8000-000000000002';
const address = '0x2222222222222222222222222222222222222222';

const profile: UserProfileRow = {
  userId,
  displayName: 'Alice',
  avatarUrl: null,
  timezone: 'Asia/Shanghai',
  version: 7,
  updatedAt: '2026-09-05T00:00:00.000Z',
};

const wallet: WalletAddressRow = {
  walletAddressId,
  chain: 'evm',
  address,
  label: 'Main',
  visibility: 'hidden',
  version: 5,
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-05T00:00:00.000Z',
};

const receiptEnvelope = {
  version: 1 as const,
  commandId: '72000000-0000-4000-8000-000000000003',
  replayed: false,
};

describe('identity settings safety and states', () => {
  it('prominently states the full secret-safety boundary on both settings surfaces', () => {
    const safety = '本产品永远不会索取私钥、助记词、钱包密码或签名密钥，只存储公开钱包地址。';
    const profileHtml = renderToStaticMarkup(createElement(ProfileSettings, {
      state: { status: 'ready', profile },
      api: unavailableApi(),
      onReload: async () => {},
    }));
    const walletHtml = renderToStaticMarkup(createElement(WalletSettings, {
      state: { status: 'ready', profile, wallets: [wallet] },
      api: unavailableApi(),
      onReload: async () => {},
    }));

    expect(renderToStaticMarkup(createElement(IdentitySafetyNotice))).toContain(safety);
    expect(profileHtml).toContain(safety);
    expect(walletHtml).toContain(safety);
    expect(`${profileHtml}${walletHtml}`).not.toMatch(/type="password"|name="(?:private|seed|mnemonic|secret)/i);
    expect(walletHtml).not.toMatch(/connect wallet|连接钱包|签名交易/i);
  });

  it('renders sign-in required without redirecting to reviewer authentication', () => {
    const profileHtml = renderToStaticMarkup(createElement(ProfileSettings, {
      state: { status: 'sign_in_required' },
      api: unavailableApi(),
      onReload: async () => {},
    }));
    const walletHtml = renderToStaticMarkup(createElement(WalletSettings, {
      state: { status: 'sign_in_required' },
      api: unavailableApi(),
      onReload: async () => {},
    }));

    expect(profileHtml).toContain('sign_in_required');
    expect(walletHtml).toContain('sign_in_required');
    expect(`${profileHtml}${walletHtml}`).not.toContain('/review/sign-in');
  });

  it.each([
    ['identity_address_invalid', '钱包地址格式无效。'],
    ['identity_address_duplicate', '该钱包地址已添加。'],
    ['identity_address_limit_reached', '最多只能保存 5 个钱包地址。'],
    ['identity_version_conflict', '记录已发生变化，请重新加载并核对后再操作。'],
    ['identity_idempotency_conflict', '提交标识发生冲突，请重新加载并核对后再操作。'],
    ['identity_command_invalid', '提交内容无效，未发送请求。'],
    ['identity_session_required', 'sign_in_required：需要有效会话才能管理身份设置。'],
    ['identity_query_failed', '身份设置暂时无法加载。'],
    ['identity_persistence_failed', '身份设置暂时无法保存。'],
  ] as const)('maps %s to bounded copy', (code, message) => {
    expect(identityErrorMessage(code)).toBe(message);
  });

  it('keeps the Settings link outside the mobile-hidden sidebar', () => {
    const html = renderToStaticMarkup(createElement(PublicShellBoundary, {
      pathname: '/settings/profile',
      children: '设置内容',
    }));

    const settingsLink = '<a class="topbar-settings-link" href="/settings/profile">设置</a>';
    expect(html).toContain(settingsLink);
    expect(html.indexOf(settingsLink)).toBeGreaterThan(html.indexOf('</aside>'));
  });
});

describe('profile settings commands', () => {
  it('builds an update only from editable fields and the displayed profile version', () => {
    expect(buildProfileUpdateInput(profile, {
      displayName: ' Alice Updated ', avatarUrl: '', timezone: ' UTC ',
    })).toEqual({
      expectedVersion: 7,
      displayName: 'Alice Updated',
      avatarUrl: null,
      timezone: 'UTC',
    });
  });

  it('submits the displayed version and reloads only after success', async () => {
    const calls: unknown[] = [];
    let reloads = 0;
    const state = await submitProfileUpdate({
      api: api({
        updateProfile: async (input) => {
          calls.push(input);
          return success({ ...receiptEnvelope, profileId: userId, profileVersion: 8 });
        },
      }),
      profile,
      draft: { displayName: 'Alice Updated', avatarUrl: '', timezone: 'UTC' },
      onReload: async () => { reloads += 1; },
    });

    expect(calls).toEqual([{
      expectedVersion: 7,
      displayName: 'Alice Updated',
      avatarUrl: null,
      timezone: 'UTC',
    }]);
    expect(reloads).toBe(1);
    expect(state).toEqual({ status: 'saved' });
  });

  it('stops on a version conflict until the user deliberately reloads', async () => {
    let reloads = 0;
    const state = await submitProfileUpdate({
      api: api({ updateProfile: async () => failure('identity_version_conflict') }),
      profile,
      draft: { displayName: 'Alice', avatarUrl: '', timezone: 'UTC' },
      onReload: async () => { reloads += 1; },
    });

    expect(state).toEqual({ status: 'conflict', code: 'identity_version_conflict' });
    expect(reloads).toBe(0);
    const html = renderToStaticMarkup(createElement(ProfileSettings, {
      state: { status: 'ready', profile }, api: unavailableApi(), onReload: async () => {},
      initialSubmission: state,
    }));
    expect(html).toContain('重新加载并核对');
  });

  it('uses a synchronous gate while a profile submission is unsettled', async () => {
    const gate = createPendingActionGate();
    let calls = 0;
    let resolve: (() => void) | undefined;
    const result = new Promise<void>((next) => { resolve = next; });
    const input = {
      api: api({ updateProfile: async () => {
        calls += 1;
        await result;
        return success({ ...receiptEnvelope, profileId: userId, profileVersion: 8 });
      } }),
      profile,
      draft: { displayName: 'Alice', avatarUrl: '', timezone: '' },
      onReload: async () => {},
    };

    const first = submitProfileUpdateOnce(gate, input);
    await expect(submitProfileUpdateOnce(gate, input)).resolves.toEqual({ status: 'submitting' });
    expect(calls).toBe(1);
    resolve?.();
    await expect(first).resolves.toEqual({ status: 'saved' });
    await expect(submitProfileUpdateOnce(gate, input)).resolves.toEqual({ status: 'saved' });
    expect(calls).toBe(2);
  });
});

describe('wallet settings commands', () => {
  it('adds against the current profile version and blocks a sixth address locally', async () => {
    const calls: unknown[] = [];
    let reloads = 0;
    const client = api({
      addWalletAddress: async (input) => {
        calls.push(input);
        return success({
          ...receiptEnvelope,
          walletAddressId,
          walletAddressVersion: 1,
          profileVersion: 8,
        });
      },
    });

    const saved = await addWalletAddress({
      api: client,
      profile,
      wallets: [wallet],
      draft: { address, label: 'Main' },
      onReload: async () => { reloads += 1; },
    });
    const limited = await addWalletAddress({
      api: client,
      profile,
      wallets: Array.from({ length: 5 }, (_, index) => ({ ...wallet, walletAddressId: `72000000-0000-4000-8000-00000000000${index + 2}` })),
      draft: { address, label: '' },
      onReload: async () => { reloads += 1; },
    });

    expect(saved).toEqual({ status: 'saved' });
    expect(limited).toEqual({ status: 'failed', code: 'identity_address_limit_reached' });
    expect(calls).toEqual([{ expectedVersion: 7, address, label: 'Main' }]);
    expect(reloads).toBe(1);
  });

  it('uses the displayed row version for visibility and removal', async () => {
    const visibilityCalls: unknown[] = [];
    const removalCalls: unknown[] = [];
    let reloads = 0;
    const client = api({
      setWalletAddressVisibility: async (input) => {
        visibilityCalls.push(input);
        return success({ ...receiptEnvelope, walletAddressId, walletAddressVersion: 6 });
      },
      removeWalletAddress: async (input) => {
        removalCalls.push(input);
        return success({ ...receiptEnvelope, walletAddressId, walletAddressVersion: 6 });
      },
    });

    await changeWalletVisibility({ api: client, wallet, visibility: 'public', onReload: async () => { reloads += 1; } });
    await removeWalletAddress({ api: client, wallet, onReload: async () => { reloads += 1; } });

    expect(visibilityCalls).toEqual([{ walletAddressId, expectedVersion: 5, visibility: 'public' }]);
    expect(removalCalls).toEqual([{ walletAddressId, expectedVersion: 5 }]);
    expect(reloads).toBe(2);
  });

  it.each(['identity_version_conflict', 'identity_idempotency_conflict'] as const)(
    'does not reload or retry on %s',
    async (code) => {
      let calls = 0;
      let reloads = 0;
      const state = await changeWalletVisibility({
        api: api({
          setWalletAddressVisibility: async () => {
            calls += 1;
            return failure(code);
          },
        }),
        wallet,
        visibility: 'public',
        onReload: async () => { reloads += 1; },
      });

      expect(state).toEqual({ status: 'conflict', code });
      expect(calls).toBe(1);
      expect(reloads).toBe(0);
    },
  );

  it('shares one synchronous gate across concurrent wallet mutations and releases it after settlement', async () => {
    const gate = createPendingActionGate();
    let addCalls = 0;
    let removeCalls = 0;
    let resolve: (() => void) | undefined;
    const pending = new Promise<void>((next) => { resolve = next; });
    const client = api({
      addWalletAddress: async () => {
        addCalls += 1;
        await pending;
        return success({ ...receiptEnvelope, walletAddressId, walletAddressVersion: 6, profileVersion: 8 });
      },
      removeWalletAddress: async () => {
        removeCalls += 1;
        return success({ ...receiptEnvelope, walletAddressId, walletAddressVersion: 6 });
      },
    });
    const addInput = {
      api: client,
      profile,
      wallets: [wallet],
      draft: { address, label: 'Main' },
      onReload: async () => {},
    };
    const removeInput = { api: client, wallet, onReload: async () => {} };

    const first = addWalletAddressOnce(gate, addInput);
    await expect(removeWalletAddressOnce(gate, removeInput)).resolves.toEqual({ status: 'submitting' });
    expect(addCalls).toBe(1);
    expect(removeCalls).toBe(0);
    resolve?.();
    await expect(first).resolves.toEqual({ status: 'saved' });
    await expect(removeWalletAddressOnce(gate, removeInput)).resolves.toEqual({ status: 'saved' });
    expect(removeCalls).toBe(1);
  });
});

function failure(code: IdentityApiFailure['code']): IdentityApiFailure {
  return { ok: false, code };
}

function success<T>(data: T): IdentityApiResult<T> {
  return { ok: true, data };
}

function api(overrides: Partial<IdentityApiClient>): IdentityApiClient {
  return {
    getProfile: async () => success(profile),
    listWalletAddresses: async () => success([wallet]),
    updateProfile: async () => failure('identity_persistence_failed'),
    addWalletAddress: async () => failure('identity_persistence_failed'),
    setWalletAddressVisibility: async () => failure('identity_persistence_failed'),
    removeWalletAddress: async () => failure('identity_persistence_failed'),
    ...overrides,
  };
}

function unavailableApi(): IdentityApiClient {
  return api({});
}
