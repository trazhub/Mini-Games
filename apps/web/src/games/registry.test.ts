import { describe, expect, it } from 'vitest';
import { GAMES, GAME_BY_ID } from './registry';

describe('client game registry', () => {
  it('has lane-runner with a lazy loader', () => {
    const g = GAME_BY_ID['lane-runner'];
    expect(g).toBeDefined();
    expect(g!.meta.kind).toBe('arcade');
    expect(g!.meta.solo).toBe(true);
    // Lazy: calling `load` returns a promise (a separate chunk), it is not an eagerly imported component.
    expect(typeof g!.load).toBe('function');
  });

  it('has one entry per id and every game has a loader', () => {
    expect(new Set(GAMES.map((g) => g.meta.id)).size).toBe(GAMES.length);
    for (const g of GAMES) expect(typeof g.load).toBe('function');
  });
});
