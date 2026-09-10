import Link from 'next/link';

import { RecommendationBadge } from '../components/opportunity-elements.js';
import { loadOpportunityOverview } from '../lib/opportunity-queries.js';

export const dynamic = 'force-dynamic';

/**
 * Explanations for the four headline figures. They are rendered as a hint
 * beside each label rather than as body copy, because the definition of these
 * numbers is exactly what a reader needs when a figure surprises them — not
 * something they should have to scroll to find.
 */
const statDefinitions = {
  actNow: '机会分较高、风险可控且证据较充分的条目。这只是"值得优先投入时间"的判断，不是收益承诺。',
  highRisk:
    '风险分 ≥ 70 的项目。风险与机会分是两个独立维度：一个机会分很高、同时风险也很高的项目会同时出现在这两个数字里。',
  active: '生命周期为"进行中"的项目，通常表示活动已公开、可以参与。',
  rumored:
    '生命周期为"传闻"的项目：尚未获得官方确认，仅存在间接线索。不确定性最高，建议只作观察。',
} as const;

export default async function OverviewPage() {
  const overview = await loadOpportunityOverview();

  return (
    <main>
      <div className="page-header">
        <h1 className="page-title">总览</h1>
        <p className="page-subtitle">今日值得关注的公开参与机会，一屏掌握全局。</p>
      </div>

      <div className="stat-grid">
        <StatCard className="emph" value={overview.actNowCount} label="建议立即行动" hint={statDefinitions.actNow} />
        <StatCard className="risk" value={overview.highRiskCount} label="高风险（≥70）" hint={statDefinitions.highRisk} />
        <StatCard value={overview.activeCount} label="进行中活动" hint={statDefinitions.active} />
        <StatCard value={overview.rumoredCount} label="传闻阶段项目" hint={statDefinitions.rumored} />
      </div>

      <section className="card">
        <h2 className="card-heading">热门机会 · 机会分前 20</h2>
        {overview.top.length === 0 ? (
          <div className="empty-state">暂无已评分机会。数据管线尚未产出已发布结果。</div>
        ) : (
          <div className="opportunity-grid">
            {overview.top.map((item) => (
              <Link
                key={item.projectId}
                href={`/projects/${item.slug}`}
                className="opportunity-tile"
              >
                {/* No logo column exists on the project record yet, so the mark
                    is derived from the name: stable, offline, and it reads as a
                    monogram rather than pretending to be a brand asset. */}
                {/* Mark and identity share a row: the mark anchors the card's
                    left edge and the name reads immediately beside it. */}
                <span className="opportunity-tile-head">
                  <span
                    className="opportunity-tile-mark"
                    style={{ background: markGradient(item.name) }}
                    aria-hidden="true"
                  >
                    {monogram(item.name)}
                  </span>
                  <span className="opportunity-tile-ident">
                    <span className="opportunity-tile-name">{item.name}</span>
                    <span className="opportunity-tile-chain">
                      {item.primaryChain ?? '未知公链'}
                    </span>
                  </span>
                </span>
                <span className="opportunity-tile-score">{Math.round(item.opportunityScore)}</span>
                <span className="opportunity-tile-caption">机会分</span>
                <span className="opportunity-tile-badges">
                  <span className={`badge ${riskTone(item.riskScore)}`}>
                    风险 {Math.round(item.riskScore)}
                  </span>
                  <RecommendationBadge recommendation={item.recommendation} />
                </span>
              </Link>
            ))}
          </div>
        )}
        <div className="load-more">
          <Link className="button" href="/opportunities">
            查看全部机会 →
          </Link>
        </div>
      </section>

      <p className="fixture-note">
        这些机会由公开来源自动采集、经 AI 提取后直接呈现，<strong>未经人工逐条核验</strong>
        （信号标记为「未验证」）。每条机会都能追溯到原始出处，参与前请自行确认关键信息。
        标注为 <code>seed-fixture-v1</code> 的样例数据仅用于演示界面，会被真实结果逐步替换。
        被安全封锁的项目不计入以上统计与推荐，可在{' '}
        <Link href="/opportunities?tab=blocked">安全封锁视图</Link> 查看。
      </p>
    </main>
  );
}

function StatCard({
  value,
  label,
  hint,
  className,
}: {
  readonly value: number;
  readonly label: string;
  readonly hint: string;
  readonly className?: string;
}) {
  return (
    <div className={`stat-card${className === undefined ? '' : ` ${className}`}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">
        {label}
        {/* A CSS-only tooltip: no client component, so the overview page stays
            a server component with no JavaScript shipped for this. */}
        <span className="stat-hint" tabIndex={0} role="note" aria-label={hint} data-tip={hint}>
          ?
        </span>
      </div>
    </div>
  );
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/u).filter((word) => word !== '');
  const first = words[0];
  if (first === undefined) return '?';
  const second = words[1];
  if (second === undefined) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

/**
 * Stable hue per name, so a project keeps the same colour across renders and
 * pages without storing anything.
 */
function markGradient(name: string): string {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 360;
  }
  const from = hash;
  const to = (hash + 38) % 360;
  return `linear-gradient(135deg, hsl(${from} 62% 46%), hsl(${to} 58% 34%))`;
}

function riskTone(score: number): string {
  if (score >= 70) return 'bad';
  if (score >= 40) return 'warn';
  return 'good';
}
