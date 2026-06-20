'use strict';

/**
 * movementService — read access to the `movements` library table (migrations
 * 012/013). This is the data-backed replacement for the hard-coded EXERCISES
 * array in engine/exercises.js. The engine itself is NOT routed through this
 * service yet — that swap-over is P1-C. For P1-B this service only exposes
 * read queries plus a stubbed substitution lookup.
 *
 * Row shape note: SQLite has no array/boolean types, so the table stores
 *   - aliases / primary_muscles / secondary_muscles as JSON-encoded TEXT
 *   - is_compound / unilateral / glp_flag as INTEGER 0/1
 * rowToMovement() is the single place those get parsed/coerced, so callers
 * never see raw DB shapes.
 *
 * Equipment slug note (flagged for P1-C): this table uses SINGULAR slugs
 *   bodyweight | dumbbell | barbell | machine | cable | band | kettlebell
 * whereas the live engine + stored profiles use PLURALS (dumbbells, cables).
 * No translation happens in this service — callers pass slugs that match the
 * table. P1-C owns mapping the engine/profile plurals onto these singulars.
 */

const { getDb } = require('../db/database');
const { httpError } = require('../lib/httpError');

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

/**
 * parseJsonArray(text)
 * The list columns default to '[]' and are NOT NULL, but parse defensively so
 * a malformed/empty value degrades to [] instead of throwing.
 */
