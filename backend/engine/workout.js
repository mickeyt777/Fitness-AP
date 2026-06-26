/**
 * Fitness GLP — GLP-Aware Workout Generator & Progression Engine
 *
 * Two responsibilities:
 *   1. generateWorkoutPlan(profile) — given a user's profile, returns a weekly
 *      schedule of sessions with exercises, sets, reps, and target RPE.
 *
 *   2. progressWorkout(currentSets, previousSets) — after a session is logged,
 *      decides what weights to prescribe next time for each exercise.
 *
 * Design principles (from the product plan):
 *   - Minimum effective dose. Every set must justify its existence.
 *   - RPE ceiling of 7–8. Never failure. GLP users recover poorly.
 *   - Compound bias. Squat, hinge, push, pull every session.
 *   - Slow eccentrics (3–4 sec negatives). Strong hypertrophy signal at lower load.
 *   - Beginner-safe regressions. Everyone starts at tier 1 unless they prove otherwise.
 *   - Injection-day awareness. Hardest session scheduled away from injection day.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { getByPattern, pickExercise, getCurrentWeekNumber, getExercise, getEasierVariant } = require('./exercises');

// ── Constants ──────────────────────────────────────────────────────────────

const TARGET_RPE = 7.5;          // midpoint of our 7–8 window
const MAX_RPE    = 8.0;
const MIN_RPE    = 7.0;

// Weekly hard-set targets per muscle group (roughly half of what a non-GLP
// intermediate would target — the drug limits recovery capacity).
const VOLUME_TARGETS = {
  major: { min: 6, max: 10 },   // quads, back, chest, hamstrings
  minor: { min: 4, max: 8 },    // shoulders, biceps, triceps, calves, glutes
};

// Weight increment per progression step, in kg.
const WEIGHT_INCREMENT = {
  upper_body: 2.5,   // dumbbells and cables
  lower_body: 5.0,   // squats, deadlifts, leg press
};

// ── Tier mapping ──────────────────────────────────────────────────────────

function maxTierForLevel(level) {
  switch (level) {
    case 'advanced':      return 3;
    case 'intermediate':  return 2;
    case 'beginner':
    default:              return 1;
  }
}

// ── Titration window ──────────────────────────────────────────────────────

/**
 * isInTitrationWindow(lastDoseChangeDateStr)
 * Returns true if the user changed their dose within the last 14 days.
 * During this window, we reduce volume and RPE targets.
 */
function isInTitrationWindow(lastDoseChangeDateStr) {
  if (!lastDoseChangeDateStr) return false;
  const change = new Date(lastDoseChangeDateStr);
  const now    = new Date();
  const daysSince = (now - change) / (1000 * 60 * 60 * 24);
  return daysSince <= 14;
}

// ── Deload check ──────────────────────────────────────────────────────────

/**
 * shouldAutoDeload(checkin)
 * Given today's check-in scores (from the daily_checkins table), decide
 * whether to swap in a lighter session.
 * Returns { deload: boolean, reason: string | null }
 *
 * Field names match the daily_checkins table columns:
 *   energy_1_10, nausea_1_10, gi_symptoms_1_10
 *
 * Scoring logic:
 *   - Nausea ≤ 4 (moderate–severe) → deload
 *   - GI symptoms ≤ 4 (moderate–severe) → deload
 *   - Energy ≤ 3 (very low) → deload
 *   - Any two of: energy ≤ 5, nausea ≤ 6, gi ≤ 6 → deload
 */
function shouldAutoDeload(checkin) {
  if (!checkin) return { deload: false, reason: null };

  const { energy_1_10, nausea_1_10, gi_symptoms_1_10 } = checkin;

  if (nausea_1_10 !== null && nausea_1_10 !== undefined && nausea_1_10 <= 4) {
    return { deload: true, reason: "You're reporting moderate-to-severe nausea. Swapping today's session for lighter work." };
  }
  if (gi_symptoms_1_10 !== null && gi_symptoms_1_10 !== undefined && gi_symptoms_1_10 <= 4) {
    return { deload: true, reason: "GI symptoms are rough today. Lighter session substituted." };
  }
  if (energy_1_10 !== null && energy_1_10 !== undefined && energy_1_10 <= 3) {
    return { deload: true, reason: "Energy is very low today. We're scaling back." };
  }

  const lowEnergyFlag  = energy_1_10      != null && energy_1_10      <= 5;
  const mildNauseaFlag = nausea_1_10      != null && nausea_1_10      <= 6;
  const mildGiFlag     = gi_symptoms_1_10 != null && gi_symptoms_1_10 <= 6;
  const mildFlagCount  = [lowEnergyFlag, mildNauseaFlag, mildGiFlag].filter(Boolean).length;

  if (mildFlagCount >= 2) {
    return { deload: true, reason: "Energy and symptoms are both a bit off. Going lighter today — this is recovery, not failure." };
  }

  return { deload: false, reason: null };
}

