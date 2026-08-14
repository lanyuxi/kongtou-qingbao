import { notFound } from 'next/navigation';

import {
  LifecycleBadge,
  RecommendationBadge,
  SignalTimeline,
  formatTimestamp,
} from '../../../components/opportunity-elements.js';
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

  const { project, signals } = detail;
  const score = project.latestScore;

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
        </div>
        <p className="page-subtitle">
          {project.primaryChain ?? 'Unknown chain'} · updated {formatTimestamp(project.updatedAt)}
          {project.officialWebsiteUrl === null ? null : (
            <>
              {' · '}
              <a
                href={project.officialWebsiteUrl}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: 'var(--accent-ink)' }}
              >
                official site ↗
              </a>
            </>
          )}
        </p>
      </div>

      {score === null ? (
        <section className="card">
          <div className="empty-state">
            This project has no published score yet, so it stays out of the opportunity list.
          </div>
        </section>
      ) : (
        <>
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--good)' }}>
                {score.opportunityScore.toFixed(0)}
              </div>
              <div className="metric-label">Opportunity score</div>
              <div className="metric-note">Higher is more worth your time</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--bad)' }}>
                {score.riskScore.toFixed(0)}
              </div>
              <div className="metric-label">Risk score</div>
              <div className="metric-note">Independent of opportunity</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--info)' }}>
                {score.confidence.toFixed(0)}%
              </div>
              <div className="metric-label">Confidence</div>
              <div className="metric-note">How well-evidenced the scores are</div>
            </div>
          </div>

          <div className="detail-grid">
            <div>
              <section className="card detail-section">
                <h2 className="detail-section-title">Why this rating</h2>
                <div className="explanation-box">{score.explanation}</div>
              </section>

              <section className="card detail-section">
                <h2 className="detail-section-title">Published signals</h2>
                <SignalTimeline signals={signals} />
              </section>
            </div>

            <aside>
              <section className="card">
                <h2 className="detail-section-title">Facts</h2>
                <dl className="kv">
                  <dt>Summary</dt>
                  <dd>{project.summary ?? 'No summary available.'}</dd>
                  <dt>Lifecycle</dt>
                  <dd style={{ textTransform: 'capitalize' }}>{project.lifecycle}</dd>
                  <dt>Primary chain</dt>
                  <dd>{project.primaryChain ?? 'Unknown'}</dd>
                  <dt>Score calculated</dt>
                  <dd>{formatTimestamp(score.calculatedAt)}</dd>
                  <dt>Model version</dt>
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
        This MVP renders hand-authored fixture data (model version <code>seed-fixture-v1</code>).
        Verified tutorials, evidence links, and pipeline-generated scores arrive with the
        intelligence stages.
      </p>
    </main>
  );
}
