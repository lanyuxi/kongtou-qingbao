import { describe, expect, it } from 'vitest';

import type { TutorialCandidatePayload } from '@airdrop/contracts';

import { findUnallowlistedTutorialReferences } from './allowlist.js';

const referenceA = '33333333-3333-4333-8333-333333333331';
const referenceB = '33333333-3333-4333-8333-333333333332';
const hallucinated = '99999999-9999-4999-8999-999999999999';

function payloadWithLinks(
  linksPerStep: readonly { readonly referenceId: string }[][],
): TutorialCandidatePayload {
  return {
    title: 'Ethereum 空投参与教程',
    summary: '覆盖从钱包准备到任务领取的完整参与路径。',
    steps: linksPerStep.map((links, index) => ({
      title: `步骤 ${index + 1} 标题`,
      body: `第 ${index + 1} 步的正文说明，长度满足下限要求。`,
      links: [...links],
    })),
    sourceSignalIds: ['66666666-6666-4666-8666-666666666666'],
    confidence: 70,
  };
}

const allowlist = [{ referenceId: referenceA }, { referenceId: referenceB }];

describe('tutorial candidate allowlist', () => {
  it('accepts a payload whose links all come from the allowlist', () => {
    const payload = payloadWithLinks([[{ referenceId: referenceA }], [{ referenceId: referenceB }]]);
    expect(findUnallowlistedTutorialReferences(payload, allowlist)).toEqual([]);
  });

  it('accepts a payload with no links at all', () => {
    const payload = payloadWithLinks([[], []]);
    expect(findUnallowlistedTutorialReferences(payload, allowlist)).toEqual([]);
  });

  it('returns exactly the hallucinated reference ids', () => {
    const payload = payloadWithLinks([
      [{ referenceId: referenceA }, { referenceId: hallucinated }],
      [{ referenceId: hallucinated }],
    ]);
    expect(findUnallowlistedTutorialReferences(payload, allowlist)).toEqual([hallucinated]);
  });

  it('returns offenders deduplicated in first-seen order', () => {
    const other = '99999999-9999-4999-8999-999999999998';
    const payload = payloadWithLinks([[{ referenceId: hallucinated }, { referenceId: other }]]);
    expect(findUnallowlistedTutorialReferences(payload, allowlist)).toEqual([hallucinated, other]);
  });

  it('treats an empty allowlist as rejecting every link', () => {
    const payload = payloadWithLinks([[{ referenceId: referenceA }]]);
    expect(findUnallowlistedTutorialReferences(payload, [])).toEqual([referenceA]);
  });
});
