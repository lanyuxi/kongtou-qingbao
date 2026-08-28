import {
  SCORING_MODEL_VERSION,
  ScoringModelError,
  computeProjectScore,
  computeScoreInputVersion,
  scoringPipelineVersion,
  type ScoringSignalInput,
} from '@airdrop/domain';

import type { ScoringRunnerPorts } from './ports.js';

export interface ScoringRunSummary {
  readonly projectsScored: number;
  readonly projectsSkipped: number;
  readonly duplicatesSkipped: number;
  readonly securitySkipped: number;
}

export const DEFAULT_MAX_SCORING_PROJECTS = 25;

export async function runScoringOnce(ports: ScoringRunnerPorts): Promise<ScoringRunSummary> {
  const maxProjects = ports.maxProjects ?? DEFAULT_MAX_SCORING_PROJECTS;
  const now = ports.now ?? (() => new Date());
  const inputs = await ports.repository.listScoringInputs(maxProjects);

  const summary = {
    projectsScored: 0,
    projectsSkipped: 0,
    duplicatesSkipped: 0,
    securitySkipped: 0,
  };

  for (const input of inputs) {
    const calculatedAt = now();
    const signals: readonly ScoringSignalInput[] = input.signals.map((signal) => ({
      signalId: signal.signalId,
      verification: signal.verification,
      confidence: signal.confidence,
      publishedAt: signal.publishedAt,
      expiresAt: signal.expiresAt,
      provenance: signal.provenance,
    }));

    let result;
    try {
      result = computeProjectScore({
        projectLifecycle: input.projectLifecycle,
        signals,
        calculatedAt: calculatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof ScoringModelError && error.code === 'no_live_signals') {
        summary.projectsSkipped += 1;
        continue;
      }
      throw error;
    }

    const inputVersion = await computeScoreInputVersion({
      projectLifecycle: input.projectLifecycle,
      signals,
    });

    const record = await ports.repository.recordProjectScore({
      projectId: input.projectId,
      modelVersion: SCORING_MODEL_VERSION,
      inputVersion,
      opportunityScore: result.opportunityScore,
      riskScore: result.riskScore,
      confidence: result.confidence,
      recommendation: result.recommendation,
      explanation: result.explanation,
      calculatedAtIso: calculatedAt.toISOString(),
      factors: result.factors,
      linkedSignalIds: result.linkedSignalIds,
    });

    if (record.skippedReason === 'security_restricted') {
      summary.securitySkipped += 1;
    } else if (record.created) {
      summary.projectsScored += 1;
    } else {
      summary.duplicatesSkipped += 1;
    }
  }

  return summary;
}

export const scoringRunMetadata = {
  stage: scoringPipelineVersion,
  modelVersion: SCORING_MODEL_VERSION,
} as const;
