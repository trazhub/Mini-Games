/**
 * Minimal deterministic scheduler driven by the game's tick (`update(dt)`), so timers share the
 * game's clock, pause naturally with the tick loop, and are fully cleared in `dispose()`.
 */
export class TickTimers {
  private time = 0;
  private seq = 0;
  private entries: { id: number; at: number; fn: () => void }[] = [];

  get elapsed(): number {
    return this.time;
  }

  after(ms: number, fn: () => void): number {
    const id = ++this.seq;
    this.entries.push({ id, at: this.time + ms, fn });
    return id;
  }

  cancel(id: number | null | undefined): void {
    if (id == null) return;
    this.entries = this.entries.filter((e) => e.id !== id);
  }

  clear(): void {
    this.entries = [];
  }

  tick(dtMs: number): void {
    this.time += dtMs;
    // Callbacks may schedule more timers; keep draining until nothing is due.
    for (;;) {
      const due = this.entries.filter((e) => e.at <= this.time).sort((a, b) => a.at - b.at || a.id - b.id);
      const next = due[0];
      if (!next) return;
      this.entries = this.entries.filter((e) => e.id !== next.id);
      next.fn();
    }
  }
}
