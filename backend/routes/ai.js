/**
 * /ai routes — Cloud LLM wrapper
 *
 * This is the "single function" described in the v3 plan.
 * The iOS app calls this only when the on-device Foundation Models model
 * can't handle a task well enough — specifically:
 *   - Weekly narrative report generation
 *   - Chat parsing when the on-device model returns low confidence
 *
 * The provider is TBD. The wrapper function is what matters — swap the body
 * when you decide on a vendor. Right now it returns a stub response.
 *
 * To add a real provider:
 *   1. Set CLOUD_LLM_PROVIDER and CLOUD_LLM_API_KEY in your .env file.
 *   2. Replace the stub in callCloudLlm() below with the provider's SDK call.
 *
 * Routes:
 *   POST /ai/chat-parse     — parse a chat message (low-confidence fallback)
 *   POST /ai/weekly-report  — generate the LLM-written weekly narrative
 */

'use strict';

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { requireUser } = require('../middleware/requireUser');

const router = express.Router();

// ── Anthropic client (lazy-initialised) ───────────────────────────────────
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

// ── Cloud LLM wrapper function ─────────────────────────────────────────────

async function callCloudLlm(systemPrompt, userMessage) {
  const provider = process.env.CLOUD_LLM_PROVIDER;

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

// ── POST /ai/chat-parse ────────────────────────────────────────────────────

router.post('/chat-parse', requireUser, async (req, res, next) => {
  try {
    const { raw_text } = req.body;
    if (!raw_text) return res.status(400).json({ error: 'raw_text is required' });

    const systemPrompt = `
You are a fitness log parser. The user sends a plain-text description of their workout.
Your job is to extract structured data and respond with ONLY a raw JSON object — no markdown,
no code fences, no explanation, no extra text whatsoever. Just the JSON object itself.

For a workout log, respond with exactly this shape:
{"type":"workout_log","sets":[{"exercise_name":"Goblet Squat","reps":8,"weight_kg":20.0,"rpe":7.5}],"confidence":0.95}

Rules:
- "type" must be "workout_log" whenever the user describes exercise sets (even if phrased naturally like "today I did..." or "I just finished...").
- Each set object must have exercise_name (string). reps, weight_kg, and rpe are optional numbers — omit if not mentioned.
- If multiple sets of the same exercise are described (e.g. "3 sets"), emit one object per set.
- weight_kg: convert lbs to kg if needed (1 lb = 0.4536 kg). If user says "16 kg", use 16.0.
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

    return res.json({ parsed, source: 'cloud' });
  } catch (err) {
    next(err);
  }
});

// ── POST /ai/weekly-report ─────────────────────────────────────────────────

router.post('/weekly-report', requireUser, async (req, res, next) => {
  try {
    const { summary_data } = req.body;

    if (!summary_data) {
      return res.status(400).json({ error: 'summary_data is required' });
    }

    const systemPrompt = `
You are a supportive personal trainer who specialises in clients on GLP-1 weight-loss drugs
(Ozempic, Wegovy, Mounjaro, Zepbound, etc.). You are writing a weekly progress summary.

Tone guidelines:
  - Warm, encouraging, zero-judgment. Never imply the drug is a shortcut.
  - Lead with the lean-mass proxy result (waist vs limb change), not scale weight.
  - Name one specific, actionable focus for next week.
  - 3 short paragraphs, plain language. No bullet points.
  - Never be preachy or mention "willpower."
    `.trim();

    const userMessage = `Here is the user's week in numbers:\n${JSON.stringify(summary_data, null, 2)}\n\nWrite their weekly summary.`;

    const narrative = await callCloudLlm(systemPrompt, userMessage);

    return res.json({ narrative, source: 'cloud' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
