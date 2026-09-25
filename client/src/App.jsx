import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, Heart, Moon, ShieldAlert } from 'lucide-react';
import './App.css'

function App() {
  const [telemetry, setTelemetry] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch the last 30 days of data from the Express backend
    fetch('/api/telemetry?limit=30')
      .then((res) => res.json())
      .then((data) => {
        // Reverse the array so the chart reads left-to-right (oldest to newest)
        setTelemetry(data.reverse());
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch telemetry:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="loading-screen">Booting Po-Ko Local Engine...</div>;
  }

  // Get the most recent day's data for the top cards
  const today = telemetry[telemetry.length - 1] || {};

  // Determine color based on Risk Level
  const getRiskColor = (level) => {
    switch(level) {
      case 'LOW': return '#4ade80';      // Green
      case 'GUARDED': return '#facc15';  // Yellow
      case 'ELEVATED': return '#fb923c'; // Orange
      case 'HIGH': return '#f87171';     // Red
      case 'CRITICAL': return '#dc2626'; // Dark Red
      default: return '#94a3b8';         // Gray fallback
    }
  };

  const riskColor = getRiskColor(today.poko_risk_level);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-titles">
          <h1>Po-Ko Developer Capacity Framework</h1>
        <p className="subtitle">Proactive Care & Risk Analytics</p>
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
              {/* Plot the 7-day Baseline as a smooth reference trend */}
              <Line type="monotone" dataKey="7d_Avg_HRV_ms" stroke="#555" strokeWidth={2} dot={false} name="7-Day Baseline" />
              {/* Daily HRV with logic to show Red/Orange dots on bad days */}
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="Overnight_HRV_ms" 
                stroke="#4ade80" 
                strokeWidth={3} 
                name="Daily HRV"
                dot={(props) => {
                  const { cx, cy, payload, key } = props;
                  // Flag days where the final calculated score was high risk
                  if (payload.poko_score >= 8) {
                    return <circle key={key} cx={cx} cy={cy} r={6} fill="#dc2626" stroke="#7f1d1d" strokeWidth={2} />;
                  }
                  if (payload.poko_score >= 6) {
                    return <circle key={key} cx={cx} cy={cy} r={5} fill="#fb923c" stroke="#9a3412" strokeWidth={2} />;
                  }
                  return <circle key={key} cx={cx} cy={cy} r={4} fill="#4ade80" stroke="none" />;
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
