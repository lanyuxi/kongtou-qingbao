'use client';

import type {
  ReviewerSecurityCandidateListItem,
  SecurityCandidateListQuery,
  SecurityCandidateOrigin,
  SecurityCandidateState,
  SecurityTargetType,
} from '@airdrop/contracts';
import Link from 'next/link';

import type { ReviewSessionController } from '../../lib/review-session.js';
import type { SecurityReviewApiClient } from '../../lib/security-review-api-client.js';
import { formatReviewDate } from './failed-ai-run-list.js';
import { displayReviewValue } from './safe-review-text.js';

export type SecurityCandidateListState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly items: ReviewerSecurityCandidateListItem[]; readonly nextCursor: string | null };

type CandidateOriginFilter = 'all' | SecurityCandidateOrigin;
type CandidateStateFilter = 'all' | SecurityCandidateState;
type TargetTypeFilter = 'all' | SecurityTargetType;

export function SecurityCandidateList({ state, query, onQueryChange, onNext }: {
  readonly state: SecurityCandidateListState;
  readonly query: SecurityCandidateListQuery;
  readonly onQueryChange?: (query: SecurityCandidateListQuery) => void;
  readonly onNext?: (cursor: string) => void;
}) {
  return <section className="review-panel" aria-labelledby="security-candidate-list-heading">
    <div className="review-panel-heading"><div><h1 id="security-candidate-list-heading">安全候选</h1><p>候选内容仍需由证据与人工审核确认。</p></div>
      <div className="review-filters">
        <label htmlFor="candidate-origin">来源</label><select id="candidate-origin" value={query.origin} onChange={(event) => onQueryChange?.(changeSecurityCandidateFilters(query, { origin: event.currentTarget.value as CandidateOriginFilter }))}><option value="all">全部来源</option><option value="extraction">提取候选</option><option value="reviewer_manual">人工提交</option></select>
        <label htmlFor="candidate-state">状态</label><select id="candidate-state" value={query.state} onChange={(event) => onQueryChange?.(changeSecurityCandidateFilters(query, { state: event.currentTarget.value as CandidateStateFilter }))}><option value="all">全部状态</option><option value="pending">待处理</option><option value="needs_review">需要复核</option><option value="accepted">已接受</option><option value="rejected">已拒绝</option></select>
        <label htmlFor="candidate-target">目标</label><select id="candidate-target" value={query.targetType} onChange={(event) => onQueryChange?.(changeSecurityCandidateFilters(query, { targetType: event.currentTarget.value as TargetTypeFilter }))}><option value="all">全部目标</option><option value="project">项目</option><option value="source">来源</option></select>
      </div>
    </div>
    {body(state)}
    {state.status === 'ready' && state.nextCursor !== null ? <div className="review-pagination"><button className="review-button review-button-secondary" type="button" onClick={() => onNext?.(state.nextCursor ?? '')}>下一页</button></div> : null}
  </section>;
}

export async function loadSecurityCandidateList({ session, api, query, redirect }: { readonly session: ReviewSessionController; readonly api: SecurityReviewApiClient; readonly query: SecurityCandidateListQuery; readonly redirect: (path: string) => void }): Promise<SecurityCandidateListState> {
  if (await session.getAccessToken() === null) { redirect('/review/sign-in'); return { status: 'loading' }; }
  const result = await api.listCandidates(query);
  if (result.ok) return { status: 'ready', items: result.data.items, nextCursor: result.nextCursor };
  if (result.state === 'sign_in_required') { await session.signOut(); redirect('/review/sign-in'); return { status: 'loading' }; }
  if (result.state === 'forbidden') { await session.signOut(); return { status: 'forbidden' }; }
  return { status: 'failed' };
}

export function changeSecurityCandidateFilters(query: SecurityCandidateListQuery, filters: Partial<Pick<SecurityCandidateListQuery, 'origin' | 'state' | 'targetType'>>): SecurityCandidateListQuery { return { ...query, ...filters, cursor: null }; }
export function applySecurityCandidateCursor(query: SecurityCandidateListQuery, cursor: string): SecurityCandidateListQuery { return { ...query, cursor }; }

function body(state: SecurityCandidateListState) {
  if (state.status === 'loading') return <p className="review-state">正在确认审核会话…</p>;
  if (state.status === 'forbidden') return <p className="review-state review-message-error" role="alert">当前账号没有有效的审核权限。</p>;
  if (state.status === 'failed') return <p className="review-state review-message-error" role="alert">安全候选暂时无法加载。请稍后重试。</p>;
  if (state.items.length === 0) return <p className="review-state">没有匹配的安全候选。</p>;
  return <div className="review-table-wrap"><table className="review-table"><thead><tr><th>状态</th><th>来源</th><th>目标</th><th>摘要</th><th>提交时间</th></tr></thead><tbody>{state.items.map((item) => <tr key={item.candidateId}><td><Link className="review-link" href={`/review/security/candidates/${item.candidateId}`}>{item.state}</Link></td><td>{item.origin}</td><td>{item.target === null ? '提取上下文' : `${item.target.type} · ${item.target.id}`}</td><td>{displayReviewValue(item.summary)}</td><td><time dateTime={item.createdAt}>{formatReviewDate(item.createdAt)}</time></td></tr>)}</tbody></table></div>;
}
