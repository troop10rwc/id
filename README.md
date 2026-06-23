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

This consumes `@troop10rwc/worker-kit` (≥ 0.7.0) from GitHub Packages — see
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

CI deploys on push to `main` (`.github/workflows/deploy.yml`). Repo secrets:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. The Slack/Cloudflare values come
from env/secrets — never hard-code them.

## Tests

`pnpm test` covers the security-critical pure logic: the open-redirect guard, the
signed-cookie signer, PKCE derivation, and the `team_id` membership gate.

## Offboarding

Delete a member's passkeys (and they can't re-auth after their session expires):

```sql
DELETE FROM credentials WHERE slack_sub = ?;
DELETE FROM sessions     WHERE slack_sub = ?;   -- instant, under Option B
```
