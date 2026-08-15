import type {
  Recommendation,
  ScoringProvenance as ScoringProvenanceContract,
  SignalVerification,
} from '@airdrop/contracts';

// Deterministic, versioned score math (score-model-v1). Pure functions only:
// no database, clock, or model access. The caller supplies calculatedAt so
// results remain reproducible for a given input snapshot.

export const SCORING_MODEL_VERSION = 'score-model-v1';
export const scoringSchemaVersion = 'score-schema-v1';
export const scoringPipelineVersion = 'score-pipeline-v1';

export const scoringWeights = {
  verification: {
    verified: 1.0,
    corroborated: 0.8,
    unverified: 0.6,
    disputed: 0.2,
    retracted: 0.0,
  },
  confidenceVerification: {
    verified: 1.0,
    corroborated: 0.6,
    unverified: 0.2,
    disputed: 0.1,
    retracted: 0.0,
  },
  opportunity: { strength: 0.6, freshness: 0.25, volume: 0.15 },
  risk: { unverifiedShare: 0.4, hostileShare: 0.4, unofficialProvenance: 0.2 },
  confidence: { volume: 30, verificationMix: 25, officialProvenance: 25 },
  hostility: { disputed: 0.5, retracted: 1.0 },
} as const;

export const scoringThresholds = {
  freshnessTiers: [
    { maxAgeDays: 7, value: 1.0 },
    { maxAgeDays: 30, value: 0.8 },
    { maxAgeDays: 90, value: 0.5 },
  ],
  staleFreshnessValue: 0.25,
  volumeSaturationCount: 5,
  avoidHostileShare: 0.5,
  actNowOpportunity: 60,
  actNowConfidence: 60,
  actNowMaxRisk: 50,
  watchOpportunity: 45,
  researchOpportunity: 30,
} as const;

export type ScoringProvenance = ScoringProvenanceContract;
export type ScoringAxis = 'opportunity' | 'risk' | 'confidence';

export interface ScoringSignalInput {
  readonly signalId: string;
  readonly verification: SignalVerification;
  readonly confidence: number;
  readonly publishedAt: string | null;
  readonly expiresAt: string | null;
  readonly provenance: ScoringProvenance;
}

export interface ScoringInput {
  readonly projectLifecycle: 'active' | 'rumored';
  readonly signals: readonly ScoringSignalInput[];
  readonly calculatedAt: string;
}

export interface ScoreFactor {
  readonly axis: ScoringAxis;
  readonly factorCode: string;
  readonly contribution: number;
  readonly inputValue: number;
  readonly detail: string;
}

export interface ProjectScoreResult {
  readonly modelVersion: typeof SCORING_MODEL_VERSION;
  readonly opportunityScore: number;
  readonly riskScore: number;
  readonly confidence: number;
  readonly recommendation: Recommendation;
  readonly explanation: string;
  readonly factors: readonly ScoreFactor[];
  readonly linkedSignalIds: readonly string[];
}

export type ScoringModelErrorCode =
  | 'empty_signal_set'
  | 'no_live_signals'
  | 'invalid_signal'
  | 'unsupported_lifecycle'
  | 'invalid_timestamp';

export class ScoringModelError extends Error {
  readonly code: ScoringModelErrorCode;

  constructor(code: ScoringModelErrorCode) {
    super(`scoring_model_${code}`);
    this.name = 'ScoringModelError';
    this.code = code;
  }
}

