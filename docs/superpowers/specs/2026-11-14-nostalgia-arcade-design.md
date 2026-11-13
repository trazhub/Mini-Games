# Nostalgia Arcade: design (rev 2)

Status: **DRAFT, awaiting approval.** Nothing here has been built.
Date: 2026-11-14. Stack: existing MiniGameHub monorepo (Colyseus + React + Phaser + Postgres).
Sources: the owner's two lists (`childhood_multiplayer_offline_games.txt`,
`famous_childhood_games_india.txt`) and the owner's instruction: "all the nostalgia games, same logic,
free of copyright and legal issues".

## 1. Intent

A browser arcade of the games a generation grew up on (LAN-cafe shooters, Ludo King, Mini Militia,
Tank Trouble, Feeding Frenzy, cricket, racers...), playable **with friends via a room code**. The
owner's constraint is legal safety, so each title is rebuilt as an **original game with the same
mechanics and feel**, never as a copy.

## 2. Goals, non-goals, anti-goals

Goals
- A "Classics" shelf that grows in waves; every game works on desktop and phone (touch + keyboard).
- Same gameplay logic and feel as the inspiration (Ludo rules, Tank Trouble's ricochets, Mini Militia's jetpack aim...).
- Friends play together; solo-friendly games also work alone.
- Each game ships with unit tests, a real-client integration test and a mobile-controls check.

Non-goals
- No ROMs/emulators/Flash players; no copied code, art, audio, maps, characters, names or logos.
- No accounts, ads, payments, voice chat. No second server instance, no Redis.
- **No proxy/DNS changes**: all games use the existing port 2567 and WebSocket.
- No open-world 3D, RTS or persistent-economy games (see section 4 "Not building").

Anti-goals
- A takedown or trademark complaint.
- A "clone" that feels worse than the original (laggy, floaty, unfair).
- Cheating that ruins shared leaderboards.

## 3. Legal guardrails (design rules, not legal advice; a lawyer should review before wide promotion)

1. Mechanics are free, expression is not: original art, synthesised sound, original level layouts.
2. Original names only. Never use: Counter-Strike, Minecraft, GTA, Among Us, Mini Militia, Ludo King, Tank Trouble,
   Feeding Frenzy, Tetris, Pac-Man, Mario, Pokemon, Angry Birds, Temple Run, Subway Surfers, Fruit Ninja, Clash,
   PUBG, Free Fire, 8 Ball Pool, WWE, Tekken, FIFA, Club Penguin, Ben 10, Papa's, Bloons, etc.
   Working titles are descriptive ("Tank Duel", "Fish Feast", "Jet Squad", "Traitor Station").
3. Traditional games (Ludo, Chess, Checkers, Snakes & Ladders, Pool rules, Cricket rules, Mancala...) are
   free to implement; only their branded editions are protected.
4. A NOTICE page: original implementations, no affiliation, trademarks belong to their owners; a contact/takedown
   line in Settings.
5. Held back (decide later, after legal review): platformers (Mario/Dave/Prince of Persia style), falling-block
   stackers, maze-chase, anything using licensed characters (Ben 10, WWE, Pokemon, Club Penguin).

## 4. Catalogue (the owner's lists mapped to original games)

Kinds: **T** Together (turn-based, server-run) / **A** Arcade (browser-run, seeded, server-verified) /
**R** Real-time action (server-authoritative at ~30 Hz, like Orbit Swap).

| Inspiration | Original game | Kind | Build size |
|---|---|---|---|
| Ludo King | **Ludo** (traditional rules, 2-4 players) | T | S |
| Tank Trouble | **Tank Duel** (ricochet shells, maze arenas, 2-8) | R | M |
| Feeding Frenzy | **Fish Feast** (eat smaller, avoid bigger, 2-10) | R | S |
| Mini Militia | **Jet Squad** (2D jetpack shooter, deathmatch/teams) | R | M |
| Among Us | **Traitor Station** (tasks, meetings, voting) | R+T | L |
| BombSquad / Bomberman | **Bomb Arena** (grid, blasts, power-ups) | R | M |
| NFS / TrackMania / Road Rash / Midtown / FlatOut / Blur | **Street Racers** (top-down racing, items, bumping) | R | M |
| 8 Ball Pool | **Pool** (8-ball rules, server physics) | R | M |
| Cricket 07 / Stick Cricket | **Hand Cricket** + **Quick Cricket** | T / A | S / M |
| FIFA | **Pocket Football** (2D, generic teams) | R | M |
| Plants vs Zombies / Bloons TD | **Lane Defence** (co-op) | R | M |
| Fireboy & Watergirl | **Twin Puzzle** (2-player co-op platform puzzle) | R | M |
| Temple Run / Subway Surfers / Hill Climb / Earn to Die | **Lane Runner**, **Hill Climber** | A | S |
| Angry Birds / Cut the Rope | **Slingshot Physics**, **Rope Cutter** | A | M |
| Zuma / Bejeweled / Fruit Ninja | **Marble Shooter**, **Match Three**, **Fruit Slicer** | A | S each |
| Chicken Invaders / Commando / Contra | **Invader Run** (space shooter), run-and-gun co-op | A / R | M |
| House of the Dead / Virtua Cop | **Shooting Gallery** | A | S |
| Tekken / WWE / Mortal Kombat | **Arena Fighter** (original characters) | R | L |
| PUBG / BGMI / Free Fire | **Last Zone** (2D top-down shrinking-zone royale) | R | L |
| Counter-Strike / CoD / TF2 | **Tactical Squad** (top-down teams, plant/defuse) | R | L |
| Left 4 Dead | **Dead Hall** (co-op survival) | R | L |
| Minecraft / Terraria / Roblox | **Block Yard** (small shared 2D build sandbox) | R | XL |
| Classic board games | Chess, Checkers, Snakes & Ladders, Dots & Boxes, Mancala, Reversi, Tic-Tac-Toe, Drop Four, Memory Match | T | S each |

