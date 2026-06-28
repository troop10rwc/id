import { requireSession, type SessionVariables } from "@troop10rwc/worker-kit";
import { Hono, type Handler, type MiddlewareHandler } from "hono";

/**
 * Troop 10 RWC back-office **dashboard** — the apex-domain launchpad.
 *
 * Per STACK.md (kit ≥ 0.8.0) the back office is split across three roles on the
 * `troop10rwc.org` zone: the dashboard (this Worker, `troop10rwc.org/dashboard`),
 * the individual app Workers (`troop10rwc.org/manage/*`), and the member hub
 * (`id.troop10rwc.org`, account only). The T10 brand logo in every app's
 * `BackOfficeTopNav` points here.
 *
 * A separate Worker from the member hub on purpose: "home" (dashboard) stays
 * distinct from "my account" (id). It binds the shared D1 read-only to validate
 * the session and redirects unauthenticated requests to the member hub's /login.
 *
 * It renders the SAME `@troop10rwc/ui` `AppShell` as every other back-office page
 * (consistency), via an SSR mount shell + a React island. Because this Worker
 * only owns `/dashboard*`, the island's JS/CSS/fonts are served from the assets
 * binding under `/dashboard/assets/*` (built by `vite.dashboard.config.ts`); the
 * shell references those absolute paths.
 */

interface Env {
  /** Shared D1 (read-only here) — session validation via worker-kit. */
  DB: D1Database;
  /** Member-hub origin to bounce unauthenticated users to, e.g.
   *  https://id.troop10rwc.org. Also where "Sign out" goes. */
  AUTH_ORIGIN: string;
}

type App = { Bindings: Env } & SessionVariables;

const app = new Hono<App>();

const auth: MiddlewareHandler<App> = (c, next) =>
  requireSession({ authOrigin: c.env.AUTH_ORIGIN, db: c.env.DB })(c, next);

/** SSR mount shell for the React dashboard island. Ships no markup beyond the
 *  mount point — the kit owns the chrome. The signed-in identity rides along as a
 *  JSON island so the client labels the top bar without a fetch. */
function renderDashboard(name: string, logoutUrl: string): string {
  const identity = JSON.stringify({ name, logoutUrl })
    // Defuse a "</script>" sequence inside the JSON island.
    .replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard · Troop 10 RWC</title>
<link rel="stylesheet" href="/dashboard/assets/dashboard.css">
</head>
<body>
<div id="root"></div>
<script id="t10-identity" type="application/json">${identity}</script>
<script type="module" src="/dashboard/assets/dashboard.js"></script>
</body>
</html>`;
}

const home: Handler<App> = (c) => {
  const s = c.var.session;
  const name = s.name ?? s.email ?? "Member";
  return c.html(renderDashboard(name, `${c.env.AUTH_ORIGIN}/logout`));
};

app.get("/dashboard", auth, home);
app.get("/dashboard/", auth, home);

export default app;
