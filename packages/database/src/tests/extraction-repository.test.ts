import { describe, expect, it } from 'vitest';

import type { ExtractionCandidatePayload } from '@airdrop/contracts';
import type { Sql } from 'postgres';

import {
  createExtractionRepository,
  ExtractionPersistenceError,
  type ExtractionCandidateInput,
} from '../ai/extraction-repository.js';

const aiRunId = '91000000-0000-4000-8000-000000000001';

describe('ExtractionRepository security ingress', () => {
  it.each(['security_risk', 'scam_indicator'] as const)(
    'routes a newly inserted %s candidate in the same transaction',
    async (claimType) => {
      const client = new TransactionalExtractionSql();
      const repository = createExtractionRepository(client.sql);

      await expect(repository.insertCandidates(aiRunId, [candidate(claimType, claimType)]))
        .resolves.toBe(1);

      expect(client.transactions).toBe(1);
      expect(client.committedCandidates).toHaveLength(1);
      expect(client.committedRoutes).toEqual([client.committedCandidates[0]!.id]);
    },
  );

  it('does not reroute or recount a duplicate retry', async () => {
    const client = new TransactionalExtractionSql();
    const repository = createExtractionRepository(client.sql);
    const input = candidate('security_risk', 'duplicate-security');

    await expect(repository.insertCandidates(aiRunId, [input])).resolves.toBe(1);
    await expect(repository.insertCandidates(aiRunId, [input])).resolves.toBe(0);

    expect(client.transactions).toBe(2);
    expect(client.committedCandidates).toHaveLength(1);
    expect(client.committedRoutes).toHaveLength(1);
  });

  it('keeps ordinary candidates on the normal review path without security routing', async () => {
    const client = new TransactionalExtractionSql();
    const repository = createExtractionRepository(client.sql);

    await expect(repository.insertCandidates(aiRunId, [candidate('points_program', 'ordinary')]))
      .resolves.toBe(1);

    expect(client.transactions).toBe(1);
    expect(client.committedCandidates).toHaveLength(1);
    expect(client.committedRoutes).toEqual([]);
  });

  it('atomically inserts and selectively routes a mixed batch', async () => {
    const client = new TransactionalExtractionSql();
    const repository = createExtractionRepository(client.sql);

    await expect(repository.insertCandidates(aiRunId, [
      candidate('points_program', 'ordinary'),
      candidate('security_risk', 'risk'),
      candidate('scam_indicator', 'scam'),
    ])).resolves.toBe(3);

    expect(client.transactions).toBe(1);
    expect(client.committedCandidates).toHaveLength(3);
    expect(client.committedRoutes).toEqual([
      client.committedCandidates[1]!.id,
      client.committedCandidates[2]!.id,
    ]);
  });

  it('rolls back the whole batch when security routing fails', async () => {
    const client = new TransactionalExtractionSql({ failRouting: true });
    const repository = createExtractionRepository(client.sql);

    await expect(repository.insertCandidates(aiRunId, [
      candidate('points_program', 'ordinary-before-failure'),
      candidate('security_risk', 'routing-failure'),
    ])).rejects.toEqual(new ExtractionPersistenceError());

    expect(client.transactions).toBe(1);
    expect(client.committedCandidates).toEqual([]);
    expect(client.committedRoutes).toEqual([]);
  });

  it('excludes security claim types from the ordinary pending-candidate list', async () => {
    const client = new TransactionalExtractionSql();
    client.seedPendingCandidate('points_program', 'ordinary');
    client.seedPendingCandidate('security_risk', 'risk');
    client.seedPendingCandidate('scam_indicator', 'scam');

    await expect(createExtractionRepository(client.sql).listPendingCandidates(25))
      .resolves.toMatchObject([{ payload: { claimType: 'points_program' } }]);
  });
});

