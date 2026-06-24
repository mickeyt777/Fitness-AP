'use strict';

/**
 * recoveryMath — Phase 2-D (rest-day / recovery awareness).
 *
 * Pure, db-free readiness logic. Given a few short-window signals (sleep, energy,
 * GLP symptoms, recent activity load) it returns a gentle, NON-CLINICAL daily
 * recovery read: train / take it easy / rest.
 *
 * This is informational only — a nudge surfaced on Today. It does NOT scale the
 * generated plan. The acute, symptom-driven plan scaling lives separately in
 * engine/workout.js `shouldAutoDeload` (today's single check-in). Recovery is the
 * complementary multi-day readiness view; the two can both fire.
 *
 * Design: start from a neutral readiness, apply transparent additive adjustments
 * for each signal that's present (missing signals are simply skipped), clamp, then
 * map to a state. Load signals only ever steer toward "easy" — never all the way to
 * "rest" on their own (being active is good; we just suggest lightening up).
 *
 * Never medical: no diagnosis, no "overtraining/injury" language. Framing matches
 * the app's existing copy ("this is recovery, not failure").
 */

const NEUTRAL = 70;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * @param {object} i
 *   energyRecent        {number|null} avg energy 1–10 over the last few days
 *   sleepRecent         {number|null} most recent night's sleep, hours
 *   nauseaToday         {number|null} today's nausea 1–10 (LOW = worse)
 *   giToday             {number|null} today's GI symptoms 1–10 (LOW = worse)
 *   cardioMinutes7d     {number}      cardio minutes over the last 7 days
 *   stepsVsGoalRecent   {number|null} recent steps / adaptive step goal (load proxy)
 *   hardSessionsRecent  {number}      count of 'hard' cardio bouts in the last ~2 days
 * @returns {{state:string, score:(number|null), label:string, headline:string, reasons:string[]}}
 */
function recoveryState(i = {}) {
  const {
    energyRecent = null,
    sleepRecent = null,
    nauseaToday = null,
    giToday = null,
    cardioMinutes7d = 0,
    stepsVsGoalRecent = null,
    hardSessionsRecent = 0,
  } = i;

  // A readiness read needs at least one wellness signal — activity load alone
  // isn't enough to tell someone to rest.
  const hasWellnessSignal =
    energyRecent != null || sleepRecent != null || nauseaToday != null || giToday != null;
  if (!hasWellnessSignal) {
    return {
      state: 'unknown',
      score: null,
      label: 'No recovery read yet',
      headline: 'Log a quick check-in to see your recovery read.',
      reasons: [],
    };
  }

  let score = NEUTRAL;
  const reasons = [];

  // --- Sleep -----------------------------------------------------------------
  if (sleepRecent != null) {
    if (sleepRecent >= 7.5) score += 10;
    else if (sleepRecent >= 6.5) score += 3;
    else if (sleepRecent >= 5.5) { score -= 8; reasons.push('Sleep has been a little short'); }
    else { score -= 18; reasons.push("You're low on sleep"); }
  }

  // --- Energy ----------------------------------------------------------------
  if (energyRecent != null) {
    if (energyRecent >= 7) score += 12;
    else if (energyRecent >= 5) score += 2;
    else if (energyRecent >= 3.5) { score -= 10; reasons.push('Energy has been a bit low'); }
    else { score -= 22; reasons.push('Energy is very low'); }
  }

  // --- GLP symptoms (today, acute) — lowest of nausea/GI present --------------
  const symptomVals = [nauseaToday, giToday].filter((v) => v != null);
  if (symptomVals.length) {
    const sym = Math.min(...symptomVals);
    if (sym <= 3) { score -= 32; reasons.push('Nausea/GI is rough today'); }
    else if (sym <= 5) { score -= 12; reasons.push('Mild GLP symptoms today'); }
  }

  // --- Recent activity load — steers toward "easy", gently -------------------
  if (hardSessionsRecent >= 2) { score -= 10; reasons.push('Two hard cardio days back-to-back'); }
  else if (hardSessionsRecent === 1) score -= 4;

  if (stepsVsGoalRecent != null && stepsVsGoalRecent >= 1.4) {
    score -= 6;
    reasons.push('Big movement days recently');
  }
  if (cardioMinutes7d >= 240) {
    score -= 5;
    if (hardSessionsRecent < 2) reasons.push('High cardio volume this week');
  }

  score = clamp(Math.round(score), 0, 100);

  // --- Map to state ----------------------------------------------------------
  let state, label, headline;
  if (score >= 65) {
    state = 'ready';
    label = 'Good to train';
    headline = 'You look recovered — go for your planned session.';
    if (!reasons.length) reasons.push('Sleep, energy, and symptoms all look solid');
  } else if (score >= 45) {
    state = 'easy';
    label = 'Take it easy';
    headline = 'Keep it light today — active recovery or a lighter session.';
  } else {
    state = 'rest';
    label = 'Rest day';
    headline = "Your body's asking for a break. Rest today — this is recovery, not failure.";
  }

  return { state, score, label, headline, reasons: reasons.slice(0, 3) };
}

module.exports = { recoveryState };
