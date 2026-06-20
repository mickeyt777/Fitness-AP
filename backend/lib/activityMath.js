'use strict';

/**
 * activityMath — pure, db-free helpers for Phase 2 (cardio / steps / activity).
 *
 * Kept free of any database import so it can be unit-tested in the sandbox
 * (which has no better-sqlite3). activityService.js owns all SQL and delegates
 * the numeric / reconciliation decisions here.
 */

// --- small numeric utils ----------------------------------------------------

function median(nums) {
  const xs = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function roundTo(n, step) {
  return Math.round(n / step) * step;
}

// --- adaptive step goal -----------------------------------------------------

const STEP_GOAL = {
  MIN_BASELINE_DAYS: 3, // below this we don't have a trustworthy baseline
  WINDOW_DAYS: 7,
  NUDGE: 1.05, // ~5% above the user's own rolling median (decision: 7-day median +5%)
  ROUND_STEP: 100,
};

/**
 * computeStepGoal(priorSteps) → integer goal, or null when there isn't enough
 * history to set a personalised goal yet.
 *
 * priorSteps: daily step counts from the trailing window (most recent prior
 * days), nulls/non-numbers ignored by median(). Decision (with Mickey): rolling
 * 7-day MEDIAN, nudged ~5% above, rounded to a clean 100. Median (not mean) so a
 * single huge or lazy day doesn't whipsaw the goal. Non-clinical by design —
 * this is a gentle nudge above the user's own baseline, never a fixed 10k.
 */
function computeStepGoal(priorSteps) {
  const xs = (priorSteps || []).filter((n) => typeof n === 'number' && n >= 0);
  if (xs.length < STEP_GOAL.MIN_BASELINE_DAYS) return null;
  const m = median(xs);
  if (m === null || m <= 0) return null;
  return roundTo(m * STEP_GOAL.NUDGE, STEP_GOAL.ROUND_STEP);
}

// --- date derivation --------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s) {
  return typeof s === 'string' && ISO_DATE.test(s) && !Number.isNaN(Date.parse(s));
}

/**
 * deriveDate(explicitDate, startedAt, todayStr) → a valid YYYY-MM-DD.
 *
 * The calendar day a bout belongs to is the dedup key, so it must never be
 * garbage. Prefer an explicit valid date; else the date portion of started_at
 * (only if that portion is itself a valid date — a date-less "T07:00:00Z" must
 * NOT become the date and silently break same-day dedup); else fall back to
 * today. This is the guard for the malformed-started_at case found in P2-B smoke.
 */
function deriveDate(explicitDate, startedAt, todayStr) {
  if (isValidDate(explicitDate)) return explicitDate;
  if (typeof startedAt === 'string') {
    const datePart = startedAt.slice(0, 10);
    if (isValidDate(datePart)) return datePart;
  }
  return todayStr;
}

// --- dedup: time-window overlap + activity-type match -----------------------

function toMs(t) {
  if (t === null || t === undefined) return null;
  const ms = t instanceof Date ? t.getTime() : Date.parse(t);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * intervalsOverlap(aStart, aDurMin, bStart, bDurMin)
 *   true  — the two bouts' [start, start+duration] windows overlap.
 *   false — they provably don't.
 *   null  — can't tell (a start or duration is missing). Callers treat null as
 *           "fall back to the coarser same-day check the SQL candidate query
 *           already enforced" rather than as a hard non-conflict.
 */
function intervalsOverlap(aStart, aDurMin, bStart, bDurMin) {
  const aS = toMs(aStart);
  const bS = toMs(bStart);
  if (aS === null || bS === null) return null;
  if (aDurMin === null || aDurMin === undefined || bDurMin === null || bDurMin === undefined) return null;
  const aE = aS + aDurMin * 60_000;
  const bE = bS + bDurMin * 60_000;
  return aS < bE && bS < aE;
}

function normalizeModality(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * sameActivityType(a, b) — do two bouts describe the same kind of cardio?
 * Match when they resolve to the same movements-table id, OR (when one/both are
 * unresolved manual entries) when their normalized modality strings share a
 * meaningful token. Pure string/id comparison; a/b are { movement_id, modality }.
 */
function sameActivityType(a, b) {
  if (a.movement_id && b.movement_id) return a.movement_id === b.movement_id;
  const ta = new Set(normalizeModality(a.modality).split(' ').filter(Boolean));
  const tb = new Set(normalizeModality(b.modality).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return false;
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

/**
 * conflicts(manual, hk) — should this HealthKit bout supersede this manual one?
 * (Both already known to be the same user + same calendar date via SQL.)
 * Requires same activity type AND a time overlap that isn't provably absent.
 * Rows are { movement_id, modality, started_at, duration_min }.
 */
function conflicts(manual, hk) {
  if (!sameActivityType(manual, hk)) return false;
  const ov = intervalsOverlap(manual.started_at, manual.duration_min, hk.started_at, hk.duration_min);
  return ov !== false; // true overlap, or null (no usable times) → same-day type match is enough
}

// --- directional, non-clinical activity trend -------------------------------

/**
 * activityTrend(recentAvg, priorAvg) → { direction, pct, label }.
 * Frames movement as a gentle direction ("more active than last week"), never a
 * medical claim — important given the GLP-1 context.
 */
function activityTrend(recentAvg, priorAvg) {
  if (!priorAvg || priorAvg <= 0 || recentAvg === null || recentAvg === undefined) {
    return { direction: 'flat', pct: null, label: 'Building your baseline' };
  }
  const pct = Math.round(((recentAvg - priorAvg) / priorAvg) * 100);
  if (pct >= 5) return { direction: 'up', pct, label: 'More active than last week' };
  if (pct <= -5) return { direction: 'down', pct, label: 'A bit less active than last week' };
  return { direction: 'flat', pct, label: 'Holding steady with last week' };
}

module.exports = {
  median,
  roundTo,
  computeStepGoal,
  isValidDate,
  deriveDate,
  intervalsOverlap,
  normalizeModality,
  sameActivityType,
  conflicts,
  activityTrend,
  STEP_GOAL,
};
