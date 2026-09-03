import { describe, expect, it } from 'vitest';

import {
  IdentityForbiddenFieldError,
  addWalletAddressCommandSchema,
  parseIdentityCommand,
  removeWalletAddressCommandSchema,
  setWalletAddressVisibilityCommandSchema,
  updateProfileCommandSchema,
} from '../identity/commands.js';
import {
  findForbiddenIdentityKeys,
  walletAddressSchema,
  walletVisibilitySchema,
} from '../identity/enums.js';
import {
  publicIdentityProfileSchema,
  publicWalletAddressSchema,
  userProfileRowSchema,
  walletAddressRowSchema,
} from '../identity/projections.js';

const walletAddressId = '40000000-0000-4000-8000-000000000001';
const address = '0x1234567890abcdef1234567890abcdef12345678';

const updateProfilePayload = {
  idempotencyKey: 'profile-update-1',
  expectedVersion: 3,
  displayName: '羽希',
  avatarUrl: 'https://cdn.example.test/avatar.png',
  timezone: 'Asia/Shanghai',
};

const addWalletPayload = {
  idempotencyKey: 'wallet-add-1',
  expectedVersion: 1,
  chain: 'evm',
  address,
  label: '主地址',
  visibility: 'hidden',
};

describe('identity address validation (D3)', () => {
  it('accepts a well-formed EVM address', () => {
    expect(walletAddressSchema.parse(address)).toBe(address);
  });

  it.each([
    ['no 0x prefix', '1234567890abcdef1234567890abcdef12345678'],
    ['too short', '0x1234567890abcdef'],
    ['too long', `0x${'a'.repeat(41)}`],
    ['non-hex characters', '0xzzzz567890abcdef1234567890abcdef12345678'],
  ])('rejects %s', (_name, value) => {
    expect(walletAddressSchema.safeParse(value).success).toBe(false);
  });

  it('has no default visibility: the command must state it', () => {
    const { visibility, ...withoutVisibility } = addWalletPayload;
    expect(addWalletAddressCommandSchema.safeParse(withoutVisibility).success).toBe(false);
    expect(walletVisibilitySchema.parse(visibility)).toBe('hidden');
  });
});

describe('identity commands', () => {
  it('accepts a strict update-profile command', () => {
    expect(() => updateProfileCommandSchema.parse(updateProfilePayload)).not.toThrow();
  });

  it('accepts a strict add-wallet command', () => {
    expect(() => addWalletAddressCommandSchema.parse(addWalletPayload)).not.toThrow();
  });

  it('rejects unknown fields instead of ignoring them', () => {
    const hostile = { ...addWalletPayload, role: 'admin' };
    expect(addWalletAddressCommandSchema.safeParse(hostile).success).toBe(false);
  });

  it('rejects a command without an idempotency key or version', () => {
    const addressFields = {
      chain: 'evm' as const,
      address,
      label: '主地址',
      visibility: 'hidden' as const,
    };
    expect(
      addWalletAddressCommandSchema.safeParse({
        idempotencyKey: 'wallet-add-1',
        ...addressFields,
      }).success,
    ).toBe(false);
    expect(
      addWalletAddressCommandSchema.safeParse({ expectedVersion: 1, ...addressFields }).success,
    ).toBe(false);
  });

  it.each([
    ['privateKey', '0xdeadbeef'],
    ['mnemonic', 'word word word'],
    ['seedPhrase', 'word word word'],
    ['keystore', '{"crypto":{}}'],
    ['secret', 'x'],
    ['passphrase', 'correct horse'],
    ['recovery_phrase', 'a b c'],
  ])('refuses a command carrying %s instead of silently dropping it', (field, value) => {
    const hostile = { ...addWalletPayload, [field]: value };
    expect(() => parseIdentityCommand(addWalletAddressCommandSchema, hostile)).toThrow(
      IdentityForbiddenFieldError,
    );
    expect(findForbiddenIdentityKeys(hostile)).toContain(field);
  });

  it('leaves a clean payload untouched', () => {
    const parsed = parseIdentityCommand(addWalletAddressCommandSchema, addWalletPayload);
    expect(parsed).toEqual(addWalletPayload);
  });

  it('requires a uuid target for visibility and removal commands', () => {
    expect(
      setWalletAddressVisibilityCommandSchema.safeParse({
        idempotencyKey: 'wallet-visibility-1',
        expectedVersion: 3,
        walletAddressId,
        visibility: 'public',
      }).success,
    ).toBe(true);
    expect(
      removeWalletAddressCommandSchema.safeParse({
        idempotencyKey: 'wallet-remove-1',
        expectedVersion: 2,
        walletAddressId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });
});

describe('identity projections', () => {
  const walletRow = {
    walletAddressId,
    chain: 'evm',
    address,
    label: '主地址',
    visibility: 'hidden',
    version: 2,
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  };

  it('accepts complete private rows', () => {
    expect(() => walletAddressRowSchema.parse(walletRow)).not.toThrow();
    expect(() =>
      userProfileRowSchema.parse({
        userId: '40000000-0000-4000-8000-000000000002',
        displayName: '羽希',
        avatarUrl: null,
        timezone: 'Asia/Shanghai',
        version: 4,
        updatedAt: '2026-09-03T00:00:00.000Z',
      }),
    ).not.toThrow();
  });

  it('rejects an unexpected field in a row', () => {
    expect(walletAddressRowSchema.safeParse({ ...walletRow, email: 'a@b.test' }).success).toBe(false);
  });

  it('keeps the public projection to display name, avatar and published addresses only', () => {
    const parsed = publicIdentityProfileSchema.parse({
      userId: '40000000-0000-4000-8000-000000000002',
      displayName: '羽希',
      avatarUrl: null,
    });
    expect(Object.keys(parsed)).toEqual(['userId', 'displayName', 'avatarUrl']);
    expect(
      publicIdentityProfileSchema.safeParse({
        userId: '40000000-0000-4000-8000-000000000002',
        displayName: '羽希',
        avatarUrl: null,
        timezone: 'Asia/Shanghai',
      }).success,
    ).toBe(false);
    expect(() =>
      publicWalletAddressSchema.parse({
        walletAddressId: walletRow.walletAddressId,
        chain: walletRow.chain,
        address: walletRow.address,
        label: walletRow.label,
      }),
    ).not.toThrow();
    // The private row itself must not satisfy the public schema: visibility,
    // version and timestamps stay out of anything anonymous readers see.
    expect(publicWalletAddressSchema.safeParse(walletRow).success).toBe(false);
  });
});
