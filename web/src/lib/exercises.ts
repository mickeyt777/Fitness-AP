import type { Exercise } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Starter exercise library. Curated for GLP users: compound bias, beginner-
// safe regressions, full range of movement patterns. Expand later as needed.
// ────────────────────────────────────────────────────────────────────────────
export const EXERCISES: Exercise[] = [
  // SQUAT
  {
    id: "goblet_squat",
    name: "Goblet squat",
    pattern: "squat",
    equipment: ["dumbbells"],
    difficulty: 1,
    notes: "Hold one dumbbell at chest. Sit between your hips, knees track over toes.",
  },
  {
    id: "bodyweight_squat",
    name: "Bodyweight squat",
    pattern: "squat",
    equipment: ["bodyweight"],
    difficulty: 1,
    notes: "Hands forward for balance. Slow down on the way down (3 seconds).",
  },
  {
    id: "db_front_squat",
    name: "Dumbbell front squat",
    pattern: "squat",
    equipment: ["dumbbells"],
    difficulty: 2,
    notes: "Dumbbells racked at shoulders. Elbows high.",
  },
  {
    id: "barbell_back_squat",
    name: "Barbell back squat",
    pattern: "squat",
    equipment: ["barbell"],
    difficulty: 3,
    notes: "Brace, breathe, sit between your hips. Use a rack.",
  },

  // HINGE
  {
    id: "hip_hinge_bw",
    name: "Bodyweight hip hinge",
    pattern: "hinge",
    equipment: ["bodyweight"],
    difficulty: 1,
    notes: "Soft knees. Push hips back, hands slide down thighs. Feel the hamstrings.",
  },
  {
    id: "db_rdl",
    name: "Dumbbell Romanian deadlift",
    pattern: "hinge",
    equipment: ["dumbbells"],
    difficulty: 1,
    notes: "DBs in front of thighs. Hinge until you feel hamstrings stretch.",
  },
  {
    id: "barbell_rdl",
    name: "Barbell Romanian deadlift",
    pattern: "hinge",
    equipment: ["barbell"],
    difficulty: 3,
    notes: "Neutral spine, bar slides down legs.",
  },

  // HORIZONTAL PUSH
  {
    id: "incline_pushup",
    name: "Incline push-up",
    pattern: "horizontal_push",
    equipment: ["bodyweight"],
    difficulty: 1,
    notes: "Hands on a sturdy elevated surface. Lower until chest taps.",
  },
  {
    id: "db_bench",
    name: "Dumbbell bench press",
    pattern: "horizontal_push",
    equipment: ["dumbbells", "bench"],
    difficulty: 2,
    notes: "Slight elbow tuck. Lower under control.",
  },
  {
    id: "db_floor_press",
    name: "Dumbbell floor press",
    pattern: "horizontal_push",
    equipment: ["dumbbells"],
    difficulty: 1,
    notes: "On the floor, elbows touch ground at bottom. Easy on shoulders.",
  },
  {
    id: "barbell_bench",
    name: "Barbell bench press",
    pattern: "horizontal_push",
    equipment: ["barbell", "bench"],
    difficulty: 3,
  },

  // VERTICAL PUSH
  {
    id: "db_overhead",
    name: "Dumbbell shoulder press",
    pattern: "vertical_push",
    equipment: ["dumbbells"],
    difficulty: 1,
    notes: "Seated or standing. Press straight up, don't flare elbows.",
  },
  {
    id: "barbell_ohp",
    name: "Barbell overhead press",
    pattern: "vertical_push",
    equipment: ["barbell"],
    difficulty: 3,
  },

  // HORIZONTAL PULL
  {
    id: "db_row",
    name: "One-arm dumbbell row",
    pattern: "horizontal_pull",
    equipment: ["dumbbells"],
    difficulty: 1,
    notes: "Hand on bench or chair. Pull DB to hip, elbow back.",
  },
  {
    id: "inverted_row",
    name: "Inverted row",
    pattern: "horizontal_pull",
    equipment: ["bodyweight"],
    difficulty: 2,
    notes: "Under a sturdy bar or table edge. Chest to bar.",
  },
  {
    id: "cable_row",
    name: "Seated cable row",
    pattern: "horizontal_pull",
    equipment: ["cable"],
    difficulty: 1,
    notes: "Tall chest, pull to belly button, squeeze shoulder blades.",
  },

  // VERTICAL PULL
  {
    id: "lat_pulldown",
    name: "Lat pulldown",
    pattern: "vertical_pull",
    equipment: ["cable"],
    difficulty: 1,
    notes: "Wide grip, pull to upper chest, lead with elbows.",
  },
  {
    id: "assisted_pullup",
    name: "Assisted pull-up",
    pattern: "vertical_pull",
    equipment: ["pullup_bar"],
    difficulty: 2,
    notes: "Band looped around bar and one foot, or use an assist machine.",
  },
  {
    id: "band_pulldown",
    name: "Banded pull-down",
    pattern: "vertical_pull",
    equipment: ["bodyweight"],
    difficulty: 1,
    notes: "Anchor a band overhead. Pull down to chest, elbows wide.",
  },

  // SINGLE LEG
  {
    id: "split_squat_bw",
    name: "Split squat (bodyweight)",
    pattern: "single_leg",
    equipment: ["bodyweight"],
    difficulty: 1,
    notes: "One foot forward. Drop back knee toward floor. Hands on hips or rail for balance.",
  },
  {
    id: "db_reverse_lunge",
    name: "Dumbbell reverse lunge",
    pattern: "single_leg",
    equipment: ["dumbbells"],
    difficulty: 2,
    notes: "Step backward into the lunge — easier on the knees than forward.",
  },
  {
    id: "bulgarian",
    name: "Bulgarian split squat",
    pattern: "single_leg",
    equipment: ["dumbbells", "bench"],
    difficulty: 3,
    notes: "Back foot on bench. Front leg does the work.",
  },

  // CORE
  {
    id: "plank",
    name: "Plank",
    pattern: "core",
    equipment: ["bodyweight"],
    difficulty: 1,
    notes: "Squeeze glutes, ribs down. Hold 30–60 seconds per set instead of reps.",
  },
  {
    id: "dead_bug",
    name: "Dead bug",
    pattern: "core",
    equipment: ["bodyweight"],
    difficulty: 1,
    notes: "On your back, opposite arm and leg lower slowly. Ribs stay down.",
  },
  {
    id: "hanging_knee_raise",
    name: "Hanging knee raise",
    pattern: "core",
    equipment: ["pullup_bar"],
    difficulty: 2,
    notes: "Hang from a bar. Curl knees toward chest, slow on the way down.",
  },
];
