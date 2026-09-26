import { useState } from 'react';
import { X, ChevronDown, ChevronUp, Sun, Coffee, Moon } from 'lucide-react';

/**
 * AdviceToast
 * ─────────────────────────────────────────────────────────────────────────────
 * Props:
 *   advice  {object}  – { date, slot, text, triggerMetric, triggerValue, category }
 *   onDismiss {fn}    – called when the user dismisses this toast
 *
 * Dismissal state is persisted in localStorage keyed by date+slot so the toast
 * does not reappear after the user has dismissed it.
 */
export default function AdviceToast({ advice, onDismiss }) {
  const [expanded, setExpanded] = useState(false);

  if (!advice) return null;

  return (
    <div style={{ ...styles.toast, ...getCategoryStyle(advice.category) }}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <SlotIcon slot={advice.slot} />
          <span style={styles.slotLabel}>{slotLabel(advice.slot)}</span>
          <span style={{ ...styles.categoryBadge, ...getCategoryBadgeStyle(advice.category) }}>
            {advice.category}
          </span>
        </div>
        <button
          style={styles.closeBtn}
          onClick={onDismiss}
          aria-label="Dismiss advice"
        >
          <X size={14} />
        </button>
      </div>

      <p style={styles.text}>{advice.text}</p>

      {advice.triggerMetric && (
        <button
          style={styles.whyBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Why this?
        </button>
      )}

      {expanded && advice.triggerMetric && (
        <div style={styles.whyPanel}>
          <span style={styles.whyLabel}>Triggering metric:</span>{' '}
          <span style={styles.whyValue}>
            {formatMetricName(advice.triggerMetric)}
            {advice.triggerValue != null ? ` = ${advice.triggerValue}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Slot helpers ─────────────────────────────────────────────────────────────

function slotLabel(slot) {
  switch (slot) {
    case 'morning':   return 'Morning check-in';
    case 'midday':    return 'Midday check-in';
    case 'afternoon': return 'Afternoon check-in';
    default:          return 'Health check-in';
  }
}

function SlotIcon({ slot }) {
  const props = { size: 14, style: { flexShrink: 0 } };
  switch (slot) {
    case 'morning':   return <Sun {...props} color="#facc15" />;
    case 'midday':    return <Coffee {...props} color="#fb923c" />;
    case 'afternoon': return <Moon {...props} color="#a78bfa" />;
    default:          return <Sun {...props} />;
  }
}

function formatMetricName(metric) {
  return metric.replace(/_/g, ' ');
}

// ─── Category styles ──────────────────────────────────────────────────────────

function getCategoryStyle(category) {
  switch (category) {
    case 'nutrition': return { borderColor: '#a78bfa' };
    case 'sleep':     return { borderColor: '#60a5fa' };
    case 'stress':    return { borderColor: '#fb923c' };
    case 'immune':    return { borderColor: '#f87171' };
    default:          return { borderColor: '#555' };
  }
}

function getCategoryBadgeStyle(category) {
  switch (category) {
    case 'nutrition': return { backgroundColor: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa' };
    case 'sleep':     return { backgroundColor: 'rgba(96, 165, 250, 0.15)',  color: '#60a5fa' };
    case 'stress':    return { backgroundColor: 'rgba(251, 146, 60, 0.15)',  color: '#fb923c' };
    case 'immune':    return { backgroundColor: 'rgba(248, 113, 113, 0.15)', color: '#f87171' };
    default:          return { backgroundColor: 'rgba(148, 163, 184, 0.1)',  color: '#94a3b8' };
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  toast: {
    backgroundColor: '#1e222a',
    border: '1px solid',
    borderRadius: '10px',
    padding: '14px 16px',
    marginBottom: '16px',
    fontSize: '0.88rem',
    lineHeight: 1.55,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  slotLabel: {
    fontWeight: 600,
    color: '#e2e8f0',
    fontSize: '0.82rem',
  },
  categoryBadge: {
    padding: '1px 8px',
    borderRadius: '999px',
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'capitalize',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#555',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
  },
  text: {
    margin: '0 0 8px 0',
    color: '#cbd5e1',
  },
  whyBtn: {
    background: 'none',
    border: 'none',
    color: '#57606a',
    fontSize: '0.75rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: 0,
  },
  whyPanel: {
    marginTop: '8px',
    fontSize: '0.78rem',
    color: '#57606a',
    backgroundColor: '#111',
    borderRadius: '6px',
    padding: '8px 10px',
  },
  whyLabel: {
    color: '#94a3b8',
    fontWeight: 600,
  },
  whyValue: {
    color: '#e2e8f0',
  },
};
