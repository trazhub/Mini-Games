# Security

Threat model: every browser client is untrusted and may be modified; the network between browser
and server is hostile; the public endpoint is reachable by anyone.

## Controls and where they are tested

| Requirement | Implementation | Test |
| --- | --- | --- |
| All clients untrusted; no forged scores | Clients send intents only; server simulates/scores; scores never accepted from clients | `security.test.ts` (forged score/position, extra fields), `orbit-swap.test.ts` |
| Server-issued identity | HMAC-signed guest token (`sub`, `exp`); identity = token subject, never a nickname or client-sent id | `security.test.ts` (forged/tampered/expired tokens, id spoofing) |
| Long-lived identity and recovery | Sliding ~1 year tokens; invalid tokens fall back to a new guest; optional recovery code stored only as a derived-key HMAC, restore limited to 10/min/IP | `identity.test.ts` |
| Arcade scores (browser-run games) | Server replays the submitted input log through the game's own sim and keeps only its score; strict log validation and caps (see below) | `arcade.test.ts` (game-core and server) |
| Host cannot abuse powers | Host-only: select/start/rematch/backToLobby/kick; host cannot edit scores/identities, exceed capacity or kick themselves | `security.test.ts` (host authorization) |
| Capacity | 12 per party, per-game min/max enforced at start; `MAX_ROOMS` | `rooms.test.ts` (full room) |
| Duplicate actions | First submission locks; replays rejected with a reason | `security.test.ts`, game unit tests |
| Malformed packets | zod validation per message type; 2 KB frame limit; unknown types ignored and counted | `security.test.ts` |
| Rate limiting | Token bucket per connection; strikes disconnect (4429); per-IP limits on guest creation, joins, room lookups; Nginx `limit_req` on top | `security.test.ts`, `origin.test.ts` |
| Server-side timers | Deadlines use server time (`ctx.now()`); late actions rejected; latency grace is explicit | game unit tests |
| Private information | `getState(viewer)` is per viewer: secret answers are not sent before reveal; spectators see nothing private | `majority-trap.test.ts`, `matches.test.ts` |
| CORS | Only `ALLOWED_ORIGINS` get `Access-Control-Allow-Origin`; Colyseus' default wildcard is removed | `origin.test.ts` (regression: wildcard leak) |
| WebSocket origin | Upgrade handler returns 403 for disallowed browser origins | `origin.test.ts` |
| Reconnection safety | Rejoin requires the signed token; newest connection replaces older; kicked guests are banned from that party | `rooms.test.ts`, `security.test.ts` |
| Output sanitisation | Nicknames: NFKC, control/bidi/zero-width removed, `<` `>` removed, 2-16 chars, deduplicated; React escapes all output | `rooms.test.ts`, `security.test.ts` |
| Secrets | `.env` git-ignored; production requires `SESSION_SECRET`; no secrets in `VITE_*`; `/metrics` private | `infra.test.ts` |
| Containers | non-root, read-only filesystem, `cap_drop: ALL`, `no-new-privileges`, DB not published, no Docker socket | `infra.test.ts` |

## Arcade games: threats and limits

Arcade games run in the browser (see `docs/GAME_ENGINE.md`, "Arcade games"). The client sends its
input log in `arcade:chunk` messages; the server replays it.

- **Forged score.** No score is ever read from the client. The room forwards only `{ i, n, d }`
  of each chunk to the game, and the game uses the score from `sim.replay(seed, cfg, events)`.
  A log with impossible input (ticks past the cap, backwards ticks, more than 15 events per
  second of ticks, codes above 255) is rejected as a whole and scores 0.
- **Log bombs.** A log is at most 16 chunks x 1400 characters by schema, the decoder rejects
  anything over 16 000 characters before decoding and anything over 12 000 decoded bytes, varints
  are capped at 4 bytes, and the replay is bounded by the sim's `maxTicks`. Each player's log is
  replayed at most once per match. Decoding is strict base64url (the chunk schema itself does not
  restrict the alphabet) and never throws.
- **Chunk flooding.** Chunks go through the same per-connection token bucket and strike counter
  as every other message: a malformed chunk (bad types, `i >= n`, `i > 15`, `n > 16`, data over 1400
  characters) is a strike, and 8 strikes in 10 s disconnect. Valid-shape abuse (duplicates,
  mixed `n`, chunks after submitting, chunks from spectators or outside a match) is ignored; mixed
  `n` only zeroes the sender's own score. Memory per player is bounded by the schema and
  released on submission.
- **Never submitting / disconnecting.** The match ends at
  `start + maxTicks / hz * 1000 + 5 s` on the server clock regardless of clients, with 0 for
  anyone who did not submit. It ends earlier once every participant who has not been removed from
  the party has submitted. A disconnected player keeps counting only until the room removes them
  (reconnect grace), so a socket blip does not zero a live run and a silent player can delay the
  others by at most the grace period or the deadline, whichever comes first.
- **Replay cost.** `sim.replay` runs synchronously on the room's tick, once per participant per
  match, bounded by `maxTicks`. Today's sims are cheap; a heavier sim needs an explicit cost budget
  (measure the worst-case replay time at `maxTicks` and keep it to a few milliseconds) or the
  replay must move off the tick.
- **Not prevented.** Replay proves a score is reachable from the inputs, not that a human produced
  them: a bot can play perfectly, or compute an optimal run offline and submit it. Replay also does
  not check wall-clock plausibility: a complete log can be submitted at t = 0 of the match. Both are
  accepted on purpose. In short: replay stops forged scores but not scripted perfect play;
  leaderboards are for fun.

## Nicknames are labels, not credentials

