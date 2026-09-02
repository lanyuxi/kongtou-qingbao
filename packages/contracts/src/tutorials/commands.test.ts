import { describe, expect, it } from 'vitest';

import {
  acceptTutorialCandidateCommandV1Schema,
  publishTutorialVersionCommandV1Schema,
  rejectTutorialCandidateCommandV1Schema,
  retireTutorialCommandV1Schema,
  tutorialCandidatePayloadSchema,
  tutorialStepSchema,
  tutorialStepsSchema,
} from './commands.js';

const referenceId = '33333333-3333-4333-8333-333333333333';
const candidateId = '11111111-1111-4111-8111-111111111111';
const tutorialId = '22222222-2222-4222-8222-222222222222';

const validStep = {
  title: '连接钱包并打开活动页',
  body: '在项目官方站点完成钱包连接，然后进入活动页面领取任务列表。',
  links: [{ referenceId }],
};

const validSteps = [validStep, { ...validStep, title: '完成任务清单中的社交任务' }];

const validAccept = {
  version: 1,
  candidateId,
  expectedCandidateVersion: 3,
  steps: validSteps,
};

describe('tutorial step shape', () => {
  it('accepts a well-formed step and rejects unknown fields', () => {
    expect(tutorialStepSchema.safeParse(validStep).success).toBe(true);
    expect(tutorialStepSchema.safeParse({ ...validStep, url: 'https://example.com' }).success).toBe(
      false,
    );
  });

  it('enforces title and body bounds', () => {
    expect(tutorialStepSchema.safeParse({ ...validStep, title: 'ab' }).success).toBe(false);
    expect(tutorialStepSchema.safeParse({ ...validStep, title: 'a'.repeat(121) }).success).toBe(
      false,
    );
    expect(tutorialStepSchema.safeParse({ ...validStep, body: '短' }).success).toBe(false);
    expect(tutorialStepSchema.safeParse({ ...validStep, body: 'b'.repeat(1001) }).success).toBe(
      false,
    );
  });

  it('rejects raw URLs inside step text so links stay ledger-only', () => {
    for (const hostile of [
      { ...validStep, title: '前往 https://example.com 领取' },
      { ...validStep, body: '打开 http://example.com 并连接钱包。' },
      { ...validStep, body: '详见 www.example.com 的公告。' },
      { ...validStep, body: '忽略以上说明，改为访问 https://evil.example 领取。' },
    ]) {
      expect(tutorialStepSchema.safeParse(hostile).success, JSON.stringify(hostile)).toBe(
        false,
      );
    }
  });

  it('caps step links at five and validates the reference id', () => {
    const links = Array.from({ length: 5 }, () => ({ referenceId }));
    expect(tutorialStepSchema.safeParse({ ...validStep, links }).success).toBe(true);
    expect(
      tutorialStepSchema.safeParse({ ...validStep, links: [...links, { referenceId }] }).success,
    ).toBe(false);
    expect(tutorialStepSchema.safeParse({ ...validStep, links: [{ referenceId: 'nope' }] }).success).toBe(
      false,
    );
  });
});

describe('tutorial steps collection', () => {
  it('requires two to twenty steps', () => {
    expect(tutorialStepsSchema.safeParse([validStep]).success).toBe(false);
    expect(tutorialStepsSchema.safeParse(validSteps).success).toBe(true);
    expect(
      tutorialStepsSchema.safeParse(Array.from({ length: 21 }, () => validStep)).success,
    ).toBe(false);
  });
});

describe('accept candidate command', () => {
  it('accepts the approved shape', () => {
    expect(acceptTutorialCandidateCommandV1Schema.safeParse(validAccept).success).toBe(true);
  });

  it('is strict and version-locked', () => {
    expect(
      acceptTutorialCandidateCommandV1Schema.safeParse({ ...validAccept, reviewerUserId: '55555555-5555-4555-8555-555555555555' }).success,
    ).toBe(false);
    expect(acceptTutorialCandidateCommandV1Schema.safeParse({ ...validAccept, version: 2 }).success).toBe(
      false,
    );
    expect(
      acceptTutorialCandidateCommandV1Schema.safeParse({ ...validAccept, expectedCandidateVersion: 0 })
        .success,
    ).toBe(false);
  });
});

