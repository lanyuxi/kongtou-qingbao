import type {
  PublicBlockedProjectSecurityRow,
  PublicProjectSecurityState,
} from '@airdrop/contracts';
import type { OpportunityListItem } from '@airdrop/database';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OpportunityRow } from '../components/opportunity-elements.js';
import {
  BlockedProjectTable,
  OfficialWebsiteLink,
  ProjectSecurityBanner,
  SafeSecurityIndicatorText,
  SecurityPostureBadge,
  blockedProjectsPageHref,
} from '../components/security-elements.js';

const projectId = 'b1000000-0000-4000-8000-000000000001';
const incidentId = 'b1000000-0000-4000-8000-000000000002';
const indicatorId = 'b1000000-0000-4000-8000-000000000003';

const hostileSummary = '<script>alert(1)</script> 该项目出现仿冒领取页面，请勿连接钱包。';

const blockedState: PublicProjectSecurityState = {
  version: 1,
  projectId,
  posture: 'blocked',
  activeIncidents: [
    {
      version: 1,
      incidentId,
      target: { type: 'project', id: projectId },
      category: 'phishing',
      severity: 'critical',
      state: 'active',
      publicSummary: '该项目出现仿冒领取页面，请勿在任何页面连接钱包。',
      firstObservedAt: '2026-08-28T00:00:00.000Z',
      lastVerifiedAt: '2026-08-29T00:00:00.000Z',
      indicators: [{ id: indicatorId, type: 'domain', value: 'claim.example' }],
    },
  ],
};

const cautionState: PublicProjectSecurityState = {
  version: 1,
  projectId,
  posture: 'caution',
  activeIncidents: [
    {
      ...blockedState.activeIncidents[0]!,
      severity: 'medium',
      category: 'impersonation',
      publicSummary: '该项目出现疑似冒充的社交账号，请谨慎核对官方渠道。',
    },
  ],
};

const clearState: PublicProjectSecurityState = {
  version: 1,
  projectId,
  posture: 'clear',
  activeIncidents: [],
};

const blockedRow: PublicBlockedProjectSecurityRow = {
  version: 1,
  project: { id: projectId, slug: 'demo-project', name: '演示项目' },
  posture: 'blocked',
  category: 'phishing',
  severity: 'critical',
  publicSummary: '该项目出现仿冒领取页面，请勿在任何页面连接钱包。',
  firstObservedAt: '2026-08-28T00:00:00.000Z',
  lastVerifiedAt: '2026-08-29T00:00:00.000Z',
  target: { type: 'project', id: projectId },
  indicators: [{ id: indicatorId, type: 'domain', value: 'claim.example' }],
};

describe('SafeSecurityIndicatorText', () => {
  it('renders public-safe indicator values as inert text without anchors or markup', () => {
    const html = renderToStaticMarkup(
      createElement(SafeSecurityIndicatorText, { value: '<script>alert(1)</script>' }),
    );

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href');
  });

  it('renders a URL-shaped indicator value as text only', () => {
    const html = renderToStaticMarkup(
      createElement(SafeSecurityIndicatorText, { value: 'https://claim.example/airdrop' }),
    );

    expect(html).toContain('https://claim.example/airdrop');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href=');
  });
});

describe('SecurityPostureBadge', () => {
  it('renders no posture badge while posture is clear', () => {
    expect(renderToStaticMarkup(createElement(SecurityPostureBadge, { posture: 'clear' }))).toBe(
      '',
    );
  });

  it('labels caution and blocked posture badges', () => {
    expect(
      renderToStaticMarkup(createElement(SecurityPostureBadge, { posture: 'caution' })),
    ).toContain('谨慎');
    expect(
      renderToStaticMarkup(createElement(SecurityPostureBadge, { posture: 'blocked' })),
    ).toContain('已封锁');
  });
});

