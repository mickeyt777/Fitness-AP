/**
 * /chat routes
 *
 * POST /chat           — receive a chat message from the iOS app
 * GET  /chat/:userId   — get recent chat history
 *
 * The iOS app parses messages on-device and sends the parsed_payload here for
 * storage and action. The backend does NO AI parsing — storage + acting on a
 * parsed payload live in services/chatService.js.
 *
 * Thin layer: parse input -> call chatService -> respond.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const chatService = require('../services/chatService');

const router = express.Router();

// POST /chat
router.post('/', requireUser, (req, res, next) => {
  try { res.status(201).json(chatService.postMessage(req.userId, req.body)); }
  catch (err) { next(err); }
});

// GET /chat/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try { res.json(chatService.listChat(req.params.userId, req.query.limit)); }
  catch (err) { next(err); }
});

module.exports = router;
