/**
 * /workouts routes
 *
 * GET  /workouts/:userId/plan        — generate this week's workout plan
 * GET  /workouts/:userId             — list recent workouts
 * POST /workouts                     — create a new planned workout
 * GET  /workouts/:userId/:workoutId  — get one workout with its sets
 * PUT  /workouts/:userId/:workoutId/complete — mark a workout done and run progression
 * POST /workouts/:workoutId/sets     — log a set within a workout
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireUser } = require('../middleware/requireUser');
const { generateWorkoutPlan, progressWorkout } = require('../engine/workout');
const { decrypt } = require('../db/encrypt');

const router = express.Router();

// ── GET /workouts/:userId/plan ─────────────────────────────────────────────

router.get('/:userId/plan', requireUser, (req, res, next) => {
  try {
    const db      = getDb();
    const userId  = req.params.userId;

    // Load the user's profile.
    const rawProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
    if (!rawProfile) {
      return res.status(404).json({ error: 'Profile not found. Complete onboarding first.' });
    }

    // Decrypt the profile fields we need.
    const profile = {
      ...rawProfile,
      glp_drug:            decrypt(rawProfile.glp_drug),
      glp_current_dose_mg: decrypt(rawProfile.glp_current_dose_mg),
      equipment_available: rawProfile.equipment_available
        ? JSON.parse(rawProfile.equipment_available)
        : ['dumbbells', 'bodyweight'],
    };

    const plan = generateWorkoutPlan(profile);
    return res.json(plan);
  } catch (err) {
    next(err);
  }
});

// ── GET /workouts/:userId ──────────────────────────────────────────────────

router.get('/:userId', requireUser, (req, res, next) => {
  try {
    const db   = getDb();
    const rows = db.prepare(`
      SELECT * FROM workouts
      WHERE user_id = ?
      ORDER BY planned_date DESC
      LIMIT 30
    `).all(req.params.userId);

    return res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── POST /workouts ─────────────────────────────────────────────────────────

router.post('/', requireUser, (req, res, next) => {
  try {
    const db  = getDb();
    const uid = req.userId;
    const { planned_date, session_type, template_id, exercises = [] } = req.body;

    if (!planned_date) return res.status(400).json({ error: 'planned_date is required' });

    const workoutId = uuidv4();
    const now       = new Date().toISOString();

    db.prepare(`
      INSERT INTO workouts (id, user_id, planned_date, session_type, template_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(workoutId, uid, planned_date, session_type ?? null, template_id ?? null, now);

    // Optionally pre-populate sets from the plan.
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

    return res.status(201).json({ ...workout, sets });
  } catch (err) {
    next(err);
  }
});

// ── GET /workouts/:userId/:workoutId ───────────────────────────────────────

router.get('/:userId/:workoutId', requireUser, (req, res, next) => {
  try {
    const db      = getDb();
    const workout = db.prepare('SELECT * FROM workouts WHERE id = ? AND user_id = ?')
                      .get(req.params.workoutId, req.params.userId);

    if (!workout) return res.status(404).json({ error: 'Workout not found' });

    const sets = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY set_order')
                   .all(workout.id);

    return res.json({ ...workout, sets });
  } catch (err) {
    next(err);
  }
});

// ── PUT /workouts/:userId/:workoutId/complete ──────────────────────────────

router.put('/:userId/:workoutId/complete', requireUser, (req, res, next) => {
  try {
    const db      = getDb();
    const wId     = req.params.workoutId;
    const uid     = req.params.userId;
    const now     = new Date().toISOString();

    // Mark the workout as completed.
    db.prepare('UPDATE workouts SET completed_at = ? WHERE id = ? AND user_id = ?')
      .run(now, wId, uid);

    // Get current sets for progression calculation.
    const currentSets = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ?').all(wId);

    // Find the previous workout of the same type to compare RPE trends.
    const thisWorkout = db.prepare('SELECT * FROM workouts WHERE id = ?').get(wId);
    let previousSets = [];

    if (thisWorkout) {
      const previousWorkout = db.prepare(`
        SELECT w.id FROM workouts w
        WHERE w.user_id = ? AND w.session_type = ? AND w.completed_at IS NOT NULL
          AND w.id != ?
        ORDER BY w.completed_at DESC
        LIMIT 1
      `).get(uid, thisWorkout.session_type, wId);

      if (previousWorkout) {
        previousSets = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ?')
                         .all(previousWorkout.id);
      }
    }

    // Run the progression engine.
    const progressionRecommendations = progressWorkout(currentSets, previousSets);

    return res.json({
      message: 'Workout completed.',
      progression: progressionRecommendations,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /workouts/:workoutId/sets ─────────────────────────────────────────

router.post('/:workoutId/sets', requireUser, (req, res, next) => {
  try {
    const db  = getDb();
    const {
      exercise_id, exercise_name,
      set_order,
      target_reps, target_rpe,
      actual_reps, actual_weight, actual_rpe,
      notes,
    } = req.body;

    const id  = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO workout_sets
        (id, workout_id, exercise_id, exercise_name, set_order,
         target_reps, target_rpe, actual_reps, actual_weight, actual_rpe, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.workoutId, exercise_id, exercise_name ?? exercise_id, set_order ?? 1,
           target_reps ?? null, target_rpe ?? null,
           actual_reps ?? null, actual_weight ?? null, actual_rpe ?? null,
           notes ?? null, now);

    const set = db.prepare('SELECT * FROM workout_sets WHERE id = ?').get(id);
    return res.status(201).json(set);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