**Not building** (and why): GTA I-V, Max Payne, Hitman, Far Cry, Assassin's Creed, Prototype, Just Cause, Bully,
I.G.I., Total Overdose (open-world/3D third-person, no browser-scale equivalent); Age of Empires, Warcraft III
(RTS, huge); SA-MP/VC:MP (mod servers of GTA); Clash of Clans/Royale (persistent economy, different product);
Papa's, Club Penguin (management/social worlds, different product); Pokemon (licensed).

## 5. Approaches considered

| | Description | Trade-off |
|---|---|---|
| A | All server-run | Cheat-proof; solo arcade lags and wastes CPU |
| **B (owner chose)** | Together = server-run turn-based; Arcade = browser-run with seed; Real-time action = server-run | Instant arcade feel, authoritative multiplayer; one-time engine work |
| C | Browser-only copies | Quickest, discards the multiplayer advantage |

## 6. Design (approach B)

### 6.1 Together (T)
Normal `GamePlugin`s: server owns the board, validates every move, ends the game, returns `GameResult`.
Reconnect, rematch, spectators come from `PartyRoom`. Ludo needs seeded dice from `ctx.rng` (server rolls).

### 6.2 Arcade (A)
`start()` broadcasts `{seed, config}`; clients run at 60 fps. Each game has a pure deterministic `sim`
shared by client and server (as in `games/orbit-swap/src/sim.ts`). Clients submit `{score, inputLog}`;
the server replays the log from the seed and uses its own score. Caps on log size and a submit deadline.
Solo = a one-person party with `minPlayers: 1`. I read `PartyRoom.onStart`/`beginGame`: one connected
player passes both. **Not yet checked:** ranking, party points and results with exactly one player; the
Foundation must verify and adjust with tests first.

### 6.3 Real-time action (R)
Same pattern as Orbit Swap: server tick ~30 Hz, clients send inputs only, server owns positions, hits and
score, clients interpolate. Per-game limits to respect: single Colyseus instance (6 vCPU), message size caps
already in `LIMITS`, and the existing per-IP rate limits. Each R game gets a load test (`scripts/loadtest.ts`)
before it ships, with the measured player/room capacity written down rather than assumed.

### 6.4 Identity and persistence (the one real engine change)
Guest tokens currently last 24 h, so a returning player becomes a new guest. **My call:** about one year,
refreshed on use, plus a copyable recovery code to restore the guest on another device; existing tokens and
`SESSION_SECRET` stay valid. New table `game_scores(guest_id, game_id, mode, best, plays, updated_at)` via
a Drizzle migration; personal bests appear on the Profile page.

### 6.5 Classics shelf (UI)
Home/Library get a Classics section with filters (Together / Arcade / Action, players, solo-friendly),
"Play solo" / "Play with friends" actions, rules + controls sheets from `GameMeta`. Each game is a lazy chunk.
Touch controls required for every game; 44 px minimum targets; reduced-motion respected.

### 6.6 Daily challenge (my proposal, optional)
Seed = `hash(gameId, UTC date)` for Arcade games, one attempt per guest per day, global daily board
(nickname + avatar only). Cheap on top of 6.2/6.4; cut it if unwanted.

## 7. Delivery waves (each wave deployed and verified before the next starts)

0. **Foundation:** solo party flow, arcade seed/submit/verify, long-lived identity + recovery code,
   `game_scores`, Classics shelf, NOTICE page; **Lane Runner** as the reference Arcade game.
1. **Indian staples, cheap and multiplayer:** Ludo, Tank Duel, Fish Feast.
2. **Action core:** Jet Squad, Traitor Station, Bomb Arena, Street Racers.
3. **Sports, co-op, quick arcades:** Pool, Hand Cricket, Pocket Football, Lane Defence, Twin Puzzle,
   Marble Shooter, Match Three, Fruit Slicer, Slingshot Physics, Hill Climber, Shooting Gallery.
4. **Large:** Tactical Squad, Last Zone, Dead Hall, Arena Fighter, Block Yard (XL, may be cut).
5. **Board-game classics** (can be interleaved earlier as cheap filler).

Shipping each wave: build and test locally, (with approval) pull and rebuild on the VM, (with approval)
push for Pages. Existing 101 tests must keep passing.

## 8. Constraints

Existing stack/layout, one registry line per side per game (`ADDING_A_GAME.md`); single instance; no proxy,
port or DNS changes; mobile-first controls; lazy-loaded game bundles; every game has tests.

## 9. Left to the builder
Per-game tuning, input-log encoding, recovery-code format, art/sound synthesis, bots for solo Together
games (optional), map/level layouts (must be original).

## 10. Open questions for the owner
1. Is the wave order right (Ludo, Tank Duel, Fish Feast first)? Reorder freely.
2. Held-back tier (platformers, stackers, maze-chase, licensed characters): skip, or revisit after legal review?
3. Keep or cut the daily challenge (6.6)?
4. Branch: the repo is on `design/living-arcade`, `main` lacks the Nginx commit. Which carries this work?
