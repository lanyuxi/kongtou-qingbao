import {
  apiErrorSchema,
  createApiSuccessSchema,
  manualSecurityCandidateCommandV1Schema,
  reviewerSecurityCandidateDetailSchema,
  reviewerSecurityCandidateListItemSchema,
  reviewerSecurityIncidentDetailSchema,
  reviewerSecurityIncidentListItemSchema,
  securityCandidateListQuerySchema,
  securityCandidateReviewCommandV1Schema,
  securityCandidateReviewReceiptV1Schema,
  securityIncidentCommandReceiptV1Schema,
  securityIncidentCommandV1Schema,
  securityIncidentListQuerySchema,
  securityIndicatorDisclosureCommandV1Schema,
  securityIndicatorDisclosureReceiptV1Schema,
  type ManualSecurityCandidateCommandV1,
  type ReviewerSecurityCandidateDetail,
  type ReviewerSecurityCandidateListItem,
  type ReviewerSecurityIncidentDetail,
  type ReviewerSecurityIncidentListItem,
  type SecurityCandidateListQuery,
  type SecurityCandidateReviewCommandV1,
  type SecurityIncidentCommandReceiptV1,
  type SecurityIncidentCommandV1,
  type SecurityIncidentListQuery,
  type SecurityIndicatorDisclosureCommandV1,
} from '@airdrop/contracts';
import { z } from 'zod';

import type { ReviewSessionController } from './review-session.js';

const uuidSchema = z.uuid();
const manualReceiptSchema = z.strictObject({ version: z.literal(1), commandId: uuidSchema, candidateId: uuidSchema, candidateVersion: z.number().int().positive(), state: z.string(), replayed: z.boolean() });
const candidateListResponseSchema = createApiSuccessSchema(z.strictObject({ version: z.literal(1), items: z.array(reviewerSecurityCandidateListItemSchema) }));
const candidateDetailResponseSchema = createApiSuccessSchema(reviewerSecurityCandidateDetailSchema);
const candidateMutationResponseSchema = createApiSuccessSchema(z.union([manualReceiptSchema, securityCandidateReviewReceiptV1Schema]));
const incidentListResponseSchema = createApiSuccessSchema(z.strictObject({ version: z.literal(1), items: z.array(reviewerSecurityIncidentListItemSchema) }));
const incidentDetailResponseSchema = createApiSuccessSchema(reviewerSecurityIncidentDetailSchema);
const incidentMutationResponseSchema = createApiSuccessSchema(securityIncidentCommandReceiptV1Schema);
const disclosureResponseSchema = createApiSuccessSchema(securityIndicatorDisclosureReceiptV1Schema);

export type SecurityReviewApiFailure =
  | { readonly ok: false; readonly state: 'sign_in_required' }
  | { readonly ok: false; readonly state: 'forbidden' }
  | { readonly ok: false; readonly state: 'not_found' }
  | { readonly ok: false; readonly state: 'conflict'; readonly code: 'security_version_conflict' | 'security_idempotency_conflict' }
  | { readonly ok: false; readonly state: 'request_failed' };
export type SecurityReviewApiSuccess<T> = { readonly ok: true; readonly data: T; readonly nextCursor: string | null };
export interface SecurityReviewApiClient {
  listCandidates(query: SecurityCandidateListQuery): Promise<SecurityReviewApiSuccess<{ version: 1; items: ReviewerSecurityCandidateListItem[] }> | SecurityReviewApiFailure>;
  getCandidate(candidateId: string): Promise<SecurityReviewApiSuccess<ReviewerSecurityCandidateDetail> | SecurityReviewApiFailure>;
  submitManualCandidate(command: ManualSecurityCandidateCommandV1): Promise<SecurityReviewApiSuccess<unknown> | SecurityReviewApiFailure>;
  reviewCandidate(candidateId: string, command: SecurityCandidateReviewCommandV1): Promise<SecurityReviewApiSuccess<unknown> | SecurityReviewApiFailure>;
  listIncidents(query: SecurityIncidentListQuery): Promise<SecurityReviewApiSuccess<{ version: 1; items: ReviewerSecurityIncidentListItem[] }> | SecurityReviewApiFailure>;
  getIncident(incidentId: string): Promise<SecurityReviewApiSuccess<ReviewerSecurityIncidentDetail> | SecurityReviewApiFailure>;
  openIncident(command: Extract<SecurityIncidentCommandV1, { action: 'open' }>): Promise<SecurityReviewApiSuccess<SecurityIncidentCommandReceiptV1> | SecurityReviewApiFailure>;
  commandIncident(incidentId: string, command: Exclude<SecurityIncidentCommandV1, { action: 'open' }>): Promise<SecurityReviewApiSuccess<SecurityIncidentCommandReceiptV1> | SecurityReviewApiFailure>;
  setIndicatorDisclosure(indicatorId: string, command: SecurityIndicatorDisclosureCommandV1): Promise<SecurityReviewApiSuccess<unknown> | SecurityReviewApiFailure>;
}
type Dependencies = { readonly session: ReviewSessionController; readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; readonly ids: { generate(): string } };

