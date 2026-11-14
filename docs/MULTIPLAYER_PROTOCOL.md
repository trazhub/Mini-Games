# Multiplayer protocol

Transport: Colyseus over WebSocket (MessagePack frames). Room name `party`. Max client message
size: 2048 bytes (transport `maxPayload`; larger frames close the socket). Types and zod schemas live
in `packages/shared/src/{protocol,types}.ts` and are shared by client and server.

## HTTP API (base `https://backend.opop.eu.org`)

| Method + path | Purpose | Notes |
| --- | --- | --- |
| `POST /api/guest` | Issue or refresh a guest session `{guestId, token, expiresAt}` (see "Guest sessions" below) | 30/min/IP (`429`); token valid about 1 year (`SESSION_TTL_HOURS`, default 8760), refreshed on use; `200` refreshed, `201` new guest, `400 bad_request` for a malformed body, `413` for a body over 2 KB |
| `POST /api/guest/recovery` | Issue a recovery code `{code}` for the caller (replaces any previous code) | `Authorization: Bearer <token>`; shares the guest limiter (`429`); `401 unauthorized`, `501 recovery_unavailable` without a database, `503 unavailable` on a database error; `Cache-Control: no-store` |
| `POST /api/guest/restore` | Body `{code}`: restore that guest, returns a fresh session `{guestId, token, expiresAt}` | 10/min/IP (`429`); `400 invalid_code` (wrong length/alphabet), `404 unknown_code`, `501 recovery_unavailable` without a database, `503 unavailable`; `Cache-Control: no-store` |
| `GET /api/rooms/:code` | `{exists, players, capacity, phase, joinable}` | 60/min/IP; no member names |
| `GET /api/me/stats` | The caller's persisted stats | 60/min/IP (lookup limiter, checked before auth, `429`); `Authorization: Bearer <token>`, `401 unauthorized` otherwise |
| `GET /api/me/bests` | The caller's personal bests `{bests: [{gameId, mode, best, plays}]}` (`mode`: `solo`, `party`, `daily`), ordered by game then mode; `[]` without a database | 60/min/IP (lookup limiter, checked before auth, `429`); `Authorization: Bearer <token>`, `401 unauthorized` otherwise |
| `GET /api/daily/:gameId` | Today's (UTC) daily-challenge board `{day, entries: [{rank, nickname, avatar, score}]}`, top 50 by score, earlier run first on ties; `entries` is `[]` without a database; `404 {error:"unknown_game"}` for unknown or non-arcade games | 60/min/IP; no guest ids |
| `GET /health` | `{ok, db}` | used by Docker/monitoring |
| `GET /metrics` | Process + game metrics | loopback or `METRICS_TOKEN` only; Nginx returns 404 publicly |
| `POST /matchmake/create/party`, `/matchmake/joinById/party` | Colyseus seat reservation | Used by the SDK |

The `/api/rooms`, `/api/daily` and `/api/me/*` lookups share one 60/min/IP budget.

### Guest sessions

`POST /api/guest` with a still-valid token returns a renewed token for the same guest (`200`), with a
fresh lifetime of about one year. The supported way to present the token is the
`Authorization: Bearer <token>` header; a body `{resumeToken}` is also accepted as a fallback (the
header wins when both are valid). An expired, tampered, malformed or foreign-secret token is never an
error: the client simply gets a new guest (`201`). The request body is limited to 2 KB
(`413` above that); a body that fails the schema (for example a non-string `resumeToken` or one over
2048 characters) is `400 bad_request`.

Personal bests live in table `game_scores` (`guest_id`, `game_id`, `mode`, `best`, `plays`,
`updated_at`; primary key `(guest_id, game_id, mode)`). Every finished match upserts each
participant's score (`best = greatest(...)`, `plays + 1`, scores stored as
`min(2147483647, max(0, round(score)))`); the mode is `daily` for a daily-challenge match, otherwise
`solo` for a one-player match and `party` for more.

Daily challenge runs live in table `daily_runs` (`day`, `game_id`, `guest_id`, `nickname`, `avatar`,
`score`, `created_at`; primary key `(day, game_id, guest_id)`, so one run per guest, game and UTC day;
the row is inserted with score 0 when the daily match starts, which consumes the attempt, and the
score is only ever raised on completion). The score is also upserted into `game_scores` with mode
`daily`. A daily `start` needs a game of kind `arcade` and a party whose only member is the host. `start` takes
an optional payload `{daily?: boolean}` (see "Daily challenge" in GAME_ENGINE.md); unknown fields are
a protocol violation.

CORS: only origins in `ALLOWED_ORIGINS` get `Access-Control-Allow-Origin` (+ credentials, because
the SDK uses `credentials: "include"`). WebSocket upgrades from other browser origins get 403.

## Joining

```ts
const client = new Client('https://backend.opop.eu.org');
client.create('party', { token, nickname, avatar });   // new party (creator becomes host)
client.joinById(code, { token, nickname, avatar });    // join by 5-letter code
```

