import { z } from 'zod';

declare const projectIdBrand: unique symbol;
declare const signalIdBrand: unique symbol;
declare const evidenceIdBrand: unique symbol;
declare const userIdBrand: unique symbol;
declare const sourceIdBrand: unique symbol;
declare const collectionAttemptIdBrand: unique symbol;
declare const rawItemIdBrand: unique symbol;
declare const discoveredItemIdBrand: unique symbol;

export type ProjectId = string & { readonly [projectIdBrand]: 'ProjectId' };
export type SignalId = string & { readonly [signalIdBrand]: 'SignalId' };
export type EvidenceId = string & { readonly [evidenceIdBrand]: 'EvidenceId' };
export type UserId = string & { readonly [userIdBrand]: 'UserId' };
export type SourceId = string & { readonly [sourceIdBrand]: 'SourceId' };
export type CollectionAttemptId = string & {
  readonly [collectionAttemptIdBrand]: 'CollectionAttemptId';
};
export type RawItemId = string & { readonly [rawItemIdBrand]: 'RawItemId' };
export type DiscoveredItemId = string & { readonly [discoveredItemIdBrand]: 'DiscoveredItemId' };

const uuidSchema = z.string().uuid();

export const parseProjectId = (value: unknown): ProjectId => uuidSchema.parse(value) as ProjectId;
export const parseSignalId = (value: unknown): SignalId => uuidSchema.parse(value) as SignalId;
export const parseEvidenceId = (value: unknown): EvidenceId => uuidSchema.parse(value) as EvidenceId;
export const parseUserId = (value: unknown): UserId => uuidSchema.parse(value) as UserId;
export const parseSourceId = (value: unknown): SourceId => uuidSchema.parse(value) as SourceId;
export const parseCollectionAttemptId = (value: unknown): CollectionAttemptId =>
  uuidSchema.parse(value) as CollectionAttemptId;
export const parseRawItemId = (value: unknown): RawItemId => uuidSchema.parse(value) as RawItemId;
export const parseDiscoveredItemId = (value: unknown): DiscoveredItemId =>
  uuidSchema.parse(value) as DiscoveredItemId;
