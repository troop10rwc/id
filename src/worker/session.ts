import { buildSessionCookie, clearSessionCookie } from "@troop10rwc/worker-kit";
import { createSession, deleteSession } from "./db.js";
import { type Env, sessionTtl } from "./env.js";

/**
 * Session issue/revoke as plain functions returning the `Set-Cookie` value, so
 * they don't couple to the Hono Context generics — the caller attaches the
 * header. Sessions are opaque tokens in D1 (Option B).
 */

/** Mint a session row; returns the `__Secure-troop_session` Set-Cookie value.
 *  `domain` overrides the cookie's Domain (defaults to the kit's troop10rwc.org);
 *  the *.workers.dev preview surface passes its own apex so the cookie sticks. */
export async function issueSessionCookie(
  db: D1Database,
  env: Env,
  sub: string,
  domain?: string,
): Promise<string> {
  const token = await createSession(db, sub, sessionTtl(env));
  return buildSessionCookie(token, domain ? { domain } : {});
}

/** Revoke the given session token (if any) and return the clearing Set-Cookie.
 *  `domain` must match the issued cookie's Domain to actually clear it. */
export async function revokeSessionCookie(
  db: D1Database,
  token: string | undefined,
  domain?: string,
): Promise<string> {
  if (token) await deleteSession(db, token);
  return clearSessionCookie(domain ? { domain } : {});
}
