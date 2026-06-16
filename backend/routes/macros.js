/**
 * /macros routes
 *
 * GET /macros/:userId              — calculate macros from the user's current profile
 * GET /macros/:userId/leaderboard  — protein-per-100-calorie food leaderboard
 *
 * Thin layer: parse input -> call macroService -> respond.
 * All SQL + engine logic lives in services/macroService.js.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const macroService = require('../services/macroService');

const router = express.Router();

// GET /macros/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try { res.json(macroService.getMacros(req.params.userId)); }
  catch (err) { next(err); }
});

// GET /macros/:userId/leaderboard
router.get('/:userId/leaderboard', requireUser, (req, res, next) => {
  try { res.json(macroService.getLeaderboard()); }
  catch (err) { next(err); }
});

module.exports = router;