The room code **is** the Colyseus room id. Join errors: `4400` invalid options/nickname, `4401`
expired token (client fetches a new guest session and retries once), `4403` removed by host,
`4409` party full, `429` too many attempts, `522` unknown room.

## Client -> server messages

| Type | Payload | Who | Phase |
| --- | --- | --- | --- |
| `ping` | `{t}` | any | any |
| `profile` | `{nickname, avatar}` | any | any |
| `ready` | `{ready}` | non-host | lobby |
| `selectGame` | `{gameId}` | host | lobby, results |
| `vote` | `{gameId}` (toggle) | any | lobby, results |
| `start` | none, `{}` or `{daily: true}` (other fields are a protocol violation) | host | lobby, results |
| `rematch` | - | host | results |
| `backToLobby` | - | host | starting, playing (abort), results |
| `kick` | `{playerId}` | host | any (not self) |
| `g:action` | `{type, ...<=8 primitive fields}` | participants | playing |
| `arcade:chunk` | `{i: 0..15, n: 1..16, d: string <= 1400}` with `i < n` (one chunk of a base64url input log; extra fields are dropped) | participants | playing (arcade games) |

Anything else, malformed payloads and flooding are ignored/counted; 8 violations in 10 s
disconnect the client (close code 4429). Token bucket: 60 burst, 30 msg/s.

## Server -> client messages

| Type | Payload | When |
| --- | --- | --- |
| `you` | `{playerId}` | after join |
| `party` | `PartyState` | on any party change (coalesced per tick) |
| `game:start` | `{gameId, matchId, config, participantIds}` | match begins, and on (re)join mid-match |
| `game:state` | game-specific, per viewer | when the game is dirty (throttled), on (re)join |
| `game:event` | `{type, ...}` | transient game events (`snap`, `pad`, `rejected`, `hazard`...) |
| `game:end` | `MatchResults` | match finished |
| `pong` | `{t, serverTime}` | reply to `ping` (clock sync) |
| `notice` | `{level, message}` | validation feedback ("Waiting for Ana to ready up") |
| `kicked` | `{reason}` | just before a kick / duplicate takeover |

Close codes: `4000` consented leave, `4401` kicked, `4402` signed in elsewhere, `4410` party
closed, `4429` rate limited.

## PartyState

```
code, phase('lobby'|'starting'|'playing'|'results'), hostId, capacity(12),
players[{id,name,avatar,ready,connected,isHost,inGame,points,wins}],
selectedGameId, votes{playerId:gameId}, startsAt, current{gameId,matchId},
lastResults, matchesPlayed, serverTime
```

## Reconnection

Clients detect an unexpected close and call `joinById(code)` again with the same session token (backoff,
about 70 s total). The server keeps a disconnected member for 60 s (`RECONNECT_GRACE_MS`), marks
them `connected:false`, and on return resends `you`, `party`, and - during a match - `game:start`
plus `game:state`. A second connection for the same guest replaces the first (`kicked` with close
code 4402 to the old tab). A host who stays offline for 8 s is replaced by the longest-present
connected member; permanent removal (grace expiry, leave) migrates immediately.

## Game messages

**Arcade games** (any game with `meta.kind: 'arcade'`, e.g. Lane Runner) - at match start the game
broadcasts the event `arcade:start {seed, config, deadlineMs}` (`deadlineMs` = absolute server epoch
ms after which missing submissions score 0). State (per viewer, identical for everyone):
`{seed, config, deadline, submitted: playerId[]}`; no scores before the end. The client plays from
the seed, then sends its input log as `arcade:chunk` messages; the server replays it and uses only
its own score. A malformed chunk is a strike; chunks from spectators, outside a match, duplicates or
after the player's log was accepted are ignored. The match ends when every participant who has not
been removed from the party has submitted (a disconnected player still counts until their reconnect
grace expires) or at the deadline. Details: GAME_ENGINE.md, "Arcade games".

**Majority Trap** - action `{type:'answer', answer:'A'|'B', predict:'A'|'B'}` (first submission
locks). State: `phase(intro|question|reveal|done)`, `round`, `question`, `submitted[]`,
`mine` (own answer only), `reveal` (after the deadline), `scores`, `endsAt`.

**Echo Steps** - action `{type:'pad', pad:0..3}`. State: `phase(intro|watch|input|result|done)`,
`sequence` (only during `watch`/`result`), `showStartsAt`, `stepMs`, `endsAt`, per-player
`{status, progress, done}`, `scores`. Event `pad {ok, progress, done}` is instant feedback to the sender.

**Orbit Swap** - actions `{type:'swap', d:1|-1}` (1 = outer lane) and `{type:'flip'}`.
Events: `snap {t, p:[[angle, lane, dir, invuln, score, connected], ...]}` ~15 Hz (players in
`state.order`), `hazard {h:[id,lane,angle0,omega,width,t0,expiresAt]}`, `star {s:[...]}`,
`starx {id}`, `collect`, `hit`. Hazard angle at sim time `t` is `angle0 + omega*(t-t0)/1000`.
