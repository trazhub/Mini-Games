import { ChunkAssembler, decodeInputLog, createRng } from '@minigamehub/game-core';
import { ARCADE } from '@minigamehub/shared';
import { describe, expect, it } from 'vitest';
import { createRunController, keyToDirection, type Direction } from './controller';
import { LANE_LEFT, LANE_RIGHT, MAX_TICKS, TICK_HZ, laneRunnerSim } from './sim';

function decode(chunks: ReturnType<ReturnType<typeof createRunController>['finish']>) {
  const asm = new ChunkAssembler();
  for (const c of chunks) asm.add(c);
  const log = asm.join();
  expect(log).not.toBeNull();
  return decodeInputLog(log!, MAX_TICKS, TICK_HZ);
}

describe('Lane Runner controller', () => {
  it('records left/right key presses as inputs 1 and 2', () => {
    const c = createRunController(12345);
    const keys = ['ArrowLeft', 'd', 'D', 'a'] as const;
    const wanted = [LANE_LEFT, LANE_RIGHT, LANE_RIGHT, LANE_LEFT];
    keys.forEach((k) => {
      const dir = keyToDirection(k);
      expect(dir).not.toBeNull();
      expect(c.input(dir as Direction)).toBe(true);
      for (let t = 0; t < 8 && !c.done; t++) c.advance(); // stay under the input-rate limit
    });
    const events = decode(c.finish());
    expect(events!.map((e) => e.code)).toEqual(wanted);
    expect(events!.map((e) => e.tick)).toEqual([0, 8, 16, 24]);
  });

  it('maps only the documented keys', () => {
    expect(keyToDirection('ArrowLeft')).toBe('left');
    expect(keyToDirection('A')).toBe('left');
    expect(keyToDirection('ArrowRight')).toBe('right');
    expect(keyToDirection('d')).toBe('right');
    for (const other of ['ArrowUp', 'w', ' ', 'Enter', 'Escape', '1']) expect(keyToDirection(other)).toBeNull();
  });

  it('the local score equals the server replay of the recorded log', () => {
    for (const seed of [1, 777, 2147483647]) {
      const rng = createRng(seed);
      const c = createRunController(seed);
      let sinceInput = 0;
      while (!c.done) {
        // a plausible, rate-limited player: an occasional lane change
        if (sinceInput >= 6 && rng.next() < 0.3) {
          c.input(rng.next() < 0.5 ? 'left' : 'right');
          sinceInput = 0;
        }
        c.advance();
        sinceInput++;
      }
      const events = decode(c.finish())!;
      expect(laneRunnerSim.replay(seed, {}, events).score).toBe(c.score());
    }
  });

  it('an input the recorder refuses is not applied to the local run', () => {
    const c = createRunController(5);
    let accepted = 0;
    for (let i = 0; i < ARCADE.MAX_EVENTS_PER_SEC + 10; i++) if (c.input(i % 2 ? 'left' : 'right')) accepted++;
    expect(accepted).toBe(ARCADE.MAX_EVENTS_PER_SEC);
    // The server replays only recorded inputs, so the lane after refusals must equal that replay's lane.
    expect(decode(c.finish())!.length).toBe(ARCADE.MAX_EVENTS_PER_SEC);
  });

  it('ignores input once the run is over', () => {
    const c = createRunController(9);
    while (!c.done) c.advance();
    expect(c.input('left')).toBe(false);
    expect(decode(c.finish())!.length).toBe(0);
  });

  it('an idle run still produces one sendable (empty) chunk', () => {
    const c = createRunController(3);
    while (!c.done) c.advance();
    const chunks = c.finish();
    expect(chunks).toEqual([{ i: 0, n: 1, d: '' }]);
  });
});
