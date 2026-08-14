import { randomUUID } from 'node:crypto';

import { createSourceCollector } from '../collection/create-collector.js';

const DATABASE_URL = 'AIRDROP_COLLECTION_DATABASE_URL';
const COLLECTION_USER_AGENT = 'AIRDROP_COLLECTION_USER_AGENT';

class CollectOnceConfigurationError extends Error {
  readonly code = 'invalid_collect_once_configuration' as const;
}

export async function main(projectId: string, sourceId: string): Promise<void> {
  const databaseUrl = process.env[DATABASE_URL];
  const userAgent = process.env[COLLECTION_USER_AGENT];
  if (
    databaseUrl === undefined || databaseUrl.length === 0 ||
    userAgent === undefined || userAgent.length === 0
  ) {
    throw new CollectOnceConfigurationError();
  }

  const collector = createSourceCollector({ databaseUrl, userAgent });
  try {
    const result = await collector.collect({
      jobId: randomUUID(),
      type: 'collect.source',
      version: 1,
      idempotencyKey: `e2e-collect-${randomUUID()}`,
      correlationId: randomUUID(),
      occurredAt: new Date().toISOString(),
      payload: { projectId, sourceId },
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await collector.close();
  }
}
