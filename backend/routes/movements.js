/**
 * /movements routes
 *
 * GET /movements/search?q=<text>[&limit=<n>]
 *   Resolve a spoken/typed exercise name to canonical movement(s). Used by the
 *   iOS workout parser (P1-D) to turn "goblet" / "rdl" / "bench press" into a
 *   movement id. Returns the single best match plus a ranked candidate list so
 *   the client can disambiguate genuinely ambiguous terms.
 *
 *   200 {
 *     query:      "<normalized echo of q>",
 *     match:      <full movement> | null,
 *     candidates: [ { id, name }, ... ]   // ranked, best first; [] when no hit
 *   }
 *   400 when q is missing/empty.
 *
 * Thin layer: parse input -> call movementService -> respond. The movements
 * library is global (not user-scoped), but we keep requireUser for consistency
 * with the rest of the API and the dev/prod auth model.
 */

'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const { httpError } = require('../lib/httpError');
const movementService = require('../services/movementService');

const router = express.Router();

// GET /movements/search?q=
router.get('/search', requireUser, (req, res, next) => {
  try {
    const q = (req.query.q ?? '').toString().trim();
    if (!q) throw httpError(400, 'Query parameter "q" is required.');

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 25);
    const ranked = movementService.searchMovements(q, { limit });

    res.json({
      query:      q,
      match:      ranked[0] ?? null,
      candidates: ranked.map(m => ({ id: m.id, name: m.name })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
