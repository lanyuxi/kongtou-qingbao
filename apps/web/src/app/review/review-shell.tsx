'use client';

import type { ReactNode } from 'react';

import type { ReviewSessionController } from '../../lib/review-session.js';

export function ReviewShell({
  children,
  onSignOut,
}: {
  readonly children: ReactNode;
  readonly onSignOut?: () => void;
}) {
  return (
    <div className="review-shell">
      <header className="review-header">
        <div>
          <span className="review-kicker">受限工作区</span>
          <strong className="review-brand">AI Run 审核</strong>
        </div>
        {onSignOut === undefined ? null : (
          <button className="review-button review-button-secondary" type="button" onClick={onSignOut}>
            退出登录
          </button>
        )}
      </header>
      <div className="review-content">{children}</div>
    </div>
  );
}

export async function signOutAndRedirect(
  session: ReviewSessionController,
  redirect: (path: string) => void,
): Promise<void> {
  await session.signOut();
  redirect('/review/sign-in');
}
