-- Migration 015: cardio sessions + daily activity (Phase 2 — Cardio / Steps / HealthKit)
--
-- Data model decided with Mickey 2026-06-20: NEW tables, not an extension of
-- `workouts`. Lifting stays in workouts/workout_sets (set-based, RPE-driven).
-- Cardio and step/energy data are a different shape — discrete cardio bouts and
-- daily aggregates — and the existing workouts.session_type CHECK is restrictive,
-- so overloading it would fight the schema. Two purpose-built tables instead:
--
--   daily_activity   — one row per user per day. The rolled-up signal the Today
--                      ring and Progress sparklines read: steps, walk/run
--                      distance, active energy, plus a snapshot of the adaptive
--                      step goal computed for that day.
--   cardio_sessions  — one row per discrete cardio bout (a bike ride, an incline
--                      walk, a manual "30 min stationary bike, moderate"). May
--                      link to a movements-table conditioning row (stationary_bike,
--                      incline_walk, rower, elliptical, kb_circuit) when alias
--                      resolution finds one; modality text is the fallback.
--
-- Dedup rule decided with Mickey: HealthKit WINS. HealthKit workouts sync
-- idempotently via hk_uuid (partial-unique per user, so re-syncing can't
-- double-insert). When a HealthKit bout overlaps a manual one, the manual row is
-- marked superseded (superseded_by -> the HK row's id, + superseded_at) rather
-- than deleted, so the user can still see what they logged. Activity rollups and
-- the weekly report count only non-superseded rows.
--
-- Style mirrors the existing migrations: CREATE TABLE IF NOT EXISTS + explicit
-- indexes; daily_activity reuses the daily_checkins convention of UNIQUE(user_id,
-- date) for the once-per-day aggregate.

-- ---------------------------------------------------------------------------
-- daily_activity: one rolled-up row per user per day.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_activity (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  steps               INTEGER CHECK(steps IS NULL OR steps >= 0),
  distance_m          REAL    CHECK(distance_m IS NULL OR distance_m >= 0),   -- walking + running distance, meters
  active_energy_kcal  REAL    CHECK(active_energy_kcal IS NULL OR active_energy_kcal >= 0),
  step_goal           INTEGER CHECK(step_goal IS NULL OR step_goal >= 0),     -- adaptive goal snapshot for this day (7-day median + ~5%)
  source              TEXT NOT NULL DEFAULT 'manual'
                        CHECK(source IN ('healthkit','manual','mixed')),
  created_at          DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at          DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, date)   -- only one activity rollup per user per day
);

CREATE INDEX IF NOT EXISTS idx_daily_activity_user_date ON daily_activity(user_id, date);

-- ---------------------------------------------------------------------------
-- cardio_sessions: one discrete cardio bout.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cardio_sessions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                DATE NOT NULL,                 -- local day the bout belongs to
  started_at          DATETIME,                      -- wall-clock start (needed for the dedup overlap check)
  movement_id         TEXT REFERENCES movements(id), -- nullable: resolved conditioning movement when alias resolution matches
  modality            TEXT,                          -- fallback label when no movement_id (e.g. "stationary bike", "outdoor walk")
  duration_min        REAL    CHECK(duration_min IS NULL OR duration_min >= 0),
  distance_m          REAL    CHECK(distance_m IS NULL OR distance_m >= 0),
  active_energy_kcal  REAL    CHECK(active_energy_kcal IS NULL OR active_energy_kcal >= 0),
  avg_hr              INTEGER CHECK(avg_hr IS NULL OR avg_hr BETWEEN 1 AND 250),
  intensity           TEXT    CHECK(intensity IS NULL OR intensity IN ('easy','moderate','hard')),
  source              TEXT NOT NULL DEFAULT 'manual'
                        CHECK(source IN ('healthkit','manual')),
  hk_uuid             TEXT,                           -- HealthKit HKWorkout UUID; null for manual entries
  superseded_by       TEXT REFERENCES cardio_sessions(id) ON DELETE SET NULL, -- HealthKit-wins dedup: manual row -> winning HK row
  superseded_at       DATETIME,
  notes               TEXT,
  created_at          DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cardio_sessions_user_date ON cardio_sessions(user_id, date);

-- Idempotent HealthKit sync: a given HK workout maps to at most one row per user.
-- Partial index so the many manual rows (hk_uuid IS NULL) are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cardio_sessions_hk_uuid
  ON cardio_sessions(user_id, hk_uuid)
  WHERE hk_uuid IS NOT NULL;
