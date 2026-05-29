/**
 * Fitness AP — Backend Entry Point
 *
 * This is the main file Node.js runs when you start the server.
 * It wires together Express, the database, and all the API routes.
 */

'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

// Database — opens the SQLite file and runs any pending migrations on startup.
const { initDb } = require('./db/database');

// Security middleware — helmet (headers) + rate limiters.
const { helmetMiddleware, rateLimiter, aiRateLimiter } = require('./middleware/security');

// API route modules — each file handles one area of the app.
const usersRouter        = require('./routes/users');
const profilesRouter     = require('./routes/profiles');
const workoutsRouter     = require('./routes/workouts');
const checkinsRouter     = require('./routes/checkins');
const macrosRouter       = require('./routes/macros');
const measurementsRouter = require('./routes/measurements');
const doseHistoryRouter  = require('./routes/doseHistory');
const chatRouter         = require('./routes/chat');
const aiRouter           = require('./routes/ai');
const reportsRouter      = require('./routes/reports');
const webhooksRouter     = require('./routes/webhooks');
const devicesRouter      = require('./routes/devices');
const photosRouter       = require('./routes/photos');

// ── App setup ──────────────────────────────────────────────────────────────

const app = express();

// Security headers on every response.
app.use(helmetMiddleware);

// Allow requests from any origin during development.
// On the VPS you can lock this down to your iOS app's bundle identifier.
app.use(cors());

// Global rate limiter — 300 requests per 15 min per IP.
app.use(rateLimiter);

// Parse incoming JSON request bodies (max 1 MB — photos go to object storage, not here).
app.use(express.json({ limit: '1mb' }));

// ── Database ───────────────────────────────────────────────────────────────

// Run migrations synchronously before accepting any requests.
// This is safe at startup because there's only one Node process.
initDb();

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.use('/users',        usersRouter);
app.use('/profiles',     profilesRouter);
app.use('/workouts',     workoutsRouter);
app.use('/checkins',     checkinsRouter);
app.use('/macros',       macrosRouter);
app.use('/measurements', measurementsRouter);
app.use('/dose-history', doseHistoryRouter);
app.use('/chat',         chatRouter);
app.use('/reports',      reportsRouter);
app.use('/webhooks',     webhooksRouter);
app.use('/devices',      devicesRouter);
app.use('/photos',       photosRouter);

// AI routes get their own tighter rate limit on top of the global one.
app.use('/ai', aiRateLimiter, aiRouter);

// ── Error handler ──────────────────────────────────────────────────────────

// Catches any errors thrown in route handlers and returns a clean JSON response.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Fitness AP backend listening on port ${PORT}`);
});
