/**
 * /ai routes — Cloud LLM wrapper
 *
 * The iOS app calls this only when the on-device Foundation Models model
 * can't handle a task well enough — specifically:
 *   - Weekly narrative report generation
 *   - Chat parsing when the on-device model returns low confidence
 *
 * Thin layer: parse input -> await aiService -> respond.
 * The Cloud LLM wrapper, prompts, and parsing all live in services/aiService.js.
 *
 * Routes:
 *   POST /ai/chat-parse     — parse a chat message (low-confidence fallback)
 *   POST /ai/weekly-report  — generate the LLM-written weekly narrative
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const aiService = require('../services/aiService');

const router = express.Router();

// POST /ai/chat-parse
router.post('/chat-parse', requireUser, async (req, res, next) => {
  try { res.json(await aiService.chatParse(req.body.raw_text)); }
  catch (err) { next(err); }
});

// POST /ai/weekly-report
router.post('/weekly-report', requireUser, async (req, res, next) => {
  try { res.json(await aiService.weeklyReport(req.body.summary_data)); }
  catch (err) { next(err); }
});

module.exports = router;
