# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Illustrated posters (AI-generated with Canva, 960x720 JPG) for Majority Trap, Echo Steps, Orbit Swap and
  Lane Runner, shown on the library, lobby and home page; the old SVG art stays as a fallback for games without one.
- Recorded sound effects (Kenney Interface Sounds, CC0) replace the synthesised beeps, with the old synth as a
  fallback until a sample has loaded; the four Echo Steps pads are one sample at four pitches. Credits on the Legal page.

- Open-source scaffolding: `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor
  Covenant 2.1), `SECURITY.md`, GitHub issue forms (bug report, feature request, new game idea) and a
  pull request template.
- `docs/README.md` (index of every document) and `docs/LEGAL.md` (originality and trademark rules, NOTICE).
- `scripts/hygiene.test.ts`: fails when a tracked file contains a site-specific network identifier or an
  env file other than the examples, and checks the required open-source files and `package.json` metadata.
- README badges, a short quick start, and a link to the documentation index.
- Game kinds (`together`, `arcade`, `action`) and a `solo` flag in `GameMeta`; one-player parties can
  start games with `minPlayers: 1`.
- Long-lived guest identity: tokens last about one year and are refreshed by `POST /api/guest`
  (Bearer header or body `resumeToken`); optional recovery codes (`POST /api/guest/recovery`,
  `POST /api/guest/restore`, 10 restores/min/IP, only an HMAC stored).
- Personal bests per game and mode (`game_scores` table, `GET /api/me/bests`).
- Arcade protocol in `game-core`: seeded browser runs, input logs sent as `arcade:chunk` messages and
  replayed on the server, which keeps only its own score (`createArcadePlugin`, `ArcadeRecorder`).
- Lane Runner, the reference arcade game: deterministic sim, server plugin and a canvas browser client
  (keyboard, tap zones, swipe, on-screen buttons) with a pure run controller whose local score equals the
  server replay. Lazy-loaded as its own chunk.
- Web identity: the first tab keeps the guest session in `localStorage` (Web Lock `mgh-primary`), other tabs
  stay per-tab; the stored token is renewed instead of minting a new guest; a recovery card on the Profile page
  makes, copies and restores a recovery code.
- Library kind filter (Together / Arcade / Action), a **Play solo** button on solo games, and a Legal page
  (footer and Settings link) with the originality rules and takedown contact.
- End-to-end tests for the Lane Runner solo flow, touch controls, the legal page and the recovery card.
- Daily challenge for arcade games: one attempt per guest and UTC day with a shared seed, and a
  public board (`GET /api/daily/:gameId`, nickname and avatar only).

### Fixed

- Solo matches never count as wins (party or stored stats).
- A daily attempt is consumed when the match starts, and a daily start needs a one-member party.
- A momentary disconnect no longer zeroes a live arcade run (early finish waits for removal or the
  deadline); replayed arcade scores are clamped to a non-negative int4.

### Security

- `GET /api/me/stats` and `GET /api/me/bests` are rate limited per IP (shared lookup limiter).

### Changed

- Site-specific network details in the deployment docs (Tailscale address, outbound public IP, VM
  hostname, gateway, obsolete VM address) are now placeholders.
- `package.json` declares the MIT license, repository, bugs and homepage URLs.
- Vitest also runs `scripts/**/*.test.ts`.
- Guest session lifetime grows from 24 h to about one year (sliding); existing tokens stay valid.
