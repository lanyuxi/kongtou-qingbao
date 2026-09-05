'use client';

import type {
  IdentityErrorCode,
  UserProfileRow,
  WalletAddressRow,
  WalletVisibility,
} from '@airdrop/contracts';
import { useRef, useState, type FormEvent } from 'react';

import type { IdentityApiClient } from '../../lib/identity-api-client.js';
import {
  createPendingActionGate,
  type PendingActionGate,
} from '../../lib/review-pending-action.js';
import {
  IdentityErrorState,
  IdentitySafetyNotice,
  IdentitySettingsNavigation,
} from './identity-settings-elements.js';
import {
  SubmissionState,
  submissionFailure,
  type IdentitySubmissionState,
} from './profile-settings.js';

export type WalletSettingsState =
  | { readonly status: 'loading' }
  | { readonly status: 'sign_in_required' }
  | { readonly status: 'failed'; readonly code: 'identity_query_failed' | 'identity_profile_not_found' }
  | {
    readonly status: 'ready';
    readonly profile: UserProfileRow;
    readonly wallets: readonly WalletAddressRow[];
  };

interface WalletDraft {
  readonly address: string;
  readonly label: string;
}

export function WalletSettings({ state, api, onReload }: {
  readonly state: WalletSettingsState;
  readonly api: IdentityApiClient;
  readonly onReload: () => Promise<void>;
}) {
  return (
    <main className="settings-page">
      <header className="page-header">
        <h1 className="page-title">身份设置</h1>
        <p className="page-subtitle">仅管理用于展示和识别的 EVM 公开地址。</p>
      </header>
      <IdentitySettingsNavigation current="wallets" />
      <IdentitySafetyNotice />
      {state.status === 'loading' ? <p className="identity-message">正在加载钱包地址…</p> : null}
      {state.status === 'sign_in_required' ? <IdentityErrorState code="identity_session_required" /> : null}
      {state.status === 'failed' ? <IdentityErrorState code={state.code} /> : null}
      {state.status === 'ready' ? (
        <WalletManager
          key={`${state.profile.version}:${state.wallets.map((item) => `${item.walletAddressId}:${item.version}`).join(',')}`}
          profile={state.profile}
          wallets={state.wallets}
          api={api}
          onReload={onReload}
        />
      ) : null}
    </main>
  );
}

