'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { decrypt } = require('../db/encrypt');
const { generateWorkoutPlan, progressWorkout } = require('../engine/workout');
const { httpError } = require('../lib/httpError');

// GET /:userId/plan
function getWeeklyPlan(userId) {
  const db = getDb();
  const rawProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!rawProfile) {
    throw httpError(404, 'Profile not found. Complete onboarding first.');
  }
  const profile = {
    ...rawProfile,
    glp_drug:            decrypt(rawProfile.glp_drug),
    glp_current_dose_mg: decrypt(rawProfile.glp_current_dose_mg),
    equipment_available: rawProfile.equipment_available
      ? JSON.parse(rawProfile.equipment_available)
      : ['dumbbells', 'bodyweight'],
  };
  return generateWorkoutPlan(profile);
}

// GET /:userId
function listRecentWorkouts(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM workouts
    WHERE user_id = ?
    ORDER BY planned_date DESC
    LIMIT 30
  `).all(userId);
}

// POST /
function createWorkout(userId, { planned_date, session_type, template_id, exercises = [] }) {
  if (!planned_date) throw httpError(400, 'planned_date is required');

  const db        = getDb();
  const workoutId = uuidv4();
  const now       = new Date().toISOString();

  db.prepare(`
    INSERT INTO workouts (id, user_id, planned_date, session_type, template_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(workoutId, userId, planned_date, session_type ?? null, template_id ?? null, now);

  const insertSet = db.prepare(`
    INSERT INTO workout_sets
      (id, workout_id, exercise_id, exercise_name, set_order, target_reps, target_rpe, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let setOrder = 1;
  for (const ex of exercises) {
    for (let s = 0; s < (ex.target_sets ?? 3); s++) {
      insertSet.run(uuidv4(), workoutId, ex.exercise_id, ex.exercise_name, setOrder++,
                    ex.target_reps ?? null, ex.target_rpe ?? null, now);
    }
  }

  const workout = db.prepare('SELECT * FROM workouts WHERE id = ?').get(workoutId);
  const sets    = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY set_order').all(workoutId);
  return { ...workout, sets };
}

// GET /:userId/:workoutId
function getWorkout(userId, workoutId) {
  const db = getDb();
  const workout = db.prepare('SELECT * FROM workouts WHERE id = ? AND user_id = ?')
                    .get(workoutId, userId);
  if (!workout) throw httpError(404, 'Workout not found');

  const sets = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY set_order')
                 .all(workout.id);
  return { ...workout, sets };
}

// PUT /:userId/:workoutId/complete
function completeWorkout(userId, workoutId) {
  const db  = getDb();
  const now = new Date().toISOString();

  db.prepare('UPDATE workouts SET completed_at = ? WHERE id = ? AND user_id = ?')
    .run(now, workoutId, userId);

  const currentSets  = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ?').all(workoutId);
  const thisWorkout  = db.prepare('SELECT * FROM workouts WHERE id = ?').get(workoutId);
  let previousSets = [];

  if (thisWorkout) {
    const previousWorkout = db.prepare(`
      SELECT w.id FROM workouts w
      WHERE w.user_id = ? AND w.session_type = ? AND w.completed_at IS NOT NULL
        AND w.id != ?
      ORDER BY w.completed_at DESC
      LIMIT 1
    `).get(userId, thisWorkout.session_type, workoutId);

    if (previousWorkout) {
      previousSets = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ?')
                       .all(previousWorkout.id);
    }
  }

  // NOTE (Trap 2 / N+1): progressWorkout() calls getExercise() per set.
  // Fine on the in-memory array today; revisit when movements move to SQLite in Phase 1.
  const progression = progressWorkout(currentSets, previousSets);
  return { message: 'Workout completed.', progression };
}

// POST /:workoutId/sets
// NOTE: reps pass straight through as stored (String(reps) quirk preserved — do NOT coerce here).
function logSet(workoutId, body) {
  const db  = getDb();
  const id  = uuidv4();
  const now = new Date().toISOString();
  const {
    exercise_id, exercise_name, set_order,
    target_reps, target_rpe,
    actual_reps, actual_weight, actual_rpe, notes,
  } = body;

  db.prepare(`
    INSERT INTO workout_sets
      (id, workout_id, exercise_id, exercise_name, set_order,
       target_reps, target_rpe, actual_reps, actual_weight, actual_rpe, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, workoutId, exercise_id, exercise_name ?? exercise_id, set_order ?? 1,
         target_reps ?? null, target_rpe ?? null,
         actual_reps ?? null, actual_weight ?? null, actual_rpe ?? null,
         notes ?? null, now);

  return db.prepare('SELECT * FROM workout_sets WHERE id = ?').get(id);
}

module.exports = {
  getWeeklyPlan, listRecentWorkouts, createWorkout,
  getWorkout, completeWorkout, logSet,
};
