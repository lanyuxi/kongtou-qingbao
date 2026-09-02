import { describe, expect, it } from 'vitest';

import {
  decodePublicTutorialCursor,
  decodeTutorialCandidateCursor,
  decodeTutorialReviewCursor,
  encodePublicTutorialCursor,
  encodeTutorialCandidateCursor,
  encodeTutorialReviewCursor,
} from '../lib/tutorial-cursor.js';

describe('tutorial cursor transport', () => {
  it('round-trips candidate cursors through base64url', () => {
    const cursor = { createdAt: '2026-09-02T04:00:00.000Z', candidateId: 'b1000000-0000-4000-8000-000000000001' };
    const encoded = encodeTutorialCandidateCursor(cursor);
    expect(encoded).not.toMatch(/[+/=]/u);
    expect(decodeTutorialCandidateCursor(encoded)).toEqual(cursor);
  });

  it('round-trips review and public cursors through base64url', () => {
    const review = { updatedAt: '2026-09-02T04:00:00.000Z', tutorialId: 'b1000000-0000-4000-8000-000000000002' };
    const publicCursor = { publishedAt: '2026-09-02T04:00:00.000Z', tutorialId: 'b1000000-0000-4000-8000-000000000002' };
    expect(decodeTutorialReviewCursor(encodeTutorialReviewCursor(review))).toEqual(review);
    expect(decodePublicTutorialCursor(encodePublicTutorialCursor(publicCursor))).toEqual(publicCursor);
  });

  it('marks absent cursors and rejects malformed ones instead of guessing', () => {
    expect(decodeTutorialCandidateCursor(undefined)).toBeNull();
    expect(decodeTutorialCandidateCursor('not-base64url+')).toBe('invalid');
    expect(decodeTutorialCandidateCursor('e30')).toBe('invalid');
    expect(decodeTutorialReviewCursor('e30')).toBe('invalid');
    expect(decodePublicTutorialCursor('e30')).toBe('invalid');
    const wrongKind = encodeTutorialCandidateCursor({
      createdAt: '2026-09-02T04:00:00.000Z',
      candidateId: 'b1000000-0000-4000-8000-000000000001',
    });
    expect(decodeTutorialReviewCursor(wrongKind)).toBe('invalid');
  });
});
