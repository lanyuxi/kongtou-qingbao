import postgres from 'postgres';

import { createExtractionRepository } from '@airdrop/database';

import { runExtractionOnce } from './extract-discovered.js';
import { createOpenAiCompatibleModelClient } from './model-client.js';

const DATABASE_URL = 'AIRDROP_AI_STAGE_DATABASE_URL';
const MODEL_BASE_URL = 'AI_MODEL_BASE_URL';
const MODEL_API_KEY = 'AI_MODEL_API_KEY';
const MODEL_ID = 'AI_MODEL_ID';
const MAX_INPUTS = 'AI_EXTRACT_MAX_INPUTS';

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL_ID = 'deepseek-chat';
const DEFAULT_MAX_INPUTS = '5';

class ExtractCliConfigurationError extends Error {
  readonly code = 'invalid_extract_cli_configuration' as const;
}

export async function main(): Promise<void> {
  const databaseUrl = process.env[DATABASE_URL];
  const apiKey = process.env[MODEL_API_KEY];
  const baseUrl = process.env[MODEL_BASE_URL] ?? DEFAULT_BASE_URL;
  const modelId = process.env[MODEL_ID] ?? DEFAULT_MODEL_ID;
  const maxInputs = Number.parseInt(process.env[MAX_INPUTS] ?? DEFAULT_MAX_INPUTS, 10);

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new ExtractCliConfigurationError();
  }
  if (apiKey === undefined || apiKey.length === 0) {
    throw new ExtractCliConfigurationError();
  }
  if (!Number.isInteger(maxInputs) || maxInputs < 1 || maxInputs > 50) {
    throw new ExtractCliConfigurationError();
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const summary = await runExtractionOnce({
      repository: createExtractionRepository(sql),
      modelClient: createOpenAiCompatibleModelClient({ baseUrl, apiKey, model: modelId }),
      maxInputs,
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
