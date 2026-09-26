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
  const [toastMessage, setToastMessage] = useState(null);

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
    setToastMessage(null);
    try {
      const res = await fetch('/api/learning/run', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Analysis failed');
      }
      const data = await res.json();
      await fetchInsights();
      // Check if the learning engine found anything new
      const patternCount = data.insights?.detectedPatterns?.length || 0;
      if (patternCount > 0) {
        setToastMessage(`Analysis complete: ${patternCount} pattern(s) confirmed!`);
      } else {
        setToastMessage('Analysis complete: No new patterns detected yet.');
      }
      
      // Auto-dismiss the dialog after 4 seconds
      setTimeout(() => {
        setToastMessage(null);
      }, 4000);
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
      <div style={{ position: 'relative' }}>
        <button
          onClick={handleRunAnalysis}
          disabled={running}
          style={{ ...styles.runBtn, ...(running ? styles.runBtnDisabled : {}) }}
          title="Run multi-metric pattern analysis across your full health history"
        >
          <RefreshCw size={13} style={{ animation: running ? 'spin 1s linear infinite' : 'none' }} />
          {running ? 'Analysing…' : 'Run Analysis'}
        </button>
        {/* THE AUTO-DISMISSING DIALOG BOX */}
        {toastMessage && (
          <div style={styles.toast}>
            {toastMessage}
          </div>
        )}
      </div>
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
  toast: {
    position: 'absolute',
    bottom: '100%',
    right: '0',
    marginBottom: '10px',
    backgroundColor: '#1e222a',
    border: '1px solid #7c5cd8',
    color: '#e2e8f0',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '0.78rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    zIndex: 50,
    whiteSpace: 'nowrap',
  },
};
