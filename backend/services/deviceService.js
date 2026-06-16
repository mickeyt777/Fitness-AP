'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireFields } = require('../middleware/validate');
const { httpError } = require('../lib/httpError');

// POST /
// Upsert: if this (user, token) pair already exists, just refresh last_seen.
function registerDevice(userId, body) {
  const err = requireFields(body, ['token']);
  if (err) throw httpError(400, err);

  const db  = getDb();
  const { token, bundle_id } = body;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO device_tokens (id, user_id, token, bundle_id, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, token) DO UPDATE SET last_seen = excluded.last_seen
  `).run(uuidv4(), userId, token, bundle_id ?? null, now, now);

  return { registered: true };
}

// DELETE /:token
function removeDevice(userId, token) {
  const db = getDb();
  db.prepare('DELETE FROM device_tokens WHERE user_id = ? AND token = ?')
    .run(userId, token);
  return { removed: true };
}

// GET /:userId
function listDevices(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM device_tokens WHERE user_id = ? ORDER BY last_seen DESC')
           .all(userId);
}

module.exports = { registerDevice, removeDevice, listDevices };
