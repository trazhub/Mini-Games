import { describe, expect, it } from 'vitest';
import { TAU } from './constants';
import { SnapshotBuffer, lerpAngle } from './interpolate';
import type { PackedPlayer } from './types';

const P = (angle: number, lane = 1): PackedPlayer => [angle, lane, 1, 0, 0, 1];

describe('interpolation', () => {
  it('takes the shortest path across the 0/2PI seam', () => {
    const mid = lerpAngle(TAU - 0.1, 0.1, 0.5);
    expect(Math.min(mid, TAU - mid)).toBeLessThan(1e-9);
    expect(lerpAngle(0.2, 0.4, 0.5)).toBeCloseTo(0.3);
  });

  it('interpolates between bracketing snapshots', () => {
    const b = new SnapshotBuffer();
    b.push({ t: 1000, p: [P(0, 0)] });
    b.push({ t: 1100, p: [P(1, 2)] });
    const mid = b.sample(1050)!;
    expect(mid[0]![0]).toBeCloseTo(0.5);
    expect(mid[0]![1]).toBeCloseTo(1);
  });

  it('clamps outside the buffered range and handles an empty buffer', () => {
    const b = new SnapshotBuffer();
    expect(b.sample(5)).toBeNull();
    b.push({ t: 100, p: [P(1)] });
    b.push({ t: 200, p: [P(2)] });
    expect(b.sample(0)![0]![0]).toBe(1);
    expect(b.sample(999)![0]![0]).toBe(2);
  });

  it('resets when time goes backwards (new match) and bounds its memory', () => {
    const b = new SnapshotBuffer(5);
    for (let i = 0; i < 50; i++) b.push({ t: i * 50, p: [P(0)] });
    expect((b as unknown as { samples: unknown[] }).samples.length).toBe(5);
    b.push({ t: 10, p: [P(3)] });
    expect(b.latest!.t).toBe(10);
    expect((b as unknown as { samples: unknown[] }).samples.length).toBe(1);
  });
});
