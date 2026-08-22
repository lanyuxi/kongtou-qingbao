'use client';

import type {
  FailedAiRunListItem,
  FailedAiRunListQuery,
  FailedAiRunReviewState,
  FailedAiRunStatus,
} from '@airdrop/contracts';
import Link from 'next/link';

import type { ReviewApiClient } from '../../lib/review-api-client.js';
import type { ReviewSessionController } from '../../lib/review-session.js';

export type FailedAiRunListState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'failed' }
  | {
      readonly status: 'ready';
      readonly items: FailedAiRunListItem[];
      readonly nextCursor: string | null;
    };

type ReviewStateFilter = 'all' | FailedAiRunReviewState;
type StatusFilter = 'all' | FailedAiRunStatus;

const reviewStateOptions: ReadonlyArray<readonly [ReviewStateFilter, string]> = [
  ['all', '全部审核状态'],
  ['unreviewed', '未审核'],
  ['needs_investigation', '需要调查'],
  ['dismissed', '已忽略'],
];

const statusOptions: ReadonlyArray<readonly [StatusFilter, string]> = [
  ['all', '全部失败状态'],
  ['provider_error', 'provider_error'],
  ['schema_invalid_after_repair', 'schema_invalid_after_repair'],
  ['grounding_failed', 'grounding_failed'],
];

export function FailedAiRunList({
  state,
  query,
  onQueryChange,
  onNext,
}: {
  readonly state: FailedAiRunListState;
  readonly query: FailedAiRunListQuery;
  readonly onQueryChange?: (query: FailedAiRunListQuery) => void;
  readonly onNext?: (cursor: string) => void;
}) {
  return (
    <section className="review-panel" aria-labelledby="review-list-heading">
      <div className="review-panel-heading">
        <div>
          <h1 id="review-list-heading">Failed AI runs</h1>
          <p>仅展示经约束的安全元数据。</p>
        </div>
        <div className="review-filters">
          <label htmlFor="review-state-filter">审核状态</label>
          <select
            id="review-state-filter"
            value={query.reviewState}
            onChange={(event) => onQueryChange?.({
              ...query,
              reviewState: event.currentTarget.value as ReviewStateFilter,
              cursor: null,
            })}
          >
            {reviewStateOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="review-failure-filter">失败状态</label>
          <select
            id="review-failure-filter"
            value={query.status}
            onChange={(event) => onQueryChange?.({
              ...query,
              status: event.currentTarget.value as StatusFilter,
              cursor: null,
            })}
          >
            {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      <ListBody state={state} />
      {state.status === 'ready' && state.nextCursor !== null ? (
        <div className="review-pagination">
          <button
            className="review-button review-button-secondary"
            type="button"
            onClick={() => onNext?.(state.nextCursor ?? '')}
          >下一页</button>
        </div>
      ) : null}
    </section>
  );
}

export async function loadFailedAiRunList({
  session,
  api,
  query,
  redirect,
}: {
  readonly session: ReviewSessionController;
  readonly api: ReviewApiClient;
  readonly query: FailedAiRunListQuery;
  readonly redirect: (path: string) => void;
}): Promise<FailedAiRunListState> {
  if (await session.getAccessToken() === null) {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }

  const result = await api.list(query);
  if (result.ok) {
    return { status: 'ready', items: result.data.items, nextCursor: result.nextCursor };
  }
  if (result.state === 'sign_in_required') {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  if (result.state === 'forbidden') return { status: 'forbidden' };
  return { status: 'failed' };
}

function ListBody({ state }: { readonly state: FailedAiRunListState }) {
  if (state.status === 'loading') return <p className="review-state">正在确认审核会话…</p>;
  if (state.status === 'forbidden') {
    return <p className="review-state review-message-error" role="alert">当前账号没有有效的审核权限。</p>;
  }
  if (state.status === 'failed') {
    return <p className="review-state review-message-error" role="alert">审核列表暂时无法加载。请稍后重试。</p>;
  }
  if (state.items.length === 0) return <p className="review-state">没有匹配的失败 AI run。</p>;

  return (
    <div className="review-table-wrap">
      <table className="review-table">
        <thead><tr>
          <th>状态</th><th>阶段</th><th>模型</th><th>项目 / 来源</th>
          <th>管线版本</th><th>发生时间</th><th>审核状态</th>
        </tr></thead>
        <tbody>{state.items.map((item) => (
          <tr key={item.runId}>
            <td><Link className="review-link" href={`/review/ai-runs/${item.runId}`}>{item.status}</Link></td>
            <td>{displaySafeText(item.stage)}</td>
            <td>{displaySafeText(item.modelId)}</td>
            <td>{item.project === null ? '—' : displaySafeText(item.project.name)} / {item.source === null ? '—' : displaySafeText(item.source.name)}</td>
            <td>{displaySafeText(item.pipelineVersion)}</td>
            <td><time dateTime={item.createdAt}>{formatReviewDate(item.createdAt)}</time></td>
            <td>{item.reviewState}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function formatReviewDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function displaySafeText(value: string): string {
  return /https?:\/\//iu.test(value) ? '[已隐藏链接]' : value;
}
