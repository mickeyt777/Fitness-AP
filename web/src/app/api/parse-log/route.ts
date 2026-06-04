// ────────────────────────────────────────────────────────────────────────────
// POST /api/parse-log
//
// Server-side endpoint. Receives a user's natural-language workout message
// plus today's planned session. Calls Claude Haiku to extract structured
// sets, and returns clean JSON to the browser.
//
// DESIGN NOTE — context discipline:
// The body we send to Claude is constant-sized regardless of how long the
// user has been on the app. We send TODAY's planned exercises (a handful of
// names + patterns) and the user's current message. We NEVER send historical
// logs, prior weeks, or the full exercise library. That's the discipline
// that prevents the "context bloat after 2 weeks" failure mode. Historical
// matching, PRs, and trends are done by the database, not the LLM.
// ────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { ParsedLog } from "@/lib/types";

const SYSTEM_PROMPT = `You are a workout-log parser for a fitness app built for people on GLP-1 medications. Your only job is to convert the user's natural-language workout description into structured JSON.

You will receive:
- The user's PLANNED workout session for today (exercise names + movement patterns).
- The user's free-text message describing what they did.

Rules:

1. EXERCISE MATCHING.
   - When the user mentions an exercise that appears in today's plan, set "matched_to" to the EXACT planned exercise name. Set "unmatched_name" to null.
   - When the user mentions a specific MACHINE by brand name (e.g., "Free Motion Epic", "Hammer Strength row", "Cybex leg press", "Precor lat pulldown"), recognize its movement pattern and match it to the planned exercise of that pattern. The brand/machine name goes into "notes".
     Examples:
       * "Free Motion Epic pulldown" → matched_to: "Lat pulldown", notes: "Free Motion Epic machine"
       * "Hammer Strength chest press" → matched_to: "Dumbbell bench press" or "Barbell bench press" (whichever is in plan), notes: "Hammer Strength chest press"
       * "Cybex leg press" → matched_to whichever squat-pattern exercise is in the plan, notes: "Cybex leg press"
   - If the user did something genuinely outside the plan and outside common pattern-equivalents (e.g., bicep curls when plan has no bicep work), set matched_to: null and unmatched_name: "Bicep curl".

2. SETS AND REPS.
   - "3x8" or "3 sets of 8" or "3 by 8" → sets: 3, reps: 8.
   - If the user reports different reps per set (e.g., "8, 8, 6"), return one entry per set with sets: 1, reps: <that set's reps>.
   - "Same as last time" or any historical reference → set matched_to and notes, but leave sets/reps/weight at 0 and add a warning. We'll resolve those server-side.

3. WEIGHT.
   - Convert kg → lb (multiply by 2.205, round to nearest 0.5). Add "converted from <X> kg" to notes.
   - Bodyweight or no weight mentioned → weight_lb: 0.
   - Stack settings without lb units ("stack 10", "plate 15") — store the number in weight_lb and put the unit context in notes ("stack setting").

4. RPE INFERENCE (if user didn't state RPE).
   - "easy", "no problem", "felt great" → 6.
   - "solid", "felt good" → 7.
   - "tough", "hard", "challenging" → 8.
   - "barely made it", "grindy", "almost failed" → 9.
   - "to failure", "failed last rep" → 10.
   - No descriptor → 7 (default) + add a warning "RPE inferred as 7".

5. SIDE EFFECTS.
   - Mentions of nausea, fatigue, GI symptoms, joint pain, or skipping the rest of the workout go into "side_effects" as a clean string.

6. UNCERTAINTY.
   - If you couldn't confidently parse anything, return exercises: [] and add a warning explaining what was ambiguous.

OUTPUT FORMAT — return ONLY valid JSON, no prose, no markdown fences:
{
  "exercises": [
    {
      "matched_to": string | null,
      "unmatched_name": string | null,
      "user_text": string,
      "sets": number,
      "reps": number,
      "weight_lb": number,
      "rpe": number,
      "notes": string | null
    }
  ],
  "side_effects": string | null,
  "warnings": string[]
}`;

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ANTHROPIC_API_KEY is not set. Add it to web/.env.local and restart the dev server.",
      },
      { status: 500 }
    );
  }

  let body: {
    message?: string;
    plannedSession?: {
      templateName?: string;
      exercises?: { name: string; pattern: string }[];
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const message = (body.message || "").trim();
  if (!message) {
    return NextResponse.json(
      { ok: false, error: "Empty message" },
      { status: 400 }
    );
  }
  // Cap message length so we don't get griefed.
  if (message.length > 1500) {
    return NextResponse.json(
      { ok: false, error: "Message too long (max 1500 chars)" },
      { status: 400 }
    );
  }

  const plannedExercises = body.plannedSession?.exercises ?? [];
  const plannedBlock = plannedExercises.length
    ? plannedExercises
        .map((e, i) => `${i + 1}. ${e.name} (pattern: ${e.pattern})`)
        .join("\n")
    : "(no planned exercises supplied)";

  const userPrompt = `PLANNED SESSION TODAY${
    body.plannedSession?.templateName
      ? ` — "${body.plannedSession.templateName}"`
      : ""
  }:
${plannedBlock}

USER MESSAGE:
${message}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let raw = "";
  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = resp.content[0];
    raw = block && block.type === "text" ? block.text : "";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `Anthropic API error: ${msg}` },
      { status: 500 }
    );
  }

  let parsed: ParsedLog;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Couldn't parse the model's response as JSON.",
        raw,
      },
      { status: 500 }
    );
  }

  // Minimal shape check — surface a friendly error instead of a crash.
  if (!parsed || !Array.isArray(parsed.exercises)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Model response had unexpected shape.",
        raw,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, parsed });
}
