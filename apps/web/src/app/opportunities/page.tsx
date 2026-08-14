import Link from 'next/link';

import { OpportunityRow } from '../../components/opportunity-elements.js';
import { listOpportunities } from '../../lib/opportunity-queries.js';

export const dynamic = 'force-dynamic';

const pageSize = 20;
const batchLimit = 100;

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'act_now', label: 'Act now' },
  { key: 'watch', label: 'Watch' },
  { key: 'research', label: 'Research' },
  { key: 'avoid', label: 'Avoid' },
] as const;

type TabKey = (typeof tabs)[number]['key'];

function parseTab(value: string | undefined): TabKey {
  const match = tabs.find((tab) => tab.key === value);
  return match === undefined ? 'all' : match.key;
}

interface SearchParams {
  readonly tab?: string;
  readonly afterScore?: string;
  readonly afterProjectId?: string;
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tab = parseTab(params.tab);
  const afterScore = params.afterScore === undefined ? null : Number(params.afterScore);
  const afterProjectId = params.afterProjectId ?? null;
  const hasCursor =
    afterScore !== null && Number.isFinite(afterScore) && afterProjectId !== null;

  const items = await listOpportunities({
    limit: batchLimit,
    afterScore: hasCursor ? afterScore : null,
    afterProjectId: hasCursor ? afterProjectId : null,
  });

  const filtered = items.filter((item) => (tab === 'all' ? true : item.recommendation === tab));
  const visible = filtered.slice(0, pageSize);
  const nextItem = filtered[pageSize];
  const nextParams = nextItem
    ? `?tab=${tab}&afterScore=${nextItem.opportunityScore}&afterProjectId=${nextItem.projectId}`
    : null;

  return (
    <main>
      <div className="page-header">
        <h1 className="page-title">Opportunities</h1>
        <p className="page-subtitle">
          Opportunity score, risk, and confidence are independent dimensions — read them
          separately before deciding.
        </p>
      </div>

      <div className="tabs">
        {tabs.map((entry) => (
          <Link
            key={entry.key}
            href={entry.key === 'all' ? '/opportunities' : `/opportunities?tab=${entry.key}`}
            className={`tab${tab === entry.key ? ' active' : ''}`}
          >
            {entry.label}
          </Link>
        ))}
      </div>

      <section className="card">
        {visible.length === 0 ? (
          <div className="empty-state">
            No opportunities in this view. Try another filter or wait for pipeline data.
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
              {visible.map((item) => (
                <OpportunityRow key={item.projectId} item={item} />
              ))}
            </tbody>
          </table>
        )}
        {nextParams !== null && (
          <div className="load-more">
            <Link className="button" href={`/opportunities${nextParams}`}>
              Load more
            </Link>
          </div>
        )}
      </section>

      <p className="fixture-note">
        Blocked projects are hidden by default and fixture scores ({' '}
        <code>seed-fixture-v1</code>) demonstrate the layout until the scoring pipeline ships.
      </p>
    </main>
  );
}
