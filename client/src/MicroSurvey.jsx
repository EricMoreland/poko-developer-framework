import { useState } from 'react';
import { ClipboardCheck, X, CheckCircle, XCircle } from 'lucide-react';

/**
 * MicroSurvey
 * ─────────────────────────────────────────────────────────────────────────────
 * Props:
 *   date      {string}  – ISO date the survey answers apply to (e.g. "2026-09-24")
 *   questions {Array}   – [{ id: string, question: string }, ...]  (max 2 items)
 *   onSubmit  {fn}      – called with the updatedScore object once answers are saved
 *   onDismiss {fn}      – called when user closes without answering
 */
export default function MicroSurvey({ date, questions, onSubmit, onDismiss }) {
  // Initialise every question to null (unanswered) using a lazy initialiser so
  // the object is only built once on mount, not on every render.
  // Shape: { [questionId]: boolean | null }
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(questions.map((q) => [q.id, null]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Guard: render nothing if the parent passes an empty question list
  if (!questions || questions.length === 0) return null;

  // Submit button is only enabled once every question has a true/false answer
  const allAnswered = questions.every((q) => answers[q.id] !== null);

  // Immutably update a single answer while preserving the rest
  function handleAnswer(id, value) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit() {
    if (!allAnswered) return;
    setSubmitting(true);
    setError(null);

    // Build the factors payload: { [factorId]: boolean }.
    // This mirrors the shape expected by POST /api/survey/submit.
    const factors = {};
    for (const q of questions) {
      factors[q.id] = answers[q.id];
    }

    try {
      const res = await fetch('/api/survey/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, factors }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Submission failed');
      }

      const data = await res.json();
      onSubmit(data.updatedScore);
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
            <ClipboardCheck size={18} color="#3b82d4" />
            <span style={styles.headerTitle}>Quick Check-In</span>
          </div>
          <button style={styles.closeBtn} onClick={onDismiss} aria-label="Dismiss survey">
            <X size={16} />
          </button>
        </div>

        <p style={styles.subtext}>
          Your biometrics triggered {questions.length === 1 ? 'a question' : 'a couple of questions'} to
          better understand what you're experiencing today.
        </p>

        {/* Questions */}
        <div style={styles.questions}>
          {questions.map((q, i) => (
            <div key={q.id} style={styles.questionBlock}>
              <p style={styles.questionText}>
                <span style={styles.questionIndex}>{i + 1}.</span> {q.question}
              </p>
              {q.reason && (
                <p style={styles.reasonText}>{q.reason}</p>
              )}
              {/* Spread the active style only when the matching value is selected.
                  Uses strict equality so null (unanswered) never activates either style. */}
              <div style={styles.buttonRow}>
                <button
                  style={{
                    ...styles.answerBtn,
                    ...(answers[q.id] === true ? styles.answerBtnActiveYes : {}),
                  }}
                  onClick={() => handleAnswer(q.id, true)}
                >
                  <CheckCircle size={14} />
                  Yes
                </button>
                <button
                  style={{
                    ...styles.answerBtn,
                    ...(answers[q.id] === false ? styles.answerBtnActiveNo : {}),
                  }}
                  onClick={() => handleAnswer(q.id, false)}
                >
                  <XCircle size={14} />
                  No
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && <p style={styles.errorText}>{error}</p>}

        {/* Merge the disabled style override on top of the base submit button styles.
            The empty spread {} when enabled means the base style is used as-is. */}
        <button
          style={{
            ...styles.submitBtn,
            ...(allAnswered && !submitting ? {} : styles.submitBtnDisabled),
          }}
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
        >
          {submitting ? 'Saving…' : 'Submit - Update My Score'}
        </button>

        <p style={styles.privacyNote}>Stays on your device. Used only to improve your Po-Ko score accuracy.</p>
      </div>
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
    maxWidth: '420px',
    boxSizing: 'border-box',
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
    margin: '0 0 20px 0',
    lineHeight: 1.5,
  },
  questions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '20px',
  },
  questionBlock: {
    backgroundColor: '#111',
    border: '1px solid #2d2d2d',
    borderRadius: '8px',
    padding: '14px 16px',
  },
  questionText: {
    margin: '0 0 12px 0',
    fontSize: '0.9rem',
    color: '#e0e0e0',
    lineHeight: 1.5,
  },
  questionIndex: {
    color: '#3b82d4',
    fontWeight: 600,
    marginRight: '4px',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
  },
  answerBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #333',
    backgroundColor: '#1f1f1f',
    color: '#888',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
    transition: 'all 0.15s ease',
  },
  answerBtnActiveYes: {
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderColor: '#4ade80',
    color: '#4ade80',
  },
  answerBtnActiveNo: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderColor: '#f87171',
    color: '#f87171',
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
    marginBottom: '10px',
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
  reasonText: {
    margin: '0 0 10px 0',
    fontSize: '0.74rem',
    color: '#57606a',
    lineHeight: 1.45,
    fontStyle: 'italic',
  },
  privacyNote: {
    textAlign: 'center',
    color: '#4b5563',
    fontSize: '0.72rem',
    margin: 0,
  },
};
