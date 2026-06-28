export interface Env {
  /** D1 — owns users, credentials, sessions (this DB is also bound by app
   *  Workers for read-only session validation via worker-kit d1SessionLookup). */
  DB: D1Database;

  // Vars (wrangler.jsonc)
  TROOP_TEAM_ID: string; // Slack workspace lock, e.g. TN69FH34Y
  RP_ID: string; // WebAuthn rpID = registrable parent, troop10rwc.org
  RP_NAME: string; // human label shown in the passkey prompt
  AUTH_ORIGIN: string; // https origin this hub serves, e.g. https://troop10rwc.org
  ROOT_DOMAIN: string; // troop10rwc.org — for the safe-redirect host check
  SESSION_TTL_SECONDS: string; // stringified int (wrangler vars are strings)

  // Cloudflare Access — only used on the Access-restricted *.workers.dev preview
  // URLs (the session cookie is scoped to troop10rwc.org and can't reach them, so
  // there we authenticate with the Access JWT instead). Unset on a plain prod
  // request → the worker just uses requireSession. Not secrets.
  CF_ACCESS_TEAM_DOMAIN?: string; // "troop10rwc" or "troop10rwc.cloudflareaccess.com"
  CF_ACCESS_AUD?: string; // Access application AUD tag

  // Secrets
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
  CHALLENGE_SECRET: string; // HMAC key for signed state/challenge cookies
}

export const sessionTtl = (env: Env): number => {
  const n = Number(env.SESSION_TTL_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : 43200;
};
