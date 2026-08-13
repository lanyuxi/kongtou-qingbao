import { describe, expect, it } from 'vitest';

import {
  createSourceScheduleCommandHandler,
  type AuthenticatedUserVerifier,
} from '../lib/source-schedule-command-handler.js';
import type {
  ExecuteScheduleCommandInput,
  ScheduleCommandRepository,
} from '@airdrop/database/schedule-admin';

const actorId = '70000000-0000-4000-8000-000000000001';
const scheduleId = '70000000-0000-4000-8000-000000000002';
const requestId = '70000000-0000-4000-8000-000000000004';

describe('POST /api/v1/admin/source-collection-schedules/:scheduleId', () => {
  it.each([
    ['missing', null],
    ['malformed', 'Basic local-test-token'],
    ['blank bearer', 'Bearer '],
  ])('returns 401 for a %s bearer authorization header', async (_caseName, authorization) => {
    const response = await invoke(handler(null), request({ authorization }));

    await expectError(response, 401, 'unauthorized');
  });

  it('returns 401 when the bearer token does not resolve to a user', async () => {
    const response = await invoke(handler(null), request());

    await expectError(response, 401, 'unauthorized');
  });

  it.each([
    ['missing', null],
    ['blank', '   '],
    ['overlong', 'a'.repeat(256)],
  ])('returns 400 for a %s Idempotency-Key', async (_caseName, idempotencyKey) => {
    const response = await invoke(handler({ userId: actorId }), request({ idempotencyKey }));

    await expectError(response, 400, 'invalid_request');
  });

  it.each([
    ['invalid route UUID', 'not-a-uuid', pauseBody()],
    ['unknown body field', scheduleId, { ...pauseBody(), ignored: true }],
    ['invalid command body', scheduleId, { ...pauseBody(), expectedVersion: -1 }],
  ])('returns 400 for %s', async (_caseName, requestedScheduleId, body) => {
    const response = await invoke(
      handler({ userId: actorId }),
      request({ requestedScheduleId, body }),
      requestedScheduleId,
    );

    await expectError(response, 400, 'invalid_request');
  });

  it.each([
    ['admin_required', 403],
    ['schedule_not_found', 404],
    ['schedule_version_conflict', 409],
    ['idempotency_conflict', 409],
  ])('maps repository %s to HTTP %s without leaking credentials', async (code, status) => {
    const response = await invoke(handler({ userId: actorId }, new RejectingRepository(code)), request());

    const body = await response.json() as { error: { code: string; message: string } };
    expect(response.status).toBe(status);
    expect(body.error.code).toBe(code);
    expect(JSON.stringify(body)).not.toMatch(/local-test-token|password|postgres|database/i);
  });

  it('returns the shared success envelope with a generated request ID', async () => {
    const schedules = new RecordingRepository();
    const response = await invoke(handler({ userId: actorId }, schedules), request());
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      data: {
        scheduleId,
        command: 'pause',
        scheduleVersion: 5,
        enabled: false,
        intervalSeconds: 1800,
        nextRunAt: '2026-08-14T00:00:00.000Z',
        jobId: null,
        replayed: false,
      },
      meta: { requestId, nextCursor: null },
    });
    expect(schedules.inputs).toEqual([{
      actorId,
      scheduleId,
      idempotencyKey: 'pause-schedule-1',
      command: pauseBody(),
    }]);
  });
});

function handler(
  user: { userId: string } | null,
  schedules: ScheduleCommandRepository = new RecordingRepository(),
) {
  return createSourceScheduleCommandHandler({
    auth: new StaticAuth(user),
    schedules,
    ids: { generate: () => requestId },
  });
}

function invoke(
  commandHandler: ReturnType<typeof createSourceScheduleCommandHandler>,
  commandRequest: Request,
  requestedScheduleId = scheduleId,
) {
  return commandHandler(commandRequest, { params: Promise.resolve({ scheduleId: requestedScheduleId }) });
}

function request(options: {
  authorization?: string | null;
  idempotencyKey?: string | null;
  requestedScheduleId?: string;
  body?: unknown;
} = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (options.authorization === undefined) headers.set('authorization', 'Bearer local-test-token');
  else if (options.authorization !== null) headers.set('authorization', options.authorization);
  if (options.idempotencyKey === undefined) headers.set('idempotency-key', 'pause-schedule-1');
  else if (options.idempotencyKey !== null) headers.set('idempotency-key', options.idempotencyKey);
  const requestedScheduleId = options.requestedScheduleId ?? scheduleId;
  return new Request(`http://localhost/api/v1/admin/source-collection-schedules/${requestedScheduleId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options.body ?? pauseBody()),
  });
}

async function expectError(response: Response, status: number, code: string): Promise<void> {
  const body = await response.json() as { ok: boolean; error: { code: string; requestId: string } };
  expect(response.status).toBe(status);
  expect(body).toMatchObject({ ok: false, error: { code, requestId } });
}

class StaticAuth implements AuthenticatedUserVerifier {
  constructor(private readonly user: { userId: string } | null) {}

  async verifyAuthorizationHeader(): Promise<{ userId: string } | null> {
    return this.user;
  }
}

class RecordingRepository implements ScheduleCommandRepository {
  readonly inputs: ExecuteScheduleCommandInput[] = [];

  async execute(input: ExecuteScheduleCommandInput) {
    this.inputs.push(input);
    return {
      scheduleId,
      command: 'pause' as const,
      scheduleVersion: 5,
      enabled: false,
      intervalSeconds: 1800,
      nextRunAt: '2026-08-14T00:00:00.000Z',
      jobId: null,
      replayed: false,
    };
  }
}

class RejectingRepository implements ScheduleCommandRepository {
  constructor(private readonly code: string) {}

  async execute(): Promise<never> {
    throw { code: this.code, database: 'postgres://password' };
  }
}

function pauseBody() {
  return {
    version: 1 as const,
    command: 'pause' as const,
    expectedVersion: 4,
    intervalSeconds: null,
  };
}
