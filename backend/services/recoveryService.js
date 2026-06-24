'use strict';

/**
 * recoveryService — Phase 2-D (rest-day / recovery awareness).
 *
 * Composes short-window inputs from existing data (daily_checkins + the activity
 * summary) and runs them through the pure lib/recoveryMath. No new tables; no SQL
 * of its own beyond reusing the check-in and activity services.
 */

const checkinService = require('./checkinService');
const activityService = require('./activityService');
const { recoveryState } = require('../lib/recoveryMath');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function avg(nums) {
  const vals = nums.filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * GET /recovery/:userId — today's non-clinical recovery read.
 * Returns { date, ...recoveryState(...) }.
 */
function getRecovery(userId) {
  const today = todayStr();

  // --- Wellness: last few days of check-ins (listRecentCheckins returns DESC) ---
  const recent = checkinService.listRecentCheckins(userId, 3) || [];
  const energyRecent = avg(recent.map((c) => c.energy_1_10));
  // Most recent night with a logged value.
  const sleepRow = recent.find((c) => c.sleep_hours != null);
  const sleepRecent = sleepRow ? sleepRow.sleep_hours : null;
  // Symptoms are acute — only count today's check-in.
  const todayRow = recent.find((c) => c.date === today) || null;
  const nauseaToday = todayRow ? todayRow.nausea_1_10 ?? null : null;
  const giToday = todayRow ? todayRow.gi_symptoms_1_10 ?? null : null;

  // --- Activity load: from the existing summary payload ---
  const summary = activityService.getActivitySummary(userId, 7);
  const cardioMinutes7d = summary.cardio_minutes_7d || 0;

  // Steps vs adaptive goal, using today's row if present, else the latest daily row
  // that has both numbers.
  let stepsVsGoalRecent = null;
  const todaySteps = summary.today;
  if (todaySteps && todaySteps.steps != null && todaySteps.step_goal) {
    stepsVsGoalRecent = todaySteps.steps / todaySteps.step_goal;
  } else {
    const withBoth = (summary.daily || [])
      .filter((d) => d.steps != null && d.step_goal)
      .slice(-1)[0];
    if (withBoth) stepsVsGoalRecent = withBoth.steps / withBoth.step_goal;
  }

  // Hard cardio bouts in the last ~2 days (today + yesterday).
  const since = daysAgoStr(1);
  const hardSessionsRecent = (summary.cardio_sessions || []).filter(
    (s) => s.intensity === 'hard' && s.date >= since
  ).length;

  const result = recoveryState({
    energyRecent,
    sleepRecent,
    nauseaToday,
    giToday,
    cardioMinutes7d,
    stepsVsGoalRecent,
    hardSessionsRecent,
  });

  return { date: today, ...result };
}

module.exports = { getRecovery };
