import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, Heart, Moon, ShieldAlert, ClipboardList } from 'lucide-react';
import MicroSurvey from './MicroSurvey';
import SickDayButton from './SickDayButton';
import DailyLogModal from './DailyLogModal';
import LearningInsightsBadge from './LearningInsightsBadge';
import AdviceToast from './AdviceToast';
import InfoTooltip from './InfoTooltip';
import ScoreBreakdownPanel from './ScoreBreakdownPanel';
import { METRIC_EXPLANATIONS } from './data/metric_explanations.js';
import './App.css'

function App() {
  const [telemetry, setTelemetry] = useState([]);
  const [loading, setLoading] = useState(true);

  // Survey state
  const [surveyDate, setSurveyDate]         = useState(null);
  const [surveyQuestions, setSurveyQuestions] = useState([]);
  const [showSurvey, setShowSurvey]         = useState(false);
  const [surveyDismissed, setSurveyDismissed] = useState(false);

  // Daily log modal state
  const [showLogModal, setShowLogModal] = useState(false);

  // Score breakdown panel state
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Advice toasts state
  const [adviceItems, setAdviceItems]         = useState([]);
  const [dismissedAdvice, setDismissedAdvice] = useState(() => {
    try { return JSON.parse(localStorage.getItem('poko_dismissed_advice') || '{}'); }
    catch { return {}; }
  });

  // Fetches the 30 most-recent telemetry days from the server and stores them
  // oldest-first so the Recharts LineChart renders left-to-right chronologically.
  function fetchTelemetry() {
    return fetch('/api/telemetry?limit=30')
      .then((res) => res.json())
      .then((data) => {
        // API returns newest-first; reverse so index 0 = oldest for the chart x-axis
        setTelemetry(data.reverse());
      });
  }

  useEffect(() => {
    Promise.all([
      fetchTelemetry(),
      fetch('/api/survey/questions').then((r) => r.json()),
      fetch('/api/advice/today').then((r) => r.json()),
    ])
      .then(([, surveyData, todayAdvice]) => {
        if (!surveyData.alreadyAnswered && surveyData.questions.length > 0) {
          setSurveyDate(surveyData.date);
          setSurveyQuestions(surveyData.questions);
          setShowSurvey(true);
        }
        if (Array.isArray(todayAdvice)) {
          setAdviceItems(todayAdvice);
        }
      })
      .catch((err) => {
        console.error('Failed to boot Po-Ko:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  // Re-fetches telemetry after survey submission so the dashboard cards and chart
  // immediately reflect the newly fused external-factor penalties in the score.
  function handleSurveySubmit(updatedScore) {
    setShowSurvey(false);
    // updatedScore is passed from MicroSurvey but the full telemetry re-fetch is
    // simpler than trying to patch a single entry in the 30-day array.
    fetchTelemetry().catch(console.error);
  }

  function handleSurveyDismiss() {
    setShowSurvey(false);
    setSurveyDismissed(true);
  }

  function dismissAdvice(slot) {
    const today = new Date().toISOString().slice(0, 10);
    const key = `${today}_${slot}`;
    const updated = { ...dismissedAdvice, [key]: true };
    setDismissedAdvice(updated);
    localStorage.setItem('poko_dismissed_advice', JSON.stringify(updated));
  }

  if (loading) {
    return <div className="loading-screen">Booting Po-Ko Local Engine...</div>;
  }

  // Telemetry is sorted oldest→newest; the last element is always "today".
  // Fall back to an empty object so every optional-chain below renders '--'.
  const today = telemetry[telemetry.length - 1] || {};

  // Maps each Po-Ko risk tier to a matching colour used in the score circle,
  // trend-alert border and chart dot fills. Defaults to slate for missing data.
  const getRiskColor = (level) => {
    switch(level) {
      case 'LOW':      return '#4ade80'; // green
      case 'GUARDED':  return '#facc15'; // yellow
      case 'ELEVATED': return '#fb923c'; // orange
      case 'HIGH':     return '#f87171'; // light red
      case 'CRITICAL': return '#dc2626'; // deep red
      default:         return '#94a3b8'; // slate — data not yet computed
    }
  };

  const riskColor = getRiskColor(today.poko_risk_level);

  return (
    <div className="dashboard-container">
      {/* Micro-Survey modal — shown once per day when questions are triggered */}
      {showSurvey && surveyQuestions.length > 0 && (
        <MicroSurvey
          date={surveyDate}
          questions={surveyQuestions}
          onSubmit={handleSurveySubmit}
          onDismiss={handleSurveyDismiss}
        />
      )}

      {/* Daily Log Modal */}
      {showLogModal && (
        <DailyLogModal
          onClose={() => setShowLogModal(false)}
          onSubmit={() => { setShowLogModal(false); fetchTelemetry().catch(console.error); }}
        />
      )}

      <header className="dashboard-header">
        <div className="header-titles">
          <h1>Po-Ko Developer Capacity Framework</h1>
          <p className="subtitle">Proactive Care &amp; Risk Analytics</p>
          <p style={{ margin: '0', fontSize: '0.8rem', color: '#4a5568', maxWidth: '360px', lineHeight: 1.6 }}>
            <span style={{ color: '#6e7d8c', fontWeight: 600 }}>What is a Po-Ko score?</span>
            {' '}A number from <strong style={{ color: '#e6edf3' }}>0–10</strong> that fuses your overnight HRV, sleep quality, stress, and self-reported context into a single daily readiness signal.{' '}
            <strong style={{ color: '#3fb950' }}>Low</strong> = well-recovered.{' '}
            <strong style={{ color: '#f47067' }}>High</strong> = strain detected.
          </p>
        </div>

        {/* Header action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button
            onClick={() => setShowLogModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 16px',
              borderRadius: '8px',
              border: '1px solid #1f4068',
              backgroundColor: 'rgba(88, 166, 255, 0.06)',
              color: '#58a6ff',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
            }}
          >
            <ClipboardList size={14} />
            Log Today
          </button>
          <SickDayButton />
        </div>

        {/* Po-Ko Risk Score Circle + breakdown toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div className="score-container" style={{ borderColor: riskColor }}>
            <div className="score-value" style={{ color: riskColor }}>
              {today.poko_score || '--'}
            </div>
            <div className="score-label">Po-Ko Score</div>
            <div className="score-level" style={{ color: riskColor }}>
              {today.poko_risk_level || 'ANALYZING'}
            </div>
          </div>
          <button
            onClick={() => setShowBreakdown((v) => !v)}
            style={{
              background: 'transparent',
              border: '1px solid #21262d',
              borderRadius: '6px',
              color: '#58a6ff',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 12px',
              whiteSpace: 'nowrap',
              letterSpacing: '0.04em',
              transition: 'border-color 0.15s ease',
            }}
          >
            {showBreakdown ? 'hide breakdown ▴' : 'explain score ▾'}
          </button>
        </div>
      </header>

      {/* Score Breakdown Panel */}
      {showBreakdown && <ScoreBreakdownPanel today={today} />}

      {/* Active Trend Warning Banner */}
      {today.poko_trend_boosted && (
        <div style={{
          backgroundColor: 'rgba(248, 81, 73, 0.07)',
          border: '1px solid rgba(248, 81, 73, 0.35)',
          padding: '16px 20px',
          borderRadius: '10px',
          margin: '0 0 1.5rem 0',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
          color: '#c9d1d9',
        }}>
          <ShieldAlert size={20} color="#f47067" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: '#f47067', fontSize: '0.9rem' }}>Sickness Pattern Detected</p>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#8b949e', lineHeight: 1.6 }}>
              {today.poko_trend_details?.reason || 'HRV declining and stress rising over 2+ consecutive days. This pattern commonly precedes illness by 24–48 hours. Prioritise sleep and hydration today.'}
            </p>
          </div>
        </div>
      )}

      {/* External Factors Badge */}
      {today.poko_external_applied && (
        <div style={{
          backgroundColor: 'rgba(88, 166, 255, 0.05)',
          border: '1px solid rgba(88, 166, 255, 0.18)',
          padding: '12px 18px',
          borderRadius: '10px',
          margin: '0 0 1.5rem 0',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#8b949e',
          fontSize: '0.84rem',
        }}>
          <ShieldAlert size={16} color="#58a6ff" style={{ flexShrink: 0 }} />
          <span>
            <strong style={{ color: '#58a6ff' }}>External factors active</strong>
            {' — '}
            {today.poko_external_factors?.activeFactors?.join(', ') || 'self-reported data'}
            {' contributing '}
            <strong style={{ color: '#c9d1d9' }}>+{today.poko_external_factors?.totalPenalty?.toFixed(1)}</strong>
            {' to score.'}
            {today.poko_external_factors?.activeCompounds?.length > 0 && (
              <span style={{ color: '#f47067' }}>
                {' '}Compound risk: {today.poko_external_factors.activeCompounds.join(', ')}.
              </span>
            )}
          </span>
        </div>
      )}

      {/* Learning Insights Badge */}
      <LearningInsightsBadge />

      {/* Advice Toasts — show un-dismissed advice items for today */}
      {adviceItems
        .filter((a) => {
          const today = new Date().toISOString().slice(0, 10);
          return !dismissedAdvice[`${today}_${a.slot}`];
        })
        .map((a) => (
          <AdviceToast
            key={`${a.date}_${a.slot}`}
            advice={a}
            onDismiss={() => dismissAdvice(a.slot)}
          />
        ))
      }

      {/* Retrigger survey if dismissed */}
      {surveyDismissed && surveyQuestions.length > 0 && (
        <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
          <button
            onClick={() => { setShowSurvey(true); setSurveyDismissed(false); }}
            style={{
              background: 'none',
              border: '1px solid #21262d',
              borderRadius: '6px',
              color: '#6e7d8c',
              fontSize: '0.78rem',
              padding: '5px 12px',
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            Answer today's check-in →
          </button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="metric-cards">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Heart className="card-icon text-red" style={{ marginBottom: 0 }} />
            <InfoTooltip
              title="Overnight HRV"
              description={METRIC_EXPLANATIONS.hrv.description}
              healthyRange={METRIC_EXPLANATIONS.hrv.healthyRange}
              scoreImpactDescription={METRIC_EXPLANATIONS.hrv.scoreImpactDescription}
            />
          </div>
          <h3 style={{ marginTop: '1rem' }}>Overnight HRV</h3>
          <p style={{ margin: '0 0 6px 0', fontSize: '0.78rem', color: '#4a5568', lineHeight: 1.5 }}>
            {METRIC_EXPLANATIONS.hrv.subtitle}
          </p>
          <p className="card-value">{today.Overnight_HRV_ms || '--'} <span style={{ fontSize: '1rem', fontWeight: 400, color: '#6e7d8c' }}>ms</span></p>
          <p className="card-subtitle">7-day baseline: {today['7d_Avg_HRV_ms']} ms</p>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Moon className="card-icon text-blue" style={{ marginBottom: 0 }} />
            <InfoTooltip
              title="Sleep Quality"
              description={METRIC_EXPLANATIONS.sleep.description}
              healthyRange={METRIC_EXPLANATIONS.sleep.healthyRange}
              scoreImpactDescription={METRIC_EXPLANATIONS.sleep.scoreImpactDescription}
            />
          </div>
          <h3 style={{ marginTop: '1rem' }}>Sleep Quality</h3>
          <p style={{ margin: '0 0 6px 0', fontSize: '0.78rem', color: '#4a5568', lineHeight: 1.5 }}>
            {METRIC_EXPLANATIONS.sleep.subtitle}
          </p>
          <p className="card-value">{today.Sleep_Score || '--'} <span style={{ fontSize: '1rem', fontWeight: 400, color: '#6e7d8c' }}>/100</span></p>
          <p className="card-subtitle">{today.Sleep_Quality}</p>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Activity className="card-icon text-orange" style={{ marginBottom: 0 }} />
            <InfoTooltip
              title="Time in Bed"
              description={METRIC_EXPLANATIONS.timeInBed.description}
              healthyRange={METRIC_EXPLANATIONS.timeInBed.healthyRange}
              scoreImpactDescription={METRIC_EXPLANATIONS.timeInBed.scoreImpactDescription}
            />
          </div>
          <h3 style={{ marginTop: '1rem' }}>Time in Bed</h3>
          <p style={{ margin: '0 0 6px 0', fontSize: '0.78rem', color: '#4a5568', lineHeight: 1.5 }}>
            {METRIC_EXPLANATIONS.timeInBed.subtitle}
          </p>
          <p className="card-value">{today.Time_In_Bed_Minutes ? Math.round(today.Time_In_Bed_Minutes / 60 * 10) / 10 : '--'} <span style={{ fontSize: '1rem', fontWeight: 400, color: '#6e7d8c' }}>hrs</span></p>
          <p className="card-subtitle">Gap: {today.Unrecorded_Gaps_Minutes || 0} min unrecorded</p>
        </div>

        <div className="card alert-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <ShieldAlert className="card-icon text-yellow" style={{ marginBottom: 0 }} />
            <InfoTooltip
              title="Avg Daily Stress"
              description={METRIC_EXPLANATIONS.stress.description}
              healthyRange={METRIC_EXPLANATIONS.stress.healthyRange}
              scoreImpactDescription={METRIC_EXPLANATIONS.stress.scoreImpactDescription}
            />
          </div>
          <h3 style={{ marginTop: '1rem' }}>Avg Daily Stress</h3>
          <p style={{ margin: '0 0 6px 0', fontSize: '0.78rem', color: '#4a5568', lineHeight: 1.5 }}>
            {METRIC_EXPLANATIONS.stress.subtitle}
          </p>
          <p className="card-value">{today.Avg_Stress || '--'} <span style={{ fontSize: '1rem', fontWeight: 400, color: '#6e7d8c' }}>/100</span></p>
          <p className="card-subtitle">Daily average stress index</p>
        </div>
      </div>

      {/* 30-Day HRV Trend Chart */}
      <div className="chart-section">
        <h2>30-Day Recovery Trend — HRV vs Baseline</h2>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={telemetry} margin={{ top: 30, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2530" />
              <XAxis
                dataKey="Date"
                stroke="#4a5568"
                tick={{ fontSize: 11, fill: '#4a5568' }}
                tickLine={false}
                axisLine={{ stroke: '#21262d' }}
                tickFormatter={(dateStr) => {
                  const date = new Date(dateStr);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              {/* yAxisId="left" matches the id on the Overnight HRV Line below */}
              <YAxis yAxisId="left" stroke="#4a5568" tick={{ fontSize: 11, fill: '#4a5568' }} tickLine={false} axisLine={false} domain={['dataMin - 10', 'dataMax + 10']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#161b22', border: '1px solid #21262d', borderRadius: '8px', fontSize: '0.82rem' }}
                itemStyle={{ color: '#c9d1d9' }}
                labelStyle={{ color: '#6e7d8c', marginBottom: '4px' }}
              />
              {/* Dim grey baseline so the daily HRV line stands out against it */}
              <Line yAxisId="left" type="monotone" dataKey="7d_Avg_HRV_ms" stroke="#21262d" strokeWidth={2} dot={false} name="7-Day Baseline" />

              {/* Daily HRV line — each dot is custom-rendered so its colour and
                  size encode two independent signals at a glance:
                    • fill colour  → Po-Ko risk tier (green / orange / red)
                    • blue ring    → external factors were applied to that day's score
                    • larger radius when external factors active to ensure the ring is visible */}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="Overnight_HRV_ms"
                stroke="#4ade80"
                strokeWidth={3}
                name="Daily HRV"
                dot={(props) => {
                  const { cx, cy, payload, key } = props;
                  // Red diamond marker for sick days
                  if (payload.sick_day) {
                    return (
                      <polygon
                        key={key}
                        points={`${cx},${cy - 9} ${cx + 7},${cy} ${cx},${cy + 9} ${cx - 7},${cy}`}
                        fill="#f47067"
                        stroke="#30363d"
                        strokeWidth={1.5}
                      />
                    );
                  }
                  // Blue ring when external factors were fused into this day's score
                  const hasExternal = payload.poko_external_applied;
                  if (payload.poko_score >= 8) {
                    return <circle key={key} cx={cx} cy={cy} r={hasExternal ? 8 : 5} fill="#f47067" stroke={hasExternal ? '#58a6ff' : '#30363d'} strokeWidth={2} />;
                  }
                  if (payload.poko_score >= 6) {
                    return <circle key={key} cx={cx} cy={cy} r={hasExternal ? 7 : 5} fill="#f0883e" stroke={hasExternal ? '#58a6ff' : '#30363d'} strokeWidth={2} />;
                  }
                  return <circle key={key} cx={cx} cy={cy} r={hasExternal ? 6 : 4} fill="#3fb950" stroke={hasExternal ? '#58a6ff' : 'none'} strokeWidth={hasExternal ? 2 : 0} />;
                }}
                activeDot={{ r: 8 }}
              />
              {/* Vertical reference lines on sick days */}
              {telemetry
                .filter((d) => d.sick_day)
                .map((d) => (
                  <ReferenceLine
                    key={`sick-${d.Date}`}
                    yAxisId="left"
                    x={d.Date}
                    stroke="#dc2626"
                    strokeDasharray="4 3"
                    strokeOpacity={0.5}
                    label={{ value: '🤒', position: 'top', fontSize: 12 }}
                  />
                ))
              }
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default App
