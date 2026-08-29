import type {
  ProjectEvidenceCitation,
  ProjectLifecycle,
  ProjectScoreFactor,
} from '@airdrop/database';

import { formatTimestamp } from './opportunity-elements.js';

const axisGroups: readonly {
  readonly axis: ProjectScoreFactor['axis'];
  readonly label: string;
}[] = [
  { axis: 'opportunity', label: '机会' },
  { axis: 'risk', label: '风险' },
  { axis: 'confidence', label: '置信度' },
];

const factorLabels: Readonly<
  Record<ProjectScoreFactor['axis'], Readonly<Record<string, string>>>
> = {
  opportunity: {
    signal_strength: '信号强度',
    signal_freshness: '信号新鲜度',
    signal_volume: '有效信号数量',
  },
  risk: {
    unverified_share: '未验证信号占比',
    hostile_signals: '争议/撤回信号',
    unofficial_provenance: '非官方来源占比',
  },
  confidence: {
    signal_volume: '已发布信号数量',
    verification_mix: '验证等级构成',
    official_provenance: '官方来源占比',
  },
};

const verificationLabels: Record<ProjectEvidenceCitation['signalVerification'], string> = {
  verified: '已验证',
  corroborated: '已佐证',
  unverified: '未验证',
  disputed: '有争议',
  retracted: '已撤回',
};

const sourceTypeLabels: Record<ProjectEvidenceCitation['sourceType'], string> = {
  official_web: '官方网站',
  official_social: '官方社交账号',
  official_docs: '官方文档',
  code_repository: '代码仓库',
  chain_explorer: '链上浏览器',
  independent_research: '独立研究',
  news: '新闻媒体',
  community: '社区来源',
};

export function ScoreFactorGroups({
  factors,
  historical = false,
}: {
  readonly factors: readonly ProjectScoreFactor[];
  readonly historical?: boolean;
}) {
  if (factors.length === 0) {
    return <div className="empty-state">该评分快照暂无因子分解数据。</div>;
  }

  return (
    <>
      {historical ? (
        <p className="score-historical-notice">
          历史评分快照：以下因子来自安全事件发生前的评分，不代表当前结论。
        </p>
      ) : null}
      <div className="score-factor-groups">
        {axisGroups.map(({ axis, label }) => {
          const axisFactors = factors.filter((factor) => factor.axis === axis);
          return (
            <section className={`score-factor-group score-factor-group-${axis}`} key={axis}>
              <h3>{label}</h3>
              {axisFactors.length === 0 ? (
                <p className="score-factor-axis-empty">该轴暂无因子数据。</p>
              ) : (
                <div className="score-factor-list">
                  {axisFactors.map((factor) => (
                    <div className="score-factor-row" key={`${axis}:${factor.factorCode}`}>
                      <div className="score-factor-heading">
                        <strong>{factorLabel(factor)}</strong>
                        <span>
                          贡献值 +{factor.contribution.toFixed(2)} · 输入值{' '}
                          {factor.inputValue.toFixed(4)}
                        </span>
                      </div>
                      <p>{factor.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

export function ScoreEvidenceCitations({
  projectLifecycle,
  citations,
  historical = false,
}: {
  readonly projectLifecycle: ProjectLifecycle;
  readonly citations: readonly ProjectEvidenceCitation[];
  readonly historical?: boolean;
}) {
  return (
    <div className="score-evidence-citations">
      <p className="score-evidence-notice">
        {historical
          ? '历史评分快照：以下为安全事件发生前该评分使用的证据集，不代表每条证据单独决定某个评分因子，也不代表当前结论。'
          : '以下为本次评分快照使用的证据集，不代表每条证据单独决定某个评分因子。'}
      </p>
      {projectLifecycle !== 'active' ? (
        <div className="empty-state">
          {projectLifecycle === 'rumored'
            ? '传闻项目的信号与证据引用暂不公开。'
            : '该项目的信号与证据引用暂不公开。'}
        </div>
      ) : citations.length === 0 ? (
        <div className="empty-state">本次评分快照暂无可公开的证据引用。</div>
      ) : (
        <div className="score-evidence-groups">
          {groupCitationsBySignal(citations).map((group) => (
            <section className="score-evidence-group" key={group.signalId}>
              <div className="score-evidence-signal-heading">
                <h3>{group.signalTitle}</h3>
                <span>
                  {formatTimestamp(group.signalPublishedAt)} ·{' '}
                  {verificationLabels[group.signalVerification]}
                </span>
              </div>
              <div className="score-evidence-list">
                {group.citations.map((citation, index) => (
                  <div
                    className="score-evidence-citation"
                    key={`${citation.evidenceId}:${index}`}
                  >
                    <blockquote className="score-evidence-quote">
                      {citation.citationText}
                    </blockquote>
                    <div className="score-evidence-source">
                      {citation.sourceName} · {sourceTypeLabels[citation.sourceType]} · Evidence
                      核验于 {formatTimestamp(citation.evidenceVerifiedAt)}
                      {citation.sourceIsOfficial &&
                      citation.sourceRelationVerifiedAt !== null
                        ? ' · 项目登记为官方来源'
                        : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function factorLabel(factor: ProjectScoreFactor): string {
  return (
    factorLabels[factor.axis][factor.factorCode] ??
    `未知因子（${factor.factorCode.replaceAll('_', ' ')}）`
  );
}

interface CitationGroup {
  readonly signalId: string;
  readonly signalTitle: string;
  readonly signalVerification: ProjectEvidenceCitation['signalVerification'];
  readonly signalPublishedAt: string | null;
  readonly citations: ProjectEvidenceCitation[];
}

function groupCitationsBySignal(
  citations: readonly ProjectEvidenceCitation[],
): readonly CitationGroup[] {
  const groups = new Map<string, CitationGroup>();
  for (const citation of citations) {
    const existing = groups.get(citation.signalId);
    if (existing === undefined) {
      groups.set(citation.signalId, {
        signalId: citation.signalId,
        signalTitle: citation.signalTitle,
        signalVerification: citation.signalVerification,
        signalPublishedAt: citation.signalPublishedAt,
        citations: [citation],
      });
      continue;
    }
    existing.citations.push(citation);
  }
  return [...groups.values()];
}
