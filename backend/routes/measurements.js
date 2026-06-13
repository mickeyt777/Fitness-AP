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
const measurementService = require('../services/measurementService');

const router = express.Router();

// POST /measurements
router.post('/', requireUser, (req, res, next) => {
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
