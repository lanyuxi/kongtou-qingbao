import { describe, expect, it } from 'vitest';

import {
  SCORING_MODEL_VERSION,
  ScoringModelError,
  computeProjectScore,
  computeScoreInputVersion,
  scoringSchemaVersion,
} from './score-model.js';
import type { ScoringSignalInput } from './score-model.js';

function signal(overrides: Partial<ScoringSignalInput> = {}): ScoringSignalInput {
  return {
    signalId: '11111111-1111-4111-8111-111111111111',
    verification: 'unverified',
    confidence: 80,
    publishedAt: '2026-08-10T00:00:00.000Z',
    expiresAt: null,
    provenance: 'third_party',
    ...overrides,
  };
}

const ethereumLikeSignals: readonly ScoringSignalInput[] = [
  signal({ signalId: '00000000-0000-4000-8000-000000000001', confidence: 60, publishedAt: '2026-08-06T00:00:00.000Z' }),
  signal({ signalId: '00000000-0000-4000-8000-000000000002', confidence: 80 }),
  signal({ signalId: '00000000-0000-4000-8000-000000000003', confidence: 85 }),
  signal({ signalId: '00000000-0000-4000-8000-000000000004', confidence: 80 }),
  signal({ signalId: '00000000-0000-4000-8000-000000000005', confidence: 90 }),
  signal({ signalId: '00000000-0000-4000-8000-000000000006', confidence: 60, publishedAt: '2026-07-06T00:00:00.000Z' }),
];

