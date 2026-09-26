/**
 * ScoreBreakdownPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Props:
 *   today  {object}  – the scored telemetry day from the telemetry array
 *
 * Shows how each component contributed to the final Po-Ko score:
 *   • HRV (40%), Sleep (30%), Stress (20%), Sensor Gap (10%)
 *   • External factors section when poko_external_applied is true
 *   • Learning-engine pattern warnings when present
 */
export default function ScoreBreakdownPanel({ today }) {
  if (!today?.poko_components) return null;

  const { hrv, sleep, stress, sensorGap } = today.poko_components;

  const components = [
    {
      name:    'HRV Recovery',
      weight:  '40%',
      penalty: hrv,
      value:   today.Overnight_HRV_ms != null
        ? `${today.Overnight_HRV_ms} ms (baseline ${today['7d_Avg_HRV_ms']} ms)`
        : '-',
      interpretation: interpretHRV(hrv, today.Overnight_HRV_ms, today['7d_Avg_HRV_ms']),
    },
    {
      name:    'Sleep Quality',
      weight:  '30%',
      penalty: sleep,
      value:   today.Sleep_Score != null ? `${today.Sleep_Score}/100` : '-',
      interpretation: interpretSleep(sleep, today.Sleep_Score),
    },
    {
      name:    'Avg Stress',
      weight:  '20%',
      penalty: stress,
      value:   today.Avg_Stress != null ? `${today.Avg_Stress}/100` : '-',
      interpretation: interpretStress(stress, today.Avg_Stress),
    },
    {
      name:    'Sensor Gap',
      weight:  '10%',
      penalty: sensorGap,
      value:   today.Sensor_Gap_Flag ? 'Gap detected (>60 min)' : 'No gap',
      interpretation: sensorGap === 0
        ? 'Wearable worn throughout the night - full data confidence.'
        : 'Large unrecorded window detected, likely wearable removal. Data confidence reduced.',
    },
  ];

  const externalFactors  = today.poko_external_factors;
  const patternWarnings  = today.poko_pattern_warnings ?? [];
  const trendBoosted     = today.poko_trend_boosted;

  return (
    <div style={styles.panel}>
      <p style={styles.panelTitle}>Score breakdown - {today.Date}</p>

      {/* Biometric components table */}
      <div style={styles.table}>
        {/* Header */}
        <div style={{ ...styles.row, ...styles.headerRow }}>
          <span style={styles.colName}>Component</span>
          <span style={styles.colWeight}>Weight</span>
          <span style={styles.colPenalty}>Penalty</span>
          <span style={styles.colValue}>Value</span>
        </div>

        {components.map((c) => (
          <div key={c.name} style={styles.row}>
            <div style={styles.colName}>
              <span style={styles.compName}>{c.name}</span>
              <span style={styles.compInterp}>{c.interpretation}</span>
            </div>
            <span style={styles.colWeight}>{c.weight}</span>
            <span style={{ ...styles.colPenalty, color: penaltyColor(c.penalty) }}>
              {c.penalty}/10
            </span>
            <span style={styles.colValue}>{c.value}</span>
          </div>
        ))}
      </div>

      {/* Additive items */}
      {(trendBoosted || (externalFactors?.activeFactors?.length > 0) || patternWarnings.length > 0) && (
        <div style={styles.additivesSection}>
          <p style={styles.additivesTitle}>Additive penalties</p>

          {trendBoosted && (
            <div style={styles.additiveRow}>
              <span style={styles.additiveLabel}>72-Hour Rebound Rule</span>
              <span style={{ ...styles.additiveValue, color: '#f87171' }}>+1.5</span>
            </div>
          )}

          {externalFactors?.activeFactors?.map((factor) => (
            <div key={factor} style={styles.additiveRow}>
              <span style={styles.additiveLabel}>{humaniseFactor(factor)}</span>
              <span style={{ ...styles.additiveValue, color: '#fb923c' }}>
                +{(externalFactors.breakdown?.[factor] ?? 0).toFixed(1)}
              </span>
            </div>
          ))}

          {externalFactors?.activeCompounds?.map((compound) => (
            <div key={compound} style={styles.additiveRow}>
              <span style={{ ...styles.additiveLabel, color: '#f87171' }}>
                Compound: {compound}
              </span>
              <span style={{ ...styles.additiveValue, color: '#f87171' }}>
                +{(externalFactors.breakdown?.[`compound:${compound}`] ?? 0).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Learning engine pattern warnings */}
      {patternWarnings.length > 0 && (
        <div style={styles.patternsSection}>
          <p style={styles.additivesTitle}>Learned pattern matches</p>
          {patternWarnings.map((w) => (
            <div key={w.patternId} style={styles.patternRow}>
              <span style={styles.patternName}>{w.name}</span>
              <span style={styles.patternMsg}>{w.warningMessage}</span>
            </div>
          ))}
        </div>
      )}

      {/* Final score line */}
      <div style={styles.totalRow}>
        <span style={styles.totalLabel}>Final Po-Ko Score</span>
        <span style={{ ...styles.totalValue, color: riskColor(today.poko_risk_level) }}>
          {today.poko_score}/10 - {today.poko_risk_level}
        </span>
      </div>
    </div>
  );
}

// ─── Interpretation helpers ───────────────────────────────────────────────────

function interpretHRV(penalty, hrv, baseline) {
  if (penalty === 0) return 'HRV at or above baseline - full autonomic recovery.';
  if (penalty <= 2)  return 'Minor HRV dip (<8%) - within normal daily variation.';
  if (penalty <= 5)  return `HRV ${hrv && baseline ? Math.round(((baseline - hrv) / baseline) * 100) : ''}% below baseline - meaningful recovery deficit.`;
  if (penalty <= 7)  return 'Significant HRV suppression - elevated physiological stress.';
  return 'Severe HRV suppression (>25% below baseline) - high fatigue load.';
}

function interpretSleep(penalty, score) {
  if (penalty === 0) return 'Excellent sleep - full cognitive restoration.';
  if (penalty <= 3)  return 'Good sleep quality - minor restoration gap.';
  if (penalty <= 6)  return `Fair sleep (score ${score}) - working memory and focus reduced.`;
  if (penalty <= 8)  return 'Poor sleep - significant cognitive capacity impact.';
  return 'Very poor sleep - sustained attention and decision-making substantially impaired.';
}

function interpretStress(penalty, stress) {
  if (penalty === 0) return 'Calm autonomic state - parasympathetic dominance.';
  if (penalty <= 2)  return 'Low-level stress - normal for an active workday.';
  if (penalty <= 5)  return `Moderate sustained stress (${stress}) - allostatic load accumulating.`;
  if (penalty <= 7)  return 'High stress - cortisol and sympathetic activation elevated.';
  return 'Very high stress - immune suppression and recovery impairment likely.';
}

function penaltyColor(penalty) {
  if (penalty === 0)  return '#4ade80';
  if (penalty <= 3)   return '#a3e635';
  if (penalty <= 5)   return '#facc15';
  if (penalty <= 7)   return '#fb923c';
  return '#f87171';
}

function riskColor(level) {
  switch (level) {
    case 'LOW':      return '#4ade80';
    case 'GUARDED':  return '#facc15';
    case 'ELEVATED': return '#fb923c';
    case 'HIGH':     return '#f87171';
    case 'CRITICAL': return '#dc2626';
    default:         return '#94a3b8';
  }
}

function humaniseFactor(id) {
  const MAP = {
    exposedToSickPerson:   'Sick person exposure',
    severeAllergiesToday:  'Severe allergies',
    highWorkloadDeadline:  'High-pressure deadline',
    poorDietToday:         'Poor diet',
    alcoholLastNight:      'Alcohol last night',
    highCaffeineToday:     'High caffeine',
    missedMealToday:       'Missed meal',
    emotionallyDrained:    'Emotionally drained',
    travelOrJetLag:        'Travel / jet lag',
    physicallyOverexerted: 'Physical overexertion',
    medicationSideEffects: 'Medication side effects',
  };
  return MAP[id] ?? id;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  panel: {
    backgroundColor: '#1e222a',
    border: '1px solid #2d3340',
    borderRadius: '10px',
    padding: '16px',
    marginTop: '10px',
    fontSize: '0.82rem',
  },
  panelTitle: {
    margin: '0 0 12px 0',
    fontSize: '0.78rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#57606a',
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '12px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 52px 60px 1fr',
    alignItems: 'start',
    gap: '8px',
    padding: '8px 0',
    borderBottom: '1px solid #1a1e26',
  },
  headerRow: {
    borderBottom: '1px solid #2d3340',
    paddingBottom: '6px',
    marginBottom: '2px',
  },
  colName: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  colWeight: {
    color: '#57606a',
    fontSize: '0.75rem',
    textAlign: 'center',
    paddingTop: '1px',
  },
  colPenalty: {
    fontWeight: 700,
    fontSize: '0.85rem',
    textAlign: 'center',
    paddingTop: '1px',
  },
  colValue: {
    color: '#94a3b8',
    fontSize: '0.75rem',
    paddingTop: '1px',
  },
  compName: {
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: '0.82rem',
  },
  compInterp: {
    color: '#57606a',
    fontSize: '0.74rem',
    lineHeight: 1.4,
  },
  additivesSection: {
    borderTop: '1px solid #2d3340',
    paddingTop: '10px',
    marginBottom: '10px',
  },
  additivesTitle: {
    margin: '0 0 6px 0',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#57606a',
  },
  additiveRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    borderBottom: '1px solid #1a1e26',
  },
  additiveLabel: {
    color: '#94a3b8',
  },
  additiveValue: {
    fontWeight: 700,
  },
  patternsSection: {
    borderTop: '1px solid #2d3340',
    paddingTop: '10px',
    marginBottom: '10px',
  },
  patternRow: {
    padding: '6px 0',
    borderBottom: '1px solid #1a1e26',
  },
  patternName: {
    display: 'block',
    color: '#c4b5fd',
    fontWeight: 600,
    marginBottom: '2px',
  },
  patternMsg: {
    display: 'block',
    color: '#57606a',
    fontSize: '0.74rem',
    lineHeight: 1.4,
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    borderTop: '1px solid #2d3340',
    paddingTop: '10px',
    marginTop: '2px',
  },
  totalLabel: {
    color: '#94a3b8',
    fontWeight: 600,
  },
  totalValue: {
    fontWeight: 700,
    fontSize: '0.9rem',
  },
};
