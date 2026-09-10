'use client';

import Link from 'next/link';
import { useState } from 'react';

import {
  identityForgotPasswordPath,
  identitySignInPath,
  identitySignUpPath,
  type IdentityAuthController,
  type IdentityAuthFailureCode,
} from '../../lib/identity-auth-session.js';
import { type PendingActionGate } from '../../lib/review-pending-action.js';

export type IdentityAuthState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' }
  | { readonly status: 'signed_in' }
  | { readonly status: 'signed_out' }
  | { readonly status: 'registered' }
  | { readonly status: 'reset_requested' }
  | { readonly status: 'failed'; readonly code: IdentityAuthFailureCode };

export const identityAuthSafetyMessage =
  '我们使用手机号与密码登录，只会在找回密码时向你的邮箱发送一次重置链接。永远不会索取私钥、助记词、钱包密码或签名密钥。';

export function identityAuthMessage(code: IdentityAuthFailureCode): string {
  switch (code) {
    case 'identity_auth_phone_invalid':
      return '手机号格式无效，请填写 11 位中国大陆手机号。';
    case 'identity_auth_password_invalid':
      return '密码需为 8-72 位，且同时包含字母和数字。';
    case 'identity_auth_email_invalid':
      return '邮箱格式无效，请检查后重试。';
    case 'identity_auth_credentials_rejected':
      return '手机号或密码不正确。';
    case 'identity_auth_registration_failed':
      return '注册失败，该邮箱或手机号可能已被使用，请换一个或直接登录。';
    case 'identity_auth_reset_request_failed':
      return '重置请求发送失败，请稍后重试。';
    case 'identity_auth_lookup_failed':
      return '服务暂时不可用，请稍后重试。';
    case 'identity_auth_callback_invalid':
      return '登录链接无效或已过期，请重新登录。';
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

export function PasswordSignInForm({ state, onSubmit }: {
  readonly state: IdentityAuthState;
  readonly onSubmit: (phone: string, password: string) => Promise<void>;
}) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const pending = state.status === 'pending';

  return (
    <main className="settings-page identity-auth-page">
      <header className="page-header">
        <h1 className="page-title">登录</h1>
        <p className="page-subtitle">使用手机号和密码登录。</p>
      </header>
      <section className="card identity-card" aria-labelledby="identity-signin-heading">
        <h2 id="identity-signin-heading">手机号登录</h2>
        <p className="identity-auth-safety">{identityAuthSafetyMessage}</p>
        <form
          className="identity-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) void onSubmit(phone, password);
          }}
        >
          <div className="identity-field">
            <label htmlFor="identity-auth-phone">手机号</label>
            <input
              id="identity-auth-phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="11 位手机号"
              required
              value={phone}
              disabled={pending}
              onChange={(event) => setPhone(event.currentTarget.value)}
            />
          </div>
          <div className="identity-field">
            <label htmlFor="identity-auth-password">密码</label>
            <input
              id="identity-auth-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              disabled={pending}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </div>
          <IdentityAuthMessage state={state} />
          <button className="button identity-primary-button" type="submit" disabled={pending}>
            {pending ? '正在登录…' : '登录'}
          </button>
        </form>
        <p className="identity-auth-links">
          <Link className="review-link" href={identityForgotPasswordPath}>忘记密码？</Link>
          {' · '}
          <Link className="review-link" href={identitySignUpPath}>注册新账号</Link>
        </p>
      </section>
    </main>
  );
}

