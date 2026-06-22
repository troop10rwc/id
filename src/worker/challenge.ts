import { b64urlDecode, b64urlEncode, fromUtf8, utf8 } from "./encoding.js";

/**
 * Stateless, tamper-proof short-lived values stored in cookies — used for the
 * OIDC state/PKCE stash and WebAuthn challenges. Format: `<payload>.<exp>.<sig>`
 * where payload = base64url(value), exp = unix seconds, sig = HMAC-SHA256 over
 * `<payload>.<exp>` with CHALLENGE_SECRET. Single-use is enforced by the caller
 * clearing the cookie after a successful read.
 */

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Sign `value` with a TTL. Returns the cookie-safe token. */
export async function signValue(value: string, ttlSeconds: number, secret: string): Promise<string> {
  const payload = `${b64urlEncode(utf8(value))}.${nowSeconds() + ttlSeconds}`;
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(payload) as BufferSource));
  return `${payload}.${b64urlEncode(sig)}`;
}

/**
 * Verify a token produced by `signValue`. Returns the original value, or null if
 * the token is missing, malformed, tampered, or expired. Uses WebCrypto's
 * constant-time `verify` for the signature check.
 */
export async function verifyValue(
  token: string | undefined | null,
  secret: string,
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [value, exp, sig] = parts as [string, string, string];
  const payload = `${value}.${exp}`;
  const key = await hmacKey(secret);
  let ok: boolean;
  try {
    ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig) as BufferSource, utf8(payload) as BufferSource);
  } catch {
    return null;
  }
  if (!ok) return null;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < nowSeconds()) return null;
  try {
    return fromUtf8(b64urlDecode(value));
  } catch {
    return null;
  }
}
