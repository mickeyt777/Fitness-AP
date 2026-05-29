/**
 * requireUser middleware
 *
 * Authenticates requests from the iOS app.
 *
 * ── Production (Sign in with Apple) ────────────────────────────────────────
 * Sign in with Apple issues a standard JWT (RS256) as the identity token.
 * The iOS app sends it in the Authorization header:
 *   Authorization: Bearer <identity_token>
 *
 * Verification steps (per Apple's documentation):
 *   1. Fetch Apple's public keys from https://appleid.apple.com/auth/keys (JWKS)
 *   2. Verify the JWT signature using the matching key (kid header field)
 *   3. Verify iss === 'https://appleid.apple.com'
 *   4. Verify aud === your app's bundle ID (APPLE_BUNDLE_ID in .env)
 *   5. Verify exp is in the future
 *   6. Extract sub (the stable Apple user ID) and look up the user
 *
 * Apple's keys rotate infrequently. We cache them in memory with a 24-hour
 * TTL to avoid hitting the JWKS endpoint on every request.
 *
 * ── Development bypass ──────────────────────────────────────────────────────
 * When NODE_ENV !== 'production', you can pass X-User-Id: <userId> instead of
 * a Bearer token. This lets you test all routes without a real Apple account.
 * NEVER allow this header in production.
 *
 * ── Dependency ──────────────────────────────────────────────────────────────
 * Requires the 'jsonwebtoken' and 'jwks-rsa' packages:
 *   npm install jsonwebtoken jwks-rsa
 *
 * Until those are installed, this file stubs JWT verification with a warning
 * and falls back to X-User-Id for all environments.
 */

'use strict';

const { getDb } = require('../db/database');

// ── Apple JWKS client (lazy-loaded when first needed) ─────────────────────

let jwksClient  = null;
let jwtLib      = null;

/**
 * Attempt to load the JWT libraries. If they're not installed yet, we fall
 * back gracefully to the dev-header path and log a warning.
 */
function loadJwtLibs() {
  if (jwtLib !== null) return; // already attempted
  try {
    jwtLib      = require('jsonwebtoken');
    const jwksRsa = require('jwks-rsa');
    jwksClient  = jwksRsa({
      jwksUri:             'https://appleid.apple.com/auth/keys',
      cache:               true,
      cacheMaxAge:         24 * 60 * 60 * 1000,  // 24 hours
      rateLimit:           true,
      jwksRequestsPerMinute: 5,
    });
  } catch (_) {
    // Libraries not installed — stub mode.
    jwtLib      = false;
    jwksClient  = false;
  }
}

// ── Apple token verification ───────────────────────────────────────────────

/**
 * verifyAppleToken(token)
 * Verifies a Sign in with Apple identity token.
 * Returns the decoded payload { sub, email, ... } or throws on failure.
 */
async function verifyAppleToken(token) {
  loadJwtLibs();

  if (!jwtLib || !jwksClient) {
    throw new Error('JWT libraries not installed — run: npm install jsonwebtoken jwks-rsa');
  }

  const bundleId = process.env.APPLE_BUNDLE_ID;
  if (!bundleId) {
    throw new Error('APPLE_BUNDLE_ID not set in .env');
  }

  // Decode the header to get the key ID (kid).
  const decoded = jwtLib.decode(token, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw new Error('Invalid token structure — could not decode header');
  }

  // Fetch the signing key from Apple's JWKS endpoint.
  const key = await new Promise((resolve, reject) => {
    jwksClient.getSigningKey(decoded.header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });

  // Verify signature, issuer, audience, and expiry.
  const payload = jwtLib.verify(token, key, {
    algorithms: ['RS256'],
    issuer:     'https://appleid.apple.com',
    audience:   bundleId,
  });

  return payload;
}

// ── Middleware ─────────────────────────────────────────────────────────────

/**
 * requireUser(req, res, next)
 *
 * Sets req.userId to the authenticated user's UUID.
 *
 * Priority:
 *   1. Authorization: Bearer <apple_identity_token>  (always checked first)
 *   2. X-User-Id: <uuid>  (only in non-production environments)
 */
async function requireUser(req, res, next) {
  const authHeader = req.headers['authorization'] ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // ── Path 1: Sign in with Apple JWT ────────────────────────────────────────
  if (bearerToken) {
    try {
      const payload = await verifyAppleToken(bearerToken);
      const appleSubject = payload.sub;

      if (!appleSubject) {
        return res.status(401).json({ error: 'Token missing subject claim' });
      }

      // The iOS app should have stored this user with their Apple subject ID
      // as their UUID (set during initial Sign in with Apple flow).
      const db   = getDb();
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(appleSubject);

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      req.userId = user.id;
      req.authMethod = 'apple_jwt';
      return next();

    } catch (err) {
      // If JWT libs aren't installed yet, fall through to dev header
      if (err.message && err.message.includes('JWT libraries not installed')) {
        console.warn('[requireUser] JWT libraries not installed — falling through to dev header');
        // fall through
      } else {
        console.warn('[requireUser] Token verification failed:', err.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }
  }

  // ── Path 2: Dev header (non-production only) ──────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    // In production, only Bearer tokens are accepted.
    return res.status(401).json({ error: 'Authorization required' });
  }

  const devUserId = req.headers['x-user-id'];
  if (!devUserId) {
    return res.status(401).json({
      error: 'Authorization required',
      hint: process.env.NODE_ENV !== 'production'
        ? 'Pass X-User-Id header in dev, or Authorization: Bearer <apple_token> in production'
        : undefined,
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
