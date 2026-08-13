const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 16_777_619;

export function fnv1a32(value: string): number {
  let hash = FNV_OFFSET_BASIS_32;

  for (const byte of new TextEncoder().encode(value)) {
    hash = Math.imul(hash ^ byte, FNV_PRIME_32) >>> 0;
  }

  return hash;
}
