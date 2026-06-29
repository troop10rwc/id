# troop10rwc/id — member identity hub

The Troop 10 RWC **member home**: Slack-enrollment + passkey (WebAuthn) auth that
issues the shared session every member service trusts. Replaces Cloudflare Access.
Deploys independently to its own subdomain (`id.troop10rwc.org`).

- **Slack** is the one-time enrollment gate (locked to workspace `TN69FH34Y`).
- **Passkeys** are the daily driver (conditional-UI autofill login).
- **Sessions** are opaque tokens in D1 (Option B — instant revocation). App
  Workers validate them with `@troop10rwc/worker-kit`'s `requireSession`.

## URLs

| Path | Purpose |
|---|---|
| `/login` | passkey autofill + "first time? Sign in with Slack" |
| `/` | hub — links to member services + account |
| `/profile` | account + self-serve passkey management ("my devices") |
| `/slack/start`, `/slack/callback` | OIDC enrollment (state + PKCE, `team_id` gate) |
| `/passkey/{register,login}/{options,verify}` | WebAuthn ceremonies |
| `/logout` | revoke session + clear cookie |

## Architecture

Server-rendered Hono Worker + one Vite-built browser island
(`src/client/passkey.ts` → `public/assets/passkey.js`) for the WebAuthn calls.
The Worker owns the D1 database (`users`, `credentials`, `sessions`).

```
src/worker/
  index.ts      route wiring
  slack.ts      OIDC enrollment (network)        oidc.ts   pure OIDC helpers (PKCE, team gate)
  webauthn.ts   register/login ceremonies        challenge.ts  signed short-TTL cookies
  session.ts    issue/revoke sessions            redirect.ts   open-redirect guard
  db.ts         all D1 access                     encoding.ts   base64url + random tokens
  pages.ts      server-rendered HTML
```

## Setup

This consumes `@troop10rwc/worker-kit` (≥ 0.9.0) from GitHub Packages — see
`.npmrc` and export `NPM_TOKEN` locally.

```bash
pnpm install
# Create the D1 database and paste its id into wrangler.jsonc:
pnpm exec wrangler d1 create troop10-id
pnpm migrate:local            # or migrate:remote

# Local secrets (see .dev.vars.example): SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, CHALLENGE_SECRET
cp .dev.vars.example .dev.vars && $EDITOR .dev.vars

pnpm dev                      # builds the island, runs wrangler dev
```

### Slack app

OIDC redirect URI `https://id.troop10rwc.org/slack/callback`, scopes
`openid profile email`. Use the **Client ID** (not the App ID). Set the three
secrets with `wrangler secret put <NAME>` for production.

### Deploy

Cloudflare **Workers Builds** (the Git integration) deploys the live Worker on
push to `main`; `.github/workflows/ci.yml` runs build + typecheck + tests on every
push/PR. The Slack/Cloudflare values come from env/secrets — never hard-code them.

### Preview deploys (`*.workers.dev`)

The same Worker also serves the `workers.dev` URL (`profile.tactical.workers.dev`)
and each `wrangler versions upload` preview URL. Those hosts are **Cloudflare
Access-restricted** in the dashboard (Worker URL → Restricted), because the
session cookie is scoped to `troop10rwc.org` and can't reach `workers.dev`, and a
`troop10rwc.org` passkey isn't valid there. So auth branches by host:

- **`*.troop10rwc.org`** → the session cookie (`requireSession`) — production.
- **`*.workers.dev`** → Cloudflare Access is the edge gate **and** bootstraps the
  first session (the verified Access JWT → a `users` row + `c.var.session`). From
  there the normal **session cookie + passkey** flow runs, with the rpID, WebAuthn
  origin, and cookie `Domain` all derived from the request and scoped to the
  `workers.dev` apex (e.g. `tactical.workers.dev`) so they're valid across every
  preview URL. A passkey enrolled on preview is a separate credential from prod
  (different rpID).

Config: `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` (the Access app's AUD) in
`wrangler.jsonc`; `workers_dev` / `preview_urls` enable the URLs.

```bash
wrangler versions upload   # → an Access-gated <id>-profile.tactical.workers.dev preview
```

## Dashboard (apex launchpad)

Per the kit's STACK (≥ 0.8.0) the back office is split: `id.troop10rwc.org` is
**account only**, and "home" is a separate **dashboard** Worker on the apex at
`troop10rwc.org/dashboard` (every app's brand logo points there). It lives in
this repo as a second Worker under [`src/dashboard/`](src/dashboard/): an
SSR-mounted React island built on the kit's `@troop10rwc/ui` `AppShell` (same
chrome as every other back-office page), protected by `requireSession`, binding
the shared `troop10-id` D1 read-only and bouncing unauthenticated visitors to
`id.troop10rwc.org/login`.

```bash
pnpm dev:dashboard       # build the island + wrangler dev --config src/dashboard/wrangler.jsonc
pnpm deploy:dashboard    # build the island + deploy to troop10rwc.org/dashboard*
```

Because this Worker only owns `/dashboard*`, the island bundle is built by
[`vite.dashboard.config.ts`](vite.dashboard.config.ts) into `public-dashboard/`
and served from the assets binding under `/dashboard/assets/*`; non-asset paths
(`/dashboard`) fall through to the Worker, which SSRs the mount shell.

## Tests

`pnpm test` covers the security-critical pure logic: the open-redirect guard, the
signed-cookie signer, PKCE derivation, and the `team_id` membership gate.

## Offboarding

Delete a member's passkeys (and they can't re-auth after their session expires):

```sql
DELETE FROM credentials WHERE slack_sub = ?;
DELETE FROM sessions     WHERE slack_sub = ?;   -- instant, under Option B
```
