/**
 * Po-Ko Predictive Scoring Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports:
 *   • calculatePoKoScore(dailyMetrics, externalFactors?)
 *       Single-day risk score with optional self-reported external factor fusion.
 *   • analyzeTrend(historicalDataArray)
 *       72-Hour Rebound Rule multi-day pattern detector.
 *   • getSurveyQuestions(dailyMetrics)
 *       Intelligently selects ≤2 micro-survey questions based on live metrics.
 *
 * Returns a Po-Ko Risk Score on a 1–10 integer scale:
 *   1–3  → LOW RISK    – Developer is recovered and cognitively ready.
 *   4–5  → GUARDED     – Minor deficit detected; sustenance prompts advised.
 *   6–7  → ELEVATED    – Meaningful recovery gap; pacing and hydration critical.
 *   8–9  → HIGH RISK   – Significant fatigue signal; consider workload re-routing.
 *  10    → CRITICAL    – Active Support State threshold breached.
 *
 * Biometric Scoring Architecture (weighted penalty system, 0–10 raw):
 * ┌──────────────────────────────┬────────┬──────────────────────────────────┐
 * │ Signal                       │ Weight │ Rationale                        │
 * ├──────────────────────────────┼────────┼──────────────────────────────────┤
 * │ HRV Deviation from Baseline  │  40 %  │ Strongest single recovery proxy  │
 * │ Sleep Score                  │  30 %  │ Direct cognitive capacity metric │
 * │ Average Stress               │  20 %  │ Cumulative allostatic load        │
 * │ Sensor Gap Flag              │  10 %  │ Data-quality / unreliability bump │
 * └──────────────────────────────┴────────┴──────────────────────────────────┘
 *
 * External Factor Scoring (additive penalty applied after biometric base):
 * ┌─────────────────────────────────┬──────────┬─────────────────────────────────────────────────────┐
 * │ External Factor                 │ Penalty  │ Notes                                               │
 * ├─────────────────────────────────┼──────────┼─────────────────────────────────────────────────────┤
 * │ exposedToSickPerson             │  +1.5    │ Elevated alone; compound with HRV drop → +3.5       │
 * │ severeAllergiesToday            │  +0.8    │ Immune activation mimics early illness signals       │
 * │ highWorkloadDeadline            │  +0.7    │ Sustained pressure accelerates allostatic load       │
 * │ poorDietToday                   │  +0.5    │ Nutrient deficit reduces recovery capacity           │
 * │ alcoholLastNight                │  +1.2    │ Strong HRV suppressor; confirmed by research        │
 * │ highCaffeineToday               │  +0.4    │ Masks fatigue, inflates stress readings              │
 * │ missedMealToday                 │  +0.5    │ Energy deficit compounds cognitive load              │
 * │ emotionallyDrained              │  +1.0    │ Psychological load; direct stress amplifier          │
 * │ travelOrJetLag                  │  +1.0    │ Circadian disruption suppresses HRV independently    │
 * │ physicallyOverexerted           │  +0.8    │ Acute training load; expected temporary HRV drop     │
 * │ medicationSideEffects           │  +0.6    │ User-reported impairment signal                      │
 * └─────────────────────────────────┴──────────┴─────────────────────────────────────────────────────┘
 *
 * Compound Interaction Rules (applied on top of individual penalties):
 *   • exposedToSickPerson + HRV dropping → additional +2.0 (confirms internal vulnerability + external threat)
 *   • alcoholLastNight + HRV dropping    → additional +1.0 (confirms substance-driven suppression)
 *   • travelOrJetLag + poor sleep        → additional +0.8 (circadian disruption confirmed by data)
 *   • highWorkloadDeadline + emotionallyDrained → additional +0.5 (compounded psychological load)
 */

// ─── Biometric Constants ──────────────────────────────────────────────────────

/** Biometric component weights — must sum to 1.0 */
const WEIGHTS = {
  hrv:       0.40,
  sleep:     0.30,
  stress:    0.20,
  sensorGap: 0.10,
};

/**
 * HRV drop thresholds (as a percentage below the 7-day rolling baseline).
 * Research benchmark: >8 % drop is a meaningful recovery signal;
 * >20 % indicates significant physiological stress.
 */
const HRV_DROP = {
  NONE:     0,
  MILD:     0.08,  // 8 %  drop → moderate penalty begins
  MODERATE: 0.15,  // 15 % drop → elevated penalty
  SEVERE:   0.25,  // 25 % drop → near-maximum penalty
};

