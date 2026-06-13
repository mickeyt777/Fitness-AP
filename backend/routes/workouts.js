/**
 * /workouts routes
 *
 * GET  /workouts/:userId/plan        — generate this week's workout plan
 * GET  /workouts/:userId             — list recent workouts
 * POST /workouts                     — create a new planned workout
 * GET  /workouts/:userId/:workoutId  — get one workout with its sets
 * PUT  /workouts/:userId/:workoutId/complete — mark a workout done and run progression
 * POST /workouts/:workoutId/sets     — log a set within a workout
 *
 * Thin layer: parse input -> call workoutService -> respond.
 * All SQL + engine logic lives in services/workoutService.js.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const workoutService = require('../services/workoutService');

const router = express.Router();

// GET /workouts/:userId/plan
router.get('/:userId/plan', requireUser, (req, res, next) => {
  try { res.json(workoutService.getWeeklyPlan(req.params.userId)); }
  catch (err) { next(err); }
});

// GET /workouts/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try { res.json(workoutService.listRecentWorkouts(req.params.userId)); }
  catch (err) { next(err); }
});

// POST /workouts
router.post('/', requireUser, (req, res, next) => {
  try { res.status(201).json(workoutService.createWorkout(req.userId, req.body)); }
  catch (err) { next(err); }
});

// GET /workouts/:userId/:workoutId
router.get('/:userId/:workoutId', requireUser, (req, res, next) => {
  try { res.json(workoutService.getWorkout(req.params.userId, req.params.workoutId)); }
  catch (err) { next(err); }
});

// PUT /workouts/:userId/:workoutId/complete
router.put('/:userId/:workoutId/complete', requireUser, (req, res, next) => {
  try { res.json(workoutService.completeWorkout(req.params.userId, req.params.workoutId)); }
  catch (err) { next(err); }
});

// POST /workouts/:workoutId/sets
router.post('/:workoutId/sets', requireUser, (req, res, next) => {
  try { res.status(201).json(workoutService.logSet(req.params.workoutId, req.body)); }
  catch (err) { next(err); }
});

module.exports = router;
