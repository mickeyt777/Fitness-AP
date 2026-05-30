/**
 * /auth routes
 *
 * POST /auth/apple  — validate a Sign in with Apple identity token,
 *                     create the user if they're new, and issue a 30-day
 *                     backend session JWT.
 *
 * The iOS app calls this once per sign-in (first launch, or after sign-out).
 * After that it keeps the returned session token in the Keychain and sends it
 * as `Authorization: Bearer <token>` on every subsequent request.
 *
 * Apple identity tokens expire after ~10 minutes, so we never store them —
 * we just use them to bootstrap a longer-lived backend session.
 */

'use strict';

const express = require('express');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb }  = require('../db/database');

const router = express.Router();

// ── Apple JWKS client (same lazy-load pattern as requireUser) ─────────────

let jwksClient = null;
let jwtLibReady = false;

function loadJwtLibs() {
  if (jwtLibReady) return;
  try {
    const jwksRsa = require('jwks-rsa');
    jwksClient = jwksRsa({
      jwksUri:               'https://appleid.apple.com/auth/keys',
      cache:                 true,
      cacheMaxAge:           24 * 60 * 60 * 1000,
      rateLimit:             true,
      jwksRequestsPerMinute: 5,
    });
    jwtLibReady = true;
  } catch (_) {
    // jwks-rsa not installed — will throw on first call
  }
}

async function verifyAppleToken(token) {
  loadJwtLibs();

  if (!jwksClient) {
    throw new Error('jwks-rsa not installed — run: npm install jwks-rsa');
  }

  const bundleId = process.env.APPLE_BUNDLE_ID;
  if (!bundleId) throw new Error('APPLE_BUNDLE_ID not set in .env');

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header?.kid) {
    throw new Error('Invalid Apple token structure');
  }

  const key = await new Promise((resolve, reject) => {
    jwksClient.getSigningKey(decoded.header.kid, (err, k) => {
      if (err) return reject(err);
      resolve(k.getPublicKey());
    });
  });

  return jwt.verify(token, key, {
    algorithms: ['RS256'],
    issuer:     'https://appleid.apple.com',
    audience:   bundleId,
  });
}

// ── POST /auth/apple ───────────────────────────────────────────────────────

router.post('/apple', async (req, res, next) => {
  try {
    const { identity_token, display_name } = req.body;

    if (!identity_token) {
      return res.status(400).json({ error: 'identity_token is required' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'JWT_SECRET not set in .env' });
    }

    // Verify the Apple identity token — throws on failure.
    const applePayload = await verifyAppleToken(identity_token);
    const appleUserId  = applePayload.sub;

    if (!appleUserId) {
      return res.status(401).json({ error: 'Apple token missing subject claim' });
    }

    // Create the user row if this is their first sign-in.
    const db      = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(appleUserId);
    const isNewUser = !existing;

    if (isNewUser) {
      const now = new Date().toISOString();
      db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)')
        .run(appleUserId, display_name ?? null, now);
    }

    // Issue a 30-day backend session JWT.
    // The iOS app stores this in the Keychain and sends it as Bearer on every request.
    const sessionToken = jwt.sign(
      { sub: appleUserId },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(isNewUser ? 201 : 200).json({
      token:        sessionToken,
      userId:       appleUserId,
      is_new_user:  isNewUser,
    });

  } catch (err) {
    // Surface Apple verification errors as 401, everything else as 500.
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired Apple identity token' });
    }
    next(err);
  }
});

module.exports = router;
