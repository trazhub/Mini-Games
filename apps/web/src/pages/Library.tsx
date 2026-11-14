import { CATEGORY_LABELS, GAME_CATEGORIES, type GameCategory } from '@minigamehub/shared';
import { useSearchParams } from 'react-router-dom';
import { Spark } from '../components/ArcadeButton';
import { GameCard } from '../components/GameCard';
import { GAMES } from '../games/registry';

export function Library() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('cat');
  const cat = GAME_CATEGORIES.includes(raw as GameCategory) ? raw as GameCategory : null;
  const available = GAME_CATEGORIES.filter(c => GAMES.some(g => g.meta.tags.includes(c)));
  const list = cat ? GAMES.filter(g => g.meta.tags.includes(cat)) : GAMES;
  return <div className="library-page page-width">
    <header className="library-heading"><div><p className="section-note">The whole happy collection</p><h1>Games<span className="library-star"><Spark /></span></h1><p>Short rounds. Long-running rivalries. Pick a game and bring your people.</p></div><span className="library-stamp">No installs.<br />All play.</span></header>
    <div className="library-filter" role="group" aria-label="Filter by category"><button type="button" aria-pressed={!cat} onClick={() => setParams({})}>All games</button>{available.map(c => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setParams({ cat: c })}>{CATEGORY_LABELS[c]}</button>)}<span aria-live="polite">{list.length} {list.length === 1 ? 'game' : 'games'} on the floor</span></div>
    <div className="poster-grid library-posters">{list.map(g => <GameCard key={g.meta.id} game={g} detailed />)}</div>
    <p className="library-footnote">One room, every game. Your host can change the game while the whole party stays together.</p>
  </div>;
}
