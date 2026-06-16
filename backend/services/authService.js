'use strict';

const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { httpError } = require('../lib/httpError');
const env = require('../config/env');

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

  const bundleId = env.APPLE_BUNDLE_ID;
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

// POST /apple
// Returns { status, body }: 201 for a new user, 200 for a returning one.
async function appleSignIn({ identity_token, display_name }) {
  if (!identity_token) {
    throw httpError(400, 'identity_token is required');
  }

  if (!env.JWT_SECRET) {
    throw httpError(500, 'JWT_SECRET not set in .env');
  }

  // Verify the Apple identity token. Map JWT verification failures to 401;
  // everything else (missing libs/env, malformed structure) propagates as 500.
  let applePayload;
  try {
    applePayload = await verifyAppleToken(identity_token);
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      throw httpError(401, 'Invalid or expired Apple identity token');
    }
    throw err;
  }

  const appleUserId = applePayload.sub;
  if (!appleUserId) {
    throw httpError(401, 'Apple token missing subject claim');
  }

  // Create the user row if this is their first sign-in.
  const db        = getDb();
  const existing  = db.prepare('SELECT id FROM users WHERE id = ?').get(appleUserId);
  const isNewUser = !existing;

  if (isNewUser) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)')
      .run(appleUserId, display_name ?? null, now);
  }

  // Issue a 30-day backend session JWT.
  const sessionToken = jwt.sign(
    { sub: appleUserId },
    env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  return {
    status: isNewUser ? 201 : 200,
    body: {
      token:       sessionToken,
      userId:      appleUserId,
      is_new_user: isNewUser,
    },
  };
}

module.exports = { appleSignIn };
