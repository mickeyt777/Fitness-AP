/**
 * /checkins routes
 *
 * POST /checkins           — submit today's check-in (energy, nausea, GI, sleep)
 * GET  /checkins/:userId   — get recent check-ins for a user (last 30 days default)
 * GET  /checkins/:userId/today — get today's check-in (used by app on open)
 *
 * Thin layer: parse input -> call checkinService -> respond.
 * All SQL + the shouldAutoDeload engine call live in services/checkinService.js.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const { firstError, validateRange, validateDate } = require('../middleware/validate');
const checkinService = require('../services/checkinService');

const router = express.Router();

// POST /checkins
// All fields are optional (the service upserts nulls), so these guards only
// reject values that are present AND out of range — omitted fields still pass.
router.post('/', requireUser, (req, res, next) => {
  const b = req.body ?? {};
  const verr = firstError(
    validateDate(b.date, 'date'),
    validateRange(b.energy_1_10, 'energy_1_10', 1, 10),
    validateRange(b.nausea_1_10, 'nausea_1_10', 1, 10),
    validateRange(b.gi_symptoms_1_10, 'gi_symptoms_1_10', 1, 10),
    validateRange(b.sleep_hours, 'sleep_hours', 0, 24),
  );
  if (verr) return res.status(400).json({ error: verr });
  try { res.status(201).json(checkinService.submitCheckin(req.userId, req.body)); }
  catch (err) { next(err); }
});

// GET /checkins/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try { res.json(checkinService.listRecentCheckins(req.params.userId, req.query.days)); }
  catch (err) { next(err); }
});

// GET /checkins/:userId/today
router.get('/:userId/today', requireUser, (req, res, next) => {
  try { res.json(checkinService.getTodayCheckin(req.params.userId)); }
  catch (err) { next(err); }
});

module.exports = router;
