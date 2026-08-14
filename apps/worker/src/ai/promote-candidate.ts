import postgres from 'postgres';

import { createExtractionRepository } from '@airdrop/database';

const DATABASE_URL = 'AIRDROP_AI_STAGE_DATABASE_URL';
const DEFAULT_ACTOR = 'human:local-admin';

class PromoteCliConfigurationError extends Error {
  readonly code = 'invalid_promote_cli_configuration' as const;
}

class PromoteCliUsageError extends Error {
  readonly code = 'invalid_promote_cli_usage' as const;
}

export async function main(argv: readonly string[]): Promise<void> {
  const databaseUrl = process.env[DATABASE_URL];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new PromoteCliConfigurationError();
  }

  const command = argv[0];
  if (command !== 'promote' && command !== 'list') {
    throw new PromoteCliUsageError();
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const repository = createExtractionRepository(sql);
    if (command === 'list') {
      const candidates = await repository.listPendingCandidates(50);
      for (const candidate of candidates) {
        process.stdout.write(
          `${candidate.id}  ${candidate.payload.claimType}  ${candidate.payload.title}\n`,
        );
      }
      return;
    }
    const candidateId = argv[1];
    if (candidateId === undefined || !/^[0-9a-f-]{36}$/i.test(candidateId)) {
      throw new PromoteCliUsageError();
    }
    const signalId = await repository.promoteCandidate(candidateId, DEFAULT_ACTOR);
    process.stdout.write(`promoted candidate ${candidateId} -> signal ${signalId}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