Two players may choose the same name; the server renames the later one (`Sam 2`). No permission
check anywhere uses a name. Impersonating someone by choosing their name gains nothing.

## Session tokens

`base64url(JSON{sub, iat, exp}) + "." + HMAC-SHA256`, constant-time comparison. Lifetime is
`SESSION_TTL_HOURS` (default 8760 h, about one year) and slides: `POST /api/guest` with a still-valid
token (`Authorization: Bearer` or body `resumeToken`) returns a renewed token for the same guest (200).
An expired, tampered, malformed or foreign-secret token is never an error: the client simply gets a
new guest (201), so stale clients cannot get stuck in a retry loop. The token format did not change
when the lifetime grew, so tokens issued earlier stay valid and refresh normally. Tokens
are bearer credentials kept in `sessionStorage` (per tab, cleared when the tab closes). If the
server restarts with a different secret in development, clients transparently request a new session
(error 4401 -> refresh -> retry). In production the secret is persistent. There is no cookie
authentication, so CSRF does not apply; the Origin checks defend against cross-site WebSocket use anyway.

## Recovery codes

Optional, for restoring a guest on another device (`POST /api/guest/recovery` with a Bearer token
issues one; `POST /api/guest/restore {code}` redeems it). Requires the database; without one both
answer `501 recovery_unavailable`.

- **A recovery code is a bearer secret.** Anyone holding it can become that guest (stats, history).
  The UI should present it with a copy hint like "keep this private; anyone with it can play as you".
  Requesting a new code replaces the stored one, so the old code stops working for **future**
  restores (`404 unknown_code`). It does not revoke anything already obtained: a session token
  issued from a leaked code, or a stolen token, stays valid until it expires, and there is no
  per-token or per-guest revocation short of rotating `SESSION_SECRET`, which logs everyone out
  (and invalidates every recovery code). Restoring does not revoke other sessions either.
- **Sliding refresh has no absolute cap.** Each refresh is bounded to `now + SESSION_TTL_HOURS`,
  but the chain of refreshes is unbounded, so a token that keeps being refreshed (including a
  stolen one) never ages out. An absolute cap based on the original `iat` is future work.
- **Format:** 16 Crockford base32 symbols (no `I`, `L`, `O`, `U`), `XXXX-XXXX-XXXX-XXXX`, 80 bits from
  `crypto.randomBytes`. Input is uppercased and spaces/dashes are ignored; wrong length or any
  character outside the alphabet is rejected (`400 invalid_code`) rather than guessed.
- **Brute force:** restore has its own limiter, 10 attempts per minute per client IP (`429
  rate_limited`), keyed exactly like the other per-IP limiters (`req.ip`, which honours
  `X-Forwarded-For` only when `TRUST_PROXY=true`; see Operational notes). With N live codes an
  attacker gets 14,400 guesses per IP per day; the chance of hitting any code is about
  N x 14,400 / 2^80, roughly 1e-14 per IP per day even for a million codes. Botnets scale this
  linearly and remain far from practical.
- **At rest:** only `HMAC-SHA256(K, code)` is stored, in `guests.recovery_hash` (nullable, unique
  index). `K = HMAC-SHA256(SESSION_SECRET, "minigamehub/recovery-code/v1")`, a domain-separated key
  derived from, never equal to, the session secret, so a recovery hash can never double as a session
  signature. A database leak without the secret yields no usable codes. Rotating `SESSION_SECRET`
  invalidates all codes. The plain code exists only in the one HTTP response; it is never stored or
  logged, and responses carry `Cache-Control: no-store`.
- **No timing oracle on the plaintext:** lookup is an equality query on the hash through the unique
  index. The server never compares the plaintext code, and any index timing only depends on the
  HMAC output, which an attacker cannot relate to a candidate code without `K`. A constant-time
  comparison is therefore not needed here.
- **No PII:** no email, phone or other contact data is collected for recovery.

## Data handling

Stored in PostgreSQL: random guest id + timestamps (+ the recovery-code HMAC, if one was requested); per match: game id, party code, timings,
and for each participant the nickname, avatar, score, rank. **No** IP addresses, user agents or
email. `guests.account_id` is a nullable placeholder for future optional accounts. Registration
is never mandatory. Prune old match rows with SQL if you want a retention policy.

## Operational notes

- Colyseus defaults to `Access-Control-Allow-Origin: *`; this project replaces it (see `app.ts`).
  When upgrading Colyseus, re-run `origin.test.ts`.
- `TRUST_PROXY=true` is only safe when the server is reachable solely through your proxy, which
  must **overwrite** `X-Forwarded-For` (the shipped Nginx config does). Otherwise clients could spoof
  their IP and bypass per-IP limits.
- npm audit: run `npm audit` periodically. Some findings come from build-only tooling.
- Abuse beyond the host's kick (reporting, persistent bans across parties, profanity filtering) is
  not implemented; see the roadmap.
- The ping/pong clock offset is used for display only; it never influences scoring.

## Residual risks

- **IPv6 and per-IP limits.** Every per-IP limiter (guest creation, recovery restore, joins, room,
  daily and `/api/me` lookups) keys on the full client address. One IPv6 subscriber usually holds
  a whole /64 (or more), so they can rotate addresses and get a fresh bucket each time. Keying
  IPv6 clients by their /64 prefix (and leaning on the proxy's own `limit_req`) is future work.
- **Session revocation.** No per-token revocation and no absolute session cap (see "Recovery codes").
- **Arcade scores.** Scripted play, offline-optimised runs and instant submissions are accepted
  (see "Arcade games: threats and limits").

## Reporting

Security issues: open a private report with the repository owner rather than a public issue.
