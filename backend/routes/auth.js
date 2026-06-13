/**
 * /auth routes
 *
 * POST /auth/apple  — validate a Sign in with Apple identity token,
 *                     create the user if they're new, and issue a 30-day
 *                     backend session JWT.
 *
 * Apple identity tokens expire after ~10 minutes, so we never store them —
 * we just use them to bootstrap a longer-lived backend session. The token
 * verification + session issuance live in services/authService.js.
 *
 * Thin layer: parse input -> call authService -> respond.
 */

'use strict';

const express = require('express');
const authService = require('../services/authService');

const router = express.Router();

// POST /auth/apple
router.post('/apple', async (req, res, next) => {
  try {
    const { status, body } = await authService.appleSignIn(req.body);
    res.status(status).json(body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
