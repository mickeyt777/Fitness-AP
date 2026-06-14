/**
 * /dose-history routes
 *
 * POST /dose-history           — record a new dose or drug change
 * GET  /dose-history/:userId   — get dose history for a user
 *
 * Closing the prior entry, encrypting the dose, and flagging the profile's
 * dose-change date all live in services/doseHistoryService.js.
 *
 * Thin layer: parse input -> call doseHistoryService -> respond.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const { firstError, requireFields, validateDate } = require('../middleware/validate');
const doseHistoryService = require('../services/doseHistoryService');

const router = express.Router();

// POST /dose-history
// `drug` is required here; its allowed-values check stays in the service
// (which owns the VALID_DRUGS list). `started_on` defaults server-side, so
// it's only validated when present.
router.post('/', requireUser, (req, res, next) => {
  const verr = firstError(
    requireFields(req.body, ['drug']),
    validateDate(req.body?.started_on, 'started_on'),
  );
  if (verr) return res.status(400).json({ error: verr });
  try { res.status(201).json(doseHistoryService.recordDose(req.userId, req.body)); }
  catch (err) { next(err); }
});

// GET /dose-history/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try { res.json(doseHistoryService.listDoseHistory(req.params.userId)); }
  catch (err) { next(err); }
});

module.exports = router;
