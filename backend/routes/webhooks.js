/**
 * /webhooks routes
 *
 * POST /webhooks/revenuecat — RevenueCat subscription lifecycle events
 *
 * RevenueCat sends a webhook whenever a subscription changes state:
 * new purchase, renewal, cancellation, billing retry failure, expiration, etc.
 * We use this to keep the subscriptions table in sync without polling Apple.
 *
 * Security: RevenueCat signs webhook payloads with a shared secret.
 * Set REVENUECAT_WEBHOOK_SECRET in .env. Requests with a wrong or missing
 * signature are rejected with 401.
 *
 * RevenueCat webhook docs:
 *   https://www.revenuecat.com/docs/webhooks
 *
 * Note: webhooks are NOT behind requireUser middleware — the caller is
 * RevenueCat's servers, not the iOS app.
 */

'use strict';

const express = require('express');
const crypto  = require('crypto');
const { getDb } = require('../db/database');

const router = express.Router();

// ── Signature verification ─────────────────────────────────────────────────

/**
 * verifyRevenueCatSignature(req)
 * RevenueCat sends an Authorization header with a Bearer token equal to
 * the webhook secret you configure in their dashboard.
 * Returns true if the request is authentic.
 */
function verifyRevenueCatSignature(req) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — allow in development, warn loudly.
    console.warn('[webhooks] REVENUECAT_WEBHOOK_SECRET not set — skipping signature check (dev mode)');
    return true;
  }

  const authHeader = req.headers['authorization'] ?? '';
  const token      = authHeader.replace(/^Bearer\s+/i, '');

  // Use a timing-safe comparison to prevent timing attacks.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(secret)
    );
  } catch (_) {
    return false;
  }
}

// ── RevenueCat event → subscription status mapping ────────────────────────

/**
 * Maps RevenueCat event types to our internal subscription status values.
 * Full event list: https://www.revenuecat.com/docs/webhooks#events
 */
const EVENT_STATUS_MAP = {
  INITIAL_PURCHASE:        'active',
  RENEWAL:                 'active',
  PRODUCT_CHANGE:          'active',
  UNCANCELLATION:          'active',
  TRIAL_STARTED:           'trialing',
  TRIAL_CONVERTED:         'active',
  TRIAL_CANCELLED:         'cancelled',
  CANCELLATION:            'cancelled',
  EXPIRATION:              'expired',
  BILLING_ISSUE:           'past_due',
  SUBSCRIBER_ALIAS:        null,   // internal RC event, no status change needed
  TRANSFER:                null,
};

// ── POST /webhooks/revenuecat ──────────────────────────────────────────────

router.post('/revenuecat', (req, res, next) => {
  try {
    if (!verifyRevenueCatSignature(req)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const { event } = req.body ?? {};
    if (!event) {
      return res.status(400).json({ error: 'Missing event payload' });
    }

    const {
      type:                 eventType,
      app_user_id:          revenuecatCustomerId,
      product_id:           productId,
      expiration_at_ms:     expirationMs,
      original_purchase_date_ms: purchaseDateMs,
      store,
    } = event;

    console.log(`[webhooks] RevenueCat event: ${eventType} for customer ${revenuecatCustomerId}`);

    const newStatus = EVENT_STATUS_MAP[eventType];
    if (newStatus === null) {
      // Known event we don't act on — acknowledge without error.
      return res.json({ received: true, action: 'ignored' });
    }
    if (newStatus === undefined) {
      console.warn(`[webhooks] Unknown RevenueCat event type: ${eventType}`);
      return res.json({ received: true, action: 'unknown_event' });
    }

    // Look up the user by their RevenueCat customer ID.
    // RevenueCat's app_user_id should be set to our user's UUID when the iOS
    // app calls Purchases.configure() — see the iOS integration notes in SETUP.md.
    const db   = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(revenuecatCustomerId);

    if (!user) {
      // Could be a user who deleted their account or a test event.
      console.warn(`[webhooks] No user found for RevenueCat customer ID: ${revenuecatCustomerId}`);
      return res.json({ received: true, action: 'user_not_found' });
    }

    const now = new Date().toISOString();
    const currentPeriodEnd = expirationMs ? new Date(expirationMs).toISOString() : null;
    const originalPurchaseDate = purchaseDateMs ? new Date(purchaseDateMs).toISOString() : null;

    // Upsert the subscription row.
    db.prepare(`
      INSERT INTO subscriptions
        (user_id, status, product_id, store, original_purchase_date, current_period_end, revenuecat_customer_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        status                = excluded.status,
        product_id            = excluded.product_id,
        store                 = excluded.store,
        original_purchase_date = COALESCE(excluded.original_purchase_date, original_purchase_date),
        current_period_end    = excluded.current_period_end,
        revenuecat_customer_id = excluded.revenuecat_customer_id,
        updated_at            = excluded.updated_at
    `).run(
      user.id,
      newStatus,
      productId ?? null,
      store ?? 'app_store',
      originalPurchaseDate,
      currentPeriodEnd,
      revenuecatCustomerId,
      now
    );

    console.log(`[webhooks] Subscription updated: user ${user.id} → ${newStatus}`);
    return res.json({ received: true, action: 'subscription_updated', status: newStatus });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
