import { useState, useEffect, useRef } from 'react';

/**
 * InfoTooltip
 * ─────────────────────────────────────────────────────────────────────────────
 * Props:
 *   title                  {string}  – metric name shown as the popover heading
 *   description            {string}  – plain-language explanation
 *   healthyRange           {string}  – what a good value looks like
 *   scoreImpactDescription {string}  – how this metric feeds the Po-Ko score
 *
 * A small ⓘ button that opens a popover anchored to the button.
 * Closes on outside click or Escape key press.
 */
export default function InfoTooltip({ title, description, healthyRange, scoreImpactDescription }) {
  const [open, setOpen]     = useState(false);
  const containerRef        = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div ref={containerRef} style={styles.wrapper}>
      <button
        style={styles.triggerBtn}
        onClick={() => setOpen((v) => !v)}
        aria-label={`More info about ${title}`}
        aria-expanded={open}
      >
        ⓘ
      </button>

      {open && (
        <div style={styles.popover} role="tooltip">
          <p style={styles.popoverTitle}>{title}</p>

          <Section label="What it is">
            {description}
          </Section>

          <Section label="Healthy range">
            {healthyRange}
          </Section>

          <Section label="Po-Ko score impact">
            {scoreImpactDescription}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={styles.section}>
      <span style={styles.sectionLabel}>{label}</span>
      <p style={styles.sectionText}>{children}</p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  wrapper: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
  },
  triggerBtn: {
    background: 'none',
    border: 'none',
    color: '#57606a',
    cursor: 'pointer',
    fontSize: '0.95rem',
    lineHeight: 1,
    padding: '0 0 0 6px',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.12s ease',
  },
  popover: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    zIndex: 200,
    backgroundColor: '#1a1e26',
    border: '1px solid #2d3340',
    borderRadius: '10px',
    padding: '16px',
    width: '280px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    // Keep the popover on-screen when the card is near the right edge
    left: 'auto',
  },
  popoverTitle: {
    margin: '0 0 12px 0',
    fontSize: '0.88rem',
    fontWeight: 700,
    color: '#e2e8f0',
    borderBottom: '1px solid #2d3340',
    paddingBottom: '8px',
  },
  section: {
    marginBottom: '10px',
  },
  sectionLabel: {
    display: 'block',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#3b82d4',
    marginBottom: '3px',
  },
  sectionText: {
    margin: 0,
    fontSize: '0.78rem',
    color: '#94a3b8',
    lineHeight: 1.55,
  },
};
