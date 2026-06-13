/**
 * /webhooks routes
 *
 * POST /webhooks/revenuecat — RevenueCat subscription lifecycle events
 *
 * RevenueCat signs webhook payloads with a shared secret
 * (REVENUECAT_WEBHOOK_SECRET). Signature verification, the event→status
 * mapping, and the subscriptions upsert all live in services/webhookService.js.
 *
 * Note: webhooks are NOT behind requireUser middleware — the caller is
 * RevenueCat's servers, not the iOS app.
 *
 * Thin layer: parse input -> call webhookService -> respond.
 */

'use strict';

const express = require('express');
const webhookService = require('../services/webhookService');

const router = express.Router();

// POST /webhooks/revenuecat
router.post('/revenuecat', (req, res, next) => {
  try { res.json(webhookService.processRevenueCatEvent(req.headers, req.body)); }
  catch (err) { next(err); }
});

module.exports = router;
