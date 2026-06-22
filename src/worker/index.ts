import { requireSession, SESSION_COOKIE_NAME, type SessionVariables } from "@troop10rwc/worker-kit";
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Hono, type MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { signValue, verifyValue } from "./challenge.js";
import {
  credentialIdsFor,
  deleteCredential,
  getCredential,
  insertCredential,
  listCredentials,
  updateCredentialCounter,
} from "./db.js";
import type { Env } from "./env.js";
import { renderHub, renderLogin, renderProfile } from "./pages.js";
import { safeRedirect } from "./redirect.js";
import { issueSessionCookie, revokeSessionCookie } from "./session.js";
import { slackCallback, slackStart } from "./slack.js";
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "./webauthn.js";

type App = { Bindings: Env } & SessionVariables;

const app = new Hono<App>();

// requireSession needs per-request env (db, authOrigin), so build it per call.
const pageAuth: MiddlewareHandler<App> = (c, next) =>
  requireSession({ authOrigin: c.env.AUTH_ORIGIN, db: c.env.DB })(c, next);
const apiAuth: MiddlewareHandler<App> = (c, next) =>
  requireSession({ authOrigin: c.env.AUTH_ORIGIN, db: c.env.DB, onUnauthenticated: "json" })(c, next);

const CHAL_REG = "__Secure-troop_chal_reg";
const CHAL_LOGIN = "__Secure-troop_chal_login";
const shortCookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

/** Coarse, friendly device label from the User-Agent (best-effort only). */
function deviceLabel(ua: string | undefined): string | null {
  if (!ua) return null;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android device";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "Passkey";
}

/* ---- public pages + Slack enrollment ------------------------------------- */

app.get("/login", (c) => c.html(renderLogin(c.req.query("redirect") ?? "")));
app.get("/slack/start", slackStart);
app.get("/slack/callback", slackCallback);
app.get("/logout", async (c) => {
  const cookie = await revokeSessionCookie(c.env.DB, getCookie(c, SESSION_COOKIE_NAME));
  c.header("Set-Cookie", cookie, { append: true });
  return c.redirect("/login", 302);
});

/* ---- authenticated pages -------------------------------------------------- */

app.get("/", pageAuth, (c) => c.html(renderHub(c.var.session)));
app.get("/profile", pageAuth, async (c) => {
  const creds = await listCredentials(c.env.DB, c.var.session.sub);
  return c.html(renderProfile(c.var.session, creds, c.req.query("welcome") === "1"));
});

/* ---- passkey registration (requires a Slack-verified session) ------------ */

app.post("/passkey/register/options", apiAuth, async (c) => {
  const { sub, email, name } = c.var.session;
  const ids = await credentialIdsFor(c.env.DB, sub);
  const options = await buildRegistrationOptions(c.env, sub, email ?? name ?? sub, ids);
  c.header("Set-Cookie", shortCookie(CHAL_REG, await signValue(options.challenge, 300, c.env.CHALLENGE_SECRET), 300), {
    append: true,
  });
  return c.json(options);
});

app.post("/passkey/register/verify", apiAuth, async (c) => {
  const expected = await verifyValue(getCookie(c, CHAL_REG), c.env.CHALLENGE_SECRET);
  c.header("Set-Cookie", shortCookie(CHAL_REG, "", 0), { append: true });
  if (!expected) return c.json({ error: "challenge expired" }, 400);
  const response = await c.req.json<RegistrationResponseJSON>();
  const cred = await verifyRegistration(c.env, response, expected);
  if (!cred) return c.json({ error: "verification failed" }, 400);
  await insertCredential(c.env.DB, c.var.session.sub, cred, deviceLabel(c.req.header("User-Agent")));
  return c.json({ ok: true });
});

/* ---- passkey login (public; conditional UI) ------------------------------ */

app.post("/passkey/login/options", async (c) => {
  const options = await buildAuthenticationOptions(c.env);
  c.header(
    "Set-Cookie",
    shortCookie(CHAL_LOGIN, await signValue(options.challenge, 300, c.env.CHALLENGE_SECRET), 300),
    { append: true },
  );
  return c.json(options);
});

app.post("/passkey/login/verify", async (c) => {
  const expected = await verifyValue(getCookie(c, CHAL_LOGIN), c.env.CHALLENGE_SECRET);
  c.header("Set-Cookie", shortCookie(CHAL_LOGIN, "", 0), { append: true });
  if (!expected) return c.json({ error: "challenge expired" }, 400);
  const response = await c.req.json<AuthenticationResponseJSON>();
  const stored = await getCredential(c.env.DB, response.id);
  if (!stored) return c.json({ error: "unknown credential" }, 400);
  const { verified, newCounter } = await verifyAuthentication(c.env, response, expected, stored);
  if (!verified) return c.json({ error: "verification failed" }, 401);
  await updateCredentialCounter(c.env.DB, stored.id, newCounter);
  c.header("Set-Cookie", await issueSessionCookie(c.env.DB, c.env, stored.slack_sub), { append: true });
  return c.json({ redirect: safeRedirect(c.req.query("redirect"), c.env.ROOT_DOMAIN, "/") });
});

/* ---- self-serve device management ---------------------------------------- */

app.post("/profile/credentials/:id/delete", apiAuth, async (c) => {
  const ok = await deleteCredential(c.env.DB, c.var.session.sub, c.req.param("id"));
  return c.json({ ok });
});

export default app;