/** Sleep score band boundaries (Garmin 0–100 scale) */
const SLEEP = {
  EXCELLENT: 85,
  GOOD:      70,
  FAIR:      55,
  POOR:      40,
};

/** Average stress band boundaries (Garmin 0–100 scale) */
const STRESS = {
  CALM:     25,
  LOW:      40,
  MODERATE: 60,
  HIGH:     75,
};

// ─── External Factor Constants ────────────────────────────────────────────────

/**
 * Additive score penalties for each self-reported external factor (true = active).
 * These are applied to the biometric base score AFTER the weighted sum.
 */
const EXTERNAL_PENALTIES = {
  exposedToSickPerson:    1.5,
  severeAllergiesToday:   0.8,
  highWorkloadDeadline:   0.7,
  poorDietToday:          0.5,
  alcoholLastNight:       1.2,
  highCaffeineToday:      0.4,
  missedMealToday:        0.5,
  emotionallyDrained:     1.0,
  travelOrJetLag:         1.0,
  physicallyOverexerted:  0.8,
  medicationSideEffects:  0.6,
};

/**
 * Additional compound interaction bonuses applied when two signals co-occur.
 * Each entry: { factors: [...keys], condition: fn(metrics, factors), bonus: number, label: string }
 * condition receives (dailyMetrics, externalFactors) and returns true when the
 * interaction should fire.
 */
const COMPOUND_INTERACTIONS = [
  {
    label: 'Exposure + HRV dropping',
    factors: ['exposedToSickPerson'],
    condition: (m) => {
      const drop = (m['7d_Avg_HRV_ms'] - m.Overnight_HRV_ms) / (m['7d_Avg_HRV_ms'] || 1);
      return drop >= HRV_DROP.MILD;
    },
    bonus: 2.0,
  },
  {
    label: 'Alcohol + HRV dropping',
    factors: ['alcoholLastNight'],
    condition: (m) => {
      const drop = (m['7d_Avg_HRV_ms'] - m.Overnight_HRV_ms) / (m['7d_Avg_HRV_ms'] || 1);
      return drop >= HRV_DROP.MILD;
    },
    bonus: 1.0,
  },
  {
    label: 'Travel/Jet-lag + poor sleep',
    factors: ['travelOrJetLag'],
    condition: (m) => m.Sleep_Score < SLEEP.GOOD,
    bonus: 0.8,
  },
  {
    label: 'High workload + emotionally drained',
    factors: ['highWorkloadDeadline', 'emotionallyDrained'],
    condition: () => true, // Both flags being true IS the condition; checked in caller
    bonus: 0.5,
  },
];

// ─── Trend constant ───────────────────────────────────────────────────────────

/**
 * Score boost applied to the most-recent day's Po-Ko score when the
 * 72-Hour Rebound Rule fires.
 */
const TREND_BOOST = 1.5;

// ─── Internal Biometric Scorers ───────────────────────────────────────────────

/**
 * Returns a 0–10 penalty for HRV deviation below the 7-day rolling baseline.
 * @param {number} hrv      - Overnight_HRV_ms
 * @param {number} baseline - 7d_Avg_HRV_ms
 * @returns {number}
 */
function scoreHRV(hrv, baseline) {
  if (!baseline || baseline <= 0) return 5;
  const drop = (baseline - hrv) / baseline;
  if (drop <= HRV_DROP.NONE)    return 0;
  if (drop < HRV_DROP.MILD)     return 2;
  if (drop < HRV_DROP.MODERATE) return 5;
  if (drop < HRV_DROP.SEVERE)   return 7;
  return 10;
}

/**
 * Returns a 0–10 penalty for sleep quality.
 * @param {number} sleepScore - Sleep_Score (0–100)
 * @returns {number}
 */
function scoreSleep(sleepScore) {
  if (sleepScore >= SLEEP.EXCELLENT) return 0;
  if (sleepScore >= SLEEP.GOOD)      return 3;
  if (sleepScore >= SLEEP.FAIR)      return 6;
  if (sleepScore >= SLEEP.POOR)      return 8;
  return 10;
}

/**
 * Returns a 0–10 penalty for average daily stress.
 * @param {number} avgStress - Avg_Stress (0–100)
 * @returns {number}
 */
function scoreStress(avgStress) {
  if (avgStress <= STRESS.CALM)     return 0;
  if (avgStress <= STRESS.LOW)      return 2;
  if (avgStress <= STRESS.MODERATE) return 5;
  if (avgStress <= STRESS.HIGH)     return 7;
  return 10;
}

