import { describe, expect, it } from 'vitest';

import {
  completeRegisteredFixtureUser,
  presentFixtureUserIds,
} from './failed-ai-run-review-integration-fixture.js';

const reviewerUserId = 'a2000000-0000-4000-8000-000000000090';
const ordinaryUserId = 'a2000000-0000-4000-8000-000000000091';
const revokedUserId = 'a2000000-0000-4000-8000-000000000092';

describe('failed AI run review integration fixture cleanup', () => {
  it.each([
    ['reviewer signup only', reviewerUserId, '', '', [reviewerUserId]],
    [
      'reviewer and ordinary signups',
      reviewerUserId,
      ordinaryUserId,
      '',
      [reviewerUserId, ordinaryUserId],
    ],
    [
      'all three signups',
      reviewerUserId,
      ordinaryUserId,
      revokedUserId,
      [reviewerUserId, ordinaryUserId, revokedUserId],
    ],
    ['no signup', '', '', '', []],
  ] as const)('retains every created Auth user after %s', (
    _caseName,
    reviewerId,
    ordinaryId,
    revokedId,
    expected,
  ) => {
    expect(presentFixtureUserIds(reviewerId, ordinaryId, revokedId)).toEqual(expected);
  });

  it('registers the Auth user before post-signup confirmation can fail', async () => {
    const registered = new Set<string>();
    const confirmationFailure = new Error('fixture_confirmation_failed');

    await expect(completeRegisteredFixtureUser(
      reviewerUserId,
      (userId) => registered.add(userId),
      async () => {
        throw confirmationFailure;
      },
    )).rejects.toBe(confirmationFailure);

    expect(presentFixtureUserIds(...registered)).toEqual([reviewerUserId]);
  });
});
