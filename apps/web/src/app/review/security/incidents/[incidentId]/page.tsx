'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';

import { SecurityIncidentCommandForm } from '../../../../../components/review/security-incident-command-form.js';
import { SecurityIncidentDetail, loadSecurityIncidentDetail, type SecurityIncidentDetailState } from '../../../../../components/review/security-incident-detail.js';
import { SecurityIndicatorDisclosureForm } from '../../../../../components/review/security-indicator-disclosure-form.js';
import { useReviewBrowserRuntime } from '../../../../../lib/review-browser-runtime.js';
import { createPendingActionGate } from '../../../../../lib/review-pending-action.js';
import { ReviewShell, runReviewSignOutOnce, signOutAndRedirect } from '../../../review-shell.js';

export default function SecurityIncidentDetailPage({ params }: { readonly params: Promise<{ incidentId: string }> }) {
  const { incidentId } = use(params);
  const router = useRouter();
  const runtime = useReviewBrowserRuntime();
  const [state, setState] = useState<SecurityIncidentDetailState>({ status: 'loading' });
  const [signOutPending, setSignOutPending] = useState(false);
  const gate = useRef(createPendingActionGate());
  const refresh = useCallback(async () => {
    if (runtime === null) return;
    setState(await loadSecurityIncidentDetail({ session: runtime.session, api: runtime.securityApi, incidentId, redirect: (path) => router.replace(path) }));
  }, [incidentId, router, runtime]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function clearAndSignIn() { if (runtime !== null) await runtime.session.signOut(); router.replace('/review/sign-in'); }
  async function signOut() { if (runtime === null) return; await runReviewSignOutOnce(gate.current, async () => { await signOutAndRedirect(runtime.session, (path) => router.replace(path)); }, setSignOutPending); }

  let body = <p className="review-state">正在确认审核会话…</p>;
  if (runtime !== null && state.status === 'forbidden') body = <p className="review-state review-message-error" role="alert">当前账号没有有效的审核权限。</p>;
  else if (runtime !== null && state.status === 'not_found') body = <p className="review-state">未找到该安全事件。</p>;
  else if (runtime !== null && state.status === 'failed') body = <p className="review-state review-message-error" role="alert">安全事件详情暂时无法加载。请稍后重试。</p>;
  else if (runtime !== null && state.status === 'ready') body = <>
    <SecurityIncidentDetail detail={state.detail} />
    <section className="review-panel"><h2>事件处置命令</h2><SecurityIncidentCommandForm api={runtime.securityApi} incident={state.detail.incident} onRefresh={refresh} onSessionExpired={() => { void clearAndSignIn(); }} /></section>
    {state.detail.indicatorIds.map((indicatorId) => <section className="review-panel" key={indicatorId}><h2>指标公开披露</h2><SecurityIndicatorDisclosureForm api={runtime.securityApi} indicatorId={indicatorId} onRefresh={refresh} onSessionExpired={() => { void clearAndSignIn(); }} /></section>)}
  </>;
  return <ReviewShell {...(runtime === null ? {} : { onSignOut: signOut, signOutPending })}><main><p className="review-back"><Link className="review-link" href="/review/security">← 返回安全审核</Link></p>{body}</main></ReviewShell>;
}
