import React from 'react';
import { getEvents } from '../api.js';

const WEEK_EVENTS = {
  'MON': [
    { start: 9, end: 10, title: 'Eval suite run', color: 'cyan', type: 'audit' },
    { start: 11, end: 12.5, title: 'Lab meeting · IISc CDS', color: 'violet', type: 'meet' },
    { start: 14, end: 15, title: 'CPFE writing', color: 'amber', type: 'focus' },
    { start: 17, end: 18, title: 'ETH SOP draft', color: 'green', type: 'focus' },
  ],
  'TUE': [
    { start: 9.5, end: 10.5, title: 'RAG ingest', color: 'cyan', type: 'audit' },
    { start: 13, end: 14, title: 'Lunch · S. Khurana', color: 'violet', type: 'meet' },
    { start: 15, end: 17, title: 'Deep work · §4 figures', color: 'amber', type: 'focus' },
  ],
  'WED': [
    { start: 10, end: 11, title: 'EPFL · Vaucher call', color: 'violet', type: 'meet' },
    { start: 14, end: 16, title: 'Drift monitor deep dive', color: 'amber', type: 'focus' },
  ],
  'THU': [
    { start: 9, end: 10, title: 'Bench replay', color: 'cyan', type: 'audit' },
    { start: 11, end: 12, title: 'Office hours · Raghavan', color: 'violet', type: 'meet' },
    { start: 16, end: 17, title: 'Vaucher LOR call', color: 'violet', type: 'meet' },
  ],
  'FRI': [
    { start: 9, end: 10, title: 'Morning RAG ingest', color: 'cyan', type: 'audit' },
    { start: 11, end: 12, title: 'Office hours · Raghavan', color: 'violet', type: 'meet', now: false, soon: true },
    { start: 13.5, end: 14.5, title: 'ARIA self-audit run', color: 'green', type: 'audit', now: true },
    { start: 15, end: 16, title: 'EPFL recommender call', color: 'violet', type: 'meet' },
    { start: 17.5, end: 18.5, title: 'Workshop figure ablation', color: 'amber', type: 'focus' },
    { start: 20, end: 22, title: 'Track A · §4 writing', color: 'green', type: 'focus' },
  ],
  'SAT': [
    { start: 10, end: 12, title: 'Reading group · NeurIPS prep', color: 'violet', type: 'meet' },
  ],
  'SUN': [
    { start: 11, end: 14, title: 'Long deep work block', color: 'amber', type: 'focus' },
  ],
};

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_NUMS = [12, 13, 14, 15, 16, 17, 18];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

const COLOR_MAP = {
  cyan:   { fg: 'var(--cyan)',   bg: 'rgba(58,137,163,0.10)',  border: 'rgba(58,137,163,0.35)' },
  violet: { fg: 'var(--violet)', bg: 'rgba(107,74,138,0.10)', border: 'rgba(107,74,138,0.35)' },
  amber:  { fg: 'var(--amber)',  bg: 'rgba(168,116,46,0.10)', border: 'rgba(168,116,46,0.35)' },
  green:  { fg: 'var(--green)',  bg: 'rgba(58,107,74,0.10)',  border: 'rgba(58,107,74,0.35)' },
};

