import { describe, expect, it } from 'vitest';

import { presentFixtureUserIds } from './failed-ai-run-review-integration-fixture.js';

const reviewerUserId = 'a2000000-0000-4000-8000-000000000090';
const ordinaryUserId = 'a2000000-0000-4000-8000-000000000091';

describe('failed AI run review integration fixture cleanup', () => {
  it.each([
    ['reviewer signup only', reviewerUserId, '', [reviewerUserId]],
    ['ordinary signup only', '', ordinaryUserId, [ordinaryUserId]],
    ['both signups', reviewerUserId, ordinaryUserId, [reviewerUserId, ordinaryUserId]],
    ['no signup', '', '', []],
  ] as const)('retains every created Auth user after %s', (
    _caseName,
    reviewerId,
    ordinaryId,
    expected,
  ) => {
    expect(presentFixtureUserIds(reviewerId, ordinaryId)).toEqual(expected);
  });
});
