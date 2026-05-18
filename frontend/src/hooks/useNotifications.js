import React from 'react';
import { WS_BASE } from '../api.js';
import { getRecentNotifications } from '../aria_api.js';

/**
 * Listens on the same /ws/wake socket as voice. Filters out wake messages
 * (those are handled by useVoiceInteraction) — keeps only `type:"notification"`.
 *
 * Also seeds with the most recent N persisted notifications on mount so the
 * bell badge isn't empty after a reload.
 */
export function useNotifications({ onWake } = {}) {
  const [items, setItems] = React.useState([]);
  const [unread, setUnread] = React.useState(0);

  // Initial replay
  React.useEffect(() => {
    getRecentNotifications(20).then(r => {
      if (r?.notifications) setItems(r.notifications);
    }).catch(() => {});
  }, []);

  // Live socket
  React.useEffect(() => {
    let ws;
    let reconnect;
    const connect = () => {
      try {
        ws = new WebSocket(`${WS_BASE}/ws/wake`);
        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'wake') {
              if (onWake) onWake(data);
              return;
            }
            if (data.type === 'notification') {
              setItems((prev) => [data, ...prev].slice(0, 50));
              setUnread((u) => u + 1);
            }
          } catch {}
        };
        ws.onclose = () => { reconnect = setTimeout(connect, 5_000); };
        ws.onerror  = () => { try { ws.close(); } catch {} };
      } catch {
        reconnect = setTimeout(connect, 5_000);
      }
    };
    connect();
    return () => { clearTimeout(reconnect); try { ws?.close(); } catch {} };
  }, [onWake]);

  const markAllRead = React.useCallback(() => setUnread(0), []);
  const dismiss = React.useCallback((id) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { items, unread, markAllRead, dismiss };
}
