/**
 * Daily challenge helpers. Pure: no clock, no randomness. The server passes the time in.
 *
 * FIXED FOREVER. `dailySeed` defines every historic daily board: changing the hash or the mapping
 * would silently rewrite old leaderboards and make "yesterday's board" unreproducible. The pinned
 * literals in daily.test.ts guard it.
 */

/** UTC calendar day of an epoch-millisecond timestamp, as `YYYY-MM-DD`. Rolls over at 00:00 UTC. */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** FNV-1a 32-bit hash of the UTF-8 bytes of `text`, as an unsigned integer. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Deterministic arcade seed for one game on one UTC day: FNV-1a 32-bit of the UTF-8 string
 * `${gameId}:${day}`, then mapped into the valid arcade seed range 1..2147483647 by keeping the low
 * 31 bits (`hash & 0x7fffffff`) and mapping the single value 0 to 1.
 */
export function dailySeed(gameId: string, day: string): number {
  return (fnv1a32(`${gameId}:${day}`) & 0x7fffffff) || 1;
}
