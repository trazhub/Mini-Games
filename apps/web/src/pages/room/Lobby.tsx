import { LIMITS } from '@minigamehub/shared';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { ConnectionBadge } from '../../components/ConnectionBadge';
import { GameArt } from '../../components/GameArt';
import { GAME_BY_ID, GAMES, playerRange } from '../../games/registry';
import { sfx } from '../../lib/audio';
import { inviteUrl } from '../../lib/config';
import { useParty } from '../../lib/party';

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Fallback for insecure contexts / older browsers.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
        } finally {
          document.body.removeChild(ta);
        }
      }
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    },
  };
}

export function Lobby() {
  const p = useParty();
  const nav = useNavigate();
  const party = p.party!;
  const { copied, copy } = useCopy();
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const me = party.players.find((x) => x.id === p.me);
  const connected = party.players.filter((x) => x.connected);
  const selected = party.selectedGameId ? GAME_BY_ID[party.selectedGameId] : undefined;

  const blocker = useMemo(() => {
    if (!selected) return 'Pick a game to start.';
    const n = connected.length;
    if (n < selected.meta.minPlayers) return `${selected.meta.name} needs at least ${selected.meta.minPlayers} players (${n} connected).`;
    if (n > selected.meta.maxPlayers) return `${selected.meta.name} holds up to ${selected.meta.maxPlayers} players (${n} connected). Pick another game or ask someone to leave.`;
    const waiting = connected.filter((x) => !x.isHost && !x.ready);
    if (waiting.length) return `Waiting for ${waiting.map((w) => w.name).join(', ')} to ready up.`;
    return null;
  }, [selected, connected]);

  // 3-2-1 overlay while the server counts down to the match.
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (party.phase !== 'starting' || !party.startsAt) return setSecs(null);
    const tick = () => {
      const left = Math.max(0, Math.ceil((party.startsAt! - p.serverNow()) / 1000));
      setSecs((prev) => {
        if (prev !== left && left > 0) sfx('tick');
        return left;
      });
    };
    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [party.phase, party.startsAt, p]);

  const leaveParty = () => {
    p.leave();
    nav('/');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="panel flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6">
        <div>
          <p className="text-sm text-mist">Room code</p>
          <p className="font-display text-5xl font-extrabold tracking-[0.18em] sm:text-6xl" data-testid="room-code" aria-label={`Room code ${party.code.split('').join(' ')}`}>
            {party.code}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => copy('link', inviteUrl(party.code))} data-testid="copy-invite">
            {copied === 'link' ? 'Link copied' : 'Copy invite link'}
          </button>
          <button type="button" className="btn btn-soft" onClick={() => copy('code', party.code)}>
            {copied === 'code' ? 'Code copied' : 'Copy code'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={leaveParty}>
            Leave party
          </button>
        </div>
        <div className="w-full"><ConnectionBadge /></div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <section className="panel p-5" aria-labelledby="players-h">
          <div className="flex items-baseline justify-between">
            <h2 id="players-h" className="text-2xl font-extrabold">Players</h2>
            <span className="text-sm text-mist" data-testid="player-count">{party.players.length} of {LIMITS.PARTY_MAX_PLAYERS}</span>
          </div>
          <ul className="mt-4 space-y-2" data-testid="player-list">
            {party.players.map((pl) => (
              <li key={pl.id} className={`flex items-center gap-3 rounded-2xl bg-midnight px-3 py-2.5 ring-1 ring-edge ${pl.connected ? '' : 'opacity-60'}`}>
                <Avatar id={pl.avatar} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {pl.name}
                    {pl.id === p.me && <span className="ml-1.5 text-sm font-normal text-mist">(you)</span>}
                  </p>
                  <p className="text-xs text-mist">{pl.points} party points · {pl.wins} {pl.wins === 1 ? 'win' : 'wins'}</p>
                </div>
                {pl.isHost && <span className="rounded-full bg-amber/20 px-2.5 py-1 text-xs font-semibold text-amber">Host</span>}
                {!pl.connected ? (
                  <span className="rounded-full bg-coral/15 px-2.5 py-1 text-xs font-semibold text-coral">Offline</span>
                ) : pl.ready && !pl.isHost ? (
                  <span className="rounded-full bg-mint/15 px-2.5 py-1 text-xs font-semibold text-mint">Ready</span>
                ) : !pl.isHost ? (
                  <span className="rounded-full bg-hull px-2.5 py-1 text-xs font-semibold text-mist">Not ready</span>
                ) : null}
                {p.isHost && pl.id !== p.me && (
                  confirmKick === pl.id ? (
                    <button type="button" className="btn btn-danger min-h-9 px-3 py-1 text-xs" onClick={() => { p.kick(pl.id); setConfirmKick(null); }}>
                      Confirm remove
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost min-h-9 px-3 py-1 text-xs" aria-label={`Remove ${pl.name} from the party`} onClick={() => { setConfirmKick(pl.id); setTimeout(() => setConfirmKick((c) => (c === pl.id ? null : c)), 4000); }}>
                      Remove
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-edge/60 pt-5">
            {p.isHost ? (
              <>
                <button type="button" className="btn btn-primary w-full text-base" disabled={!!blocker || party.phase !== 'lobby'} onClick={() => p.start()} data-testid="start-game">
                  {selected ? `Start ${selected.meta.name}` : 'Start game'}
                </button>
                <p className="mt-2 min-h-5 text-sm text-mist" aria-live="polite" data-testid="start-hint">
                  {blocker ?? 'Everyone is ready.'}
                </p>
              </>
            ) : (
              <>
                <button type="button" className={`btn w-full text-base ${me?.ready ? 'btn-soft' : 'btn-primary'}`} onClick={() => p.setReady(!me?.ready)} aria-pressed={!!me?.ready} data-testid="ready-toggle">
                  {me?.ready ? 'Ready - tap to cancel' : "I'm ready"}
                </button>
                <p className="mt-2 text-sm text-mist">The host starts the game once everyone is ready.</p>
              </>
            )}
          </div>
        </section>

        <section className="panel p-5" aria-labelledby="games-h">
          <h2 id="games-h" className="text-2xl font-extrabold">Choose the next game</h2>
          <p className="mt-1 text-sm text-mist">{p.isHost ? 'Select a game, or let the party vote and the most voted game is picked until you choose.' : 'Vote for what you want to play. The host makes the final pick.'}</p>
          <ul className="mt-4 grid gap-3">
            {GAMES.map(({ meta }) => {
              const votes = Object.values(party.votes).filter((v) => v === meta.id).length;
              const myVote = party.votes[p.me] === meta.id;
              const isSel = party.selectedGameId === meta.id;
              const n = connected.length;
              const fits = n >= meta.minPlayers && n <= meta.maxPlayers;
              return (
                <li key={meta.id} className={`flex items-stretch gap-3 rounded-2xl bg-midnight p-2.5 ring-1 transition ${isSel ? 'ring-2' : 'ring-edge'}`} style={isSel ? { boxShadow: `0 0 0 2px ${meta.accent}` } : undefined} data-testid={`lobby-game-${meta.id}`}>
                  <GameArt id={meta.id} className="hidden w-28 shrink-0 rounded-xl sm:block" />
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-0.5">
                    <div>
                      <p className="font-display text-lg font-bold leading-tight" style={{ color: meta.accent }}>{meta.name}</p>
                      <p className="text-xs text-mist">{playerRange(meta)} · {meta.durationMinutes[0]}-{meta.durationMinutes[1]} min</p>
                      {!fits && <p className="mt-0.5 text-xs text-amber">Needs {meta.minPlayers}-{meta.maxPlayers} connected players (you have {n})</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={`btn min-h-9 px-3 py-1 text-xs ${myVote ? 'bg-pulse text-midnight' : 'btn-soft'}`} aria-pressed={myVote} onClick={() => p.vote(meta.id)}>
                        {myVote ? 'Voted' : 'Vote'}{votes > 0 ? ` · ${votes}` : ''}
                      </button>
                      {p.isHost && (
                        <button type="button" className={`btn min-h-9 px-3 py-1 text-xs ${isSel ? 'bg-chalk text-midnight' : 'btn-soft'}`} aria-pressed={isSel} onClick={() => p.selectGame(meta.id)}>
                          {isSel ? 'Selected' : 'Select'}
                        </button>
                      )}
                      {!p.isHost && isSel && <span className="self-center text-xs font-semibold text-chalk">Host picked this</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {party.phase === 'starting' && secs !== null && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-midnight/90 backdrop-blur-sm" role="alert" aria-live="assertive">
          <p className="text-lg text-mist">{selected?.meta.name} starts in</p>
          <p className="font-display text-9xl font-extrabold" style={{ color: selected?.meta.accent, animation: 'pop .3s ease-out' }} key={secs}>{secs}</p>
          {p.isHost && <button type="button" className="btn btn-soft mt-6" onClick={() => p.backToLobby()}>Cancel</button>}
        </div>
      )}
    </div>
  );
}
