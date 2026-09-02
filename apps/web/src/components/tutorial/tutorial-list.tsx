'use client';

import type { TutorialReviewListItem } from '@airdrop/contracts';
import type { TutorialListQueryInput } from '../../lib/tutorial-review-api-client.js';
import Link from 'next/link';

import type { ReviewSessionController } from '../../lib/review-session.js';
import type { TutorialReviewApiClient } from '../../lib/tutorial-review-api-client.js';
import { formatReviewDate } from '../review/failed-ai-run-list.js';
import { displayReviewValue } from '../review/safe-review-text.js';
import { tutorialDetailHref } from './tutorial-links.js';

export type TutorialListState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'failed' }
  | {
    readonly status: 'ready';
    readonly items: readonly TutorialReviewListItem[];
    readonly nextCursor: string | null;
  };

export function TutorialList({ state, query, onQueryChange, onNext }: {
  readonly state: TutorialListState;
  readonly query: TutorialListQueryInput;
  readonly onQueryChange?: (query: TutorialListQueryInput) => void;
  readonly onNext?: (cursor: string) => void;
}) {
  return (
    <section className="review-panel" aria-labelledby="tutorial-list-heading">
      <div className="review-panel-heading">
        <div>
          <h1 id="tutorial-list-heading">教程台账</h1>
          <p>安全联动会把受影响教程置为 needs_review 或 blocked，恢复必须发布新版本。</p>
        </div>
        <div className="review-filters">
          <label htmlFor="tutorial-status">状态</label>
          <select
            id="tutorial-status"
            value={query.status}
            onChange={(event) => onQueryChange?.(
              changeTutorialFilters(query, { status: event.currentTarget.value as TutorialListQueryInput['status'] }),
            )}
          >
            <option value="all">全部状态</option>
            <option value="published">published</option>
            <option value="needs_review">needs_review</option>
            <option value="blocked">blocked</option>
            <option value="retired">retired</option>
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

export async function loadTutorialList({ session, api, query, redirect }: {
  readonly session: ReviewSessionController;
  readonly api: TutorialReviewApiClient;
  readonly query: TutorialListQueryInput;
  readonly redirect: (path: string) => void;
}): Promise<TutorialListState> {
  if (await session.getAccessToken() === null) {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  const result = await api.listTutorials(query);
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

export function changeTutorialFilters(
  query: TutorialListQueryInput,
  filters: Partial<Pick<TutorialListQueryInput, 'status'>>,
): TutorialListQueryInput {
  return { ...query, ...filters, cursor: null };
}

export function applyTutorialCursor(
  query: TutorialListQueryInput,
  cursor: string,
): TutorialListQueryInput {
  return { ...query, cursor };
}

function body(state: TutorialListState) {
  if (state.status === 'loading') return <p className="review-state">正在确认审核会话…</p>;
  if (state.status === 'forbidden') return <p className="review-state review-message-error" role="alert">当前账号没有有效的审核权限。</p>;
  if (state.status === 'failed') return <p className="review-state review-message-error" role="alert">教程台账暂时无法加载。请稍后重试。</p>;
  if (state.items.length === 0) return <p className="review-state">没有匹配的教程。</p>;
  return (
    <div className="review-table-wrap">
      <table className="review-table">
        <thead>
          <tr><th>状态</th><th>类型</th><th>标题</th><th>版本</th><th>更新时间</th></tr>
        </thead>
        <tbody>
          {state.items.map((item) => {
            const href = tutorialDetailHref(item.tutorialId);
            return (
              <tr key={item.tutorialId}>
                <td>
                  {href === null ? item.status : <Link className="review-link" href={href}>{item.status}</Link>}
                </td>
                <td>{item.kind}</td>
                <td>{displayReviewValue(item.title)}</td>
                <td>{`v${item.version}`}</td>
                <td><time dateTime={item.updatedAt}>{formatReviewDate(item.updatedAt)}</time></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
