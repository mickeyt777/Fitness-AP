/**
 * /users routes
 *
 * POST /users         — create a new user (called after Sign in with Apple succeeds)
 * GET  /users/:id     — get a user by ID
 * DELETE /users/:id   — delete a user and all their data (GDPR one-click delete)
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

const router = express.Router();

// ── POST /users ────────────────────────────────────────────────────────────

router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const { id: providedId, apple_user_id, email, display_name } = req.body;

    // Dev mode: allow creating a user with a specific id (e.g. "test-user-001").
    // Production: apple_user_id or email is required.
    if (!providedId && !apple_user_id && !email) {
      return res.status(400).json({ error: 'apple_user_id or email is required' });
    }

    // If a specific id was provided (dev mode), check if it already exists.
    if (providedId) {
      const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(providedId);
      if (existing) {
        return res.status(200).json(existing);
      }
    }

    // If this Apple user already exists, return the existing record (idempotent).
    if (apple_user_id) {
      const existing = db.prepare('SELECT * FROM users WHERE apple_user_id = ?').get(apple_user_id);
      if (existing) {
        return res.status(200).json(existing);
      }
    }

    const id  = providedId ?? uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, apple_user_id, email, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, apple_user_id ?? null, email ?? null, display_name ?? null, now, now);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// ── GET /users/:id ─────────────────────────────────────────────────────────

router.get('/:id', (req, res, next) => {
  try {
    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /users/:id ──────────────────────────────────────────────────────

router.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();

    // The ON DELETE CASCADE on all child tables handles cascading deletion.
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ message: 'Account and all associated data deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
