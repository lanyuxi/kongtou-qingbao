import {
  type PublicActiveSecurityIncidentSummary,
  type PublicBlockedProjectSecurityRow,
  type PublicProjectSecurityState,
  type SecurityIncidentCategory,
  type SecurityIndicatorType,
  type SecurityPosture,
  type SecuritySeverity,
} from '@airdrop/contracts';
import Link from 'next/link';

import { SecurityPostureBadge, formatTimestamp } from './opportunity-elements.js';

const categoryLabels: Readonly<Record<SecurityIncidentCategory, string>> = {
  phishing: '钓鱼仿冒',
  impersonation: '身份冒充',
  malicious_contract: '恶意合约',
  source_compromise: '来源被控',
  fraudulent_claim: '虚假声明',
  fund_loss: '资金损失',
  other_security_risk: '其他安全风险',
};

const severityLabels: Readonly<Record<SecuritySeverity, string>> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
};

const indicatorTypeLabels: Readonly<Record<SecurityIndicatorType, string>> = {
  domain: '域名',
  url: '网址',
  contract_address: '合约地址',
  transaction_hash: '交易哈希',
  social_account: '社交账号',
  observed_behavior: '观察到的行为',
};

export function SafeSecurityIndicatorText({ value }: { readonly value: string }) {
  return <code className="security-indicator-text">{value}</code>;
}

export function ProjectSecurityBanner({ state }: { readonly state: PublicProjectSecurityState }) {
  if (state.posture === 'clear') {
    return null;
  }
  const blocked = state.posture === 'blocked';

  return (
    <section
      className={`security-banner security-banner-${state.posture}`}
      role="alert"
      aria-label="安全状态提示"
    >
      <div className="security-banner-heading">
        <h2>{blocked ? '当前项目已被安全封锁' : '该项目存在安全关注'}</h2>
        <SecurityPostureBadge posture={state.posture} />
      </div>
      <p className="security-banner-body">
        {blocked
          ? '安全事件生效期间，该项目已退出机会列表、首页推荐与统计排序；下列评分与证据只是事件发生前的历史评分快照，不能作为当前行动建议。'
          : '已发布信号与评分继续展示并照常排序，但该项目新的正式情报须由安全审核人复核后发布。'}
      </p>
      {state.activeIncidents.map((incident) => (
        <SecurityIncidentSummary incident={incident} key={incident.incidentId} />
      ))}
      {blocked ? (
        <p className="security-banner-disclaimer">
          官方来源身份仅在其声明范围内有效，不能覆盖独立的安全证据；安全结论来自追加式审核记录。
        </p>
      ) : null}
    </section>
  );
}

export function BlockedProjectTable({
  items,
}: {
  readonly items: readonly PublicBlockedProjectSecurityRow[];
}) {
  if (items.length === 0) {
    return <div className="empty-state">暂无被安全封锁的项目。</div>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>项目</th>
          <th>类别</th>
          <th>严重度</th>
          <th>公开摘要</th>
          <th>已公开指标</th>
          <th className="num-col">最近核验</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <BlockedProjectRow item={item} key={item.project.id} />
        ))}
      </tbody>
    </table>
  );
}

export function BlockedProjectRow({ item }: { readonly item: PublicBlockedProjectSecurityRow }) {
  return (
    <tr>
      <td>
        <Link className="project-cell" href={`/projects/${item.project.slug}`}>
          <span className="project-cell-name">{item.project.name}</span>
          <span className="project-cell-meta">详情仍可访问 · 参与入口已停用</span>
        </Link>
      </td>
      <td>{categoryLabels[item.category]}</td>
      <td>{severityLabels[item.severity]}</td>
      <td>{item.publicSummary}</td>
      <td>
        {item.indicators.length === 0 ? (
          <span style={{ color: 'var(--ink-500)', fontSize: 12.5 }}>未公开指标</span>
        ) : (
          item.indicators.map((indicator) => (
            <span className="security-indicator" key={indicator.id}>
              {indicatorTypeLabels[indicator.type]}
              <SafeSecurityIndicatorText value={indicator.value} />
            </span>
          ))
        )}
      </td>
      <td className="num-col" style={{ color: 'var(--ink-500)', fontSize: 12.5 }}>
        {formatTimestamp(item.lastVerifiedAt)}
      </td>
    </tr>
  );
}

export function blockedProjectsPageHref(cursor: string | null): string {
  return cursor === null
    ? '/opportunities?tab=blocked'
    : `/opportunities?tab=blocked&after=${encodeURIComponent(cursor)}`;
}

export function OfficialWebsiteLink({
  url,
  posture,
}: {
  readonly url: string | null;
  readonly posture: SecurityPosture;
}) {
  if (url === null) {
    return null;
  }
  if (posture === 'blocked') {
    return (
      <span style={{ color: 'var(--ink-500)' }}>官方网站（安全封锁期间外部跳转已停用）</span>
    );
  }
  return (
    <a
      href={url}
      rel="noreferrer noopener"
      style={{ color: 'var(--accent-ink)' }}
      target="_blank"
    >
      官方网站 ↗
    </a>
  );
}

function SecurityIncidentSummary({
  incident,
}: {
  readonly incident: PublicActiveSecurityIncidentSummary;
}) {
  return (
    <div className="security-incident-summary">
      <div className="security-incident-meta">
        {categoryLabels[incident.category]} · 严重度 {severityLabels[incident.severity]} · 处置中 ·
        首次发现 {formatTimestamp(incident.firstObservedAt)} · 最近核验{' '}
        {formatTimestamp(incident.lastVerifiedAt)}
      </div>
      <p className="security-incident-summary-text">{incident.publicSummary}</p>
      {incident.indicators.length === 0 ? null : (
        <div className="security-indicator-list">
          <span className="security-indicator-heading">已公开指标</span>
          {incident.indicators.map((indicator) => (
            <span className="security-indicator" key={indicator.id}>
              {indicatorTypeLabels[indicator.type]}
              <SafeSecurityIndicatorText value={indicator.value} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
