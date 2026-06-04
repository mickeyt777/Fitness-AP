// ────────────────────────────────────────────────────────────────────────────
// Rules engine — takes a Profile and produces a starter WorkoutPlan and
// MacroTargets. Pure functions, no React, no async. The same code will run
// on a server later when we wire up Supabase.
// ────────────────────────────────────────────────────────────────────────────
import type {
  Profile,
  Exercise,
  MovementPattern,
  EquipmentTag,
  PrescribedExercise,
  WorkoutSession,
  WorkoutPlan,
  MacroTargets,
} from "./types";
import { EXERCISES } from "./exercises";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function maxDifficulty(exp: Profile["experience"]): 1 | 2 | 3 {
  if (exp === "3plus") return 3;
  if (exp === "1-3yr") return 2;
  return 1; // none + occasional + "" → beginner-only
}

function allowedEquipment(eq: Profile["equipment"]): EquipmentTag[] {
  if (eq === "full_gym") {
    return ["bodyweight", "dumbbells", "barbell", "bench", "pullup_bar", "cable", "machine"];
  }
  if (eq === "dumbbells") {
    return ["bodyweight", "dumbbells", "bench"];
  }
  return ["bodyweight"]; // bodyweight or unset
}

function isBeginner(exp: Profile["experience"]): boolean {
  return exp === "" || exp === "none" || exp === "occasional";
}

/** Pick one exercise that matches the pattern, respecting equipment and
 *  difficulty. Avoids re-using anything in `picked`. Prefers higher difficulty
 *  (i.e. higher-quality stimulus) within what the user is allowed. */
function pickExercise(
  pattern: MovementPattern,
  profile: Profile,
  picked: Set<string>
): Exercise | null {
  const allowed = allowedEquipment(profile.equipment);
  const maxDiff = maxDifficulty(profile.experience);

  const candidates = EXERCISES
    .filter((e) => e.pattern === pattern)
    .filter((e) => e.difficulty <= maxDiff)
    .filter((e) => e.equipment.every((req) => allowed.includes(req)))
    .filter((e) => !picked.has(e.id))
    .sort((a, b) => b.difficulty - a.difficulty);

  return candidates[0] ?? null;
}

function prescribe(
  exercise: Exercise,
  profile: Profile,
  isLighter: boolean
): PrescribedExercise {
  const beginner = isBeginner(profile.experience);

  // Base sets: 3 for everyone, 2 for true beginners.
  let sets = beginner ? 2 : 3;
  // Lighter session (day after injection) drops one set across the board.
  if (isLighter) sets = Math.max(1, sets - 1);

  // Rep range and RPE based on goal.
  let repRange: string;
  let targetRpe: string;

  if (profile.primaryGoal === "build_in_deficit") {
    repRange = "6–10";
    targetRpe = "RPE 7–8";
  } else if (profile.primaryGoal === "general_fitness") {
    repRange = "10–15";
    targetRpe = "RPE 6–7";
  } else {
    // preserve_muscle, recomp, or unset → hypertrophy default
    repRange = "8–12";
    targetRpe = "RPE 7–8";
  }

  // Beginners cap at RPE 7 regardless.
  if (beginner) targetRpe = "RPE 7";

  // Core/plank uses time, not reps.
  if (exercise.pattern === "core" && exercise.id === "plank") {
    repRange = "30–60 sec";
  }

  return { exercise, sets, repRange, targetRpe };
}

// ────────────────────────────────────────────────────────────────────────────
// Session templates — which movement patterns each session emphasizes.
// ────────────────────────────────────────────────────────────────────────────
const TEMPLATES: Record<string, MovementPattern[]> = {
  "Full Body A": ["squat", "horizontal_push", "horizontal_pull", "core"],
  "Full Body B": ["hinge", "vertical_push", "vertical_pull", "single_leg"],
  "Full Body C": ["single_leg", "horizontal_push", "horizontal_pull", "core"],
  "Upper A": ["horizontal_push", "vertical_pull", "vertical_push", "horizontal_pull", "core"],
  "Lower A": ["squat", "hinge", "single_leg", "core"],
  "Upper B": ["vertical_push", "horizontal_pull", "horizontal_push", "vertical_pull", "core"],
  "Lower B": ["hinge", "single_leg", "squat", "core"],
};

