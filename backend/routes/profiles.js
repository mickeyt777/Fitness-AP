/**
 * /profiles routes
 *
 * GET  /profiles/:userId   — get a user's profile
 * PUT  /profiles/:userId   — create or update a user's profile (upsert)
 *
 * Sensitive fields (glp_drug, glp_current_dose_mg) are encrypted before write
 * and decrypted before return — that logic lives in services/profileService.js.
 *
 * Thin layer: parse input -> call profileService -> respond.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const { firstError, validateRange, validateDate } = require('../middleware/validate');
const profileService = require('../services/profileService');

const router = express.Router();

// GET /profiles/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try { res.json(profileService.getProfile(req.params.userId)); }
  catch (err) { next(err); }
});

// PUT /profiles/:userId  (upsert — all fields optional)
// days_per_week mirrors the service's own 2–4 check at the boundary; dates are
// only validated when present (client sends "YYYY-MM-DD"). Age/height are
// generous physical-sanity bounds.
router.put('/:userId', requireUser, (req, res, next) => {
  const b = req.body ?? {};
  const verr = firstError(
    validateRange(b.days_per_week, 'days_per_week', 2, 4),
    validateRange(b.age, 'age', 0, 120),
    validateRange(b.height_cm, 'height_cm', 0, 300),
    validateDate(b.glp_start_date, 'glp_start_date'),
    validateDate(b.last_dose_change_date, 'last_dose_change_date'),
  );
  if (verr) return res.status(400).json({ error: verr });
  try { res.json(profileService.upsertProfile(req.params.userId, req.body)); }
  catch (err) { next(err); }
});

module.exports = router;
