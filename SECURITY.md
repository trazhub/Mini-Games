# Security policy

## Reporting a vulnerability

Please report security problems **privately** using GitHub's private vulnerability reporting:
open the repository's **Security** tab and choose **Report a vulnerability**
(<https://github.com/trazhub/Mini-Games/security/advisories/new>). Do not open a public issue or pull
request for an unfixed vulnerability. The maintainer will acknowledge the report as soon as they see
it; fixes land on `main`.

## Supported versions

Only the `main` branch is supported. There are no maintained release branches.

## Scope

In scope:

- the game server (`apps/server`): HTTP API, WebSocket rooms, origin and CORS checks, input validation
- identity: guest sessions, session tokens, resume and recovery codes
- rate limits and abuse controls (per-IP, per-session, message size caps)
- the deployment files in `infra/` and the GitHub Actions workflows

Out of scope:

- leaderboards and scores: they exist for fun, are not a prize or a ranking of record, and a cheated
  casual score is not a vulnerability by itself. A way to make the server accept impossible scores is
  still welcome as a bug report, but is low severity
- denial of service by raw traffic volume against a self-hosted instance
- findings that need a modified or outdated browser, or physical access to a device

The threat model is described in [docs/SECURITY.md](docs/SECURITY.md).
