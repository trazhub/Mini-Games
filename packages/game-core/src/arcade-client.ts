import { ARCADE, type ArcadeChunk } from '@minigamehub/shared';
import { encodeInputLog, splitChunks, type InputEvent } from './arcade';

const varintLen = (v: number) => (v < 0x80 ? 1 : v < 0x4000 ? 2 : v < 0x200000 ? 3 : 4);

/**
 * Browser-side input recorder for arcade games. Call `record(tick, code)` for every input the
 * game applies, then `finish()` and send each chunk with `sendArcade`.
 *
 * `record` returns false (and drops the input) for anything the server would reject: a backwards
 * or negative tick, a code outside 0..255, more than `ARCADE.MAX_EVENTS_PER_SEC` inputs within one
 * second of ticks, or a log that would exceed `ARCADE.MAX_LOG_BYTES`. A game should only apply an
 * input to its local sim when `record` accepted it, so the local run and the server replay match.
 * Ticks beyond the sim's `maxTicks` are not known here; the game must stop recording at its cap.
 */
export class ArcadeRecorder {
  private readonly events: InputEvent[] = [];
  private readonly window: number;
  private bytes = 0;
  private lo = 0;

  constructor(hz: number) {
    this.window = Math.max(1, Math.round(hz));
  }

  record(tick: number, code: number): boolean {
    if (!Number.isInteger(tick) || tick < 0 || !Number.isInteger(code) || code < 0 || code > 255) return false;
    const prev = this.events.at(-1)?.tick ?? 0;
    if (tick < prev || tick - prev >= 2 ** 27) return false;
    let lo = this.lo;
    while (lo < this.events.length && tick - this.events[lo]!.tick >= this.window) lo++;
    if (this.events.length - lo + 1 > ARCADE.MAX_EVENTS_PER_SEC) return false;
    const cost = varintLen((tick - prev) * 2) + varintLen(code);
    if (this.bytes + cost > ARCADE.MAX_LOG_BYTES) return false;
    this.lo = lo;
    this.bytes += cost;
    this.events.push({ tick, code });
    return true;
  }

  /** The recorded log as protocol chunks (at most `ARCADE.MAX_CHUNKS`). */
  finish(): ArcadeChunk[] {
    return splitChunks(encodeInputLog(this.events));
  }
}
