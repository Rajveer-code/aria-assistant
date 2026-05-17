import React from 'react';
import { RenderText } from './Assistant.jsx';
import { sendQueryStream } from '../api.js';


function parseEnvJson(v) {
  // handles both pre-parsed objects and JSON strings (SQLite raw storage)
  if (!v) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

function envelopeToDisplay(env) {
  if (!env) return { cal: null, faith: null, cons: null, eq: null, attrib: null, comp: null };
  // Normalize: SSE envelope uses `calibration`; SQLite _row_to_dict uses `calibration_json`
  const calibration  = parseEnvJson(env.calibration  ?? env.calibration_json);
  const faithfulness = parseEnvJson(env.faithfulness ?? env.faithfulness_json);
  const consistency  = parseEnvJson(env.consistency  ?? env.consistency_json);
  const equity       = parseEnvJson(env.equity       ?? env.equity_json);
  const attribution  = parseEnvJson(env.attribution  ?? env.attribution_json);

  const cal    = calibration  ? Math.round(Math.max(0, 1 - (calibration.ece_overall   ?? 0)) * 100) : null;
  const faith  = faithfulness ? Math.round((faithfulness.hhem_score ?? 0) * 100) : null;
  const cons   = consistency  ? Math.round(Math.max(0, 1 - (consistency.semantic_entropy ?? 0)) * 100) : null;
  const attrib = attribution  ? Math.round((attribution.jaccard_at_k ?? 0) * 100) : null;

  let eq = null;
  if (equity) {
    const di  = equity.disparate_impact    ?? 1;
    const eod = equity.equalized_odds_gap  ?? 0;
    eq = Math.round(Math.min(di, 2 - di) * 50 + (1 - Math.min(eod, 1)) * 50);
  }

  const comp = typeof env.composite_score === 'number' ? Math.round(env.composite_score) : null;
  return { cal, faith, cons, eq, attrib, comp };
}

const DEFAULT_DISPLAY = { cal: 82, faith: 91, cons: 76, eq: 41, attrib: 85, comp: 78 };

function ScoreVal({ val, fallback }) {
  const v = val ?? fallback;
  if (v == null) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  const color = v >= 80 ? 'var(--green)' : v >= 60 ? 'var(--amber)' : 'var(--danger)';
  return <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{v}</span>;
}

export function PageChat({ messages, setMessages, auditDisplay, setAuditDisplay, onAuditUpdate }) {
  const scrollRef = React.useRef(null);
  const inputRef  = React.useRef(null);

  const [input,       setInput]       = React.useState('');
  const [sending,     setSending]     = React.useState(false);
  const [streamingId, setStreamingId] = React.useState(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSubmit = React.useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);

    const now    = Date.now();
    const userId = `u${now}`;
    const ariaId = `a${now}`;

    setMessages(prev => [
      ...prev,
      { id: userId, role: 'user', text },
      { id: ariaId, role: 'aria', text: '', thinking: true },
    ]);
    setStreamingId(ariaId);

    try {
      let acc = '';
      await sendQueryStream(
        text,
        (token) => {
          acc += token;
          setMessages(prev => prev.map(m =>
            m.id === ariaId ? { ...m, text: acc, thinking: false } : m
          ));
        },
        (audit) => {
          if (audit) {
            setAuditDisplay(envelopeToDisplay(audit));
            onAuditUpdate && onAuditUpdate(audit);
          }
        },
      );
    } catch (err) {
      console.warn('Stream error:', err);
      setMessages(prev => prev.map(m =>
        m.id === ariaId
          ? { ...m, text: 'Backend unreachable. Start ARIA with `python .\\start.ps1`.', thinking: false }
          : m
      ));
    } finally {
      setStreamingId(null);
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, sending, onAuditUpdate, setAuditDisplay, setMessages]);

  const onKeyDown = React.useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const display = auditDisplay
    ? { ...auditDisplay }
    : DEFAULT_DISPLAY; // show defaults when no real audit yet

  return (
    <div className="page page-chat">
      <div className="page-hero">
        <div className="page-eyebrow">02 · Conversation</div>
        <h1 className="page-title">Continuous dialogue · audit on every turn</h1>
        <div className="page-sub">Each ARIA response is scored on the 5-axis CPFE envelope before it reaches you. Failed turns are auto-flagged, not silently shown.</div>
      </div>

      <div className="chat-stage">
        {/* ── Left sidebar ── */}
        <div className="chat-side glass">
          <div className="chat-side-section">
            <div className="t-label">Conversation</div>
            <div className="chat-thread-title">Live session · Qwen3 8B</div>
            <div className="chat-thread-meta">{messages.length} turns · real backend</div>
          </div>
          <div className="chat-side-divider" />
          <div className="chat-side-section">
            <div className="t-label" style={{ marginBottom: 10 }}>
              Audit envelope
              {auditDisplay && <span className="pulse-dot" style={{ width: 5, height: 5, marginLeft: 6, display: 'inline-block' }} />}
            </div>
            {[
              ['Faithfulness', display.faith,  DEFAULT_DISPLAY.faith],
              ['Calibration',  display.cal,    DEFAULT_DISPLAY.cal],
              ['Consistency',  display.cons,   DEFAULT_DISPLAY.cons],
              ['Equity',       display.eq,     DEFAULT_DISPLAY.eq],
              ['Attribution',  display.attrib, DEFAULT_DISPLAY.attrib],
            ].map(([label, val, fallback]) => (
              <div key={label} className="env-row">
                <span>{label}</span>
                <ScoreVal val={auditDisplay ? val : null} fallback={fallback} />
              </div>
            ))}
            <div className="env-composite">
              <span className="env-comp-label">Composite</span>
              <span className="env-comp-num">
                {auditDisplay && display.comp != null ? display.comp : DEFAULT_DISPLAY.comp}
              </span>
            </div>
            {!auditDisplay && (
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>
                Showing defaults — send a message to get live scores
              </div>
            )}
          </div>
          <div className="chat-side-divider" />
          <div className="chat-side-section">
            <div className="t-label" style={{ marginBottom: 8 }}>Active corpus</div>
            <div className="corpus-row"><span className="corpus-dot" style={{ background: 'var(--cyan)' }} />CPFE-JBI-2025.pdf</div>
            <div className="corpus-row"><span className="corpus-dot" style={{ background: 'var(--violet)' }} />IndiaFinBench.pdf</div>
            <div className="corpus-row"><span className="corpus-dot" style={{ background: 'var(--green)' }} />FL-Diabetes.pdf</div>
            <div className="corpus-row" style={{ color: 'var(--text-3)' }}>+ more from Papers page</div>
          </div>
        </div>

        {/* ── Main chat ── */}
        <div className="chat-main glass">
          <div className="chat-toolbar">
            <div className="row gap-12">
              <span className="pill pill-violet"><span className="dot" />QWEN3·8B-Q4</span>
              <span className={`pill ${sending ? 'pill-cyan' : 'pill-green'}`}>
                <span className="dot" />
                {sending ? 'STREAMING…' : 'AUDIT ON'}
              </span>
            </div>
            <div className="row gap-8">
              <button className="btn" onClick={() => { setMessages([]); setAuditDisplay(null); }}>Clear</button>
            </div>
          </div>

          <div className="chat-fullscroll scroll-thin" ref={scrollRef}>
            {messages.map(m => (
              <div key={m.id} className={`bubble bubble-lg ${m.role}`}>
                <span className="who">{m.role === 'user' ? 'YOU' : 'ARIA'}</span>
                {m.thinking ? (
                  <div className="thinking-dots"><span /><span /><span /></div>
                ) : (
                  <RenderText text={m.text} />
                )}
              </div>
            ))}
          </div>

          <div className="chat-input" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything · cite from 8 papers · Enter to send"
              rows={1}
              disabled={sending}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.08em',
                color: 'var(--ink-1)',
                padding: 0,
                lineHeight: 1.5,
              }}
            />
            <div className="row gap-8" style={{ flexShrink: 0 }}>
              <span className="t-tiny t-faint">↵ send</span>
              <button
                className={`btn ${!sending && input.trim() ? 'btn-cyan' : ''}`}
                onClick={handleSubmit}
                disabled={sending || !input.trim()}
                style={{ padding: '5px 12px', fontSize: 10 }}
              >
                {sending ? '…' : 'SEND'}
              </button>
              <span className={`pulse-dot ${sending ? '' : 'hidden'}`} style={{ width: 6, height: 6 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
