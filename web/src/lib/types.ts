// ────────────────────────────────────────────────────────────────────────────
// Shared types used by the onboarding form, the workout engine, and (later)
// the database. Keep this file as the single source of truth.
// ────────────────────────────────────────────────────────────────────────────

export type Sex = "" | "male" | "female" | "other";

export type GlpDrug =
  | ""
  | "semaglutide"
  | "tirzepatide"
  | "liraglutide"
  | "retatrutide"
  | "compounded_semaglutide"
  | "compounded_tirzepatide"
  | "none";

export type Experience = "" | "none" | "occasional" | "1-3yr" | "3plus";
export type Equipment = "" | "bodyweight" | "dumbbells" | "full_gym";
export type Goal =
  | ""
  | "preserve_muscle"
  | "build_in_deficit"
  | "recomp_at_maintenance"
  | "general_fitness";

export interface Profile {
  sex: Sex;
  age: string;
  heightFt: string;
  heightIn: string;
  weightLb: string;
  waistIn: string;
  hipIn: string;
  chestIn: string;
  armIn: string;
  thighIn: string;
  glpDrug: GlpDrug;
  glpDoseMg: string;
  glpInjectionDay: string;
  glpStartDate: string;
  experience: Experience;
  daysPerWeek: string;
  equipment: Equipment;
  injuries: string;
  primaryGoal: Goal;
  targetWeightLb: string;
  goalNotes: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Exercise library
// ────────────────────────────────────────────────────────────────────────────
export type MovementPattern =
  | "squat"
  | "hinge"
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "single_leg"
  | "core";

export type EquipmentTag =
  | "bodyweight"
  | "dumbbells"
  | "barbell"
  | "bench"
  | "pullup_bar"
  | "cable"
  | "machine";

export interface Exercise {
  id: string;
  name: string;
  pattern: MovementPattern;
  /** Required equipment — user must have ALL of these. */
  equipment: EquipmentTag[];
  /** 1 = beginner-safe, 2 = intermediate, 3 = advanced. */
  difficulty: 1 | 2 | 3;
  /** Brief technique cue shown on the plan. */
  notes?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Generated plan output
// ────────────────────────────────────────────────────────────────────────────
export interface PrescribedExercise {
  exercise: Exercise;
  sets: number;
  repRange: string; // e.g. "8–12"
  targetRpe: string; // e.g. "RPE 7–8"
}

export interface WorkoutSession {
  dayLabel: string; // e.g. "Day 1"
  templateName: string; // e.g. "Full Body A"
  intensity: "light" | "moderate" | "heavy";
  exercises: PrescribedExercise[];
}

export interface WorkoutPlan {
  splitName: string;
  sessions: WorkoutSession[];
  notes: string[];
}

export interface MacroTargets {
  bmr: number;
  tdee: number;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  notes: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Chat log parsing (LLM output)
// ────────────────────────────────────────────────────────────────────────────
export interface ParsedExerciseEntry {
  /** Matched to a planned exercise by name. Null if the user did something
   *  not in today's plan. */
  matched_to: string | null;
  /** If unmatched, a cleaned-up name for the exercise the user did. */
  unmatched_name: string | null;
  /** The raw substring of the user's message that referred to this exercise. */
  user_text: string;
  sets: number;
  reps: number;
  weight_lb: number;
  rpe: number;
  /** Specific machine name, kg-conversion note, any other context. */
  notes: string | null;
}

export interface ParsedLog {
  exercises: ParsedExerciseEntry[];
  /** Non-exercise notes mentioned by the user (nausea, fatigue, etc.). */
  side_effects: string | null;
  /** Parser uncertainty flags. */
  warnings: string[];
}
