import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

/**
 * The passkey "island" — the only client JS the hub ships. Server-rendered pages
 * reference /assets/passkey.js (built from this file by Vite).
 *  - On the login page (#passkey-signin button) it runs a modal WebAuthn login
 *    on click. Hidden when the browser has no WebAuthn support.
 *  - On the profile page it exposes window.t10AddPasskey / t10RemovePasskey.
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

declare global {
  interface Window {
    t10AddPasskey: () => void;
    t10RemovePasskey: (id: string) => void;
  }
}

window.t10AddPasskey = () => void addPasskey().catch((e) => alert(String(e)));
window.t10RemovePasskey = (id) => void removePasskey(id).catch((e) => alert(String(e)));

const signinBtn = document.getElementById("passkey-signin");
if (signinBtn) {
  // No WebAuthn support → hide the button so the page falls back to Slack.
  if (!window.PublicKeyCredential) signinBtn.style.display = "none";
  else signinBtn.addEventListener("click", () => void modalLogin());
}
