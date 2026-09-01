'use client';

import type {
  DomainAuthorityReviewListQuery,
  ReviewerDomainAuthorityListItem,
} from '@airdrop/contracts';
import Link from 'next/link';

import type { ReferenceReviewApiClient } from '../../lib/reference-review-api-client.js';
import type { ReviewSessionController } from '../../lib/review-session.js';
import { formatReviewDate } from '../review/failed-ai-run-list.js';
import { displayReviewValue } from '../review/safe-review-text.js';

export type AuthorityListState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'failed' }
  | {
    readonly status: 'ready';
    readonly items: readonly ReviewerDomainAuthorityListItem[];
    readonly nextCursor: string | null;
  };

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

// Internal navigation is built only from identifiers that already passed
// contract validation. Anything else renders as inert text, so a hostile id
// can never become a link the reviewer might follow.
export function authorityDetailHref(authorityId: string): string | null {
  return uuidPattern.test(authorityId) ? `/review/references/authorities/${authorityId}` : null;
}

export function AuthorityList({ state, query, onQueryChange, onNext }: {
  readonly state: AuthorityListState;
  readonly query: DomainAuthorityReviewListQuery;
  readonly onQueryChange?: (query: DomainAuthorityReviewListQuery) => void;
  readonly onNext?: (cursor: string) => void;
}) {
  return (
    <section className="review-panel" aria-labelledby="authority-list-heading">
      <div className="review-panel-heading">
        <div>
          <h1 id="authority-list-heading">域名权威</h1>
          <p>域名权威只证明归属性，不等于其下任意 URL 已通过核验。</p>
        </div>
        <div className="review-filters">
          <label htmlFor="authority-state">状态</label>
          <select
            id="authority-state"
            value={query.state}
            onChange={(event) => onQueryChange?.(
              changeAuthorityFilters(query, { state: event.currentTarget.value as DomainAuthorityReviewListQuery['state'] }),
            )}
          >
            <option value="all">全部状态</option>
            <option value="candidate">candidate</option>
            <option value="granted">granted</option>
            <option value="revoked">revoked</option>
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

export async function loadAuthorityList({ session, api, query, redirect }: {
  readonly session: ReviewSessionController;
  readonly api: ReferenceReviewApiClient;
  readonly query: DomainAuthorityReviewListQuery;
  readonly redirect: (path: string) => void;
}): Promise<AuthorityListState> {
  if (await session.getAccessToken() === null) {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  const result = await api.listDomainAuthorities(query);
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

export function changeAuthorityFilters(
  query: DomainAuthorityReviewListQuery,
  filters: Partial<Pick<DomainAuthorityReviewListQuery, 'projectId' | 'state'>>,
): DomainAuthorityReviewListQuery {
  return { ...query, ...filters, cursor: null };
}

export function applyAuthorityCursor(
  query: DomainAuthorityReviewListQuery,
  cursor: string,
): DomainAuthorityReviewListQuery {
  return { ...query, cursor };
}

function body(state: AuthorityListState) {
  if (state.status === 'loading') return <p className="review-state">正在确认审核会话…</p>;
  if (state.status === 'forbidden') return <p className="review-state review-message-error" role="alert">当前账号没有有效的审核权限。</p>;
  if (state.status === 'failed') return <p className="review-state review-message-error" role="alert">域名权威暂时无法加载。请稍后重试。</p>;
  if (state.items.length === 0) return <p className="review-state">没有匹配的域名权威。</p>;
  return (
    <div className="review-table-wrap">
      <table className="review-table">
        <thead>
          <tr><th>状态</th><th>域名</th><th>版本</th><th>更新时间</th></tr>
        </thead>
        <tbody>
          {state.items.map((item) => {
            const href = authorityDetailHref(item.authorityId);
            return (
              <tr key={item.authorityId}>
                <td>
                  {href === null ? item.state : <Link className="review-link" href={href}>{item.state}</Link>}
                </td>
                <td>{displayReviewValue(item.domain)}</td>
                <td>{`v${item.authorityVersion}`}</td>
                <td><time dateTime={item.updatedAt}>{formatReviewDate(item.updatedAt)}</time></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
