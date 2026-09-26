import { useState } from 'react';
import { ClipboardList, X } from 'lucide-react';

/**
 * DailyLogModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Props:
 *   onClose   {fn}  – called after successful submit or explicit dismiss
 *   onSubmit  {fn}  – called with the server response after a successful POST
 *
 * Collects the 7 fields the scoring engine needs:
 *   Date, Sleep Score, Overnight HRV, 7-day Avg HRV, Avg Stress,
 *   Bedtime (24h decimal), Wake Time (24h decimal).
 *
 * All other telemetry fields default to null on the server.
 */
export default function DailyLogModal({ onClose, onSubmit }) {
  const todayISO = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    Date:               todayISO,
    Sleep_Score:        '',
    Overnight_HRV_ms:   '',
    '7d_Avg_HRV_ms':    '',
    Avg_Stress:         '',
    Bedtime_Decimal:    '',
    Wake_Time_Decimal:  '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [success, setSuccess]       = useState(false);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function isValid() {
    return (
      form.Date &&
      form.Sleep_Score !== '' &&
      form.Overnight_HRV_ms !== '' &&
      form['7d_Avg_HRV_ms'] !== '' &&
      form.Avg_Stress !== '' &&
      form.Bedtime_Decimal !== '' &&
      form.Wake_Time_Decimal !== ''
    );
  }

  async function handleSubmit() {
    if (!isValid() || submitting) return;
    setSubmitting(true);
    setError(null);

    const payload = {
      Date:              form.Date,
      Sleep_Score:       Number(form.Sleep_Score),
      Overnight_HRV_ms:  Number(form.Overnight_HRV_ms),
      '7d_Avg_HRV_ms':   Number(form['7d_Avg_HRV_ms']),
      Avg_Stress:        Number(form.Avg_Stress),
      Bedtime_Decimal:   Number(form.Bedtime_Decimal),
      Wake_Time_Decimal: Number(form.Wake_Time_Decimal),
    };

    try {
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = 'Submission failed';
        try {
          const body = await res.json();
          message = body.error || message;
        } catch { /* response was not JSON (e.g. HTML error page) */ }
        throw new Error(message);
      }

      const data = await res.json();
      setSuccess(true);
      setTimeout(() => {
        onSubmit?.(data);
        onClose?.();
      }, 1200);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <ClipboardList size={18} color="#3b82d4" />
            <span style={styles.headerTitle}>Log Today's Data</span>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        <p style={styles.subtext}>
          Enter your wearable data for the day. Takes under 2 minutes.
        </p>

        {success ? (
          <div style={styles.successMsg}>✓ Day logged successfully!</div>
        ) : (
          <>
            <div style={styles.fields}>
              <Field label="Date" hint="YYYY-MM-DD">
                <input
                  type="date"
                  style={styles.input}
                  value={form.Date}
                  onChange={(e) => handleChange('Date', e.target.value)}
                />
              </Field>

              <Field label="Sleep Score" hint="0–100 (Garmin sleep score)">
                <input
                  type="number"
                  style={styles.input}
                  min={0} max={100}
                  placeholder="e.g. 78"
                  value={form.Sleep_Score}
                  onChange={(e) => handleChange('Sleep_Score', e.target.value)}
                />
              </Field>

              <Field label="Overnight HRV" hint="ms - from Garmin morning report">
                <input
                  type="number"
                  style={styles.input}
                  min={0}
                  placeholder="e.g. 62"
                  value={form.Overnight_HRV_ms}
                  onChange={(e) => handleChange('Overnight_HRV_ms', e.target.value)}
                />
              </Field>

              <Field label="7-Day Avg HRV" hint="ms - your rolling baseline">
                <input
                  type="number"
                  style={styles.input}
                  min={0}
                  placeholder="e.g. 67"
                  value={form['7d_Avg_HRV_ms']}
                  onChange={(e) => handleChange('7d_Avg_HRV_ms', e.target.value)}
                />
              </Field>

              <Field label="Avg Daily Stress" hint="0–100 (Garmin stress score)">
                <input
                  type="number"
                  style={styles.input}
                  min={0} max={100}
                  placeholder="e.g. 32"
                  value={form.Avg_Stress}
                  onChange={(e) => handleChange('Avg_Stress', e.target.value)}
                />
              </Field>

              <Field label="Bedtime" hint="24h decimal - e.g. 22.5 = 10:30 PM">
                <input
                  type="number"
                  style={styles.input}
                  min={0} max={24} step={0.25}
                  placeholder="e.g. 22.5"
                  value={form.Bedtime_Decimal}
                  onChange={(e) => handleChange('Bedtime_Decimal', e.target.value)}
                />
              </Field>

              <Field label="Wake Time" hint="24h decimal - e.g. 7.0 = 7:00 AM">
                <input
                  type="number"
                  style={styles.input}
                  min={0} max={24} step={0.25}
                  placeholder="e.g. 7.0"
                  value={form.Wake_Time_Decimal}
                  onChange={(e) => handleChange('Wake_Time_Decimal', e.target.value)}
                />
              </Field>
            </div>

            {error && <p style={styles.errorText}>{error}</p>}

            <button
              style={{
                ...styles.submitBtn,
                ...(!isValid() || submitting ? styles.submitBtnDisabled : {}),
              }}
              onClick={handleSubmit}
              disabled={!isValid() || submitting}
            >
              {submitting ? 'Saving…' : 'Log Day'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: '#57606a', marginLeft: '6px' }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #2d2d2d',
    borderRadius: '12px',
    padding: '24px',
    width: '100%',
    maxWidth: '440px',
    boxSizing: 'border-box',
    maxHeight: '90vh',
    overflowY: 'auto',
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
  headerTitle: {
    fontWeight: 600,
    fontSize: '1rem',
    color: '#f0f0f0',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  subtext: {
    color: '#888',
    fontSize: '0.82rem',
    margin: '0 0 16px 0',
    lineHeight: 1.5,
  },
  fields: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  input: {
    backgroundColor: '#111',
    border: '1px solid #2d2d2d',
    borderRadius: '6px',
    color: '#e0e0e0',
    fontSize: '0.88rem',
    padding: '8px 10px',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  },
  submitBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#3b82d4',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  submitBtnDisabled: {
    backgroundColor: '#1f2937',
    color: '#4b5563',
    cursor: 'not-allowed',
  },
  errorText: {
    color: '#f87171',
    fontSize: '0.8rem',
    marginBottom: '10px',
  },
  successMsg: {
    textAlign: 'center',
    color: '#4ade80',
    fontSize: '1rem',
    fontWeight: 600,
    padding: '24px 0',
  },
};
