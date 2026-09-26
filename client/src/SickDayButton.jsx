import { useState, useEffect } from 'react';
import { Thermometer } from 'lucide-react';

/**
 * SickDayButton
 * ─────────────────────────────────────────────────────────────────────────────
 * Toggles a sick day on/off for today.
 * • Clicking when not sick → POST /api/sick-day  (logs sick day)
 * • Clicking when sick    → DELETE /api/sick-day (removes it)
 */
export default function SickDayButton() {
  const [isSick, setIsSick]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/sick-day/today')
      .then((r) => r.json())
      .then((data) => setIsSick(data.isSick))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleClick() {
    if (submitting) return;
    setSubmitting(true);
    const today = new Date().toISOString().slice(0, 10);

    try {
      if (isSick) {
        // Toggle OFF — remove sick day
        const res = await fetch('/api/sick-day', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: today }),
        });
        if (res.ok || res.status === 404) {
          setIsSick(false);
        }
      } else {
        // Toggle ON — log sick day
        const res = await fetch('/api/sick-day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: today }),
        });
        if (res.ok || res.status === 409) {
          setIsSick(true);
        }
      }
    } catch {
      // Silently fail — state stays as-is
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  return (
    <button
      onClick={handleClick}
      disabled={submitting}
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
        cursor: submitting ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
        opacity: submitting ? 0.6 : 1,
        transition: 'all 0.15s ease',
      }}
      aria-label={isSick ? 'Remove sick day for today' : 'Log today as a sick day'}
      title={isSick ? 'Click to remove sick day' : 'Click to log sick day'}
    >
      <Thermometer size={14} />
      {submitting ? '…' : isSick ? 'Sick day logged ✓' : "I'm sick today"}
    </button>
  );
}
