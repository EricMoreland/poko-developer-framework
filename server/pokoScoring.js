/**
 * Po-Ko Predictive Scoring Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports two functions:
 *   • calculatePoKoScore(dailyMetrics)   – single-day risk score (unchanged API)
 *   • analyzeTrend(historicalDataArray)  – 72-Hour Rebound Rule pattern detector
 *
 * Returns a Po-Ko Risk Score on a 1–10 integer scale:
 *   1–3  → LOW RISK    – Developer is recovered and cognitively ready.
 *   4–5  → GUARDED     – Minor deficit detected; sustenance prompts advised.
 *   6–7  → ELEVATED    – Meaningful recovery gap; pacing and hydration critical.
 *   8–9  → HIGH RISK   – Significant fatigue signal; consider workload re-routing.
 *  10    → CRITICAL    – Active Support State threshold breached.
 *
 * Scoring Architecture (weighted penalty system, 0–10 raw):
 * ┌──────────────────────────────┬────────┬──────────────────────────────────┐
 * │ Signal                       │ Weight │ Rationale                        │
 * ├──────────────────────────────┼────────┼──────────────────────────────────┤
 * │ HRV Deviation from Baseline  │  40 %  │ Strongest single recovery proxy  │
 * │ Sleep Score                  │  30 %  │ Direct cognitive capacity metric │
 * │ Average Stress               │  20 %  │ Cumulative allostatic load        │
 * │ Sensor Gap Flag              │  10 %  │ Data-quality / unreliability bump │
 * └──────────────────────────────┴────────┴──────────────────────────────────┘
 *
 * Each component is independently normalised to a 0–10 penalty sub-score
 * before being combined. The raw weighted sum is then clamped to [1, 10].
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Component weights — must sum to 1.0 */
const WEIGHTS = {
  hrv: 0.40,
  sleep: 0.30,
  stress: 0.20,
  sensorGap: 0.10,
};

/**
 * HRV drop thresholds (as a percentage below the 7-day rolling baseline).
 * Research benchmark: >8 % drop is a meaningful recovery signal;
 * >20 % indicates significant physiological stress.
 */
const HRV_DROP = {
  NONE: 0,        // At or above baseline → minimal penalty
  MILD: 0.08,     // 8 %  drop → moderate penalty begins
  MODERATE: 0.15, // 15 % drop → elevated penalty
  SEVERE: 0.25,   // 25 % drop → near-maximum penalty
};

/** Sleep score band boundaries (Garmin 0–100 scale) */
const SLEEP = {
  EXCELLENT: 85,
  GOOD: 70,
  FAIR: 55,
  POOR: 40,
};

/** Average stress band boundaries (Garmin 0–100 scale) */
const STRESS = {
  CALM: 25,
  LOW: 40,
  MODERATE: 60,
  HIGH: 75,
};

// ─── Internal Scorers ────────────────────────────────────────────────────────

/**
 * Returns a 0–10 penalty for HRV deviation below the 7-day rolling baseline.
 * Uses percentage drop so the scorer adapts to each person's personal baseline.
 * @param {number} hrv      - Overnight_HRV_ms
 * @param {number} baseline - 7d_Avg_HRV_ms
 * @returns {number} 0–10 penalty
 */
function scoreHRV(hrv, baseline) {
  if (!baseline || baseline <= 0) return 5; // No baseline → neutral penalty

  const drop = (baseline - hrv) / baseline; // positive = below baseline

  if (drop <= HRV_DROP.NONE)     return 0;  // At/above baseline — no penalty
  if (drop < HRV_DROP.MILD)      return 2;  // <8 % drop — minor dip
  if (drop < HRV_DROP.MODERATE)  return 5;  // 8–15 % drop — meaningful deficit
  if (drop < HRV_DROP.SEVERE)    return 7;  // 15–25 % drop — significant stress
  return 10;                                // >25 % drop — severe suppression
}

/**
 * Returns a 0–10 penalty for sleep quality.
 * Lower sleep score = higher penalty.
 * @param {number} sleepScore - Sleep_Score (0–100)
 * @returns {number} 0–10 penalty
 */
