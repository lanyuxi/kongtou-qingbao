import { describe, expect, it } from 'vitest';

import {
  ExecutionForbiddenFieldError,
  addWatchlistProjectCommandSchema,
  createTaskCommandSchema,
  createWatchlistCommandSchema,
  deleteTaskCommandSchema,
  deleteWatchlistCommandSchema,
  parseExecutionCommand,
  removeWatchlistProjectCommandSchema,
  renameWatchlistCommandSchema,
  setParticipationStatusCommandSchema,
  updateTaskCommandSchema,
} from '../execution/commands.js';
import {
  executionErrorCodeSchema,
  findForbiddenExecutionKeys,
  participationStatusSchema,
  taskPrioritySchema,
  taskStatusSchema,
  taskTitleSchema,
  watchlistNameSchema,
} from '../execution/enums.js';
import {
  userProjectParticipationRowSchema,
  userTaskRowSchema,
  watchlistProjectRowSchema,
  watchlistRowSchema,
} from '../execution/projections.js';
import {
  createTaskReceiptSchema,
  updateTaskReceiptSchema,
} from '../execution/receipts.js';

const taskId = '50000000-0000-4000-8000-000000000001';
const watchlistId = '50000000-0000-4000-8000-000000000002';
const projectId = '50000000-0000-4000-8000-000000000003';

const createTaskPayload = {
  idempotencyKey: 'task-create-1',
  expectedVersion: 1,
  projectId,
  title: '核对快照条件',
  status: 'backlog',
  priority: 'medium',
  dueAt: null,
};

const updateTaskPayload = {
  idempotencyKey: 'task-update-1',
  expectedVersion: 2,
  taskId,
  projectId: null,
  title: null,
  status: 'completed',
  priority: null,
  dueAt: null,
  completedAt: '2026-09-06T10:00:00.000Z',
};

describe('execution enums mirror the database exactly', () => {
  it('accepts only the six participation states already in the schema', () => {
    expect(participationStatusSchema.options).toEqual([
      'interested',
      'researching',
      'participating',
      'paused',
      'completed',
      'abandoned',
    ]);
  });

  it('accepts only the six task states already in the schema', () => {
    expect(taskStatusSchema.options).toEqual([
      'backlog',
      'planned',
      'in_progress',
      'completed',
      'skipped',
      'blocked',
    ]);
  });

  it('accepts only the four task priorities already in the schema', () => {
    expect(taskPrioritySchema.options).toEqual(['low', 'medium', 'high', 'urgent']);
  });

  it('rejects task states that were never adopted', () => {
    expect(taskStatusSchema.safeParse('archived').success).toBe(false);
    expect(taskStatusSchema.safeParse('cancelled').success).toBe(false);
    expect(taskPrioritySchema.safeParse('critical').success).toBe(false);
  });
});

describe('execution text boundaries', () => {
  it('trims a task title and enforces the 1..200 column limit', () => {
    expect(taskTitleSchema.parse('  核对快照条件  ')).toBe('核对快照条件');
    expect(taskTitleSchema.safeParse('').success).toBe(false);
    expect(taskTitleSchema.safeParse('   ').success).toBe(false);
    expect(taskTitleSchema.safeParse('a'.repeat(200)).success).toBe(true);
    expect(taskTitleSchema.safeParse('a'.repeat(201)).success).toBe(false);
  });

  it('trims a watchlist name and enforces the 1..80 column limit', () => {
    expect(watchlistNameSchema.parse('  重点关注  ')).toBe('重点关注');
    expect(watchlistNameSchema.safeParse('').success).toBe(false);
    expect(watchlistNameSchema.safeParse('a'.repeat(80)).success).toBe(true);
    expect(watchlistNameSchema.safeParse('a'.repeat(81)).success).toBe(false);
  });

  it('rejects control characters in both text fields', () => {
    expect(taskTitleSchema.safeParse('title\u0000with').success).toBe(false);
    expect(watchlistNameSchema.safeParse('name\u007fwith').success).toBe(false);
  });
});

