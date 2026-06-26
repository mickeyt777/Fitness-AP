/**
 * Fitness GLP — Background Worker
 *
 * This file runs as a SEPARATE process from server.js.
 * It handles scheduled jobs that need to fire at specific times:
 *
 *   - Daily check-in reminder (default 8 AM user's local time — approximated server-side)
 *   - Weekly report ready notification (Sunday evening after check-in window closes)
 *   - Titration window start alert (fired when a dose change is recorded)
 *
 * How to run:
 *   node worker.js
 *
 * In production (on the VPS), PM2 runs both server.js and worker.js:
 *   pm2 start server.js --name fitnessap-api
 *   pm2 start worker.js --name fitnessap-worker
 *
 * APNs credentials:
 *   Set APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, and provide the .p8 key file
 *   at the path in APNS_KEY_PATH (.env). Until credentials are set, notifications
 *   are logged to the console but not sent — safe for development.
 */

'use strict';

const env = require('./config/env');
const cron = require('node-cron');
const { initDb, getDb } = require('./db/database');

// ── Initialise DB ──────────────────────────────────────────────────────────

initDb();
console.log('[worker] started');

// ── APNs sender ────────────────────────────────────────────────────────────

/**
 * sendPush(deviceToken, title, body, data)
 *
 * Sends a push notification via APNs.
 *
 * STUB: logs to console until APNS_KEY_PATH is set in .env.
 *
 * To wire in real APNs, install the @parse/node-apn package:
 *   npm install @parse/node-apn
 *
 * Then replace this stub with:
 *   const apn = require('@parse/node-apn');
 *   const provider = new apn.Provider({
 *     token: {
 *       key:     env.APNS_KEY_PATH,   // path to your .p8 file
 *       keyId:   env.APNS_KEY_ID,
 *       teamId:  env.APNS_TEAM_ID,
 *     },
 *     production: env.isProduction,
 *   });
 *   const note = new apn.Notification();
 *   note.expiry  = Math.floor(Date.now() / 1000) + 3600;
 *   note.badge   = 1;
 *   note.sound   = 'default';
 *   note.alert   = { title, body };
 *   note.topic   = env.APNS_BUNDLE_ID;
 *   note.payload = data ?? {};
 *   await provider.send(note, deviceToken);
 */
async function sendPush(deviceToken, title, body, data = {}) {
  const hasCredentials = env.APNS_KEY_PATH && env.APNS_KEY_ID;

  if (!hasCredentials) {
    console.log(`[push] STUB — would send to ${deviceToken.slice(0, 8)}...: "${title}" / "${body}"`);
    return { sent: false, reason: 'no_credentials' };
  }

  // TODO: replace stub with real APNs call (see comment above).
  console.warn('[push] APNS_KEY_PATH is set but APNs provider not yet implemented. See worker.js.');
  return { sent: false, reason: 'not_implemented' };
}

// ── Helper: get all active users with device tokens ────────────────────────

function getUsersWithTokens(db) {
  return db.prepare(`
    SELECT u.id as user_id, u.display_name, dt.token,
           p.glp_injection_day_of_week, p.days_per_week
    FROM users u
    JOIN device_tokens dt ON dt.user_id = u.id
    LEFT JOIN profiles p ON p.user_id = u.id
    ORDER BY u.id
  `).all();
}

// ── Job 1: Daily check-in reminder ────────────────────────────────────────
//
// Fires at 8:00 AM server time every day.
// Skips users who have already checked in today.
//
// In a future version, store each user's preferred reminder time and
// time zone so we can personalise when this fires.

cron.schedule('0 8 * * *', async () => {
  console.log('[worker] Running daily check-in reminder job');
  const db    = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const users = getUsersWithTokens(db);

  let sent = 0, skipped = 0;

  for (const user of users) {
    // Skip if the user already checked in today.
    const existing = db.prepare(
      'SELECT id FROM daily_checkins WHERE user_id = ? AND date = ?'
    ).get(user.user_id, today);

    if (existing) { skipped++; continue; }

    await sendPush(
      user.token,
      'How are you feeling today?',
      '30-second check-in — it helps us tune your workout.',
      { type: 'checkin_reminder', date: today }
    );
    sent++;
  }

  console.log(`[worker] Check-in reminders: ${sent} sent, ${skipped} skipped (already checked in)`);
});

// ── Job 2: Weekly report ready ────────────────────────────────────────────
//
// Fires every Sunday at 8:00 PM server time.
// Notifies users that their weekly report is ready to view.

cron.schedule('0 20 * * 0', async () => {
  console.log('[worker] Running weekly report notification job');
  const db    = getDb();
  const users = getUsersWithTokens(db);

  // Only notify users who have at least one completed workout or measurement this week.
  const weekStart = offsetDate(new Date().toISOString().slice(0, 10), -6);

  let sent = 0;
  for (const user of users) {
    const hasActivity = db.prepare(`
      SELECT COUNT(*) as c FROM workouts
      WHERE user_id = ? AND completed_at IS NOT NULL
        AND planned_date >= ?
    `).get(user.user_id, weekStart).c > 0;

    if (!hasActivity) continue;

    await sendPush(
      user.token,
      'Your weekly report is ready',
      'See how your body changed this week — lean-mass proxy and all.',
      { type: 'weekly_report_ready' }
    );
    sent++;
  }

  console.log(`[worker] Weekly report notifications sent: ${sent}`);
});

// ── Job 3: Titration window alert ─────────────────────────────────────────
//
// Fires every day at 7:00 AM.
// Checks for users whose dose changed exactly 1 day ago and sends an alert.
// (The alert is about the upcoming 14-day adjustment window, not the change itself —
// which is already handled at the moment of the POST /dose-history call.)

cron.schedule('0 7 * * *', async () => {
  const db        = getDb();
  const yesterday = offsetDate(new Date().toISOString().slice(0, 10), -1);

  const usersWithRecentChange = db.prepare(`
    SELECT u.id as user_id, dt.token
    FROM users u
    JOIN device_tokens dt ON dt.user_id = u.id
    JOIN profiles p ON p.user_id = u.id
    WHERE p.last_dose_change_date = ?
  `).all(yesterday);

  for (const user of usersWithRecentChange) {
    await sendPush(
      user.token,
      'Dose change: adjusted training ahead',
      'Your workouts are scaled back for the next 2 weeks while your body adjusts.',
      { type: 'titration_window_start' }
    );
  }

  if (usersWithRecentChange.length > 0) {
    console.log(`[worker] Titration alerts sent: ${usersWithRecentChange.length}`);
  }
});

// ── Utility ────────────────────────────────────────────────────────────────

function offsetDate(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

console.log('[worker] Scheduled jobs active: check-in reminder (08:00), weekly report (Sun 20:00), titration alert (07:00)');
