import React from 'react';
import { Icon } from './Icons.jsx';
import { BASE, WS_BASE } from '../api.js';

// ==================== useVoiceInteraction hook ====================
/**
 * Manages WebSocket connection to /ws/wake, MediaRecorder, silence detection,
 * and TTS playback.
 *
 * @param onResult - called with { response, transcript, audit_envelope, ... }
 * @returns { orbState, startListening }
 */
export function useVoiceInteraction(onResult) {
  const [orbState, setOrbState] = React.useState('idle');
  const [wakeMode, setWakeMode] = React.useState('ws'); // 'ws' | 'tap'
  const [orbError, setOrbError] = React.useState('');
  const orbStateRef = React.useRef('idle');
  const recorderRef = React.useRef(null);
  const wsRef = React.useRef(null);

  // Keep ref in sync
  React.useEffect(() => { orbStateRef.current = orbState; }, [orbState]);

  const stopListening = React.useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const startListening = React.useCallback(async () => {
    if (orbStateRef.current !== 'idle') return;
    setOrbError('');
    setOrbState('listening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analyser);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg';

      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        setOrbState('processing');
        try {
          const blob = new Blob(chunks, { type: mimeType });
          const form = new FormData();
          form.append('file', blob, 'recording.webm');
          const res = await fetch(`${BASE}/voice`, { method: 'POST', body: form });
          if (!res.ok) throw new Error(`Voice HTTP ${res.status}`);
          const result = await res.json();
          onResult(result);
          // TTS playback
          setOrbState('speaking');
          try {
            const ttsRes = await fetch(`${BASE}/tts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: result.response }),
            });
            if (ttsRes.ok) {
              const audioBlob = await ttsRes.blob();
              const url = URL.createObjectURL(audioBlob);
              const audio = new Audio(url);
              audio.onended = () => { setOrbState('idle'); URL.revokeObjectURL(url); };
              audio.onerror = () => setOrbState('idle');
              await audio.play();
              return;
            }
          } catch { /* TTS optional */ }
          setOrbState('idle');
        } catch (err) {
          console.warn('Voice processing error:', err);
          setOrbState('idle');
        }
      };

      recorderRef.current = recorder;
      recorder.start();

      // Silence detection: stop after 1.5 s of near-silence (threshold=25)
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = null;
      const checkSilence = () => {
        if (!recorderRef.current || recorderRef.current.state !== 'recording') return;
        analyser.getByteFrequencyData(freqData);
        const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;
        if (avg < 25) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart > 1500) {
            recorderRef.current?.stop();
            return;
          }
        } else {
          silenceStart = null;
        }
        requestAnimationFrame(checkSilence);
      };
      requestAnimationFrame(checkSilence);
    } catch (err) {
      console.warn('Microphone access failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setOrbError('Microphone blocked — allow in browser settings');
      }
      setOrbState('idle');
    }
  }, [onResult]);

  // WebSocket connection to /ws/wake — auto-reconnects; falls back to tap mode
  React.useEffect(() => {
    let ws;
    let reconnectTimer;

    const connect = () => {
      try {
        ws = new WebSocket(`${WS_BASE}/ws/wake`);
        wsRef.current = ws;
        ws.onopen = () => setWakeMode('ws');
        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'wake') startListening();
          } catch { /* ignore malformed */ }
        };
        ws.onclose = () => {
          setWakeMode('tap');
          reconnectTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => {
          setWakeMode('tap');
          ws.close();
        };
      } catch {
        setWakeMode('tap');
        reconnectTimer = setTimeout(connect, 5000);
      }
    };
    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [startListening]);

  return { orbState, startListening, stopListening, wakeMode, orbError };
}

// ==================== Voice Orb ====================
export function VoiceOrb({ state, onClick, onStop, wakeMode, error }) {
  const [bars, setBars] = React.useState(Array(9).fill(8));
  const rafRef = React.useRef(0);

  React.useEffect(() => {
    if (state !== 'speaking' && state !== 'listening') {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    let t = 0;
    const tick = () => {
      t += 1;
      const amp = state === 'speaking' ? 40 : 8;
      const base = state === 'speaking' ? 14 : 6;
      setBars(prev => prev.map((_, i) => {
        const phase = (t + i * 7) * 0.18;
        const wobble = Math.sin(phase) * 0.5 + Math.sin(phase * 1.7) * 0.3 + Math.sin(phase * 0.6) * 0.2;
        const r = Math.abs(wobble) * amp + base + Math.random() * (state === 'speaking' ? 4 : 1);
        return Math.max(4, r);
      }));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state]);

  const stateLabel = {
    idle: 'IDLE',
    listening: 'LISTENING',
    processing: 'PROCESSING',
    speaking: 'SPEAKING',
  }[state];

  const idleSub = wakeMode === 'tap'
    ? 'Wake: tap to speak (WS offline)'
    : 'Wake: ARMED · "Hey ARIA"';

  const stateSub = {
    idle: idleSub,
    listening: 'Capturing audio · faster-whisper · distil-large-v3',
    processing: 'Qwen3-8B · BGE-M3 · HHEM 2.1',
    speaking: 'Piper TTS · en_US-lessac-medium',
  }[state];

  const handleOrbClick = () => {
    if (state === 'idle') onClick?.();
    else if (state === 'listening') onStop?.();
  };

  return (
    <div className="voice-block glass">
      <div className="orb-wrap">
        <div
          className={`voice-orb ${state}`}
          onClick={handleOrbClick}
          style={{ cursor: (state === 'idle' || state === 'listening') ? 'pointer' : 'default' }}
          title={state === 'idle' ? 'Click to speak' : state === 'listening' ? 'Click to stop' : undefined}
        >
          {state === 'listening' && <>
            <span className="ring-2" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(0,217,255,0.5)' }} />
            <span className="ring-3" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(0,217,255,0.5)' }} />
          </>}
          {state === 'processing' && <span className="proc-arc" />}
          {(state === 'speaking' || state === 'listening') && (
            <div className="waveform">
              {bars.map((h, i) => (
                <div key={i} className="waveform-bar" style={{ height: `${h}px`, opacity: state === 'listening' ? 0.6 : 1 }} />
              ))}
            </div>
          )}
          {state === 'idle' && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(240,244,255,0.45)' }}>
              <Icon.Mic />
            </div>
          )}
        </div>
      </div>
      <div className="voice-state">
        {state === 'idle' ? stateLabel : <span className="blink">{stateLabel}</span>}
      </div>
      <div className="voice-sub" style={{ color: wakeMode === 'tap' && state === 'idle' ? 'var(--amber)' : undefined }}>
        {stateSub}
      </div>
      {error && (
        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--danger)', fontFamily: 'var(--font-mono)', textAlign: 'center', letterSpacing: '0.04em' }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ==================== Citations ====================
export const CITATIONS = {
  '1': { title: 'CPFE Framework', meta: 'Pall, JBI 2025 · p. 4', body: 'Cross-Platform Fairness Evaluation: A Five-Axis Audit Framework for Transformer-Based Mental Health NLP. ECE = 0.087 on Twitter; recalibrated to 0.041 via isotonic regression.', link: 'arxiv.org/abs/24XX.XXXXX' },
  '2': { title: 'IndiaFinBench', meta: 'Pall, EMNLP submission · p. 12', body: 'Hybrid BM25 + dense retrieval with hyphen-preserving tokenizer; RRF fusion (k=60) improves nDCG@10 by 18.4% on financial-document QA.', link: 'github.com/rajveerpall/IndiaFinBench' },
  '3': { title: 'FL-Diabetes', meta: 'Pall, JBI 2025', body: 'Federated learning over diabetes registries; differential privacy budget ε=1.2 with negligible loss on AUROC (0.84 → 0.82).', link: 'arxiv.org/abs/24XX.XXXXX' },
};

export function CitationSup({ num }) {
  const [show, setShow] = React.useState(false);
  const cite = CITATIONS[num] || { title: 'Citation', meta: '', body: '', link: '' };
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span className="cite-sup"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}>
        {num}
      </span>
      <div className={`tooltip ${show ? 'show' : ''}`} style={{ bottom: '120%', left: '50%', transform: `${show ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(4px)'}`, width: 280 }}>
        <div className="t-title">{cite.title}</div>
        <div className="t-meta">{cite.meta}</div>
        <div className="t-body">{cite.body}</div>
        <a className="t-link" href="#" onClick={(e) => e.preventDefault()}>→ {cite.link}</a>
      </div>
    </span>
  );
}

// ==================== Typewriter ====================
export function Typewriter({ text, speed = 14, onDone }) {
  const [n, setN] = React.useState(() => (typeof document !== 'undefined' && document.hidden) ? text.length : 0);
  React.useEffect(() => {
    if (n >= text.length) { onDone && onDone(); return; }
    const t = setTimeout(() => setN(n + 1), speed);
    return () => clearTimeout(t);
  }, [n, text, speed]);
  const sub = text.slice(0, n);
  const parts = sub.split(/(\[\[\d+\]\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[\[(\d+)\]\]$/);
        if (m) return <CitationSup key={i} num={m[1]} />;
        return <span key={i}>{p}</span>;
      })}
      {n < text.length && <span className="cursor" />}
    </>
  );
}

// ==================== RenderText ====================
export function RenderText({ text }) {
  const parts = text.split(/(\[\[\d+\]\])/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[\[(\d+)\]\]$/);
    if (m) return <CitationSup key={i} num={m[1]} />;
    const lines = p.split('\n');
    return (
      <React.Fragment key={i}>
        {lines.map((line, li) => {
          const segs = line.split(/(\*\*[^*]+\*\*)/g);
          return (
            <React.Fragment key={li}>
              {segs.map((s, si) => {
                const b = s.match(/^\*\*([^*]+)\*\*$/);
                return b ? <strong key={si} style={{ color: 'var(--cyan)', fontWeight: 500 }}>{b[1]}</strong> : <span key={si}>{s}</span>;
              })}
              {li < lines.length - 1 && <br />}
            </React.Fragment>
          );
        })}
      </React.Fragment>
    );
  });
}

// ==================== Chat ====================
export function Chat({ messages, streamingId }) {
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div className="chat-block glass">
      <div className="row between" style={{ alignItems: 'center' }}>
        <div className="t-label">Conversation</div>
        <div className="pill pill-violet"><span className="dot" />QWEN3·8B</div>
      </div>
      <div className="chat-list scroll-thin" ref={scrollRef}>
        {messages.map(m => (
          <div key={m.id} className={`bubble ${m.role}`}>
            <span className="who">{m.role === 'user' ? 'YOU' : 'ARIA'}</span>
            {m.role === 'aria' && m.id === streamingId ? (
              <Typewriter text={m.text} speed={11} />
            ) : (
              <RenderText text={m.text} />
            )}
            {m.thinking && (
              <div className="thinking-dots" style={{ marginTop: 8 }}>
                <span /><span /><span />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== Email & Calendar mini ====================
export function EmailMini({ emails }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="mini-section glass">
      <div className="mini-head">
        <div className="row gap-8">
          <span className="t-label">Gmail · Unread</span>
          <span className="pill pill-cyan" style={{ padding: '2px 8px', fontSize: 9 }}><span className="dot" />{emails.length}</span>
        </div>
        <button className="btn" style={{ padding: '4px 8px', fontSize: 9 }} onClick={() => setOpen(!open)}>{open ? 'COLLAPSE' : 'EXPAND'}</button>
      </div>
      {open && (
        <div className="col gap-4">
          {emails.map((e, i) => (
            <div key={i} className="email-row">
              <span className="from">{e.from}</span>
              <span className="subj">{e.subj}</span>
              <span className="time">{e.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CalendarMini({ events }) {
  return (
    <div className="mini-section glass">
      <div className="mini-head">
        <div className="row gap-8">
          <span className="t-label">Calendar · Today</span>
          <span className="pill" style={{ padding: '2px 8px', fontSize: 9, color: 'var(--text-3)' }}>{events.length} EVENTS</span>
        </div>
        <span className="t-tiny t-faint">FRI · MAY 16 2026</span>
      </div>
      <div className="cal-strip scroll-thin">
        {events.map((e, i) => (
          <div key={i} className={`cal-event ${e.state || ''}`}>
            {e.state === 'now' && <span className="cal-now-marker">● NOW</span>}
            {e.state === 'soon' && <span className="cal-now-marker" style={{ color: 'var(--amber)' }}>● IN {e.in}</span>}
            <div className="cal-time">{e.time}</div>
            <div className="cal-title">{e.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
