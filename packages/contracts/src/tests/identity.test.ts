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
  accountPasswordSchema,
  findForbiddenIdentityKeys,
  identityErrorCodeSchema,
  loginPhoneSchema,
  walletAddressSchema,
  walletVisibilitySchema,
} from '../identity/enums.js';
import {
  publicIdentityProfileSchema,
  publicWalletAddressSchema,
  userProfileRowSchema,
  walletAddressRowSchema,
} from '../identity/projections.js';
import {
  addWalletAddressReceiptSchema,
  removeWalletAddressReceiptSchema,
  setWalletAddressVisibilityReceiptSchema,
  updateProfileReceiptSchema,
} from '../identity/receipts.js';

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

describe('identity repository receipts and errors', () => {
  const commandId = '40000000-0000-4000-8000-000000000099';
  const profileId = '40000000-0000-4000-8000-000000000002';

  it('accepts only the frozen strict command receipt shapes', () => {
    expect(
      updateProfileReceiptSchema.parse({
        version: 1,
        commandId,
        profileId,
        profileVersion: 2,
        replayed: false,
      }),
    ).toMatchObject({ commandId, profileId, replayed: false });
    expect(
      addWalletAddressReceiptSchema.parse({
        version: 1,
        commandId,
        walletAddressId,
        walletAddressVersion: 1,
        profileVersion: 3,
        replayed: true,
      }),
    ).toMatchObject({ walletAddressId, profileVersion: 3, replayed: true });
    expect(
      setWalletAddressVisibilityReceiptSchema.parse({
        version: 1,
        commandId,
        walletAddressId,
        walletAddressVersion: 2,
        replayed: false,
      }),
    ).toMatchObject({ walletAddressVersion: 2 });
    expect(
      removeWalletAddressReceiptSchema.parse({
        version: 1,
        commandId,
        walletAddressId,
        walletAddressVersion: 3,
        replayed: true,
      }),
    ).toMatchObject({ walletAddressVersion: 3 });
  });

  it('rejects receipt extras and invalid versions', () => {
    expect(
      updateProfileReceiptSchema.safeParse({
        version: 1,
        commandId,
        profileId,
        profileVersion: 0,
        replayed: false,
      }).success,
    ).toBe(false);
    expect(
      addWalletAddressReceiptSchema.safeParse({
        version: 1,
        commandId,
        walletAddressId,
        walletAddressVersion: 1,
        profileVersion: 2,
        replayed: false,
        internal: 'leak',
      }).success,
    ).toBe(false);
  });

  it('exposes only the frozen identity repository error codes', () => {
    expect(identityErrorCodeSchema.options).toEqual([
      'identity_session_required',
      'identity_profile_not_found',
      'identity_address_invalid',
      'identity_address_duplicate',
      'identity_address_limit_reached',
      'identity_version_conflict',
      'identity_idempotency_conflict',
      'identity_command_invalid',
      'identity_query_failed',
      'identity_persistence_failed',
    ]);
  });
});

describe('phone login credentials', () => {
  it.each([
    '13800138000',
    '19912345678',
    '  13800138000  ',
  ])('accepts the mobile number %s', (value) => {
    expect(loginPhoneSchema.parse(value)).toBe(value.trim());
  });

  it.each([
    ['1380013800', 'ten digits'],
    ['138001380001', 'twelve digits'],
    ['12800138000', 'second digit out of range'],
    ['+8613800138000', 'country code prefix'],
    ['138 0013 8000', 'spaces inside'],
  ])('rejects %s (%s)', (value) => {
    expect(loginPhoneSchema.safeParse(value).success).toBe(false);
  });
});

describe('account password contract', () => {
  it('accepts a password that carries both a letter and a digit', () => {
    expect(accountPasswordSchema.parse('airdrop2026')).toBe('airdrop2026');
  });

  it.each([
    ['short1', 'fewer than 8 characters'],
    ['12345678', 'digits only'],
    ['abcdefgh', 'letters only'],
    [`a1${'x'.repeat(71)}`, 'longer than bcrypt reads'],
    ['airdrop2026\u0000', 'control character'],
  ])('rejects %s (%s)', (value) => {
    expect(accountPasswordSchema.safeParse(value).success).toBe(false);
  });

  it('does not trim spaces, because they are legal password characters', () => {
    expect(accountPasswordSchema.parse(' pass word 1 ')).toBe(' pass word 1 ');
  });

  it('treats a password field as an allowed payload key', () => {
    expect(findForbiddenIdentityKeys({ phone: '13800138000', password: 'airdrop2026' }))
      .toEqual([]);
  });

  it('still rejects secret-shaped keys so the platform rule stays enforced', () => {
    expect(findForbiddenIdentityKeys({ recoveryPhrase: 'x' })).toEqual(['recoveryPhrase']);
    expect(findForbiddenIdentityKeys({ privateKey: 'x' })).toEqual(['privateKey']);
  });
});
