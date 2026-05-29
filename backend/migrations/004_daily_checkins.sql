-- Migration 004: daily_checkins table
-- The 10-second morning check-in. One row per user per day.
-- The workout engine reads these to decide whether to auto-deload.
-- Scores are 1–10 integers; lower = worse symptoms / lower energy.

CREATE TABLE IF NOT EXISTS daily_checkins (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  energy_1_10     INTEGER CHECK(energy_1_10 BETWEEN 1 AND 10),
  nausea_1_10     INTEGER CHECK(nausea_1_10 BETWEEN 1 AND 10),  -- 1=severe, 10=none
  gi_symptoms_1_10 INTEGER CHECK(gi_symptoms_1_10 BETWEEN 1 AND 10),
  sleep_hours     REAL,
  notes_text      TEXT,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, date)   -- only one check-in per user per day
);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins(user_id, date);
