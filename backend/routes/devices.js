/**
 * /devices routes
 *
 * POST /devices           — register or refresh a device token
 * DELETE /devices/:token  — remove a token (user logs out or disables notifications)
 * GET  /devices/:userId   — list tokens for a user (internal use by the push worker)
 *
 * Thin layer: parse input -> call deviceService -> respond.
 * The token-required check + all SQL live in services/deviceService.js.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const deviceService = require('../services/deviceService');

const router = express.Router();

// POST /devices
router.post('/', requireUser, (req, res, next) => {
  try { res.status(201).json(deviceService.registerDevice(req.userId, req.body)); }
  catch (err) { next(err); }
});

// DELETE /devices/:token
router.delete('/:token', requireUser, (req, res, next) => {
  try { res.json(deviceService.removeDevice(req.userId, req.params.token)); }
  catch (err) { next(err); }
});

// GET /devices/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try { res.json(deviceService.listDevices(req.params.userId)); }
  catch (err) { next(err); }
});

module.exports = router;
