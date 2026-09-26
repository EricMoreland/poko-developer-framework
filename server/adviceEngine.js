/**
 * server/adviceEngine.js — Contextual Health Advice Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates specific, metric-grounded health advice for morning, midday, and
 * afternoon delivery slots. Uses Bob as the AI reasoning layer, with a curated
 * static fallback bank for offline/unavailable scenarios.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { callBobMCP } from './utils/bobClient.js';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const BANK_FILE   = path.join(__dirname, 'data', 'advice_bank.json');

// ─── Fallback bank loader ─────────────────────────────────────────────────────

function loadAdviceBank() {
  try {
    return JSON.parse(fs.readFileSync(BANK_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

// ─── Category inference ───────────────────────────────────────────────────────

const CATEGORY_KEYWORDS = {
  nutrition: ['eat', 'meal', 'food', 'diet', 'glucose', 'protein', 'caffeine', 'coffee', 'hydrat', 'drink'],
  sleep:     ['sleep', 'rest', 'nap', 'bedtime', 'circadian', 'overnight', 'wake', 'recovery'],
  stress:    ['stress', 'cortisol', 'nervous', 'breath', 'relax', 'pace', 'workload', 'focus', 'battery'],
  immune:    ['immune', 'sick', 'illness', 'respir', 'heart rate', 'resting hr', 'inflammation'],
};

function inferCategory(text) {
  const lower = text.toLowerCase();
  let bestCategory = 'stress';
  let bestCount = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const count = keywords.filter((k) => lower.includes(k)).length;
    if (count > bestCount) { bestCount = count; bestCategory = cat; }
  }
  return bestCategory;
}

// ─── Fallback selector ────────────────────────────────────────────────────────

/**
 * Picks the best matching fallback entry from the advice bank for the given
 * telemetry day and slot. Scores entries by how many trigger conditions match,
 * and picks the highest-scoring one for the slot.
 */
function selectFallback(telemetryDay, slot) {
  const bank = loadAdviceBank().filter((e) => e.slot === slot || !e.slot);
  if (bank.length === 0) return null;

  const hrv     = telemetryDay?.Overnight_HRV_ms;
  const baseline = telemetryDay?.['7d_Avg_HRV_ms'];
  const hvPct   = hrv && baseline ? (hrv - baseline) / baseline : 0;

  // Build a flat metrics map including derived fields for trigger evaluation
  const metrics = {
    ...telemetryDay,
    Overnight_HRV_ms_vs_baseline_pct: hvPct,
    Resting_HR_bpm_vs_median: 0, // Not computed here — trigger won't fire for this
  };

  // Score each entry by whether its trigger condition is satisfied
  let best = null;
  let bestScore = -1;

  for (const entry of bank) {
    if (!entry.trigger) { if (bestScore < 0) { best = entry; bestScore = 0; } continue; }
    const val = metrics[entry.trigger.metric];
    if (val == null) continue;

    let matches = false;
    switch (entry.trigger.operator) {
      case '<':  matches = val < entry.trigger.value;  break;
      case '>':  matches = val > entry.trigger.value;  break;
      case '<=': matches = val <= entry.trigger.value; break;
      case '>=': matches = val >= entry.trigger.value; break;
    }

    if (matches && bestScore < 1) { best = entry; bestScore = 1; }
  }

  return best || bank[0];
}

// ─── Bob prompt builder ───────────────────────────────────────────────────────

