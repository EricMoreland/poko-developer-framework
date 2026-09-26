import { useState, useEffect } from 'react';
import { Thermometer } from 'lucide-react';

/**
 * SickDayButton
 * ─────────────────────────────────────────────────────────────────────────────
 * A single-action button that logs today as a sick day.
 * Shows "🤒 I'm sick today" if not yet logged, "Sick day logged ✓" once confirmed.
 * Disabled after logging to prevent duplicate submissions.
 */
export default function SickDayButton() {
  const [isSick, setIsSick]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/sick-day/today')
      .then((r) => r.json())
      .then((data) => setIsSick(data.isSick))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleClick() {
    if (isSick || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/sick-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) }),
      });
      if (res.ok || res.status === 409) {
        setIsSick(true);
      }
    } catch {
      // Silently fail — button returns to idle state
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  return (
    <button
      onClick={handleClick}
      disabled={isSick || submitting}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 14px',
        borderRadius: '8px',
        border: isSick ? '1px solid #4ade80' : '1px solid #f87171',
        backgroundColor: isSick ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
        color: isSick ? '#4ade80' : '#f87171',
        fontSize: '0.82rem',
        fontWeight: 600,
        cursor: isSick ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
        opacity: submitting ? 0.6 : 1,
        transition: 'all 0.15s ease',
      }}
      aria-label={isSick ? 'Sick day already logged for today' : 'Log today as a sick day'}
    >
      <Thermometer size={14} />
      {isSick ? 'Sick day logged ✓' : submitting ? 'Logging…' : "I'm sick today"}
    </button>
  );
}
