/**
 * requireSubscription middleware
 *
 * Checks that the authenticated user has an active or trialing subscription
 * before allowing access to a route.
 *
 * Attach AFTER requireUser so req.userId is already set.
 *
 * Usage:
 *   const { requireSubscription } = require('../middleware/requireSubscription');
 *   router.get('/plan', requireUser, requireSubscription, handler);
 *
 * Subscription statuses (from webhooks.js):
 *   'active'    — paid, in good standing
 *   'trialing'  — free trial period
 *   'cancelled' — user cancelled but may still be within paid period
 *   'expired'   — period ended, access revoked
 *   'past_due'  — billing failed, grace period
 *
 * Access policy:
 *   ✅ active, trialing       — full access
 *   🔒 cancelled, past_due    — 402 (payment required)
 *   🔒 expired, none          — 402 (payment required)
 *
 * Grace period note:
 *   RevenueCat sends BILLING_ISSUE (→ past_due) before EXPIRATION.
 *   We block on past_due so users are prompted to fix billing before
 *   hard-expiry. Adjust this if you want a grace window.
 *
 * Development bypass:
 *   Set SKIP_SUBSCRIPTION_CHECK=true in .env to bypass this check
 *   entirely during local dev and testing. Never set this in production.
 */

'use strict';

const { getDb } = require('../db/database');
const env = require('../config/env');

const ALLOWED_STATUSES = new Set(['active', 'trialing']);

/**
 * requireSubscription(req, res, next)
 * Express middleware. Requires requireUser to run first.
 */
function requireSubscription(req, res, next) {
  // Dev bypass — never in production.
  if (env.SKIP_SUBSCRIPTION_CHECK) {
    return next();
  }

  const userId = req.userId;
  if (!userId) {
    // requireUser should have caught this, but be defensive.
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  const db  = getDb();
  const row = db.prepare(
    'SELECT status, current_period_end FROM subscriptions WHERE user_id = ?'
  ).get(userId);

  if (!row) {
    // No subscription record at all — user never purchased or record not yet
    // synced from RevenueCat. Block with payment-required.
    return res.status(402).json({
      error: 'subscription_required',
      message: 'A subscription is required to access this feature.',
      status: null,
    });
  }

  if (!ALLOWED_STATUSES.has(row.status)) {
    // Known status but not allowed.
    const isExpired  = row.status === 'expired';
    const isPastDue  = row.status === 'past_due';

    return res.status(402).json({
      error: 'subscription_required',
      message: isExpired
        ? 'Your subscription has expired. Please renew to continue.'
        : isPastDue
          ? 'Your payment could not be processed. Please update your payment method.'
          : 'Your subscription is not active.',
      status: row.status,
      current_period_end: row.current_period_end ?? null,
    });
  }

  // Subscription is valid — attach it to the request for use in handlers.
  req.subscription = row;
  return next();
}

module.exports = { requireSubscription };