export function computeProjectScore(input: ScoringInput): ProjectScoreResult {
  if (input.projectLifecycle !== 'active' && input.projectLifecycle !== 'rumored') {
    throw new ScoringModelError('unsupported_lifecycle');
  }
  if (input.signals.length === 0) {
    throw new ScoringModelError('empty_signal_set');
  }

  const calculatedAt = parseTimestamp(input.calculatedAt, 'invalid_timestamp');
  for (const item of input.signals) {
    if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 100) {
      throw new ScoringModelError('invalid_signal');
    }
    if (item.publishedAt !== null) parseTimestamp(item.publishedAt, 'invalid_timestamp');
    if (item.expiresAt !== null) parseTimestamp(item.expiresAt, 'invalid_timestamp');
  }

  const liveSignals = input.signals.filter(
    (item) => item.expiresAt === null || parseTimestamp(item.expiresAt, 'invalid_timestamp') > calculatedAt,
  );
  if (liveSignals.length === 0) {
    throw new ScoringModelError('no_live_signals');
  }

  const eligibleSignals = liveSignals.filter((item) => item.verification !== 'retracted');

  const strength =
    eligibleSignals.length === 0
      ? 0
      : eligibleSignals.reduce(
          (total, item) =>
            total + item.confidence * scoringWeights.verification[item.verification],
          0,
        ) /
        eligibleSignals.length /
        100;

  const freshness = computeFreshness(liveSignals, calculatedAt);
  const volumeShare =
    Math.min(eligibleSignals.length, scoringThresholds.volumeSaturationCount) /
    scoringThresholds.volumeSaturationCount;

  const opportunityScore = round2(
    100 *
      (scoringWeights.opportunity.strength * strength +
        scoringWeights.opportunity.freshness * freshness +
        scoringWeights.opportunity.volume * volumeShare),
  );

  const unverifiedShare =
    liveSignals.filter((item) => item.verification === 'unverified').length / liveSignals.length;
  const hostileShare =
    liveSignals.reduce(
      (total, item) =>
        item.verification === 'disputed'
          ? total + scoringWeights.hostility.disputed
          : item.verification === 'retracted'
            ? total + scoringWeights.hostility.retracted
            : total,
      0,
    ) / liveSignals.length;
  const unofficialShare =
    liveSignals.filter((item) => item.provenance !== 'official').length / liveSignals.length;

  const riskScore = round2(
    100 *
      (scoringWeights.risk.unverifiedShare * unverifiedShare +
        scoringWeights.risk.hostileShare * hostileShare +
        scoringWeights.risk.unofficialProvenance * unofficialShare),
  );

  const volumeTerm =
    scoringWeights.confidence.volume *
    (Math.min(liveSignals.length, scoringThresholds.volumeSaturationCount) /
      scoringThresholds.volumeSaturationCount);
  const verificationMixShare =
    liveSignals.reduce(
      (total, item) => total + scoringWeights.confidenceVerification[item.verification],
      0,
    ) / liveSignals.length;
  const verificationTerm = scoringWeights.confidence.verificationMix * verificationMixShare;
  const officialShare =
    liveSignals.filter((item) => item.provenance === 'official').length / liveSignals.length;
  const provenanceTerm = scoringWeights.confidence.officialProvenance * officialShare;
  const confidence = round2(volumeTerm + verificationTerm + provenanceTerm);

  const recommendation = decideRecommendation({
    opportunityScore,
    riskScore,
    confidence,
    hostileShare,
  });

  const factors: ScoreFactor[] = [
    {
      axis: 'opportunity',
      factorCode: 'signal_strength',
      contribution: round2(100 * scoringWeights.opportunity.strength * strength),
      inputValue: round4(strength),
      detail: `加权信号强度 ${(strength * 100).toFixed(1)}%`,
    },
    {
      axis: 'opportunity',
      factorCode: 'signal_freshness',
      contribution: round2(100 * scoringWeights.opportunity.freshness * freshness),
      inputValue: freshness,
      detail: `最新已发布信号新鲜度档位 ${freshness.toFixed(2)}`,
    },
    {
      axis: 'opportunity',
      factorCode: 'signal_volume',
      contribution: round2(100 * scoringWeights.opportunity.volume * volumeShare),
      inputValue: round4(volumeShare),
      detail: `有效信号 ${eligibleSignals.length} 条`,
    },
    {
      axis: 'risk',
      factorCode: 'unverified_share',
      contribution: round2(100 * scoringWeights.risk.unverifiedShare * unverifiedShare),
      inputValue: round4(unverifiedShare),
      detail: `未验证信号占比 ${(unverifiedShare * 100).toFixed(0)}%`,
    },
    {
      axis: 'risk',
      factorCode: 'hostile_signals',
      contribution: round2(100 * scoringWeights.risk.hostileShare * hostileShare),
      inputValue: round4(hostileShare),
      detail: `争议/撤回信号加权占比 ${(hostileShare * 100).toFixed(0)}%`,
    },
    {
      axis: 'risk',
      factorCode: 'unofficial_provenance',
      contribution: round2(100 * scoringWeights.risk.unofficialProvenance * unofficialShare),
      inputValue: round4(unofficialShare),
      detail: `非官方来源信号占比 ${(unofficialShare * 100).toFixed(0)}%`,
    },
    {
      axis: 'confidence',
      factorCode: 'signal_volume',
      contribution: round2(volumeTerm),
      inputValue: round4(liveSignals.length / scoringThresholds.volumeSaturationCount),
      detail: `已发布信号 ${liveSignals.length} 条`,
    },
    {
      axis: 'confidence',
      factorCode: 'verification_mix',
      contribution: round2(verificationTerm),
      inputValue: round4(verificationMixShare),
      detail: `验证等级加权占比 ${(verificationMixShare * 100).toFixed(0)}%`,
    },
    {
      axis: 'confidence',
      factorCode: 'official_provenance',
      contribution: round2(provenanceTerm),
      inputValue: round4(officialShare),
      detail: `官方来源信号占比 ${(officialShare * 100).toFixed(0)}%`,
    },
  ];

  const explanation =
    `评分模型 ${SCORING_MODEL_VERSION}：基于 ${liveSignals.length} 条已发布信号。` +
    `机会分 ${opportunityScore.toFixed(1)}` +
    `（信号强度 ${(strength * 100).toFixed(0)}%、新鲜度 ${(freshness * 100).toFixed(0)}%、数量 ${eligibleSignals.length} 条）；` +
    `风险分 ${riskScore.toFixed(1)}` +
    `（未验证占比 ${(unverifiedShare * 100).toFixed(0)}%、争议/撤回 ${(hostileShare * 100).toFixed(0)}%、非官方来源 ${(unofficialShare * 100).toFixed(0)}%）；` +
    `置信度 ${confidence.toFixed(1)}%。`;

  return {
    modelVersion: SCORING_MODEL_VERSION,
    opportunityScore,
    riskScore,
    confidence,
    recommendation,
    explanation,
    factors,
    linkedSignalIds: liveSignals.map((item) => item.signalId).sort(),
  };
}

