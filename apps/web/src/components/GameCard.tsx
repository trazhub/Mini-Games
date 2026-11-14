import { CATEGORY_LABELS } from '@minigamehub/shared';
import { Link } from 'react-router-dom';
import { playerRange, type ClientGame } from '../games/registry';
import { Arrow } from './ArcadeButton';
import { GameArt } from './GameArt';

export function GameCard({ game, detailed = false }: { game: ClientGame; detailed?: boolean }) {
  const { meta } = game;
  const Title = detailed ? 'h2' : 'h3';
  return <article className={`game-poster poster-${meta.id} ${detailed ? 'poster-detailed' : ''}`} data-testid={`game-${meta.id}`}>
    <div className="poster-picture"><GameArt id={meta.id} /><span className="poster-genre">{CATEGORY_LABELS[meta.category]}</span><span className="poster-preview-label" aria-hidden="true">A little taste of the game ↗</span></div>
    <div className="poster-caption"><div className="poster-meta"><span>{playerRange(meta)}</span><span>{meta.durationMinutes[0]}–{meta.durationMinutes[1]} min</span></div>
      <Title>{meta.name}</Title><p className="poster-tagline">{meta.tagline}</p>
      {detailed && <div className="poster-details"><p>{meta.description}</p><details><summary>Rules & controls</summary><ul>{meta.rules.map(r => <li key={r}>{r}</li>)}</ul><h4>Keyboard</h4>{meta.controls.keyboard.map(c => <p key={c}>{c}</p>)}<h4>Touch</h4>{meta.controls.touch.map(c => <p key={c}>{c}</p>)}</details></div>}
      <Link to={`/play?game=${meta.id}`} className="poster-play">Play {meta.name}<span><Arrow /></span></Link>
    </div>
  </article>;
}
