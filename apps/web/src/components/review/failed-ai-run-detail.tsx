import type { FailedAiRunDetail as FailedAiRunDetailDto, FailedAiRunStatus } from '@airdrop/contracts';

import type { ReviewApiClient } from '../../lib/review-api-client.js';
import type { ReviewSessionController } from '../../lib/review-session.js';
import { displaySafeText, formatReviewDate } from './failed-ai-run-list.js';

export type FailedAiRunDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'not_found' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly detail: FailedAiRunDetailDto };

const failureExplanations: Record<FailedAiRunStatus, string> = {
  provider_error: 'AI 服务暂时未完成该阶段。请仅依据安全元数据判断是否需要调查。',
  schema_invalid_after_repair: '结构化结果在一次受限修复后仍未通过校验。',
  grounding_failed: '候选内容未通过证据定位校验。',
};

export function FailedAiRunDetail({ detail }: { readonly detail: FailedAiRunDetailDto }) {
  const { run, input } = detail;
  const decisions = [...detail.decisions].sort((left, right) => {
    const timeOrder = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return timeOrder === 0 ? left.reviewVersion - right.reviewVersion : timeOrder;
  });

  return (
    <div className="review-detail">
      <section className="review-panel" aria-labelledby="review-detail-heading">
        <div className="review-panel-heading">
          <div>
            <h1 id="review-detail-heading">Failed AI run</h1>
            <p>{failureExplanations[run.safeFailureCode]}</p>
          </div>
          <span className="review-badge">{run.reviewState}</span>
        </div>
        <dl className="review-metadata">
          <Metadata label="Run ID" value={run.runId} />
          <Metadata label="失败状态" value={run.status} />
          <Metadata label="阶段" value={run.stage} />
          <Metadata label="输入类型" value={run.inputKind} />
          <Metadata label="模型" value={run.modelId} />
          <Metadata label="Prompt 版本" value={run.promptVersion} />
          <Metadata label="Schema 版本" value={run.schemaVersion} />
          <Metadata label="管线版本" value={run.pipelineVersion} />
          <Metadata label="项目" value={run.project?.name ?? '—'} />
          <Metadata label="来源" value={run.source?.name ?? '—'} />
          <Metadata label="发生时间" value={formatReviewDate(run.createdAt)} />
          <Metadata label="当前审核版本" value={String(run.reviewVersion)} />
        </dl>
      </section>
      <section className="review-panel" aria-labelledby="review-input-heading">
        <h2 id="review-input-heading">输入引用</h2>
        <dl className="review-metadata">
          <Metadata label="类型" value={input.kind} />
          <Metadata label="ID" value={input.id} />
          <Metadata label="采集时间" value={input.collectedAt === null ? '—' : formatReviewDate(input.collectedAt)} />
        </dl>
      </section>
      <section className="review-panel" aria-labelledby="review-history-heading">
        <h2 id="review-history-heading">不可变更的决策历史</h2>
        {decisions.length === 0 ? <p className="review-state">尚无审核决策。</p> : (
          <ol className="review-history">
            {decisions.map((record) => (
              <li key={record.decisionId}>
                <div className="review-history-heading">
                  <strong>v{record.reviewVersion} · {record.decision}</strong>
                  <time dateTime={record.createdAt}>{formatReviewDate(record.createdAt)}</time>
                </div>
                <p>{record.reasonCode}</p>
                <p>{record.note === null ? '无备注' : displaySafeNote(record.note)}</p>
                <p className="review-muted">Reviewer {record.reviewerUserId}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export async function loadFailedAiRunDetail({
  session,
  api,
  runId,
  redirect,
}: {
  readonly session: ReviewSessionController;
  readonly api: ReviewApiClient;
  readonly runId: string;
  readonly redirect: (path: string) => void;
}): Promise<FailedAiRunDetailState> {
  if (await session.getAccessToken() === null) {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  const result = await api.get(runId);
  if (result.ok) return { status: 'ready', detail: result.data };
  if (result.state === 'sign_in_required') {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  if (result.state === 'forbidden') return { status: 'forbidden' };
  if (result.state === 'not_found') return { status: 'not_found' };
  return { status: 'failed' };
}

function Metadata({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><dt>{label}</dt><dd>{displaySafeText(value)}</dd></div>;
}

function displaySafeNote(value: string): string {
  if (/https?:\/\/|password|secret|private[ _-]?key|mnemonic|seed[ _-]?phrase|authorization|bearer/iu.test(value)) {
    return '[内容已隐藏]';
  }
  return value;
}
