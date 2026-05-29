/**
 * Security middleware
 *
 * Three layers applied globally in server.js:
 *
 * 1. helmet()       — sets a dozen HTTP response headers that browsers and API
 *                     clients use to block common attacks (clickjacking, MIME
 *                     sniffing, XSS via old IE, etc.). Zero config needed.
 *
 * 2. rateLimiter    — prevents a single IP from hammering the API. At our scale,
 *                     the main threat is a misbehaving iOS client in a bug loop,
 *                     not a real attacker. Limits are generous for normal use.
 *
 * 3. strictLimiter  — tighter limit on the AI routes since each call costs money.
 */

'use strict';

const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

// ── Helmet ─────────────────────────────────────────────────────────────────

// Use the defaults — they're sensible for a JSON API.
// crossOriginResourcePolicy is set to 'cross-origin' so the iOS app
// (a different "origin" from the server) can fetch resources.
const helmetMiddleware = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

// ── General rate limiter ───────────────────────────────────────────────────

// 300 requests per 15 minutes per IP — roughly 20 req/min.
// A normal user hitting the app hard during a workout is well under this.
const rateLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,  // 15 minutes
  max:              300,
  standardHeaders:  true,            // Return rate limit info in the headers
  legacyHeaders:    false,
  message:          { error: 'Too many requests — please slow down.' },
  skip: (req) => req.path === '/health', // never rate-limit the health check
});

// ── Strict limiter for AI routes ───────────────────────────────────────────

// 20 AI calls per hour per IP. Each call costs real money (cloud LLM).
// A normal user gets their weekly narrative once a week — this is very generous.
const aiRateLimiter = rateLimit({
  windowMs:         60 * 60 * 1000,  // 1 hour
  max:              20,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'AI rate limit reached — try again in an hour.' },
});

module.exports = { helmetMiddleware, rateLimiter, aiRateLimiter };