describe('completion stays self-consistent', () => {
  it('requires completedAt exactly when status is completed', () => {
    expect(
      updateTaskCommandSchema.safeParse({ ...updateTaskPayload, completedAt: null }).success,
    ).toBe(false);
    expect(updateTaskCommandSchema.safeParse(updateTaskPayload).success).toBe(true);
  });

  it('rejects completed_at on a task that is not completed', () => {
    expect(updateTaskCommandSchema.safeParse({
      ...updateTaskPayload,
      status: 'in_progress',
      completedAt: '2026-09-06T10:00:00.000Z',
    }).success).toBe(false);
  });

  it('accepts a non-completed update that leaves completedAt null', () => {
    expect(updateTaskCommandSchema.safeParse({
      ...updateTaskPayload,
      status: 'in_progress',
      completedAt: null,
    }).success).toBe(true);
  });

  it('accepts an update that leaves the status unchanged', () => {
    expect(updateTaskCommandSchema.safeParse({
      ...updateTaskPayload,
      status: null,
      completedAt: null,
      priority: 'urgent',
    }).success).toBe(true);
  });

  it('rejects an update where every patch field is null', () => {
    expect(updateTaskCommandSchema.safeParse({
      ...updateTaskPayload,
      projectId: null,
      title: null,
      status: null,
      priority: null,
      dueAt: null,
      completedAt: null,
    }).success).toBe(false);
  });
});

describe('execution commands are strict and complete', () => {
  it.each([
    ['createTask', createTaskCommandSchema, createTaskPayload],
    ['updateTask', updateTaskCommandSchema, updateTaskPayload],
    ['deleteTask', deleteTaskCommandSchema, {
      idempotencyKey: 'task-delete-1', expectedVersion: 3, taskId,
    }],
    ['createWatchlist', createWatchlistCommandSchema, {
      idempotencyKey: 'watchlist-create-1', expectedVersion: 1, name: '重点关注',
    }],
    ['renameWatchlist', renameWatchlistCommandSchema, {
      idempotencyKey: 'watchlist-rename-1', expectedVersion: 2, watchlistId, name: '长期观察',
    }],
    ['deleteWatchlist', deleteWatchlistCommandSchema, {
      idempotencyKey: 'watchlist-delete-1', expectedVersion: 3, watchlistId,
    }],
    ['addWatchlistProject', addWatchlistProjectCommandSchema, {
      idempotencyKey: 'watchlist-add-1', expectedVersion: 2, watchlistId, projectId,
    }],
    ['removeWatchlistProject', removeWatchlistProjectCommandSchema, {
      idempotencyKey: 'watchlist-remove-1', expectedVersion: 2, watchlistId, projectId,
    }],
    ['setParticipationStatus', setParticipationStatusCommandSchema, {
      idempotencyKey: 'participation-1', expectedVersion: 1, projectId,
      participationStatus: 'participating', notes: null,
    }],
  ])('%s rejects an unknown extra field', (_name, schema, payload) => {
    expect(schema.safeParse({ ...(payload as object), unexpected: 'x' }).success).toBe(false);
    expect(schema.safeParse(payload).success).toBe(true);
  });

  it.each([
    ['createTask', createTaskCommandSchema, createTaskPayload],
    ['updateTask', updateTaskCommandSchema, updateTaskPayload],
  ])('%s requires an idempotency key and a positive version', (_name, schema, payload) => {
    const withoutKey: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
    delete withoutKey.idempotencyKey;
    expect(schema.safeParse(withoutKey).success).toBe(false);
    expect(schema.safeParse({ ...(payload as object), idempotencyKey: 'short' }).success).toBe(false);
    expect(schema.safeParse({ ...(payload as object), expectedVersion: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...(payload as object), expectedVersion: 1.5 }).success).toBe(false);
  });
});

describe('execution commands refuse secret-like fields', () => {
  it.each([
    ['privateKey', '0xdeadbeef'],
    ['mnemonic', 'word word word'],
    ['seedPhrase', 'word word word'],
    ['keystore', '{"crypto":{}}'],
    ['secret', 'x'],
    ['passphrase', 'correct horse'],
    ['recovery_phrase', 'a b c'],
    ['wallet_password', 'hunter2'],
  ])('refuses a command carrying %s instead of silently dropping it', (field, value) => {
    const hostile = { ...createTaskPayload, [field]: value };
    expect(() => parseExecutionCommand(createTaskCommandSchema, hostile)).toThrow(
      ExecutionForbiddenFieldError,
    );
    expect(findForbiddenExecutionKeys(hostile)).toContain(field);
  });

  it('leaves a clean payload untouched', () => {
    expect(parseExecutionCommand(createTaskCommandSchema, createTaskPayload))
      .toEqual(createTaskPayload);
  });

  it('reports every offending field at once', () => {
    expect([...findForbiddenExecutionKeys({
      title: 'ok',
      mnemonic: 'a',
      privateKey: 'b',
    })].sort()).toEqual(['mnemonic', 'privateKey']);
  });

  it('ignores non-object payloads', () => {
    expect(findForbiddenExecutionKeys(null)).toEqual([]);
    expect(findForbiddenExecutionKeys([{ mnemonic: 'a' }])).toEqual([]);
  });
});

