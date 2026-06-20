# Phase 1 — Movement Library Candidate List (for vetting)

*Generated for review. **Strike / keep / rename** each row. Once locked, the keepers get loaded into the `movements` table (migration 013) and the engine refactors to read from it (P1-C).*

This is the collaborative gate from the roadmap: I supply the structured list, you vet it against what you actually want to coach, then we seed. **Nothing here is seeded yet** — migration 012 created the empty table only.

---

## How to read this

Each movement maps to a `movements` row (schema in `backend/migrations/012_movements.sql`). Columns shown:

- **id** — stable slug (used in `workout_sets.exercise_id`, AI parse output, etc.). Don't change once seeded.
- **level** — beginner / intermediate / advanced (supersedes the old numeric tier)
- **equip** — bodyweight · dumbbell · barbell · machine · cable · band · kettlebell
- **pattern** — engine selection key (push_h/push_v/pull_h/pull_v/squat/hinge/core/carry/mobility/conditioning)
- **C** — is_compound (✓ = compound)
- **U** — unilateral (✓ = single-limb / per-side)
- **GLP** — glp_flag: ✓ = safe to push hard on GLP-1; ✗ = bias away from / cap on low-energy days (heavy spinal load, high skill, or fall risk)
- **aliases** — spoken/typed variants the AI parser should resolve to this id

Tempo defaults to a 3-second eccentric unless a row says otherwise. Secondary muscles and full coaching `notes` will be filled in at seed time — flag any row where you want specific cues.

**● = carried over from the current `engine/exercises.js` (already live in v1).** Everything else is a new candidate.

> **Equipment slug change to confirm:** the current engine uses `dumbbells`, `cables`, `machine`, `bodyweight`, `barbell`. The new table uses **singular** canonical slugs: `dumbbell`, `cable`, `machine`, `bodyweight`, `barbell`, plus new `band` and `kettlebell`. P1-C will map the old plural slugs over. OK to standardize on singular?

---

## 1. PUSH

### Horizontal push (pattern `push_h`)

| id | name | level | equip | C | U | GLP | aliases |
|---|---|---|---|:-:|:-:|:-:|---|
| ● push_up | Push-Up | beginner | bodyweight | ✓ | | ✓ | pushup, press up |
| incline_push_up | Incline Push-Up | beginner | bodyweight | ✓ | | ✓ | hands-elevated push-up, easy push-up |
| ● db_bench_press | Dumbbell Bench Press | beginner | dumbbell | ✓ | | ✓ | db bench, dumbbell press, flat db press |
| machine_chest_press | Machine Chest Press | beginner | machine | ✓ | | ✓ | chest press machine, seated chest press |
| ● incline_db_press | Incline Dumbbell Press | intermediate | dumbbell | ✓ | | ✓ | incline db press, incline dumbbell |
| cable_fly | Cable Chest Fly | intermediate | cable | | | ✓ | cable flye, pec fly, crossover |
| db_floor_press | Dumbbell Floor Press | intermediate | dumbbell | ✓ | | ✓ | floor press |
| ● barbell_bench_press | Barbell Bench Press | advanced | barbell | ✓ | | ✓ | bench, bench press, flat bench |

### Vertical push (pattern `push_v`)

| id | name | level | equip | C | U | GLP | aliases |
|---|---|---|---|:-:|:-:|:-:|---|
| ● db_shoulder_press | Dumbbell Shoulder Press | beginner | dumbbell | ✓ | | ✓ | db ohp, seated db press, dumbbell shoulder |
| machine_shoulder_press | Machine Shoulder Press | beginner | machine | ✓ | | ✓ | shoulder press machine |
| db_lateral_raise | Dumbbell Lateral Raise | beginner | dumbbell | | | ✓ | lat raise, side raise, lateral |
| arnold_press | Arnold Press | intermediate | dumbbell | ✓ | | ✓ | arnold |
| ● barbell_ohp | Barbell Overhead Press | advanced | barbell | ✓ | | ✗ | ohp, overhead press, military press, strict press |

---

## 2. PULL

### Horizontal pull (pattern `pull_h`)

| id | name | level | equip | C | U | GLP | aliases |
|---|---|---|---|:-:|:-:|:-:|---|
| ● chest_supported_row | Chest-Supported Row | beginner | dumbbell | ✓ | | ✓ | chest supported, seal row, incline row |
| ● db_row | Single-Arm Dumbbell Row | beginner | dumbbell | ✓ | ✓ | ✓ | one arm row, db row, single arm row |
| ● cable_row | Seated Cable Row | beginner | cable | ✓ | | ✓ | seated row, cable row, machine row |
| inverted_row | Inverted Row | intermediate | bodyweight | ✓ | | ✓ | bodyweight row, ring row, table row |
| ● barbell_row | Barbell Row | advanced | barbell | ✓ | | ✗ | bent over row, bb row, pendlay row |

