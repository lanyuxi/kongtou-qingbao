'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';

import { useReviewBrowserRuntime } from '../../../../lib/review-browser-runtime.js';
import { createPendingActionGate } from '../../../../lib/review-pending-action.js';
import {
  loadTutorialDetail,
  PublishVersionForm,
  RetireForm,
  TutorialDetail,
  type TutorialDetailState,
} from '../../../../components/tutorial/tutorial-detail.js';
import { ReviewShell, runReviewSignOutOnce, signOutAndRedirect } from '../../review-shell.js';

export default function TutorialDetailPage({ params }: {
  readonly params: Promise<{ tutorialId: string }>;
}) {
  const { tutorialId } = use(params);
  const router = useRouter();
  const runtime = useReviewBrowserRuntime();
  const [state, setState] = useState<TutorialDetailState>({ status: 'loading' });
  const [signOutPending, setSignOutPending] = useState(false);
  const gate = useRef(createPendingActionGate());

  const refresh = useCallback(async () => {
    if (runtime === null) return;
    setState(await loadTutorialDetail({
      session: runtime.session,
      api: runtime.tutorialApi,
      tutorialId,
      redirect: (path: string) => router.replace(path),
    }));
  }, [router, runtime, tutorialId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function clearAndSignIn() {
    if (runtime !== null) await runtime.session.signOut();
    router.replace('/review/sign-in');
  }

  async function signOut() {
    if (runtime === null) return;
    await runReviewSignOutOnce(gate.current, async () => {
      await signOutAndRedirect(runtime.session, (path) => router.replace(path));
    }, setSignOutPending);
  }

  return (
    <ReviewShell {...(runtime === null ? {} : { onSignOut: signOut, signOutPending })}>
      <main>
        <p className="review-back">
          <Link className="review-link" href="/review/tutorials">← 返回教程审核</Link>
        </p>
        {runtime === null || state.status === 'loading' ? (
          <p className="review-state">正在确认审核会话…</p>
        ) : state.status === 'forbidden' ? (
          <p className="review-state review-message-error" role="alert">当前账号没有有效的审核权限。</p>
        ) : state.status === 'not_found' ? (
          <p className="review-state">未找到该教程。</p>
        ) : state.status === 'failed' ? (
          <p className="review-state review-message-error" role="alert">教程详情暂时无法加载。请稍后重试。</p>
        ) : (
          <>
            <TutorialDetail tutorial={state.tutorial} />
            {state.tutorial.status === 'published' || state.tutorial.status === 'needs_review' ? (
              <section className="review-panel">
                <h2>发布新版本</h2>
                <PublishVersionForm
                  api={runtime.tutorialApi}
                  tutorial={state.tutorial}
                  onRefresh={refresh}
                  onSessionExpired={clearAndSignIn}
                />
              </section>
            ) : null}
            {state.tutorial.status !== 'retired' ? (
              <section className="review-panel">
                <h2>下线教程</h2>
                <RetireForm
                  api={runtime.tutorialApi}
                  tutorial={state.tutorial}
                  onRefresh={refresh}
                  onSessionExpired={clearAndSignIn}
                />
              </section>
            ) : null}
          </>
        )}
      </main>
    </ReviewShell>
  );
}
