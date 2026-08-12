import { describe, expect, it } from 'vitest';

import {
  parseCollectionAttemptId,
  parseDiscoveredItemId,
  parseEvidenceId,
  parseProjectId,
  parseRawItemId,
  parseSignalId,
  parseSourceId,
  parseUserId,
  projectLifecycleSchema,
  recommendationSchema
} from '../index.js';

const uuid = 'd46cf20b-70cd-4dc9-a20a-ab3d8dc2d3d9';

describe('branded IDs', () => {
  it('parses UUID-backed project, signal, evidence, user, and collection IDs', () => {
    expect(parseProjectId(uuid)).toBe(uuid);
    expect(parseSignalId(uuid)).toBe(uuid);
    expect(parseEvidenceId(uuid)).toBe(uuid);
    expect(parseUserId(uuid)).toBe(uuid);
    expect(parseSourceId(uuid)).toBe(uuid);
    expect(parseCollectionAttemptId(uuid)).toBe(uuid);
    expect(parseRawItemId(uuid)).toBe(uuid);
    expect(parseDiscoveredItemId(uuid)).toBe(uuid);
  });

  it('rejects a non-UUID ID', () => {
    expect(() => parseProjectId('project-1')).toThrow();
  });
});

describe('project decision enums', () => {
  it.each(['rumored', 'active', 'paused', 'ended', 'archived'])('accepts lifecycle %s', (value) => {
    expect(projectLifecycleSchema.parse(value)).toBe(value);
  });

  it.each(['act_now', 'watch', 'research', 'avoid', 'blocked'])('accepts recommendation %s', (value) => {
    expect(recommendationSchema.parse(value)).toBe(value);
  });

  it('rejects unrecognized lifecycle and recommendation values', () => {
    expect(projectLifecycleSchema.safeParse('live').success).toBe(false);
    expect(recommendationSchema.safeParse('ignore').success).toBe(false);
  });
});
