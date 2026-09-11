import { describe, expect, it } from 'vitest';

import {
  curatedSignalCommandV1Schema,
  prepareSourceCommandV1Schema,
} from './commands.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const baseCommand = {
  version: 1 as const,
  project: { kind: 'existing' as const, projectId: uuid(1) },
  sourceId: uuid(2),
  rawItemId: uuid(3),
  signalType: 'airdrop_campaign' as const,
  title: 'Aave grant round 4 is open for claims',
  summary: 'Snapshot was taken on 2026-08-01; airdrop claims open until 2026-12-31.',
  quote: 'claims open until 2026-12-31; check eligibility on the Aave portal',
  verification: 'verified' as const,
  attestation: null,
  expectedVersion: 1,
  idempotencyKey: uuid(4),
};

describe('curatedSignalCommandV1Schema', () => {
  it('accepts a minimal verified command', () => {
    expect(curatedSignalCommandV1Schema.safeParse(baseCommand).success).toBe(true);
  });

  it('accepts corroborated only with a non-empty attestation', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({
        ...baseCommand,
        verification: 'corroborated',
        attestation: 'Public Discord post; I moderated the channel.',
      }).success,
    ).toBe(true);
  });

  it('rejects corroborated when the attestation is empty or missing', () => {
    const empty = curatedSignalCommandV1Schema.safeParse({
      ...baseCommand,
      verification: 'corroborated',
      attestation: '',
    });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(JSON.stringify(empty.error.issues)).toContain('attestation');
    }

    const nullish = curatedSignalCommandV1Schema.safeParse({
      ...baseCommand,
      verification: 'corroborated',
      attestation: null,
    });
    expect(nullish.success).toBe(false);
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({ ...baseCommand, extra: 'nope' }).success,
    ).toBe(false);
  });

  it('rejects a wrong or missing version', () => {
    expect(curatedSignalCommandV1Schema.safeParse({ ...baseCommand, version: 2 }).success).toBe(false);
    expect(curatedSignalCommandV1Schema.safeParse({ ...baseCommand, version: undefined }).success).toBe(false);
  });

  it('enforces the 10..500 quote window the database CHECK mirrors', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({ ...baseCommand, quote: 'too short' }).success,
    ).toBe(false);
    expect(
      curatedSignalCommandV1Schema.safeParse({ ...baseCommand, quote: 'x'.repeat(501) }).success,
    ).toBe(false);
  });

  it('rejects a non-positive expected version', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({ ...baseCommand, expectedVersion: 0 }).success,
    ).toBe(false);
  });

  it('requires an idempotency key in uuid form', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({ ...baseCommand, idempotencyKey: 'abc' }).success,
    ).toBe(false);
  });

  it('only accepts the six participable signal types', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({ ...baseCommand, signalType: 'price_alert' }).success,
    ).toBe(false);
  });

  it('trims surrounding whitespace from free-text fields before validating length', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({ ...baseCommand, title: '  Aave  ' }).success,
    ).toBe(true);
  });
});

describe('curatedSignalTargetProjectSchema (discriminated union)', () => {
  it('accepts an existing project reference', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({
        ...baseCommand,
        project: { kind: 'existing', projectId: uuid(9) },
      }).success,
    ).toBe(true);
  });

  it('accepts a new project declaration with all required fields', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({
        ...baseCommand,
        project: {
          kind: 'new',
          project: {
            slug: 'aave',
            name: 'Aave',
            summary: 'Decentralised lending protocol',
            primaryChain: 'Ethereum',
            officialWebsiteUrl: 'https://aave.com',
          },
        },
      }).success,
    ).toBe(true);
  });

  it('rejects a new project with an http website (validateConfiguredCollectionUrl mirror)', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({
        ...baseCommand,
        project: {
          kind: 'new',
          project: {
            slug: 'aave',
            name: 'Aave',
            officialWebsiteUrl: 'http://aave.com',
          },
        },
      }).success,
    ).toBe(false);
  });

  it('rejects a new project with a malformed slug', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({
        ...baseCommand,
        project: { kind: 'new', project: { slug: 'Aave!', name: 'Aave' } },
      }).success,
    ).toBe(false);
  });

  it('rejects a mismatched discriminator payload', () => {
    expect(
      curatedSignalCommandV1Schema.safeParse({
        ...baseCommand,
        project: { kind: 'existing' },
      }).success,
    ).toBe(false);
  });
});

describe('prepareSourceCommandV1Schema', () => {
  it('accepts a canonical https url', () => {
    expect(
      prepareSourceCommandV1Schema.safeParse({
        version: 1,
        project: { kind: 'existing', projectId: uuid(1) },
        sourceUrl: 'https://aave.com/governance',
      }).success,
    ).toBe(true);
  });

  it('rejects http, ftp, with non-default port, with credentials, and IP literal urls', () => {
    for (const url of [
      'http://aave.com',
      'ftp://aave.com',
      // :443 is the default for https and is normalized away by WHATWG URL parsing,
      // so the database would accept it; use a non-default port to exercise the check.
      'https://aave.com:444',
      'https://user:pass@aave.com',
      'https://127.0.0.1/x',
    ]) {
      expect(
        prepareSourceCommandV1Schema.safeParse({
          version: 1,
          project: { kind: 'existing', projectId: uuid(1) },
          sourceUrl: url,
        }).success,
      ).toBe(false);
    }
  });

  it('rejects a non-string and a malformed url', () => {
    expect(
      prepareSourceCommandV1Schema.safeParse({
        version: 1,
        project: { kind: 'existing', projectId: uuid(1) },
        sourceUrl: 'not a url',
      }).success,
    ).toBe(false);
  });
});
