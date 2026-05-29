-- Migration 003: dose_history table
-- Every time a user changes their drug or dose, we write a new row here
-- and close the previous row's ended_on date.
-- This drives the titration-window logic: the engine looks at the most recent
-- started_on date to decide if the user is in a dose-change adjustment period.

CREATE TABLE IF NOT EXISTS dose_history (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drug        TEXT NOT NULL,              -- same enum as profiles.glp_drug
  dose_mg     TEXT NOT NULL,             -- stored encrypted
  started_on  DATE NOT NULL,
  ended_on    DATE,                      -- null = current dose
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dose_history_user_id ON dose_history(user_id);
