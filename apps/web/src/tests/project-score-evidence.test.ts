import { readFileSync } from 'node:fs';

import type { ProjectEvidenceCitation, ProjectScoreFactor } from '@airdrop/database';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ScoreEvidenceCitations,
  ScoreFactorGroups,
} from '../components/project-score-evidence.js';

const factorLabels: readonly [ProjectScoreFactor['axis'], string, string][] = [
  ['opportunity', 'signal_strength', '信号强度'],
  ['opportunity', 'signal_freshness', '信号新鲜度'],
  ['opportunity', 'signal_volume', '有效信号数量'],
  ['risk', 'unverified_share', '未验证信号占比'],
  ['risk', 'hostile_signals', '争议/撤回信号'],
  ['risk', 'unofficial_provenance', '非官方来源占比'],
  ['confidence', 'signal_volume', '已发布信号数量'],
  ['confidence', 'verification_mix', '验证等级构成'],
  ['confidence', 'official_provenance', '官方来源占比'],
];

const sourceTypeLabels: readonly [ProjectEvidenceCitation['sourceType'], string][] = [
  ['official_web', '官方网站'],
  ['official_social', '官方社交账号'],
  ['official_docs', '官方文档'],
  ['code_repository', '代码仓库'],
  ['chain_explorer', '链上浏览器'],
  ['independent_research', '独立研究'],
  ['news', '新闻媒体'],
  ['community', '社区来源'],
];

describe('ScoreFactorGroups', () => {
  it('renders the nine current factors in three independent localized axis groups', () => {
    const factors = factorLabels.map(([axis, factorCode], index) =>
      createFactor({
        axis,
        factorCode,
        contribution: 42.5 - index,
        inputValue: 0.8 + index / 100,
        detail: `因子明细 ${index + 1}`,
      }),
    );

    const html = renderToStaticMarkup(createElement(ScoreFactorGroups, { factors }));

    const opportunityHeading = html.indexOf('>机会</h3>');
    const riskHeading = html.indexOf('>风险</h3>');
    const confidenceHeading = html.indexOf('>置信度</h3>');
    expect(opportunityHeading).toBeGreaterThanOrEqual(0);
    expect(riskHeading).toBeGreaterThan(opportunityHeading);
    expect(confidenceHeading).toBeGreaterThan(riskHeading);
    for (const [, , label] of factorLabels) {
      expect(html).toContain(label);
    }
    expect(html).toContain('贡献值 +42.50');
    expect(html).toContain('输入值 0.8000');
    expect(html).toContain('因子明细 1');
  });

  it('uses a safe humanized fallback for an unknown future factor code', () => {
    const html = renderToStaticMarkup(
      createElement(ScoreFactorGroups, {
        factors: [createFactor({ factorCode: 'future_score_weight' })],
      }),
    );

    expect(html).toContain('未知因子（future score weight）');
  });

  it('renders an explicit empty state without synthesizing factors', () => {
    const html = renderToStaticMarkup(createElement(ScoreFactorGroups, { factors: [] }));

    expect(html).toContain('该评分快照暂无因子分解数据。');
    expect(html).not.toContain('>机会</h3>');
  });

  it('labels retained factors as a pre-incident historical snapshot only when marked historical', () => {
    const factors = [createFactor({ detail: '安全事件发生前保留的因子明细。' })];

    const historical = renderToStaticMarkup(
      createElement(ScoreFactorGroups, { factors, historical: true }),
    );
    const current = renderToStaticMarkup(createElement(ScoreFactorGroups, { factors }));

    expect(historical).toContain('历史评分快照');
    expect(historical).toContain('安全事件发生前保留的因子明细。');
    expect(current).not.toContain('历史评分快照');
  });

  it('renders the historical notice outside the three-column factor grid', () => {
    const html = renderToStaticMarkup(
      createElement(ScoreFactorGroups, {
        factors: [createFactor({})],
        historical: true,
      }),
    );

    const gridStart = html.indexOf('class="score-factor-groups"');
    expect(gridStart).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('历史评分快照')).toBeLessThan(gridStart);
  });
});