describe('computeProjectScore', () => {
  it('computes independent axes for an all-unverified third-party signal set', () => {
    const result = computeProjectScore({
      projectLifecycle: 'active',
      signals: ethereumLikeSignals,
      calculatedAt: '2026-08-15T00:00:00.000Z',
    });

    expect(result.modelVersion).toBe(SCORING_MODEL_VERSION);
    // strength = mean(conf * 0.6)/100 = 0.455; freshness 1.0 (5 days); volume 1.0
    expect(result.opportunityScore).toBeCloseTo(67.3, 1);
    // unverified share 1 -> 40; hostile 0; unofficial share 1 -> 20
    expect(result.riskScore).toBe(60);
    // 30 * 1 + 25 * 0.2 + 25 * 0
    expect(result.confidence).toBe(35);
    expect(result.recommendation).toBe('watch');
    expect(result.explanation).toContain('基于 6 条已发布信号');
    expect(result.explanation).toContain(SCORING_MODEL_VERSION);

    const factorCodes = result.factors.map((factor) => `${factor.axis}:${factor.factorCode}`);
    expect(factorCodes).toEqual(
      expect.arrayContaining([
        'opportunity:signal_strength',
        'opportunity:signal_freshness',
        'opportunity:signal_volume',
        'risk:unverified_share',
        'risk:hostile_signals',
        'risk:unofficial_provenance',
        'confidence:signal_volume',
        'confidence:verification_mix',
        'confidence:official_provenance',
      ]),
    );
    expect(result.factors).toHaveLength(9);
    expect(result.linkedSignalIds).toEqual(
      [...ethereumLikeSignals].map((item) => item.signalId).sort(),
    );
  });

  it('raises risk when hostile signals appear and excludes retracted signals from opportunity', () => {
    const hostile = computeProjectScore({
      projectLifecycle: 'active',
      signals: [
        signal({ signalId: '00000000-0000-4000-8000-000000000001', verification: 'verified', confidence: 90, provenance: 'official' }),
        signal({ signalId: '00000000-0000-4000-8000-000000000002', verification: 'disputed', confidence: 70 }),
        signal({ signalId: '00000000-0000-4000-8000-000000000003', verification: 'retracted', confidence: 70 }),
      ],
      calculatedAt: '2026-08-15T00:00:00.000Z',
    });

    // hostile share = (0.5 + 1) / 3 -> 20; unverified 0; unofficial 2/3 -> 13.33
    expect(hostile.riskScore).toBeCloseTo(33.33, 1);
    // Hostile dominance forces avoid even though the raw risk score is moderate.
    expect(hostile.recommendation).toBe('avoid');

    const benign = computeProjectScore({
      projectLifecycle: 'active',
      signals: [
        signal({ signalId: '00000000-0000-4000-8000-000000000001', verification: 'verified', confidence: 90, provenance: 'official' }),
        signal({ signalId: '00000000-0000-4000-8000-000000000002', verification: 'disputed', confidence: 70 }),
      ],
      calculatedAt: '2026-08-15T00:00:00.000Z',
    });
    // Retracted signals are excluded from opportunity inputs; eligible sets match.
    expect(hostile.opportunityScore).toBe(benign.opportunityScore);
  });

  it('excludes expired signals from every axis', () => {
    const result = computeProjectScore({
      projectLifecycle: 'active',
      signals: [
        signal({ signalId: '00000000-0000-4000-8000-000000000001', verification: 'verified', confidence: 95, provenance: 'official' }),
        signal({ signalId: '00000000-0000-4000-8000-000000000002', verification: 'retracted', confidence: 90, expiresAt: '2026-08-01T00:00:00.000Z' }),
      ],
      calculatedAt: '2026-08-15T00:00:00.000Z',
    });

    expect(result.riskScore).toBe(0);
    expect(result.linkedSignalIds).toEqual(['00000000-0000-4000-8000-000000000001']);
  });

  it('recommends act_now only when opportunity, confidence, and risk all qualify', () => {
    const strong = computeProjectScore({
      projectLifecycle: 'active',
      signals: [
        signal({ signalId: '00000000-0000-4000-8000-000000000001', verification: 'verified', confidence: 95, provenance: 'official' }),
        signal({ signalId: '00000000-0000-4000-8000-000000000002', verification: 'verified', confidence: 90, provenance: 'official' }),
        signal({ signalId: '00000000-0000-4000-8000-000000000003', verification: 'corroborated', confidence: 85, provenance: 'official' }),
      ],
      calculatedAt: '2026-08-15T00:00:00.000Z',
    });
    expect(strong.opportunityScore).toBeGreaterThanOrEqual(60);
    expect(strong.confidence).toBeGreaterThanOrEqual(60);
    expect(strong.riskScore).toBe(0);
    expect(strong.recommendation).toBe('act_now');

    const risky = computeProjectScore({
      projectLifecycle: 'active',
      signals: [
        signal({ signalId: '00000000-0000-4000-8000-000000000001', verification: 'verified', confidence: 95, provenance: 'official' }),
        signal({ signalId: '00000000-0000-4000-8000-000000000002', verification: 'unverified', confidence: 95 }),
        signal({ signalId: '00000000-0000-4000-8000-000000000003', verification: 'unverified', confidence: 95 }),
      ],
      calculatedAt: '2026-08-15T00:00:00.000Z',
    });
    expect(risky.opportunityScore).toBeGreaterThanOrEqual(45);
    expect(risky.recommendation).toBe('watch');
  });

  it('recommends avoid when hostile signals dominate regardless of opportunity', () => {
    const result = computeProjectScore({
      projectLifecycle: 'active',
      signals: [
        signal({ signalId: '00000000-0000-4000-8000-000000000001', verification: 'retracted', confidence: 90 }),
        signal({ signalId: '00000000-0000-4000-8000-000000000002', verification: 'disputed', confidence: 85 }),
        signal({ signalId: '00000000-0000-4000-8000-000000000003', verification: 'disputed', confidence: 80 }),
      ],
      calculatedAt: '2026-08-15T00:00:00.000Z',
    });
    // hostile share = (1 + 0.5 + 0.5)/3 = 0.667; risk = 26.67 + 20 = 46.67
    expect(result.riskScore).toBeCloseTo(46.67, 1);
    expect(result.recommendation).toBe('avoid');
  });

  it('avoids at the hostile-share boundary and stays watchful just below it', () => {
    const atBoundary = computeProjectScore({
      projectLifecycle: 'active',
      signals: [
        signal({ signalId: '00000000-0000-4000-8000-000000000001', verification: 'retracted', confidence: 90 }),
        signal({ signalId: '00000000-0000-4000-8000-000000000002', verification: 'verified', confidence: 90, provenance: 'official' }),
      ],
      calculatedAt: '2026-08-15T00:00:00.000Z',
    });
    // hostile share = 1/2 = 0.5 hits the avoid boundary.
    expect(atBoundary.recommendation).toBe('avoid');

    const belowBoundary = computeProjectScore({
      projectLifecycle: 'active',
      signals: [
        signal({ signalId: '00000000-0000-4000-8000-000000000001', verification: 'retracted', confidence: 90 }),
        signal({ signalId: '00000000-0000-4000-8000-000000000002', verification: 'verified', confidence: 90, provenance: 'official' }),
        signal({ signalId: '00000000-0000-4000-8000-000000000003', verification: 'verified', confidence: 90, provenance: 'official' }),
      ],
      calculatedAt: '2026-08-15T00:00:00.000Z',
    });
    // hostile share = 1/3 stays under the boundary.
    expect(belowBoundary.recommendation).not.toBe('avoid');
  });

  it('recommends research when opportunity is weak', () => {
    const result = computeProjectScore({
      projectLifecycle: 'active',
      signals: [
        signal({ signalId: '00000000-0000-4000-8000-000000000001', confidence: 20, publishedAt: '2026-01-01T00:00:00.000Z' }),
      ],
      calculatedAt: '2026-08-15T00:00:00.000Z',
    });
    expect(result.opportunityScore).toBeLessThan(30);
    expect(result.recommendation).toBe('research');
  });

  it('rejects empty or invalid input', () => {
    expect(() =>
      computeProjectScore({ projectLifecycle: 'active', signals: [], calculatedAt: '2026-08-15T00:00:00.000Z' }),
    ).toThrow(ScoringModelError);
    expect(() =>
      computeProjectScore({
        projectLifecycle: 'active',
        signals: [signal({ confidence: 101 })],
        calculatedAt: '2026-08-15T00:00:00.000Z',
      }),
    ).toThrow(ScoringModelError);
    expect(() =>
      computeProjectScore({
        projectLifecycle: 'paused' as unknown as 'active',
        signals: [signal()],
        calculatedAt: '2026-08-15T00:00:00.000Z',
      }),
    ).toThrow(ScoringModelError);
    expect(() =>
      computeProjectScore({
        projectLifecycle: 'active',
        signals: [signal({ expiresAt: '2026-08-01T00:00:00.000Z' })],
        calculatedAt: '2026-08-15T00:00:00.000Z',
      }),
    ).toThrow(ScoringModelError);
  });
});

