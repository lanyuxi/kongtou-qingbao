import { z } from 'zod';

export const appRoleSchema = z.enum([
  'user',
  'reviewer',
  'senior_reviewer',
  'security_reviewer',
  'admin',
]);
export type AppRole = z.infer<typeof appRoleSchema>;

export const projectLifecycleSchema = z.enum(['rumored', 'active', 'paused', 'ended', 'archived']);
export type ProjectLifecycle = z.infer<typeof projectLifecycleSchema>;

export const sourceTypeSchema = z.enum([
  'official_web',
  'official_social',
  'official_docs',
  'code_repository',
  'chain_explorer',
  'independent_research',
  'news',
  'community',
]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const sourceStatusSchema = z.enum(['active', 'degraded', 'suspended', 'retired']);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const signalVerificationSchema = z.enum([
  'unverified',
  'corroborated',
  'verified',
  'disputed',
  'retracted',
]);
export type SignalVerification = z.infer<typeof signalVerificationSchema>;

export const signalLifecycleSchema = z.enum([
  'detected',
  'normalized',
  'linked',
  'under_review',
  'published',
  'superseded',
  'expired',
  'rejected',
]);
export type SignalLifecycle = z.infer<typeof signalLifecycleSchema>;

export const riskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

// Derived cross-layer enum (not a database enum): where a promoted signal's
// source sits relative to the project's official relationships.
export const scoringProvenanceSchema = z.enum(['official', 'third_party', 'unknown']);
export type ScoringProvenance = z.infer<typeof scoringProvenanceSchema>;

export const recommendationSchema = z.enum(['act_now', 'watch', 'research', 'avoid', 'blocked']);
export type Recommendation = z.infer<typeof recommendationSchema>;

export const participationStatusSchema = z.enum([
  'interested',
  'researching',
  'participating',
  'paused',
  'completed',
  'abandoned',
]);
export type ParticipationStatus = z.infer<typeof participationStatusSchema>;

export const taskStatusSchema = z.enum([
  'backlog',
  'planned',
  'in_progress',
  'completed',
  'skipped',
  'blocked',
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
