export function presentFixtureUserIds(
  reviewerUserId: string,
  ordinaryUserId: string,
): readonly string[] {
  return [...new Set([reviewerUserId, ordinaryUserId].filter((userId) => userId !== ''))];
}
