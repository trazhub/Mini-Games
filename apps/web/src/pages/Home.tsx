import { CATEGORY_LABELS, GAME_CATEGORIES } from '@minigamehub/shared';
import { Link } from 'react-router-dom';
import { Arrow, Spark } from '../components/ArcadeButton';
import { Avatar } from '../components/Avatar';
import { GameArt } from '../components/GameArt';
import { GameCard } from '../components/GameCard';
import { OrbitHero } from '../components/OrbitHero';
import { StartForm } from '../components/StartForm';
import { GAMES } from '../games/registry';

export function Home() {
  const cats = GAME_CATEGORIES.filter(c => GAMES.some(g => g.meta.tags.includes(c)));
  return <>
    <section className="arcade-entrance page-width" aria-labelledby="entrance-title">
      <div className="entrance-copy"><p className="open-sign"><span /> Open late. No quarters needed.</p>
        <h1 id="entrance-title">Insert friends<br />to <span className="chaos-word">continue</span>.</h1>
        <p className="entrance-description">Short multiplayer games for the people you used to spend whole afternoons with. Make a room, send the code, play for ten minutes. No downloads, no accounts.</p>
        <div className="entrance-actions"><Link to="/play" className="btn btn-primary">Create a room <Arrow /></Link><Link to="/play?mode=join" className="join-link">Join with a code <span aria-hidden="true">↗</span></Link></div>
        <div className="entrance-friends"><span className="avatar-stack"><Avatar id="ghost" size={34} /><Avatar id="fox" size={34} /><Avatar id="blob" size={34} /></span><span>Two to twelve players.<br /><strong>Runs in a browser tab.</strong></span></div>
      </div>
      <OrbitHero />
      <div className="entrance-bottom"><span>Free play, always.</span><span>No downloads <Spark /> No accounts <Spark /> No coins</span><a href="#the-games" className="explore-link" onClick={e => { e.preventDefault(); document.getElementById('the-games')?.scrollIntoView({ block: 'start' }); }}>See the cabinets ↓</a></div>
    </section>

    <section id="the-games" className="game-discovery page-width" aria-labelledby="featured">
      <div className="section-heading"><div><p className="section-note">The cabinets</p><h2 id="featured">Pick a game, pick a fight.</h2></div><Link to="/games" className="text-link">All games and rules <Arrow /></Link></div>
      <div className="poster-grid">{GAMES.map(g => <GameCard key={g.meta.id} game={g} />)}</div>
      <div className="mood-strip"><span>Browse by type</span><div>{cats.map(c => <Link key={c} to={`/games?cat=${c}`}>{CATEGORY_LABELS[c]}<span aria-hidden="true">↗</span></Link>)}</div></div>
    </section>

    <section className="feature-wrap" aria-labelledby="feature-title"><div className="featured-game page-width">
      <div className="feature-art"><GameArt id="majority-trap" /><span className="feature-sticker">Trust<br />no one.</span></div>
      <div className="feature-copy"><p className="section-note">Tonight’s pick: Majority Trap</p><h2 id="feature-title">Great minds<br />don’t think alike.</h2><p>Pick a side. Predict the least popular answer. Discover just how badly you know your friends.</p><p className="feature-facts">3–12 players <span>·</span> 3–5 minutes <span>·</span> Strong opinions encouraged</p><Link to="/play?game=majority-trap" className="btn btn-ink">Play Majority Trap <Arrow /></Link></div>
    </div></section>

    <section className="social-entry page-width" aria-labelledby="social-title"><div className="social-copy"><p className="section-note">Private rooms</p><h2 id="social-title">Bring the<br />old gang.<span className="social-asterisk">*</span></h2><p>*Or they will be. Make a private room, send the code, and settle who was actually the best.</p><ol className="party-steps"><li><span>1</span><div><strong>Claim your player</strong><p>A nickname. A face. That’s your entire signup.</p></div></li><li><span>2</span><div><strong>Send the invite</strong><p>One code gets everyone into the same room.</p></div></li><li><span>3</span><div><strong>Make it a game night</strong><p>Ready up, play, and keep the party together.</p></div></li></ol></div><div className="entry-ticket"><div className="ticket-heading"><Spark /><span>Redeem this ticket for one room</span><Spark /></div><StartForm compact /></div></section>
  </>;
}
