import React from 'react';
import { Icon } from './components/Icons.jsx';
import { PentagonRadar, CountUp } from './components/Radar.jsx';
import { AXIS_META, compositeColor, AxisCard, AuditFeed, BaselineStrip } from './components/AuditExtras.jsx';
import { DriftBar } from './components/Drift.jsx';
import { VoiceOrb, Chat, EmailMini, CalendarMini, useVoiceInteraction } from './components/Assistant.jsx';
import { PageChat } from './components/PageChat.jsx';
import { PageEmail } from './components/PageEmail.jsx';
import { PageCalendar } from './components/PageCalendar.jsx';
import { PageEval } from './components/PageEval.jsx';
import { PagePapers } from './components/PagePapers.jsx';
import { getHealth, getRecentAudits } from './api.js';

// ==================== Mock / Default Data ====================
const DEFAULT_SCORES = [82, 91, 76, 41, 85]; // cal, faith, cons, equity, attrib
const COMPOSITE_DEFAULT = 78;
const FLAGGED_EQUITY_IDX = 3;

const MOCK_EMAILS = [
  { from: 'ETH Zurich Admissions',  subj: 'Application portal opens · MSc Data Science', time: '08:42' },
  { from: 'Prof. M. Raghavan',       subj: 'Re: CPFE follow-up — can we discuss EMNLP slot?', time: '07:18' },
  { from: 'arXiv moderation',        subj: 'Submission 2606.04219 accepted to cs.LG · live in 6 hours', time: '06:55' },
  { from: 'HuggingFace',             subj: 'rajveerpall/aria-audit-bench — 14 new downloads', time: '03:21' },
];

const MOCK_EVENTS = [
  { time: '09:00', title: 'Morning RAG ingest · 3 new PDFs', state: null },
  { time: '11:00', title: 'Office hours — Prof. Raghavan', state: 'soon', in: '32 min' },
  { time: '13:30', title: 'ARIA self-audit run · BBQ subset', state: 'now' },
  { time: '15:00', title: 'EPFL recommender call · J. Vaucher', state: null },
  { time: '17:30', title: 'Workshop draft — figure ablation', state: null },
  { time: '20:00', title: 'Track A — paper Section 4 writing', state: null },
];

const MOCK_FEED_DEFAULT = [
  { ts: '14:32:07', kind: 'ok',   msg: 'Faithfulness: 91 · 3 claims verified (HHEM 0.94)' },
  { ts: '14:32:07', kind: 'fail', msg: 'Equity: 41 · DI=0.61, EOD gap=0.18 — flagged' },
  { ts: '14:32:07', kind: 'warn', msg: 'Calibration: 82 · 1 overconfident bin (verbal>0.9)' },
  { ts: '14:32:07', kind: 'ok',   msg: 'Consistency: 76 · entropy=0.42 across N=3 paraphrase' },
  { ts: '14:32:07', kind: 'ok',   msg: 'Attribution: 85 · Jaccard@5=0.81 under paraphrase' },
  { ts: '14:32:01', kind: 'ok',   msg: 'Retrieval · 5 chunks from CPFE-JBI.pdf, BGE-M3 + RRF' },
  { ts: '14:31:58', kind: 'ok',   msg: 'Counterfactual substitution · 4/4 pairs scored' },
  { ts: '14:31:52', kind: 'fail', msg: 'Equity: 41 · disparate impact on profession axis' },
  { ts: '14:31:48', kind: 'ok',   msg: 'STT · distil-large-v3 · 1.42s · WER est. 2.1%' },
  { ts: '14:31:45', kind: 'ok',   msg: 'Wake signal · openWakeWord confidence 0.97' },
];

const MOCK_FEED_BRIEF = [
  { ts: '14:32:07', kind: 'ok', msg: 'Audit envelope written · row 1,847 · sqlite' },
  { ts: '14:32:07', kind: 'ok', msg: 'Latency · 0.84s total (Qwen3 0.61 + audit 0.23)' },
  { ts: '14:32:07', kind: 'ok', msg: 'Peak VRAM · 6.72 GB · HHEM loaded then released' },
];

