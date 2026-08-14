import Link from 'next/link';

import { OpportunityRow } from '../../components/opportunity-elements.js';
import { listOpportunities } from '../../lib/opportunity-queries.js';

export const dynamic = 'force-dynamic';

const pageSize = 20;
const batchLimit = 100;

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'act_now', label: '立即行动' },
  { key: 'watch', label: '观察' },
  { key: 'research', label: '调研' },
  { key: 'avoid', label: '规避' },
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
        <h1 className="page-title">机会列表</h1>
        <p className="page-subtitle">
          机会分、风险、置信度是三个独立维度——决策前请分别阅读，不要合并成一个总分。
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
          <div className="empty-state">当前视图暂无机会。请尝试其他筛选，或等待管线数据产出。</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>项目</th>
                <th className="num-col">机会分</th>
                <th>风险</th>
                <th className="num-col">置信度</th>
                <th>建议</th>
                <th className="num-col">最新信号</th>
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
              加载更多
            </Link>
          </div>
        )}
      </section>

      <p className="fixture-note">
        被封锁的项目默认隐藏；样例评分（<code>seed-fixture-v1</code>
        ）仅用于演示界面布局，评分管线上线后将被替换。
      </p>
    </main>
  );
}