// ── Session builder ───────────────────────────────────────────────────────

/**
 * buildSession(type, profile, options)
 * Returns an array of exercise prescriptions for one session.
 *
 * type: 'full_body_a' | 'full_body_b' | 'full_body_c' | 'upper' | 'lower' | 'deload' | 'mobility'
 *
 * profile fields used:
 *   training_history_level  ('beginner' | 'intermediate' | 'advanced')
 *   equipment_available     (array or JSON string of equipment names)
 *
 * options:
 *   inTitration  (boolean) — if true, reduces volume and caps RPE
 *   weekNumber   (integer) — drives exercise rotation
 */
function buildSession(type, profile, options = {}) {
  const training_history_level = profile.training_history_level || 'beginner';
  const inTitration = options.inTitration ?? false;
  const weekNumber  = options.weekNumber  ?? getCurrentWeekNumber();

  const maxTier = maxTierForLevel(training_history_level);

  let equip;
  const rawEquip = profile.equipment_available || profile.available_equipment;
  if (Array.isArray(rawEquip)) {
    equip = rawEquip;
  } else {
    try {
      equip = JSON.parse(rawEquip || '["dumbbells","bodyweight"]');
    } catch (_) {
      equip = ['dumbbells', 'bodyweight'];
    }
  }

  // During titration or deload, cap at tier 1 and reduce volume.
  const effectiveTier  = (inTitration || type === 'deload') ? 1 : maxTier;
  const setsMultiplier = (inTitration || type === 'deload') ? 0.6 : 1.0;

  // Determine session variant for exercise rotation (a/b/c or upper/lower)
  const sessionVariant = type.includes('_') ? type.split('_').pop() : type;

  const pick = (pattern) =>
    pickExercise(pattern, effectiveTier, equip, sessionVariant, weekNumber);

  const rx = (exercise, sets, reps, rpe) => {
    if (!exercise) return null;
    const adjustedSets = Math.max(2, Math.round(sets * setsMultiplier));
    return {
      id:            uuidv4(),
      exercise_id:   exercise.id,
      name:          exercise.name,
      sets:          adjustedSets,
      reps:          String(reps),
      target_rpe:    (inTitration || type === 'deload') ? Math.min(rpe, 7.0) : rpe,
      notes:         exercise.notes,
    };
  };

  // ── Mobility/rest-day session ────────────────────────────────────────────
  if (type === 'mobility') {
    return [
      { id: uuidv4(), exercise_id: 'hip_90_90',         name: 'Hip 90/90 Stretch',   sets: 2, reps: '60 sec/side', target_rpe: null, notes: 'Gentle. No pain.' },
      { id: uuidv4(), exercise_id: 'thoracic_rotation', name: 'Thoracic Rotation',    sets: 2, reps: '10/side',     target_rpe: null, notes: 'Sit on heels, rotate slowly.' },
      { id: uuidv4(), exercise_id: 'band_pull_apart',   name: 'Band Pull-Apart',      sets: 3, reps: '15',          target_rpe: null, notes: 'Light band. Focus on rear-delt squeeze.' },
      { id: uuidv4(), exercise_id: 'cat_cow',           name: 'Cat-Cow',              sets: 2, reps: '10',          target_rpe: null, notes: 'Slow and controlled.' },
    ];
  }

  // ── Deload: step each main lift DOWN one level, then cut sets/load ───────
  // Rather than only trimming volume, a deload now walks the substitution chain
  // to an easier variant of the user's normal movement (e.g. DB front squat →
  // goblet squat), then still reduces sets and RPE. We pick at the user's real
  // tier first (not the tier-1 cap) so there's a level to step down FROM; when
  // no easier variant exists, the picked movement is kept as-is.
  if (type === 'deload') {
    const deloadPick = (pattern) => {
      const picked = pickExercise(pattern, maxTier, equip, sessionVariant, weekNumber);
      if (!picked) return null;
      return getEasierVariant(picked.id, equip) || picked;
    };
    return [
      rx(deloadPick('squat'),  2, 10, 6.0),
      rx(deloadPick('hinge'),  2, 10, 6.0),
      rx(deloadPick('push_h'), 2, 12, 6.0),
      rx(deloadPick('pull_h'), 2, 12, 6.0),
    ].filter(Boolean);
  }

  // ── Full-body sessions (A, B, C) ─────────────────────────────────────────
  if (type.startsWith('full_body')) {
    const variant = type.slice(-1); // 'a', 'b', or 'c'

    // Each variant emphasises a slightly different exercise selection
    // so the user gets variety across the week.
    const squatEx = pick('squat');
    const hingeEx = pick('hinge');
    const pushHEx = pick(variant === 'c' ? 'push_v' : 'push_h');
    const pushVEx = variant === 'a' ? pick('push_v') : null;
    const pullHEx = pick('pull_h');
    const pullVEx = pick('pull_v');

    return [
      rx(squatEx,   3, 10, TARGET_RPE),
      rx(hingeEx,   3, 10, TARGET_RPE),
      rx(pushHEx,   3, 10, TARGET_RPE),
      pushVEx ? rx(pushVEx, 2, 12, TARGET_RPE) : null,
      rx(pullHEx,   3, 10, TARGET_RPE),
      rx(pullVEx,   3, 10, TARGET_RPE),
    ].filter(Boolean);
  }

  // ── Upper / Lower split ──────────────────────────────────────────────────
  if (type === 'upper') {
    return [
      rx(pick('push_h'), 3, 10, TARGET_RPE),
      rx(pick('push_v'), 2, 12, TARGET_RPE),
      rx(pick('pull_h'), 3, 10, TARGET_RPE),
      rx(pick('pull_v'), 3, 10, TARGET_RPE),
    ].filter(Boolean);
  }

  if (type === 'lower') {
    return [
      rx(pick('squat'),  3, 10, TARGET_RPE),
      rx(pick('hinge'),  3, 10, TARGET_RPE),
      rx(pick('hinge'),  2, 12, TARGET_RPE), // second hinge variation (e.g. hip thrust)
    ].filter(Boolean);
  }

  return [];
}

