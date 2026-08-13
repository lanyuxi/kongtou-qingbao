import { randomUUID } from 'node:crypto';

import { createSourceCollectionRepository } from '@airdrop/database/collection-worker';
import postgres from 'postgres';

import { createCollectSource, createNodeContentHasher } from './collect-source.js';
import { createSafeDnsResolver } from './dns-resolver.js';
import { createFeedParser } from './feed-parser.js';
import { createSafeHttpsClient } from './safe-https-client.js';

export interface SourceCollectorOptions {
  readonly databaseUrl: string;
  readonly userAgent: string;
}

export class SourceCollectorConfigurationError extends Error {
  readonly code = 'invalid_collection_configuration' as const;

  constructor() {
    super('Source collector configuration is invalid.');
    this.name = 'SourceCollectorConfigurationError';
  }
}

export function createSourceCollector(options: SourceCollectorOptions) {
  validateOptions(options);
  const sql = postgres(options.databaseUrl, {
    max: 2,
    idle_timeout: 20,
    connect_timeout: 5,
  });
  const repository = createSourceCollectionRepository(sql);
  const resolver = createSafeDnsResolver();
  const http = createSafeHttpsClient({ resolver, userAgent: options.userAgent });
  const collect = createCollectSource({
    repository,
    http,
    feedParser: createFeedParser(),
    hasher: createNodeContentHasher(),
    clock: { now: () => new Date() },
    ids: { generate: () => randomUUID() },
  });

  return {
    collect,
    close: async (): Promise<void> => {
      await sql.end({ timeout: 5 });
    },
  };
}

function validateOptions(options: SourceCollectorOptions): void {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(options.databaseUrl);
  } catch {
    throw new SourceCollectorConfigurationError();
  }
  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    databaseUrl.hostname.length === 0 ||
    options.userAgent.trim() !== options.userAgent ||
    options.userAgent.length < 1 ||
    options.userAgent.length > 255 ||
    !/^[\x20-\x7e]+$/.test(options.userAgent)
  ) {
    throw new SourceCollectorConfigurationError();
  }
}
