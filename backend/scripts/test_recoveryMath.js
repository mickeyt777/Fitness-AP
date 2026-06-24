'use strict';

/**
 * Pure-logic tests for lib/recoveryMath (no DB). Run: `node scripts/test_recoveryMath.js`
 * (from backend/). Exits non-zero on any failure.
 */

const { recoveryState } = require('../lib/recoveryMath');

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

// No wellness signal → unknown (activity load alone is insufficient).
let r = recoveryState({ cardioMinutes7d: 300, hardSessionsRecent: 2 });
eq('unknown.state', r.state, 'unknown');
eq('unknown.score', r.score, null);

// All good → ready, with a positive reason.
r = recoveryState({ energyRecent: 8, sleepRecent: 8, nauseaToday: 9, giToday: 9 });
eq('ready.state', r.state, 'ready');
eq('ready.reasonsNonEmpty', r.reasons.length > 0, true);

// Rough acute symptoms dominate → rest.
r = recoveryState({ energyRecent: 6, sleepRecent: 7, nauseaToday: 2, giToday: 8 });
eq('symptom.rest', r.state, 'rest');

// Very low energy + short sleep → rest.
r = recoveryState({ energyRecent: 3, sleepRecent: 5 });
eq('lowenergy.rest', r.state, 'rest');

// Decent wellness but heavy recent load → easy (load steers, never rests alone).
r = recoveryState({ energyRecent: 6, sleepRecent: 7, nauseaToday: 8, giToday: 8, cardioMinutes7d: 300, hardSessionsRecent: 2, stepsVsGoalRecent: 1.6 });
eq('load.easy', r.state, 'easy');

// Strong wellness is never forced to rest by load alone.
r = recoveryState({ energyRecent: 9, sleepRecent: 8.5, nauseaToday: 9, giToday: 9, cardioMinutes7d: 400, hardSessionsRecent: 2, stepsVsGoalRecent: 2.0 });
eq('strongwellness.notrest', r.state !== 'rest', true);

// Mild low energy only → easy band.
r = recoveryState({ energyRecent: 4.5, sleepRecent: 7 });
eq('mild.easy', r.state, 'easy');

// Worst case clamps to an integer in [0,100] and caps reasons at 3.
r = recoveryState({ energyRecent: 1, sleepRecent: 3, nauseaToday: 1, giToday: 1, cardioMinutes7d: 500, hardSessionsRecent: 3, stepsVsGoalRecent: 3 });
eq('clamp.low', r.score >= 0 && Number.isInteger(r.score), true);
eq('reasons.cap', r.reasons.length <= 3, true);

// Partial nulls don't crash.
r = recoveryState({ sleepRecent: 8 });
eq('partial.ok', typeof r.state, 'string');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
