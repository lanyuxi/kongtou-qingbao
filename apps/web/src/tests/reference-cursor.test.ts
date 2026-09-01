import { describe, expect, it } from 'vitest';

import {
  domainAuthorityReviewCursorFromQuery,
  publicReferenceCursorFromQuery,
  referenceReviewCursorFromQuery,
} from '../lib/reference-cursor.js';

const referenceId = 'b1000000-0000-4000-8000-000000000011';
const updatedAt = '2026-08-30T04:00:00.000Z';

const reviewReferenceCursor =
  'eyJ1cGRhdGVkQXQiOiIyMDI2LTA4LTMwVDA0OjAwOjAwLjAwMFoiLCJyZWZlcmVuY2VJZCI6ImIxMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAxMSJ9';
const reviewAuthorityCursor =
  'eyJ1cGRhdGVkQXQiOiIyMDI2LTA4LTMwVDA0OjAwOjAwLjAwMFoiLCJhdXRob3JpdHlJZCI6ImIxMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAyMSJ9';
const publicCursor =
  'eyJsYXN0VmVyaWZpZWRBdCI6IjIwMjYtMDgtMzBUMDQ6MDA6MDAuMDAwWiIsInJlZmVyZW5jZUlkIjoiYjEwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDExIn0';

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('reference cursors at the page boundary', () => {
  it.each([
    ['review reference', referenceReviewCursorFromQuery, reviewReferenceCursor],
    ['review authority', domainAuthorityReviewCursorFromQuery, reviewAuthorityCursor],
    ['public reference', publicReferenceCursorFromQuery, publicCursor],
  ])('passes a well-formed %s cursor through unchanged', (_name, parse, cursor) => {
    expect(parse(cursor)).toBe(cursor);
    expect(parse(undefined)).toBeNull();
  });

  it.each([
    ['review reference', referenceReviewCursorFromQuery, ['updatedAt', 'referenceId']],
    ['review authority', domainAuthorityReviewCursorFromQuery, ['updatedAt', 'authorityId']],
    ['public reference', publicReferenceCursorFromQuery, ['lastVerifiedAt', 'referenceId']],
  ])('falls back to the first page for a malformed %s cursor', (_name, parse, keys) => {
    const [first = '', second = ''] = keys;
    for (const hostile of [
      '',
      'not-base64url+',
      '!!!',
      encode('a string'),
      encode(null),
      encode([1, 2, 3]),
      encode({ [first]: updatedAt }),
      encode({ [second]: referenceId }),
      encode({ [first]: 'yesterday', [second]: referenceId }),
      encode({ [first]: updatedAt, [second]: 'not-a-uuid' }),
      encode({ [first]: updatedAt, [second]: referenceId, extra: true }),
      'A'.repeat(4096),
    ]) {
      expect(parse(hostile), JSON.stringify(hostile).slice(0, 80)).toBeNull();
    }
  });

  it('keeps the three cursor kinds from cross-decoding into one another', () => {
    expect(referenceReviewCursorFromQuery(reviewAuthorityCursor)).toBeNull();
    expect(domainAuthorityReviewCursorFromQuery(reviewReferenceCursor)).toBeNull();
    expect(publicReferenceCursorFromQuery(reviewReferenceCursor)).toBeNull();
    expect(referenceReviewCursorFromQuery(publicCursor)).toBeNull();
  });
});
