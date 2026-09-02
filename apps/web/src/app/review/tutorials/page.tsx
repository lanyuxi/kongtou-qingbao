'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useReviewBrowserRuntime } from '../../../lib/review-browser-runtime.js';
import { createPendingActionGate } from '../../../lib/review-pending-action.js';
import {
  applyCandidateCursor,
  changeCandidateFilters,
  CandidateList,
  loadCandidateList,
  type CandidateListState,
} from '../../../components/tutorial/candidate-list.js';
import {
  applyTutorialCursor,
  changeTutorialFilters,
  loadTutorialList,
  TutorialList,
  type TutorialListState,
} from '../../../components/tutorial/tutorial-list.js';
import type {
  TutorialCandidateListQueryInput,
  TutorialListQueryInput,
} from '../../../lib/tutorial-review-api-client.js';
import { ReviewShell, runReviewSignOutOnce, signOutAndRedirect } from '../review-shell.js';

const candidateInitial: TutorialCandidateListQueryInput = {
  status: 'pending', cursor: null, limit: 25,
};
const tutorialInitial: TutorialListQueryInput = {
  status: 'all', cursor: null, limit: 25,
};

export default function TutorialReviewPage() {
  const router = useRouter();
  const runtime = useReviewBrowserRuntime();
  const [candidateQuery, setCandidateQuery] = useState(candidateInitial);
  const [tutorialQuery, setTutorialQuery] = useState(tutorialInitial);
  const [candidateState, setCandidateState] = useState<CandidateListState>({ status: 'loading' });
  const [tutorialState, setTutorialState] = useState<TutorialListState>({ status: 'loading' });
  const [signOutPending, setSignOutPending] = useState(false);
  const gate = useRef(createPendingActionGate());

  const reload = useCallback(async () => {
    if (runtime === null) return;
    const redirect = (path: string) => router.replace(path);
    setCandidateState(await loadCandidateList({
      session: runtime.session, api: runtime.tutorialApi, query: candidateQuery, redirect,
    }));
    setTutorialState(await loadTutorialList({
      session: runtime.session, api: runtime.tutorialApi, query: tutorialQuery, redirect,
    }));
  }, [candidateQuery, router, runtime, tutorialQuery]);

  useEffect(() => { void reload(); }, [reload]);

  async function signOut() {
    if (runtime === null) return;
    await runReviewSignOutOnce(gate.current, async () => {
      await signOutAndRedirect(runtime.session, (path) => router.replace(path));
    }, setSignOutPending);
  }

  return (
    <ReviewShell {...(runtime === null ? {} : { onSignOut: signOut, signOutPending })}>
      <main>
        <CandidateList
          state={candidateState}
          query={candidateQuery}
          onQueryChange={(query) => setCandidateQuery((value) => changeCandidateFilters(value, { status: query.status }))}
          onNext={(cursor) => setCandidateQuery((query) => applyCandidateCursor(query, cursor))}
        />
        <TutorialList
          state={tutorialState}
          query={tutorialQuery}
          onQueryChange={(query) => setTutorialQuery((value) => changeTutorialFilters(value, { status: query.status }))}
          onNext={(cursor) => setTutorialQuery((query) => applyTutorialCursor(query, cursor))}
        />
      </main>
    </ReviewShell>
  );
}
