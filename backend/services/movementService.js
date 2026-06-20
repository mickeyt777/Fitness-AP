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
// Equipment + level vocab
// ---------------------------------------------------------------------------

// The movements table uses SINGULAR equipment slugs; the live engine and stored
// profiles use PLURALS for some. This map translates the engine/profile vocab
// onto the table's slugs. Slugs already singular (bodyweight/barbell/machine)
// map to themselves. This is the one place that translation lives (P1-C).
const EQUIPMENT_PLURAL_TO_SINGULAR = {
  dumbbells:   'dumbbell',
  cables:      'cable',
  kettlebells: 'kettlebell',
  bands:       'band',
  // pass-throughs (already singular in both vocabularies)
  bodyweight:  'bodyweight',
  barbell:     'barbell',
  machine:     'machine',
  dumbbell:    'dumbbell',
  cable:       'cable',
  kettlebell:  'kettlebell',
  band:        'band',
};

/** Translate one engine/profile equipment slug to the table's singular slug. */
function toSingularEquipment(slug) {
  if (typeof slug !== 'string') return null;
  return EQUIPMENT_PLURAL_TO_SINGULAR[slug.toLowerCase()] || slug.toLowerCase();
}

/** Numeric ordering for the level enum (used for <= "max level" filtering). */
const LEVEL_RANK = { beginner: 1, intermediate: 2, advanced: 3 };
function levelRank(level) {
  return LEVEL_RANK[level] || 1;
}

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
 * getMovementsByPattern(pattern, opts?) → array (possibly empty).
 *
 * This is the key the workout engine selects on (push_h, squat, hinge, …).
 * opts.maxLevel     — include movements at this level OR EASIER (the engine
 *                     treats level like a ceiling, mirroring the old numeric
 *                     tier). e.g. maxLevel='intermediate' returns beginner +
 *                     intermediate.
 * opts.equipment    — string or array of owned equipment (plural or singular);
 *                     restricts to movements performable with that equipment.
 * opts.compoundOnly — when true, only is_compound=1 movements. The engine's
 *                     main-lift slots want compounds (isolation work like
 *                     lateral raises / calf raises shares a pattern but isn't a
 *                     main lift), so the engine adapter passes this true.
 * Ordered by level (easiest first) then name for deterministic rotation.
 */
