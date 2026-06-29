import {
  d1SessionLookup,
  requireSession,
  SESSION_COOKIE_NAME,
  type SessionIdentity,
  type SessionVariables,
  verifyAccessJwt,
} from "@troop10rwc/worker-kit";
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { signValue, verifyValue } from "./challenge.js";
import {
  credentialIdsFor,
  deleteCredential,
  getCredential,
  insertCredential,
  listCredentials,
  updateCredentialCounter,
  upsertUser,
} from "./db.js";
import type { Env } from "./env.js";
import { renderLogin, renderManage, renderProfile } from "./pages.js";
import { safeRedirect } from "./redirect.js";
import { issueSessionCookie, revokeSessionCookie } from "./session.js";
import { slackCallback, slackStart } from "./slack.js";
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  type RpContext,
  verifyAuthentication,
  verifyRegistration,
} from "./webauthn.js";

type App = { Bindings: Env } & SessionVariables;

const app = new Hono<App>();

// Auth + WebAuthn/cookie scope are split by host. On troop10rwc.org everything
// uses the pinned env values and the session cookie. The Access-restricted
// *.workers.dev preview URLs (profile.tactical.workers.dev + each `wrangler
// versions upload` URL) can't see that cookie (it's scoped to troop10rwc.org)
// and can't use a troop10rwc.org passkey, so there we derive the rpID / origin /
// cookie-domain from the request and bootstrap the first session off Cloudflare
// Access (the edge gate). After a passkey is registered, the session cookie +
// passkey carry auth like prod.
const onWorkersDev = (c: Context<App>): boolean =>
  new URL(c.req.url).hostname.endsWith(".workers.dev");

/** The registrable domain of a *.workers.dev host (the eTLD+1: workers.dev is the
 *  public suffix, so the account label + workers.dev — e.g. tactical.workers.dev).
 *  Valid as both the rpID and the cookie Domain across every preview URL. */
const workersDevApex = (host: string): string => host.split(".").slice(-3).join(".");

/** WebAuthn rpID/name/origin for the current host. Prod is pinned; preview is
 *  request-derived (the version-preview hostname is dynamic). */
const rpContext = (c: Context<App>): RpContext => {
  if (onWorkersDev(c)) {
    const url = new URL(c.req.url);
    return { id: workersDevApex(url.hostname), name: c.env.RP_NAME, origin: url.origin };
  }
  return { id: c.env.RP_ID, name: c.env.RP_NAME, origin: c.env.AUTH_ORIGIN };
};

/** Session-cookie Domain for the current host: the workers.dev apex on preview
 *  (so the cookie persists and spans preview URLs), the kit default elsewhere. */
const cookieDomain = (c: Context<App>): string | undefined =>
  onWorkersDev(c) ? workersDevApex(new URL(c.req.url).hostname) : undefined;

/** Auth for the *.workers.dev preview surface: an app session cookie if present
 *  (passkey login mints one scoped to the workers.dev apex), else bootstrap from
 *  the verified Cloudflare Access JWT — ensuring a `users` row so the later
 *  passkey/session FK writes hold. */
const workersDevAuth =
  (fail: "html" | "json"): MiddlewareHandler<App> =>
  async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    if (token) {
      const session = await d1SessionLookup(c.env.DB)(token);
      if (session) {
        c.set("session", session);
        return next();
      }
    }
    const jwt = c.req.header("Cf-Access-Jwt-Assertion");
    const { CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD } = c.env;
    if (jwt && CF_ACCESS_TEAM_DOMAIN && CF_ACCESS_AUD) {
      try {
        const id = await verifyAccessJwt(jwt, {
          teamDomain: CF_ACCESS_TEAM_DOMAIN,
          audience: CF_ACCESS_AUD,
        });
        // Access keys identity by email; reuse it as the opaque `sub`. Ensure the
        // users row so credentials/sessions FKs hold for later passkey writes.
        await upsertUser(c.env.DB, id.email, id.name, id.email);
        c.set("session", { sub: id.email, name: id.name, email: id.email } satisfies SessionIdentity);
        return next();
      } catch {
        // Fall through — Access should have gated this at the edge already.
      }
    }
    return fail === "json" ? c.json({ error: "unauthorized" }, 401) : c.text("Forbidden", 403);
  };

// requireSession needs per-request env (db, authOrigin), so build it per call.
const pageAuth: MiddlewareHandler<App> = (c, next) =>
  onWorkersDev(c)
    ? workersDevAuth("html")(c, next)
    : requireSession({ authOrigin: c.env.AUTH_ORIGIN, db: c.env.DB })(c, next);
