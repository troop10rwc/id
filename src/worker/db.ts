import { randomToken } from "./encoding.js";

/**
 * All D1 access for the hub. Keeping the SQL in one place keeps it auditable —
 * note every credential query is scoped by slack_sub so a member can only ever
 * touch their own passkeys.
 */

const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function upsertUser(
  db: D1Database,
  sub: string,
  name: string | undefined,
  email: string | undefined,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO users (slack_sub, name, email, created_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(slack_sub) DO UPDATE SET name = excluded.name, email = excluded.email",
    )
    .bind(sub, name ?? null, email ?? null, nowSeconds())
    .run();
}

/* ---- sessions (Option B) -------------------------------------------------- */

/** Mint an opaque session row and return the token to set as the cookie value. */
export async function createSession(db: D1Database, sub: string, ttlSeconds: number): Promise<string> {
  const id = randomToken(32);
  const now = nowSeconds();
  await db
    .prepare("INSERT INTO sessions (id, slack_sub, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, sub, now, now + ttlSeconds)
    .run();
  return id;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
}

/* ---- credentials ---------------------------------------------------------- */

export interface StoredCredential {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[] | undefined;
}

export interface CredentialSummary {
  id: string;
  device_label: string | null;
  transports: string[];
  created_at: number;
  last_used_at: number | null;
}

export async function hasCredential(db: D1Database, sub: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS one FROM credentials WHERE slack_sub = ? LIMIT 1")
    .bind(sub)
    .first<{ one: number }>();
  return !!row;
}

/** Existing credential IDs for a member — used as WebAuthn excludeCredentials. */
export async function credentialIdsFor(db: D1Database, sub: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT id FROM credentials WHERE slack_sub = ?")
    .bind(sub)
    .all<{ id: string }>();
  return (results ?? []).map((r) => r.id);
}

export async function insertCredential(
  db: D1Database,
  sub: string,
  cred: StoredCredential,
  deviceLabel: string | null,
): Promise<void> {
  // public_key stored as a BLOB — pass a standalone ArrayBuffer.
  const pk = cred.publicKey.slice().buffer;
  await db
    .prepare(
      "INSERT INTO credentials (id, slack_sub, public_key, counter, transports, device_label, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      cred.id,
      sub,
      pk,
      cred.counter,
      cred.transports ? JSON.stringify(cred.transports) : null,
      deviceLabel,
      nowSeconds(),
    )
    .run();
}

/** Look up a single credential by its id (login verify needs the stored key). */
export async function getCredential(db: D1Database, id: string): Promise<
  (StoredCredential & { slack_sub: string }) | null
> {
  const row = await db
    .prepare("SELECT id, slack_sub, public_key, counter, transports FROM credentials WHERE id = ?")
    .bind(id)
    .first<{
      id: string;
      slack_sub: string;
      public_key: ArrayBuffer;
      counter: number;
      transports: string | null;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    slack_sub: row.slack_sub,
    publicKey: new Uint8Array(row.public_key),
    counter: row.counter,
    transports: row.transports ? (JSON.parse(row.transports) as string[]) : undefined,
  };
}

export async function updateCredentialCounter(
  db: D1Database,
  id: string,
  counter: number,
): Promise<void> {
  await db
    .prepare("UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?")
    .bind(counter, nowSeconds(), id)
    .run();
}

export async function listCredentials(db: D1Database, sub: string): Promise<CredentialSummary[]> {
  const { results } = await db
    .prepare(
      "SELECT id, device_label, transports, created_at, last_used_at FROM credentials " +
        "WHERE slack_sub = ? ORDER BY created_at DESC",
    )
    .bind(sub)
    .all<{
      id: string;
      device_label: string | null;
      transports: string | null;
      created_at: number;
      last_used_at: number | null;
    }>();
  return (results ?? []).map((r) => ({
    id: r.id,
    device_label: r.device_label,
    transports: r.transports ? (JSON.parse(r.transports) as string[]) : [],
    created_at: r.created_at,
    last_used_at: r.last_used_at,
  }));
}

/** Delete one of the member's own credentials. Scoped by slack_sub so a member
 *  can never remove someone else's passkey. Returns true if a row was removed. */
export async function deleteCredential(db: D1Database, sub: string, id: string): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM credentials WHERE id = ? AND slack_sub = ?")
    .bind(id, sub)
    .run();
  return (res.meta.changes ?? 0) > 0;
}
