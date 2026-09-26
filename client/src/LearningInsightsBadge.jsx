import { useState, useEffect } from 'react';
import { BrainCircuit, RefreshCw } from 'lucide-react';

/**
 * LearningInsightsBadge
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows the last run date and confirmed pattern count from the learning engine.
 * Includes a "Run Analysis" button that triggers POST /api/learning/run.
 */
export default function LearningInsightsBadge() {
  const [insights, setInsights] = useState(null);
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState(null);

  function fetchInsights() {
    return fetch('/api/learning/insights')
      .then((r) => r.json())
      .then(setInsights)
      .catch(() => {});
  }

  useEffect(() => { fetchInsights(); }, []);

  async function handleRunAnalysis() {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/learning/run', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Analysis failed');
      }
      await fetchInsights();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  const patternCount = insights?.detectedPatterns?.length ?? 0;
  const lastRun      = insights?.lastRun
    ? new Date(insights.lastRun).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={styles.badge}>
      <div style={styles.left}>
        <BrainCircuit size={16} color="#7c5cd8" style={{ flexShrink: 0 }} />
        <div style={styles.text}>
          <span style={styles.title}>
            Learning Engine
            {patternCount > 0 && (
              <span style={styles.pill}>{patternCount} pattern{patternCount !== 1 ? 's' : ''}</span>
            )}
          </span>
          <span style={styles.sub}>
            {lastRun ? `Last run: ${lastRun}` : 'Not yet run - click to analyse your history'}
          </span>
        </div>
      </div>
      <button
        onClick={handleRunAnalysis}
        disabled={running}
        style={{ ...styles.runBtn, ...(running ? styles.runBtnDisabled : {}) }}
        title="Run multi-metric pattern analysis across your full health history"
      >
        <RefreshCw size={13} style={{ animation: running ? 'spin 1s linear infinite' : 'none' }} />
        {running ? 'Analysing…' : 'Run Analysis'}
      </button>
      {error && <span style={styles.error}>{error}</span>}
    </div>
  );
}

const styles = {
  badge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    backgroundColor: 'rgba(124, 92, 216, 0.08)',
    border: '1px solid rgba(124, 92, 216, 0.3)',
    borderRadius: '8px',
    padding: '10px 14px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  text: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  title: {
    fontSize: '0.88rem',
    fontWeight: 600,
    color: '#c4b5fd',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  pill: {
    backgroundColor: 'rgba(124, 92, 216, 0.25)',
    color: '#a78bfa',
    padding: '1px 8px',
    borderRadius: '999px',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  sub: {
    fontSize: '0.75rem',
    color: '#57606a',
  },
  runBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(124, 92, 216, 0.4)',
    backgroundColor: 'rgba(124, 92, 216, 0.15)',
    color: '#c4b5fd',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  runBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  error: {
    fontSize: '0.75rem',
    color: '#f87171',
    width: '100%',
  },
};
