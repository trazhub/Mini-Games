# Security

Threat model: every browser client is untrusted and may be modified; the network between browser
and server is hostile; the public endpoint is reachable by anyone.

## Controls and where they are tested

| Requirement | Implementation | Test |
| --- | --- | --- |
| All clients untrusted; no forged scores | Clients send intents only; server simulates/scores; scores never accepted from clients | `security.test.ts` (forged score/position, extra fields), `orbit-swap.test.ts` |
| Server-issued identity | HMAC-signed guest token (`sub`, `exp`); identity = token subject, never a nickname or client-sent id | `security.test.ts` (forged/tampered/expired tokens, id spoofing) |
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

## Nicknames are labels, not credentials

Two players may choose the same name; the server renames the later one (`Sam 2`). No permission
check anywhere uses a name. Impersonating someone by choosing their name gains nothing.

## Session tokens

`base64url(JSON{sub, iat, exp}) + "." + HMAC-SHA256`, constant-time comparison, 24 h TTL. Tokens
are bearer credentials kept in `sessionStorage` (per tab, cleared when the tab closes). If the
server restarts with a different secret in development, clients transparently request a new session
(error 4401 -> refresh -> retry). In production the secret is persistent. There is no cookie
authentication, so CSRF does not apply; the Origin checks defend against cross-site WebSocket use anyway.

## Data handling

Stored in PostgreSQL: random guest id + timestamps; per match: game id, party code, timings,
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

## Reporting

Security issues: open a private report with the repository owner rather than a public issue.
