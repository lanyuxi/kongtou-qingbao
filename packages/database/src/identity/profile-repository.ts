import {
  parseIdentityCommand,
  publicIdentityProfileSchema,
  updateProfileCommandSchema,
  updateProfileReceiptSchema,
  userProfileRowSchema,
  type PublicIdentityProfile,
  type UpdateProfileCommand,
  type UpdateProfileReceipt,
  type UserProfileRow,
} from '@airdrop/contracts';
import {
  createBrowserIdentityRpc,
  exactProfileRow,
  IdentityRepositoryError,
  type IdentityRepositoryOptions,
  type IdentityRpc,
  mutate,
  parsePublicUserId,
  read,
  requireAccessToken,
} from './shared.js';

export interface IdentityProfileRepository {
  getMine(input: { accessToken: string }): Promise<UserProfileRow>;
  getPublic(input: { userId: string }): Promise<PublicIdentityProfile>;
  update(input: {
    accessToken: string;
    command: UpdateProfileCommand;
  }): Promise<UpdateProfileReceipt>;
}
export function createIdentityProfileRepository(
  options: IdentityRepositoryOptions,
): IdentityProfileRepository {
  return createIdentityProfileRepositoryFromRpc(createBrowserIdentityRpc(options));
}
export function createIdentityProfileRepositoryFromRpc(
  rpc: IdentityRpc,
): IdentityProfileRepository {
  return {
    getMine: async (input) =>
      read(async () =>
        userProfileRowSchema.parse(
          exactProfileRow(
            await rpc.invoke({
              accessToken: requireAccessToken(input.accessToken),
              functionName: 'get_my_identity_profile',
              args: {},
            }),
          ),
        ),
      ),
    getPublic: async (input) =>
      read(async () =>
        publicIdentityProfileSchema.parse(
          exactProfileRow(
            await rpc.invoke({
              accessToken: null,
              functionName: 'get_public_identity_profile',
              args: { p_user_id: parsePublicUserId(input.userId) },
            }),
          ),
        ),
      ),
    update: async (input) =>
      mutate(async () => {
        const accessToken = requireAccessToken(input.accessToken);
        const command = parseUpdateProfileCommand(input.command);
        return updateProfileReceiptSchema.parse(
          await rpc.invoke({
            accessToken,
            functionName: 'submit_update_profile',
            args: { p_payload: command },
          }),
        );
      }),
  };
}
function parseUpdateProfileCommand(value: unknown): UpdateProfileCommand {
  try {
    parseIdentityCommand(updateProfileCommandSchema, value);
    return value as UpdateProfileCommand;
  } catch {
    throw new IdentityRepositoryError('identity_command_invalid');
  }
}
