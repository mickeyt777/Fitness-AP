"use client";
// ^ This tells Next.js to run this file in the browser (not on the server).
//   We need that because we use React state (useState) for form data.

import { useState } from "react";
import Link from "next/link";
import { generatePlan, generateMacros } from "@/lib/workout-engine";
import type { WorkoutPlan, MacroTargets, WorkoutSession } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
// TYPES — what data we're collecting. TypeScript checks these for typos.
// ────────────────────────────────────────────────────────────────────────────
type Sex = "" | "male" | "female" | "other";
type GlpDrug =
  | ""
  | "semaglutide"
  | "tirzepatide"
  | "liraglutide"
  | "retatrutide"
  | "compounded_semaglutide"
  | "compounded_tirzepatide"
  | "none";
type Experience = "" | "none" | "occasional" | "1-3yr" | "3plus";
type Equipment = "" | "bodyweight" | "dumbbells" | "full_gym";
type Goal =
  | ""
  | "preserve_muscle"
  | "build_in_deficit"
  | "recomp_at_maintenance"
  | "general_fitness";

interface Profile {
  // Step 1 — Basics
  sex: Sex;
  age: string;
  heightFt: string;
  heightIn: string;
  weightLb: string;
  // Step 2 — Measurements (all optional but encouraged)
  waistIn: string;
  hipIn: string;
  chestIn: string;
  armIn: string;
  thighIn: string;
  // Step 3 — GLP info
  glpDrug: GlpDrug;
  glpDoseMg: string;
  glpInjectionDay: string;
  glpStartDate: string;
  // Step 4 — Training
  experience: Experience;
  daysPerWeek: string;
  equipment: Equipment;
  injuries: string;
  // Step 5 — Goals
  primaryGoal: Goal;
  targetWeightLb: string;
  goalNotes: string;
}

const EMPTY_PROFILE: Profile = {
  sex: "",
  age: "",
  heightFt: "",
  heightIn: "",
  weightLb: "",
  waistIn: "",
  hipIn: "",
  chestIn: "",
  armIn: "",
  thighIn: "",
  glpDrug: "",
  glpDoseMg: "",
  glpInjectionDay: "",
  glpStartDate: "",
  experience: "",
  daysPerWeek: "",
  equipment: "",
  injuries: "",
  primaryGoal: "",
  targetWeightLb: "",
  goalNotes: "",
};

const STEPS = [
  { id: 1, label: "About you" },
  { id: 2, label: "Measurements" },
  { id: 3, label: "Your GLP" },
  { id: 4, label: "Training" },
  { id: 5, label: "Goals" },
  { id: 6, label: "Review" },
];

