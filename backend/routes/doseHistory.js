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
const doseHistoryService = require('../services/doseHistoryService');

const router = express.Router();

// POST /dose-history
router.post('/', requireUser, (req, res, next) => {
  try { res.status(201).json(doseHistoryService.recordDose(req.userId, req.body)); }
  catch (err) { next(err); }
});

// GET /dose-history/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try { res.json(doseHistoryService.listDoseHistory(req.params.userId)); }
  catch (err) { next(err); }
});

module.exports = router;
