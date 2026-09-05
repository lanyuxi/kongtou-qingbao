'use client';

import Link from 'next/link';
import { useState } from 'react';

import {
  identitySignInPath,
  type IdentityAuthController,
  type IdentityAuthFailureCode,
} from '../../lib/identity-auth-session.js';
import { type PendingActionGate } from '../../lib/review-pending-action.js';

export type IdentityAuthState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' }
  | { readonly status: 'link_sent' }
  | { readonly status: 'signed_in' }
  | { readonly status: 'signed_out' }
  | { readonly status: 'failed'; readonly code: IdentityAuthFailureCode };

export const identityAuthSafetyMessage =
  '我们只会向你的邮箱发送一次性登录链接，不会要求密码，也永远不会索取私钥、助记词、钱包密码或签名密钥。';

export function identityAuthMessage(code: IdentityAuthFailureCode): string {
  switch (code) {
    case 'identity_auth_email_invalid':
      return '邮箱格式无效，请检查后重试。';
    case 'identity_auth_link_failed':
      return '登录链接发送失败，请稍后重试。';
    case 'identity_auth_callback_invalid':
      return '登录链接无效或已过期，请重新申请。';
    case 'identity_auth_sign_out_failed':
      return '登出失败，请重试。';
  }
}

export function IdentityAuthMessage({ state }: {
  readonly state: IdentityAuthState;
}) {
  if (state.status !== 'failed') return null;
  return (
    <p className="identity-message identity-message-error" role="alert">
      {identityAuthMessage(state.code)}
    </p>
  );
}

export function MagicLinkForm({ state, onSubmit }: {
  readonly state: IdentityAuthState;
  readonly onSubmit: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const pending = state.status === 'pending';

  return (
    <main className="settings-page identity-auth-page">
      <header className="page-header">
        <h1 className="page-title">登录</h1>
        <p className="page-subtitle">使用邮箱一次性链接登录，不使用密码。</p>
      </header>
      <section className="card identity-card" aria-labelledby="identity-auth-heading">
        <h2 id="identity-auth-heading">邮箱登录链接</h2>
        <p className="identity-auth-safety">{identityAuthSafetyMessage}</p>
        {state.status === 'link_sent' ? (
          <div className="identity-auth-actions">
            <p className="identity-message identity-message-success" role="status">
              登录链接已发送，请在邮箱中打开该链接完成登录。
            </p>
            <Link className="button" href={identitySignInPath}>重新申请登录链接</Link>
          </div>
        ) : (
          <form
            className="identity-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pending) void onSubmit(email);
            }}
          >
            <div className="identity-field">
              <label htmlFor="identity-auth-email">邮箱</label>
              <input
                id="identity-auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                disabled={pending}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </div>
            <IdentityAuthMessage state={state} />
            <button className="button identity-primary-button" type="submit" disabled={pending}>
              {pending ? '正在发送…' : '发送登录链接'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

export function AuthCallbackStatus({ state }: {
  readonly state: IdentityAuthState;
}) {
  return (
    <main className="settings-page identity-auth-page">
      <header className="page-header">
        <h1 className="page-title">登录</h1>
        <p className="page-subtitle">正在校验邮箱登录链接。</p>
      </header>
      <section className="card identity-card" aria-labelledby="identity-callback-heading">
        <h2 id="identity-callback-heading">邮箱登录链接</h2>
        {state.status === 'signed_in' ? (
          <p className="identity-message identity-message-success" role="status">
            登录成功，正在返回…
          </p>
        ) : null}
        {state.status === 'pending' || state.status === 'idle' ? (
          <p className="identity-message" role="status">正在完成登录…</p>
        ) : null}
        {state.status === 'failed' ? (
          <div className="identity-auth-actions">
            <IdentityAuthMessage state={state} />
            <Link className="button" href={identitySignInPath}>重新申请登录链接</Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export function IdentitySessionBar({ state, onSignOut }: {
  readonly state: IdentityAuthState;
  readonly onSignOut: () => Promise<void>;
}) {
  const pending = state.status === 'pending';
  return (
    <div className="identity-session-bar">
      <span className="identity-session-state">已登录</span>
      <IdentityAuthMessage state={state} />
      <button
        className="button"
        type="button"
        disabled={pending}
        onClick={() => {
          if (!pending) void onSignOut();
        }}
      >
        {pending ? '正在登出…' : '登出'}
      </button>
    </div>
  );
}

export async function submitMagicLinkRequestOnce(
  gate: PendingActionGate,
  controller: IdentityAuthController,
  input: { readonly email: string; readonly redirectTo: string },
): Promise<IdentityAuthState> {
  if (!gate.begin()) return { status: 'pending' };
  try {
    const outcome = await controller.requestMagicLink(input);
    return outcome.ok
      ? { status: 'link_sent' }
      : { status: 'failed', code: outcome.code };
  } finally {
    gate.finish();
  }
}

export async function completeSignInOnce(
  gate: PendingActionGate,
  controller: IdentityAuthController,
  params: URLSearchParams,
): Promise<IdentityAuthState> {
  if (!gate.begin()) return { status: 'pending' };
  try {
    const outcome = await controller.completeSignIn(params);
    return outcome.ok
      ? { status: 'signed_in' }
      : { status: 'failed', code: outcome.code };
  } finally {
    gate.finish();
  }
}

export async function signOutOnce(
  gate: PendingActionGate,
  controller: IdentityAuthController,
): Promise<IdentityAuthState> {
  if (!gate.begin()) return { status: 'pending' };
  try {
    const outcome = await controller.signOut();
    return outcome.ok
      ? { status: 'signed_out' }
      : { status: 'failed', code: outcome.code };
  } finally {
    gate.finish();
  }
}
