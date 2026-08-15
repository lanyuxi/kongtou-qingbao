import postgres from 'postgres';

import { createScoringRepository } from '@airdrop/database';

import { DEFAULT_MAX_SCORING_PROJECTS, runScoringOnce } from './score-projects.js';

const DATABASE_URL = 'AIRDROP_AI_STAGE_DATABASE_URL';
const MAX_PROJECTS = 'AI_SCORE_MAX_PROJECTS';

class ScoringCliConfigurationError extends Error {
  readonly code = 'invalid_scoring_cli_configuration' as const;
}

export async function main(): Promise<void> {
  const databaseUrl = process.env[DATABASE_URL];
  const maxProjects = Number.parseInt(
    process.env[MAX_PROJECTS] ?? String(DEFAULT_MAX_SCORING_PROJECTS),
    10,
  );

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new ScoringCliConfigurationError();
  }
  if (!Number.isInteger(maxProjects) || maxProjects < 1 || maxProjects > 100) {
    throw new ScoringCliConfigurationError();
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const summary = await runScoringOnce({
      repository: createScoringRepository(sql),
      maxProjects,
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  const cause = error instanceof Error && error.cause !== undefined ? `\ncause: ${String(error.cause)}` : '';
  process.stderr.write(`${message}${cause}\n`);
  process.exitCode = 1;
});
