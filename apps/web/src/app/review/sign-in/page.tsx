'use client';

import { useRouter } from 'next/navigation';

import { SignInForm } from '../../../components/review/sign-in-form.js';
import { useReviewBrowserRuntime } from '../../../lib/review-browser-runtime.js';
import { ReviewShell } from '../review-shell.js';

export default function ReviewSignInPage() {
  const router = useRouter();
  const runtime = useReviewBrowserRuntime();

  return (
    <ReviewShell>
      <main className="review-sign-in" aria-labelledby="review-sign-in-heading">
        <section className="review-panel">
          <h1 id="review-sign-in-heading">审核人登录</h1>
          <p>仅已授权的审核人可访问 failed AI run 工作区。</p>
          {runtime === null ? <p className="review-state">正在准备安全登录…</p> : (
            <SignInForm session={runtime.session} onSignedIn={(path) => router.replace(path)} />
          )}
        </section>
      </main>
    </ReviewShell>
  );
}
