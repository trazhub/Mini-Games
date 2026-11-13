import { describe, expect, it } from 'vitest';
import { dailySeed, dayKey, fnv1a32 } from './daily';

describe('daily challenge helpers', () => {
  it('fnv1a32 matches the published test vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('dailySeed is stable for a fixed input (pin two literal values)', () => {
    // These literals define historic daily boards. If this test ever needs editing, the mapping changed.
    expect(dailySeed('lane-runner', '2026-11-14')).toBe(635559989);
    expect(dailySeed('lane-runner', '2026-11-15')).toBe(618782370);
  });

  it('dailySeed always lands in the valid arcade seed range and varies by game and day', () => {
    const seen = new Set<number>();
    for (let d = 1; d <= 28; d++) {
      for (const game of ['lane-runner', 'snake', 'x']) {
        const s = dailySeed(game, `2027-02-${String(d).padStart(2, '0')}`);
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(2147483647);
        seen.add(s);
      }
    }
    expect(seen.size).toBe(28 * 3);
  });

  it('dayKey rolls over at 00:00 UTC', () => {
    expect(dayKey(Date.UTC(2026, 10, 14, 23, 59, 59, 999))).toBe('2026-11-14');
    expect(dayKey(Date.UTC(2026, 10, 15, 0, 0, 0, 0))).toBe('2026-11-15');
    expect(dayKey(Date.UTC(2026, 11, 31, 23, 59, 59, 999))).toBe('2026-12-31');
    expect(dayKey(Date.UTC(2027, 0, 1))).toBe('2027-01-01');
    expect(dayKey(Date.UTC(2026, 0, 5, 3))).toBe('2026-01-05'); // zero padded
  });
});
