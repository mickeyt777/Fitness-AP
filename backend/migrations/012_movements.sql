-- Migration 012: movements library table
--
-- Replaces the hard-coded EXERCISES array in engine/exercises.js with a proper
-- data table, so adding/changing a movement is a data operation rather than a
-- code change (Phase 1, Pillar 1 of the v2 roadmap).
--
-- SQLite has no array or boolean types, so:
--   * list fields (aliases, muscles) are stored as JSON-encoded TEXT
--     ('[]' when empty) and parsed in movementService.
--   * boolean flags are stored as INTEGER 0/1 with CHECK constraints.
--
-- This migration creates the SCHEMA ONLY. The movement rows are seeded in a
-- later migration once the candidate list has been vetted (see the candidate
-- list doc that ships with this Phase 1 unit).
--
-- Design notes:
--   * `category` is the coarse roadmap taxonomy (Push / Pull / Lower / Core /
--     Carry / Mobility / Conditioning).
--   * `pattern` is the finer key the existing workout engine selects on
--     (push_h, push_v, pull_h, pull_v, squat, hinge, ...). Keeping both means
--     the engine's pickExercise() logic can move onto this table in P1-C
--     without losing horizontal/vertical granularity.
--   * `level` (beginner/intermediate/advanced) supersedes the old numeric tier;
--     deload logic can step a movement DOWN a level instead of just cutting volume.
--   * `glp_flag` = 1 means "safe to push hard given GLP-1 energy/muscle context".
--     Movements that are risky when fatigued (heavy spinal loading, high skill,
--     fall risk) get 0 so the engine can bias away from them on low-energy days.
--   * `progresses_to` / `regresses_to` hold the progression/substitution chain.
--     Substitution rules are authored AFTER the base list is locked, so these
--     are nullable and left empty for now.

CREATE TABLE IF NOT EXISTS movements (
  id                TEXT PRIMARY KEY,                  -- stable slug, e.g. 'goblet_squat'
  name              TEXT NOT NULL,                     -- display name, e.g. 'Goblet Squat'
  aliases           TEXT NOT NULL DEFAULT '[]',        -- JSON array of strings (AI parse matching)
  category          TEXT NOT NULL CHECK (category IN
                      ('push','pull','arms','lower','core','carry','mobility','conditioning')),
  pattern           TEXT CHECK (pattern IS NULL OR pattern IN
                      ('push_h','push_v','pull_h','pull_v','squat','hinge',
                       'arms','core','carry','mobility','conditioning')),
  primary_muscles   TEXT NOT NULL DEFAULT '[]',        -- JSON array of muscle slugs
  secondary_muscles TEXT NOT NULL DEFAULT '[]',        -- JSON array of muscle slugs
  equipment         TEXT NOT NULL CHECK (equipment IN
                      ('bodyweight','dumbbell','barbell','machine','cable','band','kettlebell')),
  level             TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN
                      ('beginner','intermediate','advanced')),
  is_compound       INTEGER NOT NULL DEFAULT 0 CHECK (is_compound IN (0,1)),
  unilateral        INTEGER NOT NULL DEFAULT 0 CHECK (unilateral IN (0,1)),
  tempo_default     TEXT,                              -- e.g. '3-0-1-0' (3s eccentric)
  glp_flag          INTEGER NOT NULL DEFAULT 1 CHECK (glp_flag IN (0,1)),
  progresses_to     TEXT REFERENCES movements(id) ON DELETE SET NULL,  -- harder variant
  regresses_to      TEXT REFERENCES movements(id) ON DELETE SET NULL,  -- easier variant
  notes             TEXT,                              -- coaching cue shown to the user
  created_at        DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_movements_category  ON movements(category);
CREATE INDEX IF NOT EXISTS idx_movements_pattern   ON movements(pattern);
CREATE INDEX IF NOT EXISTS idx_movements_equipment ON movements(equipment);
CREATE INDEX IF NOT EXISTS idx_movements_level     ON movements(level);
