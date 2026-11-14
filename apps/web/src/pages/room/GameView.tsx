import type { GameClientProps } from '@minigamehub/game-core';
import { Component, lazy, Suspense, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameHUD } from '../../components/GameHUD';
import { ConnectionBadge } from '../../components/ConnectionBadge';
import { GAME_BY_ID } from '../../games/registry';
import { sfx } from '../../lib/audio';
import { useParty } from '../../lib/party';
import { prefersReducedMotion, useSettings } from '../../lib/settings';

const lazyCache = new Map<string, ComponentType<GameClientProps>>();
function gameComponent(id: string): ComponentType<GameClientProps> | null {
  const g = GAME_BY_ID[id];
  if (!g) return null;
  let c = lazyCache.get(id);
  if (!c) {
    c = lazy(g.load);
    lazyCache.set(id, c);
  }
  return c;
}

class Boundary extends Component<{ children: ReactNode; onLeave: () => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="panel p-8 text-center" role="alert">
        <h2 className="text-2xl font-extrabold">This game failed to load</h2>
        <p className="mt-2 text-mist">Check your connection and reload the page. The match keeps going for everyone else and you will rejoin it.</p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

export function GameView() {
  const p = useParty();
  const nav = useNavigate();
  const settings = useSettings();
  const [showRules, setShowRules] = useState(false);
  const party = p.party!;
  const start = p.gameStart;
  const gameId = start?.gameId ?? party.current?.gameId ?? '';
  const game = GAME_BY_ID[gameId];
  const Comp = useMemo(() => gameComponent(gameId), [gameId]);
  const spectator = !!start && !start.participantIds.includes(p.me);

  if (!game || !Comp) return <div className="px-4 py-24 text-center text-mist">Loading game…</div>;
  const { meta } = game;

  const ranked = party.players
    .filter((pl) => (start ? start.participantIds.includes(pl.id) : pl.inGame))
    .map((pl) => ({ ...pl, score: p.scores[pl.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className={`game-stage stage-${gameId}`} style={{ '--game-accent': gameId === 'orbit-swap' ? '#83b1ff' : gameId === 'echo-steps' ? '#68ddb1' : '#ff8c7e' } as CSSProperties}><div className="page-width">
      <div className="game-toolbar mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="game-title text-2xl font-extrabold sm:text-3xl">{meta.name}</h1>
          {spectator && <span className="rounded-full bg-hull px-3 py-1 text-xs font-semibold text-mist">Watching</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionBadge />
          <button type="button" className="btn btn-soft min-h-10 py-1.5" aria-expanded={showRules} onClick={() => setShowRules((v) => !v)}>
            {showRules ? 'Hide' : 'How to play'}
          </button>
          {p.isHost && (
            <button type="button" className="btn btn-danger min-h-10 py-1.5" onClick={() => p.backToLobby()}>
              End game
            </button>
          )}
          <button type="button" className="btn btn-ghost min-h-10 py-1.5" onClick={() => { p.leave(); nav('/'); }}>
            Leave
          </button>
        </div>
      </div>

      {p.status === 'reconnecting' && (
        <p className="mb-3 rounded-2xl bg-coral/15 px-4 py-2.5 text-sm text-coral ring-1 ring-coral/40" role="alert">
          Connection lost. Reconnecting you to the match…
        </p>
      )}

      {showRules && (
        <div className="panel mb-3 grid gap-4 p-5 text-sm sm:grid-cols-3">
          <div className="sm:col-span-1">
            <h2 className="font-bold">Rules</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-mist">{meta.rules.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
          <div>
            <h2 className="font-bold">Keyboard</h2>
            <ul className="mt-1 space-y-1 text-mist">{meta.controls.keyboard.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
          <div>
            <h2 className="font-bold">Touch</h2>
            <ul className="mt-1 space-y-1 text-mist">{meta.controls.touch.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_16rem]">
        <div className="panel game-surface min-h-[26rem] overflow-hidden p-2 sm:p-3" data-testid="game-surface">
          <Boundary onLeave={() => nav('/')}>
            <Suspense fallback={<div className="flex h-96 items-center justify-center text-mist" role="status"><span className="loading-piece" aria-hidden="true" />Loading {meta.name}…</div>}>
              {start ? (
                <Comp
                  key={start.matchId}
                  meta={meta}
                  state={p.gameState}
                  me={p.me}
                  spectator={spectator}
                  players={party.players}
                  participantIds={start.participantIds}
                  matchId={start.matchId}
                  send={p.gameAction}
                  subscribe={p.subscribeGame}
                  serverNow={p.serverNow}
                  reportScores={p.reportScores}
                  sendArcade={p.sendArcade}
                  reducedMotion={prefersReducedMotion(settings)}
                  sfx={sfx}
                />
              ) : (
                <div className="flex h-96 items-center justify-center text-mist" role="status">Syncing with the match…</div>
              )}
            </Suspense>
          </Boundary>
        </div>

        <GameHUD players={ranked} me={p.me} />
      </div>
    </div></div>
  );
}
