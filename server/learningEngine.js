/**
 * server/learningEngine.js — Continuous Learning Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs whole-history multi-metric pattern analysis using all available
 * telemetry and sick day records from SQLite. Uses Bob as the AI reasoning
 * layer to name patterns, generate detection rules, and write warning messages.
 *
 * Results are written to data/learning_insights.json and auto-applied by
 * pokoScoring.js on each score calculation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTelemetry, getSickDays } from './db.js';
import { callBobMCP } from './utils/bobClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const INSIGHTS_FILE = path.join(__dirname, 'data', 'learning_insights.json');

// ─── Pattern analysis helpers ─────────────────────────────────────────────────

/**
 * Computes the personal median for a numeric field across all telemetry rows.
 */
function computeMedian(rows, field) {
  const vals = rows.map((r) => r[field]).filter((v) => v != null && !isNaN(v));
  if (vals.length === 0) return null;
  vals.sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

/**
 * Extracts pre-sick windows (D-1, D-2, D-3 relative to each sick day).
 * Returns an array of { sickDate, window: [dayMinus3, dayMinus2, dayMinus1] }.
 */
function extractPreSickWindows(allTelemetry, sickDays) {
  // Build a date → row map for O(1) lookups
  const byDate = {};
  for (const row of allTelemetry) byDate[row.Date] = row;

  const windows = [];
  for (const { date: sickDate } of sickDays) {
    const d = new Date(sickDate);
    const prior = [];
    for (let offset = 3; offset >= 1; offset--) {
      const candidate = new Date(d);
      candidate.setDate(candidate.getDate() - offset);
      const ds = candidate.toISOString().slice(0, 10);
      if (byDate[ds]) prior.push(byDate[ds]);
    }
    if (prior.length >= 2) {
      windows.push({ sickDate, window: prior });
    }
  }
  return windows;
}

/**
 * Checks if a field moved consistently in a direction across all pre-sick windows.
 * direction: 'down' | 'up'
 * Returns the count of windows where the field moved in that direction on ALL 2–3 days.
 */
function countConsistentMoves(windows, field, direction) {
  let count = 0;
  for (const { window: days } of windows) {
    let consistent = true;
    for (let i = 1; i < days.length; i++) {
      const prev = days[i - 1][field];
      const curr = days[i][field];
      if (prev == null || curr == null) { consistent = false; break; }
      if (direction === 'down' && curr >= prev) { consistent = false; break; }
      if (direction === 'up'   && curr <= prev) { consistent = false; break; }
    }
    if (consistent) count++;
  }
  return count;
}

/**
 * Computes personalised HRV threshold adjustments based on the distribution of
 * HRV drops on the day before sick days vs normal days.
 */
function computeHRVThresholds(allTelemetry, sickDays) {
  const byDate = {};
  for (const row of allTelemetry) byDate[row.Date] = row;

  const preSickDrops = [];
  for (const { date: sickDate } of sickDays) {
    const d = new Date(sickDate);
    d.setDate(d.getDate() - 1);
    const ds = d.toISOString().slice(0, 10);
    const row = byDate[ds];
    if (row && row.Overnight_HRV_ms && row['7d_Avg_HRV_ms']) {
      const drop = (row['7d_Avg_HRV_ms'] - row.Overnight_HRV_ms) / row['7d_Avg_HRV_ms'];
      preSickDrops.push(drop);
    }
  }

  if (preSickDrops.length === 0) return null;

  preSickDrops.sort((a, b) => a - b);
  const medianDrop = preSickDrops[Math.floor(preSickDrops.length / 2)];

  // Personalised thresholds: mild = half median, moderate = median, severe = 1.5x median
  // Clamped to reasonable physiological ranges (2%–40%)
  return {
    mild:     Math.max(0.02, Math.min(0.15, medianDrop * 0.5)),
    moderate: Math.max(0.05, Math.min(0.25, medianDrop)),
    severe:   Math.max(0.10, Math.min(0.40, medianDrop * 1.5)),
    derivedFrom: `${preSickDrops.length} pre-sick day observations`,
  };
}

// ─── Main analysis function ───────────────────────────────────────────────────

/**
 * Runs the full multi-metric pattern analysis and returns the insights object.
 * Writes results to data/learning_insights.json.
 *
 * @returns {Promise<object>}  The full insights object
 */
export async function runAnalysis() {
  const allTelemetry = getTelemetry().reverse(); // oldest-first for analysis
  const sickDays     = getSickDays();

  if (sickDays.length === 0) {
    const result = {
      lastRun: new Date().toISOString(),
      autoApplied: true,
      message: 'No sick days logged yet — pattern analysis requires at least 1 sick day.',
      detectedPatterns: [],
      thresholds: {},
    };
    fs.writeFileSync(INSIGHTS_FILE, JSON.stringify(result, null, 2), 'utf-8');
    return result;
  }

  const windows = extractPreSickWindows(allTelemetry, sickDays);

  // ── Field-level directional analysis ────────────────────────────────────────
  const fieldsToAnalyse = [
    { field: 'Overnight_HRV_ms',    direction: 'down', label: 'HRV declining'         },
    { field: 'Resting_HR_bpm',      direction: 'up',   label: 'Resting HR rising'     },
    { field: 'Sleep_Score',         direction: 'down', label: 'Sleep Score dropping'  },
    { field: 'Avg_Stress',          direction: 'up',   label: 'Stress rising'         },
    { field: 'Body_Battery',        direction: 'down', label: 'Body Battery declining'},
    { field: 'Respiration',         direction: 'up',   label: 'Respiration rising'    },
    { field: 'Sleep_Duration_Minutes', direction: 'down', label: 'Sleep Duration dropping' },
  ];

  const fieldResults = fieldsToAnalyse.map(({ field, direction, label }) => ({
    field,
    direction,
    label,
    occurrences: countConsistentMoves(windows, field, direction),
    totalWindows: windows.length,
  })).filter((r) => r.occurrences >= 2);

  // ── Multi-field co-occurrence: find field combinations that both moved consistently ──
  const confirmedCombinations = [];
  const MIN_OCCURRENCES = Math.max(2, Math.floor(windows.length * 0.35)); // ≥35% of sick windows

  for (let i = 0; i < fieldResults.length; i++) {
    for (let j = i + 1; j < fieldResults.length; j++) {
      const a = fieldResults[i];
      const b = fieldResults[j];
      // Count windows where BOTH fields moved consistently
      let coCount = 0;
      for (const { window: days } of windows) {
        const aOk = isConsistentInWindow(days, a.field, a.direction);
        const bOk = isConsistentInWindow(days, b.field, b.direction);
        if (aOk && bOk) coCount++;
      }
      if (coCount >= MIN_OCCURRENCES) {
        confirmedCombinations.push({
          fields: [a, b],
          occurrences: coCount,
          totalWindows: windows.length,
        });
      }
    }
  }

  // ── Personalised HRV thresholds ──────────────────────────────────────────────
  const personalHRVThresholds = computeHRVThresholds(allTelemetry, sickDays);
  const baselineHRV  = computeMedian(allTelemetry, 'Overnight_HRV_ms');
  const baselineRHR  = computeMedian(allTelemetry, 'Resting_HR_bpm');
  const baselineSleep = computeMedian(allTelemetry, 'Sleep_Score');

  // ── Build structured summary for Bob ─────────────────────────────────────────
  const summary = {
    totalTelemetryDays: allTelemetry.length,
    totalSickDays: sickDays.length,
    preSickWindowsAnalysed: windows.length,
    personalBaselines: {
      hrv_median_ms: baselineHRV,
      resting_hr_median_bpm: baselineRHR,
      sleep_score_median: baselineSleep,
    },
    singleFieldSignals: fieldResults,
    coOccurringFieldCombinations: confirmedCombinations.map(({ fields, occurrences, totalWindows }) => ({
      fields: fields.map((f) => f.label),
      rawFields: fields.map((f) => ({ field: f.field, direction: f.direction })),
      occurrences,
      totalWindows,
      precisionPct: Math.round((occurrences / totalWindows) * 100),
    })),
  };

  // ── Call Bob ──────────────────────────────────────────────────────────────────
  let bobPatterns = [];
  try {
    const prompt = buildBobPrompt(summary);
    const bobResponse = await callBobMCP(prompt);
    bobPatterns = parseBobResponse(bobResponse, summary);
  } catch (err) {
    console.error('[learningEngine] Bob call failed, using statistical patterns only:', err.message);
    // Fall back to auto-generating patterns from the statistical analysis
    bobPatterns = buildFallbackPatterns(summary);
  }

  // ── Build final insights object ───────────────────────────────────────────────
  const insights = {
    lastRun: new Date().toISOString(),
    autoApplied: true,
    totalSickDays: sickDays.length,
    preSickWindowsAnalysed: windows.length,
    detectedPatterns: bobPatterns,
    thresholds: personalHRVThresholds
      ? {
          hrv_bands: {
            mild:     personalHRVThresholds.mild,
            moderate: personalHRVThresholds.moderate,
            severe:   personalHRVThresholds.severe,
          },
          derivedFrom: personalHRVThresholds.derivedFrom,
        }
      : {},
    personalBaselines: summary.personalBaselines,
  };

  fs.writeFileSync(INSIGHTS_FILE, JSON.stringify(insights, null, 2), 'utf-8');
  console.log(`[learningEngine] Analysis complete. ${bobPatterns.length} patterns detected.`);
  return insights;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isConsistentInWindow(days, field, direction) {
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1][field];
    const curr = days[i][field];
    if (prev == null || curr == null) return false;
    if (direction === 'down' && curr >= prev) return false;
    if (direction === 'up'   && curr <= prev) return false;
  }
  return true;
}

