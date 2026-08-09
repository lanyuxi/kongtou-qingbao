import { z } from 'zod';

declare const projectIdBrand: unique symbol;
declare const signalIdBrand: unique symbol;
declare const evidenceIdBrand: unique symbol;
declare const userIdBrand: unique symbol;

export type ProjectId = string & { readonly [projectIdBrand]: 'ProjectId' };
export type SignalId = string & { readonly [signalIdBrand]: 'SignalId' };
export type EvidenceId = string & { readonly [evidenceIdBrand]: 'EvidenceId' };
export type UserId = string & { readonly [userIdBrand]: 'UserId' };

const uuidSchema = z.string().uuid();

export const parseProjectId = (value: unknown): ProjectId => uuidSchema.parse(value) as ProjectId;
export const parseSignalId = (value: unknown): SignalId => uuidSchema.parse(value) as SignalId;
export const parseEvidenceId = (value: unknown): EvidenceId => uuidSchema.parse(value) as EvidenceId;
export const parseUserId = (value: unknown): UserId => uuidSchema.parse(value) as UserId;
