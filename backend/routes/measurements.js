/**
 * /measurements routes
 *
 * POST /measurements           — log a new measurement entry
 * GET  /measurements/:userId   — get measurement history (last 26 weeks default)
 * GET  /measurements/:userId/latest — most recent entry
 *
 * Body-composition measurements are encrypted at rest and the lean-mass proxy
 * score is computed in services/measurementService.js.
 *
 * Thin layer: parse input -> call measurementService -> respond.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const { firstError, validateRange, validateDate } = require('../middleware/validate');
const measurementService = require('../services/measurementService');

const router = express.Router();

// POST /measurements
// Every field is optional. Ranges are generous physical-sanity bounds — they
// only reject values that are present and clearly nonsensical (negative or
// absurd), never omitted fields.
router.post('/', requireUser, (req, res, next) => {
  const b = req.body ?? {};
  const verr = firstError(
    validateDate(b.taken_at, 'taken_at'),
    validateRange(b.weight_kg, 'weight_kg', 0, 1000),
    validateRange(b.waist_cm, 'waist_cm', 0, 500),
    validateRange(b.hip_cm,   'hip_cm',   0, 500),
    validateRange(b.chest_cm, 'chest_cm', 0, 500),
    validateRange(b.arm_cm,   'arm_cm',   0, 500),
    validateRange(b.thigh_cm, 'thigh_cm', 0, 500),
  );
  if (verr) return res.status(400).json({ error: verr });
  try { res.status(201).json(measurementService.logMeasurement(req.userId, req.body)); }
  catch (err) { next(err); }
});

// GET /measurements/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try { res.json(measurementService.listMeasurements(req.params.userId, req.query.weeks)); }
  catch (err) { next(err); }
});

// GET /measurements/:userId/latest
router.get('/:userId/latest', requireUser, (req, res, next) => {
  try { res.json(measurementService.getLatestMeasurement(req.params.userId)); }
  catch (err) { next(err); }
});

module.exports = router;