function buildAdvicePrompt(telemetryDay, externalFactors, sickDay, slot) {
  const hrv      = telemetryDay?.Overnight_HRV_ms;
  const baseline = telemetryDay?.['7d_Avg_HRV_ms'];
  const hrvDrop  = hrv && baseline
    ? `${Math.round(((baseline - hrv) / baseline) * 100)}% below 7-day baseline`
    : 'unknown';

  const activeFactors = externalFactors
    ? Object.entries(externalFactors).filter(([, v]) => v === true).map(([k]) => k)
    : [];

  const slotContext = {
    morning:   'the developer is starting their workday',
    midday:    'the developer is mid-workday around lunchtime',
    afternoon: 'the developer is in the late afternoon finishing their workday',
  };

  return `You are a concise health advisor for a software developer using the Po-Ko health monitoring framework.

TIME SLOT: ${slot} (${slotContext[slot] || slot})
DATE: ${telemetryDay?.Date || 'today'}
SICK DAY: ${sickDay ? 'YES — developer has logged today as a sick day' : 'No'}

CURRENT BIOMETRICS:
- Overnight HRV: ${hrv ?? 'N/A'} ms (${hrvDrop})
- 7-day HRV baseline: ${baseline ?? 'N/A'} ms
- Sleep Score: ${telemetryDay?.Sleep_Score ?? 'N/A'} / 100
- Body Battery: ${telemetryDay?.Body_Battery ?? 'N/A'}
- Average Stress: ${telemetryDay?.Avg_Stress ?? 'N/A'} / 100
- Resting HR: ${telemetryDay?.Resting_HR_bpm ?? 'N/A'} bpm
- Respiration: ${telemetryDay?.Respiration ?? 'N/A'} breaths/min
- Time In Bed: ${telemetryDay?.Time_In_Bed_Minutes ? Math.round(telemetryDay.Time_In_Bed_Minutes / 60 * 10) / 10 + ' hrs' : 'N/A'}
${activeFactors.length > 0 ? `- Active external factors: ${activeFactors.join(', ')}` : '- No active external factors'}

TASK:
Generate ONE specific, actionable health advice message for this developer RIGHT NOW.

Rules:
1. Reference the actual metric values — do not be generic.
2. Give a concrete action with a time or duration (e.g. "eat within the next 30 minutes", "take a 10-minute walk").
3. Explain WHY this action helps based on the metrics (one sentence of physiological reasoning).
4. Maximum 3 sentences total.
5. Do NOT use bullet points or lists — write a flowing paragraph.
6. After the advice text, on a new line write: TRIGGER_METRIC: [the single most relevant metric name, e.g. Body_Battery]
7. After that: TRIGGER_VALUE: [its value]

Write the advice now:`;
}

// ─── Parse Bob's response ─────────────────────────────────────────────────────

function parseBobAdvice(response, slot) {
  const lines = response.split('\n').map((l) => l.trim()).filter(Boolean);

  let triggerMetric = null;
  let triggerValue  = null;
  const textLines   = [];

  for (const line of lines) {
    if (line.startsWith('TRIGGER_METRIC:')) {
      triggerMetric = line.replace('TRIGGER_METRIC:', '').trim();
    } else if (line.startsWith('TRIGGER_VALUE:')) {
      triggerValue = line.replace('TRIGGER_VALUE:', '').trim();
    } else {
      textLines.push(line);
    }
  }

  const text = textLines.join(' ').trim();
  const category = inferCategory(text);

  return { slot, text, triggerMetric, triggerValue, category };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates a contextual health advice message for a given schedule slot.
 *
 * @param {object}       telemetryDay    - Today's biometric telemetry row
 * @param {object|null}  externalFactors - Self-reported survey answers, or null
 * @param {boolean}      sickDay         - True if today is logged as a sick day
 * @param {string}       slot            - 'morning' | 'midday' | 'afternoon'
 * @returns {Promise<{ slot, text, triggerMetric, triggerValue, category }>}
 */
export async function generateAdvice(telemetryDay, externalFactors, sickDay, slot) {
  try {
    const prompt    = buildAdvicePrompt(telemetryDay, externalFactors, sickDay, slot);
    const response  = await callBobMCP(prompt);
    const advice    = parseBobAdvice(response, slot);

    // Sanity check: require at least 30 chars of meaningful advice text
    if (advice.text && advice.text.length >= 30) {
      return advice;
    }
    // Fall through to fallback if response was empty/malformed
  } catch (err) {
    console.warn('[adviceEngine] Bob call failed, using fallback bank:', err.message);
  }

  // ── Static fallback ───────────────────────────────────────────────────────
  const fallback = selectFallback(telemetryDay, slot);
  if (fallback) {
    return {
      slot,
      text:          fallback.text,
      triggerMetric: fallback.trigger?.metric   ?? null,
      triggerValue:  fallback.trigger?.value != null ? String(fallback.trigger.value) : null,
      category:      fallback.category ?? inferCategory(fallback.text),
    };
  }

  // Last-resort default
  return {
    slot,
    text: 'Take a moment to check in with your body. If your energy is low, prioritise hydration and a short break before your next task.',
    triggerMetric: null,
    triggerValue:  null,
    category: 'stress',
  };
}
