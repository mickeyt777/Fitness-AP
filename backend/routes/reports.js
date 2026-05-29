/**
 * /reports routes
 *
 * GET  /reports/:userId/weekly          — aggregate this week's data summary
 * POST /reports/:userId/weekly/narrative — generate the LLM-written narrative
 *                                          (calls POST /ai/weekly-report internally)
 *
 * The split is intentional:
 *   - The summary is always fast (pure DB queries, no AI).
 *   - The narrative is on-demand (costs a cloud LLM call).
 * The iOS app can show the data summary immediately, then fetch the narrative
 * asynchronously and slot it in when ready.
 */

'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { requireUser } = require('../middleware/requireUser');
const { aggregateWeeklyReport } = require('../engine/weeklyReport');

const router = express.Router();

// ── GET /reports/:userId/weekly ────────────────────────────────────────────

router.get('/:userId/weekly', requireUser, (req, res, next) => {
  try {
    const db          = getDb();
    const weekEndDate = req.query.week_end ?? null; // optional override, defaults to today

    const summary = aggregateWeeklyReport(db, req.params.userId, weekEndDate);
    return res.json(summary);
  } catch (err) {
    next(err);
  }
});

// ── POST /reports/:userId/weekly/narrative ─────────────────────────────────

router.post('/:userId/weekly/narrative', requireUser, async (req, res, next) => {
  try {
    const db          = getDb();
    const weekEndDate = req.body?.week_end ?? null;

    // Step 1: get the data summary
    const summary = aggregateWeeklyReport(db, req.params.userId, weekEndDate);

    // Step 2: call the /ai/weekly-report endpoint logic directly
    // (Rather than making an HTTP call to ourselves, we import the logic inline.)
    // For now, return the summary and a note — once the cloud LLM provider is
    // wired in (see routes/ai.js), this will return the full narrative.

    // Build a human-readable summary string for the LLM prompt
    const summaryLines = [
      `Period: ${summary.period.start} to ${summary.period.end}`,
      `Workouts: ${summary.workouts.completed}/${summary.workouts.planned} completed (${summary.workouts.adherence_pct ?? '?'}% adherence)`,
      `Average RPE: ${summary.workouts.avg_rpe ?? 'not logged'}`,
      `Total tonnage: ${summary.workouts.total_tonnage_kg} kg`,
      summary.strength.map(s =>
        `${s.exercise_name}: ${s.this_week_kg ?? '?'} kg this week` +
        (s.change_kg !== null ? ` (${s.change_kg > 0 ? '+' : ''}${s.change_kg} kg vs last week)` : '')
      ).join('\n'),
      `Check-in days logged: ${summary.checkins.days_logged}/7`,
      `Average energy: ${summary.checkins.avg_energy ?? '?'}/10`,
      `Symptom days: ${summary.checkins.symptom_days}`,
      `Lean-mass proxy: ${summary.lean_mass_proxy.score ?? 'no measurements'} — ${summary.lean_mass_proxy.summary}`,
      summary.body_weight.this_week_kg ? `Weight: ${summary.body_weight.this_week_kg} kg (4-week trend: ${summary.body_weight.trend_4wk_kg ?? '?'} kg)` : 'No weight logged',
      summary.drug_context.in_titration_window ? `Note: User is in titration window (day ${summary.drug_context.days_since_dose_change} of 14 after dose change)` : '',
    ].filter(Boolean).join('\n');

    // Store the narrative request in the DB for audit trail
    // (actual LLM call goes through POST /ai/weekly-report)

    return res.json({
      summary,
      narrative_prompt: summaryLines,
      narrative: null, // populated when POST /ai/weekly-report is called
      message: 'Send narrative_prompt to POST /ai/weekly-report to generate the written summary.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
