import { buildSessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } from "@troop10rwc/worker-kit";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createSession, deleteSession } from "./db.js";
import { type Env, sessionTtl } from "./env.js";

type Ctx = Context<{ Bindings: Env }>;

/** Mint a session row and attach the shared `__Secure-troop_session` cookie. */
export async function startSession(c: Ctx, sub: string): Promise<void> {
  const token = await createSession(c.env.DB, sub, sessionTtl(c.env));
  c.header("Set-Cookie", buildSessionCookie(token), { append: true });
}

/** Revoke the current session (delete the row) and clear the cookie. */
export async function endSession(c: Ctx): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) await deleteSession(c.env.DB, token);
  c.header("Set-Cookie", clearSessionCookie(), { append: true });
}
