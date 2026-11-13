import os from 'node:os';

/** Lightweight in-process metrics. Exposed at /metrics (guarded) and used by the load test. */
export class Metrics {
  readonly startedAt = Date.now();
  counters = {
    roomsCreated: 0,
    roomsDisposed: 0,
    joins: 0,
    joinRejected: 0,
    matchesFinished: 0,
    messagesIn: 0,
    malformed: 0,
    rateLimited: 0,
    kicks: 0,
    gameErrors: 0,
  };

  private tick = { count: 0, sumMs: 0, maxMs: 0 };
  private tickWindow = { count: 0, sumMs: 0, maxMs: 0 };
  private cpuLast = process.cpuUsage();
  private cpuLastAt = Date.now();

  recordTick(ms: number): void {
    for (const t of [this.tick, this.tickWindow]) {
      t.count++;
      t.sumMs += ms;
      if (ms > t.maxMs) t.maxMs = ms;
    }
  }

  snapshot(extra: { rooms: number; connections: number; players: number; activeGames: number }) {
    const mem = process.memoryUsage();
    const now = Date.now();
    const cpu = process.cpuUsage(this.cpuLast);
    const wallMs = Math.max(1, now - this.cpuLastAt);
    const cpuPct = ((cpu.user + cpu.system) / 1000 / wallMs) * 100;
    this.cpuLast = process.cpuUsage();
    this.cpuLastAt = now;
    const w = this.tickWindow;
    const out = {
      uptimeSec: Math.round((now - this.startedAt) / 1000),
      ...extra,
      counters: { ...this.counters },
      process: {
        rssMB: round1(mem.rss / 1048576),
        heapUsedMB: round1(mem.heapUsed / 1048576),
        cpuPercentSinceLastSample: round1(cpuPct),
      },
      host: { load1: round1(os.loadavg()[0] ?? 0), cpus: os.cpus().length },
      tick: {
        windowCount: w.count,
        windowAvgMs: w.count ? round3(w.sumMs / w.count) : 0,
        windowMaxMs: round3(w.maxMs),
        totalAvgMs: this.tick.count ? round3(this.tick.sumMs / this.tick.count) : 0,
        totalMaxMs: round3(this.tick.maxMs),
      },
    };
    this.tickWindow = { count: 0, sumMs: 0, maxMs: 0 };
    return out;
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
