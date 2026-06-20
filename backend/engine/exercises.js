/**
 * Exercise library — engine adapter over the `movements` table (P1-C).
 *
 * The hard-coded EXERCISES array is gone. This module now sources movements
 * from movementService (SQLite) and maps each row into the shape the workout
 * engine already expects, so workout.js needs no changes to its selection logic:
 *
 *   id            -- slug
 *   name          -- display name
 *   pattern       -- squat | hinge | push_h | push_v | pull_h | pull_v | …
 *   tier          -- 1 (beginner) / 2 (intermediate) / 3 (advanced), derived
 *                    from the table's `level`. The engine treats tier as a max.
 *   muscle_groups -- primary muscles
 *   notes         -- coaching cue
 *   progressesTo  -- harder variant id (chain)
 *   regressesTo   -- easier variant id (chain)
 *   equipment     -- PLURAL engine vocab (dumbbells/cables/…) for back-compat;
 *                    equipment_slug carries the table's singular slug.
 *
 * Selection still belongs to the engine: pickExercise() rotation and the ISO
 * week helper are unchanged. Only the *source* of candidate movements moved
 * from an in-memory array to the service.
 *
 * Two deliberate P1-C decisions worth knowing:
 *   1. getByPattern() requests compound-only movements. The table now holds
 *      isolation work (lateral raises, calf raises, leg curls) that share a
 *      pattern with the main lifts; the engine's pattern slots are main-lift
 *      slots, so we keep them compound — matching the old curated array and the
 *      product's "compound bias" principle. Isolation/accessory programming is
 *      a later concern.
 *   2. Equipment is translated plural→singular at the service boundary, so the
 *      engine/profile vocab ("dumbbells","cables") keeps working unchanged.
 */

'use strict';

const movementService = require('../services/movementService');

// ── level ⇄ tier mapping ────────────────────────────────────────────────────

const TIER_TO_LEVEL = { 1: 'beginner', 2: 'intermediate', 3: 'advanced' };

function levelToTier(level) {
  switch (level) {
    case 'advanced':     return 3;
    case 'intermediate': return 2;
    case 'beginner':
    default:             return 1;
  }
}

/** A numeric max-tier → the table's "max level" string for the service query. */
function tierToMaxLevel(tier) {
  return TIER_TO_LEVEL[tier] || 'beginner';
}

// ── row → engine shape ──────────────────────────────────────────────────────

// Inverse of the service's plural→singular map, for surfacing engine vocab.
const SINGULAR_TO_PLURAL = {
  dumbbell:   'dumbbells',
  cable:      'cables',
  kettlebell: 'kettlebells',
  band:       'bands',
  bodyweight: 'bodyweight',
  barbell:    'barbell',
  machine:    'machine',
};

function mapMovementToExercise(m) {
  if (!m) return null;
  return {
    id:            m.id,
    name:          m.name,
    pattern:       m.pattern,
    tier:          levelToTier(m.level),
    muscle_groups: m.primary_muscles,
    notes:         m.notes,
    progressesTo:  m.progresses_to,
    regressesTo:   m.regresses_to,
    equipment:     SINGULAR_TO_PLURAL[m.equipment] || m.equipment, // legacy plural vocab
    equipment_slug: m.equipment,                                   // table's singular slug
    level:         m.level,
  };
}

// ── public API (same surface as before) ─────────────────────────────────────

/**
 * getExercise(id) — returns the exercise object, or throws if not found.
 * (movementService.getMovementById throws a 404-style error on a miss, which
 * progressWorkout() already catches.)
 */
function getExercise(id) {
  return mapMovementToExercise(movementService.getMovementById(id));
}

/**
 * getByPattern(pattern, tier, availableEquipment)
 * Movements matching a pattern, at or below the given tier (level), performable
 * with the available equipment. Compound-only (see header note 1). Tier is a
 * maximum; defaults mirror the old engine (tier 1, dumbbells+bodyweight).
 */
function getByPattern(pattern, tier, availableEquipment) {
  tier = tier || 1;
  availableEquipment = availableEquipment || ['dumbbells', 'bodyweight'];
  const movements = movementService.getMovementsByPattern(pattern, {
    maxLevel:     tierToMaxLevel(tier),
    equipment:    availableEquipment,
    compoundOnly: true,
  });
  return movements.map(mapMovementToExercise);
}

/**
 * pickExercise(pattern, tier, equipment, sessionVariant, weekNumber)
 * Deterministically rotates across the available options by session variant
 * (a/b/c) and week number. Unchanged from the in-memory era — it just operates
 * on the service-sourced candidate list now.
 */
function pickExercise(pattern, tier, availableEquipment, sessionVariant, weekNumber) {
  tier = tier || 1;
  availableEquipment = availableEquipment || ['dumbbells', 'bodyweight'];
  sessionVariant = sessionVariant || 'a';
  weekNumber = weekNumber || 1;

  var options = getByPattern(pattern, tier, availableEquipment);
  if (!options.length) return null;
  if (options.length === 1) return options[0];

  var variantOffset = { a: 0, b: 1, c: 2, upper_1: 0, upper_2: 1, lower_1: 0, lower_2: 1 };
  var offset = variantOffset[sessionVariant] !== undefined ? variantOffset[sessionVariant] : 0;
  var weekOffset = (weekNumber - 1) % options.length;
  var index = (weekOffset + offset) % options.length;
  return options[index];
}

/**
 * getEasierVariant(id, availableEquipment) — the closest easier substitute the
 * user can actually do, or null. Used by deload to step a lift DOWN one level
 * (substitution chain walk) rather than only cutting volume. Prefers the
 * authored regression chain, then a lower-level same-pattern compound.
 */
function getEasierVariant(id, availableEquipment) {
  const subs = movementService.getSubstitutes(id, {
    direction:    'easier',
    equipment:    availableEquipment,
    compoundOnly: true,
  });
  return subs.length ? mapMovementToExercise(subs[0]) : null;
}

/**
 * getCurrentWeekNumber() — ISO-ish week number of the current date (1-53).
 * Unchanged.
 */
function getCurrentWeekNumber() {
  var now  = new Date();
  var jan1 = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}

module.exports = {
  getExercise,
  getByPattern,
  pickExercise,
  getEasierVariant,
  getCurrentWeekNumber,
  // pure helpers (exported for unit tests / reuse)
  mapMovementToExercise,
  levelToTier,
  tierToMaxLevel,
};
