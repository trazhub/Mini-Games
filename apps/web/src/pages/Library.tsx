import { CATEGORY_LABELS, GAME_CATEGORIES, type GameCategory } from '@minigamehub/shared';
import { useSearchParams } from 'react-router-dom';
import { Spark } from '../components/ArcadeButton';
import { GameCard } from '../components/GameCard';
import { KindFilter, filterByKind, parseKind } from '../components/KindFilter';
import { GAMES } from '../games/registry';

export function Library() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('cat');
  const cat = GAME_CATEGORIES.includes(raw as GameCategory) ? raw as GameCategory : null;
  const available = GAME_CATEGORIES.filter(c => GAMES.some(g => g.meta.tags.includes(c)));
  const kind = parseKind(params.get('kind'));
  const list = filterByKind(cat ? GAMES.filter(g => g.meta.tags.includes(cat)) : GAMES, kind);
  const setFilters = (next: { cat?: GameCategory | null; kind?: typeof kind }) => {
    const c = next.cat === undefined ? cat : next.cat;
    const k = next.kind === undefined ? kind : next.kind;
    setParams({ ...(c ? { cat: c } : {}), ...(k ? { kind: k } : {}) });
  };
  return <div className="library-page page-width">
    <header className="library-heading"><div><p className="section-note">The whole happy collection</p><h1>Games<span className="library-star"><Spark /></span></h1><p>Short rounds. Long-running rivalries. Pick a game and bring your people.</p></div><span className="library-stamp">No installs.<br />All play.</span></header>
    <div className="library-filter" role="group" aria-label="Filter by category"><button type="button" aria-pressed={!cat} onClick={() => setFilters({ cat: null })}>All games</button>{available.map(c => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setFilters({ cat: c })}>{CATEGORY_LABELS[c]}</button>)}<span aria-live="polite">{list.length} {list.length === 1 ? 'game' : 'games'} on the floor</span></div>
    <KindFilter games={GAMES} value={kind} onChange={k => setFilters({ kind: k })} />
    <div className="poster-grid library-posters">{list.map(g => <GameCard key={g.meta.id} game={g} detailed />)}</div>
    <p className="library-footnote">One room, every game. Your host can change the game while the whole party stays together.</p>
  </div>;
}