export function createSecurityReviewApiClient(deps: Dependencies): SecurityReviewApiClient {
  return {
    async listCandidates(query) { const parsed = securityCandidateListQuerySchema.safeParse(query); return !parsed.success ? failed() : get(deps, `/api/v1/review/security/candidates?${search(parsed.data).toString()}`, candidateListResponseSchema); },
    async getCandidate(id) { return uuidSchema.safeParse(id).success ? get(deps, `/api/v1/review/security/candidates/${id}`, candidateDetailResponseSchema) : failed(); },
    async submitManualCandidate(command) { const parsed = manualSecurityCandidateCommandV1Schema.safeParse(command); return !parsed.success ? failed() : mutation(deps, '/api/v1/review/security/candidates', parsed.data, candidateMutationResponseSchema); },
    async reviewCandidate(id, command) { const parsedId = uuidSchema.safeParse(id); const parsed = securityCandidateReviewCommandV1Schema.safeParse(command); return !parsedId.success || !parsed.success ? failed() : mutation(deps, `/api/v1/review/security/candidates/${parsedId.data}/decisions`, parsed.data, candidateMutationResponseSchema); },
    async listIncidents(query) { const parsed = securityIncidentListQuerySchema.safeParse(query); return !parsed.success ? failed() : get(deps, `/api/v1/review/security/incidents?${search(parsed.data).toString()}`, incidentListResponseSchema); },
    async getIncident(id) { return uuidSchema.safeParse(id).success ? get(deps, `/api/v1/review/security/incidents/${id}`, incidentDetailResponseSchema) : failed(); },
    async openIncident(command) { const parsed = securityIncidentCommandV1Schema.safeParse(command); return !parsed.success || parsed.data.action !== 'open' ? failed() : mutation(deps, '/api/v1/review/security/incidents', parsed.data, incidentMutationResponseSchema); },
    async commandIncident(id, command) { const parsedId = uuidSchema.safeParse(id); const parsed = securityIncidentCommandV1Schema.safeParse(command); return !parsedId.success || !parsed.success || parsed.data.action === 'open' ? failed() : mutation(deps, `/api/v1/review/security/incidents/${parsedId.data}/commands`, parsed.data, incidentMutationResponseSchema); },
    async setIndicatorDisclosure(id, command) { const parsedId = uuidSchema.safeParse(id); const parsed = securityIndicatorDisclosureCommandV1Schema.safeParse(command); return !parsedId.success || !parsed.success ? failed() : mutation(deps, `/api/v1/review/security/indicators/${parsedId.data}/disclosure`, parsed.data, disclosureResponseSchema); },
  };
}
function search(value: Record<string, unknown>): URLSearchParams { const result = new URLSearchParams(); for (const [key, item] of Object.entries(value)) if (item !== null) result.set(key, String(item)); return result; }
async function get<T>(deps: Dependencies, input: string, schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>) { return request(deps, input, {}, schema); }
async function mutation<T>(deps: Dependencies, input: string, body: unknown, schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>) { let idempotencyKey: string; try { idempotencyKey = deps.ids.generate(); } catch { return failed(); } if (!validKey(idempotencyKey)) return failed(); return request(deps, input, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }, schema); }
async function request<T>(deps: Dependencies, input: string, init: RequestInit, schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>): Promise<SecurityReviewApiSuccess<T> | SecurityReviewApiFailure> { let token: string | null; try { token = await deps.session.getAccessToken(); } catch { return signInRequired(); } if (token === null || !/^\S+$/u.test(token)) return signInRequired(); try { const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`); const response = await deps.fetch(input, { ...init, headers }); const payload: unknown = await response.json(); if (response.ok) { const parsed = schema.safeParse(payload); return parsed.success ? { ok: true, data: parsed.data.data, nextCursor: parsed.data.meta.nextCursor } : failed(); } const parsed = apiErrorSchema.safeParse(payload); return parsed.success ? mapError(response.status, parsed.data.error.code) : failed(); } catch { return failed(); } }
function mapError(status: number, code: string): SecurityReviewApiFailure { if (status === 401 && code === 'unauthorized') return signInRequired(); if (status === 403 && code === 'security_reviewer_required') return { ok: false, state: 'forbidden' }; if (status === 404 && ['security_candidate_not_found', 'security_incident_not_found', 'security_indicator_not_found'].includes(code)) return { ok: false, state: 'not_found' }; if (status === 409 && (code === 'security_version_conflict' || code === 'security_idempotency_conflict')) return { ok: false, state: 'conflict', code }; return failed(); }
function validKey(value: string): boolean { return value === value.trim() && Array.from(value).length >= 1 && Array.from(value).length <= 255; }
function signInRequired(): SecurityReviewApiFailure { return { ok: false, state: 'sign_in_required' }; }
function failed(): SecurityReviewApiFailure { return { ok: false, state: 'request_failed' }; }
