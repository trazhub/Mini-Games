import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Spark } from '../../components/ArcadeButton';
import { ConnectionBadge } from '../../components/ConnectionBadge';
import { ScoreReveal } from '../../components/ScoreReveal';
import { GAME_BY_ID, GAMES } from '../../games/registry';
import { sfx } from '../../lib/audio';
import { useParty } from '../../lib/party';

export function Results() {
  const p = useParty();
  const nav = useNavigate();
  const party = p.party!;
  const r = party.lastResults;
  const [confirmedLeave, setConfirmedLeave] = useState(false);
  const iWon = !!r && r.winnerIds.includes(p.me);

  useEffect(() => {
    if (!r) return;
    sfx(iWon ? 'win' : 'tap');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.matchId]);

  if (!r) return <div className="px-4 py-24 text-center text-mist">Loading results…</div>;
  const winners = r.rankings.filter((x) => r.winnerIds.includes(x.playerId));
  const myVote = party.votes[p.me];

  return (
    <div className="results-page mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-mist">{r.gameName} · party {party.code}</p>
        <ConnectionBadge />
      </div>

      <section className="winner-spotlight" aria-labelledby="winner-h" data-testid="winner-banner">
        <Spark className="winner-burst" />
        <p className="mb-5 text-xs font-semibold">Good game. Great bragging rights.</p>
        <div className="winner-avatars">
          {winners.slice(0, 4).map((w) => (
            <Avatar key={w.playerId} id={w.avatar} size={84} className="ring-4 ring-slate" />
          ))}
        </div>
        <h1 id="winner-h" className="mt-4 text-4xl font-extrabold sm:text-5xl">
          {winners.length === 1 ? `${winners[0]!.name} wins` : `${winners.map((w) => w.name).join(' and ')} tie`}
        </h1>
        <p className="mt-2">{iWon ? 'That was you. Nicely played.' : 'Everyone gets a party point or more for finishing.'}</p>
        <Spark className="winner-burst" />
      </section>

      <section className="mt-6" aria-labelledby="board-h">
        <h2 id="board-h" className="text-2xl font-extrabold">Final scores</h2>
        <ol className="mt-3 space-y-2" data-testid="scoreboard">
          {r.rankings.map((x, i) => <ScoreReveal key={x.playerId} ranking={x} isMe={x.playerId === p.me} index={i} />)}
        </ol>
      </section>

      <Summary gameId={r.gameId} summary={r.summary} names={Object.fromEntries(r.rankings.map((x) => [x.playerId, x.name]))} />

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="panel p-5" aria-labelledby="party-h">
          <h2 id="party-h" className="text-xl font-bold">Party standings</h2>
          <ol className="mt-3 space-y-1.5 text-sm">
            {[...party.players].sort((a, b) => b.points - a.points).map((pl) => (
              <li key={pl.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 truncate"><Avatar id={pl.avatar} size={24} />{pl.name}{!pl.connected && <span className="text-xs text-coral">offline</span>}</span>
                <span className="tabular-nums text-mist">{pl.points} pts · {pl.wins} {pl.wins === 1 ? 'win' : 'wins'}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel p-5" aria-labelledby="next-h">
          <h2 id="next-h" className="text-xl font-bold">What next?</h2>
          {p.isHost ? (
            <div className="mt-3 grid gap-2">
              <button type="button" className="btn btn-primary" onClick={() => p.rematch()} data-testid="rematch">Rematch {r.gameName}</button>
              <button type="button" className="btn btn-soft" onClick={() => p.backToLobby()} data-testid="back-to-lobby">Return to lobby</button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-mist">The host picks what happens next. You can vote for a game below.</p>
          )}
          <h3 className="mt-5 text-sm font-semibold">Vote for another game</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {GAMES.map(({ meta }) => {
              const votes = Object.values(party.votes).filter((v) => v === meta.id).length;
              return (
                <button key={meta.id} type="button" aria-pressed={myVote === meta.id} className={`btn min-h-10 py-1.5 text-sm ${myVote === meta.id ? 'bg-pulse text-midnight' : 'btn-soft'}`} onClick={() => p.vote(meta.id)}>
                  {meta.name}{votes ? ` · ${votes}` : ''}
                </button>
              );
            })}
          </div>
          {p.isHost && party.selectedGameId && party.selectedGameId !== r.gameId && (
            <button type="button" className="btn btn-primary mt-4 w-full" onClick={() => p.start()}>
              Start {GAME_BY_ID[party.selectedGameId]?.meta.name}
            </button>
          )}
          <p className="mt-4 text-xs text-mist">Without a host choice the party returns to the lobby automatically after a minute.</p>
          <div className="mt-3 border-t border-edge/60 pt-3">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => (confirmedLeave ? (p.leave(), nav('/')) : (setConfirmedLeave(true), setTimeout(() => setConfirmedLeave(false), 3000)))}>
              {confirmedLeave ? 'Tap again to leave the party' : 'Leave party'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Summary({ gameId, summary, names }: { gameId: string; summary?: Record<string, unknown>; names: Record<string, string> }) {
  if (!summary) return null;
  if (gameId === 'majority-trap') {
    const rounds = (summary.rounds as { question: string; counts: { A: number; B: number }; minority: 'A' | 'B' | null }[] | undefined) ?? [];
    if (!rounds.length) return null;
    return (
      <section className="mt-8" aria-labelledby="sum-h">
        <h2 id="sum-h" className="text-xl font-bold">Round recap</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {rounds.map((rd, i) => (
            <li key={i} className="rounded-xl bg-slate px-4 py-2.5 ring-1 ring-edge">
              <span className="font-medium">{rd.question}</span>
              <span className="ml-2 text-mist">A {rd.counts.A} - B {rd.counts.B}{rd.minority ? ` · minority ${rd.minority}` : ' · tie'}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (gameId === 'echo-steps') {
    return <p className="mt-6 text-sm text-mist">Longest pattern: {String(summary.longestPattern ?? '-')} steps over {String(summary.roundsPlayed ?? '-')} rounds.</p>;
  }
  if (gameId === 'orbit-swap') {
    const stars = (summary.stars as Record<string, number> | undefined) ?? {};
    const hits = (summary.hits as Record<string, number> | undefined) ?? {};
    return (
      <section className="mt-8" aria-labelledby="sum-h">
        <h2 id="sum-h" className="text-xl font-bold">Flight log</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {Object.keys(stars).map((id) => (
            <li key={id} className="rounded-xl bg-slate px-4 py-2.5 ring-1 ring-edge">
              <span className="font-medium">{names[id] ?? 'Player'}</span>
              <span className="ml-2 text-mist">{stars[id]} stars · {hits[id] ?? 0} hits</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return null;
}
