import { describe, expect, it } from 'vitest';

import { deriveTutorialPublicationState, type TutorialDecisionRecord } from './version-rules.js';

const t1 = '2026-09-01T00:00:00.000Z';
const t2 = '2026-09-02T00:00:00.000Z';
const t3 = '2026-09-03T00:00:00.000Z';

function record(decision: TutorialDecisionRecord['decision'], createdAt: string): TutorialDecisionRecord {
  return { decision, createdAt };
}

describe('tutorial publication state derivation', () => {
  it('returns version 0 and no verification time without decisions', () => {
    expect(deriveTutorialPublicationState([])).toEqual({ version: 0, lastVerifiedAt: null });
  });

  it('counts only version-producing decisions', () => {
    const state = deriveTutorialPublicationState([
      record('accept_candidate', t1),
      record('publish_version', t2),
    ]);
    expect(state.version).toBe(2);
    expect(state.lastVerifiedAt).toBe(t2);
  });

  it('does not advance the version or verification time on reject or retire', () => {
    const state = deriveTutorialPublicationState([
      record('accept_candidate', t1),
      record('reject_candidate', t2),
      record('retire', t3),
    ]);
    expect(state.version).toBe(1);
    expect(state.lastVerifiedAt).toBe(t1);
  });

  it('uses the latest version-producing decision as the verification instant', () => {
    const state = deriveTutorialPublicationState([
      record('accept_candidate', t1),
      record('reject_candidate', t2),
      record('publish_version', t3),
    ]);
    expect(state.version).toBe(2);
    expect(state.lastVerifiedAt).toBe(t3);
  });

  it('ignores decisions that arrive out of order in the input', () => {
    const state = deriveTutorialPublicationState([
      record('publish_version', t3),
      record('accept_candidate', t1),
    ]);
    expect(state.version).toBe(2);
    expect(state.lastVerifiedAt).toBe(t1);
  });
});
