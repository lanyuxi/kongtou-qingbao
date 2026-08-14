import Link from 'next/link';

import { OpportunityRow } from '../components/opportunity-elements.js';
import { loadOpportunityOverview } from '../lib/opportunity-queries.js';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const overview = await loadOpportunityOverview();

  return (
    <main>
      <div className="page-header">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">
          What matters today across tracked public participation opportunities.
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat-card emph">
          <div className="stat-value">{overview.actNowCount}</div>
          <div className="stat-label">Act now recommendations</div>
        </div>
        <div className="stat-card risk">
          <div className="stat-value">{overview.highRiskCount}</div>
          <div className="stat-label">High risk (≥70)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.activeCount}</div>
          <div className="stat-label">Active campaigns</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.rumoredCount}</div>
          <div className="stat-label">Rumored programs</div>
        </div>
      </div>

      <section className="card">
        <h2 className="card-heading">Top opportunities</h2>
        {overview.top.length === 0 ? (
          <div className="empty-state">
            No scored opportunities yet. Data pipelines have not produced published results.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th className="num-col">Score</th>
                <th>Risk</th>
                <th className="num-col">Confidence</th>
                <th>Recommendation</th>
                <th className="num-col">Last signal</th>
              </tr>
            </thead>
            <tbody>
              {overview.top.map((item) => (
                <OpportunityRow key={item.projectId} item={item} />
              ))}
            </tbody>
          </table>
        )}
        <div className="load-more">
          <Link className="button" href="/opportunities">
            View all opportunities →
          </Link>
        </div>
      </section>

      <p className="fixture-note">
        Scores shown on this MVP build come from hand-authored fixture data
        (model version <code>seed-fixture-v1</code>). They demonstrate the interface and will be
        replaced by pipeline results as the intelligence stages come online.
      </p>
    </main>
  );
}
