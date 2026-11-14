import { LIMITS } from '@minigamehub/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CountdownOverlay } from '../../components/CountdownOverlay';
import { GameArt } from '../../components/GameArt';
import { LobbyPlayer } from '../../components/LobbyPlayer';
import { RoomCodeDisplay } from '../../components/RoomCodeDisplay';
import { GAME_BY_ID, GAMES, playerRange } from '../../games/registry';
import { sfx } from '../../lib/audio';
import { useParty } from '../../lib/party';

export function Lobby() {
  const p = useParty();
  const nav = useNavigate();
  const party = p.party!;
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const kickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const me = party.players.find(x => x.id === p.me);
  const connected = party.players.filter(x => x.connected);
  const selected = party.selectedGameId ? GAME_BY_ID[party.selectedGameId] : undefined;
  const previousPlayers = useRef(party.players);
  const [announcement, setAnnouncement] = useState('Your private party is open.');

  useEffect(() => {
    const joined = party.players.filter(pl => !previousPlayers.current.some(old => old.id === pl.id));
    const left = previousPlayers.current.filter(pl => !party.players.some(next => next.id === pl.id));
    if (joined.length || left.length) setAnnouncement([...joined.map(pl => `${pl.name} joined the party.`), ...left.map(pl => `${pl.name} left the party.`)].join(' '));
    previousPlayers.current = party.players;
  }, [party.players]);
  useEffect(() => () => { if (kickTimer.current) clearTimeout(kickTimer.current); }, []);

  const blocker = useMemo(() => {
    if (!selected) return 'Pick a game to start.';
    const n = connected.length;
    if (n < selected.meta.minPlayers) return `${selected.meta.name} needs at least ${selected.meta.minPlayers} players (${n} connected).`;
    if (n > selected.meta.maxPlayers) return `${selected.meta.name} holds up to ${selected.meta.maxPlayers} players (${n} connected). Pick another game or ask someone to leave.`;
    const waiting = connected.filter(x => !x.isHost && !x.ready);
    return waiting.length ? `Waiting for ${waiting.map(w => w.name).join(', ')} to ready up.` : null;
  }, [selected, connected]);

  const [secs, setSecs] = useState<number | null>(null);
  const startsAt = party.startsAt;
  const serverNow = p.serverNow;
  useEffect(() => {
    if (party.phase !== 'starting' || !startsAt) return setSecs(null);
    const tick = () => {
      const left = Math.max(0, Math.ceil((startsAt - serverNow()) / 1000));
      setSecs(prev => { if (prev !== left && left > 0) sfx('tick'); return left; });
    };
    tick(); const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [party.phase, startsAt, serverNow]);

  return <div className="lobby-page page-width">
    <div className="lobby-title"><div><p className="section-note">Good company. Bad poker faces.</p><h1>The green room.</h1></div><span className="text-xs text-mist">{party.matchesPlayed ? `${party.matchesPlayed} ${party.matchesPlayed === 1 ? 'game' : 'games'} played` : 'Your game night starts here'}</span></div>
    <RoomCodeDisplay code={party.code} onLeave={() => { p.leave(); nav('/'); }} />
    <p role="status" className="sr-only">{announcement}</p>
    <div className="lobby-grid">
      <section className="lobby-section" aria-labelledby="players-h"><div className="lobby-section-header"><h2 id="players-h">The usual suspects</h2><span data-testid="player-count">{party.players.length} of {LIMITS.PARTY_MAX_PLAYERS}</span></div>
        <ul className="player-grid" data-testid="player-list">{party.players.map(pl => <LobbyPlayer key={pl.id} player={pl} isMe={pl.id === p.me} canRemove={p.isHost && pl.id !== p.me} confirm={confirmKick === pl.id} onRemove={() => {
          if (confirmKick === pl.id) { p.kick(pl.id); setConfirmKick(null); }
          else { setConfirmKick(pl.id); if (kickTimer.current) clearTimeout(kickTimer.current); kickTimer.current = setTimeout(() => setConfirmKick(null), 4000); }
        }} />)}
        {party.players.length < 3 && <li className="empty-seat"><span aria-hidden="true">+</span><p>Room for another rival</p><button type="button" onClick={() => document.querySelector<HTMLButtonElement>('[data-testid="copy-invite"]')?.click()}>Copy an invite ↗</button></li>}</ul>
        <p className="lobby-info">Tap a face for a little warm-up wiggle. Reactions stay on your screen.</p>
        <div className="lobby-controls">{p.isHost ? <><button type="button" className="btn btn-primary w-full text-base" disabled={!!blocker || party.phase !== 'lobby' || p.status !== 'connected'} onClick={() => p.start()} data-testid="start-game">{party.phase === 'starting' ? 'Here we go…' : selected ? `Start ${selected.meta.name}` : 'Start game'}</button><p className="mt-3 min-h-5 text-xs text-mist" aria-live="polite" data-testid="start-hint">{blocker ?? 'Everyone is ready. Let the games begin.'}</p></> : <><button type="button" className={`btn w-full ${me?.ready ? 'btn-soft' : 'btn-primary'}`} disabled={party.phase !== 'lobby' || p.status !== 'connected'} onClick={() => p.setReady(!me?.ready)} aria-pressed={!!me?.ready} data-testid="ready-toggle">{me?.ready ? 'Ready - tap to cancel' : "I'm ready"}</button><p className="lobby-info">The host starts the game once everyone is ready.</p></>}</div>
      </section>
      <section className="lobby-section" aria-labelledby="games-h"><div className="lobby-section-header"><h2 id="games-h">What are we playing?</h2><span>Pick your trouble</span></div><p className="lobby-info">{p.isHost ? 'Pick a game, or let the party vote. You get the final say.' : 'Vote for your favorite. The host makes the final pick.'}</p>
        <ul className="lobby-games">{GAMES.map(({ meta }) => {
          const votes = Object.values(party.votes).filter(v => v === meta.id).length;
          const myVote = party.votes[p.me] === meta.id;
          const isSel = party.selectedGameId === meta.id;
          const fits = connected.length >= meta.minPlayers && connected.length <= meta.maxPlayers;
          return <li key={meta.id} className={`lobby-game ${isSel ? 'is-selected' : ''}`} data-testid={`lobby-game-${meta.id}`}><GameArt id={meta.id} className="lobby-game-art" /><div className="min-w-0 flex-1"><h3>{meta.name}</h3><p className="lobby-game-meta">{playerRange(meta)} · {meta.durationMinutes[0]}–{meta.durationMinutes[1]} min</p>{!fits && <p className="mt-1 text-[10px] text-amber">Needs {meta.minPlayers}–{meta.maxPlayers} connected players (you have {connected.length})</p>}<div className="lobby-game-actions"><button type="button" disabled={party.phase !== 'lobby' || p.status !== 'connected'} className={`btn ${myVote ? 'btn-ink' : 'btn-soft'}`} aria-pressed={myVote} onClick={() => p.vote(meta.id)}>{myVote ? 'Voted' : 'Vote'}{votes > 0 ? ` · ${votes}` : ''}</button>{p.isHost ? <button type="button" disabled={party.phase !== 'lobby' || p.status !== 'connected'} className={`btn ${isSel ? 'btn-ink' : 'btn-soft'}`} aria-pressed={isSel} onClick={() => p.selectGame(meta.id)}>{isSel ? 'Selected' : 'Select'}</button> : isSel && <span className="self-center text-[10px] font-semibold">Host picked this</span>}</div></div></li>;
        })}</ul>
      </section>
    </div>
    {party.phase === 'starting' && secs !== null && <CountdownOverlay seconds={secs} game={selected?.meta.name ?? 'The next game'} onCancel={p.isHost ? () => p.backToLobby() : undefined} />}
  </div>;
}