function scoreSleep(sleepScore) {
  if (sleepScore >= SLEEP.EXCELLENT) return 0;
  if (sleepScore >= SLEEP.GOOD)      return 3;
  if (sleepScore >= SLEEP.FAIR)      return 6;
  if (sleepScore >= SLEEP.POOR)      return 8;
  return 10; // Very poor or missing sleep data
}

/**
 * Returns a 0–10 penalty for average daily stress.
 * Higher stress = higher penalty.
 * @param {number} avgStress - Avg_Stress (0–100)
 * @returns {number} 0–10 penalty
 */
function scoreStress(avgStress) {
  if (avgStress <= STRESS.CALM)     return 0;
  if (avgStress <= STRESS.LOW)      return 2;
  if (avgStress <= STRESS.MODERATE) return 5;
  if (avgStress <= STRESS.HIGH)     return 7;
  return 10; // Sustained high stress
}

/**
 * Returns a 0–10 penalty for a sensor gap flag.
 * When sensor data is unreliable, other readings may be missing or wrong,
 * warranting a fixed elevated-risk bump.
 * @param {boolean} sensorGapFlag - Sensor_Gap_Flag
 * @returns {number} 0 or 10
 */
function scoreSensorGap(sensorGapFlag) {
  return sensorGapFlag ? 10 : 0;
}

// ─── Constants (trend analysis) ──────────────────────────────────────────────

/**
 * Score boost applied to the most-recent day's Po-Ko score when the
 * 72-Hour Rebound Rule fires. Kept as a named constant so it can be
 * tuned independently of the single-day weight table.
 */
const TREND_BOOST = 1.5;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Calculates the Po-Ko Risk Score for a single day's biometric entry.
 *
 * @param {object}  dailyMetrics
 * @param {number}  dailyMetrics.Overnight_HRV_ms  - Overnight HRV in milliseconds
 * @param {number}  dailyMetrics['7d_Avg_HRV_ms']  - 7-day rolling average HRV
 * @param {number}  dailyMetrics.Sleep_Score        - Garmin sleep score (0–100)
 * @param {number}  dailyMetrics.Avg_Stress         - Average stress score (0–100)
 * @param {boolean} dailyMetrics.Sensor_Gap_Flag    - True if sensor drop was detected
 * @param {boolean} [dailyMetrics.trendWarning]     - Optional flag from analyzeTrend()
 *                                                    Adds TREND_BOOST to raw score.
 *
 * @returns {{
 *   score: number,          // Final clamped Po-Ko score (1–10)
 *   components: object,     // Individual 0–10 sub-scores for transparency
 *   riskLevel: string,      // Human-readable risk tier label
 *   trendBoosted: boolean   // True when the trend boost was applied
 * }}
 */
export function calculatePoKoScore(dailyMetrics) {
  const {
    Overnight_HRV_ms,
    '7d_Avg_HRV_ms': baseline_HRV,
    Sleep_Score,
    Avg_Stress,
    Sensor_Gap_Flag,
    trendWarning = false, // ← NEW: injected from analyzeTrend(); defaults to false
  } = dailyMetrics;

  // --- Compute individual component penalties (each 0–10) ---
  const components = {
    hrv:       scoreHRV(Overnight_HRV_ms, baseline_HRV),
    sleep:     scoreSleep(Sleep_Score),
    stress:    scoreStress(Avg_Stress),
    sensorGap: scoreSensorGap(Sensor_Gap_Flag),
  };

  // --- Weighted sum ---
  let rawScore =
    components.hrv       * WEIGHTS.hrv +
    components.sleep     * WEIGHTS.sleep +
    components.stress    * WEIGHTS.stress +
    components.sensorGap * WEIGHTS.sensorGap;

  // --- Apply 72-Hour Rebound Rule boost when pattern is active --- // ← NEW
  if (trendWarning) rawScore += TREND_BOOST;

  // --- Clamp to [1, 10] and round to one decimal ---
  const score = Math.min(10, Math.max(1, Math.round(rawScore * 10) / 10));

  // --- Derive human-readable risk tier ---
  let riskLevel;
  if (score <= 3)      riskLevel = 'LOW';
  else if (score <= 5) riskLevel = 'GUARDED';
  else if (score <= 7) riskLevel = 'ELEVATED';
  else if (score <= 9) riskLevel = 'HIGH';
  else                 riskLevel = 'CRITICAL';

  return { score, components, riskLevel, trendBoosted: trendWarning }; // ← NEW: trendBoosted added
}