export async function computeScoreInputVersion(input: {
  readonly projectLifecycle: 'active' | 'rumored';
  readonly signals: readonly ScoringSignalInput[];
}): Promise<string> {
  const snapshot = {
    lifecycle: input.projectLifecycle,
    signals: [...input.signals]
      .sort((a, b) => a.signalId.localeCompare(b.signalId))
      .map((item) => ({
        id: item.signalId,
        verification: item.verification,
        confidence: item.confidence,
        publishedAt: item.publishedAt,
        expiresAt: item.expiresAt,
        provenance: item.provenance,
      })),
  };
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(snapshot)),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `v1:${hex}`;
}

function decideRecommendation(input: {
  readonly opportunityScore: number;
  readonly riskScore: number;
  readonly confidence: number;
  readonly hostileShare: number;
}): Recommendation {
  if (input.hostileShare >= scoringThresholds.avoidHostileShare) {
    return 'avoid';
  }
  if (input.opportunityScore < scoringThresholds.researchOpportunity) {
    return 'research';
  }
  if (
    input.opportunityScore >= scoringThresholds.actNowOpportunity &&
    input.confidence >= scoringThresholds.actNowConfidence &&
    input.riskScore < scoringThresholds.actNowMaxRisk
  ) {
    return 'act_now';
  }
  if (input.opportunityScore >= scoringThresholds.watchOpportunity) {
    return 'watch';
  }
  return 'research';
}

function computeFreshness(
  liveSignals: readonly ScoringSignalInput[],
  calculatedAt: Date,
): number {
  const latest = liveSignals.reduce<number | null>((max, item) => {
    if (item.publishedAt === null) return max;
    const time = parseTimestamp(item.publishedAt, 'invalid_timestamp').getTime();
    return max === null || time > max ? time : max;
  }, null);
  if (latest === null) {
    return scoringThresholds.staleFreshnessValue;
  }
  const ageDays = (calculatedAt.getTime() - latest) / 86_400_000;
  for (const tier of scoringThresholds.freshnessTiers) {
    if (ageDays <= tier.maxAgeDays) {
      return tier.value;
    }
  }
  return scoringThresholds.staleFreshnessValue;
}

function parseTimestamp(value: string, errorCode: ScoringModelErrorCode): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ScoringModelError(errorCode);
  }
  return parsed;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
