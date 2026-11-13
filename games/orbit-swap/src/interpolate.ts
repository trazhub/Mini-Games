import { TAU, wrapAngle } from './constants';
import type { PackedPlayer } from './types';

/** Shortest-path interpolation between two angles (radians). */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = wrapAngle(b) - wrapAngle(a);
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return wrapAngle(a + d * k);
}

export interface SnapSample {
  /** Server sim time (ms) of the snapshot. */
  t: number;
  p: PackedPlayer[];
}

/**
 * Buffers server snapshots and returns smoothed player state for a render time slightly in the
 * past (entity interpolation). Remote movement therefore stays smooth despite 15Hz updates.
 */
export class SnapshotBuffer {
  private samples: SnapSample[] = [];
  constructor(private max = 24) {}

  push(s: SnapSample): void {
    const last = this.samples[this.samples.length - 1];
    if (last && s.t < last.t) this.samples = []; // new match / time went backwards
    if (last && s.t === last.t) {
      this.samples[this.samples.length - 1] = s;
      return;
    }
    this.samples.push(s);
    if (this.samples.length > this.max) this.samples.shift();
  }

  get latest(): SnapSample | undefined {
    return this.samples[this.samples.length - 1];
  }

  clear(): void {
    this.samples = [];
  }

  /** Interpolated players at sim time `t`, clamped to the buffered range. */
  sample(t: number): PackedPlayer[] | null {
    const s = this.samples;
    if (s.length === 0) return null;
    if (s.length === 1 || t <= s[0]!.t) return s[0]!.p;
    const last = s[s.length - 1]!;
    if (t >= last.t) return last.p;
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1]!;
      const b = s[i]!;
      if (t >= a.t && t <= b.t) {
        const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
        return b.p.map((pb, idx) => {
          const pa = a.p[idx] ?? pb;
          return [
            lerpAngle(pa[0], pb[0], k),
            pa[1] + (pb[1] - pa[1]) * k,
            pb[2],
            pb[3],
            pb[4],
            pb[5],
          ] as PackedPlayer;
        });
      }
    }
    return last.p;
  }
}
