/**
 * CalendarPanel — today's events with time-proximity coloring
 *
 * Color coding:
 *   green  = upcoming (>30min away)
 *   amber  = soon (≤30min)
 *   red    = overdue / in progress
 */

import { useState, useEffect, useCallback } from 'react';
import { getEvents, MOCK_EVENTS } from '../api.js';

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function eventStatus(event) {
  const now  = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  const startM = timeToMinutes(event.start);
  const endM   = timeToMinutes(event.end || event.start);
  const diffM  = startM - nowM;

  if (endM < nowM)      return 'past';
  if (startM <= nowM)   return 'active';
  if (diffM <= 30)      return 'soon';
  return 'upcoming';
}

function statusColor(status) {
  switch (status) {
    case 'active':   return '#F5A623';
    case 'soon':     return '#F5A623';
    case 'upcoming': return '#7EE787';
    case 'past':     return '#253D5A';
    default:         return '#58A6FF';
  }
}

function EventRow({ event }) {
  const status = eventStatus(event);
  const color  = event.color ?? statusColor(status);
  const isPast = status === 'past';

  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: '1px solid #0F1A24',
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      opacity: isPast ? 0.4 : 1,
      transition: 'background 150ms',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,200,0.02)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Color bar */}
      <div style={{
        width: 2,
        alignSelf: 'stretch',
        background: color,
        borderRadius: 1,
        flexShrink: 0,
        boxShadow: isPast ? undefined : `0 0 6px ${color}50`,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Time */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          color: color,
          letterSpacing: '0.04em',
          marginBottom: 3,
          fontWeight: 500,
        }}>
          {event.start}
          {event.end && event.end !== event.start ? ` → ${event.end}` : ''}
          {status === 'active' && (
            <span style={{
              marginLeft: 8,
              color: '#F5A623',
              animation: 'alarm-flash 1.5s ease-in-out infinite',
            }}>
              ● NOW
            </span>
          )}
          {status === 'soon' && (
            <span style={{ marginLeft: 8, color: '#F5A623' }}>
              ⚡ SOON
            </span>
          )}
        </div>

        {/* Summary */}
        <div style={{
          fontFamily: "'Crimson Pro', Georgia, serif",
          fontSize: 13,
          color: isPast ? '#484F58' : '#C9D1D9',
          lineHeight: 1.3,
          marginBottom: event.location ? 3 : 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {event.summary}
        </div>

        {/* Location */}
        {event.location && (
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            color: '#484F58',
            letterSpacing: '0.04em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            ⌖ {event.location}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CalendarPanel({ events: propEvents }) {
  const [events, setEvents]     = useState(propEvents ?? MOCK_EVENTS);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getEvents('today');
      if (Array.isArray(data)) setEvents(data);
    } catch {
      // Stay with current events
    } finally {
      setRefreshing(false);
    }
  }, []);

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).toUpperCase();

  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const nextEvent = events.find(e => {
    const s = eventStatus(e);
    return s === 'soon' || s === 'upcoming' || s === 'active';
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 14px',
        borderBottom: '1px solid #1A2332',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: '#8B949E',
        }}>
          CALENDAR
        </span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.06em',
            color: refreshing ? '#253D5A' : '#484F58',
            background: 'none',
            border: 'none',
            cursor: refreshing ? 'wait' : 'pointer',
            transition: 'color 150ms',
          }}
          onMouseEnter={e => { if (!refreshing) e.currentTarget.style.color = '#00D4C8'; }}
          onMouseLeave={e => { if (!refreshing) e.currentTarget.style.color = '#484F58'; }}
        >
          {refreshing ? '↻ LOADING…' : '↻ REFRESH'}
        </button>
      </div>

      {/* Date/time hero */}
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: '1px solid #0F1A24',
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 22,
          fontWeight: 400,
          color: '#E6EDF3',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          marginBottom: 4,
        }}>
          {timeStr}
        </div>
        <div style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 8.5,
          color: '#484F58',
          letterSpacing: '0.1em',
          fontWeight: 700,
        }}>
          {dateStr}
        </div>
        {nextEvent && (
          <div style={{
            marginTop: 8,
            fontFamily: "'Crimson Pro', Georgia, serif",
            fontSize: 12,
            color: '#8B949E',
            fontStyle: 'italic',
          }}>
            Next: <span style={{ color: '#C9D1D9' }}>{nextEvent.summary}</span>
            <span style={{
              marginLeft: 6,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontStyle: 'normal',
              color: '#484F58',
            }}>
              @ {nextEvent.start}
            </span>
          </div>
        )}
      </div>

      {/* Event list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {events.length === 0 ? (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            color: '#253D5A',
            letterSpacing: '0.08em',
          }}>
            NO EVENTS TODAY
          </div>
        ) : (
          events.map(event => (
            <EventRow key={event.id} event={event} />
          ))
        )}
      </div>
    </div>
  );
}