// ── Weekly plan generator ─────────────────────────────────────────────────

/**
 * generateWorkoutPlan(profile, options)
 *
 * Returns an array of sessions for the coming week. Each session includes:
 *   - day_offset: 0-based (0 = today, 1 = tomorrow, etc.)
 *   - session_type
 *   - exercises: array of exercise prescriptions
 *
 * The injection day is identified and the hardest session is scheduled as
 * far from it as possible.
 */
function generateWorkoutPlan(profile, options = {}) {
  const {
    days_per_week = 3,
    glp_injection_day_of_week,  // 0=Sun, 1=Mon, … 6=Sat (or null)
    training_history_level = 'beginner',
    last_dose_change_date,
    equipment_available,
  } = profile;

  const todayDow = new Date().getDay(); // 0 = Sunday
  const inTitration = isInTitrationWindow(last_dose_change_date);

  if (inTitration) {
    console.log('[workout] User in titration window — reducing volume/intensity');
  }

  // Build the session types for this week.
  let sessionTypes;
  if (days_per_week <= 2) {
    sessionTypes = ['full_body_a', 'full_body_b'];
  } else if (days_per_week === 3) {
    sessionTypes = ['full_body_a', 'full_body_b', 'full_body_c'];
  } else {
    sessionTypes = ['upper', 'lower', 'upper', 'lower'];
  }

  // Distribute sessions across the week, avoiding the injection day (and the
  // day after, when nausea is typically highest).
  const injectionDow = glp_injection_day_of_week ?? null;
  const avoidDays    = injectionDow !== null
    ? [injectionDow, (injectionDow + 1) % 7]
    : [];

  const availableDays = Array.from({ length: 7 }, (_, i) => (todayDow + i) % 7)
    .filter(d => !avoidDays.includes(d));

  // Pick evenly spaced days — for 3 sessions from 5 available days, pick day 0, 2, 4.
  const step = Math.floor(availableDays.length / days_per_week);
  const scheduledDays = sessionTypes.map((_, i) => availableDays[i * step] ?? availableDays[i]);

  const sessions = sessionTypes.map((type, i) => {
    const dayOfWeek = scheduledDays[i];
    const dayOffset = (dayOfWeek - todayDow + 7) % 7;

    const exercises = buildSession(
      inTitration ? 'deload' : type,
      { training_history_level, equipment_available },
      { inTitration, weekNumber: getCurrentWeekNumber() }
    );

    return {
      id:           uuidv4(),
      day_offset:   dayOffset,
      day_of_week:  dayOfWeek,
      session_type: inTitration ? 'deload' : type,
      exercises,
      titration_note: inTitration
        ? 'Volume and intensity reduced — you recently changed your dose. This is by design.'
        : null,
    };
  });

  return sessions;
}

