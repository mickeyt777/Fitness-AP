/**
 * /reports routes
 *
 * GET  /reports/:userId/weekly          — aggregate this week's data summary
 * POST /reports/:userId/weekly/narrative — build the prompt for the LLM narrative
 *                                          (the narrative itself comes from POST /ai/weekly-report)
 *
 * The split is intentional: the summary is always fast (pure DB), the narrative
 * is on-demand. Aggregation + prompt assembly live in services/reportService.js.
 *
 * Thin layer: parse input -> call reportService -> respond.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const reportService = require('../services/reportService');

const router = express.Router();

// GET /reports/:userId/weekly
router.get('/:userId/weekly', requireUser, (req, res, next) => {
  try { res.json(reportService.getWeeklySummary(req.params.userId, req.query.week_end ?? null)); }
  catch (err) { next(err); }
});

// POST /reports/:userId/weekly/narrative
router.post('/:userId/weekly/narrative', requireUser, (req, res, next) => {
  try { res.json(reportService.getWeeklyNarrative(req.params.userId, req.body?.week_end ?? null)); }
  catch (err) { next(err); }
});

module.exports = router;