describe('computeScoreInputVersion', () => {
  it('is deterministic across signal order and stable across runs', async () => {
    const reversed = [...ethereumLikeSignals].reverse();
    const [a, b, c] = await Promise.all([
      computeScoreInputVersion({ projectLifecycle: 'active', signals: ethereumLikeSignals }),
      computeScoreInputVersion({ projectLifecycle: 'active', signals: reversed }),
      computeScoreInputVersion({ projectLifecycle: 'active', signals: ethereumLikeSignals }),
    ]);
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a).toMatch(/^v1:[0-9a-f]{64}$/);
  });

  it('changes when any scoring input changes', async () => {
    const base = await computeScoreInputVersion({ projectLifecycle: 'active', signals: ethereumLikeSignals });
    const changedConfidence = await computeScoreInputVersion({
      projectLifecycle: 'active',
      signals: ethereumLikeSignals.map((item, index) =>
        index === 0 ? { ...item, confidence: 61 } : item,
      ),
    });
    const changedLifecycle = await computeScoreInputVersion({
      projectLifecycle: 'rumored',
      signals: ethereumLikeSignals,
    });
    expect(base).not.toBe(changedConfidence);
    expect(base).not.toBe(changedLifecycle);
  });
});

describe('scoringSchemaVersion', () => {
  it('declares the versioned contract surface', () => {
    expect(scoringSchemaVersion).toBe('score-schema-v1');
    expect(SCORING_MODEL_VERSION).toBe('score-model-v1');
  });
});