function parseJsonArray(text) {
  if (text == null || text === '') return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * rowToMovement(row)
 * Turns a raw `movements` row into the clean object the rest of the app uses:
 * JSON arrays parsed, 0/1 flags coerced to real booleans. Returns null for a
 * falsy row so callers can decide whether a miss is a 404.
 */
function rowToMovement(row) {
  if (!row) return null;
  return {
    id:                row.id,
    name:              row.name,
    aliases:           parseJsonArray(row.aliases),
    category:          row.category,
    pattern:           row.pattern,
    primary_muscles:   parseJsonArray(row.primary_muscles),
    secondary_muscles: parseJsonArray(row.secondary_muscles),
    equipment:         row.equipment,
    level:             row.level,
    is_compound:       row.is_compound === 1,
    unilateral:        row.unilateral === 1,
    tempo_default:     row.tempo_default,
    glp_flag:          row.glp_flag === 1,
    progresses_to:     row.progresses_to,
    regresses_to:      row.regresses_to,
    notes:             row.notes,
    created_at:        row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * getMovementById(id) → parsed movement, or 404.
 */
function getMovementById(id) {
  const db  = getDb();
  const row = db.prepare('SELECT * FROM movements WHERE id = ?').get(id);
  if (!row) throw httpError(404, `Movement not found: ${id}`);
  return rowToMovement(row);
}

/**
 * getMovementsByCategory(category, opts?) → array (possibly empty).
 * opts.level     — exact level filter (beginner|intermediate|advanced).
 * opts.equipment — string or array of singular equipment slug(s) to include.
 * Results are ordered by level then name for a stable, sensible default.
 */
function getMovementsByCategory(category, opts = {}) {
  const db      = getDb();
  const clauses = ['category = ?'];
  const params  = [category];

  if (opts.level) {
    clauses.push('level = ?');
    params.push(opts.level);
  }

  const equipment = normalizeEquipmentList(opts.equipment);
  if (equipment.length) {
    clauses.push(`equipment IN (${equipment.map(() => '?').join(', ')})`);
    params.push(...equipment);
  }

  const rows = db.prepare(`
    SELECT * FROM movements
    WHERE ${clauses.join(' AND ')}
    ORDER BY
      CASE level WHEN 'beginner' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END,
      name
  `).all(...params);

  return rows.map(rowToMovement);
}

/**
 * getMovementsByEquipment(equipment) → array (possibly empty).
 * Accepts a single slug or an array of slugs the user owns, returning every
 * movement performable with that equipment. Slugs are the table's SINGULAR
 * form (see equipment note up top).
 */
function getMovementsByEquipment(equipment) {
  const db   = getDb();
  const list = normalizeEquipmentList(equipment);
  if (!list.length) return [];

  const rows = db.prepare(`
    SELECT * FROM movements
    WHERE equipment IN (${list.map(() => '?').join(', ')})
    ORDER BY category, name
  `).all(...list);

  return rows.map(rowToMovement);
}

/**
 * searchByAlias(q) → single best-match movement, or null.
 *
 * For AI/spoken-name resolution we want ONE canonical movement, not a list, so
 * the parse step can map an utterance straight to a movement id. Strategy
 * (first hit wins, highest confidence first):
 *
 *   1. Exact match on normalized `name`.
 *   2. Exact match on a normalized entry in the `aliases` array.
 *   3. Substring match (query contained in name/alias, or name/alias contained
 *      in query), tie-broken toward the shortest name so "row" prefers the
 *      simplest canonical movement rather than a longer variant.
 *
 * Normalization lowercases, trims, and collapses separators (spaces/hyphens/
 * underscores) so "push up", "push-up" and "pushup" all collide. Returns null
 * when nothing plausibly matches; callers decide whether that's a 404 or a
 * "didn't catch that" for the user.
 */
function searchByAlias(q) {
  if (q == null) return null;
  const needle = normalizeName(q);
  if (!needle) return null;

  const db   = getDb();
  const rows = db.prepare('SELECT * FROM movements').all();

  let exactName    = null;
  let exactAlias   = null;
  let substrBest   = null;

  for (const row of rows) {
    const name    = normalizeName(row.name);
    const aliases = parseJsonArray(row.aliases).map(normalizeName);

    if (name === needle) { exactName = row; break; }
    if (!exactAlias && aliases.includes(needle)) { exactAlias = row; continue; }

    if (!exactAlias) {
      const candidates = [name, ...aliases];
      const hit = candidates.some(c => c.includes(needle) || needle.includes(c));
      if (hit && (!substrBest || row.name.length < substrBest.name.length)) {
        substrBest = row;
      }
    }
  }

  const best = exactName || exactAlias || substrBest;
  return rowToMovement(best);
}

/**
 * getSubstitutes(id, opts?) → array of substitute movements.
 *
 * STUB for P1-B. Full substitution logic (deload steps, equipment swaps,
 * pattern-equivalent picks) is authored in P1-C once the base library is
 * locked. For now we surface only the trivially-available progression chain
 * neighbours stored on the row (progresses_to / regresses_to), so callers have
 * something real to test against without committing to chain semantics.
 *
 * opts.direction — 'harder' | 'easier' | 'both' (default 'both').
 *
 * TODO(P1-C): replace this neighbour walk with proper substitution selection
 * (same pattern, owned equipment, level-appropriate; multi-hop chain walk for
 * deload). Throws 404 if the base movement id is unknown.
 */
function getSubstitutes(id, opts = {}) {
  const movement  = getMovementById(id); // 404s on unknown id
  const direction = opts.direction || 'both';

  const ids = [];
  if ((direction === 'harder' || direction === 'both') && movement.progresses_to) {
    ids.push(movement.progresses_to);
  }
  if ((direction === 'easier' || direction === 'both') && movement.regresses_to) {
    ids.push(movement.regresses_to);
  }
  if (!ids.length) return [];

  const db   = getDb();
  const rows = db.prepare(
    `SELECT * FROM movements WHERE id IN (${ids.map(() => '?').join(', ')})`
  ).all(...ids);

  // Preserve harder-then-easier ordering rather than DB order.
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.map(i => rowToMovement(byId.get(i))).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a name/alias/query for case- and separator-insensitive matching. */
function normalizeName(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, ' ');
}

/** Coerce a string|array|undefined equipment arg into a clean string[]. */
function normalizeEquipmentList(equipment) {
  if (equipment == null) return [];
  const arr = Array.isArray(equipment) ? equipment : [equipment];
  return arr.filter(e => typeof e === 'string' && e.length);
}

module.exports = {
  rowToMovement,
  getMovementById,
  getMovementsByCategory,
  getMovementsByEquipment,
  searchByAlias,
  getSubstitutes,
};
