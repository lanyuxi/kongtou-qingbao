import { describe, expect, it } from 'vitest';

import { curatedSignalReceiptV1Schema, preparedSourceV1Schema } from './receipts.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('preparedSourceV1Schema', () => {
  it('accepts a well-formed payload', () => {
    expect(
      preparedSourceV1Schema.safeParse({
        version: 1,
        sourceId: uuid(1),
        rawItemId: uuid(2),
        contentKind: 'official_html',
        mediaType: 'text/html; charset=utf-8',
        finalUrl: 'https://aave.com/governance',
        byteLength: 12345,
        rawTextExcerpt: 'claims open until 2026-12-31',
        sha256: 'a'.repeat(64),
        truncated: false,
      }).success,
    ).toBe(true);
  });

  it('rejects a non-hex sha256 (length must be 64 lowercase hex chars)', () => {
    expect(
      preparedSourceV1Schema.safeParse({
        version: 1,
        sourceId: uuid(1),
        rawItemId: uuid(2),
        contentKind: 'official_html',
        mediaType: 'text/html; charset=utf-8',
        finalUrl: 'https://aave.com/governance',
        byteLength: 12345,
        rawTextExcerpt: 'claims open until 2026-12-31',
        sha256: 'Z'.repeat(64),
        truncated: false,
      }).success,
    ).toBe(false);
  });

  it('caps byteLength at the database collector limit (2 MiB)', () => {
    expect(
      preparedSourceV1Schema.safeParse({
        version: 1,
        sourceId: uuid(1),
        rawItemId: uuid(2),
        contentKind: 'official_html',
        mediaType: 'text/html',
        finalUrl: 'https://aave.com/x',
        byteLength: 2_097_153,
        rawTextExcerpt: 'x',
        sha256: 'a'.repeat(64),
        truncated: false,
      }).success,
    ).toBe(false);
  });

  it('rejects a non-truncation-aware content kind', () => {
    expect(
      preparedSourceV1Schema.safeParse({
        version: 1,
        sourceId: uuid(1),
        rawItemId: uuid(2),
        contentKind: 'bogus_kind',
        mediaType: 'text/plain',
        finalUrl: 'https://aave.com/x',
        byteLength: 1,
        rawTextExcerpt: 'x',
        sha256: 'a'.repeat(64),
        truncated: false,
      }).success,
    ).toBe(false);
  });

  it('rejects an empty excerpt (the curator would have nothing to quote)', () => {
    expect(
      preparedSourceV1Schema.safeParse({
        version: 1,
        sourceId: uuid(1),
        rawItemId: uuid(2),
        contentKind: 'official_html',
        mediaType: 'text/html',
        finalUrl: 'https://aave.com/x',
        byteLength: 1,
        rawTextExcerpt: '',
        sha256: 'a'.repeat(64),
        truncated: false,
      }).success,
    ).toBe(false);
  });
});

describe('curatedSignalReceiptV1Schema', () => {
  it('accepts a created receipt with both ids', () => {
    expect(
      curatedSignalReceiptV1Schema.safeParse({
        version: 1,
        commandId: uuid(1),
        replayed: false,
        outcome: 'created',
        verification: 'verified',
        projectId: uuid(2),
        signalId: uuid(3),
        sourceId: uuid(4),
        rawItemId: uuid(5),
        evidenceId: uuid(6),
        completedAt: '2026-09-11T11:30:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('accepts a rejected receipt with no signal or evidence', () => {
    expect(
      curatedSignalReceiptV1Schema.safeParse({
        version: 1,
        commandId: uuid(1),
        replayed: false,
        outcome: 'rejected',
        verification: 'corroborated',
        projectId: uuid(2),
        signalId: null,
        sourceId: uuid(4),
        rawItemId: uuid(5),
        evidenceId: null,
        completedAt: '2026-09-11T11:30:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('refuses a created outcome without a signal id (the shape is the receipt contract)', () => {
    expect(
      curatedSignalReceiptV1Schema.safeParse({
        version: 1,
        commandId: uuid(1),
        replayed: false,
        outcome: 'created',
        verification: 'verified',
        projectId: uuid(2),
        signalId: null,
        sourceId: uuid(4),
        rawItemId: uuid(5),
        evidenceId: uuid(6),
        completedAt: '2026-09-11T11:30:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('marks a replay with the same payload as the original', () => {
    expect(
      curatedSignalReceiptV1Schema.safeParse({
        version: 1,
        commandId: uuid(1),
        replayed: true,
        outcome: 'created',
        verification: 'verified',
        projectId: uuid(2),
        signalId: uuid(3),
        sourceId: uuid(4),
        rawItemId: uuid(5),
        evidenceId: uuid(6),
        completedAt: '2026-09-11T11:30:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejects an unparseable timestamp', () => {
    expect(
      curatedSignalReceiptV1Schema.safeParse({
        version: 1,
        commandId: uuid(1),
        replayed: false,
        outcome: 'created',
        verification: 'verified',
        projectId: uuid(2),
        signalId: uuid(3),
        sourceId: uuid(4),
        rawItemId: uuid(5),
        evidenceId: uuid(6),
        completedAt: 'yesterday',
      }).success,
    ).toBe(false);
  });
});