/**
 * 72-Hour Rebound Rule — multi-day pattern detector.
 *
 * Analyses the last 2–3 days of telemetry for the specific dual-signal pattern
 * that precedes impending sickness:
 *   • Overnight_HRV_ms is in a consecutive DOWNWARD trend across all entries.
 *   • Avg_Stress       is in a consecutive UPWARD  trend across all entries.
 *
 * Both conditions must be true simultaneously; either alone is insufficient
 * to raise the warning (e.g. a single hard workout drives HRV down but stress
 * stays flat, so the flag does not fire).
 *
 * The array should be ordered oldest → newest (index 0 = oldest day,
 * index n-1 = today). A minimum of 2 entries is required; if fewer are
 * supplied the function returns no warning and explains why in `reason`.
 *
 * @param {Array<{Overnight_HRV_ms: number, Avg_Stress: number}>} historicalDataArray
 *   Array of daily telemetry objects, ordered oldest → newest.
 *   Each entry must contain at least `Overnight_HRV_ms` and `Avg_Stress`.
 *
 * @returns {{
 *   impendingSicknessWarning: boolean, // True when the 72-Hour Rebound Rule fires
 *   reason: string,                    // Human-readable explanation of the result
 *   hrvTrend:    'FALLING' | 'FLAT/RISING' | 'INSUFFICIENT_DATA',
 *   stressTrend: 'RISING'  | 'FLAT/FALLING' | 'INSUFFICIENT_DATA'
 * }}
 */
export function analyzeTrend(historicalDataArray) {
  // --- Guard: need at least 2 data points to establish a trend ---
  if (!Array.isArray(historicalDataArray) || historicalDataArray.length < 2) {
    return {
      impendingSicknessWarning: false,
      reason: 'Insufficient data: at least 2 days of telemetry are required.',
      hrvTrend:    'INSUFFICIENT_DATA',
      stressTrend: 'INSUFFICIENT_DATA',
    };
  }

  // --- Check for strictly consecutive HRV decline (each day lower than the previous) ---
  let hrvFalling = true;
  for (let i = 1; i < historicalDataArray.length; i++) {
    if (historicalDataArray[i].Overnight_HRV_ms >= historicalDataArray[i - 1].Overnight_HRV_ms) {
      hrvFalling = false;
      break;
    }
  }

  // --- Check for strictly consecutive stress rise (each day higher than the previous) ---
  let stressRising = true;
  for (let i = 1; i < historicalDataArray.length; i++) {
    if (historicalDataArray[i].Avg_Stress <= historicalDataArray[i - 1].Avg_Stress) {
      stressRising = false;
      break;
    }
  }

  const hrvTrend    = hrvFalling    ? 'FALLING'      : 'FLAT/RISING';
  const stressTrend = stressRising  ? 'RISING'       : 'FLAT/FALLING';
  const impendingSicknessWarning = hrvFalling && stressRising;

  let reason;
  if (impendingSicknessWarning) {
    reason =
      `72-Hour Rebound Rule triggered over ${historicalDataArray.length} consecutive days: ` +
      `HRV is in a sustained decline while stress is in a sustained rise. ` +
      `Impending sickness pattern detected — Po-Ko score boosted by ${TREND_BOOST} points.`;
  } else if (!hrvFalling && !stressRising) {
    reason = 'No pattern: HRV is not in a consecutive decline and stress is not in a consecutive rise.';
  } else if (!hrvFalling) {
    reason = 'Partial pattern: stress is rising but HRV decline is not consecutive across all days.';
  } else {
    reason = 'Partial pattern: HRV is declining but stress rise is not consecutive across all days.';
  }

  return { impendingSicknessWarning, reason, hrvTrend, stressTrend };
}
