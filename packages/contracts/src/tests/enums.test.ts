import { describe, expect, it } from 'vitest';

import {
  appRoleSchema,
  participationStatusSchema,
  projectLifecycleSchema,
  recommendationSchema,
  riskLevelSchema,
  signalLifecycleSchema,
  signalVerificationSchema,
  sourceStatusSchema,
  sourceTypeSchema,
  taskPrioritySchema,
  taskStatusSchema,
} from '../index.js';

describe('enum contracts', () => {
  it.each([
    [
      'app_role',
      appRoleSchema,
      ['user', 'reviewer', 'senior_reviewer', 'security_reviewer', 'admin'],
    ],
    [
      'project_lifecycle',
      projectLifecycleSchema,
      ['rumored', 'active', 'paused', 'ended', 'archived'],
    ],
    [
      'source_type',
      sourceTypeSchema,
      [
        'official_web',
        'official_social',
        'official_docs',
        'code_repository',
        'chain_explorer',
        'independent_research',
        'news',
        'community',
      ],
    ],
    ['source_status', sourceStatusSchema, ['active', 'degraded', 'suspended', 'retired']],
    [
      'signal_verification',
      signalVerificationSchema,
      ['unverified', 'corroborated', 'verified', 'disputed', 'retracted'],
    ],
    [
      'signal_lifecycle',
      signalLifecycleSchema,
      [
        'detected',
        'normalized',
        'linked',
        'under_review',
        'published',
        'superseded',
        'expired',
        'rejected',
      ],
    ],
    ['risk_level', riskLevelSchema, ['low', 'medium', 'high', 'critical']],
    ['recommendation', recommendationSchema, ['act_now', 'watch', 'research', 'avoid', 'blocked']],
    [
      'participation_status',
      participationStatusSchema,
      ['interested', 'researching', 'participating', 'paused', 'completed', 'abandoned'],
    ],
    [
      'task_status',
      taskStatusSchema,
      ['backlog', 'planned', 'in_progress', 'completed', 'skipped', 'blocked'],
    ],
    ['task_priority', taskPrioritySchema, ['low', 'medium', 'high', 'urgent']],
  ])('%s accepts only its ordered contract values', (_name, schema, expectedValues) => {
    expect(schema.options).toEqual(expectedValues);

    for (const value of expectedValues) {
      expect(schema.parse(value)).toBe(value);
    }

    expect(schema.safeParse('not_a_contract_value').success).toBe(false);
  });
});
