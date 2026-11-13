import { GameHarness, createRng } from '@minigamehub/game-core';
import { describe, expect, it } from 'vitest';
import { LANES, ORBIT, angDist } from './constants';
import { orbitSwapPlugin } from './server';
import { OrbitSim, hazardAngle } from './sim';

const ids = ['a', 'b', 'c'];
const mk = (seed = 1, matchMs = 20_000) => new OrbitSim(ids, createRng(seed), { matchMs });

function run(sim: OrbitSim, ms: number) {
  for (let t = 0; t < ms; t += 33) sim.step(33);
}

describe('orbit sim', () => {
  it('is deterministic for a given seed', () => {
    const a = mk(42);
    const b = mk(42);
    run(a, 6000);
    run(b, 6000);
    expect(JSON.stringify(a.players)).toBe(JSON.stringify(b.players));
    expect(JSON.stringify(a.hazards)).toBe(JSON.stringify(b.hazards));
    expect(JSON.stringify(a.stars)).toBe(JSON.stringify(b.stars));
  });

  it('moves players around their lane; inner lanes are faster', () => {
    const sim = mk();
    const p = sim.playerById('a')!;
    const start = p.angle;
    sim.step(100);
    expect(angDist(p.angle, start)).toBeGreaterThan(0);
    // After a swap inwards, the same dt moves further.
    const fastSim = mk();
    fastSim.t = 1000; // past cooldown
    fastSim.swap('a', -1);
    run(fastSim, 500);
    const slowSim = mk();
    slowSim.t = 1000;
    slowSim.swap('a', 1);
    run(slowSim, 500);
    const inner = fastSim.playerById('a')!;
    const outer = slowSim.playerById('a')!;
    expect(inner.lane).toBeCloseTo(0, 1);
    expect(outer.lane).toBeCloseTo(2, 1);
  });

  it('clamps lanes, enforces swap/flip cooldowns and ignores invalid input', () => {
    const sim = mk();
    sim.step(33);
    expect(sim.swap('a', 1)).toBe(true);
    expect(sim.swap('a', 1)).toBe(false); // cooldown
    expect(sim.swap('a', 5 as never)).toBe(false);
    expect(sim.swap('nobody', 1)).toBe(false);
    sim.t += 500;
    expect(sim.swap('a', 1)).toBe(false); // already on the outer lane
    expect(sim.playerById('a')!.targetLane).toBe(LANES - 1);
    expect(sim.flip('a')).toBe(true);
    expect(sim.flip('a')).toBe(false);
    expect(sim.playerById('a')!.dir).toBe(-1);
  });

  it('awards star pickups on the same lane and removes the star', () => {
    const sim = mk();
    const p = sim.playerById('a')!;
    sim.stars.push({ id: 900, lane: 1, angle: p.angle + 0.05, value: 10, expiresAt: 99999 });
    sim.step(16);
    expect(p.score).toBe(10);
    expect(p.stars).toBe(1);
    expect(sim.stars.find((s) => s.id === 900)).toBeUndefined();
  });

  it('does not collect stars on another lane', () => {
    const sim = mk();
    const p = sim.playerById('a')!;
    sim.stars.push({ id: 901, lane: 0, angle: p.angle, value: 10, expiresAt: 99999 });
    sim.step(16);
    expect(p.score).toBe(0);
  });

  it('penalises hazard hits once, with invulnerability afterwards and a score floor of 0', () => {
    const sim = mk();
    sim.t = 3000; // past spawn invulnerability
    const p = sim.playerById('a')!;
    p.invulnUntil = 0;
    p.score = 15;
    sim.hazards.push({ id: 800, lane: 1, angle0: p.angle, omega: 0, width: 1, t0: sim.t, expiresAt: sim.t + 5000 });
    sim.step(16);
    expect(p.score).toBe(5);
    expect(p.hits).toBe(1);
    sim.step(16);
    expect(p.score).toBe(5); // invulnerable
    p.invulnUntil = 0;
    sim.step(16);
    expect(p.score).toBe(0); // floored at 0
  });

  it('does not let spawn-invulnerable or disconnected players be hit', () => {
    const sim = mk();
    const p = sim.playerById('a')!;
    sim.hazards.push({ id: 801, lane: 1, angle0: p.angle, omega: 0, width: 1, t0: 0, expiresAt: 99999 });
    sim.step(16);
    expect(p.hits).toBe(0);
    sim.t = 4000;
    p.invulnUntil = 0;
    sim.setConnected('a', false);
    sim.step(16);
    expect(p.hits).toBe(0);
  });

  it('spawns hazards/stars over time, bounded, and finishes at matchMs', () => {
    const sim = mk(7, 15_000);
    run(sim, 14_000);
    expect(sim.hazards.length).toBeGreaterThan(0);
    expect(sim.hazards.length).toBeLessThanOrEqual(ORBIT.maxHazards);
    expect(sim.stars.length).toBeLessThanOrEqual(ORBIT.maxStars);
    run(sim, 2_000);
    expect(sim.done).toBe(true);
    const before = sim.t;
    sim.step(100);
    expect(sim.t).toBe(before);
  });

  it('hazard angle is a pure function of sim time', () => {
    const h = { id: 1, lane: 0, angle0: 1, omega: 2, width: 1, t0: 1000, expiresAt: 9999 };
    expect(hazardAngle(h, 1000)).toBeCloseTo(1);
    expect(hazardAngle(h, 2000)).toBeCloseTo(3);
  });
});

