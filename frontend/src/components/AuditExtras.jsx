import React from 'react';
import { CountUp, AxisBar } from './Radar.jsx';

export const AXIS_META = [
  { key: 'cal',    name: 'Calibration', tag: 'ECE',        color: '#A8742E', desc: 'Group-conditional Expected Calibration Error on verbal confidence.', short: 'Calibration', cite: 'Tian 2023 / QA-Calibration ICLR 2025' },
  { key: 'faith',  name: 'Faithfulness',tag: 'HHEM 2.1',   color: '#2A4A7F', desc: 'Claim-level grounding via RAGAS extraction + DeBERTa NLI.',            short: 'Faithfulness', cite: 'Vectara HHEM 2.1 / RAGAS' },
  { key: 'cons',   name: 'Consistency', tag: 'Sem-Entropy', color: '#6B4A8A', desc: 'Semantic entropy under N=3 paraphrase, bidirectional-NLI clustering.',  short: 'Consistency',  cite: 'Kuhn 2023 / Farquhar Nature 2024' },
  { key: 'equity', name: 'Equity',      tag: 'DI · EOD',   color: '#3A6B4A', desc: 'Disparate Impact + Equalized Odds under counterfactual substitution.',   short: 'Equity',       cite: 'CPFE Axis 4 — Pall JBI 2025', featured: true },
  { key: 'attrib', name: 'Attribution', tag: 'Jaccard@k',  color: '#8A6243', desc: 'Stability of supporting-chunk-set under paraphrase (text-API).',         short: 'Attribution',  cite: 'Reframed CPFE Axis 5' },
];

export function statusFromScore(s) {
  if (s >= 75) return { text: 'CALIBRATED', cls: 'pill-good' };
  if (s >= 50) return { text: 'BORDERLINE', cls: 'pill-warn' };
  return { text: 'FLAGGED', cls: 'pill-flag' };
}

export function compositeColor(s) {
  if (s >= 75) return 'score-good';
  if (s >= 50) return 'score-warn';
  return 'score-flag';
}

export function AxisCard({ meta, score, flagged }) {
  const status = flagged ? { text: 'FLAGGED', cls: 'pill-flag' } : statusFromScore(score);
  const tone = flagged ? '#A04942' : meta.color;
  const cls = `axis-card ${meta.featured ? 'featured' : ''} ${flagged ? 'flagged' : ''}`;
  return (
    <div className={cls}>
      {meta.featured && (
        <span className="axis-featured-tag">
          {flagged ? 'NOVEL · ALARM' : 'NOVEL CLAIM'}
        </span>
      )}
      <div className="axis-head">
        <div className="axis-name">{meta.name}</div>
        <div className="axis-tag">{meta.tag}</div>
      </div>
      <div className="axis-value">
        <CountUp value={score} duration={650} />
        <span className="suffix">/100</span>
      </div>
      <AxisBar value={score} color={tone} />
      <div className={`axis-chip ${status.cls}`} style={{ color: tone, borderColor: tone + '55' }}>
        <span className="dot" style={{ background: tone, width: 5, height: 5, borderRadius: '50%' }} />
        {status.text}
      </div>
      <div className="axis-desc">{meta.desc}</div>
    </div>
  );
}

export function AuditFeed({ entries }) {
  return (
    <div className="feed glass-2">
      <div className="feed-header">
        <div className="t-label">Audit Feed</div>
        <div className="pill pill-cyan" style={{ padding: '2px 7px', fontSize: 9 }}>
          <span className="dot" />LIVE
        </div>
      </div>
      <div className="feed-list scroll-thin">
        {entries.map((e, i) => (
          <div key={`${e.ts}-${i}`} className={`feed-row ${e.kind}`}>
            <span className="ts">{e.ts}</span>
            <span className="glyph">{e.kind === 'ok' ? '✓' : e.kind === 'warn' ? '⚠' : '✗'}</span>
            <span className="msg">{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BaselineStrip() {
  const rows = [
    { label: 'Calibration ECE',   aria: true, gg: false, ragas: false, lg: false },
    { label: 'Equity (DI / EOD)', aria: true, gg: false, ragas: false, lg: false },
    { label: 'Faithfulness',      aria: true, gg: true,  ragas: true,  lg: false },
    { label: 'Consistency',       aria: true, gg: false, ragas: true,  lg: false },
    { label: 'Attribution',       aria: true, gg: false, ragas: false, lg: false },
    { label: 'Drift (CUSUM)',     aria: true, gg: false, ragas: false, lg: false },
  ];
  const Mark = ({ on, accent }) => (
    on ? (
      <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: accent ? 'var(--accent)' : 'var(--good)' }} />
    ) : (
      <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', border: '1px solid var(--line-strong)' }} />
    )
  );
  const headStyle = (align, highlight) => ({
    textAlign: align, padding: '10px 12px',
    fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em',
    textTransform: 'uppercase', fontWeight: 500,
    color: highlight ? 'var(--accent)' : 'var(--ink-3)',
    background: highlight ? 'var(--accent-bg)' : 'transparent',
    borderBottom: '1px solid var(--line)',
  });
  const cellStyle = (align, highlight) => ({
    textAlign: align, padding: '10px 12px', fontSize: 13,
    color: 'var(--ink-1)',
    background: highlight ? 'var(--accent-bg)' : 'transparent',
    borderBottom: '1px solid var(--line-soft)',
  });
  return (
    <div className="baseline">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <span className="t-label">Coverage vs Baselines</span>
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          1,000-prompt eval suite — BBQ + BOLD + CPFE
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
        <thead>
          <tr>
            <th style={headStyle('left')}>Axis</th>
            <th style={headStyle('center', true)}>ARIA</th>
            <th style={headStyle('center')}>Granite Guardian</th>
            <th style={headStyle('center')}>RAGAS</th>
            <th style={headStyle('center')}>LlamaGuard</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <td style={cellStyle('left')}>{r.label}</td>
              <td style={cellStyle('center', true)}><Mark on={r.aria} accent /></td>
              <td style={cellStyle('center')}><Mark on={r.gg} /></td>
              <td style={cellStyle('center')}><Mark on={r.ragas} /></td>
              <td style={cellStyle('center')}><Mark on={r.lg} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
