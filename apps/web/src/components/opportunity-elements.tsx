import Link from 'next/link';

import type { OpportunityListItem, ProjectSignal } from '@airdrop/database';

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
  act_now: 'Act now',
  watch: 'Watch',
  research: 'Research',
  avoid: 'Avoid',
  blocked: 'Blocked',
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
  low: 'Low',
  medium: 'Med',
  high: 'High',
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

export function LifecycleBadge({ lifecycle }: { readonly lifecycle: 'active' | 'rumored' }) {
  return lifecycle === 'active' ? (
    <span className="badge good">Active</span>
  ) : (
    <span className="badge neutral">Rumored</span>
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
            {item.primaryChain ?? 'Unknown chain'}
            {item.lifecycle === 'rumored' ? ' · rumored' : ''}
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
  verified: 'Verified',
  corroborated: 'Corroborated',
  unverified: 'Unverified',
  disputed: 'Disputed',
  retracted: 'Retracted',
};

export function SignalTimeline({ signals }: { readonly signals: readonly ProjectSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="empty-state">
        No published signals are visible for this project yet.
      </div>
    );
  }
  return (
    <div className="timeline">
      {signals.map((signal) => (
        <div className="timeline-item" key={`${signal.signalType}-${signal.title}`}>
          <span className="timeline-marker" />
          <div className="timeline-body">
            <div className="timeline-meta">
              {formatTimestamp(signal.publishedAt)} · {signal.signalType.replaceAll('_', ' ')} ·{' '}
              {verificationLabels[signal.verification]} · confidence{' '}
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
