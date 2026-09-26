import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Heart, Moon, ShieldAlert } from 'lucide-react';
import MicroSurvey from './MicroSurvey';
import './App.css'

function App() {
  const [telemetry, setTelemetry] = useState([]);
  const [loading, setLoading] = useState(true);

  // Survey state
  const [surveyDate, setSurveyDate]         = useState(null);
  const [surveyQuestions, setSurveyQuestions] = useState([]);
  const [showSurvey, setShowSurvey]         = useState(false);
  const [surveyDismissed, setSurveyDismissed] = useState(false);

  // Fetch telemetry data
  function fetchTelemetry() {
    return fetch('/api/telemetry?limit=30')
      .then((res) => res.json())
      .then((data) => {
        setTelemetry(data.reverse()); // oldest → newest for chart
      });
  }

  useEffect(() => {
    // Load telemetry and survey questions in parallel
    Promise.all([
      fetchTelemetry(),
      fetch('/api/survey/questions').then((r) => r.json()),
    ])
      .then(([, surveyData]) => {
        if (!surveyData.alreadyAnswered && surveyData.questions.length > 0) {
          setSurveyDate(surveyData.date);
          setSurveyQuestions(surveyData.questions);
          setShowSurvey(true);
        }
      })
      .catch((err) => {
        console.error('Failed to boot Po-Ko:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  // Called when the user submits survey answers — refresh scores immediately
  function handleSurveySubmit(updatedScore) {
    setShowSurvey(false);
    // Re-fetch so the dashboard reflects the new fused score
    fetchTelemetry().catch(console.error);
  }

  function handleSurveyDismiss() {
    setShowSurvey(false);
    setSurveyDismissed(true);
  }

  if (loading) {
    return <div className="loading-screen">Booting Po-Ko Local Engine...</div>;
  }

  // Get the most recent day's data for the top cards
  const today = telemetry[telemetry.length - 1] || {};

  // Determine color based on Risk Level
  const getRiskColor = (level) => {
    switch(level) {
      case 'LOW':      return '#4ade80';
      case 'GUARDED':  return '#facc15';
      case 'ELEVATED': return '#fb923c';
      case 'HIGH':     return '#f87171';
      case 'CRITICAL': return '#dc2626';
      default:         return '#94a3b8';
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

      <header className="dashboard-header">
        <div className="header-titles">
          <h1>Po-Ko Developer Capacity Framework</h1>
          <p className="subtitle">Proactive Care &amp; Risk Analytics</p>
        </div>
        {/* The Po-Ko Risk Score Circle */}
        <div className="score-container" style={{ borderColor: riskColor }}>
          <div className="score-value" style={{ color: riskColor }}>
            {today.poko_score || '--'}
          </div>
          <div className="score-label">Po-Ko Score</div>
          <div className="score-level" style={{ color: riskColor }}>
            {today.poko_risk_level || 'ANALYZING'}
          </div>
        </div>
      </header>

      {/* Active Trend Warning Banner */}
      {today.poko_trend_boosted && (
        <div className="trend-alert-banner" style={{
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          border: '1px solid #dc2626',
          padding: '12px 16px',
          borderRadius: '8px',
          margin: '0 0 20px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#fca5a5'
        }}>
          <ShieldAlert size={24} color="#ef4444" />
          <div>
            <h4 style={{ margin: 0, color: '#ef4444', fontSize: '1.1rem' }}>Sickness Prediction Alert</h4>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem' }}>
              {today.poko_trend_details?.reason || "Impending sickness pattern detected. Please prioritize hydration and consider pacing your workload today."}
            </p>
          </div>
        </div>
      )}

      {/* External Factors Badge — shown when survey data is active for today */}
      {today.poko_external_applied && (
        <div style={{
          backgroundColor: 'rgba(59, 130, 212, 0.08)',
          border: '1px solid #3b82d4',
          padding: '10px 16px',
          borderRadius: '8px',
          margin: '0 0 20px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#93c5fd',
          fontSize: '0.85rem',
        }}>
          <ShieldAlert size={16} color="#3b82d4" />
          <span>
            <strong style={{ color: '#3b82d4' }}>External factors active</strong>
            {' — '}
            {today.poko_external_factors?.activeFactors?.join(', ') || 'self-reported data'}
            {' contributing '}
            <strong>+{today.poko_external_factors?.totalPenalty?.toFixed(1)}</strong>
            {' to score.'}
            {today.poko_external_factors?.activeCompounds?.length > 0 && (
              <span style={{ color: '#f87171' }}>
                {' '}Compound risk detected: {today.poko_external_factors.activeCompounds.join(', ')}.
              </span>
            )}
          </span>
        </div>
      )}

      {/* Retrigger survey if dismissed */}
      {surveyDismissed && surveyQuestions.length > 0 && (
        <div style={{ textAlign: 'right', marginBottom: '12px' }}>
          <button
            onClick={() => { setShowSurvey(true); setSurveyDismissed(false); }}
            style={{
              background: 'none',
              border: '1px solid #333',
              borderRadius: '6px',
              color: '#888',
              fontSize: '0.78rem',
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            Answer today's check-in →
          </button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="metric-cards">
        <div className="card">
          <Heart className="card-icon text-red" />
          <h3>Overnight HRV</h3>
          <p className="card-value">{today.Overnight_HRV_ms || '--'} ms</p>
          <p className="card-subtitle">Baseline: {today['7d_Avg_HRV_ms']} ms</p>
        </div>

        <div className="card">
          <Moon className="card-icon text-blue" />
          <h3>Sleep Quality</h3>
          <p className="card-value">{today.Sleep_Score || '--'} / 100</p>
          <p className="card-subtitle">{today.Sleep_Quality}</p>
        </div>

        <div className="card">
          <Activity className="card-icon text-orange" />
          <h3>Time in Bed</h3>
          <p className="card-value">{today.Time_In_Bed_Minutes ? Math.round(today.Time_In_Bed_Minutes / 60 * 10) / 10 : '--'} hrs</p>
          <p className="card-subtitle">Unrecorded Gap: {today.Unrecorded_Gaps_Minutes || 0} mins</p>
        </div>

        <div className="card alert-card">
          <ShieldAlert className="card-icon text-yellow" />
          <h3>Avg Daily Stress</h3>
          <p className="card-value">{today.Avg_Stress || '--'}</p>
          <p className="card-subtitle">Max 100</p>
        </div>
      </div>

      {/* 30-Day HRV Trend Chart */}
      <div className="chart-section">
        <h2>30-Day Recovery Trend (Overnight HRV vs Baseline)</h2>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={telemetry} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="Date"
                stroke="#888"
                tickFormatter={(dateStr) => {
                  const date = new Date(dateStr);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis stroke="#888" domain={['dataMin - 10', 'dataMax + 10']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#222', border: 'none', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
              />
              {/* 7-day Baseline reference trend */}
              <Line type="monotone" dataKey="7d_Avg_HRV_ms" stroke="#555" strokeWidth={2} dot={false} name="7-Day Baseline" />
              {/* Daily HRV — dot colour reflects Po-Ko risk; outline ring when external factors applied */}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="Overnight_HRV_ms"
                stroke="#4ade80"
                strokeWidth={3}
                name="Daily HRV"
                dot={(props) => {
                  const { cx, cy, payload, key } = props;
                  const hasExternal = payload.poko_external_applied;
                  if (payload.poko_score >= 8) {
                    return <circle key={key} cx={cx} cy={cy} r={hasExternal ? 8 : 6} fill="#dc2626" stroke={hasExternal ? '#3b82d4' : '#7f1d1d'} strokeWidth={2} />;
                  }
                  if (payload.poko_score >= 6) {
                    return <circle key={key} cx={cx} cy={cy} r={hasExternal ? 7 : 5} fill="#fb923c" stroke={hasExternal ? '#3b82d4' : '#9a3412'} strokeWidth={2} />;
                  }
                  return <circle key={key} cx={cx} cy={cy} r={hasExternal ? 6 : 4} fill="#4ade80" stroke={hasExternal ? '#3b82d4' : 'none'} strokeWidth={hasExternal ? 2 : 0} />;
                }}
                activeDot={{ r: 8 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default App
