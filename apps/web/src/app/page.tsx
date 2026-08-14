import Link from 'next/link';

import { OpportunityRow } from '../components/opportunity-elements.js';
import { loadOpportunityOverview } from '../lib/opportunity-queries.js';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const overview = await loadOpportunityOverview();

  return (
    <main>
      <div className="page-header">
        <h1 className="page-title">总览</h1>
        <p className="page-subtitle">今日值得关注的公开参与机会，一屏掌握全局。</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card emph">
          <div className="stat-value">{overview.actNowCount}</div>
          <div className="stat-label">建议立即行动</div>
        </div>
        <div className="stat-card risk">
          <div className="stat-value">{overview.highRiskCount}</div>
          <div className="stat-label">高风险（≥70）</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.activeCount}</div>
          <div className="stat-label">进行中活动</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.rumoredCount}</div>
          <div className="stat-label">传闻阶段项目</div>
        </div>
      </div>

      <section className="card">
        <h2 className="card-heading">热门机会</h2>
        {overview.top.length === 0 ? (
          <div className="empty-state">暂无已评分机会。数据管线尚未产出已发布结果。</div>
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
              {overview.top.map((item) => (
                <OpportunityRow key={item.projectId} item={item} />
              ))}
            </tbody>
          </table>
        )}
        <div className="load-more">
          <Link className="button" href="/opportunities">
            查看全部机会 →
          </Link>
        </div>
      </section>

      <p className="fixture-note">
        当前 MVP 中的评分来自手工构造的样例数据（模型版本 <code>seed-fixture-v1</code>
        ），仅用于演示界面，后续将由情报管线产出的结果替换。
      </p>
    </main>
  );
}