/** Format ISO datetime "2025-05-16T14:30:00Z" → "14:30" */
function fmtTime(dt) {
  if (!dt) return '';
  try {
    const d = new Date(dt.dateTime || dt.date || dt);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export function PageCalendar() {
  const todayIdx = 4; // FRI
  const now = 14.5;   // 14:30 mock

  const [liveEvents, setLiveEvents] = React.useState(null); // null = not loaded yet
  const [calStatus,  setCalStatus]  = React.useState('loading');

  React.useEffect(() => {
    getEvents('today').then(res => {
      if (res.status === 'not_configured' || res.status === 'offline') {
        setCalStatus(res.status);
        setLiveEvents([]);
      } else if (res.events) {
        setLiveEvents(res.events);
        setCalStatus('ok');
      } else {
        setLiveEvents([]);
        setCalStatus('not_configured');
      }
    }).catch(() => {
      setLiveEvents([]);
      setCalStatus('offline');
    });
  }, []);

  return (
    <div className="page page-cal">
      <div className="page-hero">
        <div className="page-eyebrow">04 · Calendar</div>
        <h1 className="page-title">Week of May 12 · 14 events, 8h deep-work blocked</h1>
        <div className="page-sub">
          {calStatus === 'ok'
            ? 'Live Google Calendar sync. ARIA proposes deep-work slots based on your focus telemetry.'
            : 'Demo week. Connect Google Calendar in integrations/ to see live events.'}
        </div>
      </div>

      {/* Live events from Google Calendar (shown when configured) */}
      {calStatus === 'ok' && liveEvents && liveEvents.length > 0 && (
        <div className="glass" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div className="row gap-12" style={{ marginBottom: 12 }}>
            <span className="t-label">Google Calendar · Today</span>
            <span className="pill pill-green" style={{ padding: '2px 8px', fontSize: 9 }}>
              <span className="dot" />LIVE · {liveEvents.length} EVENTS
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {liveEvents.map((e, i) => (
              <div key={i} style={{
                padding: '8px 14px',
                borderRadius: 'var(--r-sm)',
                background: 'rgba(58,137,163,0.08)',
                border: '1px solid rgba(58,137,163,0.25)',
                fontSize: 13,
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', marginBottom: 3 }}>
                  {fmtTime(e.start)} – {fmtTime(e.end)}
                </div>
                <div style={{ color: 'var(--ink-1)' }}>{e.summary || '(no title)'}</div>
                {e.location && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{e.location}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {calStatus === 'not_configured' && (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-soft)', background: 'var(--surface-2)', fontSize: 12, color: 'var(--text-3)' }}>
          <span style={{ color: 'var(--amber)' }}>Calendar not configured.</span>{' '}
          Add <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>integrations/credentials.json</span> and restart backend to sync Google Calendar.
        </div>
      )}

      <div className="cal-week glass">
        <div className="cal-grid">
          <div className="cal-corner" />
          {DAYS.map((d, i) => (
            <div key={d} className={`cal-day-head ${i === todayIdx ? 'today' : ''}`}>
              <div className="cal-day-name">{d}</div>
              <div className="cal-day-num">{DAY_NUMS[i]}</div>
            </div>
          ))}

          {HOURS.map(h => (
            <React.Fragment key={h}>
              <div className="cal-hour-label">{h.toString().padStart(2, '0')}:00</div>
              {DAYS.map((d, di) => (
                <div key={`${d}-${h}`} className={`cal-cell ${di === todayIdx ? 'today' : ''}`}>
                  {h === 8 && (WEEK_EVENTS[d] || []).map((e, ei) => {
                    const top    = (e.start - 8) * 56;
                    const height = (e.end - e.start) * 56 - 4;
                    const c      = COLOR_MAP[e.color];
                    return (
                      <div key={ei}
                        className={`cal-event-block ${e.now ? 'now' : ''} ${e.soon ? 'soon' : ''}`}
                        style={{ top: `${top}px`, height: `${height}px`, background: c.bg, borderColor: c.border, color: c.fg }}>
                        {e.now  && <span className="cal-event-now">● NOW</span>}
                        {e.soon && <span className="cal-event-soon">● IN 32 MIN</span>}
                        <div className="cal-event-time">
                          {Math.floor(e.start).toString().padStart(2,'0')}:{((e.start%1)*60).toString().padStart(2,'0')} –{' '}
                          {Math.floor(e.end).toString().padStart(2,'0')}:{((e.end%1)*60).toString().padStart(2,'0')}
                        </div>
                        <div className="cal-event-title">{e.title}</div>
                        <div className="cal-event-type">{e.type}</div>
                      </div>
                    );
                  })}
                  {di === todayIdx && h === Math.floor(now) && (
                    <div className="cal-now-line" style={{ top: `${(now % 1) * 56}px` }}>
                      <span className="cal-now-dot" />
                      <span className="cal-now-label">{Math.floor(now).toString().padStart(2,'0')}:{((now%1)*60).toString().padStart(2,'0')}</span>
                    </div>
                  )}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
