-- Migration 014: author the substitution / progression chains (P1-E)
-- Fills in progresses_to / regresses_to across the lower / push / pull
-- COMPOUND movements so getSubstitutes() and the deload chain-walk run on
-- vetted progressions, not just the same-pattern fallback.
--
-- Scope (decided with Mickey 2026-06-20): squat / hinge / push_h / push_v /
-- pull_h compounds only. Accessory + isolation (arms, lateral raise, leg
-- extension/curl, calf raise, cable fly, straight-arm pulldown) and the
-- non-strength categories (core, carry, mobility, conditioning) are deferred —
-- the engine's main-lift slots never select them, so nothing consumes a chain
-- there yet. pull_v is already fully chained in 013 (no changes here).
--
-- Style mirrors 013: UPDATE statements applied after the rows exist, so the
-- self-FKs resolve regardless of order. 013's existing links are NOT rewritten;
-- this migration only (a) fills NULL gaps to extend existing spines and (b)
-- adds new nodes / one-way "alternate" links that merge into a spine — the same
-- convention 013 uses for leg_press, incline_db_press, and cable_row.
--
-- Chain model: linear spine per movement family (bidirectional, easiest ->
-- hardest) + one-way alternates. Mixed equipment within a chain is intentional
-- (the deload path filters by owned equipment downstream).

-- =====================================================================
-- LOWER / squat
-- =====================================================================

-- Bilateral spine: prepend easier entries to the existing
-- goblet_squat -> db_front_squat -> barbell_front_squat line.
-- (goblet_squat.progresses_to stays db_front_squat; only its NULL
--  regresses_to is filled.)
UPDATE movements SET progresses_to='bodyweight_squat', regresses_to=NULL            WHERE id='box_squat';
UPDATE movements SET progresses_to='goblet_squat',     regresses_to='box_squat'     WHERE id='bodyweight_squat';
UPDATE movements SET regresses_to='bodyweight_squat'                                WHERE id='goblet_squat';

-- Heavy back squat regression (roadmap: back squat -> leg press -> goblet).
-- One-way alternate into the existing leg_press -> goblet link.
UPDATE movements SET progresses_to=NULL, regresses_to='leg_press'                   WHERE id='barbell_back_squat';

-- Unilateral spine (all new): step_up -> split_squat -> walking_lunge -> bulgarian.
UPDATE movements SET progresses_to='split_squat',            regresses_to=NULL                  WHERE id='step_up';
UPDATE movements SET progresses_to='walking_lunge',          regresses_to='step_up'             WHERE id='split_squat';
UPDATE movements SET progresses_to='bulgarian_split_squat',  regresses_to='split_squat'         WHERE id='walking_lunge';
UPDATE movements SET progresses_to=NULL,                     regresses_to='walking_lunge'       WHERE id='bulgarian_split_squat';

-- =====================================================================
-- LOWER / hinge
-- =====================================================================

-- Main spine: prepend to the existing
-- db_romanian_deadlift -> trap_bar_deadlift -> barbell_deadlift line.
-- (db_romanian_deadlift.progresses_to stays trap_bar_deadlift; only its NULL
--  regresses_to is filled.)
UPDATE movements SET progresses_to='hip_thrust',           regresses_to=NULL          WHERE id='glute_bridge';
UPDATE movements SET progresses_to='db_romanian_deadlift', regresses_to='glute_bridge' WHERE id='hip_thrust';
UPDATE movements SET regresses_to='hip_thrust'                                         WHERE id='db_romanian_deadlift';

-- Apex + variant hinges as one-way alternates regressing to the DB RDL base.
UPDATE movements SET progresses_to=NULL, regresses_to='db_romanian_deadlift'          WHERE id='barbell_rdl';
UPDATE movements SET progresses_to=NULL, regresses_to='db_romanian_deadlift'          WHERE id='single_leg_rdl';
UPDATE movements SET progresses_to=NULL, regresses_to='db_romanian_deadlift'          WHERE id='kb_swing';
UPDATE movements SET progresses_to=NULL, regresses_to='hip_thrust'                    WHERE id='back_extension';

-- =====================================================================
-- PUSH / push_h
-- =====================================================================

-- Prepend incline_push_up to the existing push_up -> db_bench_press ->
-- barbell_bench_press line (fills push_up's NULL regresses_to).
UPDATE movements SET progresses_to='push_up', regresses_to=NULL                       WHERE id='incline_push_up';
UPDATE movements SET regresses_to='incline_push_up'                                   WHERE id='push_up';

-- One-way alternates that merge into the press spine.
UPDATE movements SET progresses_to='db_bench_press',     regresses_to='incline_push_up' WHERE id='machine_chest_press';
UPDATE movements SET progresses_to='barbell_bench_press', regresses_to='db_bench_press'  WHERE id='db_floor_press';

-- =====================================================================
-- PUSH / push_v
-- =====================================================================

-- Prepend machine_shoulder_press to the existing db_shoulder_press ->
-- barbell_ohp line (fills db_shoulder_press's NULL regresses_to).
UPDATE movements SET progresses_to='db_shoulder_press', regresses_to=NULL             WHERE id='machine_shoulder_press';
UPDATE movements SET regresses_to='machine_shoulder_press'                            WHERE id='db_shoulder_press';

-- Arnold press as a one-way alternate spanning db_shoulder_press -> barbell_ohp.
UPDATE movements SET progresses_to='barbell_ohp', regresses_to='db_shoulder_press'    WHERE id='arnold_press';

-- =====================================================================
-- PULL / pull_h
-- =====================================================================

-- Fill db_row's NULL regresses_to so chest_supported_row <-> db_row is
-- bidirectional (db_row.progresses_to stays barbell_row).
UPDATE movements SET regresses_to='chest_supported_row'                               WHERE id='db_row';

-- Inverted row as a one-way alternate spanning db_row -> barbell_row.
UPDATE movements SET progresses_to='barbell_row', regresses_to='db_row'               WHERE id='inverted_row';

-- pull_v: already fully chained in 013 (lat_pulldown -> assisted_pull_up ->
-- pull_up). No changes.
