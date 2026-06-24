/**
 * /recovery routes — Phase 2-D (rest-day / recovery awareness).
 *
 * GET /recovery/:userId — today's non-clinical recovery read (train / easy / rest).
 *
 * Thin layer: call recoveryService -> respond. All composition lives in the service;
 * the readiness scoring lives in lib/recoveryMath.js.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const recoveryService = require('../services/recoveryService');

const router = express.Router();

// GET /recovery/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try {
    res.json(recoveryService.getRecovery(req.params.userId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
