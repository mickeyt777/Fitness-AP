-- Migration 009: device_tokens table
-- Stores the APNs device tokens the iOS app registers after the user grants
-- notification permission. One user can have multiple devices (iPhone + iPad).
-- Tokens are rotated by Apple — the iOS app should re-register on every launch.

CREATE TABLE IF NOT EXISTS device_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT 'ios' CHECK(platform IN ('ios')),
  bundle_id   TEXT,                          -- e.g. com.fitnessap.app
  created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
  last_seen   DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
