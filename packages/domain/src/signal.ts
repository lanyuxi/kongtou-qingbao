import { z } from 'zod';

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
