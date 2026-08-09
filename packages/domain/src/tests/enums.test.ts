import { describe, expect, it } from 'vitest';

import * as contractEnums from '@airdrop/contracts';
import * as domainEnums from '../index.js';

const enumSchemaExports = [
  'appRoleSchema',
  'projectLifecycleSchema',
  'sourceTypeSchema',
  'sourceStatusSchema',
  'signalVerificationSchema',
  'signalLifecycleSchema',
  'riskLevelSchema',
  'recommendationSchema',
  'participationStatusSchema',
  'taskStatusSchema',
  'taskPrioritySchema',
] as const;

describe('domain enum compatibility exports', () => {
  it.each(enumSchemaExports)('re-exports the canonical %s instance', (exportName) => {
    expect(domainEnums[exportName]).toBe(contractEnums[exportName]);
  });
});