### Vertical pull (pattern `pull_v`)

| id | name | level | equip | C | U | GLP | aliases |
|---|---|---|---|:-:|:-:|:-:|---|
| ● lat_pulldown | Lat Pulldown | beginner | cable | ✓ | | ✓ | pulldown, lat pull |
| straight_arm_pulldown | Straight-Arm Pulldown | beginner | cable | | | ✓ | lat pushdown, straight arm |
| ● assisted_pull_up | Assisted Pull-Up | intermediate | machine | ✓ | | ✓ | assisted pullup, band pull-up |
| ● pull_up | Pull-Up | advanced | bodyweight | ✓ | | ✓ | pullup, chin up |

---

## 3. ARMS (category `arms`, pattern `arms`)

*Isolation work in its own category (resolved: dedicated `arms` category rather than parking under pull/push).*

| id | name | level | equip | C | U | GLP | aliases |
|---|---|---|---|:-:|:-:|:-:|---|
| db_biceps_curl | Dumbbell Biceps Curl | beginner | dumbbell | | | ✓ | curl, bicep curl, db curl |
| triceps_pushdown | Triceps Pushdown | beginner | cable | | | ✓ | pushdown, tricep pushdown, rope pushdown |
| hammer_curl | Hammer Curl | beginner | dumbbell | | | ✓ | hammer, neutral curl |
| overhead_triceps_ext | Overhead Triceps Extension | beginner | dumbbell | | | ✓ | tricep extension, skullcrusher, french press |

---

## 4. LOWER

### Squat (pattern `squat`)

| id | name | level | equip | C | U | GLP | aliases |
|---|---|---|---|:-:|:-:|:-:|---|
| bodyweight_squat | Bodyweight Squat | beginner | bodyweight | ✓ | | ✓ | air squat, squat |
| box_squat | Box Squat | beginner | bodyweight | ✓ | | ✓ | sit to stand, chair squat |
| ● goblet_squat | Goblet Squat | beginner | dumbbell | ✓ | | ✓ | goblet, db squat |
| ● leg_press | Leg Press (machine) | intermediate | machine | ✓ | | ✓ | leg press, machine squat |
| ● db_front_squat | Dumbbell Front Squat | intermediate | dumbbell | ✓ | | ✓ | db front squat |
| split_squat | Split Squat | intermediate | dumbbell | ✓ | ✓ | ✓ | static lunge, db split squat |
| bulgarian_split_squat | Bulgarian Split Squat | intermediate | dumbbell | ✓ | ✓ | ✓ | bulgarian, rear foot elevated, rfess |
| walking_lunge | Walking Lunge | intermediate | dumbbell | ✓ | ✓ | ✓ | lunge, db lunge |
| ● barbell_front_squat | Barbell Front Squat | advanced | barbell | ✓ | | ✗ | front squat |
| barbell_back_squat | Barbell Back Squat | advanced | barbell | ✓ | | ✗ | back squat, squat |

### Hinge (pattern `hinge`)

| id | name | level | equip | C | U | GLP | aliases |
|---|---|---|---|:-:|:-:|:-:|---|
| glute_bridge | Glute Bridge | beginner | bodyweight | ✓ | | ✓ | bridge, floor bridge |
| ● hip_thrust | Hip Thrust | beginner | dumbbell | ✓ | | ✓ | hip thruster, db hip thrust |
| ● db_romanian_deadlift | Dumbbell Romanian Deadlift | beginner | dumbbell | ✓ | | ✓ | db rdl, romanian deadlift, stiff leg |
| kb_swing | Kettlebell Swing | intermediate | kettlebell | ✓ | | ✓ | swing, kb swing, russian swing |
| back_extension | Back Extension | intermediate | machine | ✓ | | ✓ | hyperextension, 45 degree back ext |
| single_leg_rdl | Single-Leg Romanian Deadlift | intermediate | dumbbell | ✓ | ✓ | ✓ | sl rdl, single leg deadlift |
| ● trap_bar_deadlift | Trap-Bar Deadlift | intermediate | barbell | ✓ | | ✓ | trap bar, hex bar deadlift |
| ● barbell_deadlift | Conventional Deadlift | advanced | barbell | ✓ | | ✗ | deadlift, conventional, bb deadlift |
| barbell_rdl | Barbell Romanian Deadlift | advanced | barbell | ✓ | | ✗ | barbell rdl, stiff leg deadlift |

### Knee-dominant accessory (pattern `squat`)

