'use client';

import type { TutorialCandidateReviewListItem } from '@airdrop/contracts';
import type { TutorialCandidateListQueryInput } from '../../lib/tutorial-review-api-client.js';
import Link from 'next/link';

import type { ReviewSessionController } from '../../lib/review-session.js';
import type { TutorialReviewApiClient } from '../../lib/tutorial-review-api-client.js';
import { formatReviewDate } from '../review/failed-ai-run-list.js';
import { displayReviewValue } from '../review/safe-review-text.js';
import { uuidPattern } from './tutorial-links.js';

export type CandidateListState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'failed' }
  | {
    readonly status: 'ready';
    readonly items: readonly TutorialCandidateReviewListItem[];
    readonly nextCursor: string | null;
  };

export function candidateDetailHref(candidateId: string): string | null {
  return uuidPattern.test(candidateId) ? `/review/tutorials/candidates/${candidateId}` : null;
}

export function CandidateList({ state, query, onQueryChange, onNext }: {
  readonly state: CandidateListState;
  readonly query: TutorialCandidateListQueryInput;
  readonly onQueryChange?: (query: TutorialCandidateListQueryInput) => void;
  readonly onNext?: (cursor: string) => void;
}) {
  return (
    <section className="review-panel" aria-labelledby="candidate-list-heading">
      <div className="review-panel-heading">
        <div>
          <h1 id="candidate-list-heading">教程候选队列</h1>
          <p>候选载荷是 AI 生成的惰性数据，只有审核人编辑过的步骤才会发布。</p>
        </div>
        <div className="review-filters">
          <label htmlFor="candidate-status">状态</label>
          <select
            id="candidate-status"
            value={query.status}
            onChange={(event) => onQueryChange?.(
              changeCandidateFilters(query, { status: event.currentTarget.value as TutorialCandidateListQueryInput['status'] }),
            )}
          >
            <option value="pending">pending</option>
            <option value="accepted">accepted</option>
            <option value="rejected">rejected</option>
            <option value="all">全部状态</option>
          </select>
        </div>
      </div>
      {body(state)}
      {state.status === 'ready' && state.nextCursor !== null ? (
        <div className="review-pagination">
          <button
            className="review-button review-button-secondary"
            type="button"
            onClick={() => onNext?.(state.nextCursor ?? '')}
          >
            下一页
          </button>
        </div>
      ) : null}
    </section>
  );
}

export async function loadCandidateList({ session, api, query, redirect }: {
  readonly session: ReviewSessionController;
  readonly api: TutorialReviewApiClient;
  readonly query: TutorialCandidateListQueryInput;
  readonly redirect: (path: string) => void;
}): Promise<CandidateListState> {
  if (await session.getAccessToken() === null) {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  const result = await api.listCandidates(query);
  if (result.ok) return { status: 'ready', items: result.data.items, nextCursor: result.nextCursor };
  if (result.state === 'sign_in_required') {
    await session.signOut();
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  if (result.state === 'forbidden') {
    await session.signOut();
    return { status: 'forbidden' };
  }
  return { status: 'failed' };
}

export function changeCandidateFilters(
  query: TutorialCandidateListQueryInput,
  filters: Partial<Pick<TutorialCandidateListQueryInput, 'status'>>,
): TutorialCandidateListQueryInput {
  return { ...query, ...filters, cursor: null };
}

export function applyCandidateCursor(
  query: TutorialCandidateListQueryInput,
  cursor: string,
): TutorialCandidateListQueryInput {
  return { ...query, cursor };
}

function body(state: CandidateListState) {
  if (state.status === 'loading') return <p className="review-state">正在确认审核会话…</p>;
  if (state.status === 'forbidden') return <p className="review-state review-message-error" role="alert">当前账号没有有效的审核权限。</p>;
  if (state.status === 'failed') return <p className="review-state review-message-error" role="alert">教程候选暂时无法加载。请稍后重试。</p>;
  if (state.items.length === 0) return <p className="review-state">没有匹配的教程候选。</p>;
  return (
    <div className="review-table-wrap">
      <table className="review-table">
        <thead>
          <tr><th>状态</th><th>类型</th><th>标题</th><th>创建时间</th></tr>
        </thead>
        <tbody>
          {state.items.map((item) => {
            const href = candidateDetailHref(item.candidateId);
            return (
              <tr key={item.candidateId}>
                <td>
                  {href === null ? item.status : <Link className="review-link" href={href}>{item.status}</Link>}
                </td>
                <td>{item.kind}</td>
                <td>{displayReviewValue(item.title)}</td>
                <td><time dateTime={item.createdAt}>{formatReviewDate(item.createdAt)}</time></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
