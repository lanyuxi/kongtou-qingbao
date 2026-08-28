import {
  publicBlockedProjectSecurityRowSchema,
  publicProjectSecurityStateSchema,
} from '@airdrop/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import {
  createSecurityPublicRepository,
  SecurityPublicProjectionQueryError,
} from '../repositories/security-public-repository.js';

const projectId = '71000000-0000-4000-8000-000000000001';
const secondProjectId = '71000000-0000-4000-8000-000000000002';
const incidentId = '71000000-0000-4000-8000-000000000010';
const indicatorId = '71000000-0000-4000-8000-000000000020';
const restrictedAt = '2026-08-28T03:00:00.000Z';

const blockedRow = {
  version: 1,
  project_id: projectId,
  project_slug: 'blocked-project',
  project_name: 'Blocked Project',
  posture: 'blocked',
  category: 'phishing',
  severity: 'critical',
  public_summary: 'A verified phishing incident requires an immediate participation block.',
  first_observed_at: '2026-08-27T03:00:00.000Z',
  last_verified_at: restrictedAt,
  restricted_at: restrictedAt,
  target_type: 'project',
  target_id: projectId,
  indicators: [{ id: indicatorId, type: 'domain', value: 'claim.example.invalid' }],
} as const;

const projectSecurityRow = {
  version: 1,
  project_id: projectId,
  posture: 'blocked',
  active_incidents: [{
    version: 1,
    incidentId,
    target: { type: 'project', id: projectId },
    category: 'phishing',
    severity: 'critical',
    state: 'active',
    publicSummary: 'A verified phishing incident requires an immediate participation block.',
    firstObservedAt: '2026-08-27T03:00:00.000Z',
    lastVerifiedAt: restrictedAt,
    indicators: [{ id: indicatorId, type: 'domain', value: 'claim.example.invalid' }],
  }],
} as const;

