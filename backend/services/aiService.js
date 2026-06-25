/**
 * aiService — Cloud LLM wrapper + parsing logic.
 *
 * Owns the Anthropic client, the callCloudLlm provider switch, both system
 * prompts, and the chat-parse response cleaning/fallback. Routes call
 * chatParse() / weeklyReport() and do nothing else.
 *
 * To add a real provider: set CLOUD_LLM_PROVIDER and ANTHROPIC_API_KEY in .env
 * and replace the stub in callCloudLlm().
 */

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { httpError } = require('../lib/httpError');
const env = require('../config/env');

// ── Anthropic client (lazy-initialised) ───────────────────────────────────
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

// ── Cloud LLM wrapper function ─────────────────────────────────────────────
async function callCloudLlm(systemPrompt, userMessage) {
  const provider = env.CLOUD_LLM_PROVIDER;

  if (!provider) {
    console.warn('[ai] CLOUD_LLM_PROVIDER not set — returning stub response');
    return '[STUB — set CLOUD_LLM_PROVIDER=anthropic in .env]';
  }

  if (provider === 'anthropic') {
    const client = getAnthropic();
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',  // fast + cheap for parsing
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    });
    return msg.content[0].text;
  }

  throw new Error(`Cloud LLM provider "${provider}" is not implemented. See routes/ai.js.`);
}

// POST /chat-parse
async function chatParse(raw_text) {
  if (!raw_text) throw httpError(400, 'raw_text is required');

  const systemPrompt = `
You are a fitness log parser. The user sends a plain-text description of their workout.
Your job is to extract structured data and respond with ONLY a raw JSON object — no markdown,
no code fences, no explanation, no extra text whatsoever. Just the JSON object itself.

For a strength/resistance workout, respond with exactly this shape:
{"type":"workout_log","sets":[{"exercise_name":"Goblet Squat","reps":8,"weight_kg":20.0,"rpe":7.5}],"confidence":0.95}

For a cardio / conditioning bout (running, walking, cycling, rowing, swimming, elliptical,
stair climber, hiking, etc.), respond with exactly this shape:
{"type":"cardio_log","cardio":{"modality":"stationary bike","duration_min":30,"intensity":"moderate","distance_m":null},"confidence":0.9}

Rules:
- Choose the type by the kind of activity:
  - "workout_log" when the user describes discrete resistance sets (reps / weight / RPE, e.g. "3 sets of goblet squats, 16kg").
  - "cardio_log" when the user describes a continuous endurance bout characterised by a duration or distance rather than sets/reps (e.g. "30 min stationary bike, moderate", "ran 5k easy", "rowed 20 minutes hard").
- workout_log: each set object must have exercise_name (string). reps, weight_kg, and rpe are optional numbers — omit if not mentioned. If multiple sets of the same exercise are described (e.g. "3 sets"), emit one object per set. weight_kg: convert lbs to kg if needed (1 lb = 0.4536 kg). If user says "16 kg", use 16.0.
- cardio_log: "cardio" must be an object with modality (string, the activity as spoken, e.g. "stationary bike", "outdoor run"). duration_min (number, minutes) and distance_m (number, metres — convert km/miles: 1 km = 1000 m, 1 mile = 1609.34 m) are optional — omit or use null if not stated. intensity must be one of "easy", "moderate", "hard", or null if not stated (map "light/relaxed"→easy, "moderate/steady"→moderate, "hard/intense/all-out"→hard).
- confidence: 0.0–1.0 reflecting how sure you are.
- If the message is NOT about exercise (e.g. food, side effects, unknown), use type "nutrition_log", "side_effect", or "unknown" as appropriate.

IMPORTANT: Output raw JSON only. No markdown. No \`\`\`. No prose.
  `.trim();

  const response = await callCloudLlm(systemPrompt, raw_text);
  console.log('[ai/chat-parse] raw Claude response:', response);

  // Strip markdown code fences if the model wrapped its JSON
  const cleaned = response
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_) {
    // Model returned non-JSON — log and fall back gracefully
    console.warn('[ai/chat-parse] JSON.parse failed on cleaned response:', cleaned);
    parsed = { type: 'unknown', raw: response, confidence: 0 };
  }

  return { parsed, source: 'cloud' };
}

// POST /weekly-report
async function weeklyReport(summary_data) {
  if (!summary_data) throw httpError(400, 'summary_data is required');

  const systemPrompt = `
You are a supportive personal trainer who specialises in clients on GLP-1 weight-loss drugs
(Ozempic, Wegovy, Mounjaro, Zepbound, etc.). You are writing a weekly progress summary.

Tone guidelines:
  - Warm, encouraging, zero-judgment. Never imply the drug is a shortcut.
  - Lead with the lean-mass proxy result (waist vs limb change), not scale weight.
  - Acknowledge their movement this week — daily steps trend and any cardio (in the
    "activity" data) — as part of the picture, but still lead with the lean-mass proxy.
    If there's no activity data, simply don't mention steps or cardio.
  - Name one specific, actionable focus for next week.
  - 3 short paragraphs, plain language. No bullet points.
  - Never be preachy or mention "willpower."
  `.trim();

  const userMessage = `Here is the user's week in numbers:\n${JSON.stringify(summary_data, null, 2)}\n\nWrite their weekly summary.`;

  const narrative = await callCloudLlm(systemPrompt, userMessage);

  return { narrative, source: 'cloud' };
}

module.exports = { chatParse, weeklyReport };
