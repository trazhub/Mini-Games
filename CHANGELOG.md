# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Open-source scaffolding: `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor
  Covenant 2.1), `SECURITY.md`, GitHub issue forms (bug report, feature request, new game idea) and a
  pull request template.
- `docs/README.md` (index of every document) and `docs/LEGAL.md` (originality and trademark rules, NOTICE).
- `scripts/hygiene.test.ts`: fails when a tracked file contains a site-specific network identifier or an
  env file other than the examples, and checks the required open-source files and `package.json` metadata.
- README badges, a short quick start, and a link to the documentation index.

### Changed

- Site-specific network details in the deployment docs (Tailscale address, outbound public IP, VM
  hostname, gateway, obsolete VM address) are now placeholders.
- `package.json` declares the MIT license, repository, bugs and homepage URLs.
- Vitest also runs `scripts/**/*.test.ts`.
