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
`wins` for rank 1 (only when at least 2 players took part; a solo finish still gets rank 1 and 1
party point but never counts as a win, in the party or in stored stats), stores the match, and moves the party to `results`. The host can then
`rematch` (same game, new match id), `selectGame` + `start` (switch games), or `backToLobby`. If
nobody acts, the party returns to the lobby after 60 s.

## Determinism and testing

`GameHarness` (`game-core/src/testing.ts`) drives a plugin without sockets: `advance(ms)` moves
a fake clock and calls `update`; `sent` records outgoing events; `result` captures `finish`. All
launch games are unit-tested with it, and `OrbitSim` is deterministic for a given seed.

## Arcade games

Arcade games (`meta.kind: 'arcade'`) run in the browser at 60 fps for instant feel, but the score
that counts is computed on the server. Build one with `createArcadePlugin({ meta, defaultConfig,
sim })` from `game-core/src/arcade.ts`; the browser side uses `ArcadeRecorder`
(`arcade-client.ts`) and `GameClientProps.sendArcade`.

```ts
interface ArcadeSim<Cfg> {
  hz: number;                                   // sim ticks per second
  maxTicks(cfg: Cfg): number;                   // hard cap on run length
  replay(seed, cfg, events: InputEvent[]): { score: number; ticks: number };
}
interface InputEvent { tick: number; code: number } // code 0..255, game-defined
```

**Lifecycle**

1. `start()` picks the seed (`config.seed` if it is an integer in 1..2147483647, otherwise
   `ctx.rng`), and broadcasts `arcade:start { seed, config, deadlineMs }`. `deadlineMs` is the server
   epoch deadline: `start + maxTicks / hz * 1000 + ARCADE.SUBMIT_GRACE_MS` (5 s grace).
2. The browser runs the same sim from the seed, calls `recorder.record(tick, code)` for every
   input and only applies inputs that `record` accepted (it drops what the server would reject).
3. When the run ends the client sends `recorder.finish()` chunk by chunk as `arcade:chunk`
   (`C2S.arcade`) messages `{ i, n, d }`.
4. The server reassembles the chunks, decodes and validates the log, runs `sim.replay` and stores
   **its own** score. Anything else the client sends (a "score" field, timings) is dropped by the
   room before it reaches the game.
5. The match ends as soon as every **connected** participant has submitted, or at the deadline.
   Missing, late or invalid submissions score 0. A disconnected player never blocks the end. With
   nobody connected the match waits for the deadline (players may still reconnect and submit).

`getState(viewer)` is `{ seed, config, deadline, submitted: playerId[] }`: no scores before the end.
`finish` sends every participant's replayed score with `summary: { seed }`.

**Log format.** For each event: `varint(zigzag(tick - previousTick))` then `varint(code)`
(unsigned LEB128, at most 4 bytes per varint; `previousTick` starts at 0), the whole byte string
base64url-encoded without padding. Ticks are **non-decreasing**: two inputs on the same tick are
fine (two keys on one frame); a backwards tick is rejected. The deltas are signed on purpose so a
backwards tick is representable and caught by the decoder rather than hidden by the format.
`decodeInputLog(data, maxTicks, hz = 60)` returns `null` (score 0) for: anything that is not strict
canonical base64url, more than `ARCADE.MAX_LOG_BYTES` (12 000) decoded bytes, a truncated or
over-long varint, a dangling tick without a code, a tick below 0 or above `maxTicks`, a code above
255, or more than `ARCADE.MAX_EVENTS_PER_SEC` (15) events inside any window of `hz` ticks. The
server always passes the sim's `hz`.

**Chunking.** The global 2 KB message limit stays, so logs travel in at most `ARCADE.MAX_CHUNKS`
(16) chunks of at most `ARCADE.CHUNK_CHARS` (1400) characters. `splitChunks(log)` produces them
(an empty log is one empty chunk, which still counts as a submission). `ChunkAssembler` ignores
duplicate indexes (first copy wins) and out-of-range or malformed chunks; a chunk whose `n`
differs from the first one poisons that player's submission (score 0). Once a player has
submitted, further chunks from them are ignored.

**Determinism rules for sims.** The same sim module runs in the browser and on the server, so:

- no `Date`, `performance.now()`, `Math.random()`, DOM, timers or I/O inside the sim; time is the
  tick number and randomness comes from `createRng(seed)`;
- prefer integer math (fixed-point positions, integer velocities); where floats are needed use
  plain `+ - * /` and avoid `Math.sin`/`Math.exp` style functions whose last bits may differ
  between engines, or quantise their results;
- iterate arrays in index order (not over object keys with numeric-looking names) and never
  depend on sort stability of equal elements;
- `replay` must be pure: same `(seed, cfg, events)` gives the same `{ score, ticks }`.

A sim that throws or returns a non-finite score gives that player 0; it never crashes the room.

In short: replay stops forged scores but not scripted perfect play; leaderboards are for fun.

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
