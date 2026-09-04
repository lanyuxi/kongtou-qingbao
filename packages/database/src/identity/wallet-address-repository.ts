import {
  addWalletAddressCommandSchema,
  addWalletAddressReceiptSchema,
  parseIdentityCommand,
  publicWalletAddressSchema,
  removeWalletAddressCommandSchema,
  removeWalletAddressReceiptSchema,
  setWalletAddressVisibilityCommandSchema,
  setWalletAddressVisibilityReceiptSchema,
  walletAddressRowSchema,
  type AddWalletAddressCommand,
  type AddWalletAddressReceipt,
  type PublicWalletAddress,
  type RemoveWalletAddressCommand,
  type RemoveWalletAddressReceipt,
  type SetWalletAddressVisibilityCommand,
  type SetWalletAddressVisibilityReceipt,
  type WalletAddressRow,
} from '@airdrop/contracts';
import {
  arrayResult,
  createBrowserIdentityRpc,
  IdentityRepositoryError,
  type IdentityRepositoryOptions,
  type IdentityRpc,
  mutate,
  parsePublicUserId,
  read,
  requireAccessToken,
} from './shared.js';

export interface IdentityWalletAddressRepository {
  listMine(input: { accessToken: string }): Promise<readonly WalletAddressRow[]>;
  listPublic(input: { userId: string }): Promise<readonly PublicWalletAddress[]>;
  add(input: {
    accessToken: string;
    command: AddWalletAddressCommand;
  }): Promise<AddWalletAddressReceipt>;
  setVisibility(input: {
    accessToken: string;
    command: SetWalletAddressVisibilityCommand;
  }): Promise<SetWalletAddressVisibilityReceipt>;
  remove(input: {
    accessToken: string;
    command: RemoveWalletAddressCommand;
  }): Promise<RemoveWalletAddressReceipt>;
}
export function createIdentityWalletAddressRepository(
  options: IdentityRepositoryOptions,
): IdentityWalletAddressRepository {
  return createIdentityWalletAddressRepositoryFromRpc(createBrowserIdentityRpc(options));
}
export function createIdentityWalletAddressRepositoryFromRpc(
  rpc: IdentityRpc,
): IdentityWalletAddressRepository {
  return {
    // This intentionally has no target-user argument: the SQL function is owner scoped.
    listMine: async (input) =>
      read(async () =>
        walletAddressRowSchema
          .array()
          .parse(
            arrayResult(
              await rpc.invoke({
                accessToken: requireAccessToken(input.accessToken),
                functionName: 'list_my_wallet_addresses',
                args: {},
              }),
            ),
          ),
      ),
    listPublic: async (input) =>
      read(async () =>
        publicWalletAddressSchema
          .array()
          .parse(
            arrayResult(
              await rpc.invoke({
                accessToken: null,
                functionName: 'list_public_identity_wallet_addresses',
                args: { p_user_id: parsePublicUserId(input.userId) },
              }),
            ),
          ),
      ),
    add: async (input) =>
      mutate(async () => {
        const accessToken = requireAccessToken(input.accessToken);
        const command = parseAddWalletAddressCommand(input.command);
        return addWalletAddressReceiptSchema.parse(
          await rpc.invoke({
            accessToken,
            functionName: 'submit_add_wallet_address',
            args: { p_payload: command },
          }),
        );
      }),
    setVisibility: async (input) =>
      mutate(async () => {
        const accessToken = requireAccessToken(input.accessToken);
        const command = parseSetWalletAddressVisibilityCommand(input.command);
        return setWalletAddressVisibilityReceiptSchema.parse(
          await rpc.invoke({
            accessToken,
            functionName: 'submit_set_wallet_address_visibility',
            args: { p_payload: command },
          }),
        );
      }),
    remove: async (input) =>
      mutate(async () => {
        const accessToken = requireAccessToken(input.accessToken);
        const command = parseRemoveWalletAddressCommand(input.command);
        return removeWalletAddressReceiptSchema.parse(
          await rpc.invoke({
            accessToken,
            functionName: 'submit_remove_wallet_address',
            args: { p_payload: command },
          }),
        );
      }),
  };
}
function parseAddWalletAddressCommand(value: unknown): AddWalletAddressCommand {
  try {
    parseIdentityCommand(addWalletAddressCommandSchema, value);
    return value as AddWalletAddressCommand;
  } catch {
    throw new IdentityRepositoryError('identity_command_invalid');
  }
}
function parseSetWalletAddressVisibilityCommand(value: unknown): SetWalletAddressVisibilityCommand {
  try {
    parseIdentityCommand(setWalletAddressVisibilityCommandSchema, value);
    return value as SetWalletAddressVisibilityCommand;
  } catch {
    throw new IdentityRepositoryError('identity_command_invalid');
  }
}
function parseRemoveWalletAddressCommand(value: unknown): RemoveWalletAddressCommand {
  try {
    parseIdentityCommand(removeWalletAddressCommandSchema, value);
    return value as RemoveWalletAddressCommand;
  } catch {
    throw new IdentityRepositoryError('identity_command_invalid');
  }
}