| id | name | level | equip | C | U | GLP | aliases |
|---|---|---|---|:-:|:-:|:-:|---|
| leg_extension | Leg Extension | beginner | machine | | | ✓ | quad extension, knee extension |
| leg_curl | Leg Curl | beginner | machine | | | ✓ | hamstring curl, lying leg curl, seated leg curl |
| calf_raise | Standing Calf Raise | beginner | bodyweight | | | ✓ | calf raise, calves |
| step_up | Step-Up | beginner | dumbbell | ✓ | ✓ | ✓ | box step up, db step up |

---

## 5. CORE (pattern `core`)

| id | name | level | equip | C | U | GLP | aliases |
|---|---|---|---|:-:|:-:|:-:|---|
| dead_bug | Dead Bug | beginner | bodyweight | | | ✓ | deadbug |
| plank | Front Plank | beginner | bodyweight | | | ✓ | plank, front hold |
| side_plank | Side Plank | beginner | bodyweight | | ✓ | ✓ | side hold |
| bird_dog | Bird Dog | beginner | bodyweight | | ✓ | ✓ | quadruped reach |
| pallof_press | Pallof Press | intermediate | cable | | ✓ | ✓ | anti-rotation press, pallof |
| cable_crunch | Cable Crunch | intermediate | cable | | | ✓ | kneeling crunch |
| hanging_knee_raise | Hanging Knee Raise | intermediate | bodyweight | | | ✓ | hanging knee, knee raise |
| ab_wheel | Ab Wheel Rollout | advanced | bodyweight | ✓ | | ✗ | rollout, ab roller |

---

## 6. CARRY (pattern `carry`)

| id | name | level | equip | C | U | GLP | aliases |
|---|---|---|---|:-:|:-:|:-:|---|
| suitcase_carry | Suitcase Carry | beginner | dumbbell | ✓ | ✓ | ✓ | suitcase walk, single arm carry |
| farmers_carry | Farmer's Carry | intermediate | dumbbell | ✓ | | ✓ | farmers walk, loaded carry |
| kb_front_rack_carry | Kettlebell Front-Rack Carry | intermediate | kettlebell | ✓ | ✓ | ✓ | front rack carry, rack walk |

---

## 7. MOBILITY / PREHAB (pattern `mobility`)

*These are the existing v1 mobility-session entries plus a few additions. Pattern `mobility`, no RPE target, `glp_flag` n/a (always safe).*

| id | name | level | equip | aliases |
|---|---|---|---|---|
| ● hip_90_90 | Hip 90/90 Stretch | beginner | bodyweight | 90 90, hip stretch |
| ● thoracic_rotation | Thoracic Rotation | beginner | bodyweight | t-spine rotation, open book |
| ● band_pull_apart | Band Pull-Apart | beginner | band | pull apart, band pulls |
| ● cat_cow | Cat-Cow | beginner | bodyweight | cat camel |
| world_greatest_stretch | World's Greatest Stretch | beginner | bodyweight | wgs, lunge twist |
| ankle_mobility | Ankle Mobility Drill | beginner | bodyweight | ankle rock, dorsiflexion drill |
| dead_hang | Dead Hang | beginner | bodyweight | bar hang, hang |

---

## 8. CONDITIONING (pattern `conditioning`)

*Overlaps with Pillar 2 (cardio/steps). Listed here so the engine can reference them; deeper cardio modeling is Phase 2. `glp_flag` reflects whether to push intensity.*

| id | name | level | equip | GLP | aliases |
|---|---|---|---|:-:|---|
| incline_walk | Incline Treadmill Walk | beginner | machine | ✓ | treadmill walk, incline walk |
| stationary_bike | Stationary Bike | beginner | machine | ✓ | bike, cycling, spin bike |
| rower | Rowing Machine | intermediate | machine | ✓ | row erg, erg, concept2 |
| elliptical | Elliptical | beginner | machine | ✓ | cross trainer |
| kb_circuit | Kettlebell Conditioning Circuit | advanced | kettlebell | ✗ | kb circuit, kettlebell complex |

---

## Open questions — RESOLVED (2026-06-20)

1. **Equipment slug standardization** — ✅ standardize on singular (`dumbbell`, `cable`, `machine`, `band`, `kettlebell`). P1-C maps old plural slugs over.
2. **Arms placement** — ✅ dedicated `arms` category (added to schema CHECK; section 3 above).
3. **glp_flag calls** — ✅ agreed as marked (heavy spinal-load barbell work + high-skill/fall-risk moves flagged ✗).
4. **Conditioning scope** — ✅ keep the 5 as engine-referenceable stubs; deeper cardio is Phase 2.
5. **Coverage gaps** — ✅ list approved as-is; expansions after user feedback.

Total candidates: **72** (25 carried over from v1's `engine/exercises.js` + mobility session, 47 new). By category: push 13, pull 9, arms 4, lower 23, core 8, carry 3, mobility 7, conditioning 5. **Vetted & locked 2026-06-20** → seeded in `backend/migrations/013_seed_movements.sql`.
