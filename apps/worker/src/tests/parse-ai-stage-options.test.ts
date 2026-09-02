import { describe, expect, it } from 'vitest';

import { parseAiStageOptions } from '../index.js';
import { WorkerConfigurationError } from '../index.js';

const BASE_ENV = {
  AIRDROP_QUEUE_DATABASE_URL: 'postgresql://collection_queue_worker_login:local-password@127.0.0.1:15432/postgres',
  AIRDROP_COLLECTION_DATABASE_URL: 'postgresql://collection_worker_login:local-password@127.0.0.1:15432/postgres',
  AIRDROP_COLLECTION_USER_AGENT: 'airdrop-intelligence-dev',
  AIRDROP_QUEUE_WORKER_ID: 'worker-test',
} as const;

describe('parseAiStageOptions', () => {
  it('returns null when the stage database URL is absent (collection-only worker)', () => {
    const options = parseAiStageOptions({ ...BASE_ENV, AI_MODEL_API_KEY: 'sk-test' });
    expect(options).toBeNull();
  });

  it('returns null when the model API key is absent (collection-only worker)', () => {
    const options = parseAiStageOptions({
      ...BASE_ENV,
      AIRDROP_AI_STAGE_DATABASE_URL: 'postgresql://ai_stage_worker_login:local-password@127.0.0.1:15432/postgres',
    });
    expect(options).toBeNull();
  });

  it('builds defaults when both required values are present', () => {
    const options = parseAiStageOptions({
      ...BASE_ENV,
      AIRDROP_AI_STAGE_DATABASE_URL: 'postgresql://ai_stage_worker_login:local-password@127.0.0.1:15432/postgres',
      AI_MODEL_API_KEY: 'sk-test',
    });
    expect(options).toEqual({
      databaseUrl: 'postgresql://ai_stage_worker_login:local-password@127.0.0.1:15432/postgres',
      modelApiKey: 'sk-test',
      modelBaseUrl: 'https://api.deepseek.com/v1',
      modelId: 'deepseek-chat',
      maxInputs: 5,
      maxProjects: 25,
      extractTickMs: 60_000,
      scoringTickMs: 300_000,
      tutorialTickMs: 600_000,
    });
  });

  it('honors explicit overrides for batch sizes and tick intervals', () => {
    const options = parseAiStageOptions({
      ...BASE_ENV,
      AIRDROP_AI_STAGE_DATABASE_URL: 'postgresql://ai_stage_worker_login:local-password@127.0.0.1:15432/postgres',
      AI_MODEL_API_KEY: 'sk-test',
      AI_MODEL_BASE_URL: 'https://other.example/v1',
      AI_MODEL_ID: 'deepseek-reasoner',
      AI_EXTRACT_MAX_INPUTS: '10',
      AI_SCORE_MAX_PROJECTS: '50',
      AIRDROP_ORCHESTRATION_EXTRACT_TICK_MS: '30000',
      AIRDROP_ORCHESTRATION_SCORING_TICK_MS: '600000',
    });
    expect(options?.modelBaseUrl).toBe('https://other.example/v1');
    expect(options?.modelId).toBe('deepseek-reasoner');
    expect(options?.maxInputs).toBe(10);
    expect(options?.maxProjects).toBe(50);
    expect(options?.extractTickMs).toBe(30_000);
    expect(options?.scoringTickMs).toBe(600_000);
  });

  it('rejects an out-of-range extraction batch size when orchestration is enabled', () => {
    expect(() =>
      parseAiStageOptions({
        ...BASE_ENV,
        AIRDROP_AI_STAGE_DATABASE_URL: 'postgresql://ai_stage_worker_login:local-password@127.0.0.1:15432/postgres',
        AI_MODEL_API_KEY: 'sk-test',
        AI_EXTRACT_MAX_INPUTS: '999',
      }),
    ).toThrow(WorkerConfigurationError);
  });

  it('rejects a tick interval below the five-second floor', () => {
    expect(() =>
      parseAiStageOptions({
        ...BASE_ENV,
        AIRDROP_AI_STAGE_DATABASE_URL: 'postgresql://ai_stage_worker_login:local-password@127.0.0.1:15432/postgres',
        AI_MODEL_API_KEY: 'sk-test',
        AIRDROP_ORCHESTRATION_SCORING_TICK_MS: '1000',
      }),
    ).toThrow(WorkerConfigurationError);
  });
});
