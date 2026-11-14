import type { GameMeta } from '@minigamehub/shared';
import { describe, expect, it } from 'vitest';
import { availableKinds, filterByKind, parseKind } from './KindFilter';

const g = (id: string, kind: GameMeta['kind']) => ({ meta: { id, kind } as GameMeta });
const games = [g('a', 'together'), g('b', 'arcade'), g('c', 'together'), g('d', 'arcade')];

describe('KindFilter helpers', () => {
  it('narrows the list by kind', () => {
    expect(filterByKind(games, 'arcade').map((x) => x.meta.id)).toEqual(['b', 'd']);
    expect(filterByKind(games, 'together').map((x) => x.meta.id)).toEqual(['a', 'c']);
    expect(filterByKind(games, 'action')).toEqual([]);
  });

  it('returns every game (as a copy) when no kind is chosen', () => {
    const all = filterByKind(games, null);
    expect(all).toEqual(games);
    expect(all).not.toBe(games);
  });

  it('only offers kinds that have games, in display order', () => {
    expect(availableKinds(games)).toEqual(['together', 'arcade']);
  });

  it('treats an unknown ?kind value as no filter', () => {
    expect(parseKind('arcade')).toBe('arcade');
    expect(parseKind('nonsense')).toBeNull();
    expect(parseKind(null)).toBeNull();
  });
});
