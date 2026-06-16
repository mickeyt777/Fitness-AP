'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { httpError } = require('../lib/httpError');

// POST /
// Returns { status, user }: status 200 when an existing record is returned
// (idempotent), 201 when a new user is created.
function createUser({ id: providedId, apple_user_id, email, display_name }) {
  const db = getDb();

  // Dev mode: allow creating a user with a specific id (e.g. "test-user-001").
  // Production: apple_user_id or email is required.
  if (!providedId && !apple_user_id && !email) {
    throw httpError(400, 'apple_user_id or email is required');
  }

  // If a specific id was provided (dev mode), check if it already exists.
  if (providedId) {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(providedId);
    if (existing) return { status: 200, user: existing };
  }

  // If this Apple user already exists, return the existing record (idempotent).
  if (apple_user_id) {
    const existing = db.prepare('SELECT * FROM users WHERE apple_user_id = ?').get(apple_user_id);
    if (existing) return { status: 200, user: existing };
  }

  const id  = providedId ?? uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, apple_user_id, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, apple_user_id ?? null, email ?? null, display_name ?? null, now, now);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return { status: 201, user };
}

// GET /:id
function getUser(id) {
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) throw httpError(404, 'User not found');
  return user;
}

// DELETE /:id
// ON DELETE CASCADE on all child tables handles cascading deletion.
function deleteUser(id) {
  const db     = getDb();
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) throw httpError(404, 'User not found');
  return { message: 'Account and all associated data deleted.' };
}

module.exports = { createUser, getUser, deleteUser };
