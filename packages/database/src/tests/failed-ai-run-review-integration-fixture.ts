export function presentFixtureUserIds(...userIds: readonly string[]): readonly string[] {
  return [...new Set(userIds.filter((userId) => userId !== ''))];
}

export async function completeRegisteredFixtureUser<T>(
  userId: string,
  registerUserId: (createdUserId: string) => void,
  completeSignup: () => Promise<T>,
): Promise<T> {
  registerUserId(userId);
  return completeSignup();
}