function buildBobPrompt(summary) {
  return `You are a physiological pattern analyst for the Po-Ko Developer Capacity Framework.

Below is a statistical analysis of biometric data from ${summary.totalTelemetryDays} days of wearable data including ${summary.totalSickDays} logged sick days.

ANALYSIS SUMMARY:
${JSON.stringify(summary, null, 2)}

TASK:
For each co-occurring field combination listed under "coOccurringFieldCombinations", produce a JSON object with:
- patternId: a short kebab-case identifier (e.g. "hrv-rhr-triple-signal-01")
- name: a short human-readable name (e.g. "HRV + Resting HR Pre-Illness Signal")
- occurrences: copy from the data
- description: one sentence describing the pattern physiologically
- sickDayFollowedWithin: "3 days in X of Y cases" (X = occurrences, Y = totalWindows)
- detectionRule: { window: 3, conditions: [ { field, operator, value } ], allMustBeTrue: true }
- warningMessage: a specific, actionable plain-English warning for the developer (2–3 sentences, reference the actual metrics)
- autoApplied: true

For the detectionRule conditions, use approximate threshold values derived from the personal baselines:
${JSON.stringify(summary.personalBaselines, null, 2)}

Return ONLY a valid JSON array of pattern objects, no extra text.`;
}

function parseBobResponse(response, summary) {
  // Try to extract a JSON array from Bob's response
  try {
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Fall through to fallback
  }
  return buildFallbackPatterns(summary);
}

function buildFallbackPatterns(summary) {
  return summary.coOccurringFieldCombinations.map((combo, idx) => ({
    patternId: `auto-pattern-${String(idx + 1).padStart(2, '0')}`,
    name: combo.fields.join(' + '),
    occurrences: combo.occurrences,
    description: `${combo.fields.join(' and ')} consistently across ${combo.occurrences} pre-illness windows (${combo.precisionPct}% of sick day occurrences).`,
    sickDayFollowedWithin: `3 days in ${combo.occurrences} of ${combo.totalWindows} cases`,
    detectionRule: {
      window: 3,
      conditions: combo.rawFields.map(({ field, direction }) => ({
        field,
        operator: direction === 'down' ? '<' : '>',
        value: `baseline_${field}`,
      })),
      allMustBeTrue: true,
    },
    warningMessage: `Your biometric pattern over the past 3 days (${combo.fields.join(', ')}) matches ${combo.occurrences} historical pre-illness signatures. Consider pacing your workload and prioritising recovery today.`,
    autoApplied: true,
  }));
}