function candidate(
  claimType: ExtractionCandidatePayload['claimType'],
  suffix: string,
): ExtractionCandidateInput {
  return {
    projectId: '92000000-0000-4000-8000-000000000001',
    sourceId: '92000000-0000-4000-8000-000000000002',
    discoveredItemId: '92000000-0000-4000-8000-000000000003',
    rawItemId: '92000000-0000-4000-8000-000000000004',
    payload: {
      claimType,
      signalType: claimType,
      title: `Candidate ${suffix}`,
      summary: `Grounded candidate summary for ${suffix}.`,
      confidence: 80,
      evidenceQuote: `Grounded evidence quote for ${suffix}.`,
      occurredAtIso: null,
    },
    payloadSha256: suffix.padEnd(64, '0').slice(0, 64),
  };
}

interface StoredCandidate {
  readonly id: string;
  readonly project_id: string;
  readonly discovered_item_id: string;
  readonly payload: ExtractionCandidatePayload;
  readonly payload_sha256: string;
  readonly created_at: string;
}

class TransactionalExtractionSql {
  readonly sql: Sql;
  transactions = 0;
  committedCandidates: StoredCandidate[] = [];
  committedRoutes: string[] = [];
  private readonly failRouting: boolean;
  private nextId = 1;

  constructor(options: { readonly failRouting?: boolean } = {}) {
    this.failRouting = options.failRouting ?? false;
    this.sql = this.queryFor(this.committedCandidates, this.committedRoutes) as unknown as Sql;
    Object.assign(this.sql, {
      begin: async <T>(work: (sql: Sql) => Promise<T>) => {
        this.transactions += 1;
        const candidates = [...this.committedCandidates];
        const routes = [...this.committedRoutes];
        const result = await work(this.queryFor(candidates, routes) as unknown as Sql);
        this.committedCandidates = candidates;
        this.committedRoutes = routes;
        return result;
      },
    });
  }

  seedPendingCandidate(claimType: ExtractionCandidatePayload['claimType'], suffix: string): void {
    const input = candidate(claimType, suffix);
    this.committedCandidates.push(this.storedCandidate(input));
  }

  private queryFor(candidates: StoredCandidate[], routes: string[]) {
    const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?').replace(/\s+/g, ' ').trim();
      if (text.startsWith('insert into public.extraction_candidates')) {
        const duplicate = candidates.some((row) => (
          row.discovered_item_id === values[3] && row.payload_sha256 === values[6]
        ));
        if (duplicate) return [];
        const row = this.storedCandidate({
          projectId: String(values[1]),
          sourceId: String(values[2]),
          discoveredItemId: String(values[3]),
          rawItemId: values[4] === null ? null : String(values[4]),
          payload: values[5] as ExtractionCandidatePayload,
          payloadSha256: String(values[6]),
        });
        candidates.push(row);
        return [{ id: row.id }];
      }
      if (text.includes('route_security_extraction_candidate')) {
        if (this.failRouting) throw Object.assign(new Error('sensitive database detail'), { code: 'AS199' });
        routes.push(String(values[0]));
        return [{ route_security_extraction_candidate: String(values[0]) }];
      }
      if (text.includes('from public.extraction_candidates')) {
        const excludesSecurity = text.includes("payload ->> 'claimType'")
          && text.includes("'security_risk'")
          && text.includes("'scam_indicator'");
        return candidates
          .filter((row) => !excludesSecurity || !['security_risk', 'scam_indicator'].includes(row.payload.claimType))
          .map((row) => ({
            id: row.id,
            project_id: row.project_id,
            discovered_item_id: row.discovered_item_id,
            payload: row.payload,
            created_at: row.created_at,
          }));
      }
      throw new Error(`unexpected query: ${text}`);
    };
    return Object.assign(query, { json: (value: unknown) => value });
  }

  private storedCandidate(input: ExtractionCandidateInput): StoredCandidate {
    const id = `93000000-0000-4000-8000-${String(this.nextId).padStart(12, '0')}`;
    this.nextId += 1;
    return {
      id,
      project_id: input.projectId,
      discovered_item_id: input.discoveredItemId,
      payload: input.payload,
      payload_sha256: input.payloadSha256,
      created_at: '2026-08-28T00:00:00.000Z',
    };
  }
}
