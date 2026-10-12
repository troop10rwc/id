/**
 * Input checks for /connect/extension — the page where a member hands the
 * Scoutbook browser extension a device token.
 *
 * The extension opens the page with `?state=<random>&client=<browser>`. `state`
 * is echoed back with the token so the extension only accepts a token for a
 * connect flow it started; `client` only feeds the human label shown under
 * "Connected extensions".
 */

const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const CLIENTS = ["Chrome", "Safari", "Edge", "Firefox"] as const;

/** The extension's state nonce, or null when absent/malformed. */
export function parseConnectState(state: string | undefined): string | null {
  return state && STATE_RE.test(state) ? state : null;
}

/** "Chrome extension · Mac" — a friendly label from the claimed browser + the
 *  User-Agent's device. Unknown browsers fall back to a generic name. */
export function deviceTokenLabel(client: string | undefined, device: string | null): string {
  const browser = CLIENTS.find((c) => c.toLowerCase() === client?.toLowerCase());
  const base = browser ? `${browser} extension` : "Browser extension";
  return device ? `${base} · ${device}` : base;
}