describe('orbit plugin (authoritative)', () => {
  const cfg = { matchMs: 3000, countdownMs: 200, snapshotMs: 50 };

  it('ignores client-reported positions/scores and unknown actions', () => {
    const h = new GameHarness(orbitSwapPlugin, 2, cfg, 5);
    h.instance.start();
    h.advance(300);
    const before = JSON.stringify(h.instance.getState('p1'));
    h.instance.handleAction('p1', { type: 'setPosition', angle: 1, lane: 0 } as any);
    h.instance.handleAction('p1', { type: 'score', value: 99999 } as any);
    h.instance.handleAction('p1', { type: 'swap', d: 9 } as any);
    h.instance.handleAction('p1', { type: 'swap', d: 'x' } as any);
    expect(JSON.stringify(h.instance.getState('p1'))).toBe(before);
  });

  it('applies valid swaps and broadcasts compact snapshots at the configured rate', () => {
    const h = new GameHarness(orbitSwapPlugin, 2, cfg, 5);
    h.instance.start();
    h.advance(300);
    h.instance.handleAction('p1', { type: 'swap', d: 1 });
    h.advance(400);
    const snaps = h.events('snap');
    expect(snaps.length).toBeGreaterThan(3);
    const last = snaps.at(-1)!.payload as any;
    expect(last.p).toHaveLength(2);
    expect(last.p[0][1]).toBeCloseTo(2, 1); // lane moved outwards
    // roughly one snapshot per 50ms (33ms tick granularity) once playing
    expect(snaps.length).toBeLessThan(400 / 33 + 6);
  });

  it('finishes after matchMs and produces ranked scores', () => {
    const h = new GameHarness(orbitSwapPlugin, 3, cfg, 9);
    h.instance.start();
    h.advance(3600);
    expect(h.result).not.toBeNull();
    expect(h.result!.scores).toHaveLength(3);
    expect((h.instance.getState('p1') as any).phase).toBe('done');
  });

  it('freezes disconnected players and resumes them with brief invulnerability', () => {
    const h = new GameHarness(orbitSwapPlugin, 2, cfg, 9);
    h.instance.start();
    h.advance(300);
    h.instance.onPlayerConnectionChange!('p1', false);
    const a0 = (h.instance.getState('p1') as any).players[0][0];
    h.advance(300);
    expect((h.instance.getState('p1') as any).players[0][0]).toBe(a0);
    h.instance.onPlayerConnectionChange!('p1', true);
    expect((h.instance.getState('p1') as any).players[0][3]).toBe(1);
  });
});
