# Adding a mini-game

A new game is a new package under `games/` plus **two registry lines** (server and web). No lobby,
results, rematch, reconnection or party-point code changes.

## 1. Create the package

```
games/my-game/
  package.json        (copy games/echo-steps/package.json, change the name)
  tsconfig.json       (copy)
  src/
    meta.ts           client-safe description
    server.ts         authoritative logic (GamePlugin)
    client.tsx        React UI (default export)
    types.ts          state/action types shared by server.ts and client.tsx
    my-game.test.ts   unit tests with GameHarness
```

`package.json` must export the three entry points:

```json
"exports": { "./meta": "./src/meta.ts", "./server": "./src/server.ts", "./client": "./src/client.tsx" }
```

Run `npm install` once so the workspace is linked.

## 2. Meta

```ts
// src/meta.ts
import type { GameMeta } from '@minigamehub/shared';
export const myGameMeta: GameMeta = {
  id: 'my-game', name: 'My Game', tagline: 'One line.', description: 'Longer text.',
  category: 'party', tags: ['party'], minPlayers: 2, maxPlayers: 8, durationMinutes: [1, 3],
  controls: { keyboard: ['Space: do the thing'], touch: ['Tap the button'] },
  rules: ['Rule one.', 'Rule two.'], mobileFriendly: true, accent: '#8b7cff',
};
```

## 3. Server plugin (the example: "Reaction Tap" - fastest tap after GO wins a round)

```ts
// src/server.ts
import type { GameContext, GameInstance, GamePlugin, RawAction } from '@minigamehub/game-core';
import { myGameMeta } from './meta';

export const defaultConfig = { rounds: 3, minDelayMs: 1500, maxDelayMs: 4000 };

class ReactionTap implements GameInstance {
  private cfg: typeof defaultConfig;
  private round = 0;
  private goAt = 0;                       // server epoch ms when GO appears
  private winner: string | null = null;
  private scores = new Map<string, number>();

  constructor(private ctx: GameContext) {   // initialise from ctx in the constructor body
    this.cfg = { ...defaultConfig, ...(ctx.config as Partial<typeof defaultConfig>) };
    for (const p of ctx.players) this.scores.set(p.id, 0);
  }

  start() { this.nextRound(); }

  private nextRound() {
    this.round++;
    this.winner = null;
    this.goAt = this.ctx.now() + this.ctx.rng.int(this.cfg.minDelayMs, this.cfg.maxDelayMs);
    this.ctx.markDirty();
  }

  update() {
    // advance phases by comparing ctx.now() with deadlines; call ctx.finish(...) at the end
  }

  handleAction(playerId: string, a: RawAction) {
    if (a.type !== 'tap' || this.winner) return;
    if (this.ctx.now() < this.goAt) { this.scores.set(playerId, (this.scores.get(playerId) ?? 0) - 1); return; } // jumped the gun
    this.winner = playerId;                // first arrival on the SERVER wins
    this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + 1);
    this.ctx.markDirty();
  }

  getState(viewer: string | null) {         // never include data this viewer must not see yet
    return { round: this.round, goInMs: Math.max(0, this.goAt - this.ctx.now()), winner: this.winner, scores: Object.fromEntries(this.scores), viewer };
  }
  dispose() {}
}

export const myGamePlugin: GamePlugin = {
  meta: myGameMeta, defaultConfig, createInstance: (ctx) => new ReactionTap(ctx),
};
```

Rules of thumb:

- Validate every action (`typeof`, ranges, phase, participant). Never throw on bad input; ignore it
  or `ctx.sendTo(id, 'rejected', { reason })`.
- Use `ctx.now()` and deadlines for all timing. Put a short latency grace on deadlines.
- Never send data a viewer should not have yet. `getState(viewerId)` is per viewer.
- Call `ctx.finish({ scores: [{ playerId, score, tiebreak? }], summary })` exactly once. The party
  handles ranking, party points, results, rematch and persistence.
- Handle `onPlayerConnectionChange` (do not wait forever for disconnected players).

## 4. Client

```tsx
// src/client.tsx
import type { GameClientProps } from '@minigamehub/game-core';
import { useEffect } from 'react';
import type { MyState } from './types';

export default function MyGameClient({ state, send, reportScores, sfx, spectator }: GameClientProps<MyState>) {
  useEffect(() => { if (state) reportScores(state.scores); }, [state, reportScores]);
  if (!state) return <p>Loading…</p>;
  return <button disabled={spectator} onClick={() => { send({ type: 'tap' }); sfx('tap'); }}>Tap</button>;
}
```

`GameClientProps` also gives `me`, `players`, `participantIds`, `matchId`, `subscribe(listener)` for
transient `game:event`s, `serverNow()` (clock-synced, display only) and `reducedMotion`. The
component is remounted for every match (`key={matchId}`). Provide keyboard **and** touch controls and
use `className="touch-game"` on interactive surfaces to stop scrolling/zooming.

## 5. Register

```ts
// apps/server/src/games.ts
import { myGamePlugin } from '@minigamehub/game-my-game/server';
export const ALL_GAMES = [majorityTrapPlugin, echoStepsPlugin, orbitSwapPlugin, myGamePlugin];

// apps/web/src/games/registry.ts
import { myGameMeta } from '@minigamehub/game-my-game/meta';
{ meta: myGameMeta, load: () => import('@minigamehub/game-my-game/client') as never },
```

Add `"@minigamehub/game-my-game": "*"` to `apps/server/package.json` and `apps/web/package.json`,
add `GameArt` artwork for the id in `apps/web/src/components/GameArt.tsx` (a fallback panel is used
otherwise), then `npm install`.

## 6. Test

```ts
import { GameHarness } from '@minigamehub/game-core';
const h = new GameHarness(myGamePlugin, 3, { rounds: 1 });
h.instance.start(); h.advance(5000);
h.instance.handleAction('p1', { type: 'tap' });
expect(h.result).not.toBeNull();
```

Test: valid input, invalid input, duplicate actions, timers, disconnects, private-state
privacy, finishing. For an end-to-end check, copy a test from `apps/server/test/matches.test.ts`
(real clients through the party) and set short durations with `gameConfig`.