function buildSession(
  dayLabel: string,
  templateName: string,
  profile: Profile,
  isLighter: boolean
): WorkoutSession {
  const patterns = TEMPLATES[templateName];
  const picked = new Set<string>();
  const exercises: PrescribedExercise[] = [];

  for (const pattern of patterns) {
    const ex = pickExercise(pattern, profile, picked);
    if (ex) {
      picked.add(ex.id);
      exercises.push(prescribe(ex, profile, isLighter));
    }
  }

  return {
    dayLabel,
    templateName,
    intensity: isLighter ? "light" : "moderate",
    exercises,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Public: generatePlan
// ────────────────────────────────────────────────────────────────────────────
export function generatePlan(profile: Profile): WorkoutPlan {
  const days = parseInt(profile.daysPerWeek) || 3;

  let splitName: string;
  let templates: string[];

  if (days === 2) {
    splitName = "Full Body × 2";
    templates = ["Full Body A", "Full Body B"];
  } else if (days === 4) {
    splitName = "Upper / Lower × 4";
    templates = ["Upper A", "Lower A", "Upper B", "Lower B"];
  } else {
    splitName = "Full Body × 3";
    templates = ["Full Body A", "Full Body B", "Full Body C"];
  }

  // The final session is the "lighter" one — placed the day after injection.
  const sessions = templates.map((name, i) =>
    buildSession(`Day ${i + 1}`, name, profile, i === templates.length - 1)
  );

  // ── Plan-wide coach notes
  const notes: string[] = [];

  if (profile.glpInjectionDay && profile.glpInjectionDay !== "n/a") {
    const day =
      profile.glpInjectionDay.charAt(0).toUpperCase() +
      profile.glpInjectionDay.slice(1);
    notes.push(
      `Schedule Day ${sessions.length} (the lighter session) the day after your ${day} injection — that's typically when energy is lowest.`
    );
  }

  notes.push(
    "Use RPE. Leave reps in the tank on every set. Never train to failure on a GLP."
  );
  notes.push(
    "Add weight only when you finish two sessions in a row below the target RPE. Form first, weight second."
  );

  if (isBeginner(profile.experience)) {
    notes.push(
      "You're starting fresh. If a movement feels wrong, swap to a bodyweight or band version — we'd rather you build a habit than chase a number."
    );
  }

  if (profile.injuries && profile.injuries.trim()) {
    notes.push(
      `Work around: ${profile.injuries.trim()}. Skip or substitute any exercise that aggravates these areas.`
    );
  }

  if (profile.primaryGoal === "build_in_deficit") {
    notes.push(
      "Building muscle in a deficit is possible but slow. Hit protein hard and don't undersleep."
    );
  }

  return { splitName, sessions, notes };
}

// ────────────────────────────────────────────────────────────────────────────
// Public: generateMacros
// ────────────────────────────────────────────────────────────────────────────
export function generateMacros(profile: Profile): MacroTargets {
  const weightLb = parseFloat(profile.weightLb) || 0;
  const heightIn =
    (parseFloat(profile.heightFt) || 0) * 12 + (parseFloat(profile.heightIn) || 0);
  const age = parseFloat(profile.age) || 0;

  // Convert imperial → metric for Mifflin-St Jeor
  const kg = weightLb * 0.4536;
  const cm = heightIn * 2.54;

  // BMR (Mifflin-St Jeor)
  let bmr: number;
  if (profile.sex === "male") {
    bmr = 10 * kg + 6.25 * cm - 5 * age + 5;
  } else if (profile.sex === "female") {
    bmr = 10 * kg + 6.25 * cm - 5 * age - 161;
  } else {
    // Average of male/female formulas for "other" / unspecified
    bmr = 10 * kg + 6.25 * cm - 5 * age - 78;
  }
  bmr = Math.max(0, bmr);

  // Conservative TDEE multiplier. The drug already creates the deficit, so we
  // don't add a separate deficit on top — we're trying to PREVENT undereating.
  const tdee = bmr * 1.1;
  const calories = Math.round(tdee);

  // Protein: 1.2g per lb of target lean mass proxy. If a target weight is set,
  // use that; otherwise use current weight.
  const proteinTargetLb = parseFloat(profile.targetWeightLb) || weightLb;
  const proteinG = Math.round(proteinTargetLb * 1.2);

  // Fat floor: 0.3g per lb of current bodyweight (hormonal health).
  const fatG = Math.round(weightLb * 0.3);

  // Carbs fill the remainder. No upper bound — they're training fuel.
  const proteinCals = proteinG * 4;
  const fatCals = fatG * 9;
  const carbsG = Math.max(0, Math.round((calories - proteinCals - fatCals) / 4));

  const notes: string[] = [
    "Protein first, every day. It's the single biggest lever for keeping muscle.",
    "Calorie floor — don't go lower. Your drug is already creating your deficit.",
    "Carbs are training fuel. If you can eat more on lifting days, do.",
    "Calorie-efficient protein sources: whey isolate (~24g per 30g scoop), nonfat Greek yogurt (~17g per ¾ cup), egg whites, lean ground turkey, cottage cheese.",
  ];

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories,
    proteinG,
    fatG,
    carbsG,
    notes,
  };
}
