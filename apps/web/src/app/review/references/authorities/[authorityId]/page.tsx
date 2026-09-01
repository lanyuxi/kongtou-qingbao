'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';

import {
  AuthorityDecisionForm,
  AuthorityDetail,
  loadAuthorityDetail,
  type AuthorityDetailState,
} from '../../../../../components/reference/authority-detail.js';
import { useReviewBrowserRuntime } from '../../../../../lib/review-browser-runtime.js';
import { createPendingActionGate } from '../../../../../lib/review-pending-action.js';
import { ReviewShell, runReviewSignOutOnce, signOutAndRedirect } from '../../../review-shell.js';

export default function AuthorityDetailPage({ params }: {
  readonly params: Promise<{ authorityId: string }>;
}) {
  const { authorityId } = use(params);
  const router = useRouter();
  const runtime = useReviewBrowserRuntime();
  const [state, setState] = useState<AuthorityDetailState>({ status: 'loading' });
  const [signOutPending, setSignOutPending] = useState(false);
  const gate = useRef(createPendingActionGate());

  const refresh = useCallback(async () => {
    if (runtime === null) return;
    setState(await loadAuthorityDetail({
      session: runtime.session,
      api: runtime.referenceApi,
      authorityId,
      redirect: (path: string) => router.replace(path),
    }));
  }, [authorityId, router, runtime]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function clearAndSignIn() {
    if (runtime !== null) await runtime.session.signOut();
    router.replace('/review/sign-in');
  }

  async function signOut() {
    if (runtime === null) return;
    await runReviewSignOutOnce(gate.current, async () => {
      await signOutAndRedirect(runtime.session, (path: string) => router.replace(path));
    }, setSignOutPending);
  }

  return (
    <ReviewShell {...(runtime === null ? {} : { onSignOut: signOut, signOutPending })}>
      <main>
        <p className="review-back">
          <Link className="review-link" href="/review/references">← 返回引用审核</Link>
        </p>
        {runtime === null || state.status === 'loading' ? (
          <p className="review-state">正在确认审核会话…</p>
        ) : state.status === 'forbidden' ? (
          <p className="review-state review-message-error" role="alert">当前账号没有有效的审核权限。</p>
        ) : state.status === 'not_found' ? (
          <p className="review-state">未找到该域名权威。</p>
        ) : state.status === 'failed' ? (
          <p className="review-state review-message-error" role="alert">域名权威详情暂时无法加载。请稍后重试。</p>
        ) : (
          <>
            <AuthorityDetail authority={state.authority} />
            <section className="review-panel">
              <h2>追加权威决策</h2>
              <AuthorityDecisionForm
                api={runtime.referenceApi}
                authority={state.authority}
                onRefresh={refresh}
                onSessionExpired={clearAndSignIn}
              />
            </section>
          </>
        )}
      </main>
    </ReviewShell>
  );
}
