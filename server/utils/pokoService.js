/**
 * server/utils/pokoService.js — Shared business logic layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Functions used by both Express route handlers (server/index.js) and the
 * MCP tool handlers (server/mcp.js). Keeps shared logic DRY and testable.
 */

import { calculatePoKoScore, analyzeTrend } from '../pokoScoring.js';
import {
  getTelemetry,
  getTelemetryByDate,
  insertFactor,
  getFactorsForDate,
  getSickDays,
  isSickDay,
  getAdviceByDate,
} from '../db.js';

// ─── Telemetry ────────────────────────────────────────────────────────────────

/**
 * Returns a fully scored telemetry object for today (most-recent record),
 * including Po-Ko score, risk level, trend details, external factors, and
 * sick day flag.
 *
 * @returns {object|null}  Scored day object, or null when no data is available.
 */
export function getTodayTelemetry() {
  const rawHistory = getTelemetry(); // newest-first
  if (rawHistory.length === 0) return null;

  // Rebuild oldest-first slice for trend analysis (last 3 records suffice)
  const history = [...rawHistory].reverse();
  const todayIndex = history.length - 1;
  const today = history[todayIndex];

  let trendWarning = false;
  let trendDetails = {};

  if (todayIndex >= 2) {
    const last3 = [history[todayIndex - 2], history[todayIndex - 1], history[todayIndex]];
    const trend = analyzeTrend(last3);
    trendWarning = trend.impendingSicknessWarning;
    trendDetails = trend;
  }

  const externalEntry   = getFactorsForDate(today.Date);
  const externalFactors = externalEntry ? externalEntry.factors : null;

  const scoringResult = calculatePoKoScore({ ...today, trendWarning }, externalFactors);

  return {
    ...today,
    sick_day:              isSickDay(today.Date),
    poko_score:            scoringResult.score,
    poko_risk_level:       scoringResult.riskLevel,
    poko_components:       scoringResult.components,
    poko_trend_boosted:    scoringResult.trendBoosted,
    poko_trend_details:    trendDetails,
    poko_external_factors: scoringResult.externalFactorResult,
    poko_external_applied: scoringResult.externalFactorsApplied,
    poko_pattern_warnings: scoringResult.patternWarnings || [],
    survey_answered:       !!externalEntry,
  };
}

// ─── Survey ───────────────────────────────────────────────────────────────────

/**
 * Submits survey factor answers for a given date and returns the updated score.
 *
 * @param {string} date     ISO date string
 * @param {object} factors  { [factorId]: boolean }
 * @returns {{ updatedScore: object }}
 */
export function submitSurveyFactors(date, factors) {
  const submittedAt = new Date().toISOString();
  insertFactor(date, factors, submittedAt);

  const dayData = getTelemetryByDate(date);
  if (!dayData) return { updatedScore: null };

  const scoringResult = calculatePoKoScore(dayData, factors);
  return {
    updatedScore: {
      score:           scoringResult.score,
      riskLevel:       scoringResult.riskLevel,
      externalFactors: scoringResult.externalFactorResult,
    },
  };
}

// ─── Advice ───────────────────────────────────────────────────────────────────

/**
 * Returns today's stored advice records for a given slot (or all slots).
 *
 * @param {string} [slot]  'morning' | 'midday' | 'afternoon', or undefined for all
 * @returns {object[]}
 */
export function getTodayAdvice(slot) {
  const date    = new Date().toISOString().slice(0, 10);
  const records = getAdviceByDate(date);
  return slot ? records.filter((r) => r.slot === slot) : records;
}

// ─── Log ───────────────────────────────────────────────────────────────────

/**
 * Logs daily telemetry metrics into SQLite and returns the updated score.
 *
 * @param {object} entry  Telemetry metrics payload
 * @returns {{ entry: object, score: number, riskLevel: string }}
 */
export function logDailyTelemetry(entry) {
  const date = entry.Date || new Date().toISOString().slice(0, 10);

  let timeInBed = entry.Time_In_Bed_Minutes || null;
  let gapMins = entry.Unrecorded_Gaps_Minutes || 0;
  let sensorGapFlag = entry.Sensor_Gap_Flag || false;

  // Derive time in bed and sensor gap flag if bedtime/wake time supplied
  if (entry.Bedtime_Decimal != null && entry.Wake_Time_Decimal != null) {
    const bt = parseFloat(entry.Bedtime_Decimal);
    const wt = parseFloat(entry.Wake_Time_Decimal);
    const inBedHrs = bt > wt ? (24.0 - bt) + wt : wt - bt;
    timeInBed = Math.round(inBedHrs * 60 * 10) / 10;

    if (entry.Sleep_Duration_Minutes != null) {
      gapMins = Math.round((timeInBed - parseFloat(entry.Sleep_Duration_Minutes)) * 10) / 10;
      sensorGapFlag = gapMins > 60.0;
    }
  }

  const totalRecords = getTelemetry().length;
  const telemetryRow = {
    Day: entry.Day || `Day_${String(totalRecords + 1).padStart(2, '0')}`,
    Date: date,
    Sleep_Score: entry.Sleep_Score ?? null,
    Overnight_HRV_ms: entry.Overnight_HRV_ms ?? null,
    '7d_Avg_HRV_ms': entry['7d_Avg_HRV_ms'] ?? null,
    Avg_Stress: entry.Avg_Stress ?? null,
    Bedtime_Decimal: entry.Bedtime_Decimal ?? null,
    Wake_Time_Decimal: entry.Wake_Time_Decimal ?? null,
    Sleep_Duration_Minutes: entry.Sleep_Duration_Minutes ?? null,
    Time_In_Bed_Minutes: timeInBed,
    Unrecorded_Gaps_Minutes: gapMins,
    Sensor_Gap_Flag: sensorGapFlag ? 1 : 0,
  };

  insertTelemetry(telemetryRow);

  // Get external factors for compound scoring
  const externalEntry = getFactorsForDate(date);
  const externalFactors = externalEntry ? externalEntry.factors : null;

  const scoringResult = calculatePoKoScore(telemetryRow, externalFactors);

  return {
    entry: telemetryRow,
    score: scoringResult.score,
    riskLevel: scoringResult.riskLevel,
  };
}
