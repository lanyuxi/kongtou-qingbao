'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { SecurityCandidateForm } from '../../../../../components/review/security-candidate-form.js';
import { useReviewBrowserRuntime } from '../../../../../lib/review-browser-runtime.js';
import { createPendingActionGate } from '../../../../../lib/review-pending-action.js';
import { ReviewShell, runReviewSignOutOnce, signOutAndRedirect } from '../../../review-shell.js';

export default function NewSecurityCandidatePage() { const router = useRouter(); const runtime = useReviewBrowserRuntime(); const [signOutPending, setSignOutPending] = useState(false); const gate = useRef(createPendingActionGate()); async function clearAndSignIn() { if (runtime !== null) await runtime.session.signOut(); router.replace('/review/sign-in'); } async function signOut() { if (runtime === null) return; await runReviewSignOutOnce(gate.current, async () => { await signOutAndRedirect(runtime.session, (path) => router.replace(path)); }, setSignOutPending); } return <ReviewShell {...(runtime === null ? {} : { onSignOut: signOut, signOutPending })}><main><p className="review-back"><Link className="review-link" href="/review/security">← 返回安全审核</Link></p><section className="review-panel"><h1>提交人工安全候选</h1>{runtime === null ? <p className="review-state">正在确认审核会话…</p> : <SecurityCandidateForm api={runtime.securityApi} onComplete={async (candidateId) => { router.replace(`/review/security/candidates/${candidateId}`); }} onSessionExpired={() => { void clearAndSignIn(); }} />}</section></main></ReviewShell>; }
