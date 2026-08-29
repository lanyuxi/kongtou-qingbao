import type { ActiveSecurityPosture, SecurityPosture, SecurityTarget } from '@airdrop/contracts';

const rank = { clear: 0, caution: 1, blocked: 2 } as const;
const targetTypeOrder = { project: 0, source: 1 } as const;

export function compareSecurityPosture(left: SecurityPosture, right: SecurityPosture): number {
  return rank[left] - rank[right];
}

export function deriveSecurityPosture(
  active: readonly ActiveSecurityPosture[],
): SecurityPosture {
  return active.reduce<SecurityPosture>(
    (current, candidate) => (compareSecurityPosture(candidate, current) > 0 ? candidate : current),
    'clear',
  );
}

export function orderSecurityTargetsForLock(
  targets: readonly SecurityTarget[],
): SecurityTarget[] {
  const uniqueTargets = new Map<string, SecurityTarget>();
  for (const target of targets) {
    uniqueTargets.set(`${target.type}:${target.id}`, target);
  }

  return [...uniqueTargets.values()].sort((left, right) => {
    const typeDifference = targetTypeOrder[left.type] - targetTypeOrder[right.type];
    return typeDifference !== 0 ? typeDifference : left.id.localeCompare(right.id);
  });
}
