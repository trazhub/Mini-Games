# Contributing to MiniGameHub

Thanks for helping. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report security
problems privately, see [SECURITY.md](SECURITY.md).

## Setup

Node.js 22+ and `npm install`. See [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md).

## Adding a game

Follow [docs/ADDING_A_GAME.md](docs/ADDING_A_GAME.md): a new game is a package under `games/` plus two
registry lines. You can also propose one first with the "New game idea" issue template.

## Originality and trademarks

Every game must be original: original name, art, synthesised sound and level layouts. Game mechanics
are free to reuse; names, characters and expression of existing commercial games are not. Never use a
third-party trademark in a game name, asset, code comment or documentation as if it were ours. Traditional
games (Chess, Ludo and similar) are fine. The full rules and the NOTICE text are in
[docs/LEGAL.md](docs/LEGAL.md). Pull requests that break them will be asked to change before merging.

## The `npm run verify` gate

Before opening a pull request, run:

```
npm run verify
```

It runs typecheck, lint, the unit and integration tests, and the production build, the same as CI. It
must exit 0. Add or update tests for behaviour changes; end-to-end tests are `npm run test:e2e`.

A hygiene test (`scripts/hygiene.test.ts`) also runs as part of `npm test`. It fails if a tracked file
contains a site-specific network identifier (a public IP address, a Tailscale address, or a private
address other than the documented example) or an env file other than the `.env.example` files. Use
placeholders such as `<tailscale-ip>` in docs.

## Commit messages

Use short imperative subjects in the Conventional Commits style: `feat: ...`, `fix: ...`,
`docs: ...`, `chore: ...`, `test: ...`, optionally with a scope such as `feat(shared): ...`. Explain the
why in the body when it is not obvious. Keep one logical change per commit.

## Pull requests

Branch from `main`, keep the change focused, fill in the pull request template, and add a line to
`CHANGELOG.md` under "Unreleased".
