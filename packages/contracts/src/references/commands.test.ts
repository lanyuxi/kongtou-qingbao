import { describe, expect, it } from 'vitest';

import {
  decideDomainAuthorityCommandV1Schema,
  decideReferenceCommandV1Schema,
  domainAuthorityCommandReceiptV1Schema,
  referenceCommandReceiptV1Schema,
  registerDomainAuthorityCommandV1Schema,
  registerReferenceCommandV1Schema,
} from './commands.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const authorityId = '22222222-2222-4222-8222-222222222222';
const referenceId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '44444444-4444-4444-8444-444444444444';

describe('reference commands', () => {
  it('accepts a bounded registration command', () => {
    expect(
      registerReferenceCommandV1Schema.safeParse({
        version: 1,
        projectId,
        kind: 'official_site',
        url: 'https://example.com/claim',
        label: '官方领取页',
        evidenceId,
        note: null,
      }).success,
    ).toBe(true);
  });

  it('rejects actor-supplied identity and any extra key', () => {
    expect(
      registerReferenceCommandV1Schema.safeParse({
        version: 1,
        projectId,
        kind: 'official_site',
        url: 'https://example.com/claim',
        label: '官方领取页',
        evidenceId,
        note: null,
        reviewerUserId: '55555555-5555-4555-8555-555555555555',
      }).success,
    ).toBe(false);
    expect(
      registerReferenceCommandV1Schema.safeParse({
        version: 1,
        projectId,
        kind: 'official_site',
        url: 'https://example.com/claim',
        label: '官方领取页',
        evidenceId,
        note: null,
        domainAuthorityId: authorityId,
      }).success,
    ).toBe(false);
  });

  it('rejects a non-https or non-absolute url', () => {
    for (const url of [
      'http://example.com/claim',
      'example.com/claim',
      '//example.com/claim',
      'javascript:alert(1)',
      'https://example.com/claim\nset-cookie',
    ]) {
      expect(
        registerReferenceCommandV1Schema.safeParse({
          version: 1,
          projectId,
          kind: 'official_site',
          url,
          label: '官方领取页',
          evidenceId,
          note: null,
        }).success,
        url,
      ).toBe(false);
    }
  });

  it('bounds url and label length', () => {
    const base = {
      version: 1 as const,
      projectId,
      kind: 'official_site' as const,
      evidenceId,
      note: null,
    };
    const atLimit = `https://example.com/${'a'.repeat(2048 - 'https://example.com/'.length)}`;
    expect(atLimit).toHaveLength(2048);
    expect(
      registerReferenceCommandV1Schema.safeParse({ ...base, url: atLimit, label: '官方领取页' })
        .success,
    ).toBe(true);
    expect(
      registerReferenceCommandV1Schema.safeParse({
        ...base,
        url: `${atLimit}a`,
        label: '官方领取页',
      }).success,
    ).toBe(false);
    expect(
      registerReferenceCommandV1Schema.safeParse({ ...base, url: 'https://example.com', label: '' })
        .success,
    ).toBe(false);
    expect(
      registerReferenceCommandV1Schema.safeParse({
        ...base,
        url: 'https://example.com',
        label: 'a'.repeat(161),
      }).success,
    ).toBe(false);
  });

  it('requires an expected version for mutable aggregate decisions', () => {
    expect(
      decideReferenceCommandV1Schema.safeParse({
        version: 1,
        referenceId,
        decision: 'verify',
        reasonCode: 'evidence_verified',
        evidenceId,
        note: null,
      }).success,
    ).toBe(false);

    expect(
      decideReferenceCommandV1Schema.safeParse({
        version: 1,
        referenceId,
        expectedVersion: 2,
        decision: 'verify',
        reasonCode: 'evidence_verified',
        evidenceId,
        note: null,
      }).success,
    ).toBe(true);
  });

  it('requires evidence for verify, reverify, and restore', () => {
    for (const decision of ['verify', 'reverify', 'restore'] as const) {
      expect(
        decideReferenceCommandV1Schema.safeParse({
          version: 1,
          referenceId,
          expectedVersion: 2,
          decision,
          reasonCode: 'evidence_verified',
          evidenceId: null,
          note: null,
        }).success,
        decision,
      ).toBe(false);
    }

    expect(
      decideReferenceCommandV1Schema.safeParse({
        version: 1,
        referenceId,
        expectedVersion: 2,
        decision: 'withdraw',
        reasonCode: 'withdrawn_by_reviewer',
        evidenceId: null,
        note: null,
      }).success,
    ).toBe(true);
  });

  it('requires evidence for grant and regrant domain authorities', () => {
    for (const decision of ['grant', 'regrant'] as const) {
      expect(
        decideDomainAuthorityCommandV1Schema.safeParse({
          version: 1,
          authorityId,
          expectedVersion: 1,
          decision,
          reasonCode: 'official_announcement',
          evidenceId: null,
          note: null,
        }).success,
        decision,
      ).toBe(false);
    }

    expect(
      decideDomainAuthorityCommandV1Schema.safeParse({
        version: 1,
        authorityId,
        expectedVersion: 1,
        decision: 'revoke',
        reasonCode: 'source_no_longer_official',
        evidenceId: null,
        note: null,
      }).success,
    ).toBe(true);
  });

  it('accepts a bounded domain authority registration and rejects malformed domains', () => {
    expect(
      registerDomainAuthorityCommandV1Schema.safeParse({
        version: 1,
        projectId,
        domain: 'example.com',
        evidenceId,
        note: null,
      }).success,
    ).toBe(true);

    for (const domain of ['', 'example .com', 'https://example.com', 'example.com:443']) {
      expect(
        registerDomainAuthorityCommandV1Schema.safeParse({
          version: 1,
          projectId,
          domain,
          evidenceId,
          note: null,
        }).success,
        domain,
      ).toBe(false);
    }
  });

  it('rejects a non-positive expected version and an unsupported command version', () => {
    expect(
      decideReferenceCommandV1Schema.safeParse({
        version: 1,
        referenceId,
        expectedVersion: 0,
        decision: 'verify',
        reasonCode: 'evidence_verified',
        evidenceId,
        note: null,
      }).success,
    ).toBe(false);
    expect(
      decideReferenceCommandV1Schema.safeParse({
        version: 2,
        referenceId,
        expectedVersion: 1,
        decision: 'verify',
        reasonCode: 'evidence_verified',
        evidenceId,
        note: null,
      }).success,
    ).toBe(false);
  });

  it('parses exact domain-authority command receipts and rejects drift', () => {
    const receipt = {
      version: 1 as const,
      commandId: '55555555-5555-4555-8555-555555555555',
      authorityId,
      authorityVersion: 2,
      state: 'granted' as const,
      replayed: false,
    };

    expect(domainAuthorityCommandReceiptV1Schema.parse(receipt)).toEqual(receipt);
    for (const invalid of [
      { ...receipt, authorityVersion: 0 },
      { ...receipt, state: 'verified' },
      { ...receipt, commandId: 'not-a-uuid' },
      { ...receipt, decisionId: '66666666-6666-4666-8666-666666666666' },
    ]) {
      expect(domainAuthorityCommandReceiptV1Schema.safeParse(invalid).success).toBe(false);
    }
  });

  it('parses exact reference command receipts and rejects drift', () => {
    const receipt = {
      version: 1 as const,
      commandId: '55555555-5555-4555-8555-555555555555',
      referenceId,
      referenceVersion: 3,
      state: 'flagged' as const,
      replayed: true,
    };

    expect(referenceCommandReceiptV1Schema.parse(receipt)).toEqual(receipt);
    for (const invalid of [
      { ...receipt, referenceVersion: -1 },
      { ...receipt, state: 'granted' },
      { ...receipt, replayed: 'true' },
      { ...receipt, actorUserId: '66666666-6666-4666-8666-666666666666' },
    ]) {
      expect(referenceCommandReceiptV1Schema.safeParse(invalid).success).toBe(false);
    }
  });
});