/**
 * Returns a 0–10 penalty for a sensor gap flag.
 * @param {boolean} sensorGapFlag
 * @returns {number}
 */
function scoreSensorGap(sensorGapFlag) {
  return sensorGapFlag ? 10 : 0;
}

// ─── External Factor Scorer ───────────────────────────────────────────────────

/**
 * Calculates the total additive penalty from self-reported external factors,
 * including compound interaction bonuses.
 *
 * @param {object} dailyMetrics    - Biometric data (used for compound condition checks)
 * @param {object} externalFactors - Key/value map of boolean external factors
 * @returns {{
 *   totalPenalty: number,         // Sum of all applicable external penalties
 *   activeFactor: string[],       // Which individual factors were true
 *   activeCompounds: string[],    // Which compound interactions fired
 *   breakdown: object             // Per-factor penalty amounts for transparency
 * }}
 */
function scoreExternalFactors(dailyMetrics, externalFactors) {
  if (!externalFactors || typeof externalFactors !== 'object') {
    return { totalPenalty: 0, activeFactors: [], activeCompounds: [], breakdown: {} };
  }

  const activeFactors = [];
  const breakdown = {};
  let totalPenalty = 0;

  // --- Individual factor penalties ---
  for (const [key, penalty] of Object.entries(EXTERNAL_PENALTIES)) {
    if (externalFactors[key] === true) {
      activeFactors.push(key);
      breakdown[key] = penalty;
      totalPenalty += penalty;
    }
  }

  // --- Compound interaction bonuses ---
  const activeCompounds = [];
  for (const interaction of COMPOUND_INTERACTIONS) {
    // All listed factors must be true
    const allFactorsActive = interaction.factors.every((f) => externalFactors[f] === true);
    if (!allFactorsActive) continue;

    // Biometric/metric condition must also be satisfied
    if (interaction.condition(dailyMetrics, externalFactors)) {
      activeCompounds.push(interaction.label);
      breakdown[`compound:${interaction.label}`] = interaction.bonus;
      totalPenalty += interaction.bonus;
    }
  }

  return { totalPenalty, activeFactors, activeCompounds, breakdown };
}

// ─── Survey Question Definitions ─────────────────────────────────────────────

/**
 * Master catalogue of all micro-survey questions.
 * Each question has:
 *   id         – matches the corresponding externalFactors key
 *   question   – concise yes/no question shown to the developer
 *   trigger    – function(dailyMetrics) → boolean; returns true when this question is relevant
 *   priority   – lower number = asked first when multiple questions qualify
 */
