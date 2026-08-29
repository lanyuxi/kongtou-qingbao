import { notFound } from 'next/navigation';

import {
  LifecycleBadge,
  RecommendationBadge,
  SecurityPostureBadge,
  SignalTimeline,
  formatTimestamp,
  lifecycleLabel,
} from '../../../components/opportunity-elements.js';
import {
  ScoreEvidenceCitations,
  ScoreFactorGroups,
} from '../../../components/project-score-evidence.js';
import { OfficialWebsiteLink, ProjectSecurityBanner } from '../../../components/security-elements.js';
import { loadProjectDetail } from '../../../lib/opportunity-queries.js';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const detail = await loadProjectDetail(slug);
  if (detail === null) {
    notFound();
  }

  const { project, signals, factors, citations, security } = detail;
  const score = project.latestScore;
  const historical = security.posture === 'blocked';

  return (
    <main>
      <div className="page-header">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h1 className="page-title" style={{ margin: 0 }}>
            {project.name}
          </h1>
          <LifecycleBadge lifecycle={project.lifecycle === 'rumored' ? 'rumored' : 'active'} />
          {score !== null && <RecommendationBadge recommendation={score.recommendation} />}
          <SecurityPostureBadge posture={security.posture} />
        </div>
        <p className="page-subtitle">
          {project.primaryChain ?? '未知公链'} · 更新于 {formatTimestamp(project.updatedAt)}
          {project.officialWebsiteUrl === null ? null : (
            <>
              {' · '}
              <OfficialWebsiteLink url={project.officialWebsiteUrl} posture={security.posture} />
            </>
          )}
        </p>
      </div>

      <ProjectSecurityBanner state={security} />

      {score === null ? (
        <section className="card">
          <div className="empty-state">该项目尚无已发布评分，因此不会出现在机会列表中。</div>
        </section>
      ) : (
        <>
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--good)' }}>
                {score.opportunityScore.toFixed(0)}
              </div>
              <div className="metric-label">机会分</div>
              <div className="metric-note">分数越高，越值得投入时间</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--bad)' }}>
                {score.riskScore.toFixed(0)}
              </div>
              <div className="metric-label">风险分</div>
              <div className="metric-note">与机会分相互独立</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--info)' }}>
                {score.confidence.toFixed(0)}%
              </div>
              <div className="metric-label">置信度</div>
              <div className="metric-note">评分结论背后的证据支撑强度</div>
            </div>
          </div>

          <div className="detail-grid">
            <div>
              <section className="card detail-section">
                <h2 className="detail-section-title">评分依据</h2>
                <div className="explanation-box">{score.explanation}</div>
              </section>

              <section className="card detail-section">
                <h2 className="detail-section-title">评分因子</h2>
                <ScoreFactorGroups factors={factors} historical={historical} />
              </section>

              <section className="card detail-section">
                <h2 className="detail-section-title">本次评分证据</h2>
                <ScoreEvidenceCitations
                  projectLifecycle={project.lifecycle}
                  citations={citations}
                  historical={historical}
                />
              </section>

              <section className="card detail-section">
                <h2 className="detail-section-title">已发布信号</h2>
                <SignalTimeline signals={signals} />
              </section>
            </div>

            <aside>
              <section className="card">
                <h2 className="detail-section-title">基本信息</h2>
                <dl className="kv">
                  <dt>简介</dt>
                  <dd>{project.summary ?? '暂无简介。'}</dd>
                  <dt>生命周期</dt>
                  <dd>{lifecycleLabel(project.lifecycle)}</dd>
                  <dt>主要公链</dt>
                  <dd>{project.primaryChain ?? '未知'}</dd>
                  <dt>评分时间</dt>
                  <dd>{formatTimestamp(score.calculatedAt)}</dd>
                  <dt>模型版本</dt>
                  <dd>
                    <code>{score.modelVersion}</code>
                  </dd>
                </dl>
              </section>
            </aside>
          </div>
        </>
      )}

      <p className="fixture-note">
        演示项目的评分仍为手工样例数据（模型版本 <code>seed-fixture-v1</code>
        ）；真实来源项目由确定性评分管线计算（模型版本 <code>score-model-v1</code>
        ）。引用首版仅展示经审核的纯文本与安全来源元数据，暂不提供外部引用链接。
      </p>
    </main>
  );
}
