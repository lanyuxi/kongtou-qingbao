import {
  blockedProjectSecurityListQuerySchema,
  publicBlockedProjectSecurityPageSchema,
  publicBlockedProjectSecurityRowSchema,
  publicProjectSecurityStateSchema,
  type PublicBlockedProjectSecurityPage,
  type PublicBlockedProjectSecurityRow,
  type PublicProjectSecurityState,
} from '@airdrop/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../generated/database.types.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const blockedProjectSelection =
  'version,project_id,project_slug,project_name,posture,category,severity,public_summary,first_observed_at,last_verified_at,restricted_at,target_type,target_id,indicators';
const projectSecuritySelection = 'version,project_id,posture,active_incidents';

interface PublicBlockedProjectRow {
  readonly version: 1;
  readonly projectId: string;
  readonly projectSlug: string;
  readonly projectName: string;
  readonly posture: 'blocked';
  readonly category: unknown;
  readonly severity: unknown;
  readonly publicSummary: unknown;
  readonly firstObservedAt: unknown;
  readonly lastVerifiedAt: string;
  readonly restrictedAt: string;
  readonly targetId: string;
  readonly indicators: unknown;
}

interface PublicProjectSecurityRow {
  readonly version: 1;
  readonly projectId: string;
  readonly posture: unknown;
  readonly activeIncidents: unknown;
}

interface BlockedCursor {
  readonly lastVerifiedAt: string;
  readonly projectId: string;
}

export interface PublicBlockedProjectQuery {
  readonly cursor: string | null;
  readonly limit: number;
}

export interface SecurityPublicRepository {
  listBlockedProjects(input: PublicBlockedProjectQuery): Promise<PublicBlockedProjectSecurityPage>;
  getProjectSecurity(projectId: string): Promise<PublicProjectSecurityState>;
}

export function createSecurityPublicRepository(
  client: SupabaseClient<Database>,
): SecurityPublicRepository {
  return {
    async listBlockedProjects(input) {
      const queryInput = blockedProjectSecurityListQuerySchema.parse(input);
      const cursor = queryInput.cursor === null ? null : decodeBlockedCursor(queryInput.cursor);
      const query = client
        .from('public_blocked_projects')
        .select(blockedProjectSelection)
        .order('restricted_at', { ascending: false })
        .order('project_id', { ascending: false });
      const response = cursor === null
        ? await query.range(0, queryInput.limit)
        : await query
            .or(
              `restricted_at.lt.${cursor.lastVerifiedAt},and(restricted_at.eq.${cursor.lastVerifiedAt},project_id.lt.${cursor.projectId})`,
            )
            .range(0, queryInput.limit);

      if (response.error !== null) {
        throw new SecurityPublicProjectionQueryError(response.error.code);
      }

      const rows = (response.data ?? []).map(parseBlockedProjectRow);
      const items = rows.slice(0, queryInput.limit).map(mapBlockedProjectRow);
      const finalItem = items.at(-1);
      return publicBlockedProjectSecurityPageSchema.parse({
        items,
        nextCursor:
          rows.length > queryInput.limit && finalItem !== undefined
            ? encodeBlockedCursor(finalItem.lastVerifiedAt, finalItem.project.id)
            : null,
      });
    },

    async getProjectSecurity(projectId) {
      if (!uuidPattern.test(projectId)) {
        throw new RangeError('Project ID format is invalid.');
      }
      const response = await client
        .from('public_project_security_state')
        .select(projectSecuritySelection)
        .eq('project_id', projectId)
        .maybeSingle();

      if (response.error !== null) {
        throw new SecurityPublicProjectionQueryError(response.error.code);
      }
      if (response.data === null) {
        throw new SecurityPublicProjectionQueryError('security_projection_missing');
      }

      return mapProjectSecurityRow(parseProjectSecurityRow(response.data));
    },
  };
}

export class SecurityPublicProjectionQueryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super('Unable to read public project security.');
    this.name = 'SecurityPublicProjectionQueryError';
    this.code = code;
  }
}

function mapBlockedProjectRow(row: PublicBlockedProjectRow): PublicBlockedProjectSecurityRow {
  return publicBlockedProjectSecurityRowSchema.parse({
    version: row.version,
    project: { id: row.projectId, slug: row.projectSlug, name: row.projectName },
    posture: row.posture,
    category: row.category,
    severity: row.severity,
    publicSummary: row.publicSummary,
    firstObservedAt: row.firstObservedAt,
    lastVerifiedAt: row.lastVerifiedAt,
    target: { type: 'project', id: row.targetId },
    indicators: row.indicators,
  });
}

