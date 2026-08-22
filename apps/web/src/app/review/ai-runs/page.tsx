'use client';

import type { FailedAiRunListQuery } from '@airdrop/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  FailedAiRunList,
  loadFailedAiRunList,
  type FailedAiRunListState,
} from '../../../components/review/failed-ai-run-list.js';
import { useReviewBrowserRuntime } from '../../../lib/review-browser-runtime.js';
import { ReviewShell, signOutAndRedirect } from '../review-shell.js';

const initialQuery: FailedAiRunListQuery = {
  reviewState: 'all',
  status: 'all',
  cursor: null,
  limit: 25,
};

export default function FailedAiRunListPage() {
  const router = useRouter();
  const runtime = useReviewBrowserRuntime();
  const [query, setQuery] = useState<FailedAiRunListQuery>(initialQuery);
  const [state, setState] = useState<FailedAiRunListState>({ status: 'loading' });

  useEffect(() => {
    if (runtime === null) return undefined;
    let active = true;
    setState({ status: 'loading' });
    void loadFailedAiRunList({
      session: runtime.session,
      api: runtime.api,
      query,
      redirect: (path) => router.replace(path),
    }).then((next) => { if (active) setState(next); });
    return () => { active = false; };
  }, [query, router, runtime]);

  return (
    <ReviewShell onSignOut={() => {
      if (runtime !== null) {
        void signOutAndRedirect(runtime.session, (path) => router.replace(path));
      }
    }}>
      <main>
        <FailedAiRunList
          state={state}
          query={query}
          onQueryChange={setQuery}
          onNext={(cursor) => setQuery((current) => ({ ...current, cursor }))}
        />
      </main>
    </ReviewShell>
  );
}
