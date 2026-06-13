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
const profileService = require('../services/profileService');

const router = express.Router();

// GET /profiles/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try { res.json(profileService.getProfile(req.params.userId)); }
  catch (err) { next(err); }
});

// PUT /profiles/:userId
router.put('/:userId', requireUser, (req, res, next) => {
  try { res.json(profileService.upsertProfile(req.params.userId, req.body)); }
  catch (err) { next(err); }
});

module.exports = router;
