/**
 * requireUser middleware
 *
 * Authenticates requests from the iOS app.
 *
 * ── Production ──────────────────────────────────────────────────────────────
 * The iOS app calls POST /auth/apple once (Sign in with Apple flow), receives
 * a 30-day backend session JWT, and stores it in the Keychain. Every subsequent
 * request includes it as:
 *   Authorization: Bearer <session_jwt>
 *
 * This middleware verifies that JWT using JWT_SECRET (synchronous, no network).
 * The payload's `sub` claim is the user's Apple subject ID, which is also
 * their row ID in the users table.
 *
 * ── Development bypass ──────────────────────────────────────────────────────
 * When NODE_ENV !== 'production', requests can pass X-User-Id: <userId> instead
 * of a Bearer token. This keeps the dev workflow working without a real Apple
 * account. NEVER allow this header in production.
 */

'use strict';

const { getDb } = require('../db/database');

// ── Middleware ─────────────────────────────────────────────────────────────

/**
 * requireUser(req, res, next)
 * Sets req.userId to the authenticated user's ID.
 *
 * Priority:
 *   1. Authorization: Bearer <backend_session_jwt>  (always checked first)
 *   2. X-User-Id: <uuid>  (only in non-production environments)
 */
function requireUser(req, res, next) {
  const authHeader  = req.headers['authorization'] ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // ── Path 1: Backend session JWT ────────────────────────────────────────────
  if (bearerToken) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('[requireUser] JWT_SECRET not set in .env');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    let payload;
    try {
      payload = require('jsonwebtoken').verify(bearerToken, secret);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }

    const userId = payload.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Token missing subject claim' });
    }

    const db   = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.userId     = user.id;
    req.authMethod = 'session_jwt';
    return next();
  }

  // ── Path 2: Dev header (non-production only) ──────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const devUserId = req.headers['x-user-id'];
  if (!devUserId) {
    return res.status(401).json({
      error: 'Authorization required',
      hint: 'Pass X-User-Id header in dev, or Authorization: Bearer <session_jwt> in production',
    });
  }

  const db   = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(devUserId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  req.userId     = user.id;
  req.authMethod = 'dev_header';
  return next();
}

module.exports = { requireUser };
