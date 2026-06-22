/**
 * Open-redirect guard for the post-login bounce.
 *
 * After auth we send the member back to `?redirect=…`, but an attacker can craft
 * `…/login?redirect=https://evil.example` and harvest a freshly-authenticated
 * user. So we only honor a target that resolves to the troop's own domain;
 * anything else falls back to the hub.
 *
 * Accepts:
 *  - a same-site absolute https URL (`rootDomain` or any `*.rootDomain`)
 *  - a relative path (`/profile`) — but NOT a protocol-relative `//evil.com`
 */
export function safeRedirect(
  target: string | undefined | null,
  rootDomain: string,
  fallback = "/",
): string {
  if (!target) return fallback;

  // Relative path on our own origin — safe, but reject protocol-relative `//host`.
  if (target.startsWith("/")) {
    return target.startsWith("//") ? fallback : target;
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return fallback;
  }
  if (url.protocol !== "https:") return fallback;
  const host = url.hostname;
  if (host !== rootDomain && !host.endsWith(`.${rootDomain}`)) return fallback;
  return url.toString();
}
