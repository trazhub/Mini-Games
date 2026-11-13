# Foundation + Open-Source Structure Implementation Plan (Plan 0 of the Nostalgia Arcade)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo clean and publishable as open source, and add the platform pieces every nostalgia game needs: solo play, durable guest identity with a recovery code, personal bests, a seeded and server-verified "arcade" game protocol, a Classics shelf, a legal notice, and one reference arcade game (Lane Runner) proving the whole path.

**Architecture:** Arcade games run in the browser from a server-issued seed; the client sends a compact input log in chunks; the server replays it through the same pure `sim` and uses its own score. Solo play is a one-person party (`minPlayers: 1`). Identity stays account-free: the existing signed guest token lives about a year and is refreshed on use, with an optional DB-backed recovery code.

**Tech Stack:** TypeScript, Colyseus 0.17 (`@colyseus/sdk`), Express, Drizzle + PostgreSQL (pglite in tests), React + Vite, Vitest, Playwright. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-nostalgia-arcade-design.md` (rev 2). Later waves (Ludo, Tank Duel, Fish Feast, ...) each get their own plan after this one ships.

## Global Constraints

- No proxy, port, DNS or firewall changes; games use the existing port 2567 and WebSocket.
- No mandatory accounts, ads, payments or voice chat; single Colyseus instance, no Redis.
- Original names, art and sound only; never use trademarked titles (list in spec section 3).
- Guest identity lasts about one year, refreshed on use; existing tokens and `SESSION_SECRET` stay valid (no forced logout).
- Solo = a one-person party; games declare `minPlayers: 1`.
- Every game: touch + keyboard controls, tap targets >= 44 px, `prefers-reduced-motion` respected, lazy-loaded chunk.
- `LIMITS.MAX_MESSAGE_BYTES` stays 2048; no global size increases.
- The existing 101 tests keep passing at every commit. Run `npm run verify` before the final commit of each task that touches code.
- Working titles only: "Lane Runner". NOTICE page + a contact/takedown line in Settings.

## Review Focus

1. **Hostile or broken arcade chunks** (17 chunks, `i >= n`, duplicate/out-of-order `i`, non-base64 data, wrong total length): ignored or strike-counted, never throw, never end the match early.
2. **Claimed score differs from replay**, or a log with impossible input (ticks past the cap, non-monotonic ticks, > 15 events/s): the server's replayed score is used; an invalid log scores 0.
3. **Player never submits or disconnects mid-run:** match still ends at the deadline with 0 for them; no hung room.
4. **Token edge cases:** expired, tampered, or foreign-secret token on refresh yields a fresh guest (not an error loop); recovery code brute force is rate-limited; restore with no database returns 501, not 500.
5. **Second tab / no `navigator.locks`:** a second tab must not steal or duplicate the persistent identity; browsers without Locks fall back to today's per-tab identity.

## File Structure (target, open-source layout)

```
/ README.md  LICENSE  CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md  CHANGELOG.md
.github/  workflows/ ISSUE_TEMPLATE/{bug_report,feature_request,new_game}.yml  PULL_REQUEST_TEMPLATE.md
apps/server  apps/web           deployable apps (unchanged layout)
packages/shared  packages/game-core   contracts + engine (game-core gains arcade.ts, arcade-client.ts)
games/<id>/                     one package per game (+ games/lane-runner)
infra/  scripts/  e2e/          deployment, tooling, browser tests
docs/  README.md (index)  LEGAL.md  ...existing guides...  superpowers/{specs,plans}/
```
Root `state/` (empty, untracked) is deleted. Site-specific details (Tailscale IP, outbound public IP, hostname, gateway) become placeholders in docs; private LAN addresses stay (non-routable; my call).

## Sequencing and a blocker

Tasks 1-7 and 10 (server side) touch no file that the uncommitted UI redesign on `design/living-arcade` modifies. **Tasks 8, 9 and 11 do** (`Home.tsx`, `Library.tsx`, `Profile.tsx`, `Settings.tsx`, `GameCard.tsx`, `Layout.tsx`, `GameView.tsx`, `e2e/*.spec.ts`). Do not start them until that redesign is committed and merged; implement 1-7 and 10 first. Work for this plan happens in a git worktree off `main` so the redesign's working tree is never touched.

---

### Task 1: Open-source scaffolding and hygiene test

**Files:**
- Create: `LICENSE` (MIT; owner may change), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1 text), `SECURITY.md` (report via GitHub private advisories; supported = `main`), `CHANGELOG.md`, `.github/ISSUE_TEMPLATE/{bug_report,feature_request,new_game}.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/README.md` (index of every doc), `docs/LEGAL.md` (rules from spec section 3, NOTICE wording)
- Modify: `package.json` (`license`, `repository`, `bugs`, `homepage`), `README.md` (badges, 5-line quickstart, repo tree above, link to docs index), `vitest.config.ts` (add `'scripts/**/*.test.ts'`), the docs listed below
- Delete: root `state/` if empty
- Test: `scripts/hygiene.test.ts`