export function PasswordSignUpForm({ state, onSubmit }: {
  readonly state: IdentityAuthState;
  readonly onSubmit: (
    input: { phone: string; email: string; password: string },
  ) => Promise<void>;
}) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const pending = state.status === 'pending';
  const mismatch = confirmation !== '' && confirmation !== password;

  return (
    <main className="settings-page identity-auth-page">
      <header className="page-header">
        <h1 className="page-title">注册</h1>
        <p className="page-subtitle">用手机号注册，登录时也只填手机号。</p>
      </header>
      <section className="card identity-card" aria-labelledby="identity-signup-heading">
        <h2 id="identity-signup-heading">创建账号</h2>
        <p className="identity-auth-safety">
          邮箱只用于找回密码和确认账号归属，不会出现在你的公开主页上。
        </p>
        {state.status === 'registered' ? (
          <div className="identity-auth-actions">
            <p className="identity-message identity-message-success" role="status">
              注册成功。我们已向你的邮箱发送确认链接，完成确认后即可用手机号登录。
            </p>
            <Link className="button" href={identitySignInPath}>去登录</Link>
          </div>
        ) : (
          <form
            className="identity-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (pending || mismatch) return;
              void onSubmit({ phone, email, password });
            }}
          >
            <div className="identity-field">
              <label htmlFor="identity-signup-phone">手机号</label>
              <input
                id="identity-signup-phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="11 位手机号"
                required
                value={phone}
                disabled={pending}
                onChange={(event) => setPhone(event.currentTarget.value)}
              />
            </div>
            <div className="identity-field">
              <label htmlFor="identity-signup-email">邮箱（用于找回密码）</label>
              <input
                id="identity-signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                disabled={pending}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </div>
            <div className="identity-field">
              <label htmlFor="identity-signup-password">密码</label>
              <input
                id="identity-signup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                disabled={pending}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
              <p className="identity-field-hint">8-72 位，需同时包含字母和数字。</p>
            </div>
            <div className="identity-field">
              <label htmlFor="identity-signup-confirmation">确认密码</label>
              <input
                id="identity-signup-confirmation"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                required
                value={confirmation}
                disabled={pending}
                onChange={(event) => setConfirmation(event.currentTarget.value)}
              />
              {mismatch ? (
                <p className="identity-message identity-message-error" role="alert">
                  两次输入的密码不一致。
                </p>
              ) : null}
            </div>
            <IdentityAuthMessage state={state} />
            <button className="button identity-primary-button" type="submit" disabled={pending}>
              {pending ? '正在注册…' : '注册'}
            </button>
          </form>
        )}
        <p className="identity-auth-links">
          已有账号？<Link className="review-link" href={identitySignInPath}>去登录</Link>
        </p>
      </section>
    </main>
  );
}

export function ForgotPasswordForm({ state, onSubmit }: {
  readonly state: IdentityAuthState;
  readonly onSubmit: (phone: string) => Promise<void>;
}) {
  const [phone, setPhone] = useState('');
  const pending = state.status === 'pending';

  return (
    <main className="settings-page identity-auth-page">
      <header className="page-header">
        <h1 className="page-title">找回密码</h1>
        <p className="page-subtitle">填写注册时的手机号，我们会把重置链接发到绑定邮箱。</p>
      </header>
      <section className="card identity-card" aria-labelledby="identity-reset-heading">
        <h2 id="identity-reset-heading">重置密码</h2>
        {state.status === 'reset_requested' ? (
          <div className="identity-auth-actions">
            <p className="identity-message identity-message-success" role="status">
              如果该手机号已注册，重置链接已发送到绑定邮箱，请查收。
            </p>
            <Link className="button" href={identitySignInPath}>返回登录</Link>
          </div>
        ) : (
          <form
            className="identity-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pending) void onSubmit(phone);
            }}
          >
            <div className="identity-field">
              <label htmlFor="identity-reset-phone">手机号</label>
              <input
                id="identity-reset-phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="11 位手机号"
                required
                value={phone}
                disabled={pending}
                onChange={(event) => setPhone(event.currentTarget.value)}
              />
            </div>
            <IdentityAuthMessage state={state} />
            <button className="button identity-primary-button" type="submit" disabled={pending}>
              {pending ? '正在发送…' : '发送重置链接'}
            </button>
          </form>
        )}
        <p className="identity-auth-links">
          <Link className="review-link" href={identitySignInPath}>返回登录</Link>
        </p>
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
        <p className="page-subtitle">正在校验登录链接。</p>
      </header>
      <section className="card identity-card" aria-labelledby="identity-callback-heading">
        <h2 id="identity-callback-heading">登录链接</h2>
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
            <Link className="button" href={identitySignInPath}>返回登录</Link>
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

export async function submitSignInOnce(
  gate: PendingActionGate,
  controller: IdentityAuthController,
  input: { readonly phone: string; readonly password: string },
): Promise<IdentityAuthState> {
  if (!gate.begin()) return { status: 'pending' };
  try {
    const outcome = await controller.signIn(input);
    return outcome.ok ? { status: 'signed_in' } : { status: 'failed', code: outcome.code };
  } finally {
    gate.finish();
  }
}

export async function submitSignUpOnce(
  gate: PendingActionGate,
  controller: IdentityAuthController,
  input: { readonly phone: string; readonly email: string; readonly password: string },
): Promise<IdentityAuthState> {
  if (!gate.begin()) return { status: 'pending' };
  try {
    const outcome = await controller.register(input);
    return outcome.ok ? { status: 'registered' } : { status: 'failed', code: outcome.code };
  } finally {
    gate.finish();
  }
}

export async function submitPasswordResetOnce(
  gate: PendingActionGate,
  controller: IdentityAuthController,
  input: { readonly phone: string; readonly redirectTo: string },
): Promise<IdentityAuthState> {
  if (!gate.begin()) return { status: 'pending' };
  try {
    const outcome = await controller.requestPasswordReset(input);
    return outcome.ok ? { status: 'reset_requested' } : { status: 'failed', code: outcome.code };
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
