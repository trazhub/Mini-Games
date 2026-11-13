# Game engine

`@minigamehub/game-core` defines how a mini-game plugs into a party. A game never touches
sockets, the roster, the database or wall-clock timers; it talks to a `GameContext`.

## Plugin contract

```ts
interface GamePlugin {
  meta: GameMeta;                       // id, name, description, category, min/max players, controls, rules
  defaultConfig: Record<string, unknown>; // server-side tunables (durations, rounds...)
  stateIntervalMs?: number;             // min ms between dirty state pushes (default 100)
  createInstance(ctx: GameContext): GameInstance;
}

interface GameInstance {
  start(): void;                                  // after the party's 3s countdown
  update(dtMs: number): void;                     // ~30 Hz server tick (timers live here)
  handleAction(playerId, action: RawAction): void; // untrusted input; must not throw
  getState(viewerId | null): unknown;             // per-viewer full state (null = spectator)
  onPlayerConnectionChange?(playerId, connected): void;
  onPlayerRemoved?(playerId): void;
  dispose(): void;                                // cleanup
}
```

| Plugin requirement | Where it is covered |
| --- | --- |
| Game ID, name, description, category, player counts, controls, rules | `meta` |
| Configuration | `defaultConfig` (+ server `GAME_CONFIG_OVERRIDES` for ops/tests) |
| State schema | The TypeScript type returned by `getState` (`types.ts` in each game) |
| Start logic | `start()` |
| Action handling | `handleAction()` |
| Timer handling | `update(dt)` using `ctx.now()` deadlines (or `TickTimers`) |
| Scoring | The game's own scoring (e.g. `majority-trap/src/scoring.ts`); the party ranks and awards party points |
| Completion | `ctx.finish({ scores, summary })` (idempotent) |
| Cleanup | `dispose()` |

## GameContext

| Member | Purpose |
| --- | --- |
| `matchId`, `players`, `config` | Match identity, participants (snapshot at start), merged config |
| `rng` | Seeded `mulberry32` RNG (`next`, `int`, `pick`, `shuffle`) |
| `now()` | Server epoch ms. Use for deadlines; never trust client time |
| `isConnected(id)` | Whether a participant currently has a connection |
| `broadcast(type, payload)` / `sendTo(id, type, payload)` | Transient events (`game:event`) |
| `markDirty()` | The state from `getState` changed; the party pushes it (throttled, per viewer) |
| `finish(result)` | End the match |

## Server tick and state delivery

`PartyRoom` runs a 33 ms simulation interval. Each tick: `instance.update(dt)`, then, if the
game marked itself dirty and `stateIntervalMs` has elapsed, one `game:state` message per member
built with `getState(viewerId)`. High-frequency data (Orbit Swap movement) bypasses state pushes
and uses `broadcast('snap', ...)` directly; the full state is only pushed on phase changes and
(re)joins.

## Results, party points and rematch

`finish({ scores })` ranks players with standard competition ranking ("1224": equal score and
tiebreak share a rank), awards **party points** `max(1, min(n, 5) - (rank - 1))`, increments
`wins` for rank 1, stores the match, and moves the party to `results`. The host can then
`rematch` (same game, new match id), `selectGame` + `start` (switch games), or `backToLobby`. If
nobody acts, the party returns to the lobby after 60 s.

## Determinism and testing

`GameHarness` (`game-core/src/testing.ts`) drives a plugin without sockets: `advance(ms)` moves
a fake clock and calls `update`; `sent` records outgoing events; `result` captures `finish`. All
launch games are unit-tested with it, and `OrbitSim` is deterministic for a given seed.

## Scoring rules of the launch games

**Majority Trap** (`scoring.ts`): per round, only players who answered count. Correct prediction
(you predicted the strictly-less-popular answer) +100; your own answer ended in the strict
minority +50; a tied vote has no minority and every answering player gets +50; non-responders 0.
Ties on final score are broken by correct predictions.

**Echo Steps**: the pattern grows by one step per round (starts at 3). Completing it scores
`100 + 10 x (length - 3)` plus a coarse speed bonus (0/10/20/30 by fraction of the input window
left, measured on the server clock). A wrong pad, a timeout or a disconnect eliminates the player.
The last survivor gets +50. The input deadline includes a 1 s server-side latency grace; no client
timestamps are ever read.

**Orbit Swap**: star +10 (golden +30), asteroid hit -10 (floor 0, then 1.8 s invulnerability),
75 s match; tie-break `stars - hits`.
