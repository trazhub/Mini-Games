/** Token bucket: `capacity` burst, refilled at `refillPerSec`. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private capacity: number,
    private refillPerSec: number,
    now = Date.now(),
  ) {
    this.tokens = capacity;
    this.last = now;
  }
  take(cost = 1, now = Date.now()): boolean {
    const elapsed = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/**
 * Sliding-window counter keyed by string (IP address). Bounded memory: stale keys are purged
 * lazily and the map is hard-capped.
 */
export class KeyedWindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number,
    private windowMs: number,
    private maxKeys = 10_000,
  ) {}

  /** Returns true if the action is allowed (and records it). */
  allow(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > this.maxKeys) this.purge(now);
    return true;
  }

  purge(now = Date.now()): void {
    const cutoff = now - this.windowMs;
    for (const [k, arr] of this.hits) {
      const fresh = arr.filter((t) => t > cutoff);
      if (fresh.length === 0) this.hits.delete(k);
      else this.hits.set(k, fresh);
    }
    // Still too big (many distinct live keys): drop the oldest half rather than grow forever.
    if (this.hits.size > this.maxKeys) {
      let n = Math.floor(this.hits.size / 2);
      for (const k of this.hits.keys()) {
        if (n-- <= 0) break;
        this.hits.delete(k);
      }
    }
  }

  get size(): number {
    return this.hits.size;
  }
}