const apiAuth: MiddlewareHandler<App> = (c, next) =>
  onWorkersDev(c)
    ? workersDevAuth("json")(c, next)
    : requireSession({ authOrigin: c.env.AUTH_ORIGIN, db: c.env.DB, onUnauthenticated: "json" })(c, next);

const CHAL_REG = "__Secure-troop_chal_reg";
const CHAL_LOGIN = "__Secure-troop_chal_login";
const shortCookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

// Non-secret device hint: "this browser has enrolled/used a passkey here". Read
// at SSR to lead with the passkey button and demote Slack to a recovery link.
// WebAuthn forbids querying credential presence before auth, so a device-local
// hint (set server-side on passkey login/registration) is the privacy-safe
// substitute. Not HttpOnly — it carries no secret — but Secure + Lax like the rest.
const PK_HINT = "t10_pk";
const PK_HINT_TTL = 34_560_000; // 400 days (the browser cap on cookie lifetime)
const hintCookie = (value: string, maxAge: number) =>
  `${PK_HINT}=${value}; Path=/; Secure; SameSite=Lax; Max-Age=${maxAge}`;

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

app.get("/login", (c) =>
  c.html(renderLogin(c.req.query("redirect") ?? "", getCookie(c, PK_HINT) === "1")),
);
app.get("/slack/start", slackStart);
app.get("/slack/callback", slackCallback);
app.get("/logout", async (c) => {
  const cookie = await revokeSessionCookie(c.env.DB, getCookie(c, SESSION_COOKIE_NAME), cookieDomain(c));
  c.header("Set-Cookie", cookie, { append: true });
  return c.redirect("/login", 302);
});

/* ---- authenticated pages -------------------------------------------------- */

// This hub is account-only; "home" is the apex dashboard (troop10rwc.org/dashboard,
// a separate Worker). The id root just lands on account management at /manage,
// which handles auth (→ /login when no session).
app.get("/", (c) => c.redirect("/manage", 302));
app.get("/manage", pageAuth, (c) => c.html(renderManage(c.var.session, c.env.ROOT_DOMAIN)));
app.get("/profile", pageAuth, async (c) => {
  const creds = await listCredentials(c.env.DB, c.var.session.sub);
  return c.html(renderProfile(c.var.session, creds, c.req.query("welcome") === "1"));
});

/* ---- passkey registration (requires a Slack-verified session) ------------ */

app.post("/passkey/register/options", apiAuth, async (c) => {
  const { sub, email, name } = c.var.session;
  const ids = await credentialIdsFor(c.env.DB, sub);
  const options = await buildRegistrationOptions(rpContext(c), sub, email ?? name ?? sub, ids);
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
  const cred = await verifyRegistration(rpContext(c), response, expected);
  if (!cred) return c.json({ error: "verification failed" }, 400);
  await insertCredential(c.env.DB, c.var.session.sub, cred, deviceLabel(c.req.header("User-Agent")));
  c.header("Set-Cookie", hintCookie("1", PK_HINT_TTL), { append: true });
  return c.json({ ok: true });
});

/* ---- passkey login (public; conditional UI) ------------------------------ */

app.post("/passkey/login/options", async (c) => {
  const options = await buildAuthenticationOptions(rpContext(c));
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
  const { verified, newCounter } = await verifyAuthentication(rpContext(c), response, expected, stored);
  if (!verified) return c.json({ error: "verification failed" }, 401);
  await updateCredentialCounter(c.env.DB, stored.id, newCounter);
  c.header("Set-Cookie", await issueSessionCookie(c.env.DB, c.env, stored.slack_sub, cookieDomain(c)), {
    append: true,
  });
  c.header("Set-Cookie", hintCookie("1", PK_HINT_TTL), { append: true });
  return c.json({ redirect: safeRedirect(c.req.query("redirect"), c.env.ROOT_DOMAIN, "/") });
});

/* ---- self-serve device management ---------------------------------------- */

app.post("/profile/credentials/:id/delete", apiAuth, async (c) => {
  const ok = await deleteCredential(c.env.DB, c.var.session.sub, c.req.param("id"));
  // If that was the last passkey, drop the device hint so /login stops leading
  // with a passkey button this browser can no longer satisfy.
  if (ok && (await credentialIdsFor(c.env.DB, c.var.session.sub)).length === 0) {
    c.header("Set-Cookie", hintCookie("", 0), { append: true });
  }
  return c.json({ ok });
});

export default app;
