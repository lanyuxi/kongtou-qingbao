'use client';

import type { DomainAuthorityReviewListQuery, ReferenceReviewListQuery } from '@airdrop/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  applyAuthorityCursor,
  AuthorityList,
  loadAuthorityList,
  type AuthorityListState,
} from '../../../components/reference/authority-list.js';
import {
  applyReferenceCursor,
  loadReferenceList,
  ReferenceList,
  ReferenceRegisterForm,
  type ReferenceListState,
} from '../../../components/reference/reference-list.js';
import { useReviewBrowserRuntime } from '../../../lib/review-browser-runtime.js';
import { createPendingActionGate } from '../../../lib/review-pending-action.js';
import { ReviewShell, runReviewSignOutOnce, signOutAndRedirect } from '../review-shell.js';

const authorityInitial: DomainAuthorityReviewListQuery = {
  projectId: null, state: 'all', cursor: null, limit: 25,
};
const referenceInitial: ReferenceReviewListQuery = {
  projectId: null, state: 'all', cursor: null, limit: 25,
};

export default function ReferenceReviewPage() {
  const router = useRouter();
  const runtime = useReviewBrowserRuntime();
  const [authorityQuery, setAuthorityQuery] = useState(authorityInitial);
  const [referenceQuery, setReferenceQuery] = useState(referenceInitial);
  const [authorityState, setAuthorityState] = useState<AuthorityListState>({ status: 'loading' });
  const [referenceState, setReferenceState] = useState<ReferenceListState>({ status: 'loading' });
  const [signOutPending, setSignOutPending] = useState(false);
  const gate = useRef(createPendingActionGate());

  const reload = useCallback(async () => {
    if (runtime === null) return;
    const redirect = (path: string) => router.replace(path);
    setAuthorityState(await loadAuthorityList({
      session: runtime.session, api: runtime.referenceApi, query: authorityQuery, redirect,
    }));
    setReferenceState(await loadReferenceList({
      session: runtime.session, api: runtime.referenceApi, query: referenceQuery, redirect,
    }));
  }, [authorityQuery, referenceQuery, router, runtime]);

  useEffect(() => { void reload(); }, [reload]);

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
        <AuthorityList
          state={authorityState}
          query={authorityQuery}
          onQueryChange={setAuthorityQuery}
          onNext={(cursor) => setAuthorityQuery((query) => applyAuthorityCursor(query, cursor))}
        />
        <ReferenceList
          state={referenceState}
          query={referenceQuery}
          onQueryChange={setReferenceQuery}
          onNext={(cursor) => setReferenceQuery((query) => applyReferenceCursor(query, cursor))}
        />
        {runtime === null ? null : (
          <section className="review-panel" aria-labelledby="reference-register-heading">
            <h2 id="reference-register-heading">登记候选引用</h2>
            <ReferenceRegisterForm
              api={runtime.referenceApi}
              onRegistered={reload}
              onSessionExpired={clearAndSignIn}
            />
          </section>
        )}
      </main>
    </ReviewShell>
  );
}