const CHAT_AUDIT_DEFAULT = [
  { id: 'u1', role: 'user', text: "ARIA — what was the ECE on Twitter in the CPFE paper, and how did you recalibrate it?" },
  { id: 'a1', role: 'aria', text: "The Twitter subset showed an Expected Calibration Error of 0.087[[1]] before recalibration — well above the 0.05 threshold used for clinical deployment. After applying isotonic regression with 10-bin grouping conditioned on demographic group, ECE dropped to 0.041[[1]], regaining calibration parity across the four protected axes.\n\nThe approach mirrors the asymmetric BGE encoding pattern[[2]] from IndiaFinBench but applied to calibration-head outputs rather than retrieval embeddings." },
];

const CHAT_LISTENING = [
  { id: 'u0', role: 'user', text: 'What was the differential privacy budget on the FL-Diabetes paper?' },
  { id: 'a0', role: 'aria', text: "We used ε=1.2 with δ=10⁻⁵ across the federated training rounds[[3]]. AUROC dropped from 0.84 to 0.82 — within the 2.5pp clinical tolerance.\n\nThe trade-off curve is in Figure 4 of the JBI paper." },
];

function makeDriftSeries() {
  const cal    = [78,80,79,82,81,83,82,80,82,84,83,82,80,81,82,83,82,81,82,82];
  const faith  = [88,89,87,90,91,90,92,91,90,91,92,91,90,91,92,90,91,91,90,91];
  const cons   = [80,79,78,80,77,76,78,77,76,75,77,78,76,77,75,76,77,76,77,76];
  const equity = [78,76,75,77,72,68,65,60,55,50,52,48,45,50,46,42,44,41,42,41];
  const attrib = [83,84,85,84,86,85,87,86,85,86,85,84,86,85,86,85,86,85,86,85];
  return [
    { name: 'Calibration',  color: '#A8742E', values: cal },
    { name: 'Faithfulness', color: '#2A4A7F', values: faith },
    { name: 'Consistency',  color: '#6B4A8A', values: cons },
    { name: 'Equity',       color: '#3A6B4A', values: equity },
    { name: 'Attribution',  color: '#8A6243', values: attrib },
  ];
}

// ==================== Persisted chat seed ====================
const SEED_CHAT = [
  { id: 'm1', role: 'user', text: "ARIA — what was the ECE on Twitter in the CPFE paper, and how did you recalibrate it?" },
  { id: 'm2', role: 'aria', text: "The Twitter subset showed an Expected Calibration Error of **0.087** before recalibration — above the 0.05 clinical deployment threshold. After applying isotonic regression with 10-bin grouping conditioned on demographic group, ECE dropped to **0.041**, regaining calibration parity across the four protected axes.\n\nThe approach mirrors the asymmetric BGE encoding pattern from IndiaFinBench but applied to calibration-head outputs rather than retrieval embeddings." },
];

// ==================== Nav config ====================
const NAV_PAGES = {
  audit:    { eyebrow: 'Dashboard',  name: '5-Axis Audit',      Ico: Icon.Audit },
  chat:     { eyebrow: 'Workspace',  name: 'Conversation',      Ico: Icon.Chat },
  email:    { eyebrow: 'Workspace',  name: 'Inbox',             Ico: Icon.Mail },
  calendar: { eyebrow: 'Workspace',  name: 'Calendar',          Ico: Icon.Calendar },
  eval:     { eyebrow: 'Evaluation', name: 'Benchmark History', Ico: Icon.Chart },
  papers:   { eyebrow: 'Corpus',     name: 'Paper Library',     Ico: Icon.Paper },
};

