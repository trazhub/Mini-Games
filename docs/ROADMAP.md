# Roadmap

## Done (MVP)

Monorepo; design system; homepage, library, create/join, lobby, gameplay, results, profile,
settings; guest sessions; persistent party with host migration, ready/votes/kick, reconnection,
rematch and game switching; three server-authoritative games; PostgreSQL persistence; Docker
Compose + Nginx + backup deployment artifacts; GitHub Pages workflow; unit, integration, security,
e2e and load tests. Deployment is **prepared, not performed** (needs your approval).

## Next priorities

1. **Verify live**: push the repo, enable Pages, deploy the backend, then run the external checks in
   [DNS_AND_NETWORKING.md](DNS_AND_NETWORKING.md) (HTTP, HTTPS, real WSS) and a backup/restore round trip.
2. **Benchmark on the VM** with `scripts/loadtest.ts` and record real numbers.
3. Orbit Swap polish: local input prediction for the player's own lane swap, avatar sprites on the field, particles.
4. Moderation: report button, mute/ignore, profanity filter, cross-party bans.
5. Quick Play matchmaking with strangers (public rooms listing) behind explicit opt-in.
6. Optional accounts (Argon2/OAuth) using the nullable `guests.account_id`; leaderboards.
7. i18n and more accessibility passes (screen-reader announcements for game state changes).
8. Observability: Prometheus endpoint, alerts, structured logs.
9. Horizontal scaling only if measurements demand it (Redis presence/driver, sticky routing).

## Future game backlog (not implemented)

| # | Game | Players | Sketch |
| --- | --- | --- | --- |
| 1 | Floor Is Lava | 2-8 | Platforms vanish on a schedule; last one standing. Server-simulated grid. |
| 2 | Draw & Guess | 3-10 | One player draws, others guess; points for speed. Needs stroke validation/rate limits. |
| 3 | Push Arena | 2-8 | Top-down shoving on a shrinking platform; authoritative physics. |
| 4 | Hide & Hunt | 3-10 | Hiders disguise as props, hunters search; server-side visibility. |
| 5 | Mini Kart Chaos | 2-8 | Short-lap kart racing with items; authoritative movement + lag compensation. |
| 6 | Laser Dodge | 2-10 | Co-op/competitive survival against deterministic laser patterns (similar to Orbit hazards). |
| 7 | Impostor Word | 4-12 | Everyone gets a secret word except the impostor; discuss and vote. |
| 8 | Typing Battle | 2-12 | Race to type prompts accurately; server validates progress, not timestamps. |
| 9 | Bomb Pass | 3-12 | Pass a ticking bomb; random fuse on the server. |
| 10 | Emoji Detective | 3-10 | Deduce the hidden emoji from clues; co-op or competitive. |
| 11 | Reaction Royale | 2-12 | Elimination reaction test with server-timed GO; fairness via server arrival order. |
| 12 | Fake Answer | 3-10 | Write fake answers to trivia, vote for the real one. Needs text moderation. |
| 13 | Half the Map | 2-8 | Each player sees half a map; co-op navigation. |
| 14 | Circuit Panic | 2-6 | Co-op wiring puzzle under a timer, asymmetric information. |
| 15 | Gravity Vote | 3-12 | Vote to flip gravity in a shared platformer room. |
| 16 | Magnet Mayhem | 2-8 | Polarity-based arena brawler. |
| 17 | Pixel Heist | 2-6 | Stealth co-op: guards with server-side vision cones. |
| 18 | Boss Button | 2-12 | Co-op: everyone mashes within a rhythm window to damage a boss. |
| 19 | Blind Ranking | 3-10 | Rank items without seeing others' picks; reveal and compare. |
| 20 | Cargo Code | 2-6 | Co-op codebreaking/logistics puzzle with split manuals. |

Each follows [ADDING_A_GAME.md](ADDING_A_GAME.md); text-heavy ones (3, 7, 12) require moderation
work first, and physics games (3, 5, 16) need a fixed-step authoritative loop plus lag compensation.