describe('ProjectSecurityBanner', () => {
  it('renders a blocked banner with historical score labeling, an alert role, and no anchors', () => {
    const html = renderToStaticMarkup(createElement(ProjectSecurityBanner, { state: blockedState }));

    expect(html).toContain('当前项目已被安全封锁');
    expect(html).toContain('历史评分快照');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('reviewerUserId');
    expect(html).not.toContain('evidenceId');
  });

  it('renders nothing when posture is clear after every incident is resolved', () => {
    expect(renderToStaticMarkup(createElement(ProjectSecurityBanner, { state: clearState }))).toBe(
      '',
    );
  });

  it('keeps caution visible without historical score labeling', () => {
    const html = renderToStaticMarkup(createElement(ProjectSecurityBanner, { state: cautionState }));

    expect(html).toContain('谨慎');
    expect(html).toContain('照常排序');
    expect(html).not.toContain('历史评分快照');
    expect(html).not.toContain('当前项目已被安全封锁');
  });

  it('renders active incident category, severity, and verification window', () => {
    const html = renderToStaticMarkup(createElement(ProjectSecurityBanner, { state: blockedState }));

    expect(html).toContain('钓鱼仿冒');
    expect(html).toContain('严重');
    expect(html).toContain('处置中');
    expect(html).toContain('2026-08-28');
    expect(html).toContain('2026-08-29');
    expect(html).not.toContain('已解除');
  });

  it('renders the official-source disclaimer inside the blocked banner', () => {
    const html = renderToStaticMarkup(createElement(ProjectSecurityBanner, { state: blockedState }));

    expect(html).toContain('官方来源');
    expect(html).toContain('安全证据');
  });

  it('omits the indicator section when no public-safe indicator is approved', () => {
    const state: PublicProjectSecurityState = {
      ...blockedState,
      activeIncidents: [{ ...blockedState.activeIncidents[0]!, indicators: [] }],
    };

    const html = renderToStaticMarkup(createElement(ProjectSecurityBanner, { state }));

    expect(html).toContain('当前项目已被安全封锁');
    expect(html).not.toContain('claim.example');
    expect(html).not.toContain('已公开指标');
  });

  it('escapes html and markdown inside hostile public summaries', () => {
    const state: PublicProjectSecurityState = {
      ...blockedState,
      activeIncidents: [
        {
          ...blockedState.activeIncidents[0]!,
          publicSummary: hostileSummary,
          indicators: [{ id: indicatorId, type: 'url', value: '[点击](https://evil.example)' }],
        },
      ],
    };

    const html = renderToStaticMarkup(createElement(ProjectSecurityBanner, { state }));

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('[点击](https://evil.example)');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('<strong>');
  });
});

describe('BlockedProjectTable', () => {
  it('renders blocked rows with an internal project link and no external anchor', () => {
    const html = renderToStaticMarkup(
      createElement(BlockedProjectTable, { items: [blockedRow] }),
    );

    expect(html).toContain('演示项目');
    expect(html).toContain('href="/projects/demo-project"');
    expect(html).toContain('claim.example');
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
    expect(html).not.toContain('reviewerUserId');
  });

  it('renders an explicit empty state without synthesizing blocked rows', () => {
    const html = renderToStaticMarkup(createElement(BlockedProjectTable, { items: [] }));

    expect(html).toContain('暂无被安全封锁的项目');
    expect(html).not.toContain('<table');
  });
});

describe('blockedProjectsPageHref', () => {
  it('builds cursor-paginated blocked view hrefs', () => {
    expect(blockedProjectsPageHref(null)).toBe('/opportunities?tab=blocked');
    expect(blockedProjectsPageHref('cursor-value')).toBe(
      '/opportunities?tab=blocked&after=cursor-value',
    );
  });
});

describe('OfficialWebsiteLink', () => {
  it('renders the official website link as an anchor while posture is clear', () => {
    const html = renderToStaticMarkup(
      createElement(OfficialWebsiteLink, {
        url: 'https://demo.example.test',
        posture: 'clear',
      }),
    );

    expect(html).toContain('href="https://demo.example.test"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it('disables the official website link while the project is blocked', () => {
    const html = renderToStaticMarkup(
      createElement(OfficialWebsiteLink, {
        url: 'https://demo.example.test',
        posture: 'blocked',
      }),
    );

    expect(html).not.toContain('<a');
    expect(html).not.toContain('demo.example.test');
    expect(html).toContain('已停用');
  });

  it('renders nothing when the project has no registered website', () => {
    expect(
      renderToStaticMarkup(createElement(OfficialWebsiteLink, { url: null, posture: 'clear' })),
    ).toBe('');
  });
  it('does not reference internal security or outbound-link fields in the public component source', () => {
    const source = readFileSync(
      new URL('../components/security-elements.tsx', import.meta.url),
      'utf8',
    );

    for (const forbidden of [
      'dangerouslySetInnerHTML',
      'reviewer',
      'internalNote',
      'outbox',
      'locator',
      'payload',
      'markdown',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe('OpportunityRow security presentation', () => {
  it('keeps caution projects in the ordinary opportunity row with a warning and unchanged order', () => {
    const html = renderToStaticMarkup(
      createElement(OpportunityRow, { item: createOpportunityItem('caution') }),
    );

    expect(html).toContain('谨慎');
    expect(html).toContain('72');
    expect(html).toContain('演示项目');
  });

  it('renders no security marker for clear projects', () => {
    const html = renderToStaticMarkup(
      createElement(OpportunityRow, { item: createOpportunityItem('clear') }),
    );

    expect(html).toContain('演示项目');
    expect(html).not.toContain('谨慎');
    expect(html).not.toContain('已封锁');
  });
});

function createOpportunityItem(posture: 'clear' | 'caution' | 'blocked'): OpportunityListItem {
  return {
    projectId,
    slug: 'demo-project',
    name: '演示项目',
    summary: '用于机会行安全呈现测试。',
    lifecycle: 'active',
    primaryChain: 'Ethereum',
    opportunityScore: 72.4,
    riskScore: 31,
    confidence: 64,
    recommendation: 'watch',
    calculatedAt: '2026-08-24T01:00:00.000Z',
    latestPublishedSignalAt: '2026-08-24T00:00:00.000Z',
    securityPosture: posture,
  };
}