function getMovementsByPattern(pattern, opts = {}) {
  const db      = getDb();
  const clauses = ['pattern = ?'];
  const params  = [pattern];

  if (opts.maxLevel) {
    clauses.push(`(CASE level WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END) <= ?`);
    params.push(levelRank(opts.maxLevel));
  }
  if (opts.compoundOnly) {
    clauses.push('is_compound = 1');
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
 * scoreMatch(needle, name, aliases) → number (0 = no match, higher = better).
 *
 * Deterministic confidence score for resolving a spoken/typed name to a
 * movement. Highest signal first, taking the best score across the canonical
 * name and every alias:
 *   exact name           100
 *   exact alias           90
 *   name/needle prefix    70   (one starts with the other)
 *   alias/needle prefix   60
 *   name/needle substring 50   (one contains the other)
 *   alias/needle substr.  40
 * All comparisons run on normalized strings (lowercased, trimmed, separators
 * collapsed) so "push up" / "push-up" / "pushup" collide.
 */
function scoreMatch(needle, name, aliases) {
  const rel = (a, b) =>
    a === b ? 3 : (a.startsWith(b) || b.startsWith(a)) ? 2 : (a.includes(b) || b.includes(a)) ? 1 : 0;

  let best = 0;
  const nameRel = rel(name, needle);
  if (nameRel === 3) return 100;
  if (nameRel === 2) best = Math.max(best, 70);
  if (nameRel === 1) best = Math.max(best, 50);

  for (const a of aliases) {
    const r = rel(a, needle);
    if (r === 3) best = Math.max(best, 90);
    else if (r === 2) best = Math.max(best, 60);
    else if (r === 1) best = Math.max(best, 40);
  }
  return best;
}

/**
 * searchMovements(q, opts?) → ranked array of matching movements (possibly []).
 *
 * For AI/spoken-name resolution. Returns matches ordered by descending score
 * (see scoreMatch), tie-broken toward the shortest canonical name (so a bare
 * "rdl" surfaces the simplest variant first) and then alphabetically for full
 * determinism. opts.limit caps the list (default 6). The first element is the
 * single best match.
 */
function searchMovements(q, opts = {}) {
  if (q == null) return [];
  const needle = normalizeName(q);
  if (!needle) return [];
  const limit = opts.limit ?? 6;

  const db   = getDb();
  const rows = db.prepare('SELECT * FROM movements').all();

  const scored = [];
  for (const row of rows) {
    const name    = normalizeName(row.name);
    const aliases = parseJsonArray(row.aliases).map(normalizeName);
    const score   = scoreMatch(needle, name, aliases);
    if (score > 0) scored.push({ row, score });
  }

  scored.sort((a, b) =>
    b.score - a.score
    || a.row.name.length - b.row.name.length
    || a.row.name.localeCompare(b.row.name));

  return scored.slice(0, limit).map(s => rowToMovement(s.row));
}

/**
 * searchByAlias(q) → single best-match movement, or null.
 * Thin convenience over searchMovements() for callers that only want the top
 * hit (e.g. a direct id resolution with no disambiguation UI).
 */
function searchByAlias(q) {
  const matches = searchMovements(q, { limit: 1 });
  return matches.length ? matches[0] : null;
}

/**
 * getSubstitutes(id, opts?) → ranked array of substitute movements (P1-C).
 *
 * Two layered strategies, most-relevant first:
 *   1. Progression-chain walk (multi-hop) along regresses_to / progresses_to —
 *      these are the authored, hand-vetted substitutes, so they rank first and
 *      in chain order (closest variant first).
 *   2. Level-appropriate same-pattern fallback — other movements sharing the
 *      base movement's `pattern`, in the requested direction, filtered to owned
 *      equipment. Fills gaps where the chain is sparse (chains are only
 *      partially authored). Ordered by closeness in level, then name.
 *
 * opts.direction — 'easier' | 'harder' | 'both' (default 'both').
 *   'easier'  → regression chain + lower-level same-pattern movements.
 *   'harder'  → progression chain + higher-level same-pattern movements.
 *   'both'    → easier first, then harder.
 * opts.equipment    — owned equipment (string|array, plural or singular). When
 *                     given, every returned substitute must be performable with
 *                     it (this is the equipment-swap path).
 * opts.compoundOnly — restrict same-pattern fallback to compounds (default
 *                     false; chain neighbours are always included regardless).
 *
 * Returns [] when nothing qualifies. Throws 404 if the base id is unknown.
 */
function getSubstitutes(id, opts = {}) {
  const base      = getMovementById(id); // 404s on unknown id
  const direction = opts.direction || 'both';
  const equipment = normalizeEquipmentList(opts.equipment);
  const db        = getDb();

  const okEquipment = (m) => !equipment.length || equipment.includes(m.equipment);

  // --- 1. Walk an authored chain (multi-hop), collecting ids in order. -------
  const walkChain = (field) => {
    const ids = [];
    const seen = new Set([base.id]);
    let cursor = base[field];
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const row = db.prepare('SELECT * FROM movements WHERE id = ?').get(cursor);
      if (!row) break;
      const m = rowToMovement(row);
      ids.push(m);
      cursor = m[field];
    }
    return ids;
  };

  // --- 2. Same-pattern, level-appropriate fallback in a direction. -----------
  const samePatternFallback = (dir) => {
    if (!base.pattern) return [];
    const baseRank = levelRank(base.level);
    const all = getMovementsByPattern(base.pattern, {
      compoundOnly: opts.compoundOnly || false,
    });
    return all
      .filter(m => m.id !== base.id)
      .filter(m => dir === 'easier'
        ? levelRank(m.level) <= baseRank
        : levelRank(m.level) >= baseRank)
      // closeness: smallest level gap to the base first, then name
      .sort((a, b) =>
        Math.abs(levelRank(a.level) - baseRank) - Math.abs(levelRank(b.level) - baseRank)
        || a.name.localeCompare(b.name));
  };

  const collect = (dir) => [
    ...walkChain(dir === 'easier' ? 'regresses_to' : 'progresses_to'),
    ...samePatternFallback(dir),
  ];

  let candidates = [];
  if (direction === 'easier' || direction === 'both') candidates.push(...collect('easier'));
  if (direction === 'harder' || direction === 'both') candidates.push(...collect('harder'));

  // De-dupe (preserve first/most-relevant occurrence), drop base, apply equipment.
  const seen = new Set([base.id]);
  const out  = [];
  for (const m of candidates) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    if (!okEquipment(m)) continue;
    out.push(m);
  }
  return out;
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

/**
 * Coerce a string|array|undefined equipment arg into a clean, de-duplicated
 * string[] of the table's SINGULAR slugs (accepts engine/profile plurals too).
 */
function normalizeEquipmentList(equipment) {
  if (equipment == null) return [];
  const arr = Array.isArray(equipment) ? equipment : [equipment];
  const out = [];
  for (const e of arr) {
    const slug = toSingularEquipment(e);
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}

module.exports = {
  rowToMovement,
  getMovementById,
  getMovementsByCategory,
  getMovementsByEquipment,
  getMovementsByPattern,
  searchMovements,
  searchByAlias,
  getSubstitutes,
  // vocab helpers (used by the engine adapter in P1-C)
  toSingularEquipment,
  levelRank,
  EQUIPMENT_PLURAL_TO_SINGULAR,
};
