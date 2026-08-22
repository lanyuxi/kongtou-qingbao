'use client';

import { useState, type FormEvent } from 'react';

import type { ReviewSessionController } from '../../lib/review-session.js';

export type SignInSubmissionState = { readonly status: 'idle' | 'submitting' | 'error' };

export function SignInForm({
  session,
  onSignedIn,
  initialState = { status: 'idle' },
}: {
  readonly session: ReviewSessionController;
  readonly onSignedIn: (path: string) => void;
  readonly initialState?: SignInSubmissionState;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<SignInSubmissionState>(initialState);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setState({ status: 'submitting' });
    setState(await submitReviewSignIn({ session, email, password, redirect: onSignedIn }));
  }

  return (
    <form className="review-form review-sign-in-form" onSubmit={(event) => { void onSubmit(event); }}>
      <div className="review-field">
        <label htmlFor="review-email">邮箱</label>
        <input
          id="review-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
      </div>
      <div className="review-field">
        <label htmlFor="review-password">密码</label>
        <input
          id="review-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
      </div>
      {state.status === 'error' ? (
        <p className="review-message review-message-error" role="alert">登录失败，请检查凭据后重试。</p>
      ) : null}
      <button className="review-button" type="submit" disabled={state.status === 'submitting'}>
        {state.status === 'submitting' ? '正在登录…' : '登录'}
      </button>
    </form>
  );
}

export async function submitReviewSignIn({
  session,
  email,
  password,
  redirect,
}: {
  readonly session: ReviewSessionController;
  readonly email: string;
  readonly password: string;
  readonly redirect: (path: string) => void;
}): Promise<SignInSubmissionState> {
  const result = await session.signIn(email, password);
  if (!result.ok) return { status: 'error' };
  redirect('/review/ai-runs');
  return { status: 'idle' };
}
