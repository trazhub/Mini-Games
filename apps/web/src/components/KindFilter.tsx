import { GAME_KINDS, KIND_LABELS, type GameKind } from '@minigamehub/shared';
import type { ClientGame } from '../games/registry';

/** Parse a `?kind=` value; anything unknown means "no kind filter". */
export function parseKind(raw: string | null | undefined): GameKind | null {
  return GAME_KINDS.includes(raw as GameKind) ? (raw as GameKind) : null;
}

/** Games of `kind` (all games when `kind` is null). */
export function filterByKind<T extends Pick<ClientGame, 'meta'>>(games: readonly T[], kind: GameKind | null): T[] {
  return kind ? games.filter((g) => g.meta.kind === kind) : [...games];
}

/** The kinds that at least one game has, in display order. */
export function availableKinds(games: readonly Pick<ClientGame, 'meta'>[]): GameKind[] {
  return GAME_KINDS.filter((k) => games.some((g) => g.meta.kind === k));
}

/** Pill row that narrows the library by kind (Together / Arcade / Action). Renders nothing for one kind. */
export function KindFilter({ games, value, onChange }: { games: readonly Pick<ClientGame, 'meta'>[]; value: GameKind | null; onChange: (k: GameKind | null) => void }) {
  const kinds = availableKinds(games);
  if (kinds.length < 2) return null;
  return (
    <div className="library-filter" role="group" aria-label="Filter by kind">
      <button type="button" aria-pressed={!value} onClick={() => onChange(null)}>Every kind</button>
      {kinds.map((k) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{KIND_LABELS[k]}</button>
      ))}
    </div>
  );
}
