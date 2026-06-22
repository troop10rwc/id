import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

/**
 * The passkey "island" — the only client JS the hub ships. Server-rendered pages
 * reference /assets/passkey.js (built from this file by Vite).
 *  - On the login page (#passkey-login present) it starts conditional-UI login so
 *    passkeys show up in the browser's autofill.
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

async function beginConditionalLogin(): Promise<void> {
  let options;
  try {
    options = await (await postJSON("/passkey/login/options")).json();
  } catch {
    return; // can't reach the server — leave the Slack button as the way in
  }
  try {
    const assertion = await startAuthentication({ optionsJSON: options, useBrowserAutofill: true });
    const r = currentRedirect();
    const verify = await postJSON(
      `/passkey/login/verify${r ? `?redirect=${encodeURIComponent(r)}` : ""}`,
      assertion,
    );
    if (!verify.ok) return;
    const { redirect } = (await verify.json()) as { redirect?: string };
    location.href = redirect ?? "/";
  } catch {
    // User dismissed the autofill prompt — not an error.
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

if (document.getElementById("passkey-login")) {
  void beginConditionalLogin();
}