describe('SecurityPublicRepository.listBlockedProjects', () => {
  it('prevents a public blocked-list implementation from reading a base security table', async () => {
    const client = createPublicProjectionClient({ blockedRows: [blockedRow] });

    const page = await createSecurityPublicRepository(client).listBlockedProjects({
      cursor: null,
      limit: 20,
    });

    expect(client.relationCalls).toEqual(['public_blocked_projects']);
    expect(page.items).toEqual([
      publicBlockedProjectSecurityRowSchema.parse({
        version: 1,
        project: { id: projectId, slug: 'blocked-project', name: 'Blocked Project' },
        posture: 'blocked',
        category: 'phishing',
        severity: 'critical',
        publicSummary: 'A verified phishing incident requires an immediate participation block.',
        firstObservedAt: '2026-08-27T03:00:00.000Z',
        lastVerifiedAt: restrictedAt,
        target: { type: 'project', id: projectId },
        indicators: [{ id: indicatorId, type: 'domain', value: 'claim.example.invalid' }],
      }),
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('prevents cursor drift by ordering and continuing on restricted timestamp then project ID', async () => {
    const client = createPublicProjectionClient({
      blockedRows: [
        blockedRow,
        {
          ...blockedRow,
          project_id: secondProjectId,
          project_slug: 'blocked-project-second',
          project_name: 'Blocked Project Second',
          target_id: secondProjectId,
        },
      ],
    });

    const page = await createSecurityPublicRepository(client).listBlockedProjects({
      cursor: null,
      limit: 1,
    });
    await createSecurityPublicRepository(client).listBlockedProjects({ cursor: page.nextCursor, limit: 1 });

    expect(client.orders).toEqual([
      ['restricted_at', { ascending: false }],
      ['project_id', { ascending: false }],
      ['restricted_at', { ascending: false }],
      ['project_id', { ascending: false }],
    ]);
    expect(client.orFilters).toEqual([
      `restricted_at.lt.${restrictedAt},and(restricted_at.eq.${restrictedAt},project_id.lt.${projectId})`,
    ]);
    expect(page.nextCursor).toBe(
      Buffer.from(JSON.stringify({ lastVerifiedAt: restrictedAt, projectId }), 'utf8').toString('base64url'),
    );
  });

  it('prevents sensitive projection leaks by selecting only strict public blocked columns', async () => {
    const client = createPublicProjectionClient({ blockedRows: [] });

    await createSecurityPublicRepository(client).listBlockedProjects({ cursor: null, limit: 20 });

    expect(client.selections).toEqual([
      'version,project_id,project_slug,project_name,posture,category,severity,public_summary,first_observed_at,last_verified_at,restricted_at,target_type,target_id,indicators',
    ]);
    expect(client.selections[0]).not.toMatch(/evidence|source_url|reviewer|note|candidate|raw|hash/i);
  });

  it('prevents mapping an unapproved indicator value by rejecting malformed public rows', async () => {
    const client = createPublicProjectionClient({
      blockedRows: [{ ...blockedRow, reviewer_user_id: 'private-reviewer' }],
    });

    await expect(
      createSecurityPublicRepository(client).listBlockedProjects({ cursor: null, limit: 20 }),
    ).rejects.toThrow(TypeError);
  });
});

describe('SecurityPublicRepository.getProjectSecurity', () => {
  it.each(['clear', 'caution', 'blocked'] as const)(
    'prevents %s project posture from being flattened or inferred from a score',
    async (posture) => {
      const client = createPublicProjectionClient({
        projectSecurityRow: { ...projectSecurityRow, posture, active_incidents: posture === 'clear' ? [] : projectSecurityRow.active_incidents },
      });

      const state = await createSecurityPublicRepository(client).getProjectSecurity(projectId);

      expect(state).toEqual(publicProjectSecurityStateSchema.parse({
        version: 1,
        projectId,
        posture,
        activeIncidents: posture === 'clear' ? [] : projectSecurityRow.active_incidents,
      }));
      expect(client.relationCalls).toEqual(['public_project_security_state']);
    },
  );

  it('prevents PostgREST details from escaping the public projection error boundary', async () => {
    const client = createPublicProjectionClient({
      projectSecurityError: {
        code: '42501',
        message: 'security decision reviewer=private',
        details: 'evidence_id=private',
        hint: 'internal note',
      },
    });

    const error = await createSecurityPublicRepository(client)
      .getProjectSecurity(projectId)
      .catch((cause: unknown) => cause);

    expect(error).toEqual(new SecurityPublicProjectionQueryError('42501'));
    expect(String(error)).not.toMatch(/reviewer|evidence|note|private/i);
  });
});

interface FakePostgrestError {
  readonly code: string;
  readonly message: string;
  readonly details: string;
  readonly hint: string;
}

function createPublicProjectionClient(options: {
  readonly blockedRows?: readonly unknown[];
  readonly projectSecurityRow?: unknown | null;
  readonly projectSecurityError?: FakePostgrestError;
}): SupabaseClient<Database> & {
  readonly relationCalls: string[];
  readonly selections: string[];
  readonly orders: [string, { readonly ascending: boolean }][];
  readonly orFilters: string[];
} {
  const relationCalls: string[] = [];
  const selections: string[] = [];
  const orders: [string, { readonly ascending: boolean }][] = [];
  const orFilters: string[] = [];
  let blockedRange: [number, number] = [0, 100];

  return {
    relationCalls,
    selections,
    orders,
    orFilters,
    from(relation: string) {
      relationCalls.push(relation);
      if (relation === 'public_blocked_projects') {
        const query = {
          select(columns: string) {
            selections.push(columns);
            return query;
          },
          order(column: string, options: { readonly ascending: boolean }) {
            orders.push([column, options]);
            return query;
          },
          or(filter: string) {
            orFilters.push(filter);
            return query;
          },
          range(from: number, to: number) {
            blockedRange = [from, to];
            return query;
          },
          then<TResult1 = { data: readonly unknown[]; error: null }>(
            onfulfilled?: ((value: { data: readonly unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
          ) {
            return Promise.resolve({
              data: (options.blockedRows ?? []).slice(blockedRange[0], blockedRange[1] + 1),
              error: null,
            }).then(onfulfilled);
          },
        };
        return query;
      }
      if (relation === 'public_project_security_state') {
        const query = {
          select(columns: string) {
            selections.push(columns);
            return query;
          },
          eq() {
            return query;
          },
          maybeSingle() {
            return Promise.resolve({
              data: options.projectSecurityRow ?? null,
              error: options.projectSecurityError ?? null,
            });
          },
        };
        return query;
      }
      throw new Error(`Public security repository must not query ${relation}.`);
    },
  } as unknown as SupabaseClient<Database> & {
    readonly relationCalls: string[];
    readonly selections: string[];
    readonly orders: [string, { readonly ascending: boolean }][];
    readonly orFilters: string[];
  };
}
