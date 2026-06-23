import type { SessionIdentity } from "@troop10rwc/worker-kit";
import type { CredentialSummary } from "./db.js";

/** Server-rendered auth pages. Minimal, dependency-free HTML + one small client
 *  island (/assets/passkey.js) for the WebAuthn ceremonies. */

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;",
  );

function shell(title: string, body: string, opts: { island?: boolean } = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; background: #f6f7f9; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) { body { background: #14161a; color: #e9eaec; } .card { background: #1d2026 !important; } }
  .card { background: #fff; padding: 2rem; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.12); width: min(92vw, 28rem); }
  h1 { font-size: 1.4rem; margin: 0 0 1rem; }
  .muted { opacity: .7; font-size: .9rem; }
  button, .btn { font: inherit; cursor: pointer; border: 0; border-radius: 10px; padding: .7rem 1rem; width: 100%; margin-top: .6rem; background: #2f6f4f; color: #fff; text-align: center; text-decoration: none; display: block; box-sizing: border-box; }
  .btn.secondary, button.secondary { background: transparent; color: inherit; border: 1px solid currentColor; opacity: .8; }
  a.btn-link { display: block; text-align: center; margin-top: .9rem; color: inherit; opacity: .65; font-size: .9rem; text-decoration: underline; }
  input { font: inherit; width: 100%; padding: .7rem; border-radius: 10px; border: 1px solid #ccc; box-sizing: border-box; margin-bottom: .4rem; }
  ul { list-style: none; padding: 0; margin: 1rem 0 0; }
  li { display: flex; justify-content: space-between; align-items: center; gap: .5rem; padding: .6rem 0; border-top: 1px solid rgba(128,128,128,.25); }
  li .meta { font-size: .85rem; }
  li button { width: auto; margin: 0; padding: .4rem .7rem; }
</style>
</head>
<body>
<main class="card">
${body}
</main>
${opts.island ? '<script type="module" src="/assets/passkey.js"></script>' : ""}
</body>
</html>`;
}

export function renderLogin(redirect: string, hasPasskeyHint: boolean): string {
  const slackHref = `/slack/start${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;
  // The passkey button triggers a modal WebAuthn get() (passkey.ts); a plain
  // button is honest for a passkey-only flow — there's no username to type.
  const passkeyBtn = (cls: string): string =>
    `<button id="passkey-signin"${cls ? ` class="${cls}"` : ""}>Sign in with a passkey</button>`;
  const intro = `<h1>Troop 10 Redwood City</h1>
<p class="muted">Sign in to your member tools.</p>`;
  // hasPasskeyHint = this browser has used a passkey here before. Lead with it
  // and demote Slack to recovery. Otherwise assume first-time: Slack leads.
  const body = hasPasskeyHint
    ? `${intro}
${passkeyBtn("")}
<a class="btn-link" href="${slackHref}">First time, or lost your device? Sign in with Slack</a>`
    : `${intro}
<a class="btn" href="${slackHref}">Sign in with Slack</a>
${passkeyBtn("secondary")}
<p class="muted" style="margin-top:1rem">New here? Slack sets you up. Already added a passkey on this device? Use it.</p>`;
  return shell("Sign in · Troop 10", body, { island: true });
}

/** SSR shell for the React back office (@troop10rwc/ui). Ships no markup of its
 *  own beyond the mount point — the kit owns the chrome. The signed-in identity
 *  rides along as a JSON island so the client labels the topbar without a fetch. */
export function renderManage(session: SessionIdentity, rootDomain: string): string {
  const identity = JSON.stringify({
    name: session.name ?? session.email ?? "Member",
    // The back-office apps live on the apex, not this id.* subdomain, so the
    // client makes the cross-app links absolute (https://<apex>/manage/<app>).
    manageOrigin: `https://${rootDomain}`,
  })
    // Defuse a "</script>" sequence inside the JSON island.
    .replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Members · Troop 10</title>
<link rel="stylesheet" href="/assets/backoffice.css">
</head>
<body>
<div id="root"></div>
<script id="t10-identity" type="application/json">${identity}</script>
<script type="module" src="/assets/backoffice.js"></script>
</body>
</html>`;
}

export function renderProfile(
  session: SessionIdentity,
  creds: CredentialSummary[],
  welcome: boolean,
): string {
  const who = esc(session.name ?? session.email ?? session.sub);
  const fmt = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
  const list = creds.length
    ? `<ul>${creds
        .map(
          (cr) => `<li>
        <span class="meta"><strong>${esc(cr.device_label ?? "Passkey")}</strong><br>
        <span class="muted">added ${fmt(cr.created_at)}${cr.last_used_at ? ` · last used ${fmt(cr.last_used_at)}` : ""}</span></span>
        <button class="secondary" data-cred="${esc(cr.id)}" onclick="t10RemovePasskey(this.dataset.cred)">Remove</button>
      </li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No passkeys yet.</p>`;
  return shell(
    "Your account · Troop 10",
    `<h1>Your account</h1>
<p class="muted">${who}</p>
${welcome ? `<p>You're enrolled! Add a passkey so you can sign in instantly next time.</p>` : ""}
<h2 style="font-size:1.05rem;margin-top:1.4rem">Your passkeys</h2>
${list}
<button onclick="t10AddPasskey()">Add a passkey</button>
<a class="btn secondary" href="/">Back to home</a>
<a class="btn secondary" href="/logout">Log out</a>`,
    { island: true },
  );
}