describe('ScoreEvidenceCitations', () => {
  it('renders reviewed citation content as escaped inert text with no anchor and score-level wording', () => {
    const html = renderToStaticMarkup(
      createElement(ScoreEvidenceCitations, {
        projectLifecycle: 'active',
        citations: [
          createCitation({
            citationText: '<script>alert(1)</script> reviewed quote',
          }),
        ],
      }),
    );

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; reviewed quote');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href');
    expect(html).toContain('本次评分快照使用的证据集');
    expect(html).toContain('不代表每条证据单独决定某个评分因子');
  });

  it('groups citations by signal while preserving multiple conflicting Evidence records', () => {
    const html = renderToStaticMarkup(
      createElement(ScoreEvidenceCitations, {
        projectLifecycle: 'active',
        citations: [
          createCitation({
            evidenceId: 'b1000000-0000-4000-8000-000000000011',
            citationText: '第一条证据认为活动仍在继续。',
          }),
          createCitation({
            evidenceId: 'b1000000-0000-4000-8000-000000000012',
            citationText: '第二条证据认为活动已经结束。',
            sourceName: '独立研究机构',
            sourceType: 'independent_research',
            sourceIsOfficial: false,
            sourceRelationVerifiedAt: null,
          }),
          createCitation({
            signalId: 'b1000000-0000-4000-8000-000000000013',
            signalTitle: '另一个已发布信号',
            evidenceId: 'b1000000-0000-4000-8000-000000000014',
            citationText: '第三条证据属于第二个分组。',
          }),
        ],
      }),
    );

    expect(countOccurrences(html, '积分计划延长')).toBe(1);
    expect(countOccurrences(html, '另一个已发布信号')).toBe(1);
    expect(html).toContain('第一条证据认为活动仍在继续。');
    expect(html).toContain('第二条证据认为活动已经结束。');
    expect(html).toContain('第三条证据属于第二个分组。');
  });

  it('keeps rumored-project citations hidden even if citation input is present', () => {
    const html = renderToStaticMarkup(
      createElement(ScoreEvidenceCitations, {
        projectLifecycle: 'rumored',
        citations: [createCitation({ citationText: '这条传闻项目引用不得公开展示。' })],
      }),
    );

    expect(html).toContain('传闻项目的信号与证据引用暂不公开。');
    expect(html).not.toContain('这条传闻项目引用不得公开展示。');
  });

  it('renders an explicit active-project empty state', () => {
    const html = renderToStaticMarkup(
      createElement(ScoreEvidenceCitations, {
        projectLifecycle: 'active',
        citations: [],
      }),
    );

    expect(html).toContain('本次评分快照暂无可公开的证据引用。');
  });

  it('labels retained citations as a pre-incident historical snapshot only when marked historical', () => {
    const citations = [createCitation({ citationText: '安全事件发生前保留的证据引用。' })];

    const historical = renderToStaticMarkup(
      createElement(ScoreEvidenceCitations, {
        projectLifecycle: 'active',
        citations,
        historical: true,
      }),
    );
    const current = renderToStaticMarkup(
      createElement(ScoreEvidenceCitations, { projectLifecycle: 'active', citations }),
    );

    expect(historical).toContain('历史评分快照');
    expect(historical).toContain('安全事件发生前保留的证据引用。');
    expect(current).not.toContain('历史评分快照');
  });

  it('uses the approved official-source wording only for a verified official relation', () => {
    const html = renderToStaticMarkup(
      createElement(ScoreEvidenceCitations, {
        projectLifecycle: 'active',
        citations: [
          createCitation(),
          createCitation({
            evidenceId: 'b1000000-0000-4000-8000-000000000015',
            citationText: '这条引用来自未登记为官方的社区来源。',
            sourceName: '项目社区',
            sourceType: 'community',
            sourceIsOfficial: false,
            sourceRelationVerifiedAt: null,
          }),
        ],
      }),
    );

    expect(countOccurrences(html, '项目登记为官方来源')).toBe(1);
    expect(html).not.toContain('官方确认空投');
    expect(html).not.toContain('官方确认资格');
  });

  it('localizes all eight safe source types', () => {
    const citations = sourceTypeLabels.map(([sourceType], index) =>
      createCitation({
        evidenceId: `b1000000-0000-4000-8000-${String(20 + index).padStart(12, '0')}`,
        citationText: `第 ${index + 1} 条已审核引用文字。`,
        sourceName: `来源 ${index + 1}`,
        sourceType,
        sourceIsOfficial: false,
        sourceRelationVerifiedAt: null,
      }),
    );

    const html = renderToStaticMarkup(
      createElement(ScoreEvidenceCitations, { projectLifecycle: 'active', citations }),
    );

    for (const [, label] of sourceTypeLabels) {
      expect(html).toContain(label);
    }
  });

  it('does not reference unsafe or outbound-link fields in the public component source', () => {
    const source = readFileSync(
      new URL('../components/project-score-evidence.tsx', import.meta.url),
      'utf8',
    );

    for (const forbidden of [
      'href',
      'canonical_url',
      'raw_text',
      'reviewer',
      'outbox',
      'dangerouslySetInnerHTML',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

function createFactor(overrides: Partial<ProjectScoreFactor> = {}): ProjectScoreFactor {
  return {
    axis: 'opportunity',
    factorCode: 'signal_strength',
    contribution: 42.5,
    inputValue: 0.8,
    detail: '加权信号强度 80.0%',
    ...overrides,
  };
}

function createCitation(
  overrides: Partial<ProjectEvidenceCitation> = {},
): ProjectEvidenceCitation {
  return {
    signalId: 'b1000000-0000-4000-8000-000000000003',
    signalTitle: '积分计划延长',
    signalVerification: 'verified',
    signalPublishedAt: '2026-08-24T00:00:00.000Z',
    evidenceId: 'b1000000-0000-4000-8000-000000000004',
    citationText: '官方公告明确说明积分计划将继续开放。',
    evidenceSourceField: 'article_raw_text',
    evidenceVerifiedAt: '2026-08-24T01:00:00.000Z',
    sourceId: 'b1000000-0000-4000-8000-000000000005',
    sourceName: '项目官方博客',
    sourceType: 'official_web',
    sourceIsOfficial: true,
    sourceRelationVerifiedAt: '2026-08-23T00:00:00.000Z',
    ...overrides,
  };
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
