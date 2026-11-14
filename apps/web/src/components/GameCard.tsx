import { CATEGORY_LABELS } from '@minigamehub/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { playerRange, type ClientGame } from '../games/registry';
import { unlockAudio } from '../lib/audio';
import { useParty } from '../lib/party';
import { startSolo } from '../lib/solo';
import { Arrow } from './ArcadeButton';
import { GameArt } from './GameArt';

export function GameCard({ game, detailed = false }: { game: ClientGame; detailed?: boolean }) {
  const { meta } = game;
  const Title = detailed ? 'h2' : 'h3';
  const party = useParty();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  async function playSolo() {
    setStarting(true);
    unlockAudio();
    const code = await startSolo(party, meta.id);
    setStarting(false);
    if (code) navigate(`/room/${code}`, { state: { game: meta.id } });
  }
  return <article className={`game-poster poster-${meta.id} ${detailed ? 'poster-detailed' : ''}`} data-testid={`game-${meta.id}`}>
    <div className="poster-marquee"><Title>{meta.name}</Title><span className="poster-genre">{CATEGORY_LABELS[meta.category]}</span></div>
    <div className="poster-picture"><GameArt id={meta.id} /><span className="poster-preview-label" aria-hidden="true">Attract mode</span></div>
    <div className="poster-caption"><div className="poster-meta"><span>{playerRange(meta)}</span><span>{meta.durationMinutes[0]}–{meta.durationMinutes[1]} min</span></div>
      <p className="poster-tagline">{meta.tagline}</p>
      {detailed && <div className="poster-details"><p>{meta.description}</p><details><summary>Rules & controls</summary><ul>{meta.rules.map(r => <li key={r}>{r}</li>)}</ul><h4>Keyboard</h4>{meta.controls.keyboard.map(c => <p key={c}>{c}</p>)}<h4>Touch</h4>{meta.controls.touch.map(c => <p key={c}>{c}</p>)}</details></div>}
      {meta.solo && <button type="button" className="poster-play poster-solo" disabled={starting} onClick={() => void playSolo()}>{starting ? 'Starting…' : 'Play solo'}<span><Arrow /></span></button>}
      <Link to={`/play?game=${meta.id}`} className="poster-play">{meta.solo ? 'Play with friends' : `Play ${meta.name}`}<span><Arrow /></span></Link>
    </div>
  </article>;
}
