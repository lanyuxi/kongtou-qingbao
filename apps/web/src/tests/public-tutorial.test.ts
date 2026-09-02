import type {
  PublicTutorialDetail as PublicTutorialDetailData,
  PublicTutorialListItem,
} from '@airdrop/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  PublicTutorialDetail,
  TutorialCard,
  TutorialLink,
} from '../components/tutorial/public-tutorial.js';

const projectId = 'c5000000-0000-4000-8000-000000000001';
const tutorialId = 'c5000000-0000-4000-8000-000000000002';
const verifiedReferenceId = 'c5000000-0000-4000-8000-000000000003';
const flaggedReferenceId = 'c5000000-0000-4000-8000-000000000004';
const ledgerUrl = 'https://ledger.example.test/claim';

const listItem: PublicTutorialListItem = {
  tutorialId,
  projectId,
  kind: 'airdrop_campaign',
  title: '官方空投参与教程',
  summary: '覆盖从钱包连接到任务领取的完整步骤。',
  version: 1,
  lastVerifiedAt: '2026-09-02T04:30:00.000Z',
  publishedAt: '2026-09-02T04:00:00.000Z',
  stepCount: 2,
};

const detail: PublicTutorialDetailData = {
  tutorialId,
  projectId,
  kind: 'airdrop_campaign',
  title: '官方空投参与教程',
  summary: '覆盖从钱包连接到任务领取的完整步骤。',
  version: 1,
  lastVerifiedAt: '2026-09-02T04:30:00.000Z',
  publishedAt: '2026-09-02T04:00:00.000Z',
  steps: [
    { ordinal: 1, title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
    {
      ordinal: 2,
      title: '打开领取页',
      body: '前往官方领取页查看任务。',
      links: [
        {
          referenceId: verifiedReferenceId,
          url: ledgerUrl,
          label: '官方领取页',
          lastVerifiedAt: '2026-09-02T04:00:00.000Z',
          renderable: true,
        },
        {
          referenceId: flaggedReferenceId,
          url: null,
          label: '已失效引用',
          lastVerifiedAt: null,
          renderable: false,
        },
      ],
    },
  ],
};

describe('public tutorial rendering', () => {
  it('renders the tutorial card with a machine-readable verification time', () => {
    const markup = renderToStaticMarkup(createElement(TutorialCard, { item: listItem }));
    expect(markup).toContain('官方空投参与教程');
    expect(markup).toContain('2 个步骤');
    expect(markup).toContain('dateTime="2026-09-02T04:30:00.000Z"');
    expect(markup).toContain(`/tutorials/${tutorialId}`);
  });

  it('renders steps in ordinal order with the detail verification time', () => {
    const markup = renderToStaticMarkup(createElement(PublicTutorialDetail, { tutorial: detail }));
    const first = markup.indexOf('步骤 1');
    const second = markup.indexOf('步骤 2');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
    expect(markup).toContain('dateTime="2026-09-02T04:30:00.000Z"');
  });

  it('renders only the ledger-resolved url as an anchor and unavailable links without one', () => {
    const markup = renderToStaticMarkup(createElement(PublicTutorialDetail, { tutorial: detail }));
    expect(markup).toContain(`href="${ledgerUrl}"`);
    expect(markup).toContain('rel="noreferrer noopener"');
    expect(markup).toContain('暂不可用');
    const anchorCount = markup.split('<a href').length - 1;
    expect(anchorCount).toBe(1);
  });

  it('keeps a hostile step text inert while the ledger url still renders', () => {
    const hostile: PublicTutorialDetailData = {
      ...detail,
      title: '官方空投参与教程 https://evil.example.test',
      summary: '覆盖步骤 <script>alert(1)</script> 完成。',
      steps: detail.steps.map((step) => ({
        ...step,
        title: `${step.title} https://evil.example.test`,
        body: `${step.body}<script>alert(1)</script>`,
      })),
    };
    const markup = renderToStaticMarkup(createElement(PublicTutorialDetail, { tutorial: hostile }));
    expect(markup).not.toContain('<script>');
    // The invariant is about anchors: no url may become an href unless the
    // ledger projection resolved it. Hostile text stays escaped prose.
    expect(markup).not.toContain('href="https://evil.example.test');
    expect(markup.split('<a href').length - 1).toBe(1);
    expect(markup).toContain(`href="${ledgerUrl}"`);
  });

  it('renders an unavailable link even when a hostile projection carries a url', () => {
    const hostileLink = {
      referenceId: flaggedReferenceId,
      url: 'https://evil.example.test/claim',
      label: '已失效引用',
      lastVerifiedAt: null,
      renderable: false,
    };
    const markup = renderToStaticMarkup(createElement(TutorialLink, { link: hostileLink }));
    expect(markup).not.toContain('<a');
    expect(markup).not.toContain('evil.example.test');
    expect(markup).toContain('暂不可用');
  });

  it('omits the anchor label when the link has no label but still renders the ledger url', () => {
    const markup = renderToStaticMarkup(createElement(TutorialLink, {
      link: {
        referenceId: verifiedReferenceId,
        url: ledgerUrl,
        label: null,
        lastVerifiedAt: null,
        renderable: true,
      },
    }));
    expect(markup).toContain(`href="${ledgerUrl}"`);
    expect(markup).toContain(`>${ledgerUrl}</a>`);
  });
});
