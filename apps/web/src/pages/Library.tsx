import { CATEGORY_LABELS, GAME_CATEGORIES, type GameCategory } from '@minigamehub/shared';
import { useSearchParams } from 'react-router-dom';
import { GameCard } from '../components/GameCard';
import { GAMES } from '../games/registry';

export function Library() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('cat');
  const cat = GAME_CATEGORIES.includes(raw as GameCategory) ? (raw as GameCategory) : null;
  const available = GAME_CATEGORIES.filter((c) => GAMES.some((g) => g.meta.tags.includes(c)));
  const list = cat ? GAMES.filter((g) => g.meta.tags.includes(cat)) : GAMES;

  const chip = (active: boolean) => `btn min-h-10 py-1.5 ${active ? 'bg-pulse text-midnight' : 'btn-soft'}`;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-4xl font-extrabold sm:text-5xl">Games</h1>
      <p className="mt-3 max-w-2xl text-lg text-mist">Every game works with a shared room code and runs on desktop and mobile. Hosts can switch games without anyone leaving the party.</p>
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        <button type="button" className={chip(!cat)} aria-pressed={!cat} onClick={() => setParams({})}>
          All games
        </button>
        {available.map((c) => (
          <button key={c} type="button" className={chip(cat === c)} aria-pressed={cat === c} onClick={() => setParams({ cat: c })}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm text-mist" aria-live="polite">
        {list.length} {list.length === 1 ? 'game' : 'games'}
      </p>
      <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {list.map((g) => (
          <GameCard key={g.meta.id} game={g} detailed />
        ))}
      </div>
    </div>
  );
}
