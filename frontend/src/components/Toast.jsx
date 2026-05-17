import React from 'react';
import { Icon } from './Icons.jsx';

/**
 * Toast stack — bottom-right of viewport. Auto-dismisses after 6s.
 *
 * Props:
 *   items:   array of {id, kind, title, body, severity, ts}
 *   onDismiss(id)
 */
const SEVERITY_COLOR = {
  info:  'var(--cyan)',
  warn:  'var(--amber)',
  alarm: 'var(--danger)',
};

export function ToastStack({ items, onDismiss }) {
  // Track which IDs we've already shown so we don't re-animate them
  const [shown, setShown] = React.useState([]);
  React.useEffect(() => {
    const visible = items.slice(0, 3).filter((it) => !shown.some(s => s.id === it.id));
    if (visible.length === 0) return;
    setShown((prev) => [...visible, ...prev].slice(0, 5));
    visible.forEach((it) => {
      setTimeout(() => onDismiss?.(it.id), 6000);
    });
  }, [items, shown, onDismiss]);

  const live = shown.slice(0, 3);
  if (live.length === 0) return null;

  return (
    <div className="toast-stack">
      {live.map((it) => (
        <div key={it.id} className="toast" style={{ '--toast-accent': SEVERITY_COLOR[it.severity] || 'var(--cyan)' }}>
          <div className="toast-icon"><Icon.Bell /></div>
          <div className="toast-body">
            <div className="toast-title">{it.title}</div>
            <div className="toast-text">{it.body}</div>
          </div>
          <button className="toast-close" onClick={() => onDismiss?.(it.id)} aria-label="dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
