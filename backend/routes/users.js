/**
 * /users routes
 *
 * POST /users         — create a new user (called after Sign in with Apple succeeds)
 * GET  /users/:id     — get a user by ID
 * DELETE /users/:id   — delete a user and all their data (GDPR one-click delete)
 *
 * Thin layer: parse input -> call userService -> respond.
 * All SQL lives in services/userService.js.
 */

'use strict';

const express = require('express');
const userService = require('../services/userService');

const router = express.Router();

// POST /users
router.post('/', (req, res, next) => {
  try {
    const { status, user } = userService.createUser(req.body);
    res.status(status).json(user);
  } catch (err) { next(err); }
});

// GET /users/:id
router.get('/:id', (req, res, next) => {
  try { res.json(userService.getUser(req.params.id)); }
  catch (err) { next(err); }
});

// DELETE /users/:id
router.delete('/:id', (req, res, next) => {
  try { res.json(userService.deleteUser(req.params.id)); }
  catch (err) { next(err); }
});

module.exports = router;