**Interfaces:** Produces: nothing code-level; later tasks must keep the hygiene test green.

- [ ] **Step 1: Write `scripts/hygiene.test.ts`**, using `git ls-files` via `execFileSync`. Tests: `has the required open-source files` (every Create path above exists); `tracks no env files except examples` (only `.env.example`, `apps/web/.env.example`); `has no site-specific network identifiers in tracked files` (no match for the Tailscale CGNAT range regex `\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b`, the VM's outbound public IP, the VM hostname, or the LAN gateway address, all as they currently appear in `docs/`; the test excludes `package-lock.json` and its own path, the only place those literals may live); `declares license and repository in package.json` (`license === 'MIT'`, repository url contains `trazhub/Mini-Games`).
- [ ] **Step 2: Run** `npx vitest run scripts/hygiene.test.ts`. Expected: FAIL (missing files, identifiers present).
- [ ] **Step 3: Create/modify the files.** In every tracked doc the test flags (currently `docs/BACKUP_RESTORE.md`, `docs/DNS_AND_NETWORKING.md`, `docs/VM_DEPLOYMENT.md`, `docs/NGINX_PROXY.md`, `docs/NGINX_PROXY_PROMPT.md`) replace the Tailscale address with `<tailscale-ip>`, the outbound public IP with `<outbound-ip>`, the hostname with `<vm-host>`, the gateway with `<gateway>`; the test's failure output lists each offending file and line. `CONTRIBUTING.md` points to `docs/ADDING_A_GAME.md`, states the `npm run verify` gate, and the originality/trademark rule.
- [ ] **Step 4: Run** `npx vitest run scripts/hygiene.test.ts`. Expected: PASS.
- [ ] **Step 5: Run** `npm run verify`. Expected: exit 0, all tests pass.
- [ ] **Step 6: Commit** `chore: open-source scaffolding, legal notes, hygiene test`.

---

### Task 2: Shared contracts (kinds, arcade limits, protocol)

**Files:**
- Modify: `packages/shared/src/constants.ts`, `packages/shared/src/types.ts`, `packages/shared/src/protocol.ts`, `games/{majority-trap,echo-steps,orbit-swap}/src/meta.ts`
- Test: `packages/shared/src/protocol.test.ts`

**Interfaces:**
- Produces:
  - `constants.ts`: `GAME_KINDS = ['together','arcade','action'] as const`; `type GameKind`; `KIND_LABELS: Record<GameKind,string>`; `ARCADE = { MAX_CHUNKS: 16, CHUNK_CHARS: 1400, MAX_LOG_BYTES: 12000, MAX_EVENTS_PER_SEC: 15, SUBMIT_GRACE_MS: 5000 } as const`.
  - `types.ts`: `GameMeta` gains required `kind: GameKind` and `solo: boolean`.
  - `protocol.ts`: `C2S.arcade = 'arcade:chunk'`; `arcadeChunkSchema` = `{ i: int 0..15, n: int 1..16, d: string max 1400 }` (refine `i < n`); `type ArcadeChunk`; `GuestRequest` accepts optional `resumeToken`; `RestoreRequest { code: string }`; `RecoveryResponse { code: string }`; `BestEntry { gameId: string; mode: 'solo' | 'party' | 'daily'; best: number; plays: number }`; `BestsResponse { bests: BestEntry[] }`.
- Consumes: nothing.

- [ ] **Step 1: Write failing tests** in `protocol.test.ts`: `accepts a valid chunk`, `rejects i >= n`, `rejects n = 17`, `rejects data over 1400 chars`, `rejects non-integer i`, `ARCADE.MAX_CHUNKS * ARCADE.CHUNK_CHARS fits 2x MAX_LOG_BYTES in base64url` (sanity: `16*1400 >= ceil(12000*4/3)`).
- [ ] **Step 2: Run** `npx vitest run packages/shared`. Expected: FAIL (symbols missing).
- [ ] **Step 3: Implement** the interfaces above. Set `kind`/`solo` on existing games: majority-trap `together`/false, echo-steps `together`/false, orbit-swap `action`/false.
- [ ] **Step 4: Run** `npm run typecheck && npx vitest run packages/shared`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `feat(shared): game kinds, arcade limits and chunk protocol`.

---

### Task 3: Solo parties rank correctly and don't fake wins

**Files:**
- Modify: `apps/server/src/rooms/PartyRoom.ts` (`completeMatch`), `apps/server/src/db/repository.ts` (`recordMatch` stats)
- Test: `apps/server/test/solo.test.ts`

**Interfaces:**
- Produces: a documented rule: **a win (party `wins` and `player_stats.wins`) requires at least 2 participants.** Rank, party points and results still produced for one player.
- Consumes: `startTestServer({ games })`, `Bot` from `apps/server/test/helpers.ts`.

- [ ] **Step 1: Write failing tests** with an inline plugin `soloTest` (`minPlayers: 1`, `maxPlayers: 4`, `solo: true`, finishes immediately with one score): `solo party can start and finish` (one Bot: create, select, start; results have 1 ranking, `rank === 1`, `partyPoints === 1`); `solo match does not count as a win` (PartyState player `wins === 0`; with `createPgRepository` on pglite, `getStats` returns `wins: 0`, `gamesPlayed: 1`); `two-player match still awards one win`.
- [ ] **Step 2: Run** `npx vitest run apps/server/test/solo.test.ts`. Expected: FAIL on the two win assertions.
- [ ] **Step 3: Implement**: in `completeMatch` only `live.wins++` when `n > 1`; in `recordMatch` wins increment only when `m.participants.length > 1 && p.rank === 1`.
- [ ] **Step 4: Run** `npm test`. Expected: all 101 prior tests + new pass.
- [ ] **Step 5: Commit** `fix: solo matches never count as wins`.

---

### Task 4: Durable guest identity and recovery code

**Files:**
- Create: `apps/server/src/recovery.ts`, `apps/server/drizzle/0001_*.sql` (via `npm run db:generate`), `apps/server/test/identity.test.ts`
- Modify: `apps/server/src/config.ts` (`SESSION_TTL_HOURS` default 8760), `apps/server/src/session.ts`, `apps/server/src/db/schema.ts` (`guests.recovery_hash text unique null`), `apps/server/src/db/repository.ts`, `apps/server/src/app.ts`, `.env.example`, `docs/SECURITY.md`

**Interfaces:**
- Produces:
  - `session.ts`: `refreshGuestSession(secret: string, ttlMs: number, token: unknown, now?: number): { guestId: string; token: string; expiresAt: number } | null` (valid unexpired token -> same `guestId`, new expiry).
  - `recovery.ts`: `generateRecoveryCode(): string` (16 chars Crockford base32 in 4 groups, 80 bits, e.g. `ABCD-EFGH-JKMN-PQRS`); `normalizeRecoveryCode(input: string): string | null`; `hashRecoveryCode(code: string, secret: string): string` (HMAC-SHA256 hex).
  - `Repository` gains `setRecoveryHash(guestId: string, hash: string): Promise<void>` and `findGuestByRecoveryHash(hash: string): Promise<string | null>` (noop repo: no-ops / null).
  - HTTP: `POST /api/guest` with `Authorization: Bearer <token>` or body `resumeToken` returns the refreshed session; `POST /api/guest/recovery` (Bearer) returns `RecoveryResponse` (regenerating revokes the old code); `POST /api/guest/restore` body `RestoreRequest` returns `GuestResponse`, `400 invalid_code`, `404 unknown_code`, `429 rate_limited` (own limiter, 10/min/IP), `501 recovery_unavailable` when `!repo.enabled`.
- Consumes: `guestLimiter`-style limiter from `apps/server/src/ratelimit.ts`.

- [ ] **Step 1: Write failing tests** in `identity.test.ts`: `refresh keeps the guest id and extends expiry`; `expired token yields a new guest`; `tampered token yields a new guest`; `token signed with another secret yields a new guest`; `recovery code round-trips: create guest, get code, restore returns the same guestId`; `regenerating a code invalidates the previous one`; `normalizeRecoveryCode accepts lowercase, spaces and dashes, rejects wrong length and look-alike chars`; `restore is rate limited after 10 attempts`; `restore without a database returns 501`; `default session lifetime is 8760 hours`.
- [ ] **Step 2: Run** `npx vitest run apps/server/test/identity.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces; generate the migration with `npm run db:generate -w @minigamehub/server` and commit the SQL + meta. Store only the HMAC hash, never the code.
- [ ] **Step 4: Run** `npm run verify`. Expected: exit 0 (existing persistence/pg-driver tests apply the new migration).
- [ ] **Step 5: Commit** `feat(server): year-long refreshable guest identity and recovery codes`.

---

### Task 5: Personal bests (`game_scores`)

**Files:**
- Create: `apps/server/drizzle/0002_*.sql`, `apps/server/test/bests.test.ts`
- Modify: `apps/server/src/db/schema.ts`, `apps/server/src/db/repository.ts`, `apps/server/src/rooms/PartyRoom.ts` (`completeMatch`), `apps/server/src/app.ts`

**Interfaces:**
- Produces:
  - Table `game_scores(guest_id uuid, game_id text, mode text, best integer, plays integer, updated_at timestamptz)`, primary key `(guest_id, game_id, mode)`.
  - `Repository.recordScores(entries: { guestId: string; gameId: string; mode: 'solo' | 'party' | 'daily'; score: number }[]): Promise<void>` (upsert: `best = greatest`, `plays + 1`) and `getBests(guestId: string): Promise<BestEntry[]>`.
  - `GET /api/me/bests` (Bearer) -> `BestsResponse`; `401 unauthorized` without a valid token.
  - `completeMatch` records every participant's score: `mode = participants === 1 ? 'solo' : 'party'`.
- Consumes: `BestEntry` (Task 2).

- [ ] **Step 1: Write failing tests**: `first score creates a row with plays 1`; `a lower later score keeps the best and bumps plays`; `a higher score replaces the best`; `solo and party modes are tracked separately`; `/api/me/bests requires a token`; `finishing a solo match records a solo best`.
- [ ] **Step 2: Run** `npx vitest run apps/server/test/bests.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** schema, migration (`npm run db:generate`), repository methods (noop repo returns `[]`), the route, and the `completeMatch` call (fire-and-forget with logged catch, as `recordMatch`).
- [ ] **Step 4: Run** `npm run verify`. Expected: exit 0.
- [ ] **Step 5: Commit** `feat(server): personal bests per game and mode`.

---

### Task 6: Arcade engine in game-core

**Files:**
- Create: `packages/game-core/src/arcade.ts`, `packages/game-core/src/arcade-client.ts`, `packages/game-core/src/arcade.test.ts`
- Modify: `packages/game-core/src/index.ts`, `packages/game-core/src/client.ts` (`GameClientProps.sendArcade`), `apps/server/src/rooms/PartyRoom.ts` (route `C2S.arcade` to `onAction` as `{ type: 'arcade:chunk', i, n, d }`; invalid shape counts a strike), `docs/GAME_ENGINE.md`, `docs/SECURITY.md`

**Interfaces:**
- Produces (`arcade.ts`):
  - `interface InputEvent { tick: number; code: number }` (`code` 0..255)
  - `encodeInputLog(events: InputEvent[]): string` (delta-varint bytes -> base64url); `decodeInputLog(data: string, maxTicks: number): InputEvent[] | null` (null for bad base64url, > `ARCADE.MAX_LOG_BYTES`, non-monotonic ticks, tick > maxTicks, or more than `MAX_EVENTS_PER_SEC` average in any 1-second window)
  - `splitChunks(log: string): ArcadeChunk[]` and `class ChunkAssembler { add(c: ArcadeChunk): void; complete(): boolean; join(): string | null }` (ignores duplicates and out-of-range, rejects mixed `n`)
  - `interface ArcadeSim<Cfg> { hz: number; maxTicks(cfg: Cfg): number; replay(seed: number, cfg: Cfg, events: InputEvent[]): { score: number; ticks: number } }`
  - `createArcadePlugin<Cfg extends Record<string, unknown>>(def: { meta: GameMeta; defaultConfig: Cfg; sim: ArcadeSim<Cfg> }): GamePlugin`: seed = `config.seed` if a number, else `ctx.rng.int(1, 2147483647)`; `start()` broadcasts `arcade:start { seed, config, deadlineMs }`; `getState` -> `{ seed, config, deadline: number, submitted: string[] }` (never other players' scores before the end); on each `arcade:chunk` assemble, `decodeInputLog`, `sim.replay`, store the replayed score; finish with all scores when every connected participant has submitted, or at `start + maxTicks/hz*1000 + ARCADE.SUBMIT_GRACE_MS` (missing/invalid = 0); `summary: { seed }`.
- Produces (`arcade-client.ts`): `class ArcadeRecorder { constructor(hz: number); record(tick: number, code: number): void; finish(): ArcadeChunk[] }`.
- `GameClientProps.sendArcade: (chunk: ArcadeChunk) => void`.

- [ ] **Step 1: Write failing tests** (`arcade.test.ts`, with a trivial counter sim: score = number of events): `encode then decode round-trips`; `decode rejects non-monotonic ticks`; `decode rejects ticks beyond maxTicks`; `decode rejects more than 15 events per second`; `decode rejects invalid base64url`; `splitChunks stays within 1400 chars and reassembles`; `assembler ignores duplicate and out-of-range chunks`; `assembler rejects mixed n`; with `GameHarness`: `same seed gives same state seed`, `plugin uses the replayed score, not a claimed one` (chunks for 3 events -> score 3 regardless of any extra field), `finishes when all players submit`, `finishes at the deadline with 0 for a player who never submitted`, `ignores 17 chunks`, `an invalid log scores 0 and does not throw`, `a disconnected player does not block the deadline`.
- [ ] **Step 2: Run** `npx vitest run packages/game-core`. Expected: FAIL.
- [ ] **Step 3: Implement** per the interfaces (varint delta encoding is mine to choose; the tests pin behavior). Add an integration test `apps/server/test/arcade.test.ts` using `startTestServer({ games: [counterPlugin] })` and a real `Bot` that sends chunks via `room.send('arcade:chunk', ...)`: `a real client run is verified end to end`, `a hostile client sending 17 chunks is struck and the match still ends`.
- [ ] **Step 4: Run** `npm run verify`. Expected: exit 0.
- [ ] **Step 5: Document** in `docs/GAME_ENGINE.md` (arcade lifecycle, log format, "replay stops forged scores but not scripted perfect play; leaderboards are for fun") and `docs/SECURITY.md`.
- [ ] **Step 6: Commit** `feat(game-core): seeded, server-verified arcade protocol`.

---

### Task 7: Lane Runner (server side, reference arcade game)

**Files:**
- Create: `games/lane-runner/{package.json,tsconfig.json}`, `games/lane-runner/src/{meta.ts,sim.ts,server.ts,types.ts,lane-runner.test.ts}`
- Modify: `apps/server/src/games.ts` (one registry line), `apps/server/package.json`/root workspace links via `npm install`

**Interfaces:**
- Produces: `laneRunnerMeta: GameMeta` (`id: 'lane-runner'`, `kind: 'arcade'`, `solo: true`, `minPlayers: 1`, `maxPlayers: 8`, `category: 'arcade'`, `accent` of your choice); `laneRunnerSim: ArcadeSim<LaneConfig>` with `hz = 30`, `maxTicks = 2700` (90 s); input codes `1` = move left, `2` = move right; 3 lanes, obstacles and coins generated only from the seeded rng, speed ramps with distance; the run ends on collision; `score = floor(distance) + 25 * coins`; `laneRunnerPlugin = createArcadePlugin({ meta, defaultConfig, sim })`.
- Consumes: `createArcadePlugin`, `ArcadeSim`, `InputEvent` (Task 6).

- [ ] **Step 1: Write failing tests** (`lane-runner.test.ts`): `same seed and inputs give the same score`; `different seeds give different obstacle layouts`; `no input eventually ends the run by collision`; `moving left/right changes lane and stays within 0..2`; `collecting a coin adds 25`; `a perfect dodge log from a recorded run replays to the same score`; `an input log with ticks past 2700 is rejected by the plugin`; `plugin runs headless via GameHarness for 1 player and finishes`.
- [ ] **Step 2: Run** `npx vitest run games/lane-runner`. Expected: FAIL.
- [ ] **Step 3: Implement** `sim.ts` as a pure function module (no DOM, no `Date`, no `Math.random`) and wire the plugin; add the registry line in `apps/server/src/games.ts` and run `npm install`.
- [ ] **Step 4: Add an integration test** in `apps/server/test/arcade.test.ts`: `lane runner solo run through a real room records a solo best` (one Bot, Postgres on pglite, `getBests` shows `lane-runner` solo).
- [ ] **Step 5: Run** `npm run verify`. Expected: exit 0.
- [ ] **Step 6: Commit** `feat(games): Lane Runner arcade reference game (server + sim)`.

---

### Task 8: Web identity, recovery card, arcade plumbing  *(blocked until the UI redesign is merged)*

**Files:**
- Create: `apps/web/src/components/RecoveryCard.tsx`, `apps/web/src/lib/identity.ts`, `apps/web/src/lib/identity.test.ts`
- Modify: `apps/web/src/lib/storage.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/party.tsx` (`sendArcade` -> `room.send('arcade:chunk', chunk)`), `apps/web/src/pages/Profile.tsx` (mount `RecoveryCard`), `apps/web/src/pages/room/GameView.tsx` (pass `sendArcade`)

**Interfaces:**
- Produces: `identity.ts`: `claimPrimaryTab(): Promise<boolean>` (holds `navigator.locks` lock `mgh-primary` for the tab lifetime; resolves `false` when the lock is taken or `navigator.locks` is missing); `getStoredSession(primary: boolean)` / `storeSession(primary: boolean, s: StoredSession)` use `localStorage` when primary, `sessionStorage` otherwise; `api.ts`: `ensureSession()` sends the stored token as `Authorization` to refresh, then falls back to a fresh guest; `createRecoveryCode(token): Promise<string>`, `restoreGuest(code): Promise<StoredSession>`.
- Consumes: `/api/guest`, `/api/guest/recovery`, `/api/guest/restore`; `GameClientProps.sendArcade` (Task 6).

- [ ] **Step 1: Write failing tests** (`identity.test.ts`, jsdom or stubbed `navigator.locks`): `first tab becomes primary and persists to localStorage`; `second tab is not primary and uses sessionStorage`; `without navigator.locks every tab is non-primary (today's behavior)`; `storage that throws never crashes identity`.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/lib/identity.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified. `RecoveryCard`: shows "Save this code", copy button, a restore input; copy hints that anyone with the code can become this player.
- [ ] **Step 4: Run** `npm run verify`. Expected: exit 0.
- [ ] **Step 5: Commit** `feat(web): durable guest identity, recovery card, arcade send plumbing`.

---

### Task 9: Lane Runner client, Classics shelf, legal page  *(blocked until the UI redesign is merged)*

**Files:**
- Create: `games/lane-runner/src/client.tsx`, `apps/web/src/components/KindFilter.tsx`, `apps/web/src/lib/solo.ts`, `apps/web/src/pages/Legal.tsx`
- Modify: `apps/web/src/games/registry.ts` (one entry), `apps/web/src/pages/Library.tsx` (kind filter), `apps/web/src/components/GameCard.tsx` ("Play solo" when `meta.solo`), `apps/web/src/App.tsx` (route `/legal`), `apps/web/src/components/Layout.tsx` (footer link), `apps/web/src/pages/Settings.tsx` (contact/takedown line)

**Interfaces:**
- Produces: `solo.ts`: `startSolo(gameId: string): Promise<void>` (create party, select game, start; surfaces errors as toasts); `client.tsx` default export `ComponentType<GameClientProps>`: canvas 2D renderer running `laneRunnerSim` locally at 30 Hz from `state.seed`, `ArcadeRecorder` records inputs, on death calls `sendArcade` for each chunk, shows the score and waits for results; keyboard `ArrowLeft/ArrowRight/A/D`, touch: left/right half-screen tap zones (>= 44 px) and swipe; respects `reducedMotion`; `sfx('good'|'bad')` only.
- Consumes: Tasks 6-8.

- [ ] **Step 1: Write failing tests**: `registry has lane-runner with a lazy loader`; `KindFilter narrows the list by kind`; `startSolo calls create, select, start in order` (stubbed party API); component test `Lane Runner records left/right key presses as inputs 1 and 2`.
- [ ] **Step 2: Run** `npx vitest run apps/web games/lane-runner`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified; the Legal page renders `docs/LEGAL.md` content (copy as constants, not a runtime fetch).
- [ ] **Step 4: Run** `npm run verify`. Expected: exit 0; the Lane Runner chunk is a separate lazy bundle (check `apps/web/dist/assets`).
- [ ] **Step 5: Commit** `feat(web): Lane Runner client, Classics shelf, legal page`.

---

### Task 10: Daily challenge

**Files:**
- Create: `apps/server/drizzle/0003_*.sql`, `apps/server/test/daily.test.ts`, `packages/game-core/src/daily.ts`
- Modify: `packages/shared/src/protocol.ts` (`startSchema = { daily?: boolean }`), `apps/server/src/db/schema.ts`, `repository.ts`, `PartyRoom.ts` (`onStart`, `completeMatch`), `app.ts`

**Interfaces:**
- Produces: `daily.ts`: `dayKey(now: number): string` (UTC `YYYY-MM-DD`), `dailySeed(gameId: string, day: string): number` (FNV-1a 32-bit of `${gameId}:${day}`, fixed forever); table `daily_runs(day text, game_id text, guest_id uuid, nickname text, avatar text, score integer)` unique `(day, game_id, guest_id)`; `Repository.hasDailyRun(day, gameId, guestId): Promise<boolean>`, `recordDailyRun(entry): Promise<void>`, `dailyTop(day, gameId, limit): Promise<{ rank: number; nickname: string; avatar: string; score: number }[]>`; `start` with `{ daily: true }` is accepted only for `kind === 'arcade'` games with exactly one participant (else a warn notice) and sets `config.seed = dailySeed(...)`; a second attempt the same UTC day gets a notice and does not start; `GET /api/daily/:gameId` -> `{ day, entries }`.
- Consumes: `createArcadePlugin` config seed (Task 6), `recordScores` mode `'daily'` (Task 5).

- [ ] **Step 1: Write failing tests**: `dailySeed is stable for a fixed input (pin two literal values)`; `dayKey rolls over at 00:00 UTC`; `daily start is refused for a party of 2`; `daily start is refused for a non-arcade game`; `second daily attempt the same day is refused, next day allowed`; `two guests get the same seed on the same day`; `leaderboard orders by score and returns nickname + avatar only`; `GET /api/daily rejects unknown game ids with 404`.
- [ ] **Step 2: Run** `npx vitest run apps/server/test/daily.test.ts packages/game-core`. Expected: FAIL.
- [ ] **Step 3: Implement** per interfaces (migration via `npm run db:generate`).
- [ ] **Step 4: Run** `npm run verify`. Expected: exit 0.
- [ ] **Step 5: Commit** `feat: daily challenge for arcade games`.

---

### Task 11: End-to-end, docs and release check  *(blocked until the UI redesign is merged)*

**Files:**
- Create: `e2e/lane-runner.spec.ts`
- Modify: `docs/ADDING_A_GAME.md` (kinds, solo, arcade walkthrough using Lane Runner), `docs/ROADMAP.md` (waves 1-5), `docs/ARCHITECTURE.md`, `README.md` (Classics, legal link), `CHANGELOG.md`

**Interfaces:** Consumes everything above.

- [ ] **Step 1: Write the failing Playwright test** `lane-runner.spec.ts` in desktop and mobile projects: `plays a solo run and sees the results screen`, `touch controls move the runner on a phone viewport`, `legal page is reachable from the footer`, `recovery code restores the same nickname after clearing storage`.
- [ ] **Step 2: Run** `npx playwright test e2e/lane-runner.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Fix what the browser run exposes**; update the docs listed.
- [ ] **Step 4: Run** `npm run verify && npx playwright test`. Expected: exit 0 for both.
- [ ] **Step 5: Commit** `test(e2e): Lane Runner solo flow; docs for arcade games`.

---

## Self-review

- **Spec coverage:** open-source structure (T1); kinds/filters (T2, T9); solo flow incl. the unchecked one-player behavior (T3); durable identity + recovery (T4, T8); `game_scores` + personal bests (T5); arcade seed/submit/verify (T6); reference game (T7, T9); Classics shelf, NOTICE page and contact line (T9); daily challenge (T10); tests/docs (T11). Wave games (Ludo...) are deliberately later plans.
- **Type consistency:** `ArcadeChunk`, `ArcadeSim`, `InputEvent`, `BestEntry`, `recordScores`, `sendArcade`, `dailySeed` are defined once (T2/T4/T5/T6/T10) and used by the same names later.
- **Proportion:** interfaces and test names only; no function bodies.
- **Not in this plan:** deploying to the VM or pushing (both need your approval); later game waves; any proxy change.
