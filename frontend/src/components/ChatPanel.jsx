/**
 * ChatPanel — terminal-style chat with voice input
 *
 * Features:
 * - Message list: serif for AI, mono for user
 * - Voice button with sonar-pulse animation (MediaRecorder)
 * - Text input with Cmd/Ctrl+Enter to send
 * - Audit badge (composite score) on each AI response
 * - Source chips below AI responses
 * - Auto-scroll to bottom
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { sendQuery, sendVoice } from '../api.js';

// ── Audit badge ───────────────────────────────────────────────────

function AuditBadge({ score }) {
  if (score == null) return null;
  const color =
    score >= 0.85 ? '#7EE787' :
    score >= 0.70 ? '#00D4C8' :
    score >= 0.55 ? '#F5A623' : '#E76F51';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 9,
      fontWeight: 600,
      color,
      background: `${color}18`,
      border: `1px solid ${color}35`,
      borderRadius: 3,
      padding: '1px 5px',
      letterSpacing: '0.04em',
      verticalAlign: 'middle',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 7 }}>◆</span>
      {score.toFixed(3)}
    </span>
  );
}

// ── Source chip ───────────────────────────────────────────────────

function SourceChip({ source }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: "'Space Mono', monospace",
      fontSize: 8.5,
      color: '#58A6FF',
      background: 'rgba(88,166,255,0.08)',
      border: '1px solid rgba(88,166,255,0.2)',
      borderRadius: 3,
      padding: '2px 6px',
      cursor: 'default',
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}>
      [{source}]
    </span>
  );
}

// ── Message bubble ────────────────────────────────────────────────

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  if (isSystem) {
    return (
      <div style={{
        padding: '6px 0',
        display: 'flex',
        justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          color: '#253D5A',
          letterSpacing: '0.08em',
        }}>
          — {msg.content} —
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: isUser ? 'flex-end' : 'flex-start',
        animation: 'fade-in-up 200ms ease forwards',
      }}
    >
      {/* Role label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: isUser ? '#58A6FF' : '#00D4C8',
        }}>
          {isUser ? 'YOU' : 'ARIA'}
        </span>
        {!isUser && msg.auditScore != null && <AuditBadge score={msg.auditScore} />}
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8,
          color: '#253D5A',
        }}>
          {msg.time}
        </span>
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: '88%',
        padding: isUser ? '8px 12px' : '10px 14px',
        background: isUser
          ? 'rgba(88,166,255,0.08)'
          : 'rgba(0,212,200,0.04)',
        border: `1px solid ${isUser ? 'rgba(88,166,255,0.18)' : '#1A2332'}`,
        borderRadius: isUser
          ? '8px 2px 8px 8px'
          : '2px 8px 8px 8px',
        position: 'relative',
      }}>
        {isUser ? (
          <p style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 12,
            lineHeight: 1.6,
            color: '#C9D1D9',
            wordBreak: 'break-word',
          }}>
            {msg.content}
          </p>
        ) : (
          <>
            {/* Terminal cursor before text */}
            <p style={{
              fontFamily: "'Crimson Pro', Georgia, serif",
              fontSize: 14,
              lineHeight: 1.75,
              color: '#C9D1D9',
              fontWeight: 300,
              wordBreak: 'break-word',
              fontStyle: msg.pending ? 'italic' : 'normal',
            }}>
              {msg.pending ? (
                <span style={{ color: '#484F58' }}>
                  <span style={{ animation: 'blink-cursor 1s step-end infinite' }}>▋</span>
                </span>
              ) : msg.content}
            </p>

            {/* Source chips */}
            {msg.sources?.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid rgba(88,166,255,0.12)',
              }}>
                {msg.sources.map((src, i) => (
                  <SourceChip key={i} source={src} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Voice button ──────────────────────────────────────────────────

function VoiceButton({ onTranscript, disabled }) {
  const [recording, setRecording] = useState(false);
  const mediaRef    = useRef(null);
  const chunksRef   = useRef([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        try {
          const result = await sendVoice(blob);
          if (result?.transcript) onTranscript(result.transcript);
        } catch {
          // Voice API not available — silently ignore
        }
      };
      recorder.start();
      mediaRef.current = recorder;
      setRecording(true);
    } catch {
      // Microphone not available
    }
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    if (mediaRef.current?.state === 'recording') {
      mediaRef.current.stop();
      mediaRef.current = null;
    }
    setRecording(false);
  }, []);

  const handleClick = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={recording ? 'Stop recording' : 'Voice input'}
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: recording
          ? 'rgba(245,166,35,0.15)'
          : 'rgba(0,212,200,0.08)',
        border: `1px solid ${recording ? 'rgba(245,166,35,0.4)' : 'rgba(0,212,200,0.25)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
        transition: 'all 200ms ease',
        cursor: 'pointer',
      }}
    >
      {/* Sonar rings when recording */}
      {recording && (
        <>
          {[0, 0.4, 0.8].map(delay => (
            <span
              key={delay}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '1px solid rgba(245,166,35,0.5)',
                animation: `sonar-ring 1.5s ease-out ${delay}s infinite`,
              }}
            />
          ))}
        </>
      )}
      {/* Mic icon */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="9" y="2" width="6" height="11" rx="3"
          fill={recording ? '#F5A623' : '#00D4C8'} />
        <path d="M5 11a7 7 0 0 0 14 0"
          stroke={recording ? '#F5A623' : '#00D4C8'}
          strokeWidth="2" strokeLinecap="round" fill="none" />
        <line x1="12" y1="18" x2="12" y2="22"
          stroke={recording ? '#F5A623' : '#00D4C8'}
          strokeWidth="2" strokeLinecap="round" />
        <line x1="8" y1="22" x2="16" y2="22"
          stroke={recording ? '#F5A623' : '#00D4C8'}
          strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// ── Main ChatPanel ────────────────────────────────────────────────

export default function ChatPanel({ onNewEnvelope }) {
  const [messages, setMessages] = useState([
    {
      id: 'sys-0',
      role: 'system',
      content: 'ARIA RUNTIME AUDIT SESSION STARTED',
      time: new Date().toLocaleTimeString(),
    },
    {
      id: 'aria-0',
      role: 'assistant',
      content: 'System online. I\'m ARIA — your Adaptive Runtime Intelligence Auditor. I monitor fairness, calibration, faithfulness, consistency, equity, and attribution in real time as we converse. How may I assist your research today?',
      time: new Date().toLocaleTimeString(),
      auditScore: null,
      sources: [],
    },
  ]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const scrollRef               = useRef(null);
  const inputRef                = useRef(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const pushMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), ...msg }]);
  }, []);

  const handleSend = useCallback(async (text) => {
    const prompt = (text ?? input).trim();
    if (!prompt || loading) return;
    setInput('');

    const userMsg = {
      role: 'user',
      content: prompt,
      time: new Date().toLocaleTimeString(),
    };
    pushMessage(userMsg);

    // Pending AI message
    const pendingId = Date.now() + '-pending';
    setMessages(prev => [...prev, {
      id: pendingId,
      role: 'assistant',
      content: '',
      pending: true,
      time: new Date().toLocaleTimeString(),
    }]);
    setLoading(true);

    try {
      const result = await sendQuery(prompt, true);

      setMessages(prev => prev.map(m =>
        m.id === pendingId
          ? {
              ...m,
              pending: false,
              content: result.response ?? result.answer ?? result.text ?? '(no response)',
              auditScore: result.audit_envelope?.composite ?? null,
              sources: result.sources ?? [],
            }
          : m
      ));

      if (result.audit_envelope && onNewEnvelope) {
        onNewEnvelope(result.audit_envelope);
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === pendingId
          ? {
              ...m,
              pending: false,
              content: `[Backend unavailable — ${err.message}]`,
              auditScore: null,
              sources: [],
            }
          : m
      ));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, pushMessage, onNewEnvelope]);

  const handleKeyDown = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleTranscript = useCallback((transcript) => {
    setInput(transcript);
    inputRef.current?.focus();
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0D1117',
      border: '1px solid #1A2332',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #1A2332',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'rgba(10,14,19,0.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: '#8B949E',
          }}>
            DIALOGUE / QUERY
          </span>
        </div>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          color: '#253D5A',
          letterSpacing: '0.06em',
        }}>
          {messages.filter(m => m.role !== 'system').length} msgs · ⌘+Enter to send
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>

      {/* Input area */}
      <div style={{
        padding: '10px 12px',
        borderTop: '1px solid #1A2332',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        flexShrink: 0,
        background: 'rgba(7,10,15,0.6)',
      }}>
        <VoiceButton onTranscript={handleTranscript} disabled={loading} />
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter query… (⌘+Enter to send)"
            rows={2}
            style={{
              width: '100%',
              resize: 'none',
              padding: '8px 10px',
              paddingRight: 36,
              background: '#111820',
              border: '1px solid #1A2332',
              borderRadius: 4,
              color: '#C9D1D9',
              fontFamily: "'Space Mono', monospace",
              fontSize: 12,
              lineHeight: 1.5,
              transition: 'border-color 200ms',
            }}
            onFocus={e => { e.target.style.borderColor = '#00D4C8'; }}
            onBlur={e => { e.target.style.borderColor = '#1A2332'; }}
          />
        </div>
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          style={{
            padding: '0 14px',
            height: 58,
            background: loading || !input.trim()
              ? 'rgba(0,212,200,0.05)'
              : 'rgba(0,212,200,0.12)',
            border: `1px solid ${loading || !input.trim() ? '#1A2332' : 'rgba(0,212,200,0.3)'}`,
            borderRadius: 4,
            color: loading || !input.trim() ? '#253D5A' : '#00D4C8',
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 200ms ease',
            flexShrink: 0,
          }}
        >
          {loading ? (
            <span style={{ animation: 'blink-cursor 1s step-end infinite' }}>▋</span>
          ) : 'SEND'}
        </button>
      </div>
    </div>
  );
}
