import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

/**
 * The passkey "island" — the only client JS the hub ships. Server-rendered pages
 * reference /assets/passkey.js (built from this file by Vite).
 *  - On the login page (#passkey-signin button) it runs a modal WebAuthn login
 *    on click. Hidden when the browser has no WebAuthn support.
 *  - On the profile page it exposes window.t10AddPasskey / t10RemovePasskey /
 *    t10RevokeDevice.
 *  - On /connect/extension (#connect-extension button) it mints a device token
 *    and hands it to the Scoutbook extension's content script.
 */

async function postJSON(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function currentRedirect(): string {
  return new URLSearchParams(location.search).get("redirect") ?? "";
}

async function modalLogin(): Promise<void> {
  let options;
  try {
    options = await (await postJSON("/passkey/login/options")).json();
  } catch {
    alert("Couldn't reach the server. Try signing in with Slack.");
    return;
  }
  try {
    const assertion = await startAuthentication({ optionsJSON: options });
    const r = currentRedirect();
    const verify = await postJSON(
      `/passkey/login/verify${r ? `?redirect=${encodeURIComponent(r)}` : ""}`,
      assertion,
    );
    if (!verify.ok) {
      alert("That passkey didn't work. Try again, or sign in with Slack.");
      return;
    }
    const { redirect } = (await verify.json()) as { redirect?: string };
    location.href = redirect ?? "/";
  } catch {
    // User dismissed the system passkey sheet — not an error.
  }
}

async function addPasskey(): Promise<void> {
  const options = await (await postJSON("/passkey/register/options")).json();
  const attestation = await startRegistration({ optionsJSON: options });
  const res = await postJSON("/passkey/register/verify", attestation);
  if (res.ok) location.reload();
  else alert(`Could not add passkey: ${await res.text()}`);
}

async function removePasskey(id: string): Promise<void> {
  if (!confirm("Remove this passkey?")) return;
  const res = await postJSON(`/profile/credentials/${encodeURIComponent(id)}/delete`);
  if (res.ok) location.reload();
  else alert("Could not remove passkey.");
}

async function revokeDevice(id: string): Promise<void> {
  if (!confirm("Disconnect this extension? It will stop syncing until you connect it again.")) return;
  const res = await postJSON(`/profile/devices/${encodeURIComponent(id)}/delete`);
  if (res.ok) location.reload();
  else alert("Could not disconnect the extension.");
}

/* ---- /connect/extension handoff ------------------------------------------ *
   Contract with the extension's content script (roster repo,
   chrome-extension/src/connect.ts), same-window postMessage only:
     page → ext  { type: "t10:device-token", state, token, expiresAt, name }
     ext  → page { type: "t10:device-token-ack", state }
   No ack within ACK_TIMEOUT_MS → the extension isn't listening on this tab, so
   the just-minted token is revoked rather than left orphaned.                  */

const ACK_TIMEOUT_MS = 3000;

function waitForAck(state: string): Promise<boolean> {
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      if (e.data?.type === "t10:device-token-ack" && e.data.state === state) {
        window.removeEventListener("message", onMessage);
        resolve(true);
      }
    };
    window.addEventListener("message", onMessage);
    setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(false);
    }, ACK_TIMEOUT_MS);
  });
}

async function connectExtension(btn: HTMLButtonElement): Promise<void> {
  const status = document.getElementById("connect-status");
  const say = (msg: string) => {
    if (status) status.textContent = msg;
  };
  const state = btn.dataset.state ?? "";
  btn.disabled = true;
  say("Connecting…");
  const res = await postJSON("/connect/extension/token", {
    client: new URLSearchParams(location.search).get("client") ?? undefined,
  });
  if (!res.ok) {
    btn.disabled = false;
    say("Couldn't create a token. Reload the page and try again.");
    return;
  }
  const { id, token, expiresAt, name } = (await res.json()) as {
    id: string;
    token: string;
    expiresAt: number;
    name: string | null;
  };
  const acked = waitForAck(state);
  window.postMessage({ type: "t10:device-token", state, token, expiresAt, name }, location.origin);
  if (await acked) {
    btn.remove();
    say("Connected. You can close this tab.");
    return;
  }
  await postJSON(`/profile/devices/${encodeURIComponent(id)}/delete`);
  btn.disabled = false;
  say("The extension didn't respond. Make sure it's installed and enabled, then start again from its settings.");
}

declare global {
  interface Window {
    t10AddPasskey: () => void;
    t10RemovePasskey: (id: string) => void;
    t10RevokeDevice: (id: string) => void;
  }
}

window.t10AddPasskey = () => void addPasskey().catch((e) => alert(String(e)));
window.t10RemovePasskey = (id) => void removePasskey(id).catch((e) => alert(String(e)));
window.t10RevokeDevice = (id) => void revokeDevice(id).catch((e) => alert(String(e)));

const connectBtn = document.getElementById("connect-extension");
if (connectBtn instanceof HTMLButtonElement) {
  connectBtn.addEventListener("click", () => void connectExtension(connectBtn).catch((e) => alert(String(e))));
}

const signinBtn = document.getElementById("passkey-signin");
if (signinBtn) {
  // No WebAuthn support → hide the button so the page falls back to Slack.
  if (!window.PublicKeyCredential) signinBtn.style.display = "none";
  else signinBtn.addEventListener("click", () => void modalLogin());
}
