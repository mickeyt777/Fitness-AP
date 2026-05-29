/**
 * /devices routes
 *
 * POST /devices           — register or refresh a device token
 * DELETE /devices/:token  — remove a token (user logs out or disables notifications)
 * GET  /devices/:userId   — list tokens for a user (internal use by the push worker)
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireUser } = require('../middleware/requireUser');
const { requireFields } = require('../middleware/validate');

const router = express.Router();

// ── POST /devices ──────────────────────────────────────────────────────────

router.post('/', requireUser, (req, res, next) => {
  try {
    const db = getDb();
    const { token, bundle_id } = req.body;

    const err = requireFields(req.body, ['token']);
    if (err) return res.status(400).json({ error: err });

    const uid = req.userId;
    const now = new Date().toISOString();

    // Upsert: if this (user, token) pair already exists, just update last_seen.
    db.prepare(`
      INSERT INTO device_tokens (id, user_id, token, bundle_id, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, token) DO UPDATE SET last_seen = excluded.last_seen
    `).run(uuidv4(), uid, token, bundle_id ?? null, now, now);

    return res.status(201).json({ registered: true });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /devices/:token ─────────────────────────────────────────────────

router.delete('/:token', requireUser, (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM device_tokens WHERE user_id = ? AND token = ?')
      .run(req.userId, req.params.token);
    return res.json({ removed: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /devices/:userId ───────────────────────────────────────────────────

router.get('/:userId', requireUser, (req, res, next) => {
  try {
    const db   = getDb();
    const rows = db.prepare('SELECT * FROM device_tokens WHERE user_id = ? ORDER BY last_seen DESC')
                   .all(req.params.userId);
    return res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