function mapProjectSecurityRow(row: PublicProjectSecurityRow): PublicProjectSecurityState {
  return publicProjectSecurityStateSchema.parse({
    version: row.version,
    projectId: row.projectId,
    posture: row.posture,
    activeIncidents: row.activeIncidents,
  });
}

function decodeBlockedCursor(cursor: string): BlockedCursor {
  try {
    const padding = '='.repeat((4 - (cursor.length % 4)) % 4);
    const decoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(globalThis.atob(`${cursor}${padding}`), (character) => character.charCodeAt(0)),
      ),
    ) as unknown;
    if (!isRecordWithExactKeys(decoded, ['lastVerifiedAt', 'projectId'])) {
      throw new TypeError('Blocked project cursor is invalid.');
    }
    const lastVerifiedAt = decoded.lastVerifiedAt;
    const projectId = decoded.projectId;
    if (
      typeof lastVerifiedAt !== 'string' ||
      !isIsoTimestamp(lastVerifiedAt) ||
      typeof projectId !== 'string' ||
      !uuidPattern.test(projectId)
    ) {
      throw new TypeError('Blocked project cursor is invalid.');
    }
    return { lastVerifiedAt, projectId };
  } catch {
    throw new RangeError('Blocked project cursor is invalid.');
  }
}

function parseBlockedProjectRow(value: unknown): PublicBlockedProjectRow {
  const keys = [
    'version', 'project_id', 'project_slug', 'project_name', 'posture', 'category', 'severity',
    'public_summary', 'first_observed_at', 'last_verified_at', 'restricted_at', 'target_type',
    'target_id', 'indicators',
  ];
  if (!isRecordWithExactKeys(value, keys)) {
    throw new TypeError('Public blocked project projection returned unsafe fields.');
  }
  const restrictedAt = value.restricted_at;
  if (typeof restrictedAt !== 'string' || !isIsoTimestamp(restrictedAt)) {
    throw new TypeError('Public blocked project projection returned an invalid restricted_at.');
  }
  const parsed = publicBlockedProjectSecurityRowSchema.parse({
    version: value.version,
    project: { id: value.project_id, slug: value.project_slug, name: value.project_name },
    posture: value.posture,
    category: value.category,
    severity: value.severity,
    publicSummary: value.public_summary,
    firstObservedAt: value.first_observed_at,
    lastVerifiedAt: value.last_verified_at,
    target: { type: value.target_type, id: value.target_id },
    indicators: value.indicators,
  });
  if (restrictedAt !== parsed.lastVerifiedAt) {
    throw new TypeError('Public blocked project projection returned inconsistent restriction time.');
  }
  return {
    version: parsed.version,
    projectId: parsed.project.id,
    projectSlug: parsed.project.slug,
    projectName: parsed.project.name,
    posture: parsed.posture,
    category: parsed.category,
    severity: parsed.severity,
    publicSummary: parsed.publicSummary,
    firstObservedAt: parsed.firstObservedAt,
    lastVerifiedAt: parsed.lastVerifiedAt,
    restrictedAt,
    targetId: parsed.target.id,
    indicators: parsed.indicators,
  };
}

function parseProjectSecurityRow(value: unknown): PublicProjectSecurityRow {
  if (!isRecordWithExactKeys(value, ['version', 'project_id', 'posture', 'active_incidents'])) {
    throw new TypeError('Public project security projection returned unsafe fields.');
  }
  const parsed = publicProjectSecurityStateSchema.parse({
    version: value.version,
    projectId: value.project_id,
    posture: value.posture,
    activeIncidents: value.active_incidents,
  });
  return {
    version: parsed.version,
    projectId: parsed.projectId,
    posture: parsed.posture,
    activeIncidents: parsed.activeIncidents,
  };
}

function isRecordWithExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === [...expectedKeys].sort()[index]);
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value);
}

function encodeBlockedCursor(lastVerifiedAt: string, projectId: string): string {
  return globalThis
    .btoa(JSON.stringify({ lastVerifiedAt, projectId }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}
