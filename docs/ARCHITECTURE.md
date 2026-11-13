# Architecture

## Overview

```
 Browser (GitHub Pages)                         Ubuntu VM (10.10.15.254)
┌──────────────────────────┐   HTTPS / WSS    ┌──────────────┐   HTTP/WS    ┌───────────────────────────────┐
│ React + Phaser (static)  │ ───────────────► │ Existing     │ ───────────► │ Docker Compose                │
│ https://trazhub.github.io│  backend.opop.   │ Nginx proxy  │   :2567      │  ┌─────────────────────────┐  │
│ /Mini-Games/ (hash routes)│  eu.org          │ (TLS, limits)│              │  │ server (Colyseus, Node) │  │
└──────────────────────────┘                  └──────────────┘              │  └────────────┬────────────┘  │
                                                                            │               │ private net   │
                                                                            │  ┌────────────▼────────────┐  │
                                                                            │  │ postgres (not published)│  │
                                                                            │  └─────────────────────────┘  │
                                                                            │  backup sidecar (pg_dump)     │
                                                                            └───────────────────────────────┘
```

Frontend and backend are fully separate. The browser talks to the backend only over HTTPS (guest
sessions, room lookup, Colyseus matchmaking) and secure WebSockets (the live room).

## Packages and dependency direction

```
shared  <──  game-core  <──  games/*  <──  apps/server
   ▲                              ▲
   └──────────────────────────────┴────────  apps/web
```

No cycles. `shared` holds contracts (types, zod schemas, constants). `game-core` holds the plugin
interface and helpers. Each `games/<id>` package exports three entry points:

| Export | Used by | Contains |
| --- | --- | --- |
| `./meta` | web + server | Name, category, player counts, rules, controls (no code dependencies) |
| `./server` | server only | The authoritative game logic (`GamePlugin`) |
| `./client` | web only (lazy) | React/Phaser UI |

Orbit Swap additionally keeps its simulation (`sim.ts`) free of Phaser so it runs on the server.

## The persistent party and game handoff

The central design decision: **one Colyseus room per party (`PartyRoom`), and games are sessions
hosted inside it.**

```
                 host: start                      game finishes / host ends
 lobby ───────────────────────► starting ─► playing ─────────────────────────► results
   ▲  (ready check, min/max)     (3s)      (GameInstance attached)               │
   └────────────────────────────────────────────────────────────────────────────┘
          backToLobby / rematch / auto-return after 60s
```

- Membership, identities, host, ready flags, votes and party points live in `PartyRoom` for the
  whole life of the party. They never move.
- Starting a match snapshots the connected members as *participants* and attaches a `GameInstance`
  created by the plugin. Players who join mid-match become spectators.
- Finishing a match disposes the instance, ranks the scores, awards party points, stores the match
  (best effort) and moves the party to `results`. The same connections continue in `lobby`.
- Because no second room is created, there is no player migration that could drop someone
  between games - this is the explicit "handoff" design.

## Identity

1. `POST /api/guest` returns `{guestId, token}`. The token is an HMAC-signed `{sub, iat, exp}`.
2. Joining a room sends the token; the server verifies it and uses `sub` as the player id.
3. The nickname is only a label. Authorisation never uses it (names can collide and are de-duplicated).
4. Reconnecting is "join the same room with the same token": the party maps it back to the existing
   member, re-sends the game state, and replaces any older connection (newest wins).

## Server-authoritative gameplay

- Clients send intents (`answer`, `pad`, `swap`, `flip`); the server validates, simulates and scores.
- Clients never send positions, scores or timestamps. Timers run on the server clock; clients get
  `endsAt` values (server epoch ms) and estimate the offset with ping/pong for display only.
- State pushes are per viewer, so private data (other players' secret answers) never leaves the
  server before the reveal.
- Orbit Swap sends compact player snapshots at ~15 Hz and entity spawn/despawn events;
  hazards move deterministically from server-provided parameters, so they cost no bandwidth per
  tick. Clients interpolate remote players ~110 ms in the past.

## Persistence

PostgreSQL stores guests (id + timestamps only), matches, participants and aggregate stats. Active
room state stays in memory in one server process. See [docs/SECURITY.md](SECURITY.md) for the data
minimisation choices. Without `DATABASE_URL` the platform runs without persistence.

## Single instance

One Colyseus process, in-memory presence. Scaling to several processes would need shared presence
and a room-coordination layer (Redis presence/driver) plus sticky routing - deliberately not built.
Capacity is measured, not promised (see [docs/PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)).

## Key files

| Concern | File |
| --- | --- |
| Party state machine, host/ready/votes/kick, handoff | `apps/server/src/rooms/PartyRoom.ts` |
| HTTP API, CORS, origin checks, metrics | `apps/server/src/app.ts` |
| Session tokens | `apps/server/src/session.ts` |
| Plugin contract | `packages/game-core/src/plugin.ts` |
| Wire protocol | `packages/shared/src/protocol.ts`, `types.ts` |
| Client connection, reconnection, clock sync | `apps/web/src/lib/party.tsx` |
