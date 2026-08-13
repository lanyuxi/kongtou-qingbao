import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  createScheduleCommandRepositoryFromClient,
  ScheduleCommandPersistenceError,
  type ScheduleCommandFunctionCall,
  type ScheduleCommandFunctionClient,
  type ScheduleCommandFunctionTransaction,
} from '../queue/schedule-command-repository.js';

const actorId = '60000000-0000-4000-8000-000000000001';
const scheduleId = '60000000-0000-4000-8000-000000000002';

describe('ScheduleCommandRepository', () => {
  it('forwards an exact canonical payload hash with actor, schedule, and idempotency identity', async () => {
    const client = new RecordingClient([[
      resultRow(),
    ]]);
    const repository = createScheduleCommandRepositoryFromClient(client);

    await expect(repository.execute(commandInput())).resolves.toEqual({
      scheduleId,
      command: 'pause',
      scheduleVersion: 5,
      enabled: false,
      intervalSeconds: 1800,
      nextRunAt: '2026-08-14T00:00:00.000Z',
      jobId: null,
      replayed: false,
    });
    expect(client.calls).toEqual([{
      functionName: 'execute_source_schedule_command',
      args: {
        p_actor_id: actorId,
        p_schedule_id: scheduleId,
        p_command_payload: '{"command": "pause", "version": 1, "expectedVersion": 4, "intervalSeconds": null}',
        p_idempotency_key: 'pause-schedule-1',
        p_input_hash: '12df80f46c32a61034b6fe93e2b5517ec27b279d560bf78b9abda1a9bab9efcf',
      },
    }]);
    expect(client.roleAssumptions).toBe(1);
  });

  it.each([
    ['resume', null, '{"command": "resume", "version": 1, "expectedVersion": 4, "intervalSeconds": null}', 'd3e33376988bd005ccd71ff2039ca1e0199132e1e2e938808738890d4a509312'],
    ['change_interval', 300, '{"command": "change_interval", "version": 1, "expectedVersion": 4, "intervalSeconds": 300}', '2a56cc11f9830701365844944ca313db9296fa1330d2140204a4eecf0ce4cb31'],
    ['collect_now', null, '{"command": "collect_now", "version": 1, "expectedVersion": 4, "intervalSeconds": null}', 'f4dabfa473b2cb6d75184be082e177e9ccf4402f7204ed4963b8cdb43c50866f'],
  ] as const)('uses PostgreSQL JSONB canonical text for %s', async (command, intervalSeconds, payload, inputHash) => {
    const client = new RecordingClient([[resultRow({ command })]]);

    await createScheduleCommandRepositoryFromClient(client).execute({
      ...commandInput(),
      command: command === 'change_interval'
        ? { version: 1, command, expectedVersion: 4, intervalSeconds: intervalSeconds ?? 300 }
        : { version: 1, command, expectedVersion: 4, intervalSeconds: null },
    });

    expect(client.calls[0]?.args.p_command_payload).toBe(payload);
    expect(client.calls[0]?.args.p_input_hash).toBe(inputHash);
  });

  it('keeps canonical payload text for hashing while handing the adapter a JSON object payload', () => {
    const payload = '{"command": "pause", "version": 1, "expectedVersion": 4, "intervalSeconds": null}';

    expect(JSON.parse(payload)).toEqual({
      command: 'pause',
      version: 1,
      expectedVersion: 4,
      intervalSeconds: null,
    });
  });

  it('maps the postgres.js bigint and timestamp wire values returned by the protected function', async () => {
    const repository = createScheduleCommandRepositoryFromClient(new RecordingClient([[
      {
        ...resultRow(),
        schedule_version: '5',
        next_run_at: new Date('2026-08-14T00:00:00.000Z'),
      },
    ]]));

    await expect(repository.execute(commandInput())).resolves.toMatchObject({
      scheduleVersion: 5,
      nextRunAt: '2026-08-14T00:00:00.000Z',
    });
  });

  it.each([
    ['fractional bigint', { schedule_version: '5.1' }],
    ['exponent bigint', { schedule_version: '5e0' }],
    ['whitespace bigint', { schedule_version: ' 5' }],
    ['unsafe bigint', { schedule_version: '9007199254740992' }],
    ['negative bigint', { schedule_version: '-1' }],
    ['zero bigint', { schedule_version: '0' }],
    ['invalid date', { next_run_at: new Date('not-a-date') }],
  ])('rejects a %s protected-function wire result', async (_caseName, override) => {
    const repository = createScheduleCommandRepositoryFromClient(new RecordingClient([[
      { ...resultRow(), ...override },
    ]]));

    await expect(repository.execute(commandInput())).rejects.toBeInstanceOf(ScheduleCommandPersistenceError);
  });

  it.each([
    ['AQ101', 'schedule_version_conflict'],
    ['AQ102', 'idempotency_conflict'],
    ['AQ103', 'schedule_not_found'],
    ['AQ104', 'admin_required'],
  ])('maps protected command SQLSTATE %s to the stable code without trusting its message', async (sqlState, code) => {
    const client = new RecordingClient([], Object.assign(new Error('untrusted changed wording'), { code: sqlState }));

    await expect(createScheduleCommandRepositoryFromClient(client).execute(commandInput()))
      .rejects.toMatchObject({ code });
  });

  it('does not map a generic P0001 merely because its message resembles a command error', async () => {
    const client = new RecordingClient([], Object.assign(
      new Error('schedule_version_conflict'),
      { code: 'P0001' },
    ));

    await expect(createScheduleCommandRepositoryFromClient(client).execute(commandInput()))
      .rejects.toBeInstanceOf(ScheduleCommandPersistenceError);
  });

  it('conceals unexpected SQL failures behind the persistence code', async () => {
    const client = new RecordingClient([], Object.assign(
      new Error('password=not-for-output select internal_table'),
      { code: 'XX000' },
    ));

    const error = await createScheduleCommandRepositoryFromClient(client)
      .execute(commandInput())
      .catch((cause: unknown) => cause);

    expect(error).toEqual(new ScheduleCommandPersistenceError());
    expect(String(error)).not.toMatch(/password|select|internal_table/i);
  });

  it('rejects the schedule admin package export under browser module resolution', () => {
    const result = spawnSync(
      process.execPath,
      ['--conditions=browser', '--import=tsx', '--eval', "import('@airdrop/database/schedule-admin')"],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '@airdrop/database/schedule-admin is unavailable in browser code.',
    );
    expect(result.stderr).not.toMatch(/postgres(?:\.js)?/i);
  });
});

class RecordingClient implements ScheduleCommandFunctionClient {
  readonly calls: ScheduleCommandFunctionCall[] = [];
  roleAssumptions = 0;

  constructor(
    private readonly responses: unknown[] = [],
    private readonly error?: Error,
  ) {}

  async transaction<T>(work: (transaction: ScheduleCommandFunctionTransaction) => Promise<T>): Promise<T> {
    this.roleAssumptions += 1;
    if (this.error !== undefined) throw this.error;
    return work({
      invoke: async (call) => {
        this.calls.push(call);
        return this.responses.shift();
      },
    });
  }
}

function commandInput() {
  return {
    actorId,
    scheduleId,
    idempotencyKey: 'pause-schedule-1',
    command: {
      version: 1 as const,
      command: 'pause' as const,
      expectedVersion: 4,
      intervalSeconds: null,
    },
  };
}

function resultRow(overrides: { command?: string } = {}) {
  return {
    schedule_id: scheduleId,
    command: overrides.command ?? 'pause',
    schedule_version: 5,
    enabled: false,
    interval_seconds: 1800,
    next_run_at: '2026-08-14T00:00:00.000Z',
    job_id: null,
    replayed: false,
  };
}