// ── Progression engine ────────────────────────────────────────────────────

/**
 * progressWorkout(currentSets, previousSets)
 *
 * Given arrays of completed sets from this session and the previous session,
 * returns a map of exercise_id → { next_weight, action, reason }.
 *
 * Each set object should have:
 *   exercise_id, actual_rpe, actual_reps, target_reps, actual_weight,
 *   target_rpe (optional, defaults to TARGET_RPE = 7.5)
 *
 * Rules (from the product plan):
 *   - If actual RPE was 1+ point BELOW target for BOTH this and the previous
 *     session: weight goes up by the smallest meaningful increment.
 *   - If actual RPE was AT or ABOVE target: weight holds.
 *   - If the user missed reps or RPE was above MAX_RPE + 0.5: soft deload (−10%).
 */
function progressWorkout(currentSets, previousSets = []) {
  const previousByExercise = Object.fromEntries(
    (previousSets || []).map(s => [s.exercise_id, s])
  );

  // Resolve exercise metadata once, up front, for every distinct exercise_id in
  // this session — instead of looking each one up inside the per-set loop.
  // Today getExercise() is an in-memory map read, but Phase 1 moves the movement
  // library into SQLite; batching here keeps that switch from turning this loop
  // into an N+1 query. Unknown ids resolve to null and fall back to upper-body.
  const lowerBodyPatterns = ['squat', 'hinge'];
  const exerciseById = {};
  for (const exId of new Set(currentSets.map(s => s.exercise_id).filter(Boolean))) {
    try {
      exerciseById[exId] = getExercise(exId);
    } catch (_) {
      exerciseById[exId] = null; // unknown exercise — default to upper-body increment
    }
  }

  const recommendations = {};

  for (const set of currentSets) {
    const exercise_id  = set.exercise_id;
    const actual_rpe   = set.actual_rpe;
    const actual_reps  = set.actual_reps;
    const target_reps  = set.target_reps;
    const actual_weight = set.actual_weight ?? 0;
    const target_rpe_val = set.target_rpe ?? TARGET_RPE;

    if (actual_rpe === null || actual_rpe === undefined) continue;
    if (!exercise_id) continue;

    const prev = previousByExercise[exercise_id];
    const currentWeight = actual_weight;

    // Determine which increment to use (upper vs lower body), using the
    // metadata resolved once above rather than a per-set lookup.
    const ex = exerciseById[exercise_id];
    const isLower = ex ? lowerBodyPatterns.includes(ex.pattern) : false;

    const increment = isLower ? WEIGHT_INCREMENT.lower_body : WEIGHT_INCREMENT.upper_body;

    // Check for missed reps or RPE blowout.
    const missedReps = target_reps && actual_reps && actual_reps < target_reps;
    const rpeBlowout = actual_rpe > MAX_RPE + 0.5; // > 8.5 is a red flag

    if (missedReps || rpeBlowout) {
      recommendations[exercise_id] = {
        next_weight: parseFloat((currentWeight * 0.9).toFixed(1)),
        action:      'deload',
        reason:      missedReps
          ? 'Missed reps — reducing weight by 10%.'
          : 'RPE too high — reducing weight by 10%.',
      };
      continue;
    }

    // Both this session and previous session felt easy (RPE 1+ below target).
    const currentEasy  = actual_rpe <= target_rpe_val - 1;
    const previousEasy = prev
      && prev.actual_rpe !== null
      && prev.actual_rpe !== undefined
      && prev.actual_rpe <= (prev.target_rpe ?? TARGET_RPE) - 1;

    if (currentEasy && previousEasy) {
      recommendations[exercise_id] = {
        next_weight: parseFloat((currentWeight + increment).toFixed(1)),
        action:      'increase',
        reason:      `Two sessions in a row well below target RPE — adding ${increment} kg.`,
      };
      continue;
    }

    // Default: hold weight.
    recommendations[exercise_id] = {
      next_weight: currentWeight,
      action:      'hold',
      reason:      'Weight is appropriate — hold here.',
    };
  }

  return recommendations;
}

module.exports = {
  generateWorkoutPlan,
  progressWorkout,
  shouldAutoDeload,
  isInTitrationWindow,
  buildSession,
};