// ==================== useHealth hook ====================
function useHealth() {
  const [health, setHealth] = React.useState(null);
  React.useEffect(() => {
    const poll = () => getHealth().then(setHealth).catch(() => {});
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, []);
  return health;
}

// ==================== Map AuditEnvelope dict → display scores ====================
function _parseEnvJson(v) {
  if (!v) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

function envelopeToScores(env) {
  if (!env) return { scores: DEFAULT_SCORES, flaggedIdx: FLAGGED_EQUITY_IDX, composite: COMPOSITE_DEFAULT };

  // Normalize: SSE uses `calibration`; SQLite _row_to_dict uses `calibration_json`
  const calibration  = _parseEnvJson(env.calibration  ?? env.calibration_json);
  const faithfulness = _parseEnvJson(env.faithfulness ?? env.faithfulness_json);
  const consistency  = _parseEnvJson(env.consistency  ?? env.consistency_json);
  const equityData   = _parseEnvJson(env.equity       ?? env.equity_json);
  const attribution  = _parseEnvJson(env.attribution  ?? env.attribution_json);

  const cal    = calibration  ? Math.round(Math.max(0, 1 - (calibration.ece_overall   ?? 0)) * 100) : DEFAULT_SCORES[0];
  const faith  = faithfulness ? Math.round((faithfulness.hhem_score ?? 0) * 100)                    : DEFAULT_SCORES[1];
  const cons   = consistency  ? Math.round(Math.max(0, 1 - (consistency.semantic_entropy ?? 0)) * 100) : DEFAULT_SCORES[2];
  const attrib = attribution  ? Math.round((attribution.jaccard_at_k ?? 0) * 100)                   : DEFAULT_SCORES[4];

  let eq = DEFAULT_SCORES[3];
  if (equityData) {
    const di  = equityData.disparate_impact   ?? 1;
    const eod = equityData.equalized_odds_gap ?? 0;
    eq = Math.round(Math.min(di, 2 - di) * 50 + (1 - Math.min(eod, 1)) * 50);
  }

  const s = [cal, faith, cons, eq, attrib];
  const compositeVal = typeof env.composite_score === 'number' ? Math.round(env.composite_score) : COMPOSITE_DEFAULT;
  const flagged = s.findIndex(v => v < 50);
  return { scores: s, flaggedIdx: flagged >= 0 ? flagged : null, composite: compositeVal };
}

// ==================== Header ====================
function Header({ active, health }) {
  const meta = NAV_PAGES[active];
  const model = health?.model || 'qwen3 : 8b · q4_K_M';
  const vramStr = health?.vram_used_gb != null
    ? `RTX 4060 — ${health.vram_used_gb} / ${health.vram_total_gb} GB`
    : 'RTX 4060 — 5.6 / 8.0 GB';
  const papers = health?.papers_indexed ?? 8;
  const online = health?.ollama === true;

  return (
    <header className="header">
      <div className="header-row">
        <div className="header-title">
          <span className="header-page-eyebrow">{meta.eyebrow}</span>
          <span className="header-page-name">{meta.name}</span>
        </div>
        <div className="header-status">
          <span><span className="k">Model</span> <span className="v">{model}</span></span>
          <span className="sep">·</span>
          <span><span className="k">GPU</span> <span className="v">{vramStr}</span></span>
          <span className="sep">·</span>
          <span><span className="k">Backend</span> <span className="v-cy" style={{ color: online ? undefined : 'var(--danger)' }}>{online ? 'online' : 'offline'}</span></span>
        </div>
        <div className="header-badges">
          <span className={`pill ${online ? 'pill-accent' : 'pill-flag'}`}>
            <span className="dot" />{online ? 'Ollama online' : 'Ollama offline'}
          </span>
          <span className="pill"><span className="dot" />{papers} papers indexed</span>
          <span className="pill">Local · no cloud</span>
        </div>
      </div>
    </header>
  );
}

// ==================== Sidebar ====================
function Sidebar({ active, setActive, chatTurns }) {
  const nav = [
    { key: 'audit',    label: 'Audit Engine', kbd: '1' },
    { key: 'chat',     label: 'Conversation', kbd: '2' },
    { key: 'email',    label: 'Inbox',        kbd: '3' },
    { key: 'calendar', label: 'Calendar',     kbd: '4' },
  ];
  const tools = [
    { key: 'eval',   label: 'Evaluation', kbd: '5' },
    { key: 'papers', label: 'Papers',     kbd: '6' },
  ];
  const renderItem = (it) => {
    const Ico = NAV_PAGES[it.key].Ico;
    const badge = it.key === 'chat' && chatTurns > 0 ? chatTurns : null;
    return (
      <div key={it.key}
        className={`sidebar-item ${active === it.key ? 'active' : ''}`}
        onClick={() => setActive(it.key)}>
        <span className="sidebar-icon"><Ico /></span>
        <span className="sidebar-label">{it.label}</span>
        {badge != null && (
          <span className="sidebar-badge">{badge}</span>
        )}
        <span className="sidebar-kbd">{it.kbd}</span>
      </div>
    );
  };
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">A</div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">ARIA</span>
          <span className="sidebar-logo-sub">Auditable Research Intelligence</span>
        </div>
      </div>
      <div className="sidebar-section">Workspace</div>
      {nav.map(renderItem)}
      <div className="sidebar-section">Research</div>
      {tools.map(renderItem)}
      <div className="mt-auto">
        <div className="sidebar-item" style={{ marginTop: 12 }}>
          <span className="sidebar-icon"><Icon.Settings /></span>
          <span className="sidebar-label">Settings</span>
        </div>
      </div>
    </aside>
  );
}

// ==================== Scenario tabs ====================
function ScenarioTabs({ scenario, setScenario }) {
  const opts = [
    { k: 'audit-complete', l: 'Complete' },
    { k: 'flagged',        l: 'Flagged' },
    { k: 'listening',      l: 'Listening' },
    { k: 'processing',     l: 'Processing' },
    { k: 'idle',           l: 'Idle' },
    { k: 'briefing',       l: 'Briefing' },
  ];
  return (
    <div className="scenario-tabs">
      <span className="label">Demo state</span>
      {opts.map(o => (
        <button key={o.k}
          className={`scenario-btn ${scenario === o.k ? 'active' : ''}`}
          onClick={() => setScenario(o.k)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

// ==================== Composite ====================
function Composite({ value, prevValue = 82 }) {
  const cls = compositeColor(value);
  const delta = value - prevValue;
  const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(0);
  return (
    <div className="composite">
      <div className={`num ${cls}`}>
        <CountUp value={value} duration={900} />
      </div>
      <div className="sep">of 100</div>
      <div className="label">CPFE Composite</div>
      <div className={`delta-mini ${delta < 0 ? 'down' : 'up'}`}>
        {delta < 0 ? '↓' : '↑'} {deltaStr} vs prev
      </div>
    </div>
  );
}

// ==================== Audit Engine ====================
function AuditEngine({ scenario, setScenario, scores, flaggedIdx, composite }) {
  const [axisHover, setAxisHover] = React.useState(null);
  const labels = AXIS_META.map(a => a.short);
  const colors = AXIS_META.map(a => a.color);
  const equityFlagged = scores[3] < 50;

  return (
    <section className="audit-panel">
      {scenario === 'flagged' && <div className="audit-tint" key={`tint-${Date.now()}`} />}

      <div className="audit-header">
        <div className="audit-title-block">
          <div className="eyebrow">CPFE Runtime Audit Engine</div>
          <h1>5-Axis Fairness Telemetry · Live</h1>
          <div className="cite">Operationalising CPFE — Pall, JBI 2025</div>
        </div>
        <div className="audit-header-meta">
          <span className={`pill ${equityFlagged ? 'pill-flag' : 'pill-good'}`}>
            <span className="dot" />
            {scenario === 'processing' ? 'Auditing…' : (equityFlagged ? 'Equity flagged' : 'Envelope clean')}
          </span>
          <div className="audit-header-kv">
            <span><span className="k">Run</span> <span className="v">#1,847</span></span>
            <span className="dim">·</span>
            <span><span className="k">Audit-id</span> <span className="v">e2a9·47b</span></span>
            <span className="dim">·</span>
            <span><span className="k">Latency</span> <span className="v">0.84 s</span></span>
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            Switch state to preview ARIA's behaviour across the audit lifecycle:
          </span>
          <ScenarioTabs scenario={scenario} setScenario={setScenario} />
        </div>
      </div>

      <div className="audit-stage">
        <div className="radar-block">
          <PentagonRadar
            scores={scores}
            flaggedIdx={flaggedIdx}
            labels={labels}
            colors={colors}
            axisHover={axisHover}
            setAxisHover={setAxisHover}
          />
          <Composite value={composite} />
        </div>
        <AuditFeed entries={scenario === 'briefing' ? MOCK_FEED_BRIEF : MOCK_FEED_DEFAULT} />
      </div>

      <div className="axes-row">
        {AXIS_META.map((m, i) => (
          <AxisCard key={m.key} meta={m} score={scores[i]} flagged={i === flaggedIdx} />
        ))}
      </div>

      <BaselineStrip />
    </section>
  );
}

// ==================== Assistant Panel ====================
function AssistantPanel({ orbState, onOrbClick, onOrbStop, wakeMode, orbError, messages, streamingId }) {
  return (
    <aside className="assistant-panel">
      <VoiceOrb state={orbState} onClick={onOrbClick} onStop={onOrbStop} wakeMode={wakeMode} error={orbError} />
      <Chat messages={messages} streamingId={streamingId} />
      <EmailMini emails={MOCK_EMAILS} />
      <CalendarMini events={MOCK_EVENTS} />
    </aside>
  );
}

// ==================== Fairness Alert toast ====================
function FairnessAlert() {
  return (
    <div className="fairness-alert">
      <div className="icon"><Icon.Alert /></div>
      <div>
        <div className="head">Fairness alert — CPFE Axis 4</div>
        <div className="body">Equity dropped to 41. Counterfactual substitution doctor↔nurse produced DI=0.61, EOD gap=0.18 — exceeds 0.10 threshold.</div>
      </div>
    </div>
  );
}

// ==================== Morning Briefing overlay ====================
function MorningBriefing({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(247, 245, 240, 0.88)',
      backdropFilter: 'blur(8px)',
      display: 'grid', placeItems: 'center',
    }}
      onClick={onClose}>
      <div className="card" style={{ maxWidth: 740, padding: '40px 48px', boxShadow: '0 24px 48px rgba(26,24,20,0.12)' }} onClick={(e) => e.stopPropagation()}>
        <div className="t-label" style={{ marginBottom: 10 }}>Morning briefing · 06:00</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, margin: '0 0 4px', letterSpacing: '-0.02em', color: 'var(--ink-1)' }}>
          Friday, May 16
        </h2>
        <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--ink-3)', fontSize: 16, marginBottom: 28 }}>
          14 hours until office hours · 47 days until ETH application
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          <div>
            <div className="t-label" style={{ marginBottom: 10 }}>Today</div>
            <div className="col gap-6">
              {MOCK_EVENTS.slice(0, 4).map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <span className="font-mono" style={{ fontSize: 12, color: 'var(--accent)', minWidth: 56 }}>{e.time}</span>
                  <span style={{ fontSize: 13.5 }}>{e.title}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="t-label" style={{ marginBottom: 10 }}>Top mail</div>
            <div className="col gap-6">
              {MOCK_EMAILS.slice(0, 4).map((e, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{e.from}</div>
                  <div style={{ fontSize: 13.5, marginTop: 2, color: 'var(--ink-1)' }}>{e.subj}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 28, padding: '16px 20px', borderRadius: 'var(--r-md)', background: 'var(--accent-bg)', border: '1px solid var(--accent-soft)' }}>
          <div className="t-label" style={{ marginBottom: 6 }}>ARIA · Brief</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-1)' }}>
            Two of yesterday's audit envelopes flagged equity below 50 on the profession-substitution axis. Worth a Phase-1 retest before today's eval run.
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="t-tiny">Click anywhere to dismiss</span>
          <button className="btn btn-primary" onClick={onClose}>Begin day →</button>
        </div>
      </div>
    </div>
  );
}

// ==================== Audit Page ====================
function PageAudit({ scenario, setScenario, scores, flaggedIdx, composite, driftSeries, orbState, onOrbClick, onOrbStop, wakeMode, orbError, chatMessages, streamingId }) {
  return (
    <div className="page page-audit">
      <div className="workspace">
        <div style={{ minWidth: 0 }}>
          <AuditEngine
            scenario={scenario}
            setScenario={setScenario}
            scores={scores}
            flaggedIdx={flaggedIdx}
            composite={composite}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <AssistantPanel
            orbState={orbState}
            onOrbClick={onOrbClick}
            onOrbStop={onOrbStop}
            wakeMode={wakeMode}
            orbError={orbError}
            messages={chatMessages}
            streamingId={streamingId}
          />
        </div>
      </div>
      <DriftBar series={driftSeries} driftAt={scenario === 'flagged' ? 17 : null} />
    </div>
  );
}

// ==================== Root App ====================
export default function App() {
  const [scenario, setScenario] = React.useState('audit-complete');
  const [active, setActive] = React.useState('audit');
  const [liveAudit, setLiveAudit] = React.useState(null);
  const [chatMessages, setChatMessages] = React.useState(CHAT_AUDIT_DEFAULT);

  // ── Lifted PageChat state with localStorage persistence ──
  const [pageChatMessages, setPageChatMessages] = React.useState(() => {
    try {
      const saved = localStorage.getItem('aria_conversation');
      return saved ? JSON.parse(saved) : SEED_CHAT;
    } catch { return SEED_CHAT; }
  });
  const [pageChatAudit, setPageChatAudit] = React.useState(null);

  React.useEffect(() => {
    localStorage.setItem('aria_conversation', JSON.stringify(pageChatMessages));
  }, [pageChatMessages]);

  const health = useHealth();

  // lastAuditRef: holds last non-null audit; prevents radar flash-to-default on nav
  const lastAuditRef = React.useRef(null);
  const effectiveLiveAudit = liveAudit ?? lastAuditRef.current;
  React.useEffect(() => {
    if (liveAudit) lastAuditRef.current = liveAudit;
  }, [liveAudit]);

  // Load most-recent real audit on mount
  React.useEffect(() => {
    getRecentAudits(1).then(res => {
      const env = res.envelopes?.[0];
      if (env) setLiveAudit(env);
    }).catch(() => {});
  }, []);

  // Handle voice result: append to mini-chat + update live audit
  const handleVoiceResult = React.useCallback((result) => {
    if (result.transcript && result.response) {
      const now = Date.now();
      setChatMessages(prev => [
        ...prev,
        { id: `u${now}`, role: 'user',  text: result.transcript },
        { id: `a${now}`, role: 'aria',  text: result.response },
      ]);
    }
    if (result.audit_envelope) setLiveAudit(result.audit_envelope);
  }, []);

  const { orbState: voiceOrbState, startListening, stopListening, wakeMode, orbError } = useVoiceInteraction(handleVoiceResult);

  // Effective orb state: real voice overrides demo scenario
  const effectiveOrbState =
    voiceOrbState !== 'idle'   ? voiceOrbState :
    scenario === 'listening'   ? 'listening'   :
    scenario === 'processing'  ? 'processing'  :
    'idle';

  // Scores from live audit or defaults — use lastAuditRef to avoid flash
  const { scores, flaggedIdx, composite } = React.useMemo(
    () => envelopeToScores(effectiveLiveAudit),
    [effectiveLiveAudit],
  );

  const driftSeries = React.useMemo(() => makeDriftSeries(), []);

  // Keyboard shortcuts 1–6
  React.useEffect(() => {
    const keys = { '1': 'audit', '2': 'chat', '3': 'email', '4': 'calendar', '5': 'eval', '6': 'papers' };
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = keys[e.key];
      if (k) setActive(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const lastMsgId = chatMessages[chatMessages.length - 1]?.id;
  const streamingId = (scenario === 'audit-complete' || scenario === 'flagged') ? lastMsgId : null;

  return (
    <>
      <div className="orb-field" />
      <div className="aria-root">
        <Sidebar active={active} setActive={setActive} chatTurns={Math.floor(pageChatMessages.length / 2)} />
        <div className="main-grid">
          <Header active={active} health={health} />
          <div className="page-frame">
            {active === 'audit' && (
              <PageAudit
                scenario={scenario}
                setScenario={setScenario}
                scores={scores}
                flaggedIdx={flaggedIdx}
                composite={composite}
                driftSeries={driftSeries}
                orbState={effectiveOrbState}
                onOrbClick={startListening}
                onOrbStop={stopListening}
                wakeMode={wakeMode}
                orbError={orbError}
                chatMessages={chatMessages}
                streamingId={streamingId}
              />
            )}
            {active === 'chat'     && <PageChat
              messages={pageChatMessages}
              setMessages={setPageChatMessages}
              auditDisplay={pageChatAudit}
              setAuditDisplay={setPageChatAudit}
              onAuditUpdate={setLiveAudit}
            />}
            {active === 'email'    && <PageEmail />}
            {active === 'calendar' && <PageCalendar />}
            {active === 'eval'     && <PageEval />}
            {active === 'papers'   && <PagePapers />}
          </div>
        </div>
      </div>
      {active === 'audit' && scenario === 'flagged'  && <FairnessAlert />}
      {active === 'audit' && scenario === 'briefing' && <MorningBriefing onClose={() => setScenario('audit-complete')} />}
    </>
  );
}
