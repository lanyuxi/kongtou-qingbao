'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';

import { FailedAiRunDecisionForm } from '../../../../components/review/failed-ai-run-decision-form.js';
import {
  FailedAiRunDetail,
  loadFailedAiRunDetail,
  type FailedAiRunDetailState,
} from '../../../../components/review/failed-ai-run-detail.js';
import {
  type ReviewBrowserRuntime,
  useReviewBrowserRuntime,
} from '../../../../lib/review-browser-runtime.js';
import { ReviewShell, signOutAndRedirect } from '../../review-shell.js';

export default function FailedAiRunDetailPage({
  params,
}: {
  readonly params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);
  const router = useRouter();
  const runtime = useReviewBrowserRuntime();
  const [state, setState] = useState<FailedAiRunDetailState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (runtime === null) return;
    const next = await loadFailedAiRunDetail({
      session: runtime.session,
      api: runtime.api,
      runId,
      redirect: (path) => router.replace(path),
    });
    setState(next);
  }, [router, runId, runtime]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <ReviewShell onSignOut={() => {
      if (runtime !== null) {
        void signOutAndRedirect(runtime.session, (path) => router.replace(path));
      }
    }}>
      <main>
        <p className="review-back"><Link className="review-link" href="/review/ai-runs">← 返回列表</Link></p>
        {runtime === null ? <p className="review-state">正在确认审核会话…</p> : (
          <DetailBody
            state={state}
            runtime={runtime}
            runId={runId}
            refresh={refresh}
            sessionExpired={() => router.replace('/review/sign-in')}
          />
        )}
      </main>
    </ReviewShell>
  );
}

function DetailBody({
  state,
  runtime,
  runId,
  refresh,
  sessionExpired,
}: {
  readonly state: FailedAiRunDetailState;
  readonly runtime: ReviewBrowserRuntime;
  readonly runId: string;
  readonly refresh: () => Promise<void>;
  readonly sessionExpired: () => void;
}) {
  if (state.status === 'loading') return <p className="review-state">正在确认审核会话…</p>;
  if (state.status === 'forbidden') return <p className="review-state review-message-error" role="alert">当前账号没有有效的审核权限。</p>;
  if (state.status === 'not_found') return <p className="review-state">未找到该 failed AI run。</p>;
  if (state.status === 'failed') return <p className="review-state review-message-error" role="alert">审核详情暂时无法加载。请稍后重试。</p>;

  return (
    <>
      <FailedAiRunDetail detail={state.detail} />
      <section className="review-panel" aria-labelledby="review-decision-heading">
        <h2 id="review-decision-heading">追加审核决策</h2>
        <FailedAiRunDecisionForm
          api={runtime.api}
          runId={runId}
          displayedReviewVersion={state.detail.run.reviewVersion}
          onRefresh={refresh}
          onSessionExpired={sessionExpired}
        />
      </section>
    </>
  );
}
