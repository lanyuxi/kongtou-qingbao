import Link from 'next/link';

import type { OpportunityListItem, ProjectLifecycle, ProjectSignal } from '@airdrop/database';

export function OpportunityScoreNumber({ score }: { readonly score: number }) {
  return <span className="num">{score.toFixed(0)}</span>;
}

export function recommendationBadgeClass(
  recommendation: OpportunityListItem['recommendation'],
): string {
  switch (recommendation) {
    case 'act_now':
      return 'badge good';
    case 'watch':
      return 'badge info';
    case 'research':
      return 'badge neutral';
    case 'avoid':
      return 'badge warn';
    case 'blocked':
      return 'badge bad';
    default:
      return 'badge neutral';
  }
}

const recommendationLabels: Record<OpportunityListItem['recommendation'], string> = {
  act_now: '立即行动',
  watch: '观察',
  research: '调研',
  avoid: '规避',
  blocked: '已封锁',
};

export function RecommendationBadge({
  recommendation,
}: {
  readonly recommendation: OpportunityListItem['recommendation'];
}) {
  return (
    <span className={recommendationBadgeClass(recommendation)}>
      {recommendationLabels[recommendation]}
    </span>
  );
}

function riskLevel(riskScore: number): 'low' | 'medium' | 'high' {
  if (riskScore < 35) {
    return 'low';
  }
  if (riskScore < 65) {
    return 'medium';
  }
  return 'high';
}

const riskLabels: Record<'low' | 'medium' | 'high', string> = {
  low: '低',
  medium: '中',
  high: '高',
};

export function RiskIndicator({ riskScore }: { readonly riskScore: number }) {
  const level = riskLevel(riskScore);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span className={`risk-dot ${level}`} />
      <span className="num" style={{ fontWeight: 500 }}>
        {riskScore.toFixed(0)}
      </span>
      <span style={{ color: 'var(--ink-500)', fontSize: 12 }}>{riskLabels[level]}</span>
    </span>
  );
}

const lifecycleLabels: Record<ProjectLifecycle, string> = {
  active: '进行中',
  rumored: '传闻中',
  paused: '已暂停',
  ended: '已结束',
  archived: '已归档',
};

export function lifecycleLabel(lifecycle: ProjectLifecycle): string {
  return lifecycleLabels[lifecycle];
}

export function LifecycleBadge({ lifecycle }: { readonly lifecycle: 'active' | 'rumored' }) {
  return lifecycle === 'active' ? (
    <span className="badge good">进行中</span>
  ) : (
    <span className="badge neutral">传闻中</span>
  );
}

export function formatTimestamp(value: string | null): string {
  if (value === null) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toISOString().slice(0, 10);
}

export function OpportunityRow({ item }: { readonly item: OpportunityListItem }) {
  return (
    <tr>
      <td>
        <Link className="project-cell" href={`/projects/${item.slug}`}>
          <span className="project-cell-name">{item.name}</span>
          <span className="project-cell-meta">
            {item.primaryChain ?? '未知公链'}
            {item.lifecycle === 'rumored' ? ' · 传闻' : ''}
            {item.securityPosture === 'caution' ? ' · 谨慎' : ''}
          </span>
        </Link>
      </td>
      <td className="num-col">
        <OpportunityScoreNumber score={item.opportunityScore} />
      </td>
      <td>
        <RiskIndicator riskScore={item.riskScore} />
      </td>
      <td className="num-col">
        <span className="num" style={{ fontWeight: 500 }}>
          {item.confidence.toFixed(0)}%
        </span>
      </td>
      <td>
        <RecommendationBadge recommendation={item.recommendation} />
      </td>
      <td className="num-col" style={{ color: 'var(--ink-500)', fontSize: 12.5 }}>
        {formatTimestamp(item.latestPublishedSignalAt)}
      </td>
    </tr>
  );
}

const verificationLabels: Record<ProjectSignal['verification'], string> = {
  verified: '已验证',
  corroborated: '已佐证',
  unverified: '未验证',
  disputed: '有争议',
  retracted: '已撤回',
};

const signalTypeLabels: Record<string, string> = {
  points_program: '积分计划',
  season_launch: '赛季开启',
  quest_campaign: '任务活动',
  cap_increase: '额度上调',
  testnet_task: '测试网任务',
  docs_hint: '文档线索',
  engagement_campaign: '互动活动',
  criteria_review: '标准调整',
  founder_interview: '创始人访谈',
  incident_followup: '事件跟进',
  marketing_pattern: '营销话术',
  phishing_report: '钓鱼举报',
};

function signalTypeLabel(signalType: string): string {
  return signalTypeLabels[signalType] ?? signalType.replaceAll('_', ' ');
}

export function SignalTimeline({ signals }: { readonly signals: readonly ProjectSignal[] }) {
  if (signals.length === 0) {
    return <div className="empty-state">该项目暂无可见的已发布信号。</div>;
  }
  return (
    <div className="timeline">
      {signals.map((signal) => (
        <div className="timeline-item" key={`${signal.signalType}-${signal.title}`}>
          <span className="timeline-marker" />
          <div className="timeline-body">
            <div className="timeline-meta">
              {formatTimestamp(signal.publishedAt)} · {signalTypeLabel(signal.signalType)} ·{' '}
              {verificationLabels[signal.verification]} · 置信度{' '}
              {signal.confidence.toFixed(0)}%
            </div>
            <div className="timeline-title">{signal.title}</div>
            <p className="timeline-summary">{signal.summary}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
