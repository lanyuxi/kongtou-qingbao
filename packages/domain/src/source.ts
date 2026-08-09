import { z } from 'zod';

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