function WalletManager({ profile, wallets, api, onReload }: {
  readonly profile: UserProfileRow;
  readonly wallets: readonly WalletAddressRow[];
  readonly api: IdentityApiClient;
  readonly onReload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<WalletDraft>({ address: '', label: '' });
  const [submission, setSubmission] = useState<IdentitySubmissionState>({ status: 'idle' });
  const submissionGate = useRef(createPendingActionGate());
  const pending = submission.status === 'submitting';

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await addWalletAddressOnce(submissionGate.current, { api, profile, wallets, draft, onReload }));
  }

  async function setVisibility(wallet: WalletAddressRow, visibility: WalletVisibility) {
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await changeWalletVisibilityOnce(submissionGate.current, { api, wallet, visibility, onReload }));
  }

  async function remove(wallet: WalletAddressRow) {
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await removeWalletAddressOnce(submissionGate.current, { api, wallet, onReload }));
  }

  return (
    <>
      <section className="card identity-card" aria-labelledby="wallet-add-heading">
        <h2 id="wallet-add-heading">添加 EVM 地址</h2>
        <p>新地址默认为 hidden，最多保存 5 个。</p>
        <form className="identity-form" onSubmit={(event) => { void add(event); }}>
          <div className="identity-field">
            <label htmlFor="identity-wallet-address">公开钱包地址</label>
            <input id="identity-wallet-address" value={draft.address} disabled={pending} placeholder="0x…" onChange={(event) => setDraft((value) => ({ ...value, address: event.currentTarget.value }))} />
          </div>
          <div className="identity-field">
            <label htmlFor="identity-wallet-label">标签（可选）</label>
            <input id="identity-wallet-label" value={draft.label} disabled={pending} onChange={(event) => setDraft((value) => ({ ...value, label: event.currentTarget.value }))} />
          </div>
          <SubmissionState state={submission} onReload={onReload} />
          <button className="button identity-primary-button" type="submit" disabled={pending || wallets.length >= 5}>
            添加为 hidden
          </button>
        </form>
      </section>
      <section className="card identity-card" aria-labelledby="wallet-list-heading">
        <h2 id="wallet-list-heading">已保存地址</h2>
        {wallets.length === 0 ? <p className="identity-message">尚未添加钱包地址。</p> : (
          <div className="identity-wallet-list">
            {wallets.map((wallet) => (
              <article className="identity-wallet-row" key={wallet.walletAddressId}>
                <div>
                  <strong>{wallet.label ?? '未命名地址'}</strong>
                  <code>{wallet.address}</code>
                  <span>EVM · v{wallet.version}</span>
                </div>
                <div className="identity-wallet-actions">
                  <label htmlFor={`wallet-visibility-${wallet.walletAddressId}`}>可见性</label>
                  <select
                    id={`wallet-visibility-${wallet.walletAddressId}`}
                    value={wallet.visibility}
                    disabled={pending}
                    onChange={(event) => { void setVisibility(wallet, event.currentTarget.value as WalletVisibility); }}
                  >
                    <option value="hidden">hidden</option>
                    <option value="public">public</option>
                  </select>
                  <button className="button" type="button" disabled={pending} onClick={() => { void remove(wallet); }}>移除</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export async function addWalletAddress(input: {
  readonly api: IdentityApiClient;
  readonly profile: UserProfileRow;
  readonly wallets: readonly WalletAddressRow[];
  readonly draft: WalletDraft;
  readonly onReload: () => Promise<void>;
}): Promise<IdentitySubmissionState> {
  if (input.wallets.length >= 5) {
    return { status: 'failed', code: 'identity_address_limit_reached' };
  }
  const result = await input.api.addWalletAddress({
    expectedVersion: input.profile.version,
    address: input.draft.address.trim(),
    label: nullIfEmpty(input.draft.label),
  });
  return finishMutation(result, input.onReload);
}

export async function addWalletAddressOnce(
  gate: PendingActionGate,
  input: Parameters<typeof addWalletAddress>[0],
): Promise<IdentitySubmissionState> {
  return runWalletMutationOnce(gate, () => addWalletAddress(input));
}

export async function changeWalletVisibility(input: {
  readonly api: IdentityApiClient;
  readonly wallet: WalletAddressRow;
  readonly visibility: WalletVisibility;
  readonly onReload: () => Promise<void>;
}): Promise<IdentitySubmissionState> {
  const result = await input.api.setWalletAddressVisibility({
    walletAddressId: input.wallet.walletAddressId,
    expectedVersion: input.wallet.version,
    visibility: input.visibility,
  });
  return finishMutation(result, input.onReload);
}

export async function changeWalletVisibilityOnce(
  gate: PendingActionGate,
  input: Parameters<typeof changeWalletVisibility>[0],
): Promise<IdentitySubmissionState> {
  return runWalletMutationOnce(gate, () => changeWalletVisibility(input));
}

export async function removeWalletAddress(input: {
  readonly api: IdentityApiClient;
  readonly wallet: WalletAddressRow;
  readonly onReload: () => Promise<void>;
}): Promise<IdentitySubmissionState> {
  const result = await input.api.removeWalletAddress({
    walletAddressId: input.wallet.walletAddressId,
    expectedVersion: input.wallet.version,
  });
  return finishMutation(result, input.onReload);
}

export async function removeWalletAddressOnce(
  gate: PendingActionGate,
  input: Parameters<typeof removeWalletAddress>[0],
): Promise<IdentitySubmissionState> {
  return runWalletMutationOnce(gate, () => removeWalletAddress(input));
}

async function runWalletMutationOnce(
  gate: PendingActionGate,
  mutation: () => Promise<IdentitySubmissionState>,
): Promise<IdentitySubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    return await mutation();
  } finally {
    gate.finish();
  }
}

async function finishMutation(
  result: { readonly ok: true } | { readonly ok: false; readonly code: IdentityErrorCode },
  onReload: () => Promise<void>,
): Promise<IdentitySubmissionState> {
  if (result.ok) {
    await onReload();
    return { status: 'saved' };
  }
  return submissionFailure(result.code);
}

function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
