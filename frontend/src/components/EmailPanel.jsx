/**
 * EmailPanel — Gmail thread list with expand-on-click
 *
 * Monospace metadata, serif body text
 */

import { useState, useCallback } from 'react';
import { getEmails, getEmailThread, MOCK_EMAILS } from '../api.js';

function ThreadRow({ thread, expanded, onToggle }) {
  const isUnread = thread.unread;

  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          padding: '10px 14px',
          cursor: 'pointer',
          borderBottom: '1px solid #0F1A24',
          transition: 'background 150ms',
          background: expanded ? 'rgba(0,212,200,0.04)' : 'transparent',
          position: 'relative',
        }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = 'rgba(0,212,200,0.02)'; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Unread indicator */}
        {isUnread && (
          <div style={{
            position: 'absolute',
            left: 5,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: '#00D4C8',
          }} />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, paddingLeft: 6 }}>
          {/* Left: From + Subject */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              fontWeight: isUnread ? 700 : 400,
              color: isUnread ? '#C9D1D9' : '#8B949E',
              letterSpacing: '0.02em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: 3,
            }}>
              {thread.from}
            </div>
            <div style={{
              fontFamily: "'Crimson Pro', Georgia, serif",
              fontSize: 13,
              fontWeight: isUnread ? 600 : 400,
              color: isUnread ? '#E6EDF3' : '#C9D1D9',
              lineHeight: 1.3,
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {thread.subject}
            </div>
            {!expanded && (
              <div style={{
                fontFamily: "'Crimson Pro', Georgia, serif",
                fontSize: 12,
                color: '#484F58',
                fontStyle: 'italic',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.4,
              }}>
                {thread.snippet}
              </div>
            )}
          </div>

          {/* Right: Date */}
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: '#484F58',
            flexShrink: 0,
            paddingTop: 1,
          }}>
            {thread.date}
          </div>
        </div>
      </div>

      {/* Expanded message body */}
      {expanded && (
        <div style={{
          padding: '14px 16px',
          background: 'rgba(0,0,0,0.2)',
          borderBottom: '1px solid #0F1A24',
          animation: 'fade-in-up 150ms ease',
        }}>
          <p style={{
            fontFamily: "'Crimson Pro', Georgia, serif",
            fontSize: 14,
            color: '#C9D1D9',
            lineHeight: 1.8,
            fontWeight: 300,
          }}>
            {thread.snippet}
          </p>
          <div style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid #1A2332',
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            color: '#253D5A',
            letterSpacing: '0.06em',
          }}>
            [Full thread — connect Gmail API for complete messages]
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmailPanel({ emails: propEmails }) {
  const [emails, setEmails] = useState(propEmails ?? MOCK_EMAILS);
  const [expandedId, setExpandedId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getEmails(5);
      if (Array.isArray(data)) setEmails(data);
    } catch {
      // Stay with current emails
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleToggle = useCallback((id) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const unreadCount = emails.filter(e => e.unread).length;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: '#8B949E',
          }}>
            GMAIL
          </span>
          {unreadCount > 0 && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              fontWeight: 600,
              color: '#00D4C8',
              background: 'rgba(0,212,200,0.1)',
              border: '1px solid rgba(0,212,200,0.2)',
              borderRadius: 10,
              padding: '1px 6px',
            }}>
              {unreadCount}
            </span>
          )}
        </div>
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

      {/* Thread list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {emails.length === 0 ? (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            color: '#253D5A',
            letterSpacing: '0.08em',
          }}>
            NO MESSAGES
          </div>
        ) : (
          emails.map(thread => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              expanded={expandedId === thread.id}
              onToggle={() => handleToggle(thread.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
