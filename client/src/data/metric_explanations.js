/**
 * client/src/data/metric_explanations.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Static map of metric card keys to plain-English explanation objects.
 * Used by InfoTooltip and as subtitle text in each metric card.
 *
 * Shape per entry:
 *   subtitle              – one line shown directly under the card title
 *   description           – what the metric is in plain English
 *   healthyRange          – what a good value looks like
 *   scoreImpactDescription – how it feeds into the Po-Ko score
 */

export const METRIC_EXPLANATIONS = {
  hrv: {
    subtitle: 'How much your heart rate varied during sleep - a key recovery signal',
    description:
      'Heart Rate Variability (HRV) measures the millisecond-level variation between heartbeats overnight. ' +
      'Higher variability means your autonomic nervous system is well-recovered and ready to adapt to stress. ' +
      'Lower variability signals your body is still under load from the previous day.',
    healthyRange:
      'Personal baselines vary widely (30-100 ms is typical). What matters most is your own 7-day average - ' +
      'staying within 5–8% of that baseline indicates full recovery.',
    scoreImpactDescription:
      'HRV carries 40% of the Po-Ko score weight - the largest single component. ' +
      'A drop ≥8% from your 7-day baseline triggers a moderate penalty; ≥15% is elevated; ≥25% is severe.',
  },

  sleep: {
    subtitle: "Garmin's overall sleep quality rating combining duration, depth, and restfulness",
    description:
      "Garmin's Sleep Score (0–100) combines total sleep duration, time spent in deep and REM sleep, " +
      'the number of wake events, and SpO2 stability overnight. It is the most direct daily measure ' +
      'of cognitive restoration and memory consolidation.',
    healthyRange:
      '85–100 is Excellent. 70–84 is Good. 55–69 is Fair. Below 55 is Poor. ' +
      'Consistently scoring above 70 supports full cognitive capacity the next day.',
    scoreImpactDescription:
      'Sleep carries 30% of the Po-Ko score weight. A score below 85 begins adding a penalty; ' +
      'below 70 is meaningful; below 55 is significant; below 40 approaches maximum penalty.',
  },

  timeInBed: {
    subtitle: 'Total time between getting into and out of bed, including any wake periods',
    description:
      'Time In Bed is calculated from your recorded bedtime to wake time, including any periods ' +
      'where the wearable detected you were awake. It differs from Sleep Duration, which counts ' +
      'only the time the sensor confirmed you were actually asleep.',
    healthyRange:
      '7–9 hours is the recommended range for most adults. The gap between Time In Bed and ' +
      'Sleep Duration (the "unrecorded gap") ideally stays under 30 minutes.',
    scoreImpactDescription:
      'Time In Bed itself does not directly score - the Sensor Gap component (10% weight) penalises ' +
      'gaps larger than 60 minutes, which typically signal the wearable was removed during the night.',
  },

  stress: {
    subtitle: "Your body's physiological stress level averaged across the whole day",
    description:
      "Garmin's Average Stress score (0–100) reflects your autonomic nervous system's sympathetic " +
      'activation throughout the day, derived continuously from HRV patterns while awake. ' +
      'It captures both psychological stress and physical load - a hard workout raises it just as a ' +
      'tense meeting does.',
    healthyRange:
      '0–25 is Calm. 26–40 is Low. 41–60 is Moderate. 61–75 is High. Above 75 is Very High. ' +
      'Sustained scores above 60 for multiple consecutive days indicate significant allostatic load.',
    scoreImpactDescription:
      'Stress carries 20% of the Po-Ko score weight. A score above 25 begins adding a penalty; ' +
      'above 60 is elevated; above 75 approaches maximum penalty.',
  },
};
