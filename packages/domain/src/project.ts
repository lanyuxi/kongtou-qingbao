import { z } from 'zod';

export const projectLifecycleSchema = z.enum(['rumored', 'active', 'paused', 'ended', 'archived']);
export type ProjectLifecycle = z.infer<typeof projectLifecycleSchema>;

export const recommendationSchema = z.enum(['act_now', 'watch', 'research', 'avoid', 'blocked']);
export type Recommendation = z.infer<typeof recommendationSchema>;
