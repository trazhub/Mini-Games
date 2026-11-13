# Multiplayer protocol

Transport: Colyseus over WebSocket (MessagePack frames). Room name `party`. Max client message
size: 2048 bytes (transport `maxPayload`; larger frames close the socket). Types and zod schemas live
in `packages/shared/src/{protocol,types}.ts` and are shared by client and server.

## HTTP API (base `https://backend.opop.eu.org`)

| Method + path | Purpose | Notes |
| --- | --- | --- |
| `POST /api/guest` | Issue a guest session `{guestId, token, expiresAt}` | 30/min/IP; token valid 24 h |
| `GET /api/rooms/:code` | `{exists, players, capacity, phase, joinable}` | 60/min/IP; no member names |
| `GET /api/me/stats` | The caller's persisted stats | `Authorization: Bearer <token>` |
| `GET /health` | `{ok, db}` | used by Docker/monitoring |
| `GET /metrics` | Process + game metrics | loopback or `METRICS_TOKEN` only; Nginx returns 404 publicly |
| `POST /matchmake/create/party`, `/matchmake/joinById/party` | Colyseus seat reservation | Used by the SDK |

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
| `start` | - | host | lobby, results |
| `rematch` | - | host | results |
| `backToLobby` | - | host | starting, playing (abort), results |
| `kick` | `{playerId}` | host | any (not self) |
| `g:action` | `{type, ...<=8 primitive fields}` | participants | playing |

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
