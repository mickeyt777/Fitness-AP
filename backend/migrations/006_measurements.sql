-- Migration 006: measurements table
-- Weekly body measurements and optional progress photos.
-- Photos are NOT stored here — only the URL pointing to encrypted object storage.
-- The lean-mass proxy score is calculated from these numbers by the weekly report engine.

CREATE TABLE IF NOT EXISTS measurements (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taken_at                  DATE NOT NULL,
  weight_kg                 REAL,
  waist_cm                  REAL,         -- encrypted (sensitive body data)
  hip_cm                    REAL,         -- encrypted
  chest_cm                  REAL,         -- encrypted
  arm_cm                    REAL,         -- dominant arm, encrypted
  thigh_cm                  REAL,         -- dominant thigh, encrypted
  progress_photo_front_url  TEXT,         -- signed URL to encrypted object storage
  progress_photo_side_url   TEXT,
  created_at                DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_measurements_user_date ON measurements(user_id, taken_at);
