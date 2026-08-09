import { z } from 'zod';

export const appRoleSchema = z.enum([
  'user',
  'reviewer',
  'senior_reviewer',
  'security_reviewer',
  'admin',
]);
export type AppRole = z.infer<typeof appRoleSchema>;

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
