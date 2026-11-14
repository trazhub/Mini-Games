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
  category: 'party', kind: 'together', tags: ['party'], minPlayers: 2, maxPlayers: 8, durationMinutes: [1, 3],
  controls: { keyboard: ['Space: do the thing'], touch: ['Tap the button'] },
  rules: ['Rule one.', 'Rule two.'], mobileFriendly: true, accent: '#8b7cff',
};
```

`kind` groups the game on the library's kind filter: `together` (live, party-driven), `arcade` (each
player runs the game in their own browser and the server verifies it, see
[Arcade games](#arcade-games-lane-runner-as-the-example)) or `action` (real-time, server simulated).
Set `solo: true` and `minPlayers: 1` for a game that can be played alone: its poster then shows a
**Play solo** button that creates a private one-player party, picks the game and starts it.

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

> Arcade games skip steps 3 and 4: the server plugin is generated by `createArcadePlugin` and the
> client records inputs instead of sending intents. See the [arcade walkthrough](#arcade-games-lane-runner-as-the-example).

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

## Arcade games (Lane Runner as the example)

An arcade game is played entirely in the player's browser from a **server-issued seed**. The client
records its inputs, sends them as a compact log, and the server **replays the log** to compute the
score. Nothing the client claims about its score is ever used, so a cheater can at best submit a
legitimate-looking log. Use this for single-player-skill games (runners, puzzles, reaction courses);
anything with several players interacting live belongs in a normal server-authoritative game.

Lane Runner (`games/lane-runner`) is the reference:

| File | Role |
| --- | --- |
| `src/sim.ts` | Pure, deterministic simulation shared by browser and server. No DOM, clock or `Math.random`; the only randomness is the seeded `createRng`, consumed in an order that does not depend on inputs. Exports `laneRunnerSim: ArcadeSim` (`hz`, `maxTicks`, `replay`). |
| `src/server.ts` | `createArcadePlugin({ meta, defaultConfig, sim })`. That is the whole server side. |
| `src/controller.ts` | Pure browser-side controller: owns the local run and an `ArcadeRecorder`, applies an input to the run **only when the recorder accepted it**, so the local score equals the server replay. Unit-tested without a DOM. |
| `src/client.tsx` | Canvas renderer and input handling around the controller (keyboard, tap zones, swipe, on-screen buttons). |

How a run flows:

1. The server starts the match and exposes `{ seed, config, deadline, submitted }` as the game state
   (`ArcadeState`). Read the seed from the state, not only from the `arcade:start` event, so a client that
   joins late or reconnects still gets it.
2. The client builds the run from the seed and steps it at the sim's fixed `hz`. Every applied input goes
   through `recorder.record(run.tick, code)`; an input is recorded at the tick it is applied (before
   that tick is simulated), exactly like the replay.
3. When the run ends, `recorder.finish()` yields up to 16 chunks; send each with
   `props.sendArcade(chunk)`. Resending the same chunks is harmless, which is how the client retries until
   `state.submitted` contains the player (a dropped socket loses chunks).
4. The server replays the log, takes its own score, and ends the match once every non-removed participant
   has submitted (or at the deadline, where a missing log scores 0). The normal results screen follows.

Rules: stop the local run a little before `state.deadline`; keep the input rate under
`ARCADE.MAX_EVENTS_PER_SEC`; never use wall-clock time inside the sim. The seed may be pinned with
`config.seed`, which is how the **daily challenge** works: a one-player party started with
`{ daily: true }` gets `dailySeed(gameId, UTC day)`, one attempt per guest per day, and the public board
is `GET /api/daily/:gameId`.