// ────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Profile>(EMPTY_PROFILE);
  const [submitted, setSubmitted] = useState(false);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [macros, setMacros] = useState<MacroTargets | null>(null);

  // Tiny helper: update one field at a time.
  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  // Required-field check per step. Add/remove keys to change required fields.
  function canAdvance(): boolean {
    if (step === 1) return !!data.sex && !!data.age && !!data.heightFt && !!data.weightLb;
    if (step === 2) return true; // measurements are optional
    if (step === 3) return !!data.glpDrug;
    if (step === 4) return !!data.experience && !!data.daysPerWeek && !!data.equipment;
    if (step === 5) return !!data.primaryGoal;
    return true;
  }

  function next() {
    if (!canAdvance()) return;
    setStep((s) => Math.min(s + 1, STEPS.length));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 1));
  }
  function submit() {
    // Run the rules engine over the profile. Pure functions, no async needed.
    const generatedPlan = generatePlan(data);
    const generatedMacros = generateMacros(data);
    console.log("Profile:", data);
    console.log("Plan:", generatedPlan);
    console.log("Macros:", generatedMacros);
    setPlan(generatedPlan);
    setMacros(generatedMacros);
    setSubmitted(true);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SUCCESS SCREEN — shows the generated plan + macros
  // ──────────────────────────────────────────────────────────────────────────
  if (submitted && plan && macros) {
    return (
      <main className="min-h-screen bg-[#0b1015] text-white">
        <div className="max-w-3xl mx-auto px-6 py-12">
          {/* Header */}
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2">
            Your starter plan
          </h1>
          <p className="text-slate-400 mb-10">
            <span className="text-teal-400 font-semibold">{plan.splitName}</span>{" "}
            · calibrated to your stats, drug, and goal.
          </p>

          {/* Macros card */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold mb-1">Daily macros</h2>
            <p className="text-xs text-slate-500 mb-5">
              Protein first. Don&apos;t go below the calorie floor.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <MacroStat label="Calories" value={macros.calories} unit="kcal" />
              <MacroStat
                label="Protein"
                value={macros.proteinG}
                unit="g"
                emphasize
              />
              <MacroStat label="Fat" value={macros.fatG} unit="g" />
              <MacroStat label="Carbs" value={macros.carbsG} unit="g" />
            </div>
            <ul className="space-y-1.5 mt-4">
              {macros.notes.map((n, i) => (
                <li
                  key={i}
                  className="text-xs text-slate-400 flex gap-2 leading-relaxed"
                >
                  <span className="text-teal-400 shrink-0">·</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-slate-600 mt-4">
              BMR {macros.bmr} · TDEE {macros.tdee} · macro math:
              Mifflin-St Jeor, conservative for GLP.
            </p>
          </section>

          {/* Sessions */}
          <h2 className="text-xl font-bold mb-4">Your week</h2>
          <div className="space-y-4 mb-8">
            {plan.sessions.map((s, i) => (
              <SessionCard key={i} session={s} />
            ))}
          </div>

          {/* Coach notes */}
          <section className="bg-teal-400/5 border border-teal-400/20 rounded-xl p-5 mb-10">
            <h3 className="text-sm font-semibold mb-3 text-teal-300 uppercase tracking-wider">
              Coach notes
            </h3>
            <ul className="space-y-2.5">
              {plan.notes.map((n, i) => (
                <li
                  key={i}
                  className="text-sm text-slate-200 flex gap-2.5 leading-relaxed"
                >
                  <span className="text-teal-400 shrink-0">→</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Disclaimer */}
          <p className="text-xs text-slate-600 mb-8 leading-relaxed">
            <strong className="text-slate-500">Disclaimer:</strong> This is a
            fitness and nutrition coaching tool, not medical advice. Talk to
            your prescriber before starting any new exercise or nutrition program,
            especially while taking GLP-1 medications.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                setData(EMPTY_PROFILE);
                setStep(1);
                setSubmitted(false);
                setPlan(null);
                setMacros(null);
              }}
              className="border border-slate-600 text-slate-200 font-medium px-5 py-3 rounded-lg hover:border-slate-400 transition"
            >
              Start over
            </button>
            <Link
              href="/"
              className="bg-teal-400 text-slate-900 font-bold px-5 py-3 rounded-lg hover:bg-teal-300 transition"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MAIN FORM
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0b1015] text-white">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Top nav row */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-sm text-slate-400 hover:text-slate-200">
            ← Back
          </Link>
          <div className="text-xs text-slate-500">
            Step {step} of {STEPS.length}
          </div>
        </div>

        {/* Progress bar */}
        <ProgressBar step={step} />

        {/* Step heading */}
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-8 mb-2">
          {stepTitle(step)}
        </h1>
        <p className="text-slate-400 mb-8">{stepBlurb(step)}</p>

        {/* Step body */}
        {step === 1 && <StepBasics data={data} update={update} />}
        {step === 2 && <StepMeasurements data={data} update={update} />}
        {step === 3 && <StepGlp data={data} update={update} />}
        {step === 4 && <StepTraining data={data} update={update} />}
        {step === 5 && <StepGoals data={data} update={update} />}
        {step === 6 && <StepReview data={data} />}

        {/* Navigation buttons */}
        <div className="mt-12 flex items-center justify-between border-t border-slate-800 pt-6">
          <button
            onClick={back}
            disabled={step === 1}
            className="px-5 py-3 text-slate-300 font-medium rounded-lg hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            Back
          </button>
          {step < STEPS.length ? (
            <button
              onClick={next}
              disabled={!canAdvance()}
              className="bg-teal-400 text-slate-900 font-bold px-6 py-3 rounded-lg hover:bg-teal-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={submit}
              className="bg-teal-400 text-slate-900 font-bold px-6 py-3 rounded-lg hover:bg-teal-300 transition"
            >
              Generate my plan ✓
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP HEADERS
// ────────────────────────────────────────────────────────────────────────────
function stepTitle(s: number) {
  return ["", "About you", "Measurements", "Your GLP", "Training", "Goals", "Review & generate"][s];
}
function stepBlurb(s: number) {
  return [
    "",
    "The basics — we use these to calibrate everything else.",
    "Optional but strongly recommended. Measurements are how we'll know if you're holding muscle.",
    "Which drug, dose, and injection day. This shapes your training week.",
    "What you can realistically train.",
    "What you're working toward.",
    "Confirm everything, and we'll build your first plan.",
  ][s];
}

// ────────────────────────────────────────────────────────────────────────────
// PROGRESS BAR
// ────────────────────────────────────────────────────────────────────────────
function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s) => (
        <div
          key={s.id}
          className={`h-1.5 flex-1 rounded-full transition ${
            s.id <= step ? "bg-teal-400" : "bg-slate-800"
          }`}
        />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// REUSABLE INPUTS
// ────────────────────────────────────────────────────────────────────────────
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <label className="block text-sm font-medium text-slate-200 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1.5">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-900 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-3 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition"
      />
      {suffix && (
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
          {suffix}
        </span>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder = "Select...",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function RadioCards({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; sub?: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            type="button"
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`text-left px-4 py-3 rounded-lg border transition ${
              selected
                ? "border-teal-400 bg-teal-400/10"
                : "border-slate-700 bg-slate-900 hover:border-slate-500"
            }`}
          >
            <div className="font-medium text-white">{o.label}</div>
            {o.sub && <div className="text-xs text-slate-400 mt-0.5">{o.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 1 — BASICS
// ────────────────────────────────────────────────────────────────────────────
function StepBasics({
  data,
  update,
}: {
  data: Profile;
  update: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
}) {
  return (
    <>
      <Field label="Sex">
        <RadioCards
          value={data.sex}
          onChange={(v) => update("sex", v as Sex)}
          options={[
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
            { value: "other", label: "Other / prefer not to say" },
          ]}
        />
      </Field>

      <Field label="Age">
        <TextInput
          type="number"
          value={data.age}
          onChange={(v) => update("age", v)}
          placeholder="e.g. 42"
          suffix="years"
        />
      </Field>

      <Field label="Height">
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            type="number"
            value={data.heightFt}
            onChange={(v) => update("heightFt", v)}
            placeholder="5"
            suffix="ft"
          />
          <TextInput
            type="number"
            value={data.heightIn}
            onChange={(v) => update("heightIn", v)}
            placeholder="9"
            suffix="in"
          />
        </div>
      </Field>

      <Field label="Current weight">
        <TextInput
          type="number"
          value={data.weightLb}
          onChange={(v) => update("weightLb", v)}
          placeholder="e.g. 185"
          suffix="lb"
        />
      </Field>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 2 — MEASUREMENTS
// ────────────────────────────────────────────────────────────────────────────
function StepMeasurements({
  data,
  update,
}: {
  data: Profile;
  update: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
}) {
  return (
    <>
      <div className="bg-teal-400/5 border border-teal-400/20 rounded-lg p-4 mb-6">
        <p className="text-sm text-slate-300">
          <span className="text-teal-400 font-semibold">Why this matters:</span>{" "}
          On a GLP, the scale lies. These are how we&apos;ll show you the difference
          between losing fat (waist shrinks) and losing muscle (limbs shrink too).
        </p>
      </div>

      <Field label="Waist" hint="At the narrowest point, usually 1 inch above the belly button.">
        <TextInput
          type="number"
          value={data.waistIn}
          onChange={(v) => update("waistIn", v)}
          placeholder="e.g. 36"
          suffix="in"
        />
      </Field>

      <Field label="Hip" hint="Widest point of the hips/glutes.">
        <TextInput
          type="number"
          value={data.hipIn}
          onChange={(v) => update("hipIn", v)}
          placeholder="e.g. 40"
          suffix="in"
        />
      </Field>

      <Field label="Chest" hint="At nipple line, arms relaxed.">
        <TextInput
          type="number"
          value={data.chestIn}
          onChange={(v) => update("chestIn", v)}
          placeholder="e.g. 40"
          suffix="in"
        />
      </Field>

      <Field label="Dominant arm" hint="Flexed bicep, at peak.">
        <TextInput
          type="number"
          value={data.armIn}
          onChange={(v) => update("armIn", v)}
          placeholder="e.g. 13.5"
          suffix="in"
        />
      </Field>

      <Field label="Dominant thigh" hint="Largest part of the upper thigh.">
        <TextInput
          type="number"
          value={data.thighIn}
          onChange={(v) => update("thighIn", v)}
          placeholder="e.g. 22"
          suffix="in"
        />
      </Field>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 3 — GLP INFO
// ────────────────────────────────────────────────────────────────────────────
function StepGlp({
  data,
  update,
}: {
  data: Profile;
  update: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
}) {
  return (
    <>
      <Field label="Which drug are you on?">
        <RadioCards
          value={data.glpDrug}
          onChange={(v) => update("glpDrug", v as GlpDrug)}
          options={[
            { value: "semaglutide", label: "Semaglutide", sub: "Wegovy, Ozempic" },
            { value: "tirzepatide", label: "Tirzepatide", sub: "Zepbound, Mounjaro" },
            { value: "liraglutide", label: "Liraglutide", sub: "Saxenda (daily)" },
            { value: "retatrutide", label: "Retatrutide", sub: "Triple agonist (research)" },
            {
              value: "compounded_semaglutide",
              label: "Compounded semaglutide",
              sub: "From a compounding pharmacy",
            },
            {
              value: "compounded_tirzepatide",
              label: "Compounded tirzepatide",
              sub: "From a compounding pharmacy",
            },
            { value: "none", label: "Not on a GLP currently", sub: "Just exploring the app" },
          ]}
        />
      </Field>

      <Field label="Current dose" hint="In milligrams (mg). Skip if unsure.">
        <TextInput
          type="number"
          value={data.glpDoseMg}
          onChange={(v) => update("glpDoseMg", v)}
          placeholder="e.g. 2.5"
          suffix="mg"
        />
      </Field>

      <Field label="Which day do you inject?" hint="So we can plan your toughest workouts when you feel best.">
        <Select
          value={data.glpInjectionDay}
          onChange={(v) => update("glpInjectionDay", v)}
          options={[
            { value: "monday", label: "Monday" },
            { value: "tuesday", label: "Tuesday" },
            { value: "wednesday", label: "Wednesday" },
            { value: "thursday", label: "Thursday" },
            { value: "friday", label: "Friday" },
            { value: "saturday", label: "Saturday" },
            { value: "sunday", label: "Sunday" },
            { value: "n/a", label: "Daily / not applicable" },
          ]}
        />
      </Field>

      <Field label="When did you start?" hint="Approximate is fine.">
        <TextInput
          type="date"
          value={data.glpStartDate}
          onChange={(v) => update("glpStartDate", v)}
        />
      </Field>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mt-6 text-xs text-slate-400 leading-relaxed">
        <strong className="text-slate-300">Privacy note:</strong> We use this only to
        calibrate your training and nutrition. It&apos;s never shared and you can delete
        your account anytime.
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 4 — TRAINING
// ────────────────────────────────────────────────────────────────────────────
function StepTraining({
  data,
  update,
}: {
  data: Profile;
  update: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
}) {
  return (
    <>
      <Field label="Resistance training experience">
        <RadioCards
          value={data.experience}
          onChange={(v) => update("experience", v as Experience)}
          options={[
            { value: "none", label: "Never lifted weights", sub: "We'll start from zero, safely." },
            { value: "occasional", label: "Occasional / casual", sub: "Some prior gym time, nothing structured." },
            { value: "1-3yr", label: "1–3 years consistent" },
            { value: "3plus", label: "3+ years serious training" },
          ]}
        />
      </Field>

      <Field label="How many days per week can you train?" hint="Be realistic. Two consistent days beats four flaky days.">
        <RadioCards
          value={data.daysPerWeek}
          onChange={(v) => update("daysPerWeek", v)}
          options={[
            { value: "2", label: "2 days" },
            { value: "3", label: "3 days" },
            { value: "4", label: "4 days" },
          ]}
        />
      </Field>

      <Field label="What equipment do you have?">
        <RadioCards
          value={data.equipment}
          onChange={(v) => update("equipment", v as Equipment)}
          options={[
            { value: "bodyweight", label: "Bodyweight only", sub: "Plus maybe a couple of bands." },
            { value: "dumbbells", label: "Dumbbells at home", sub: "Adjustable or a few pairs." },
            { value: "full_gym", label: "Full gym access", sub: "Barbells, machines, the works." },
          ]}
        />
      </Field>

      <Field label="Anything to work around?" hint="Old injuries, surgeries, joints to be careful with.">
        <TextInput
          value={data.injuries}
          onChange={(v) => update("injuries", v)}
          placeholder="e.g. left knee, lower back"
        />
      </Field>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 5 — GOALS
// ────────────────────────────────────────────────────────────────────────────
function StepGoals({
  data,
  update,
}: {
  data: Profile;
  update: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
}) {
  return (
    <>
      <Field label="What's the goal?">
        <RadioCards
          value={data.primaryGoal}
          onChange={(v) => update("primaryGoal", v as Goal)}
          options={[
            {
              value: "preserve_muscle",
              label: "Preserve muscle while the drug works",
              sub: "Most common — don't lose the muscle with the fat.",
            },
            {
              value: "build_in_deficit",
              label: "Actually build muscle in a deficit",
              sub: "Aggressive — possible for newer lifters, harder for experienced ones.",
            },
            {
              value: "recomp_at_maintenance",
              label: "Recomp at maintenance",
              sub: "I've hit my goal weight, now reshape.",
            },
            {
              value: "general_fitness",
              label: "General fitness and feeling strong",
              sub: "Less about the mirror, more about energy and capability.",
            },
          ]}
        />
      </Field>

      <Field label="Target weight (optional)" hint="Skip if you're more focused on how you look than what the scale says — which honestly, you should be.">
        <TextInput
          type="number"
          value={data.targetWeightLb}
          onChange={(v) => update("targetWeightLb", v)}
          placeholder="e.g. 160"
          suffix="lb"
        />
      </Field>

      <Field label="Anything else we should know?" hint="The physique you're working toward, time pressure, anything that'll shape the plan.">
        <TextInput
          value={data.goalNotes}
          onChange={(v) => update("goalNotes", v)}
          placeholder="Optional notes"
        />
      </Field>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 6 — REVIEW
// ────────────────────────────────────────────────────────────────────────────
function StepReview({ data }: { data: Profile }) {
  return (
    <div className="space-y-3">
      <ReviewRow label="Sex" value={data.sex || "—"} />
      <ReviewRow label="Age" value={data.age ? `${data.age} years` : "—"} />
      <ReviewRow
        label="Height"
        value={
          data.heightFt
            ? `${data.heightFt} ft ${data.heightIn || 0} in`
            : "—"
        }
      />
      <ReviewRow
        label="Current weight"
        value={data.weightLb ? `${data.weightLb} lb` : "—"}
      />
      <ReviewRow
        label="Measurements"
        value={
          [
            data.waistIn && `waist ${data.waistIn}"`,
            data.hipIn && `hip ${data.hipIn}"`,
            data.chestIn && `chest ${data.chestIn}"`,
            data.armIn && `arm ${data.armIn}"`,
            data.thighIn && `thigh ${data.thighIn}"`,
          ]
            .filter(Boolean)
            .join(" · ") || "Skipped"
        }
      />
      <ReviewRow
        label="GLP drug"
        value={
          data.glpDrug
            ? data.glpDrug.replace(/_/g, " ") +
              (data.glpDoseMg ? ` (${data.glpDoseMg} mg)` : "")
            : "—"
        }
      />
      <ReviewRow
        label="Injection day"
        value={data.glpInjectionDay || "—"}
      />
      <ReviewRow
        label="Training"
        value={
          data.experience
            ? `${data.experience} · ${data.daysPerWeek} days/wk · ${data.equipment.replace(/_/g, " ")}`
            : "—"
        }
      />
      <ReviewRow label="Injuries" value={data.injuries || "None noted"} />
      <ReviewRow
        label="Primary goal"
        value={data.primaryGoal.replace(/_/g, " ") || "—"}
      />
      <ReviewRow
        label="Target weight"
        value={data.targetWeightLb ? `${data.targetWeightLb} lb` : "—"}
      />
      <ReviewRow label="Notes" value={data.goalNotes || "—"} />
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between border-b border-slate-800 pb-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-200 text-right max-w-[60%] capitalize">{value}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUCCESS-SCREEN COMPONENTS
// ────────────────────────────────────────────────────────────────────────────
function MacroStat({
  label,
  value,
  unit,
  emphasize,
}: {
  label: string;
  value: number;
  unit: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 border ${
        emphasize
          ? "bg-teal-400/10 border-teal-400/30"
          : "bg-slate-950 border-slate-800"
      }`}
    >
      <div className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1">
        <span
          className={`text-2xl font-extrabold tracking-tight ${
            emphasize ? "text-teal-300" : "text-white"
          }`}
        >
          {value}
        </span>
        <span className="text-xs text-slate-500 ml-1">{unit}</span>
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: WorkoutSession }) {
  const intensityColor =
    session.intensity === "light"
      ? "text-amber-300 bg-amber-300/10 border-amber-300/30"
      : "text-teal-300 bg-teal-400/10 border-teal-400/30";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            {session.dayLabel}
          </div>
          <h3 className="text-lg font-bold text-white mt-0.5">
            {session.templateName}
          </h3>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full border ${intensityColor}`}
        >
          {session.intensity}
        </span>
      </div>

      <div className="mt-4 divide-y divide-slate-800">
        {session.exercises.map((p, i) => (
          <div key={i} className="py-3 flex items-start gap-3">
            <div className="text-xs text-slate-600 font-mono mt-0.5 w-6 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white">
                {p.exercise.name}
              </div>
              {p.exercise.notes && (
                <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {p.exercise.notes}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold text-teal-300 tabular-nums">
                {p.sets} × {p.repRange}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">
                {p.targetRpe}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
