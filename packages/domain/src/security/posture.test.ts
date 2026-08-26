import { describe, expect, it } from 'vitest';

import {
  compareSecurityPosture,
  deriveSecurityPosture,
  orderSecurityTargetsForLock,
} from '../index.js';

describe('security posture rules', () => {
  // Break caught: returning clear for a target that still has an active precaution.
  it.each([
    [[], 'clear'],
    [['caution'], 'caution'],
    [['blocked'], 'blocked'],
    [['caution', 'caution'], 'caution'],
    [['blocked', 'blocked'], 'blocked'],
    [['caution', 'blocked'], 'blocked'],
    [['blocked', 'caution'], 'blocked'],
  ] as const)('derives %s as %s', (active, expected) => {
    expect(deriveSecurityPosture(active)).toBe(expected);
  });

  // Break caught: reversing or flattening the clear < caution < blocked precedence.
  it.each([
    ['clear', 'clear', 0],
    ['clear', 'caution', -1],
    ['clear', 'blocked', -2],
    ['caution', 'clear', 1],
    ['caution', 'caution', 0],
    ['caution', 'blocked', -1],
    ['blocked', 'clear', 2],
    ['blocked', 'caution', 1],
    ['blocked', 'blocked', 0],
  ] as const)('compares %s with %s as %d', (left, right, expected) => {
    expect(compareSecurityPosture(left, right)).toBe(expected);
  });

  // Break caught: locking source before project or locking the same target twice.
  it('deduplicates targets and orders project then source by target ID', () => {
    expect(orderSecurityTargetsForLock([
      { type: 'source', id: 'source-z' },
      { type: 'project', id: 'project-z' },
      { type: 'source', id: 'source-a' },
      { type: 'project', id: 'project-a' },
      { type: 'project', id: 'project-z' },
      { type: 'source', id: 'source-z' },
    ])).toEqual([
      { type: 'project', id: 'project-a' },
      { type: 'project', id: 'project-z' },
      { type: 'source', id: 'source-a' },
      { type: 'source', id: 'source-z' },
    ]);
  });

  // Break caught: treating project and source targets with the same UUID as one lock identity.
  it('keeps same-ID project and source targets distinct while deduplicating exact identities', () => {
    const id = '11111111-1111-4111-8111-111111111111';

    expect(orderSecurityTargetsForLock([
      { type: 'source', id },
      { type: 'project', id },
      { type: 'source', id },
      { type: 'project', id },
    ])).toEqual([
      { type: 'project', id },
      { type: 'source', id },
    ]);
  });
});
