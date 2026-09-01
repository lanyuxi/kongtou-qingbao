'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import type { PendingActionGate } from '../../lib/review-pending-action.js';
import type { ReviewSessionController } from '../../lib/review-session.js';

export function ReviewShell({
  children,
  onSignOut,
  signOutPending = false,
}: {
  readonly children: ReactNode;
  readonly onSignOut?: () => void | Promise<void>;
  readonly signOutPending?: boolean;
}) {
  return (
    <div className="review-shell">
      <header className="review-header">
        <div>
          <span className="review-kicker">受限工作区</span>
          <strong className="review-brand">受限审核</strong>
        </div>
        {onSignOut === undefined ? null : (
          <button
            className="review-button review-button-secondary"
            type="button"
            disabled={signOutPending}
            onClick={() => { void onSignOut(); }}
          >
            {signOutPending ? '正在退出…' : '退出登录'}
          </button>
        )}
      </header>
      <nav aria-label="审核导航">
        <Link className="review-link" href="/review/ai-runs">AI Run 审核</Link>
        {' · '}
        <Link className="review-link" href="/review/security">安全审核</Link>
        {' · '}
        <Link className="review-link" href="/review/references">引用审核</Link>
      </nav>
      {signOutPending ? <p className="review-sign-out-state" role="status">正在安全退出…</p> : null}
      <div className="review-content">{children}</div>
    </div>
  );
}

export async function runReviewSignOutOnce(
  gate: PendingActionGate,
  action: () => Promise<void>,
  setPending: (pending: boolean) => void,
): Promise<boolean> {
  if (!gate.begin()) return false;
  setPending(true);
  try {
    await action();
    return true;
  } finally {
    gate.finish();
    setPending(false);
  }
}

export async function signOutAndRedirect(
  session: ReviewSessionController,
  redirect: (path: string) => void,
): Promise<void> {
  await session.signOut();
  redirect('/review/sign-in');
}
