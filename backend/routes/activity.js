/**
 * /activity routes — Phase 2 (cardio / steps / HealthKit)
 *
 * POST /activity/daily              — upsert a day's steps/distance/active-energy rollup
 * POST /activity/cardio             — log one manual cardio bout (alias-resolves modality)
 * POST /activity/healthkit/sync     — idempotent batch sync of HealthKit workouts (HK wins dedup)
 * GET  /activity/:userId/cardio     — recent cardio bouts (non-superseded by default)
 * GET  /activity/:userId/summary    — Today-ring + Progress-sparkline payload + trend
 *
 * Thin layer: validate -> call activityService -> respond. All SQL + dedup live
 * in services/activityService.js; numeric logic in lib/activityMath.js.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const { firstError, validateRange, validateDate, validateEnum } = require('../middleware/validate');
const activityService = require('../services/activityService');

const router = express.Router();

// POST /activity/daily
router.post('/daily', requireUser, (req, res, next) => {
  const b = req.body ?? {};
  const verr = firstError(
    validateDate(b.date, 'date'),
    validateRange(b.steps, 'steps', 0, 200000),
    validateRange(b.distance_m, 'distance_m', 0, 1000000),
    validateRange(b.active_energy_kcal, 'active_energy_kcal', 0, 50000),
    validateEnum(b.source, 'source', ['healthkit', 'manual', 'mixed'])
  );
  if (verr) return res.status(400).json({ error: verr });
  try { res.status(201).json(activityService.upsertDailyActivity(req.userId, b)); }
  catch (err) { next(err); }
});

// POST /activity/cardio
router.post('/cardio', requireUser, (req, res, next) => {
  const b = req.body ?? {};
  const verr = firstError(
    validateDate(b.date, 'date'),
    validateRange(b.duration_min, 'duration_min', 0, 1440),
    validateRange(b.distance_m, 'distance_m', 0, 1000000),
    validateRange(b.active_energy_kcal, 'active_energy_kcal', 0, 50000),
    validateRange(b.avg_hr, 'avg_hr', 1, 250),
    validateEnum(b.intensity, 'intensity', ['easy', 'moderate', 'hard'])
  );
  if (verr) return res.status(400).json({ error: verr });
  try { res.status(201).json(activityService.logCardioSession(req.userId, b)); }
  catch (err) { next(err); }
});

// POST /activity/healthkit/sync
// Body: { workouts: [ { hk_uuid, started_at, date?, modality?, movement_id?,
//                       duration_min?, distance_m?, active_energy_kcal?, avg_hr?, intensity? }, ... ] }
router.post('/healthkit/sync', requireUser, (req, res, next) => {
  const workouts = req.body?.workouts;
  if (!Array.isArray(workouts)) {
    return res.status(400).json({ error: 'workouts must be an array' });
  }
  try { res.status(200).json(activityService.syncHealthKit(req.userId, workouts)); }
  catch (err) { next(err); }
});

// GET /activity/:userId/cardio?days=30&include_superseded=false
router.get('/:userId/cardio', requireUser, (req, res, next) => {
  const includeSuperseded = req.query.include_superseded === 'true';
  try { res.json(activityService.listCardioSessions(req.params.userId, req.query.days, includeSuperseded)); }
  catch (err) { next(err); }
});

// GET /activity/:userId/summary?days=14
router.get('/:userId/summary', requireUser, (req, res, next) => {
  try { res.json(activityService.getActivitySummary(req.params.userId, req.query.days)); }
  catch (err) { next(err); }
});

module.exports = router;