export const SURVEY_QUESTIONS = [
  {
    id: 'exposedToSickPerson',
    question: 'Have you been in close contact with someone who is sick?',
    trigger: (m) => {
      // Ask when HRV is dropping — confirms whether external exposure explains the drop
      const drop = (m['7d_Avg_HRV_ms'] - m.Overnight_HRV_ms) / (m['7d_Avg_HRV_ms'] || 1);
      return drop >= HRV_DROP.MILD;
    },
    priority: 1,
  },
  {
    id: 'alcoholLastNight',
    question: 'Did you consume alcohol last night?',
    trigger: (m) => {
      // Ask when HRV is notably suppressed with no obvious training load explanation
      const drop = (m['7d_Avg_HRV_ms'] - m.Overnight_HRV_ms) / (m['7d_Avg_HRV_ms'] || 1);
      return drop >= HRV_DROP.MODERATE;
    },
    priority: 2,
  },
  {
    id: 'poorDietToday',
    question: 'Would you describe yesterday\'s diet as notably poor?',
    trigger: (m) => {
      // Ask when sleep AND recovery are both impacted
      return m.Sleep_Score < SLEEP.GOOD && m.Body_Battery !== undefined && m.Body_Battery < 50;
    },
    priority: 5,
  },
  {
    id: 'travelOrJetLag',
    question: 'Are you currently travelling or experiencing jet lag?',
    trigger: (m) => {
      // Ask when sleep is poor and there's an HRV drop (circadian disruption pattern)
      const drop = (m['7d_Avg_HRV_ms'] - m.Overnight_HRV_ms) / (m['7d_Avg_HRV_ms'] || 1);
      return m.Sleep_Score < SLEEP.FAIR && drop >= HRV_DROP.MILD;
    },
    priority: 3,
  },
  {
    id: 'physicallyOverexerted',
    question: 'Did you do an intense or unusually long workout yesterday?',
    trigger: (m) => {
      // Ask when HRV is significantly suppressed — training load is a common benign cause
      const drop = (m['7d_Avg_HRV_ms'] - m.Overnight_HRV_ms) / (m['7d_Avg_HRV_ms'] || 1);
      return drop >= HRV_DROP.MODERATE;
    },
    priority: 2,
  },
  {
    id: 'emotionallyDrained',
    question: 'Are you feeling emotionally drained or overwhelmed today?',
    trigger: (m) => {
      // Ask when stress is high — confirms psychological vs physiological load
      return m.Avg_Stress > STRESS.MODERATE;
    },
    priority: 3,
  },
  {
    id: 'highWorkloadDeadline',
    question: 'Do you have a high-pressure deadline or urgent deliverable today?',
    trigger: (m) => m.Avg_Stress > STRESS.LOW,
    priority: 4,
  },
  {
    id: 'severeAllergiesToday',
    question: 'Are your allergies significantly flaring up today?',
    trigger: (m) => {
      // Ask when Respiration is elevated OR during typical allergy season combined with poor recovery
      return (m.Respiration !== undefined && m.Respiration > 16) || m.Sleep_Score < SLEEP.FAIR;
    },
    priority: 4,
  },
  {
    id: 'missedMealToday',
    question: 'Did you skip a meal today or yesterday?',
    trigger: (m) => {
      // Ask when body battery is low and stress is moderate+
      return (m.Body_Battery !== undefined && m.Body_Battery < 40) && m.Avg_Stress > STRESS.LOW;
    },
    priority: 5,
  },
  {
    id: 'medicationSideEffects',
    question: 'Are you experiencing any medication side effects today?',
    trigger: (m) => {
      // Ask when multiple signals are unexpectedly poor simultaneously
      const drop = (m['7d_Avg_HRV_ms'] - m.Overnight_HRV_ms) / (m['7d_Avg_HRV_ms'] || 1);
      return drop >= HRV_DROP.MODERATE && m.Sleep_Score < SLEEP.GOOD && m.Avg_Stress > STRESS.LOW;
    },
    priority: 6,
  },
  {
    id: 'highCaffeineToday',
    question: 'Have you had significantly more caffeine than usual today?',
    trigger: (m) => m.Avg_Stress > STRESS.MODERATE && m.Sleep_Score < SLEEP.GOOD,
    priority: 6,
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Intelligently selects up to 2 micro-survey questions based on today's biometric
 * signals. Only questions whose trigger condition is satisfied are candidates.
 * The top 2 by priority (lowest number = highest priority) are returned.
 *
 * @param {object} dailyMetrics - Today's biometric telemetry object
 * @returns {Array<{ id: string, question: string }>} 0–2 question objects
 */
export function getSurveyQuestions(dailyMetrics) {
  if (!dailyMetrics || typeof dailyMetrics !== 'object') return [];

  const triggered = SURVEY_QUESTIONS
    .filter((q) => {
      try { return q.trigger(dailyMetrics); }
      catch { return false; }
    })
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 2);

  return triggered.map(({ id, question }) => ({ id, question }));
}

/**
 * Calculates the Po-Ko Risk Score for a single day's biometric entry,
 * optionally fused with self-reported external factor data.
 *
 * @param {object}  dailyMetrics
 * @param {number}  dailyMetrics.Overnight_HRV_ms  - Overnight HRV in milliseconds
 * @param {number}  dailyMetrics['7d_Avg_HRV_ms']  - 7-day rolling average HRV
 * @param {number}  dailyMetrics.Sleep_Score        - Garmin sleep score (0–100)
 * @param {number}  dailyMetrics.Avg_Stress         - Average stress score (0–100)
 * @param {boolean} dailyMetrics.Sensor_Gap_Flag    - True if sensor drop was detected
 * @param {boolean} [dailyMetrics.trendWarning]     - Optional flag from analyzeTrend()
 *
 * @param {object}  [externalFactors]               - Optional self-reported survey data
 * @param {boolean} [externalFactors.exposedToSickPerson]
 * @param {boolean} [externalFactors.severeAllergiesToday]
 * @param {boolean} [externalFactors.highWorkloadDeadline]
 * @param {boolean} [externalFactors.poorDietToday]
 * @param {boolean} [externalFactors.alcoholLastNight]
 * @param {boolean} [externalFactors.highCaffeineToday]
 * @param {boolean} [externalFactors.missedMealToday]
 * @param {boolean} [externalFactors.emotionallyDrained]
 * @param {boolean} [externalFactors.travelOrJetLag]
 * @param {boolean} [externalFactors.physicallyOverexerted]
 * @param {boolean} [externalFactors.medicationSideEffects]
 *
 * @returns {{
 *   score: number,                  // Final clamped Po-Ko score (1–10)
 *   components: object,             // Individual 0–10 biometric sub-scores
 *   externalFactorResult: object,   // External factor scoring detail
 *   riskLevel: string,              // Human-readable risk tier label
 *   trendBoosted: boolean,          // True when the trend boost was applied
 *   externalFactorsApplied: boolean // True when external factors were present
 * }}
 */
export function calculatePoKoScore(dailyMetrics, externalFactors = null) {
  const {
    Overnight_HRV_ms,
    '7d_Avg_HRV_ms': baseline_HRV,
    Sleep_Score,
    Avg_Stress,
    Sensor_Gap_Flag,
    trendWarning = false,
  } = dailyMetrics;

  // --- Biometric component penalties (each 0–10) ---
  const components = {
    hrv:       scoreHRV(Overnight_HRV_ms, baseline_HRV),
    sleep:     scoreSleep(Sleep_Score),
    stress:    scoreStress(Avg_Stress),
    sensorGap: scoreSensorGap(Sensor_Gap_Flag),
  };

  // --- Weighted biometric base score ---
  let rawScore =
    components.hrv       * WEIGHTS.hrv   +
    components.sleep     * WEIGHTS.sleep  +
    components.stress    * WEIGHTS.stress +
    components.sensorGap * WEIGHTS.sensorGap;

  // --- 72-Hour Rebound Rule boost ---
  if (trendWarning) rawScore += TREND_BOOST;

  // --- External factor fusion ---
  const externalFactorResult = scoreExternalFactors(dailyMetrics, externalFactors);
  rawScore += externalFactorResult.totalPenalty;

  // --- Clamp to [1, 10] and round to one decimal ---
  const score = Math.min(10, Math.max(1, Math.round(rawScore * 10) / 10));

  // --- Derive human-readable risk tier ---
  let riskLevel;
  if (score <= 3)      riskLevel = 'LOW';
  else if (score <= 5) riskLevel = 'GUARDED';
  else if (score <= 7) riskLevel = 'ELEVATED';
  else if (score <= 9) riskLevel = 'HIGH';
  else                 riskLevel = 'CRITICAL';

  return {
    score,
    components,
    externalFactorResult,
    riskLevel,
    trendBoosted: trendWarning,
    externalFactorsApplied: externalFactorResult.activeFactors.length > 0,
  };
}

/**
 * 72-Hour Rebound Rule — multi-day pattern detector.
 *
 * Analyses the last 2–3 days of telemetry for the specific dual-signal pattern
 * that precedes impending sickness:
 *   • Overnight_HRV_ms is in a consecutive DOWNWARD trend across all entries.
 *   • Avg_Stress       is in a consecutive UPWARD  trend across all entries.
 *
 * Both conditions must be true simultaneously.
 * Array must be ordered oldest → newest (index 0 = oldest).
 * Minimum 2 entries required.
 *
 * @param {Array<{Overnight_HRV_ms: number, Avg_Stress: number}>} historicalDataArray
 * @returns {{
 *   impendingSicknessWarning: boolean,
 *   reason: string,
 *   hrvTrend:    'FALLING' | 'FLAT/RISING' | 'INSUFFICIENT_DATA',
 *   stressTrend: 'RISING'  | 'FLAT/FALLING' | 'INSUFFICIENT_DATA'
 * }}
 */
export function analyzeTrend(historicalDataArray) {
  if (!Array.isArray(historicalDataArray) || historicalDataArray.length < 2) {
    return {
      impendingSicknessWarning: false,
      reason: 'Insufficient data: at least 2 days of telemetry are required.',
      hrvTrend:    'INSUFFICIENT_DATA',
      stressTrend: 'INSUFFICIENT_DATA',
    };
  }

  let hrvFalling = true;
  for (let i = 1; i < historicalDataArray.length; i++) {
    if (historicalDataArray[i].Overnight_HRV_ms >= historicalDataArray[i - 1].Overnight_HRV_ms) {
      hrvFalling = false;
      break;
    }
  }

  let stressRising = true;
  for (let i = 1; i < historicalDataArray.length; i++) {
    if (historicalDataArray[i].Avg_Stress <= historicalDataArray[i - 1].Avg_Stress) {
      stressRising = false;
      break;
    }
  }

  const hrvTrend    = hrvFalling   ? 'FALLING'      : 'FLAT/RISING';
  const stressTrend = stressRising ? 'RISING'       : 'FLAT/FALLING';
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
