import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { signValue, verifyValue } from "./challenge.js";
import { hasCredential, upsertUser } from "./db.js";
import { randomToken } from "./encoding.js";
import type { Env } from "./env.js";
import {
  buildAuthorizeUrl,
  extractClaims,
  isTroopMember,
  pkceChallenge,
  SLACK_ISSUER,
  SLACK_JWKS,
  SLACK_TOKEN,
} from "./oidc.js";
import { safeRedirect } from "./redirect.js";
import { issueSessionCookie } from "./session.js";

type Ctx = Context<{ Bindings: Env }>;

// Slack's signing keys, cached by jose across requests in the same isolate.
const jwks = createRemoteJWKSet(new URL(SLACK_JWKS));

const OIDC_COOKIE = "__Secure-troop_oidc";
const shortCookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

/** GET /slack/start — stash state+PKCE in a signed cookie, redirect to Slack. */
export async function slackStart(c: Ctx): Promise<Response> {
  const redirect = c.req.query("redirect") ?? "";
  const state = randomToken(16);
  const verifier = randomToken(32);
  const codeChallenge = await pkceChallenge(verifier);
  const stash = await signValue(
    JSON.stringify({ state, verifier, redirect }),
    600,
    c.env.CHALLENGE_SECRET,
  );
  c.header("Set-Cookie", shortCookie(OIDC_COOKIE, stash, 600), { append: true });
  const url = buildAuthorizeUrl({
    clientId: c.env.SLACK_CLIENT_ID,
    redirectUri: `${c.env.AUTH_ORIGIN}/slack/callback`,
    state,
    codeChallenge,
  });
  return c.redirect(url, 302);
}

/** GET /slack/callback — exchange code, verify id_token + team gate, enroll. */
export async function slackCallback(c: Ctx): Promise<Response> {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const raw = getCookie(c, OIDC_COOKIE);
  // The state/PKCE stash is single-use — clear it no matter the outcome.
  c.header("Set-Cookie", shortCookie(OIDC_COOKIE, "", 0), { append: true });

  const stashStr = await verifyValue(raw, c.env.CHALLENGE_SECRET);
  if (!code || !state || !stashStr) return c.text("Invalid login state. Please try again.", 400);
  const stash = JSON.parse(stashStr) as { state: string; verifier: string; redirect: string };
  if (stash.state !== state) return c.text("State mismatch. Please try again.", 400);

  // Code → tokens, with the PKCE verifier.
  const tokenRes = await fetch(SLACK_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${c.env.AUTH_ORIGIN}/slack/callback`,
      client_id: c.env.SLACK_CLIENT_ID,
      client_secret: c.env.SLACK_CLIENT_SECRET,
      code_verifier: stash.verifier,
    }),
  });
  const token = (await tokenRes.json()) as { ok?: boolean; id_token?: string; error?: string };
  if (!token.ok || !token.id_token) {
    // Slack reports the real reason here (e.g. invalid_code, bad_client_secret,
    // redirect_uri_mismatch). Log it so `wrangler tail` can diagnose, and echo
    // the code to the user — it's not sensitive and it makes self-service fixes
    // possible.
    console.error("Slack token exchange failed", {
      status: tokenRes.status,
      error: token.error ?? "(no error field)",
    });
    return c.text(`Slack token exchange failed: ${token.error ?? "unknown error"}`, 502);
  }

  // Verify id_token signature (JWKS) + iss + aud + exp, then the team gate.
  let claims;
  try {
    const { payload } = await jwtVerify(token.id_token, jwks, {
      issuer: SLACK_ISSUER,
      audience: c.env.SLACK_CLIENT_ID,
    });
    claims = extractClaims(payload as Record<string, unknown>);
  } catch {
    return c.text("Could not verify your Slack identity.", 401);
  }
  if (!isTroopMember(claims, c.env.TROOP_TEAM_ID)) {
    return c.text("This Slack account isn't a member of the Troop 10 workspace.", 403);
  }

  await upsertUser(c.env.DB, claims.sub, claims.name, claims.email);
  c.header("Set-Cookie", await issueSessionCookie(c.env.DB, c.env, claims.sub), { append: true });

  // Returning member with a passkey → back where they came from. First-timer (no
  // passkey yet) → profile, to add one.
  const dest = (await hasCredential(c.env.DB, claims.sub))
    ? safeRedirect(stash.redirect, c.env.ROOT_DOMAIN, "/")
    : "/profile?welcome=1";
  return c.redirect(dest, 302);
}
