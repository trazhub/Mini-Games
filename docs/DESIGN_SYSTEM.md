# Mini-Games — Ticket Club

## Intent and audit

A free place for friends to play, with the personality of a small independent arcade. Game discovery and private rooms are the product; there is no marketing funnel.

The existing React/Vite monorepo uses hash routes (`/`, `/games`, `/play`, `/join/:code`, `/room/:code`, `/profile`, `/settings`). RoomShell follows server phases: lobby, starting, playing, results. PartyProvider owns Colyseus, reconnection, votes, readiness and authoritative match messages. Games are lazy-loaded packages; Orbit Swap renders with Phaser. These boundaries, APIs, game rules, production variables and `/Mini-Games/` build base are preserved.

The previous interface repeated purple accents, dark rounded panels, capsule metadata and the same card silhouette. Its orbital illustration had no playable interaction. Lobby players appeared as a conventional list, and game surfaces shared the platform treatment.

## Directions considered

- **Ticket Club (selected):** warm paper, bold ink, cut-out game posters, tactile controls, ticket-shaped room entry. An inviting social arcade with enough contrast for distinct games.
- **After Hours:** dark cabinet marquees and restrained signal lighting. Strong gameplay atmosphere, but too close to the existing dark shell and less distinctive for room entry.
- **Channel Surf:** broadcast typography, channel selectors and game-show transitions. Good for Majority Trap, less natural for the other two games.

Ticket Club makes the interface recognizable even without a logo. Original geometric characters and mechanical artwork describe actual game mechanics.

Reference principles: [Jackbox](https://www.jackboxgames.com/) puts social play and individual game personalities first; [Poki](https://poki.com/) leads with playable game discovery; [Fall Guys](https://www.fallguys.com/) builds a recognizable character-led entertainment world. No layouts, artwork or branding are copied.

## Tokens

| Token | Value | Purpose |
| --- | --- | --- |
| Paper / midnight compatibility token | `#f6f1e8` | Page and recessed inputs |
| Surface / slate | `#fffaf2` | Tickets and utility surfaces |
| Hull | `#e9e3d7` | Secondary controls |
| Ink / chalk | `#202724` | Text and structural strokes |
| Mist | `#60665d` | Secondary text |
| Edge | `#cec8ba` | Quiet dividers |
| Pulse | `#f8cf46` | Primary actions |
| Coral | `#b83e31` | Accessible error / Majority text |
| Mint | `#11745b` | Accessible positive states |
| Amber | `#806000` | Accessible warnings |

Game stages deliberately reset the semantic surface/text tokens to a dark local theme. Raw artwork colors are coral `#ff6858`, mint `#68ddb1`, electric blue `#4b8eff`, yellow `#f8cf46` and ink `#202724`. Avoid arbitrary color proliferation.

## Typography, shapes and navigation

Self-hosted, licensed Bricolage Grotesque Variable for display; DM Sans Variable for interface text. Heavy display type with tight tracking, readable body measure and stable tabular scores. The Mini-Games wordmark uses a tilted yellow directional mark and stacked lettering.

Use square editorial dividers, clipped tickets, asymmetric poster corners, circular game pieces and small-radius utility controls. Borders describe interactive edges. Hard, short offset shadows are reserved for pressable controls. No glass, decorative glows or gradient page backgrounds.

The navigation exposes Games, Create or join, Profile and Settings. Active rooms retain a return link. Mobile has a 44px menu control and expandable navigation. Preserve all hash routes and invite links. Skip navigation and visible keyboard focus are required.

## Components and interactions

- `ArcadeButton`: primary yellow, quiet paper, danger, and ink variants; real button semantics; short press travel.
- `GameCard` / `GameArt`: reusable game poster with three distinct original SVG worlds. Artwork runs a small gameplay-like preview only on hover or focus. Below-fold posters use `content-visibility` to defer rendering; game code stays lazy-loaded.
- `OrbitHero`: lightweight timing toy. Start the orbit, catch the spark as it crosses the marked zone, collect five. Enter/Space use native button activation. Reduced-motion mode offers an explicitly untimed spark collection interaction. No canvas, timers while idle, or multiplayer calls.
- `StartForm`: room-entry ticket; existing nickname, avatar, room lookup, errors and submit behavior retained. Create and join modes are exposed through accessible tab controls.
- `Avatar`: original SVG personalities; same persisted avatar IDs. `LobbyPlayer`: distinct ready, host, offline and self states. A local avatar reaction is playful without adding a new network message.
- `RoomCodeDisplay`: legible five-character code, copy code and copy invite controls with live feedback. No fake connection or occupancy statistics.
- `CountdownOverlay`: follows the existing authoritative `startsAt` clock, with host cancel retained.
- `GameHUD`: local dark game stage, visible rules, connection, host actions and actual live rankings. Gameplay remains the primary surface.
- Results: winner spotlight, real scores, rank stagger, party standings, recap, voting and rematch controls. Celebratory marks appear only after an actual match result.

## Individual game worlds

**Majority Trap:** coral print, oversized A/B lettering, contrasting ink/yellow answer surfaces, characters conspiring around a split vote. Question typography and result numbers carry dramatic weight. Preserve secret choices and server scoring.

**Echo Steps:** mint ground, diamond-arranged pads, numbered beat indicators, sequenced emphasis. Crisp activated pad feedback replaces broad blur. Keep timing, touch and keyboard mappings exactly as before.

**Orbit Swap:** blue ground, orbit tracks, yellow collectible star, coral hazard arc and a recognizable pilot. Dark Phaser field and dedicated score/time HUD retain visual priority. Only renderer styling changes; simulation, interpolation and controls remain intact.

## Motion and accessibility

Short entrance and press transitions; orbit motion only inside the toy or game artwork preview. No perpetual page-wide floating. Honor both `prefers-reduced-motion` and the existing in-app preference. Reduced motion removes decorative movement and offers the untimed hero alternative. Game sequence timing is essential information and remains available.

Use semantic headings, labels, real links, buttons, pressed states and status announcements. Never rely on color alone for ready/offline/selected states. Touch actions must have a keyboard activation path. Safe-area padding, wrapping codes and responsive player grids support small phones. Essential actions never depend on hover.

## Implementation and verification plan

1. Preserve a clean initial worktree; add design tokens and shared components.
2. Replace shell, homepage, posters and library. Add the timing toy with reduced-motion behavior.
3. Restyle existing room entry, lobby, countdown, game HUD and results without changing protocol.
4. Check TypeScript, lint, unit/server tests and production build.
5. Run real-browser desktop/mobile flows under `/Mini-Games/`, including all three games, invalid codes, readiness, reconnect and results. Capture desktop/mobile screenshots, inspect overflow, focus and reduced motion. Record actual results below.

## Verification record

Pending implementation checks. Screenshots and test outcomes will be recorded after verification.
