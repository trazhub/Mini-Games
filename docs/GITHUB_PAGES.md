# GitHub Pages (frontend)

- Repository: `trazhub/Mini-Games` (<https://github.com/trazhub/Mini-Games>)
- Site: <https://trazhub.github.io/Mini-Games/>
- Workflow: `.github/workflows/deploy-pages.yml`

> **Status:** the workflow is written and statically checked, but nothing has been pushed or
> deployed, and the repository has not been verified as live. The local `origin` is not
> configured. Pushing needs your approval.

## How the static build works

- Vite `base` is `/Mini-Games/` for production builds (and for `vite preview`); dev uses `/`.
  Override with `VITE_BASE_PATH` (e.g. a fork named differently).
- Routing is **hash-based** (`/Mini-Games/#/room/ABCDE`), so refreshes and deep links work on
  Pages without server rewrites or a 404 fallback.
- Public settings are build-time variables: `VITE_API_URL=https://backend.opop.eu.org`,
  `VITE_APP_NAME`. Never put secrets in `VITE_*`; they ship to every browser.
- Games are code-split. Phaser (about 357 KB gzipped) loads only when Orbit Swap starts; the
  initial page needs roughly 190 KB gzipped of JavaScript plus fonts.
- Fonts are self-hosted (`@fontsource-variable`), so there are no third-party requests.

## One-time repository setup (needs the repo owner)

1. Create/push the repository (see below).
2. GitHub: **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
3. Push to `main`: the workflow runs typecheck, lint, tests, builds `apps/web`, uploads
   `apps/web/dist` and deploys it with `actions/deploy-pages@v4`.

Pushing the existing local repository (only after you approve):

```powershell
git remote add origin https://github.com/trazhub/Mini-Games.git
git push -u origin main
```

## What the workflow does

| Step | Detail |
| --- | --- |
| Permissions | `contents: read`, `pages: write`, `id-token: write` (least privilege) |
| Concurrency | one deployment at a time, no cancellation mid-deploy |
| Build | `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build -w @minigamehub/web` |
| Guard | fails if `dist/index.html` does not reference `/Mini-Games/assets/` |
| Artifact | `actions/upload-pages-artifact@v3` with `path: apps/web/dist` |
| Deploy | `actions/deploy-pages@v4` into the `github-pages` environment |

`ci.yml` runs the same checks plus the Playwright suite on pull requests and non-main branches.

## Verifying a deployment

```powershell
curl.exe -I https://trazhub.github.io/Mini-Games/
# open the site, create a room: the connection badge should read "Connected"
# browser console must show no CORS errors (backend ALLOWED_ORIGINS=https://trazhub.github.io)
```

The Pages origin is `https://trazhub.github.io` (no path) - that exact string must be in the
backend's `ALLOWED_ORIGINS`.

## Local check of the exact artifact

```powershell
npm run build -w @minigamehub/web
npm run preview -w @minigamehub/web -- --port 4180
# http://localhost:4180/Mini-Games/  (e2e tests run against this)
```
