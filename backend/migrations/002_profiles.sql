-- Migration 002: profiles table
-- One row per user. Stores all the intake information collected during onboarding,
-- plus GLP drug details. Sensitive columns (glp_drug, glp_current_dose_mg) are
-- application-level encrypted before write — see db/encrypt.js.

CREATE TABLE IF NOT EXISTS profiles (
  user_id                   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Physical stats
  age                       INTEGER,
  sex                       TEXT CHECK(sex IN ('male','female','other')),
  height_cm                 REAL,
  starting_weight_kg        REAL,
  current_weight_kg         REAL,
  goal_body_fat_pct         REAL,           -- used to calculate goal lean body mass

  -- Training background
  training_history_level    TEXT CHECK(training_history_level IN ('none','beginner','intermediate','advanced')),
  equipment_available       TEXT,           -- JSON array: ["dumbbells","barbell","cables","bodyweight"]
  days_per_week             INTEGER CHECK(days_per_week BETWEEN 2 AND 4),

  -- GLP drug info (stored encrypted)
  glp_drug                  TEXT,           -- encrypted; enum: semaglutide | tirzepatide | liraglutide | retatrutide | compounded_semaglutide | compounded_tirzepatide | none
  glp_current_dose_mg       TEXT,           -- encrypted; stored as text because the number has drug-specific precision
  glp_injection_day_of_week INTEGER CHECK(glp_injection_day_of_week BETWEEN 0 AND 6),  -- 0=Sunday
  glp_start_date            DATE,
  last_dose_change_date     DATE,

  updated_at                DATETIME NOT NULL DEFAULT (datetime('now'))
);