describe('execution projections stay closed', () => {
  const taskRow = {
    taskId,
    userId: '50000000-0000-4000-8000-000000000004',
    projectId,
    title: '核对快照条件',
    status: 'in_progress',
    priority: 'high',
    dueAt: null,
    completedAt: null,
    version: 3,
    createdAt: '2026-09-06T09:00:00.000Z',
    updatedAt: '2026-09-06T09:30:00.000Z',
  };

  it('accepts a well-formed task row', () => {
    expect(userTaskRowSchema.parse(taskRow)).toEqual(taskRow);
  });

  it.each([
    ['extra field', { ...taskRow, unexpected: 'x' }],
    ['missing version', { ...taskRow, version: undefined }],
    ['zero version', { ...taskRow, version: 0 }],
    ['unknown status', { ...taskRow, status: 'archived' }],
    ['completed without completedAt', {
      ...taskRow, status: 'completed', completedAt: null,
    }],
  ])('rejects a task row with %s', (_name, row) => {
    expect(userTaskRowSchema.safeParse(row).success).toBe(false);
  });

  it('carries a project count on a watchlist row and nothing else', () => {
    const row = {
      watchlistId,
      name: '重点关注',
      isDefault: true,
      projectCount: 2,
      version: 1,
      createdAt: '2026-09-06T09:00:00.000Z',
      updatedAt: '2026-09-06T09:00:00.000Z',
    };
    expect(watchlistRowSchema.parse(row)).toEqual(row);
    expect(watchlistRowSchema.safeParse({ ...row, ownerEmail: 'a@b.test' }).success).toBe(false);
  });

  it('keeps watchlist membership to the pair itself', () => {
    const row = {
      watchlistId,
      projectId,
      addedAt: '2026-09-06T09:00:00.000Z',
    };
    expect(watchlistProjectRowSchema.parse(row)).toEqual(row);
    expect(watchlistProjectRowSchema.safeParse({ ...row, notes: 'x' }).success).toBe(false);
  });

  it('carries the optimistic-lock version on a participation row', () => {
    const row = {
      projectId,
      participationStatus: 'participating',
      notes: null,
      startedAt: '2026-09-06T09:00:00.000Z',
      updatedAt: '2026-09-06T09:00:00.000Z',
      version: 1,
    };
    expect(userProjectParticipationRowSchema.parse(row)).toEqual(row);
    expect(userProjectParticipationRowSchema.safeParse({ ...row, version: 0 }).success).toBe(false);
    expect(userProjectParticipationRowSchema.safeParse({ ...row, ownerEmail: 'a@b.test' }).success)
      .toBe(false);
  });
});

describe('execution receipts', () => {
  it('reports the resulting version and replay status', () => {
    const receipt = {
      version: 1 as const,
      commandId: '50000000-0000-4000-8000-000000000005',
      replayed: false,
      taskId,
      taskVersion: 2,
    };
    expect(createTaskReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(updateTaskReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(createTaskReceiptSchema.safeParse({ ...receipt, taskVersion: 0 }).success).toBe(false);
  });
});

describe('execution error codes', () => {
  it('exposes the full stable EX2xx set', () => {
    expect(executionErrorCodeSchema.options).toEqual([
      'execution_session_required',
      'execution_task_not_found',
      'execution_watchlist_not_found',
      'execution_project_not_found',
      'execution_task_limit_reached',
      'execution_watchlist_limit_reached',
      'execution_watchlist_project_limit_reached',
      'execution_name_conflict',
      'execution_version_conflict',
      'execution_idempotency_conflict',
      'execution_command_invalid',
      'execution_query_failed',
      'execution_persistence_failed',
    ]);
  });
});
