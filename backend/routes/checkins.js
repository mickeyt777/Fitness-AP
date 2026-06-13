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
const checkinService = require('../services/checkinService');

const router = express.Router();

// POST /checkins
router.post('/', requireUser, (req, res, next) => {
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
