/**
 * config/env.js — the single place the backend reads environment variables.
 *
 * Why this file exists:
 *   Before, each module read process.env.X on its own, scattered across the
 *   codebase. A missing secret in production (e.g. JWT_SECRET) wasn't noticed
 *   until the first request that needed it 500'd. Now every var is read here
 *   once at startup, and the core secrets are validated at boot — so a
 *   misconfigured deploy fails LOUDLY and immediately, instead of silently
 *   degrading or 500ing on the first user.
 *
 * Behavior note (Phase 0):
 *   This is a deliberate behavior change. In production, the server now refuses
 *   to boot if a required secret is missing. In development and test, the old
 *   fallbacks are preserved (plaintext encryption warning, stub LLM/photo/
 *   webhook modes) so the local workflow is unchanged.
 *
 * Required in production (boot fails if missing):
 *   JWT_SECRET, ENCRYPTION_KEY, APPLE_BUNDLE_ID, REVENUECAT_WEBHOOK_SECRET
 *
 * Optional everywhere (feature integrations keep their existing stub/degraded
 * fallbacks when unset): ANTHROPIC_API_KEY, CLOUD_LLM_PROVIDER, B2_* , APNS_*.
 */

'use strict';

// env.js owns dotenv — it must be the first thing that touches process.env.
// Requiring this module (directly or transitively) loads .env exactly once.
require('dotenv').config();

const NODE_ENV     = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest       = NODE_ENV === 'test';

// Helper: return a trimmed value, or null if unset/empty.
function read(name) {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') return null;
  return v;
}

const env = {
  // ── Environment ──────────────────────────────────────────────────────────
  NODE_ENV,
  isProduction,
  isDevelopment: NODE_ENV === 'development',
  isTest,

  // ── Server / DB ──────────────────────────────────────────────────────────
  PORT:    parseInt(process.env.PORT, 10) || 3000,
  DB_PATH: read('DB_PATH') || './data/fitnessap.db',

  // ── Core secrets (required in production) ────────────────────────────────
  JWT_SECRET:                read('JWT_SECRET'),
  ENCRYPTION_KEY:            read('ENCRYPTION_KEY'),
  APPLE_BUNDLE_ID:           read('APPLE_BUNDLE_ID'),
  REVENUECAT_WEBHOOK_SECRET: read('REVENUECAT_WEBHOOK_SECRET'),

  // ── Cloud LLM (optional — stub fallback when unset) ──────────────────────
  ANTHROPIC_API_KEY:  read('ANTHROPIC_API_KEY'),
  CLOUD_LLM_PROVIDER: read('CLOUD_LLM_PROVIDER'),

  // ── Backblaze B2 / S3 photo storage (optional — stub fallback) ───────────
  B2_ENDPOINT:           read('B2_ENDPOINT'),
  B2_APPLICATION_KEY_ID: read('B2_APPLICATION_KEY_ID'),
  B2_APPLICATION_KEY:    read('B2_APPLICATION_KEY'),
  B2_BUCKET_NAME:        read('B2_BUCKET_NAME'),

  // ── APNs push (optional — worker logs to console when unset) ─────────────
  APNS_KEY_PATH:  read('APNS_KEY_PATH'),
  APNS_KEY_ID:    read('APNS_KEY_ID'),
  APNS_TEAM_ID:   read('APNS_TEAM_ID'),
  APNS_BUNDLE_ID: read('APNS_BUNDLE_ID'),

  // ── Dev flags ────────────────────────────────────────────────────────────
  SKIP_SUBSCRIPTION_CHECK: process.env.SKIP_SUBSCRIPTION_CHECK === 'true',
};

// ── Boot-time validation ───────────────────────────────────────────────────
// Only enforced in production. Collect ALL missing required vars so the
// operator sees the full list in one error, not one-at-a-time.
const REQUIRED_IN_PRODUCTION = [
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'APPLE_BUNDLE_ID',
  'REVENUECAT_WEBHOOK_SECRET',
];

if (isProduction) {
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[config/env] Missing required environment variable(s) in production: ` +
      `${missing.join(', ')}. Set them in the environment (or .env) before starting.`
    );
  }
}

module.exports = Object.freeze(env);
