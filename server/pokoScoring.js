/**
 * Po-Ko Predictive Scoring Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports a single function: calculatePoKoScore(dailyMetrics)
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

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Calculates the Po-Ko Risk Score for a single day's biometric entry.
 *
 * @param {object} dailyMetrics
 * @param {number}  dailyMetrics.Overnight_HRV_ms  - Overnight HRV in milliseconds
 * @param {number}  dailyMetrics['7d_Avg_HRV_ms']  - 7-day rolling average HRV
 * @param {number}  dailyMetrics.Sleep_Score        - Garmin sleep score (0–100)
 * @param {number}  dailyMetrics.Avg_Stress         - Average stress score (0–100)
 * @param {boolean} dailyMetrics.Sensor_Gap_Flag    - True if sensor drop was detected
 *
 * @returns {{
 *   score: number,          // Final clamped Po-Ko score (1–10)
 *   components: object,     // Individual 0–10 sub-scores for transparency
 *   riskLevel: string       // Human-readable risk tier label
 * }}
 */
export function calculatePoKoScore(dailyMetrics) {
  const {
    Overnight_HRV_ms,
    '7d_Avg_HRV_ms': baseline_HRV,
    Sleep_Score,
    Avg_Stress,
    Sensor_Gap_Flag,
  } = dailyMetrics;

  // --- Compute individual component penalties (each 0–10) ---
  const components = {
    hrv:       scoreHRV(Overnight_HRV_ms, baseline_HRV),
    sleep:     scoreSleep(Sleep_Score),
    stress:    scoreStress(Avg_Stress),
    sensorGap: scoreSensorGap(Sensor_Gap_Flag),
  };

  // --- Weighted sum ---
  const rawScore =
    components.hrv       * WEIGHTS.hrv +
    components.sleep     * WEIGHTS.sleep +
    components.stress    * WEIGHTS.stress +
    components.sensorGap * WEIGHTS.sensorGap;

  // --- Clamp to [1, 10] and round to one decimal ---
  const score = Math.min(10, Math.max(1, Math.round(rawScore * 10) / 10));

  // --- Derive human-readable risk tier ---
  let riskLevel;
  if (score <= 3)      riskLevel = 'LOW';
  else if (score <= 5) riskLevel = 'GUARDED';
  else if (score <= 7) riskLevel = 'ELEVATED';
  else if (score <= 9) riskLevel = 'HIGH';
  else                 riskLevel = 'CRITICAL';

  return { score, components, riskLevel };
}