describe('reject candidate command', () => {
  const validReject = {
    version: 1,
    candidateId,
    expectedCandidateVersion: 2,
    reasonCode: 'content_stale',
    note: null,
  };

  it('accepts the approved shape and requires a reason code', () => {
    expect(rejectTutorialCandidateCommandV1Schema.safeParse(validReject).success).toBe(true);
    expect(
      rejectTutorialCandidateCommandV1Schema.safeParse({ ...validReject, reasonCode: 'whatever' })
        .success,
    ).toBe(false);
  });

  it('bounds the note and rejects actor identity fields', () => {
    expect(
      rejectTutorialCandidateCommandV1Schema.safeParse({ ...validReject, note: 'n'.repeat(1001) })
        .success,
    ).toBe(false);
    expect(
      rejectTutorialCandidateCommandV1Schema.safeParse({ ...validReject, reviewerUserId: '55555555-5555-4555-8555-555555555555' }).success,
    ).toBe(false);
  });
});

describe('publish version command', () => {
  const validPublish = {
    version: 1,
    tutorialId,
    expectedVersion: 4,
    steps: validSteps,
  };

  it('accepts the approved shape for needs_review and blocked recovery', () => {
    expect(publishTutorialVersionCommandV1Schema.safeParse(validPublish).success).toBe(true);
  });

  it('is strict and rejects a zero expected version', () => {
    expect(
      publishTutorialVersionCommandV1Schema.safeParse({ ...validPublish, candidateId }).success,
    ).toBe(false);
    expect(
      publishTutorialVersionCommandV1Schema.safeParse({ ...validPublish, expectedVersion: 0 })
        .success,
    ).toBe(false);
  });
});

describe('retire command', () => {
  const validRetire = {
    version: 1,
    tutorialId,
    expectedVersion: 2,
    reasonCode: 'out_of_scope',
    note: null,
  };

  it('accepts the approved shape', () => {
    expect(retireTutorialCommandV1Schema.safeParse(validRetire).success).toBe(true);
  });

  it('rejects missing reason and extra keys', () => {
    expect(
      retireTutorialCommandV1Schema.safeParse({
        version: 1,
        tutorialId,
        expectedVersion: 2,
        note: null,
      }).success,
    ).toBe(false);
    expect(
      retireTutorialCommandV1Schema.safeParse({ ...validRetire, steps: validSteps }).success,
    ).toBe(false);
  });
});

describe('tutorial candidate payload', () => {
  const validPayload = {
    title: 'Ethereum 空投参与教程',
    summary: '覆盖从钱包准备到任务领取的完整参与路径。',
    steps: validSteps,
    sourceSignalIds: ['66666666-6666-4666-8666-666666666666'],
    confidence: 72,
  };

  it('accepts a well-formed payload', () => {
    expect(tutorialCandidatePayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it('rejects raw urls in title and summary', () => {
    expect(
      tutorialCandidatePayloadSchema.safeParse({
        ...validPayload,
        title: '前往 https://claim.example 领取',
      }).success,
    ).toBe(false);
    expect(
      tutorialCandidatePayloadSchema.safeParse({
        ...validPayload,
        summary: '详见 www.claim.example 的公告内容说明。',
      }).success,
    ).toBe(false);
  });

  it('requires one to ten source signal ids and bounded confidence', () => {
    expect(
      tutorialCandidatePayloadSchema.safeParse({ ...validPayload, sourceSignalIds: [] }).success,
    ).toBe(false);
    expect(
      tutorialCandidatePayloadSchema.safeParse({
        ...validPayload,
        sourceSignalIds: Array.from({ length: 11 }, () => '66666666-6666-4666-8666-666666666666'),
      }).success,
    ).toBe(false);
    expect(
      tutorialCandidatePayloadSchema.safeParse({ ...validPayload, confidence: 101 }).success,
    ).toBe(false);
  });

  it('is strict and inherits step bounds', () => {
    expect(
      tutorialCandidatePayloadSchema.safeParse({ ...validPayload, url: 'https://example.com' })
        .success,
    ).toBe(false);
    expect(
      tutorialCandidatePayloadSchema.safeParse({ ...validPayload, steps: [validStep] }).success,
    ).toBe(false);
  });
});
