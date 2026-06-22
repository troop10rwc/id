-- Member identity hub schema (Option B: D1-backed sessions).
-- Challenges are NOT stored here — they live in short-TTL signed cookies.

-- One row per enrolled member (identity established via Slack).
CREATE TABLE users (
  slack_sub   TEXT PRIMARY KEY,   -- Slack OIDC `sub`
  name        TEXT,
  email       TEXT,
  created_at  INTEGER NOT NULL    -- unix seconds
);

-- One row per registered passkey. A member may have several (family / multi-device).
CREATE TABLE credentials (
  id            TEXT PRIMARY KEY,                 -- base64url credential ID
  slack_sub     TEXT NOT NULL REFERENCES users(slack_sub) ON DELETE CASCADE,
  public_key    BLOB NOT NULL,                    -- COSE public key bytes
  counter       INTEGER NOT NULL,                 -- signature counter (clone detection)
  transports    TEXT,                             -- JSON, e.g. ["internal","hybrid"]
  device_label  TEXT,                             -- optional friendly name
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);
CREATE INDEX idx_credentials_sub ON credentials(slack_sub);

-- Opaque sessions (Option B). The cookie value is the row id; app Workers
-- validate via @troop10rwc/worker-kit d1SessionLookup against this same DB.
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,   -- random opaque token = cookie value
  slack_sub   TEXT NOT NULL REFERENCES users(slack_sub) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_sub ON sessions(slack_sub);
