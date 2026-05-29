-- Migration 005: workouts and workout_sets tables
-- workouts: one row per planned or completed training session.
-- workout_sets: one row per set within a session.
-- The progression engine reads actual_rpe and actual_reps to adjust future weights.

CREATE TABLE IF NOT EXISTS workouts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planned_date DATE NOT NULL,
  completed_at DATETIME,                 -- null = not yet completed
  template_id  TEXT,                     -- which program template generated this session
  session_type TEXT CHECK(session_type IN ('full_body_a','full_body_b','full_body_c','upper','lower','deload','mobility')),
  notes        TEXT,
  created_at   DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, planned_date);

CREATE TABLE IF NOT EXISTS workout_sets (
  id             TEXT PRIMARY KEY,
  workout_id     TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id    TEXT NOT NULL,          -- slug: e.g. "goblet_squat", "db_bench_press"
  exercise_name  TEXT NOT NULL,          -- human-readable: "Goblet Squat"
  set_order      INTEGER NOT NULL,       -- 1-based position within the workout
  target_reps    INTEGER,
  target_rpe     REAL,
  actual_reps    INTEGER,                -- logged by user; null if not yet done
  actual_weight  REAL,                   -- in kg
  actual_rpe     REAL,
  notes          TEXT,
  created_at     DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workout_sets_workout_id ON workout_sets(workout_id);
