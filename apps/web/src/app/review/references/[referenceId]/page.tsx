'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';

import { useReviewBrowserRuntime } from '../../../../lib/review-browser-runtime.js';
import { createPendingActionGate } from '../../../../lib/review-pending-action.js';
import { ReviewShell, runReviewSignOutOnce, signOutAndRedirect } from '../../review-shell.js';
import {
  loadReferenceDetail,
  ReferenceDecisionForm,
  ReferenceDetail,
  type ReferenceDetailState,
} from '../../../../components/reference/reference-detail.js';

export default function ReferenceDetailPage({ params }: {
  readonly params: Promise<{ referenceId: string }>;
}) {
  const { referenceId } = use(params);
  const router = useRouter();
  const runtime = useReviewBrowserRuntime();
  const [state, setState] = useState<ReferenceDetailState>({ status: 'loading' });
  const [signOutPending, setSignOutPending] = useState(false);
  const gate = useRef(createPendingActionGate());

  const refresh = useCallback(async () => {
    if (runtime === null) return;
    setState(await loadReferenceDetail({
      session: runtime.session,
      api: runtime.referenceApi,
      referenceId,
      redirect: (path: string) => router.replace(path),
    }));
  }, [referenceId, router, runtime]);

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
          <p className="review-state">未找到该引用条目。</p>
        ) : state.status === 'failed' ? (
          <p className="review-state review-message-error" role="alert">引用详情暂时无法加载。请稍后重试。</p>
        ) : (
          <>
            <ReferenceDetail reference={state.reference} />
            <section className="review-panel">
              <h2>追加引用决策</h2>
              <ReferenceDecisionForm
                api={runtime.referenceApi}
                reference={state.reference}
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
