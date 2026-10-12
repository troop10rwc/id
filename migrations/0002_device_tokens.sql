-- Device tokens: per-member bearer tokens for clients that can't carry the
-- session cookie (the Scoutbook browser extension). Minted at
-- /connect/extension after a passkey/Slack sign-in; app Workers validate them
-- via @troop10rwc/worker-kit d1DeviceTokenLookup against this same DB.
--
-- Only the SHA-256 of the token is stored (hashDeviceToken), so reading this
-- table never yields a usable credential. Revoke = delete the row.
CREATE TABLE device_tokens (
  id            TEXT PRIMARY KEY,   -- hex SHA-256 of the t10d_… token
  slack_sub     TEXT NOT NULL REFERENCES users(slack_sub) ON DELETE CASCADE,
  label         TEXT NOT NULL,      -- e.g. "Chrome extension · Mac"
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  last_used_at  INTEGER             -- touched (hourly) by the verifying Worker
);
CREATE INDEX idx_device_tokens_sub ON device_tokens(slack_sub);
