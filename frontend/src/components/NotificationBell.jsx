import React from 'react';
import { Icon } from './Icons.jsx';

/**
 * Header pill: bell icon + unread badge. Clicking opens a small dropdown
 * with the last N notifications.
 */
export function NotificationBell({ items, unread, onOpen }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  };

  const fmtTs = (ts) => {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bell-wrap" ref={ref}>
      <button className={`pill bell-btn ${unread > 0 ? 'has-unread' : ''}`} onClick={toggle}>
        <Icon.Bell />
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-dropdown glass">
          <div className="bell-head">
            <span className="t-label">Notifications</span>
            <span className="t-tiny">{items.length} recent</span>
          </div>
          {items.length === 0 ? (
            <div className="t-dim" style={{ padding: 12, textAlign: 'center', fontSize: 11 }}>
              No notifications yet.
            </div>
          ) : (
            <div className="bell-list">
              {items.slice(0, 12).map((it) => (
                <div key={it.id} className={`bell-item bell-sev-${it.severity}`}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 500, fontSize: 11.5 }}>{it.title}</span>
                    <span className="t-tiny">{fmtTs(it.ts)}</span>
                  </div>
                  <div className="t-dim" style={{ fontSize: 11, marginTop: 2 }}>{it.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
